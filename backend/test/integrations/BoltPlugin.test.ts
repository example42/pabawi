/**
 * Tests for BoltPlugin
 *
 * Tests the Bolt plugin implementation including:
 * - Plugin initialization and health checks
 * - Standardized capability interfaces (Phase 1)
 * - Inventory capabilities
 * - Facts capabilities
 * - Remote execution capabilities
 * - Capability registration with CapabilityRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoltPlugin } from '../../../plugins/native/bolt/backend/BoltPlugin';
import type { BoltServiceInterface } from '../../../plugins/native/bolt/backend/BoltPlugin';
import type { Node, Facts, ExecutionResult } from '../../../plugins/native/bolt/backend/types';

/**
 * Mock BoltService for testing
 */
class MockBoltService implements BoltServiceInterface {
  private mockNodes: Node[] = [
    {
      id: 'node1',
      name: 'node1.example.com',
      uri: 'ssh://node1.example.com',
      transport: 'ssh' as const,
      config: {
        user: 'admin',
        port: 22,
        groups: ['web', 'production'],
      },
    },
    {
      id: 'node2',
      name: 'node2.example.com',
      uri: 'ssh://node2.example.com',
      transport: 'ssh' as const,
      config: {
        user: 'admin',
        port: 22,
        groups: ['db', 'production'],
      },
    },
  ];

  async getInventory(): Promise<Node[]> {
    return this.mockNodes;
  }

  async gatherFacts(nodeId: string): Promise<Facts> {
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts: {
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
          models: ['Intel(R) Xeon(R) CPU'],
        },
        memory: {
          system: {
            total: '16 GB',
            available: '8 GB',
          },
        },
        networking: {
          hostname: nodeId,
          interfaces: {},
        },
      },
    };
  }

  async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: unknown
  ): Promise<ExecutionResult> {
    return {
      id: 'exec-1',
      type: 'command',
      targetNodes: [nodeId],
      action: command,
      status: 'success',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [
        {
          nodeId,
          status: 'success',
          output: {
            stdout: 'command output',
            stderr: '',
            exitCode: 0,
          },
          duration: 100,
        },
      ],
      command,
    };
  }

  async runTask(
    nodeId: string,
    taskName: string,
    parameters?: Record<string, string>,
    streamingCallback?: unknown
  ): Promise<ExecutionResult> {
    return {
      id: 'exec-2',
      type: 'task',
      targetNodes: [nodeId],
      action: taskName,
      parameters,
      status: 'success',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [
        {
          nodeId,
          status: 'success',
          value: { result: 'task completed' },
          duration: 200,
        },
      ],
    };
  }

  async listTasks(): Promise<Array<{ name: string; module: string; description?: string; parameters: Array<{ name: string; type: string; description?: string; required: boolean }>; modulePath: string }>> {
    return [
      {
        name: 'package',
        module: 'package',
        description: 'Manage packages',
        parameters: [
          {
            name: 'action',
            type: 'String',
            description: 'Action to perform',
            required: true,
          },
        ],
        modulePath: '/path/to/module',
      },
    ];
  }

  async getTaskDetails(taskName: string): Promise<{ name: string; module: string; description?: string; parameters: Array<{ name: string; type: string; description?: string; required: boolean }>; modulePath: string } | null> {
    if (taskName === 'package') {
      return {
        name: 'package',
        module: 'package',
        description: 'Manage packages',
        parameters: [
          {
            name: 'action',
            type: 'String',
            description: 'Action to perform',
            required: true,
          },
        ],
        modulePath: '/path/to/module',
      };
    }
    return null;
  }

  getBoltProjectPath(): string {
    return '/test/bolt/project';
  }

  getDefaultTimeout(): number {
    return 300000;
  }
}

/**
 * Mock Logger for testing
 */
