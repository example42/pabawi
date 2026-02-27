/**
 * Tests for IntegrationManager class
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { BasePlugin } from "../../src/integrations/BasePlugin";
import { LoggerService } from "../../src/services/LoggerService";
import type {
  IntegrationConfig,
  HealthStatus,
  InformationSourcePlugin,
  ExecutionToolPlugin,
  Action,
} from "../../src/integrations/types";
import type { Node, Facts, ExecutionResult } from "../../src/integrations/bolt/types";

/**
 * Mock information source plugin for testing
 */
class MockInformationSource
  extends BasePlugin
  implements InformationSourcePlugin
{
  public nodes: Node[] = [];
  public groups: import("../../src/integrations/types").NodeGroup[] = [];
  public facts = new Map<string, Facts>();
  public shouldFailInventory = false;
  public shouldFailFacts = false;
  public shouldFailGroups = false;

  constructor(name: string, nodes: Node[] = [], logger: LoggerService, groups: import("../../src/integrations/types").NodeGroup[] = []) {
    super(name, "information", logger);
    this.nodes = nodes;
    this.groups = groups;
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

  async getGroups(): Promise<import("../../src/integrations/types").NodeGroup[]> {
    if (this.shouldFailGroups) {
      throw new Error("Failed to get groups");
    }
    return this.groups;
  }

  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    return { nodeId, dataType };
  }
}

/**
 * Mock execution tool plugin for testing
 */
