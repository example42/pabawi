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

describe('BoltService - runTask', () => {
  let boltService: BoltService;

  beforeEach(() => {
    boltService = new BoltService('/test/bolt/project', 300000);
  });

  it('should parse successful task execution output', () => {
    const nodeId = 'test-node';
    const taskName = 'package::install';
    const parameters = { name: 'nginx', ensure: 'present' };
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            status: 'installed',
            version: '1.18.0',
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 2000;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_123',
      nodeId,
      taskName,
      parameters,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('exec_task_123');
    expect(result.type).toBe('task');
    expect(result.targetNodes).toEqual([nodeId]);
    expect(result.action).toBe(taskName);
    expect(result.parameters).toEqual(parameters);
    expect(result.status).toBe('success');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].nodeId).toBe(nodeId);
    expect(result.results[0].status).toBe('success');
    expect(result.results[0].value).toEqual({
      status: 'installed',
      version: '1.18.0',
    });
    expect(result.results[0].duration).toBe(2000);
  });

  it('should parse failed task execution output', () => {
    const nodeId = 'test-node';
    const taskName = 'service::restart';
    const parameters = { name: 'nonexistent' };
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'failed',
          error: {
            msg: 'Service not found: nonexistent',
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 1000;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_456',
      nodeId,
      taskName,
      parameters,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBe('Service not found: nonexistent');
  });

  it('should handle task execution without parameters', () => {
    const nodeId = 'test-node';
    const taskName = 'facts';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            os: { family: 'RedHat' },
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 500;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_789',
      nodeId,
      taskName,
      undefined,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.parameters).toBeUndefined();
    expect(result.status).toBe('success');
    expect(result.results[0].value).toEqual({
      os: { family: 'RedHat' },
    });
  });

  it('should handle task with complex return value', () => {
    const nodeId = 'test-node';
    const taskName = 'custom::complex_task';
    const parameters = { action: 'analyze' };
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: {
            results: [
              { id: 1, status: 'ok' },
              { id: 2, status: 'warning' },
            ],
            summary: {
              total: 2,
              ok: 1,
              warning: 1,
            },
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 3000;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_complex',
      nodeId,
      taskName,
      parameters,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.results[0].value).toEqual({
      results: [
        { id: 1, status: 'ok' },
        { id: 2, status: 'warning' },
      ],
      summary: {
        total: 2,
        ok: 1,
        warning: 1,
      },
    });
  });

  it('should handle task with error object containing message field', () => {
    const nodeId = 'test-node';
    const taskName = 'test::task';
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'failed',
          error: {
            message: 'Task failed with custom message',
          },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 800;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_err',
      nodeId,
      taskName,
      undefined,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.results[0].error).toBe('Task failed with custom message');
  });

  it('should handle empty items array for task', () => {
    const nodeId = 'test-node';
    const taskName = 'test::task';
    const mockOutput = {
      items: [],
    };

    const startTime = Date.now();
    const endTime = startTime + 100;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_empty',
      nodeId,
      taskName,
      undefined,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.results).toHaveLength(0);
    expect(result.status).toBe('success');
  });

  it('should extract parameter errors from stderr', () => {
    const stderr = `Error: Task validation failed
Parameter 'name' is required but not provided
Parameter 'version' must be a string
Invalid parameter 'unknown_param'`;

    const errors = (boltService as any).extractParameterErrors(stderr);

    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: string) => e.includes('required'))).toBe(true);
    expect(errors.some((e: string) => e.includes('Parameter'))).toBe(true);
  });

  it('should return full stderr when no specific parameter errors found', () => {
    const stderr = 'Some generic error message';

    const errors = (boltService as any).extractParameterErrors(stderr);

    expect(errors).toBeDefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('Some generic error message');
  });

  it('should handle task execution with empty parameters object', () => {
    const nodeId = 'test-node';
    const taskName = 'test::task';
    const parameters = {};
    const mockOutput = {
      items: [
        {
          target: 'test-node',
          status: 'success',
          value: { result: 'ok' },
        },
      ],
    };

    const startTime = Date.now();
    const endTime = startTime + 500;
    const result = (boltService as any).transformTaskOutput(
      'exec_task_empty_params',
      nodeId,
      taskName,
      parameters,
      mockOutput,
      startTime,
      endTime
    );

    expect(result).toBeDefined();
    expect(result.parameters).toEqual({});
    expect(result.status).toBe('success');
  });
});

