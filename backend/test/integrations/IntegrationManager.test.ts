/**
 * Tests for IntegrationManager class
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { BasePlugin } from "../../src/integrations/BasePlugin";
import type {
  IntegrationConfig,
  HealthStatus,
  InformationSourcePlugin,
  ExecutionToolPlugin,
  Action,
} from "../../src/integrations/types";
import type { Node, Facts, ExecutionResult } from "../../src/bolt/types";

/**
 * Mock information source plugin for testing
 */
class MockInformationSource
  extends BasePlugin
  implements InformationSourcePlugin
{
  public nodes: Node[] = [];
  public facts = new Map<string, Facts>();
  public shouldFailInventory = false;
  public shouldFailFacts = false;

  constructor(name: string, nodes: Node[] = []) {
    super(name, "information");
    this.nodes = nodes;
  }

  protected async performInitialization(): Promise<void> {
    // Mock initialization
  }

  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    return {
      healthy: true,
      message: "Mock source is healthy",
    };
  }

  async getInventory(): Promise<Node[]> {
    if (this.shouldFailInventory) {
      throw new Error("Failed to get inventory");
    }
    return this.nodes;
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (this.shouldFailFacts) {
      throw new Error("Failed to get facts");
    }

    const facts = this.facts.get(nodeId);
    if (!facts) {
      throw new Error(`Facts not found for node ${nodeId}`);
    }
    return facts;
  }

  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    return { nodeId, dataType };
  }
}

/**
 * Mock execution tool plugin for testing
 */
class MockExecutionTool extends BasePlugin implements ExecutionToolPlugin {
  constructor(name: string) {
    super(name, "execution");
  }

  protected async performInitialization(): Promise<void> {
    // Mock initialization
  }

  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    return {
      healthy: true,
      message: "Mock tool is healthy",
    };
  }

  async executeAction(action: Action): Promise<ExecutionResult> {
    return {
      id: "test-execution",
      type: action.type,
      targetNodes: Array.isArray(action.target)
        ? action.target
        : [action.target],
      action: action.action,
      parameters: action.parameters,
      status: "success",
      startedAt: new Date().toISOString(),
      results: [],
    };
  }

  listCapabilities() {
    return [];
  }
}