class MockLogger {
  info = vi.fn();
  warn = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

/**
 * Mock Performance Monitor for testing
 */
class MockPerformanceMonitor {
  startTimer = vi.fn(() => vi.fn());
}

describe('BoltPlugin', () => {
  let plugin: BoltPlugin;
  let mockBoltService: MockBoltService;
  let mockLogger: MockLogger;
  let mockPerformanceMonitor: MockPerformanceMonitor;

  beforeEach(() => {
    mockBoltService = new MockBoltService();
    mockLogger = new MockLogger();
    mockPerformanceMonitor = new MockPerformanceMonitor();

    plugin = new BoltPlugin(
      mockBoltService as unknown as BoltServiceInterface,
      mockLogger as unknown as any,
      mockPerformanceMonitor as unknown as any
    );
  });

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.name).toBe('bolt');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.integrationType).toBe('RemoteExecution');
      expect(plugin.metadata.author).toBe('Pabawi Team');
    });

    it('should have capabilities defined', () => {
      expect(plugin.capabilities).toBeDefined();
      expect(plugin.capabilities.length).toBeGreaterThan(0);
    });

    it('should have widgets defined', () => {
      expect(plugin.widgets).toBeDefined();
      expect(plugin.widgets!.length).toBeGreaterThan(0);
    });

    it('should have CLI commands defined', () => {
      expect(plugin.cliCommands).toBeDefined();
      expect(plugin.cliCommands!.length).toBeGreaterThan(0);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize();
      expect(plugin.isInitialized()).toBe(true);
    });

    it('should perform health check', async () => {
      await plugin.initialize();
      const health = await plugin.healthCheck();

      expect(health).toBeDefined();
      expect(health.lastCheck).toBeDefined();
    });
  });

  describe('Standardized Inventory Capabilities (Phase 1)', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should list all nodes', async () => {
      const nodes = await plugin.inventoryList({ refresh: false });

      expect(nodes).toBeDefined();
      expect(nodes.length).toBe(2);
      expect(nodes[0].id).toBe('node1');
      expect(nodes[1].id).toBe('node2');
    });

    it('should filter nodes by groups', async () => {
      const nodes = await plugin.inventoryList({ groups: ['web'] });

      expect(nodes).toBeDefined();
      expect(nodes.length).toBe(1);
      expect(nodes[0].id).toBe('node1');
    });

    it('should get specific node', async () => {
      const node = await plugin.inventoryGet({ nodeId: 'node1' });

      expect(node).toBeDefined();
      expect(node!.id).toBe('node1');
      expect(node!.name).toBe('node1.example.com');
    });

    it('should return null for non-existent node', async () => {
      const node = await plugin.inventoryGet({ nodeId: 'nonexistent' });

      expect(node).toBeNull();
    });

    it('should list available groups', async () => {
      const groups = await plugin.inventoryGroups({ refresh: false });

      expect(groups).toBeDefined();
      expect(groups.length).toBe(3);
      expect(groups).toContain('web');
      expect(groups).toContain('db');
      expect(groups).toContain('production');
    });

    it('should filter nodes by criteria', async () => {
      const nodes = await plugin.inventoryFilter({
        criteria: { transport: 'ssh' },
      });

      expect(nodes).toBeDefined();
      expect(nodes.length).toBe(2);
    });

    it('should filter nodes by criteria and groups', async () => {
      const nodes = await plugin.inventoryFilter({
        criteria: { transport: 'ssh' },
        groups: ['web'],
      });

      expect(nodes).toBeDefined();
      expect(nodes.length).toBe(1);
      expect(nodes[0].id).toBe('node1');
    });
  });

  describe('Standardized Facts Capabilities (Phase 1)', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should get facts for a node', async () => {
      const facts = await plugin.factsGet({ nodeId: 'node1' });

      expect(facts).toBeDefined();
      expect(facts.nodeId).toBe('node1');
      expect(facts.facts).toBeDefined();
      expect(facts.facts.os).toBeDefined();
    });

    it('should refresh facts for a node', async () => {
      const facts = await plugin.factsRefresh({ nodeId: 'node1' });

      expect(facts).toBeDefined();
      expect(facts.nodeId).toBe('node1');
      expect(facts.facts).toBeDefined();
    });

    it('should provide fact provider information', () => {
      const provider = plugin.getFactProvider();

      expect(provider).toBeDefined();
      expect(provider.name).toBe('bolt');
      expect(provider.priority).toBe(50);
      expect(provider.supportedFactKeys).toBeDefined();
      expect(provider.supportedFactKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Standardized Remote Execution Capabilities (Phase 1)', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should execute command on target nodes', async () => {
      const result = await plugin.commandExecute({
        command: 'hostname',
        targets: ['node1'],
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.type).toBe('command');
      expect(result.targetNodes).toContain('node1');
    });

    it('should execute task on target nodes', async () => {
      const result = await plugin.taskExecute({
        taskName: 'package',
        targets: ['node1'],
        parameters: { action: 'install', name: 'nginx' },
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.type).toBe('task');
      expect(result.targetNodes).toContain('node1');
    });

    it('should execute script on target nodes', async () => {
      const result = await plugin.scriptExecute({
        script: 'echo "Hello World"',
        targets: ['node1'],
        scriptType: 'bash',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.type).toBe('command');
    });

    it('should set debug mode flag when requested', async () => {
      const result = await plugin.commandExecute({
        command: 'hostname',
        targets: ['node1'],
        debugMode: true,
      });

      expect(result.expertMode).toBe(true);
    });
  });

  describe('Capability Registration', () => {
    it('should register standardized inventory capabilities', () => {
      const inventoryCapabilities = plugin.capabilities.filter(
        c => c.name.startsWith('inventory.')
      );

      expect(inventoryCapabilities.length).toBeGreaterThan(0);
      expect(inventoryCapabilities.some(c => c.name === 'inventory.list')).toBe(true);
      expect(inventoryCapabilities.some(c => c.name === 'inventory.get')).toBe(true);
      expect(inventoryCapabilities.some(c => c.name === 'inventory.groups')).toBe(true);
      expect(inventoryCapabilities.some(c => c.name === 'inventory.filter')).toBe(true);
    });

    it('should register standardized facts capabilities', () => {
      const factsCapabilities = plugin.capabilities.filter(
        c => c.name.startsWith('info.')
      );

      expect(factsCapabilities.length).toBeGreaterThan(0);
      expect(factsCapabilities.some(c => c.name === 'info.facts')).toBe(true);
      expect(factsCapabilities.some(c => c.name === 'info.refresh')).toBe(true);
    });

    it('should register standardized remote execution capabilities', () => {
      const executionCapabilities = plugin.capabilities.filter(
        c => c.name === 'command.execute' || c.name === 'task.execute' || c.name === 'script.execute'
      );

      expect(executionCapabilities.length).toBe(3);
      expect(executionCapabilities.some(c => c.name === 'command.execute')).toBe(true);
      expect(executionCapabilities.some(c => c.name === 'task.execute')).toBe(true);
      expect(executionCapabilities.some(c => c.name === 'script.execute')).toBe(true);
    });

    it('should maintain backward compatibility with legacy capabilities', () => {
      const legacyCapabilities = plugin.capabilities.filter(
        c => c.name.startsWith('bolt.')
      );

      expect(legacyCapabilities.length).toBeGreaterThan(0);
      expect(legacyCapabilities.some(c => c.name === 'bolt.command.execute')).toBe(true);
      expect(legacyCapabilities.some(c => c.name === 'bolt.task.execute')).toBe(true);
      expect(legacyCapabilities.some(c => c.name === 'bolt.inventory.list')).toBe(true);
      expect(legacyCapabilities.some(c => c.name === 'bolt.facts.query')).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      const config = plugin.getConfig();

      expect(config).toBeDefined();
      expect(config.projectPath).toBe('/test/bolt/project');
      expect(config.defaultTimeout).toBe(300000);
    });
  });
});
