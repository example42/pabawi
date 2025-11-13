import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoltService } from '../../src/bolt/BoltService';
import { BoltNodeUnreachableError } from '../../src/bolt/types';
import type { Facts } from '../../src/bolt/types';

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