describe("IntegrationManager", () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    manager = new IntegrationManager();
  });

  describe("plugin registration", () => {
    it("should register an information source plugin", () => {
      const plugin = new MockInformationSource("test-source");
      const config: IntegrationConfig = {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      };

      manager.registerPlugin(plugin, config);

      expect(manager.getPluginCount()).toBe(1);
      expect(manager.getInformationSource("test-source")).toBe(plugin);
    });

    it("should register an execution tool plugin", () => {
      const plugin = new MockExecutionTool("test-tool");
      const config: IntegrationConfig = {
        enabled: true,
        name: "test-tool",
        type: "execution",
        config: {},
      };

      manager.registerPlugin(plugin, config);

      expect(manager.getPluginCount()).toBe(1);
      expect(manager.getExecutionTool("test-tool")).toBe(plugin);
    });

    it("should throw error when registering duplicate plugin", () => {
      const plugin1 = new MockInformationSource("test-source");
      const plugin2 = new MockInformationSource("test-source");
      const config: IntegrationConfig = {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      };

      manager.registerPlugin(plugin1, config);

      expect(() => {
        manager.registerPlugin(plugin2, config);
      }).toThrow("Plugin 'test-source' is already registered");
    });

    it("should register multiple plugins", () => {
      const source = new MockInformationSource("source");
      const tool = new MockExecutionTool("tool");

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      manager.registerPlugin(tool, {
        enabled: true,
        name: "tool",
        type: "execution",
        config: {},
      });

      expect(manager.getPluginCount()).toBe(2);
      expect(manager.getAllInformationSources()).toHaveLength(1);
      expect(manager.getAllExecutionTools()).toHaveLength(1);
    });
  });

  describe("plugin initialization", () => {
    it("should initialize all registered plugins", async () => {
      const plugin1 = new MockInformationSource("source1");
      const plugin2 = new MockInformationSource("source2");

      manager.registerPlugin(plugin1, {
        enabled: true,
        name: "source1",
        type: "information",
        config: {},
      });

      manager.registerPlugin(plugin2, {
        enabled: true,
        name: "source2",
        type: "information",
        config: {},
      });

      const errors = await manager.initializePlugins();

      expect(errors).toHaveLength(0);
      expect(manager.isInitialized()).toBe(true);
      expect(plugin1.isInitialized()).toBe(true);
      expect(plugin2.isInitialized()).toBe(true);
    });

    it("should continue initialization even if some plugins fail", async () => {
      const goodPlugin = new MockInformationSource("good");
      const badPlugin = new MockInformationSource("bad");

      // Override performInitialization to throw error
      badPlugin.performInitialization = async () => {
        throw new Error("Initialization failed");
      };

      manager.registerPlugin(goodPlugin, {
        enabled: true,
        name: "good",
        type: "information",
        config: {},
      });

      manager.registerPlugin(badPlugin, {
        enabled: true,
        name: "bad",
        type: "information",
        config: {},
      });

      const errors = await manager.initializePlugins();

      expect(errors).toHaveLength(1);
      expect(errors[0].plugin).toBe("bad");
      expect(manager.isInitialized()).toBe(true);
      expect(goodPlugin.isInitialized()).toBe(true);
      expect(badPlugin.isInitialized()).toBe(false);
    });
  });

  describe("plugin retrieval", () => {
    it("should return null for non-existent plugin", () => {
      expect(manager.getInformationSource("non-existent")).toBeNull();
      expect(manager.getExecutionTool("non-existent")).toBeNull();
    });

    it("should get all plugins", () => {
      const source = new MockInformationSource("source");
      const tool = new MockExecutionTool("tool");

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      manager.registerPlugin(tool, {
        enabled: true,
        name: "tool",
        type: "execution",
        config: {},
      });

      const allPlugins = manager.getAllPlugins();
      expect(allPlugins).toHaveLength(2);
    });
  });

  describe("plugin unregistration", () => {
    it("should unregister a plugin", () => {
      const plugin = new MockInformationSource("test-source");
      manager.registerPlugin(plugin, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      const result = manager.unregisterPlugin("test-source");

      expect(result).toBe(true);
      expect(manager.getPluginCount()).toBe(0);
      expect(manager.getInformationSource("test-source")).toBeNull();
    });

    it("should return false when unregistering non-existent plugin", () => {
      const result = manager.unregisterPlugin("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("action execution", () => {
    it("should execute action using specified tool", async () => {
      const tool = new MockExecutionTool("test-tool");
      manager.registerPlugin(tool, {
        enabled: true,
        name: "test-tool",
        type: "execution",
        config: {},
      });
      await manager.initializePlugins();

      const action: Action = {
        type: "command",
        target: "node1",
        action: "echo test",
      };

      const result = await manager.executeAction("test-tool", action);

      expect(result.type).toBe("command");
      expect(result.action).toBe("echo test");
    });

    it("should throw error when tool not found", async () => {
      const action: Action = {
        type: "command",
        target: "node1",
        action: "echo test",
      };

      await expect(
        manager.executeAction("non-existent", action),
      ).rejects.toThrow("Execution tool 'non-existent' not found");
    });

    it("should throw error when tool not initialized", async () => {
      const tool = new MockExecutionTool("test-tool");
      manager.registerPlugin(tool, {
        enabled: false,
        name: "test-tool",
        type: "execution",
        config: {},
      });
      await manager.initializePlugins();

      const action: Action = {
        type: "command",
        target: "node1",
        action: "echo test",
      };

      await expect(manager.executeAction("test-tool", action)).rejects.toThrow(
        "Execution tool 'test-tool' is not initialized",
      );
    });
  });

  describe("aggregated inventory", () => {
    it("should aggregate inventory from multiple sources", async () => {
      const nodes1: Node[] = [
        {
          id: "node1",
          name: "node1",
          uri: "ssh://node1",
          transport: "ssh",
          config: {},
        },
      ];

      const nodes2: Node[] = [
        {
          id: "node2",
          name: "node2",
          uri: "ssh://node2",
          transport: "ssh",
          config: {},
        },
      ];

      const source1 = new MockInformationSource("source1", nodes1);
      const source2 = new MockInformationSource("source2", nodes2);

      manager.registerPlugin(source1, {
        enabled: true,
        name: "source1",
        type: "information",
        config: {},
      });

      manager.registerPlugin(source2, {
        enabled: true,
        name: "source2",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      const inventory = await manager.getAggregatedInventory();

      expect(inventory.nodes).toHaveLength(2);
      expect(inventory.sources).toHaveProperty("source1");
      expect(inventory.sources).toHaveProperty("source2");
      expect(inventory.sources.source1.nodeCount).toBe(1);
      expect(inventory.sources.source2.nodeCount).toBe(1);
      expect(inventory.sources.source1.status).toBe("healthy");
    });

    it("should handle source failures gracefully", async () => {
      const nodes: Node[] = [
        {
          id: "node1",
          name: "node1",
          uri: "ssh://node1",
          transport: "ssh",
          config: {},
        },
      ];

      const goodSource = new MockInformationSource("good", nodes);
      const badSource = new MockInformationSource("bad", []);
      badSource.shouldFailInventory = true;

      manager.registerPlugin(goodSource, {
        enabled: true,
        name: "good",
        type: "information",
        config: {},
      });

      manager.registerPlugin(badSource, {
        enabled: true,
        name: "bad",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      const inventory = await manager.getAggregatedInventory();

      expect(inventory.nodes).toHaveLength(1);
      expect(inventory.sources.good.status).toBe("healthy");
      expect(inventory.sources.bad.status).toBe("unavailable");
    });

    it("should deduplicate nodes by ID", async () => {
      const node: Node = {
        id: "node1",
        name: "node1",
        uri: "ssh://node1",
        transport: "ssh",
        config: {},
      };

      const source1 = new MockInformationSource("source1", [node]);
      const source2 = new MockInformationSource("source2", [node]);

      manager.registerPlugin(source1, {
        enabled: true,
        name: "source1",
        type: "information",
        config: {},
        priority: 1,
      });

      manager.registerPlugin(source2, {
        enabled: true,
        name: "source2",
        type: "information",
        config: {},
        priority: 2,
      });

      await manager.initializePlugins();

      const inventory = await manager.getAggregatedInventory();

      expect(inventory.nodes).toHaveLength(1);
      // Should prefer node from higher priority source (source2)
      expect((inventory.nodes[0] as Node & { source?: string }).source).toBe(
        "source2",
      );
    });
  });

  describe("node data aggregation", () => {
    it("should aggregate data for a specific node", async () => {
      const node: Node = {
        id: "node1",
        name: "node1",
        uri: "ssh://node1",
        transport: "ssh",
        config: {},
      };

      const facts: Facts = {
        nodeId: "node1",
        gatheredAt: new Date().toISOString(),
        facts: {
          os: {
            family: "RedHat",
            name: "CentOS",
            release: { full: "7.9", major: "7" },
          },
          processors: { count: 4, models: ["Intel"] },
          memory: { system: { total: "8GB", available: "4GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      };

      const source = new MockInformationSource("source", [node]);
      source.facts.set("node1", facts);

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      const nodeData = await manager.getNodeData("node1");

      expect(nodeData.node.id).toBe("node1");
      expect(nodeData.facts).toHaveProperty("source");
      expect(nodeData.facts.source).toEqual(facts);
    });

    it("should throw error when node not found", async () => {
      const source = new MockInformationSource("source", []);

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      await expect(manager.getNodeData("non-existent")).rejects.toThrow(
        "Node 'non-existent' not found in any source",
      );
    });

    it("should handle facts retrieval failures gracefully", async () => {
      const node: Node = {
        id: "node1",
        name: "node1",
        uri: "ssh://node1",
        transport: "ssh",
        config: {},
      };

      const source = new MockInformationSource("source", [node]);
      source.shouldFailFacts = true;

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      const nodeData = await manager.getNodeData("node1");

      expect(nodeData.node.id).toBe("node1");
      expect(nodeData.facts).toEqual({});
    });
  });

  describe("health check aggregation", () => {
    it("should aggregate health checks from all plugins", async () => {
      const source = new MockInformationSource("source");
      const tool = new MockExecutionTool("tool");

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      manager.registerPlugin(tool, {
        enabled: true,
        name: "tool",
        type: "execution",
        config: {},
      });

      await manager.initializePlugins();

      const healthStatuses = await manager.healthCheckAll();

      expect(healthStatuses.size).toBe(2);
      expect(healthStatuses.get("source")?.healthy).toBe(true);
      expect(healthStatuses.get("tool")?.healthy).toBe(true);
    });

    it("should handle health check failures", async () => {
      const source = new MockInformationSource("source");

      // Override performHealthCheck to throw error
      source.performHealthCheck = async () => {
        throw new Error("Health check failed");
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      const healthStatuses = await manager.healthCheckAll();

      expect(healthStatuses.size).toBe(1);
      expect(healthStatuses.get("source")?.healthy).toBe(false);
      expect(healthStatuses.get("source")?.message).toContain(
        "Health check failed",
      );
    });
  });
});
