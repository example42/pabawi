/**
 * Tests for CapabilityRegistry class
 *
 * Tests the v1.0.0 capability-based plugin architecture including:
 * - Capability registration and unregistration
 * - Priority-based routing
 * - Permission-aware capability listing
 * - Capability execution with context
 * - Widget registration and capability linking
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CapabilityRegistry,
  type User,
  type DebugContext,
} from "../../src/integrations/CapabilityRegistry";
import type {
  PluginCapability,
  PluginWidget,
  ExecutionContext,
} from "../../src/integrations/types";
import { LoggerService } from "../../src/services/LoggerService";

describe("CapabilityRegistry", () => {
  let registry: CapabilityRegistry;
  let logger: LoggerService;

  // Test fixtures
  const createTestCapability = (
    overrides: Partial<PluginCapability> = {}
  ): PluginCapability => ({
    category: "command",
    name: "command.execute",
    description: "Execute a command on target nodes",
    handler: vi.fn().mockResolvedValue({ success: true }),
    requiredPermissions: ["command.execute"],
    riskLevel: "execute",
    ...overrides,
  });

  const createTestWidget = (
    overrides: Partial<PluginWidget> = {}
  ): PluginWidget => ({
    id: "bolt:command-executor",
    name: "Command Executor",
    component: "./components/CommandExecutor.svelte",
    slots: ["dashboard", "node-detail"],
    size: "medium",
    requiredCapabilities: ["command.execute"],
    ...overrides,
  });

  const createTestUser = (overrides: Partial<User> = {}): User => ({
    id: "user-1",
    username: "testuser",
    roles: ["user"],
    ...overrides,
  });

  const adminUser = createTestUser({
    id: "admin-1",
    username: "admin",
    roles: ["admin"],
  });

  beforeEach(() => {
    logger = new LoggerService();
    registry = new CapabilityRegistry(logger);
  });

  describe("registerCapability", () => {
    it("should register a capability successfully", () => {
      const capability = createTestCapability();

      registry.registerCapability("bolt", capability, 10);

      const providers = registry.getProvidersForCapability("command.execute");
      expect(providers).toHaveLength(1);
      expect(providers[0].pluginName).toBe("bolt");
      expect(providers[0].priority).toBe(10);
      expect(providers[0].capability).toBe(capability);
    });

    it("should register multiple providers for the same capability", () => {
      const boltCapability = createTestCapability();
      const ansibleCapability = createTestCapability();

      registry.registerCapability("bolt", boltCapability, 10);
      registry.registerCapability("ansible", ansibleCapability, 20);

      const providers = registry.getProvidersForCapability("command.execute");
      expect(providers).toHaveLength(2);
    });

    it("should sort providers by priority (highest first)", () => {
      const lowPriority = createTestCapability();
      const highPriority = createTestCapability();
      const medPriority = createTestCapability();

      registry.registerCapability("low", lowPriority, 5);
      registry.registerCapability("high", highPriority, 20);
      registry.registerCapability("med", medPriority, 10);

      const providers = registry.getProvidersForCapability("command.execute");
      expect(providers[0].pluginName).toBe("high");
      expect(providers[1].pluginName).toBe("med");
      expect(providers[2].pluginName).toBe("low");
    });

    it("should use default priority of 10", () => {
      const capability = createTestCapability();

      registry.registerCapability("bolt", capability);

      const providers = registry.getProvidersForCapability("command.execute");
      expect(providers[0].priority).toBe(10);
    });

    it("should reject invalid capability names", () => {
      const capability = createTestCapability({ name: "invalid" });

      expect(() => registry.registerCapability("bolt", capability)).toThrow(
        "Invalid capability name"
      );
    });

    it("should reject empty capability names", () => {
      const capability = createTestCapability({ name: "" });

      expect(() => registry.registerCapability("bolt", capability)).toThrow(
        "Capability name must be a non-empty string"
      );
    });

    it("should accept valid hierarchical capability names", () => {
      const capability = createTestCapability({
        name: "task.module.execute",
      });

      expect(() => registry.registerCapability("bolt", capability)).not.toThrow();
    });
  });

  describe("unregisterPlugin", () => {
    it("should remove all capabilities from a plugin", () => {
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "command.execute" }),
        10
      );
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "task.execute" }),
        10
      );
      registry.registerCapability(
        "ansible",
        createTestCapability({ name: "command.execute" }),
        20
      );

      const removed = registry.unregisterPlugin("bolt");

      expect(removed).toBe(2);
      expect(registry.getProvidersForCapability("command.execute")).toHaveLength(1);
      expect(registry.getProvidersForCapability("task.execute")).toHaveLength(0);
    });

    it("should return 0 if plugin has no capabilities", () => {
      const removed = registry.unregisterPlugin("nonexistent");
      expect(removed).toBe(0);
    });

    it("should also remove widgets from the plugin", () => {
      const widget = createTestWidget();
      registry.registerCapability("bolt", createTestCapability(), 10);
      registry.registerWidget("bolt", widget);

      registry.unregisterPlugin("bolt");

      const widgets = registry.getAllWidgets();
      expect(widgets).toHaveLength(0);
    });
  });

  describe("registerWidget", () => {
    it("should register a widget successfully", () => {
      const widget = createTestWidget();

      registry.registerWidget("bolt", widget);

      const widgets = registry.getAllWidgets();
      expect(widgets).toHaveLength(1);
      expect(widgets[0].widget.id).toBe("bolt:command-executor");
      expect(widgets[0].pluginName).toBe("bolt");
    });

    it("should link widgets to required capabilities", () => {
      const widget = createTestWidget({
        requiredCapabilities: ["command.execute", "task.execute"],
      });

      registry.registerWidget("bolt", widget);

      expect(registry.getWidgetsForCapability("command.execute")).toContain(
        "bolt:command-executor"
      );
      expect(registry.getWidgetsForCapability("task.execute")).toContain(
        "bolt:command-executor"
      );
    });
  });

  describe("unregisterWidget", () => {
    it("should remove a widget and its capability links", () => {
      const widget = createTestWidget();
      registry.registerWidget("bolt", widget);

      registry.unregisterWidget("bolt:command-executor");

      expect(registry.getAllWidgets()).toHaveLength(0);
      expect(registry.getWidgetsForCapability("command.execute")).toHaveLength(0);
    });

    it("should handle non-existent widget gracefully", () => {
      expect(() => registry.unregisterWidget("nonexistent")).not.toThrow();
    });
  });

  describe("getPrimaryProvider", () => {
    it("should return the highest-priority provider", () => {
      registry.registerCapability(
        "low",
        createTestCapability(),
        5
      );
      registry.registerCapability(
        "high",
        createTestCapability(),
        20
      );

      const primary = registry.getPrimaryProvider("command.execute");

      expect(primary?.pluginName).toBe("high");
    });

    it("should return undefined for non-existent capability", () => {
      const primary = registry.getPrimaryProvider("nonexistent.capability");
      expect(primary).toBeUndefined();
    });
  });

  describe("getAllCapabilities", () => {
    beforeEach(() => {
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "command.execute", category: "command" }),
        10
      );
      registry.registerCapability(
        "bolt",
        createTestCapability({
          name: "task.execute",
          category: "task",
          riskLevel: "execute",
        }),
        10
      );
      registry.registerCapability(
        "puppetdb",
        createTestCapability({
          name: "facts.query",
          category: "info",
          riskLevel: "read",
          requiredPermissions: ["facts.read"],
        }),
        10
      );
    });

    it("should return all capabilities without user (no permission filtering)", () => {
      const capabilities = registry.getAllCapabilities();

      expect(capabilities).toHaveLength(3);
      expect(capabilities.every((c) => c.authorized)).toBe(true);
    });

    it("should filter by category", () => {
      const capabilities = registry.getAllCapabilities(undefined, {
        category: "command",
      });

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].capability.name).toBe("command.execute");
    });

    it("should filter by risk level", () => {
      const capabilities = registry.getAllCapabilities(undefined, {
        riskLevel: "read",
      });

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].capability.name).toBe("facts.query");
    });

    it("should filter by plugin name", () => {
      const capabilities = registry.getAllCapabilities(undefined, {
        pluginName: "puppetdb",
      });

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].capability.name).toBe("facts.query");
    });

    it("should mark unauthorized capabilities when user lacks permission", () => {
      const user = createTestUser({ roles: ["facts.read"] });

      const capabilities = registry.getAllCapabilities(user, {
        includeUnauthorized: true,
      });

      const commandCap = capabilities.find(
        (c) => c.capability.name === "command.execute"
      );
      const factsCap = capabilities.find(
        (c) => c.capability.name === "facts.query"
      );

      expect(commandCap?.authorized).toBe(false);
      expect(factsCap?.authorized).toBe(true);
    });

    it("should exclude unauthorized capabilities by default", () => {
      const user = createTestUser({ roles: ["facts.read"] });

      const capabilities = registry.getAllCapabilities(user);

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].capability.name).toBe("facts.query");
    });

    it("should grant admin users all permissions", () => {
      const capabilities = registry.getAllCapabilities(adminUser);

      expect(capabilities).toHaveLength(3);
      expect(capabilities.every((c) => c.authorized)).toBe(true);
    });
  });

  describe("getAllWidgets", () => {
    beforeEach(() => {
      registry.registerCapability("bolt", createTestCapability(), 10);
      registry.registerWidget(
        "bolt",
        createTestWidget({
          id: "bolt:executor",
          slots: ["dashboard"],
          priority: 10,
        })
      );
      registry.registerWidget(
        "bolt",
        createTestWidget({
          id: "bolt:history",
          slots: ["dashboard", "node-detail"],
          requiredCapabilities: [],
          priority: 5,
        })
      );
    });

    it("should return all widgets", () => {
      const widgets = registry.getAllWidgets();
      expect(widgets).toHaveLength(2);
    });

    it("should filter by slot", () => {
      const widgets = registry.getAllWidgets(undefined, "node-detail");
      expect(widgets).toHaveLength(1);
      expect(widgets[0].widget.id).toBe("bolt:history");
    });

    it("should sort by priority (highest first)", () => {
      const widgets = registry.getAllWidgets();
      expect(widgets[0].widget.id).toBe("bolt:executor");
      expect(widgets[1].widget.id).toBe("bolt:history");
    });

    it("should check widget authorization based on capabilities", () => {
      const user = createTestUser({ roles: [] });

      const widgets = registry.getAllWidgets(user);

      const executor = widgets.find((w) => w.widget.id === "bolt:executor");
      const history = widgets.find((w) => w.widget.id === "bolt:history");

      expect(executor?.authorized).toBe(false);
      expect(history?.authorized).toBe(true); // No required capabilities
    });
  });

  describe("executeCapability", () => {
    it("should execute capability and return result", async () => {
      const handler = vi.fn().mockResolvedValue({ output: "hello" });
      const capability = createTestCapability({ handler });
      registry.registerCapability("bolt", capability, 10);

      const result = await registry.executeCapability(
        adminUser,
        "command.execute",
        { command: "whoami" }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ output: "hello" });
      expect(result.handledBy).toBe("bolt");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(handler).toHaveBeenCalledWith(
        { command: "whoami" },
        expect.objectContaining({
          user: expect.objectContaining({ username: "admin" }),
        })
      );
    });

    it("should return error for non-existent capability", async () => {
      const result = await registry.executeCapability(
        adminUser,
        "nonexistent.capability",
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CAPABILITY_NOT_FOUND");
      expect(result.handledBy).toBe("none");
    });

    it("should return permission denied for unauthorized user", async () => {
      const capability = createTestCapability({
        requiredPermissions: ["admin.only"],
      });
      registry.registerCapability("bolt", capability, 10);
      const user = createTestUser({ roles: ["user"] });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });

    it("should execute capability for user with explicit permission", async () => {
      const capability = createTestCapability({
        requiredPermissions: ["command.execute"],
      });
      registry.registerCapability("bolt", capability, 10);
      const user = createTestUser({
        permissions: ["command.execute"],
      });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(true);
    });

    it("should handle handler errors gracefully", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Connection failed"));
      const capability = createTestCapability({ handler });
      registry.registerCapability("bolt", capability, 10);

      const result = await registry.executeCapability(
        adminUser,
        "command.execute",
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_ERROR");
      expect(result.error?.message).toBe("Connection failed");
      expect(result.handledBy).toBe("bolt");
    });

    it("should route to highest-priority provider", async () => {
      const lowHandler = vi.fn().mockResolvedValue("low");
      const highHandler = vi.fn().mockResolvedValue("high");

      registry.registerCapability(
        "low",
        createTestCapability({ handler: lowHandler }),
        5
      );
      registry.registerCapability(
        "high",
        createTestCapability({ handler: highHandler }),
        20
      );

      const result = await registry.executeCapability(
        adminUser,
        "command.execute",
        {}
      );

      expect(result.data).toBe("high");
      expect(highHandler).toHaveBeenCalled();
      expect(lowHandler).not.toHaveBeenCalled();
    });

    it("should include debug info when debug context provided", async () => {
      const capability = createTestCapability();
      registry.registerCapability("bolt", capability, 10);

      const debugContext: DebugContext = {
        correlationId: "corr-123",
        startTime: Date.now(),
        metadata: { source: "test" },
      };

      const result = await registry.executeCapability(
        adminUser,
        "command.execute",
        {},
        debugContext
      );

      expect(result.debug).toBeDefined();
      expect(result.debug?.correlationId).toBe("corr-123");
      expect(result.debug?.capabilityName).toBe("command.execute");
      expect(result.debug?.pluginName).toBe("bolt");
      expect(result.debug?.providersCount).toBe(1);
    });

    it("should pass correlation ID to handler context", async () => {
      let capturedContext: ExecutionContext | undefined;
      const handler = vi.fn().mockImplementation((_, ctx) => {
        capturedContext = ctx;
        return { success: true };
      });
      const capability = createTestCapability({ handler });
      registry.registerCapability("bolt", capability, 10);

      await registry.executeCapability(
        adminUser,
        "command.execute",
        {},
        { correlationId: "test-corr-id", startTime: Date.now() }
      );

      expect(capturedContext?.correlationId).toBe("test-corr-id");
    });

    it("should allow capabilities with empty permissions (public)", async () => {
      const capability = createTestCapability({
        requiredPermissions: [],
      });
      registry.registerCapability("bolt", capability, 10);
      const user = createTestUser({ roles: [] });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(true);
    });
  });

  describe("hasCapability", () => {
    it("should return true for registered capability", () => {
      registry.registerCapability("bolt", createTestCapability(), 10);

      expect(registry.hasCapability("command.execute")).toBe(true);
    });

    it("should return false for non-existent capability", () => {
      expect(registry.hasCapability("nonexistent.capability")).toBe(false);
    });
  });

  describe("getCapabilityNames", () => {
    it("should return all unique capability names", () => {
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "command.execute" }),
        10
      );
      registry.registerCapability(
        "ansible",
        createTestCapability({ name: "command.execute" }),
        20
      );
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "task.execute" }),
        10
      );

      const names = registry.getCapabilityNames();

      expect(names).toHaveLength(2);
      expect(names).toContain("command.execute");
      expect(names).toContain("task.execute");
    });
  });

  describe("getPluginNames", () => {
    it("should return all unique plugin names", () => {
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "command.execute" }),
        10
      );
      registry.registerCapability(
        "ansible",
        createTestCapability({ name: "command.execute" }),
        20
      );
      registry.registerCapability(
        "bolt",
        createTestCapability({ name: "task.execute" }),
        10
      );

      const plugins = registry.getPluginNames();

      expect(plugins).toHaveLength(2);
      expect(plugins).toContain("bolt");
      expect(plugins).toContain("ansible");
    });
  });

  describe("getStats", () => {
    it("should return accurate statistics", () => {
      registry.registerCapability(
        "bolt",
        createTestCapability({
          name: "command.execute",
          category: "command",
          riskLevel: "execute",
        }),
        10
      );
      registry.registerCapability(
        "ansible",
        createTestCapability({
          name: "command.execute",
          category: "command",
          riskLevel: "execute",
        }),
        20
      );
      registry.registerCapability(
        "puppetdb",
        createTestCapability({
          name: "facts.query",
          category: "info",
          riskLevel: "read",
        }),
        10
      );
      registry.registerWidget("bolt", createTestWidget());

      const stats = registry.getStats();

      expect(stats.totalCapabilities).toBe(2); // 2 unique capabilities
      expect(stats.totalProviders).toBe(3); // 3 total registrations
      expect(stats.totalWidgets).toBe(1);
      expect(stats.pluginCount).toBe(3);
      expect(stats.capabilitiesByCategory).toEqual({
        command: 2, // command.execute has 2 providers
        info: 1,
      });
      expect(stats.capabilitiesByRiskLevel).toEqual({
        execute: 2,
        read: 1,
      });
    });
  });

  describe("clear", () => {
    it("should remove all registrations", () => {
      registry.registerCapability("bolt", createTestCapability(), 10);
      registry.registerWidget("bolt", createTestWidget());

      registry.clear();

      expect(registry.getCapabilityNames()).toHaveLength(0);
      expect(registry.getAllWidgets()).toHaveLength(0);
      expect(registry.getStats().totalCapabilities).toBe(0);
    });
  });

  describe("permission checking", () => {
    it("should grant access via explicit permissions", async () => {
      const capability = createTestCapability({
        requiredPermissions: ["special.permission"],
      });
      registry.registerCapability("bolt", capability, 10);

      const user = createTestUser({
        permissions: ["special.permission"],
      });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(true);
    });

    it("should grant access via wildcard permission", async () => {
      const capability = createTestCapability({
        requiredPermissions: ["any.permission"],
      });
      registry.registerCapability("bolt", capability, 10);

      const user = createTestUser({
        permissions: ["*"],
      });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(true);
    });

    it("should grant access via role matching permission name", async () => {
      const capability = createTestCapability({
        requiredPermissions: ["command.execute"],
      });
      registry.registerCapability("bolt", capability, 10);

      const user = createTestUser({
        roles: ["command.execute"],
      });

      const result = await registry.executeCapability(
        user,
        "command.execute",
        {}
      );

      expect(result.success).toBe(true);
    });
  });
});
