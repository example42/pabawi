/**
 * Property-Based Tests for Console Provider Registration Invariant
 *
 * Feature: console-integration, Property 1: Console provider registration invariant
 *
 * **Validates: Requirements 1.4**
 *
 * Property 1: Console provider registration invariant
 * ∀ plugin implementing ConsolePlugin interface:
 *   after registration with IntegrationManager, it SHALL appear in the
 *   console providers map and be retrievable by name.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type {
  ConsolePlugin,
  ConsoleCapability,
  ConsoleTransport,
} from "../../src/integrations/console/types";
import type {
  IntegrationConfig,
  HealthStatus,
} from "../../src/integrations/types";
import type { LoggerService } from "../../src/services/LoggerService";

// ============================================================
// Helpers
// ============================================================

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LoggerService;
}

function createMockConsolePlugin(name: string): ConsolePlugin {
  return {
    name,
    type: "information" as const,
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      message: "ok",
      lastCheck: new Date().toISOString(),
    } satisfies HealthStatus),
    getConfig: vi.fn().mockReturnValue({
      enabled: true,
      name,
      type: "information",
      config: {},
    } satisfies IntegrationConfig),
    isInitialized: vi.fn().mockReturnValue(true),
    getConsoleCapabilities: vi.fn().mockResolvedValue([
      {
        transport: "websocket-vnc",
        displayName: "VNC Console",
        connectionSchema: {},
      } satisfies ConsoleCapability,
    ]),
    createSession: vi.fn().mockResolvedValue({
      sessionId: "test",
      token: "tok",
      wsUrl: "/ws/console/vnc?token=tok",
      transport: "websocket-vnc" as ConsoleTransport,
      state: "active" as const,
      startedAt: new Date().toISOString(),
      nodeId: "node-1",
      userId: "user-1",
      provider: name,
    }),
    terminateSession: vi.fn().mockResolvedValue(true),
    getSessionStatus: vi.fn().mockResolvedValue({
      state: "active" as const,
      startedAt: new Date().toISOString(),
    }),
    getSupportedTransports: vi.fn().mockReturnValue(["websocket-vnc"]),
  };
}

// ============================================================
// Arbitraries
// ============================================================

/** Random plugin name: lowercase alpha, 3-15 chars */
const pluginNameArb = fc.stringMatching(/^[a-z]{3,15}$/);

/** Unique array of plugin names (1-8 plugins) */
const pluginNamesArb = fc.uniqueArray(pluginNameArb, {
  minLength: 1,
  maxLength: 8,
});

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 1: Console provider registration invariant", () => {
  it("after registration, a ConsolePlugin is retrievable by name via getConsoleProvider", () => {
    fc.assert(
      fc.property(pluginNameArb, (name) => {
        const logger = createMockLogger();
        const manager = new IntegrationManager({ logger });

        const plugin = createMockConsolePlugin(name);
        manager.registerPlugin(plugin, {
          enabled: true,
          name,
          type: "information",
          config: {},
        });

        const retrieved = manager.getConsoleProvider(name);
        expect(retrieved).not.toBeNull();
        expect(retrieved).toBe(plugin);
        expect(retrieved!.name).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it("after registration of N plugins, all appear in getAllConsoleProviders", () => {
    fc.assert(
      fc.property(pluginNamesArb, (names) => {
        const logger = createMockLogger();
        const manager = new IntegrationManager({ logger });

        const plugins: ConsolePlugin[] = [];
        for (const name of names) {
          const plugin = createMockConsolePlugin(name);
          plugins.push(plugin);
          manager.registerPlugin(plugin, {
            enabled: true,
            name,
            type: "information",
            config: {},
          });
        }

        const allProviders = manager.getAllConsoleProviders();

        // All registered plugins must be present
        expect(allProviders.length).toBe(names.length);

        for (let i = 0; i < names.length; i++) {
          const found = allProviders.find((p) => p.name === names[i]);
          expect(found).toBeDefined();
          expect(found).toBe(plugins[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("unregistered plugin names return null from getConsoleProvider", () => {
    fc.assert(
      fc.property(
        pluginNamesArb,
        pluginNameArb.filter((n) => n.length >= 3),
        (registeredNames, queryName) => {
          // Skip if queryName is already in registeredNames
          fc.pre(!registeredNames.includes(queryName));

          const logger = createMockLogger();
          const manager = new IntegrationManager({ logger });

          for (const name of registeredNames) {
            const plugin = createMockConsolePlugin(name);
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const result = manager.getConsoleProvider(queryName);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