describe('BoltService - listTasks', () => {
  let boltService: BoltService;

  beforeEach(() => {
    boltService = new BoltService('/test/bolt/project', 300000);
  });

  it('should parse task list output with tasks array format', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'package::install',
          metadata: {
            description: 'Install a package',
            parameters: {
              name: {
                type: 'String',
                description: 'Package name',
                required: true,
              },
              version: {
                type: 'String',
                description: 'Package version',
                required: false,
                default: 'latest',
              },
            },
          },
          module: 'package',
        },
        {
          name: 'service::restart',
          metadata: {
            description: 'Restart a service',
            parameters: {
              name: {
                type: 'String',
                description: 'Service name',
                required: true,
              },
            },
          },
          file: '/modules/service/tasks/restart.sh',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(2);

    expect(result[0].name).toBe('package::install');
    expect(result[0].description).toBe('Install a package');
    expect(result[0].modulePath).toBe('package');
    expect(result[0].parameters).toHaveLength(2);
    expect(result[0].parameters[0].name).toBe('name');
    expect(result[0].parameters[0].type).toBe('String');
    expect(result[0].parameters[0].required).toBe(true);
    expect(result[0].parameters[1].name).toBe('version');
    expect(result[0].parameters[1].default).toBe('latest');

    expect(result[1].name).toBe('service::restart');
    expect(result[1].description).toBe('Restart a service');
    expect(result[1].modulePath).toBe('/modules/service/tasks/restart.sh');
    expect(result[1].parameters).toHaveLength(1);
  });

  it('should parse task list output with object format', () => {
    const mockOutput = {
      'facts': {
        description: 'Gather system facts',
        module: 'facts',
        parameters: {},
      },
      'custom::deploy': {
        description: 'Deploy application',
        file: '/modules/custom/tasks/deploy.rb',
        parameters: {
          environment: {
            type: 'String',
            required: true,
          },
          version: {
            type: 'String',
            required: false,
          },
        },
      },
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(2);

    const factsTask = result.find((t: any) => t.name === 'facts');
    expect(factsTask).toBeDefined();
    expect(factsTask.description).toBe('Gather system facts');
    expect(factsTask.parameters).toHaveLength(0);

    const deployTask = result.find((t: any) => t.name === 'custom::deploy');
    expect(deployTask).toBeDefined();
    expect(deployTask.description).toBe('Deploy application');
    expect(deployTask.parameters).toHaveLength(2);
  });

  it('should handle task with array of parameters', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'test::task',
          metadata: {
            description: 'Test task',
            parameters: [
              {
                name: 'param1',
                type: 'String',
                required: true,
              },
              {
                name: 'param2',
                type: 'Integer',
                required: false,
                default: 42,
              },
            ],
          },
          module: 'test',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].parameters).toHaveLength(2);
    expect(result[0].parameters[0].name).toBe('param1');
    expect(result[0].parameters[1].name).toBe('param2');
    expect(result[0].parameters[1].type).toBe('Integer');
    expect(result[0].parameters[1].default).toBe(42);
  });

  it('should handle task with all parameter types', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'test::types',
          metadata: {
            parameters: {
              str_param: { type: 'String', required: true },
              int_param: { type: 'Integer', required: false },
              bool_param: { type: 'Boolean', required: false },
              array_param: { type: 'Array', required: false },
              hash_param: { type: 'Hash', required: false },
            },
          },
          module: 'test',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result[0].parameters).toHaveLength(5);
    expect(result[0].parameters.find((p: any) => p.name === 'str_param')?.type).toBe('String');
    expect(result[0].parameters.find((p: any) => p.name === 'int_param')?.type).toBe('Integer');
    expect(result[0].parameters.find((p: any) => p.name === 'bool_param')?.type).toBe('Boolean');
    expect(result[0].parameters.find((p: any) => p.name === 'array_param')?.type).toBe('Array');
    expect(result[0].parameters.find((p: any) => p.name === 'hash_param')?.type).toBe('Hash');
  });

  it('should handle task without parameters', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'simple::task',
          metadata: {
            description: 'Simple task with no parameters',
          },
          module: 'simple',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].parameters).toHaveLength(0);
  });

  it('should handle task without description', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'undocumented::task',
          metadata: {
            parameters: {},
          },
          module: 'undocumented',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });

  it('should default parameter type to String if not specified', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'test::task',
          metadata: {
            parameters: {
              untyped_param: {
                description: 'Parameter without type',
                required: true,
              },
            },
          },
          module: 'test',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result[0].parameters).toHaveLength(1);
    expect(result[0].parameters[0].type).toBe('String');
  });

  it('should handle empty task list', () => {
    const mockOutput = {
      tasks: [],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(0);
  });

  it('should skip invalid task entries', () => {
    const mockOutput = {
      tasks: [
        {
          // Missing name
          metadata: {
            description: 'Invalid task',
          },
        },
        {
          name: 'valid::task',
          metadata: {
            description: 'Valid task',
          },
          module: 'valid',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid::task');
  });

  it('should handle parameter with description', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'test::task',
          metadata: {
            parameters: {
              documented_param: {
                type: 'String',
                description: 'This parameter is well documented',
                required: true,
              },
            },
          },
          module: 'test',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result[0].parameters[0].description).toBe('This parameter is well documented');
  });

  it('should handle task with params instead of parameters', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'test::task',
          metadata: {
            params: {
              param1: {
                type: 'String',
                required: true,
              },
            },
          },
          module: 'test',
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result[0].parameters).toHaveLength(1);
    expect(result[0].parameters[0].name).toBe('param1');
  });

  it('should handle task with module path variations', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'task1',
          module: 'module1',
        },
        {
          name: 'task2',
          file: '/path/to/task2.sh',
        },
        {
          name: 'task3',
          metadata: {
            module: 'module3',
          },
        },
        {
          name: 'task4',
          metadata: {
            file: '/path/to/task4.rb',
          },
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result).toHaveLength(4);
    expect(result[0].modulePath).toBe('module1');
    expect(result[1].modulePath).toBe('/path/to/task2.sh');
    expect(result[2].modulePath).toBe('module3');
    expect(result[3].modulePath).toBe('/path/to/task4.rb');
  });

  it('should handle task with no module path', () => {
    const mockOutput = {
      tasks: [
        {
          name: 'orphan::task',
          metadata: {
            description: 'Task without module path',
          },
        },
      ],
    };

    const result = (boltService as any).transformTaskListOutput(mockOutput);

    expect(result).toBeDefined();
    expect(result[0].modulePath).toBe('');
  });
});