class MockExecutionTool extends BasePlugin implements ExecutionToolPlugin {
  constructor(name: string, logger: LoggerService) {
    super(name, "execution", logger);
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
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService('error'); // Use error level to minimize test output
    manager = new IntegrationManager({ logger });
  });

  describe("plugin registration", () => {
    it("should register an information source plugin", () => {
      const plugin = new MockInformationSource("test-source", [], logger);
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
      const plugin = new MockExecutionTool("test-tool", logger);
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
      const plugin1 = new MockInformationSource("test-source", [], logger);
      const plugin2 = new MockInformationSource("test-source", [], logger);
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
      const source = new MockInformationSource("source", [], logger);
      const tool = new MockExecutionTool("tool", logger);

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
      const plugin1 = new MockInformationSource("source1", [], logger);
      const plugin2 = new MockInformationSource("source2", [], logger);

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
      const goodPlugin = new MockInformationSource("good", [], logger);
      const badPlugin = new MockInformationSource("bad", [], logger);

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
      const source = new MockInformationSource("source", [], logger);
      const tool = new MockExecutionTool("tool", logger);

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
      const plugin = new MockInformationSource("test-source", [], logger);
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
      const tool = new MockExecutionTool("test-tool", logger);
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
      const tool = new MockExecutionTool("test-tool", logger);
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

      const source1 = new MockInformationSource("source1", nodes1, logger);
      const source2 = new MockInformationSource("source2", nodes2, logger);

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

    it("should aggregate groups from multiple sources", async () => {
      const nodes1: Node[] = [
        {
          id: "node1",
          name: "node1",
          uri: "ssh://node1",
          transport: "ssh",
          config: {},
        },
      ];

      const groups1: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source1:web-servers",
          name: "web-servers",
          source: "source1",
          sources: ["source1"],
          linked: false,
          nodes: ["node1"],
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

      const groups2: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source2:db-servers",
          name: "db-servers",
          source: "source2",
          sources: ["source2"],
          linked: false,
          nodes: ["node2"],
        },
      ];

      const source1 = new MockInformationSource("source1", nodes1, logger, groups1);
      const source2 = new MockInformationSource("source2", nodes2, logger, groups2);

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
      expect(inventory.groups).toHaveLength(2);
      expect(inventory.sources.source1.groupCount).toBe(1);
      expect(inventory.sources.source2.groupCount).toBe(1);
      expect(inventory.groups[0].name).toBe("web-servers");
      expect(inventory.groups[1].name).toBe("db-servers");
    });

    it("should handle group fetching failures gracefully", async () => {
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

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "good:web-servers",
          name: "web-servers",
          source: "good",
          sources: ["good"],
          linked: false,
          nodes: ["node1"],
        },
      ];

      const goodSource = new MockInformationSource("good", nodes1, logger, groups);
      const badSource = new MockInformationSource("bad", nodes2, logger);
      badSource.shouldFailGroups = true;

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

      // Should still get nodes from both sources
      expect(inventory.nodes).toHaveLength(2);
      // Should get groups from good source, bad source returns empty array on error
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].name).toBe("web-servers");
      expect(inventory.sources.good.groupCount).toBe(1);
      expect(inventory.sources.bad.groupCount).toBe(0);
    });

    it("should link groups with same name across multiple sources", async () => {
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

      // Both sources have a group with the same name "web-servers"
      const groups1: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source1:web-servers",
          name: "web-servers",
          source: "source1",
          sources: ["source1"],
          linked: false,
          nodes: ["node1"],
          metadata: {
            description: "Web servers from source1",
            env: "production",
          },
        },
      ];

      const groups2: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source2:web-servers",
          name: "web-servers",
          source: "source2",
          sources: ["source2"],
          linked: false,
          nodes: ["node2"],
          metadata: {
            description: "Web servers from source2",
            region: "us-west",
          },
        },
      ];

      const source1 = new MockInformationSource("source1", nodes1, logger, groups1);
      const source2 = new MockInformationSource("source2", nodes2, logger, groups2);

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

      // Should have 1 linked group instead of 2 separate groups
      expect(inventory.groups).toHaveLength(1);

      const linkedGroup = inventory.groups[0];
      expect(linkedGroup.name).toBe("web-servers");
      expect(linkedGroup.linked).toBe(true);
      expect(linkedGroup.sources).toEqual(["source1", "source2"]);
      expect(linkedGroup.id).toBe("linked:web-servers");

      // Should have both nodes deduplicated
      expect(linkedGroup.nodes).toHaveLength(2);
      expect(linkedGroup.nodes).toContain("node1");
      expect(linkedGroup.nodes).toContain("node2");

      // Should merge metadata from both sources
      expect(linkedGroup.metadata).toBeDefined();
      expect(linkedGroup.metadata?.env).toBe("production");
      expect(linkedGroup.metadata?.region).toBe("us-west");
    });

    it("should deduplicate node IDs when linking groups", async () => {
      const nodes: Node[] = [
        {
          id: "node1",
          name: "node1",
          uri: "ssh://node1",
          transport: "ssh",
          config: {},
        },
      ];

      // Both sources have the same group with overlapping nodes
      const groups1: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source1:web-servers",
          name: "web-servers",
          source: "source1",
          sources: ["source1"],
          linked: false,
          nodes: ["node1", "node2"],
        },
      ];

      const groups2: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source2:web-servers",
          name: "web-servers",
          source: "source2",
          sources: ["source2"],
          linked: false,
          nodes: ["node2", "node3"], // node2 is in both
        },
      ];

      const source1 = new MockInformationSource("source1", nodes, logger, groups1);
      const source2 = new MockInformationSource("source2", nodes, logger, groups2);

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

      expect(inventory.groups).toHaveLength(1);

      const linkedGroup = inventory.groups[0];
      // Should have 3 unique nodes (node1, node2, node3)
      expect(linkedGroup.nodes).toHaveLength(3);
      expect(linkedGroup.nodes).toContain("node1");
      expect(linkedGroup.nodes).toContain("node2");
      expect(linkedGroup.nodes).toContain("node3");
    });

    it("should not link groups with different names", async () => {
      const nodes: Node[] = [
        {
          id: "node1",
          name: "node1",
          uri: "ssh://node1",
          transport: "ssh",
          config: {},
        },
      ];

      const groups1: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source1:web-servers",
          name: "web-servers",
          source: "source1",
          sources: ["source1"],
          linked: false,
          nodes: ["node1"],
        },
      ];

      const groups2: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "source2:db-servers",
          name: "db-servers",
          source: "source2",
          sources: ["source2"],
          linked: false,
          nodes: ["node2"],
        },
      ];

      const source1 = new MockInformationSource("source1", nodes, logger, groups1);
      const source2 = new MockInformationSource("source2", nodes, logger, groups2);

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

      // Should have 2 separate groups
      expect(inventory.groups).toHaveLength(2);
      expect(inventory.groups[0].linked).toBe(false);
      expect(inventory.groups[1].linked).toBe(false);
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

      const goodSource = new MockInformationSource("good", nodes, logger);
      const badSource = new MockInformationSource("bad", [], logger);
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

      const source1 = new MockInformationSource("source1", [node], logger);
      const source2 = new MockInformationSource("source2", [node], logger);

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

      const source = new MockInformationSource("source", [node], logger);
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
      const source = new MockInformationSource("source", [], logger);

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

      const source = new MockInformationSource("source", [node], logger);
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
      const source = new MockInformationSource("source", [], logger);
      const tool = new MockExecutionTool("tool", logger);

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
      const source = new MockInformationSource("source", [], logger);

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

    it("should cache health check results when requested", async () => {
      const source = new MockInformationSource("source", [], logger);
      let healthCheckCount = 0;

      // Override performHealthCheck to count calls
      const originalHealthCheck = source.performHealthCheck.bind(source);
      source.performHealthCheck = async () => {
        healthCheckCount++;
        return originalHealthCheck();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call should perform health check
      await manager.healthCheckAll(false);
      expect(healthCheckCount).toBe(1);

      // Second call with cache should not perform health check
      await manager.healthCheckAll(true);
      expect(healthCheckCount).toBe(1);

      // Third call without cache should perform health check
      await manager.healthCheckAll(false);
      expect(healthCheckCount).toBe(2);
    });

    it("should clear health check cache", async () => {
      const source = new MockInformationSource("source", [], logger);

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // Perform health check to populate cache
      await manager.healthCheckAll(false);
      expect(manager.getHealthCheckCache().size).toBe(1);

      // Clear cache
      manager.clearHealthCheckCache();
      expect(manager.getHealthCheckCache().size).toBe(0);
    });
  });

  describe("health check scheduler", () => {
    it("should start and stop health check scheduler", () => {
      const source = new MockInformationSource("source", [], logger);

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      // Start scheduler
      manager.startHealthCheckScheduler();

      // Stop scheduler
      manager.stopHealthCheckScheduler();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should not start scheduler twice", () => {
      const source = new MockInformationSource("source", [], logger);

      manager.registerPlugin(source, {
        enabled: true,
        name: "source",
        type: "information",
        config: {},
      });

      // Start scheduler
      manager.startHealthCheckScheduler();

      // Try to start again
      manager.startHealthCheckScheduler();

      // Stop scheduler
      manager.stopHealthCheckScheduler();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("group validation", () => {
    it("should reject groups missing required field 'id'", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const invalidGroup = {
        // Missing id
        name: "test-group",
        source: "test-source",
        sources: ["test-source"],
        linked: false,
        nodes: ["node1"],
      } as import("../../src/integrations/types").NodeGroup;

      const source = new MockInformationSource("test-source", nodes, logger, [invalidGroup]);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should be rejected
      expect(inventory.groups).toHaveLength(0);
      expect(inventory.nodes).toHaveLength(1);
    });

    it("should reject groups missing required field 'name'", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const invalidGroup = {
        id: "test-source:group1",
        // Missing name
        source: "test-source",
        sources: ["test-source"],
        linked: false,
        nodes: ["node1"],
      } as import("../../src/integrations/types").NodeGroup;

      const source = new MockInformationSource("test-source", nodes, logger, [invalidGroup]);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should be rejected
      expect(inventory.groups).toHaveLength(0);
    });

    it("should reject groups missing required field 'nodes'", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const invalidGroup = {
        id: "test-source:group1",
        name: "test-group",
        source: "test-source",
        sources: ["test-source"],
        linked: false,
        // Missing nodes array
      } as import("../../src/integrations/types").NodeGroup;

      const source = new MockInformationSource("test-source", nodes, logger, [invalidGroup]);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should be rejected
      expect(inventory.groups).toHaveLength(0);
    });

    it("should reject duplicate group IDs within same source", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
        { id: "node2", name: "node2", uri: "ssh://node2" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "test-source:group1",
          name: "group1",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node1"],
        },
        {
          id: "test-source:group1", // Duplicate ID
          name: "group1-duplicate",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node2"],
        },
      ];

      const source = new MockInformationSource("test-source", nodes, logger, groups);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Only first group should be kept, duplicate rejected
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].id).toBe("test-source:group1");
      expect(inventory.groups[0].name).toBe("group1");
    });

    it("should sanitize group names with HTML tags", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "test-source:group1",
          name: "<script>alert('xss')</script>malicious-group",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node1"],
        },
      ];

      const source = new MockInformationSource("test-source", nodes, logger, groups);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should be included but name sanitized
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].name).not.toContain("<script>");
      expect(inventory.groups[0].name).not.toContain("alert");
      expect(inventory.groups[0].name).not.toContain("(");
      expect(inventory.groups[0].name).not.toContain(")");
      // After sanitization: removes <script>, alert, (), and 'xss' quotes
      expect(inventory.groups[0].name).toBe("xssmalicious-group");
    });

    it("should sanitize group names with SQL injection patterns", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "test-source:group1",
          name: "group'; DROP TABLE users; --",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node1"],
        },
      ];

      const source = new MockInformationSource("test-source", nodes, logger, groups);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should be included but name sanitized
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].name).not.toContain("'");
      expect(inventory.groups[0].name).not.toContain(";");
      expect(inventory.groups[0].name).not.toContain("--");
    });

    it("should include groups with invalid node references but log warning", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "test-source:group1",
          name: "test-group",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node1", "non-existent-node", "another-missing-node"],
        },
      ];

      const source = new MockInformationSource("test-source", nodes, logger, groups);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Group should still be included despite invalid references
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].nodes).toEqual(["node1", "non-existent-node", "another-missing-node"]);
    });

    it("should accept valid groups with all required fields", async () => {
      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
        { id: "node2", name: "node2", uri: "ssh://node2" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "test-source:group1",
          name: "valid-group",
          source: "test-source",
          sources: ["test-source"],
          linked: false,
          nodes: ["node1", "node2"],
          metadata: {
            description: "A valid test group",
          },
        },
      ];

      const source = new MockInformationSource("test-source", nodes, logger, groups);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test-source",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();
      const inventory = await manager.getAggregatedInventory();

      // Valid group should be included
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].id).toBe("test-source:group1");
      expect(inventory.groups[0].name).toBe("valid-group");
      expect(inventory.groups[0].nodes).toEqual(["node1", "node2"]);
      expect(inventory.groups[0].metadata?.description).toBe("A valid test group");
    });

    it("should validate groups from multiple sources independently", async () => {
      const nodes1: Node[] = [
        { id: "source1:node1", name: "node1", uri: "ssh://node1" },
      ];

      const nodes2: Node[] = [
        { id: "source2:node2", name: "node2", uri: "ssh://node2" },
      ];

      const validGroup: import("../../src/integrations/types").NodeGroup = {
        id: "source1:group1",
        name: "valid-group",
        source: "source1",
        sources: ["source1"],
        linked: false,
        nodes: ["source1:node1"],
      };

      const invalidGroup = {
        // Missing id
        name: "invalid-group",
        source: "source2",
        sources: ["source2"],
        linked: false,
        nodes: ["source2:node2"],
      } as import("../../src/integrations/types").NodeGroup;

      const source1 = new MockInformationSource("source1", nodes1, logger, [validGroup]);
      const source2 = new MockInformationSource("source2", nodes2, logger, [invalidGroup]);

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

      // Only valid group from source1 should be included
      expect(inventory.groups).toHaveLength(1);
      expect(inventory.groups[0].source).toBe("source1");
      expect(inventory.nodes).toHaveLength(2); // Both nodes should be present
    });
  });

  describe("Inventory Caching", () => {
    it("should cache inventory results and return cached data on subsequent calls", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 5000, // 5 seconds
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "group1",
          name: "group1",
          source: "test",
          sources: ["test"],
          linked: false,
          nodes: ["node1"],
        },
      ];

      let callCount = 0;
      const source = new MockInformationSource("test", nodes, logger, groups);

      // Override getInventory to track calls
      const originalGetInventory = source.getInventory.bind(source);
      source.getInventory = async () => {
        callCount++;
        return originalGetInventory();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call - should fetch from source
      const inventory1 = await manager.getAggregatedInventory();
      expect(callCount).toBe(1);
      expect(inventory1.nodes).toHaveLength(1);
      expect(inventory1.groups).toHaveLength(1);

      // Second call - should return cached data
      const inventory2 = await manager.getAggregatedInventory();
      expect(callCount).toBe(1); // Should not increment
      expect(inventory2.nodes).toHaveLength(1);
      expect(inventory2.groups).toHaveLength(1);

      // Verify same data returned
      expect(inventory2).toEqual(inventory1);
    });

    it("should bypass cache when useCache=false", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 5000,
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      let callCount = 0;
      const source = new MockInformationSource("test", nodes, logger, []);

      const originalGetInventory = source.getInventory.bind(source);
      source.getInventory = async () => {
        callCount++;
        return originalGetInventory();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call with cache
      await manager.getAggregatedInventory(true);
      expect(callCount).toBe(1);

      // Second call bypassing cache
      await manager.getAggregatedInventory(false);
      expect(callCount).toBe(2); // Should increment

      // Third call with cache - should use newly cached data
      await manager.getAggregatedInventory(true);
      expect(callCount).toBe(2); // Should not increment
    });

    it("should invalidate cache when clearInventoryCache is called", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 5000,
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      let callCount = 0;
      const source = new MockInformationSource("test", nodes, logger, []);

      const originalGetInventory = source.getInventory.bind(source);
      source.getInventory = async () => {
        callCount++;
        return originalGetInventory();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call - should fetch from source
      await manager.getAggregatedInventory();
      expect(callCount).toBe(1);

      // Second call - should use cache
      await manager.getAggregatedInventory();
      expect(callCount).toBe(1);

      // Clear cache
      manager.clearInventoryCache();

      // Third call - should fetch fresh data
      await manager.getAggregatedInventory();
      expect(callCount).toBe(2);
    });

    it("should expire cache after TTL", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 100, // 100ms for fast test
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      let callCount = 0;
      const source = new MockInformationSource("test", nodes, logger, []);

      const originalGetInventory = source.getInventory.bind(source);
      source.getInventory = async () => {
        callCount++;
        return originalGetInventory();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call
      await manager.getAggregatedInventory();
      expect(callCount).toBe(1);

      // Second call immediately - should use cache
      await manager.getAggregatedInventory();
      expect(callCount).toBe(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Third call after expiry - should fetch fresh data
      await manager.getAggregatedInventory();
      expect(callCount).toBe(2);
    });

    it("should cache both nodes and groups together", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 5000,
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
        { id: "node2", name: "node2", uri: "ssh://node2" },
      ];

      const groups: import("../../src/integrations/types").NodeGroup[] = [
        {
          id: "group1",
          name: "group1",
          source: "test",
          sources: ["test"],
          linked: false,
          nodes: ["node1", "node2"],
        },
      ];

      let inventoryCallCount = 0;
      let groupsCallCount = 0;

      const source = new MockInformationSource("test", nodes, logger, groups);

      const originalGetInventory = source.getInventory.bind(source);
      const originalGetGroups = source.getGroups.bind(source);

      source.getInventory = async () => {
        inventoryCallCount++;
        return originalGetInventory();
      };

      source.getGroups = async () => {
        groupsCallCount++;
        return originalGetGroups();
      };

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // First call - should fetch both nodes and groups
      const inventory1 = await manager.getAggregatedInventory();
      expect(inventoryCallCount).toBe(1);
      expect(groupsCallCount).toBe(1);
      expect(inventory1.nodes).toHaveLength(2);
      expect(inventory1.groups).toHaveLength(1);

      // Second call - should use cache for both
      const inventory2 = await manager.getAggregatedInventory();
      expect(inventoryCallCount).toBe(1); // Should not increment
      expect(groupsCallCount).toBe(1); // Should not increment
      expect(inventory2.nodes).toHaveLength(2);
      expect(inventory2.groups).toHaveLength(1);
    });

    it("should clear all caches with clearAllCaches", async () => {
      const logger = new LoggerService();
      const manager = new IntegrationManager({
        inventoryCacheTTL: 5000,
        healthCheckCacheTTL: 5000,
        logger,
      });

      const nodes: Node[] = [
        { id: "node1", name: "node1", uri: "ssh://node1" },
      ];

      const source = new MockInformationSource("test", nodes, logger, []);

      manager.registerPlugin(source, {
        enabled: true,
        name: "test",
        type: "information",
        config: {},
      });

      await manager.initializePlugins();

      // Populate caches
      await manager.getAggregatedInventory();
      await manager.healthCheckAll(false);

      // Verify caches are populated
      const healthCache1 = manager.getHealthCheckCache();
      expect(healthCache1.size).toBeGreaterThan(0);

      // Clear all caches
      manager.clearAllCaches();

      // Verify both caches are cleared
      const healthCache2 = manager.getHealthCheckCache();
      expect(healthCache2.size).toBe(0);

      // Inventory cache should be cleared (will fetch fresh on next call)
      // We can't directly inspect inventoryCache, but we can verify behavior
      // by checking that the next call fetches fresh data
    });
  });
});
