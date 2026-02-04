import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BoltService } from '../../src/integrations/bolt';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('BoltService Integration Tests', () => {
  let boltService: BoltService;
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpawn = spawn as ReturnType<typeof vi.fn>;
    boltService = new BoltService('./bolt-project', 5000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInventory', () => {
    it('should parse Bolt inventory output correctly', async () => {
      const mockInventory = {
        targets: [
          {
            name: 'node1',
            uri: 'ssh://node1.example.com',
            config: {
              transport: 'ssh',
              user: 'admin',
            },
          },
          {
            name: 'node2',
            uri: 'winrm://node2.example.com',
            config: {
              transport: 'winrm',
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockInventory)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const inventory = await boltService.getInventory();

      expect(Array.isArray(inventory)).toBe(true);
      expect(inventory.length).toBe(2);
      expect(inventory[0]).toHaveProperty('name', 'node1');
      expect(inventory[0]).toHaveProperty('uri', 'ssh://node1.example.com');
      expect(inventory[1]).toHaveProperty('name', 'node2');
    });

    it('should handle Bolt CLI errors', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stderr?.emit('data', Buffer.from('Error: inventory file not found'));
          mockProcess.emit('close', 1);
        }, 10);

        return mockProcess;
      });

      await expect(boltService.getInventory()).rejects.toThrow();
    });

    // Note: Timeout handling is tested in unit tests to avoid long-running integration tests
  });

  describe('runCommand', () => {
    it('should execute command and parse output', async () => {
      const mockResult = {
        items: [
          {
            target: 'node1',
            status: 'success',
            value: {
              stdout: 'command output',
              stderr: '',
              exit_code: 0,
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockResult)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const result = await boltService.runCommand('node1', 'ls -la');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('type', 'command');
      expect(result).toHaveProperty('status');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty('nodeId', 'node1');
      expect(result.results[0]).toHaveProperty('status', 'success');
    });

    it('should handle command execution failures', async () => {
      const mockResult = {
        items: [
          {
            target: 'node1',
            status: 'failure',
            error: {
              msg: 'Command failed',
              kind: 'execution-error',
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockResult)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const result = await boltService.runCommand('node1', 'invalid-command');

      expect(result.status).toBe('failed');
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0]).toHaveProperty('error');
      expect(result.results[0].error).toBe('Command failed');
    });
  });

  describe('runTask', () => {
    it('should execute task with parameters', async () => {
      const mockResult = {
        items: [
          {
            target: 'node1',
            status: 'success',
            value: {
              result: 'task completed successfully',
              data: { key: 'value' },
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockResult)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const result = await boltService.runTask('node1', 'test::task', { param1: 'value1' });

      expect(result).toHaveProperty('type', 'task');
      expect(result).toHaveProperty('action', 'test::task');
      expect(result.results[0]).toHaveProperty('status', 'success');
      expect(result.results[0]).toHaveProperty('value');
    });

    it('should handle task parameter validation errors', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stderr?.emit(
            'data',
            Buffer.from('Error: Required parameter "required_param" is missing')
          );
          mockProcess.emit('close', 1);
        }, 10);

        return mockProcess;
      });

      await expect(
        boltService.runTask('node1', 'test::task', {})
      ).rejects.toThrow();
    });
  });

  describe('listTasks', () => {
    it('should list available tasks', async () => {
      const mockTasks = {
        tasks: [
          {
            name: 'module1::task1',
            metadata: {
              description: 'Test task 1',
              parameters: {
                param1: {
                  type: 'String',
                  description: 'Parameter 1',
                },
              },
            },
          },
          {
            name: 'module2::task2',
            metadata: {
              description: 'Test task 2',
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockTasks)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const tasks = await boltService.listTasks();

      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBe(2);
      expect(tasks[0]).toHaveProperty('name', 'module1::task1');
      expect(tasks[0]).toHaveProperty('description', 'Test task 1');
      expect(tasks[1]).toHaveProperty('name', 'module2::task2');
    });
  });

  describe('gatherFacts', () => {
    it('should gather facts from node', async () => {
      const mockResult = {
        items: [
          {
            target: 'node1',
            status: 'success',
            value: {
              os: {
                family: 'RedHat',
                name: 'CentOS',
                release: {
                  full: '7.9',
                  major: '7',
                },
              },
              processors: {
                count: 4,
              },
              memory: {
                system: {
                  total: '16.00 GiB',
                },
              },
            },
          },
        ],
      };

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stdout?.emit('data', Buffer.from(JSON.stringify(mockResult)));
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const facts = await boltService.gatherFacts('node1');

      expect(facts).toHaveProperty('nodeId', 'node1');
      expect(facts).toHaveProperty('gatheredAt');
      expect(facts).toHaveProperty('facts');
      expect(facts.facts).toHaveProperty('os');
      expect(facts.facts.os).toHaveProperty('family', 'RedHat');
    });

    it('should handle unreachable nodes', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stderr?.emit(
            'data',
            Buffer.from('Error: Failed to connect to node1')
          );
          mockProcess.emit('close', 1);
        }, 10);

        return mockProcess;
      });

      await expect(boltService.gatherFacts('node1')).rejects.toThrow();
    });
  });

  describe('Output Parsing', () => {
    it('should handle multi-line JSON output', async () => {
      const mockResult = {
        items: [
          {
            target: 'node1',
            status: 'success',
            value: { result: 'success' },
          },
        ],
      };

      const jsonString = JSON.stringify(mockResult);
      const chunks = [
        jsonString.slice(0, 20),
        jsonString.slice(20, 40),
        jsonString.slice(40),
      ];

      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          chunks.forEach((chunk) => {
            mockProcess.stdout?.emit('data', Buffer.from(chunk));
          });
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      const result = await boltService.runCommand('node1', 'test');

      expect(result.results[0].status).toBe('success');
    });

    it('should handle stderr output', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = new EventEmitter() as any;
        mockProcess.stderr = new EventEmitter() as any;

        setTimeout(() => {
          mockProcess.stderr?.emit('data', Buffer.from('Warning: deprecated option used'));
          mockProcess.stdout?.emit(
            'data',
            Buffer.from(JSON.stringify({ items: [] }))
          );
          mockProcess.emit('close', 0);
        }, 10);

        return mockProcess;
      });

      // Should not throw despite stderr output
      await expect(boltService.runCommand('node1', 'test')).resolves.toBeDefined();
    });
  });
});
