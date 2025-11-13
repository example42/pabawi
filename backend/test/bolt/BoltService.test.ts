import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoltService } from '../../src/bolt/BoltService';
import { BoltNodeUnreachableError } from '../../src/bolt/types';
import type { Facts, ExecutionResult } from '../../src/bolt/types';

describe('BoltService - gatherFacts', () => {
  let boltService: BoltService;

  beforeEach(() => {
    boltService = new BoltService('/test/bolt/project', 300000);
  });

  it('should parse facts output correctly', () => {
    const nodeId = 'test-node';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            os: {
              family: 'RedHat',
              name: 'CentOS',
              release: {
                full: '7.9.2009',
                major: '7',
              },
            },
            processors: {
              count: 4,
              models: ['Intel(R) Xeon(R) CPU E5-2676 v3 @ 2.40GHz'],
            },
            memory: {
              system: {
                total: '16.00 GiB',
                available: '12.50 GiB',
              },
            },
            networking: {
              hostname: 'test-node.example.com',
              interfaces: {
                eth0: {
                  ip: '192.168.1.100',
                  mac: '00:11:22:33:44:55',
                },
              },
            },
            custom_fact: 'custom_value',
          },
        },
      ],
    };

    // Test the private transformFactsOutput method through parseJsonOutput
    const result = (boltService as any).transformFactsOutput(nodeId, mockOutput);

    expect(result).toBeDefined();
    expect(result.nodeId).toBe(nodeId);
    expect(result.gatheredAt).toBeDefined();
    expect(result.facts.os.family).toBe('RedHat');
    expect(result.facts.os.name).toBe('CentOS');
    expect(result.facts.os.release.full).toBe('7.9.2009');
    expect(result.facts.os.release.major).toBe('7');
    expect(result.facts.processors.count).toBe(4);
    expect(result.facts.processors.models).toHaveLength(1);
    expect(result.facts.memory.system.total).toBe('16.00 GiB');
    expect(result.facts.networking.hostname).toBe('test-node.example.com');
    expect(result.facts.custom_fact).toBe('custom_value');
  });

  it('should handle missing facts gracefully', () => {
    const nodeId = 'test-node';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {},
        },
      ],
    };

    const result = (boltService as any).transformFactsOutput(nodeId, mockOutput);

    expect(result).toBeDefined();
    expect(result.nodeId).toBe(nodeId);
    expect(result.facts.os.family).toBe('unknown');
    expect(result.facts.processors.count).toBe(0);
    expect(result.facts.memory.system.total).toBe('0');
  });

  it('should handle partial facts data', () => {
    const nodeId = 'test-node';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            os: {
              family: 'Debian',
            },
            processors: {
              count: 2,
            },
          },
        },
      ],
    };

    const result = (boltService as any).transformFactsOutput(nodeId, mockOutput);

    expect(result).toBeDefined();
    expect(result.facts.os.family).toBe('Debian');
    expect(result.facts.os.name).toBe('unknown');
    expect(result.facts.processors.count).toBe(2);
    expect(result.facts.processors.models).toEqual([]);
  });
});

describe('BoltService - runCommand', () => {
  let boltService: BoltService;

  beforeEach(() => {
    boltService = new BoltService('/test/bolt/project', 300000);
  });

  it('should parse successful command execution output', () => {
    const nodeId = 'test-node';
    const command = 'ls -la';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            stdout: 'total 24\ndrwxr-xr-x 3 user user 4096 Jan 1 12:00 .\n',
            stderr: '',
            exit_code: 0,
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 1000;
    const result = (boltService as any).transformCommandOutput(
      'exec_123',
      nodeId,
      command,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('exec_123');
    expect(result.type).toBe('command');
    expect(result.targetNodes).toEqual([nodeId]);
    expect(result.action).toBe(command);
    expect(result.status).toBe('success');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].nodeId).toBe(nodeId);
    expect(result.results[0].status).toBe('success');
    expect(result.results[0].output?.stdout).toContain('total 24');
    expect(result.results[0].output?.stderr).toBe('');
    expect(result.results[0].output?.exitCode).toBe(0);
    expect(result.results[0].duration).toBe(1000);
  });

  it('should parse failed command execution output', () => {
    const nodeId = 'test-node';
    const command = 'invalid-command';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'failed',
          value: {
            stdout: '',
            stderr: 'command not found: invalid-command',
            exit_code: 127,
          },
          error: {
            msg: 'Command execution failed',
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 500;
    const result = (boltService as any).transformCommandOutput(
      'exec_456',
      nodeId,
      command,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].output?.stderr).toContain('command not found');
    expect(result.results[0].output?.exitCode).toBe(127);
    expect(result.results[0].error).toBe('Command execution failed');
  });

  it('should handle command with non-zero exit code', () => {
    const nodeId = 'test-node';
    const command = 'grep nonexistent file.txt';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            stdout: '',
            stderr: '',
            exit_code: 1,
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 200;
    const result = (boltService as any).transformCommandOutput(
      'exec_789',
      nodeId,
      command,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.results[0].output?.exitCode).toBe(1);
  });

  it('should handle command with both stdout and stderr', () => {
    const nodeId = 'test-node';
    const command = 'echo "output" && echo "error" >&2';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            stdout: 'output\n',
            stderr: 'error\n',
            exit_code: 0,
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 300;
    const result = (boltService as any).transformCommandOutput(
      'exec_abc',
      nodeId,
      command,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.results[0].output?.stdout).toBe('output\n');
    expect(result.results[0].output?.stderr).toBe('error\n');
    expect(result.results[0].output?.exitCode).toBe(0);
  });

  it('should generate unique execution IDs', () => {
    const id1 = (boltService as any).generateExecutionId();
    const id2 = (boltService as any).generateExecutionId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^exec_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^exec_\d+_[a-z0-9]+$/);
  });

  it('should handle empty items array', () => {
    const nodeId = 'test-node';
    const command = 'echo test';
    const mockOutput = {
      items: [],
    };

    const startTime = Date.now();
    const endTime = startTime + 100;
    const result = (boltService as any).transformCommandOutput(
      'exec_empty',
      nodeId,
      command,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.results).toHaveLength(0);
    expect(result.status).toBe('success');
  });
});
