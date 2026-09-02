/**
 * Property-Based Tests for Unhealthy Provider Exclusion
 *
 * Feature: console-integration, Property 15: Unhealthy provider exclusion
 *
 * **Validates: Requirements 10.1**
 *
 * Property 15: Unhealthy provider exclusion
 * ∀ provider sets with random health states (healthy/throws):
 *   Only providers that return successfully from getConsoleCapabilities
 *   appear in the availability response. Providers that throw are excluded
 *   while healthy providers remain included.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { ConsolePlugin, ConsoleCapability, ConsoleSession, ConsoleSessionStatus, ConsoleTransport } from "../../src/integrations/console/types";
import type { IntegrationConfig, HealthStatus } from "../../src/integrations/types";
import type { LoggerService } from "../../src/services/LoggerService";

type ProviderHealthState = "healthy" | "throws" | "timeouts";

function makeLogger(): LoggerService {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerService;
}

function makeMockConsolePlugin(
  name: string,
  healthState: ProviderHealthState,
): ConsolePlugin {
  return {
    name,
    type: "information" as const,

    async initialize(_config: IntegrationConfig): Promise<void> {},
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: healthState === "healthy", lastCheck: new Date().toISOString() };
    },
    getConfig(): IntegrationConfig {
      return { enabled: true, name, type: "information", config: {} };
    },
    isInitialized(): boolean {
      return true;
    },

    async getConsoleCapabilities(_nodeId: string): Promise<ConsoleCapability[]> {
      if (healthState === "throws") {
        throw new Error(`Provider '${name}' is unavailable`);
      }
      if (healthState === "timeouts") {
        // Return a promise that never resolves (killed by the 3s timeout)
        return new Promise<ConsoleCapability[]>(() => {});
      }
      // Healthy: return capabilities
      return [{
        transport: "websocket-vnc" as ConsoleTransport,
        displayName: `${name} VNC Console`,
        connectionSchema: {},
      }];
    },

    async createSession(_nodeId: string, _userId: string): Promise<ConsoleSession> {
      return {
        sessionId: "mock-session",
        token: "mock-token",
        wsUrl: "/ws/console/vnc",
        transport: "websocket-vnc",
        state: "active",
        startedAt: new Date().toISOString(),
        nodeId: "node-1",
        userId: "user-1",
        provider: name,
      };
    },

    async terminateSession(_sessionId: string): Promise<boolean> {
      return true;
    },

    async getSessionStatus(_sessionId: string): Promise<ConsoleSessionStatus> {
      return { state: "active", startedAt: new Date().toISOString() };
    },

    getSupportedTransports(): ConsoleTransport[] {
      return ["websocket-vnc"];
    },
  };
}

/** Arbitrary for a valid provider name (lowercase alpha, no duplicates handled externally) */
const providerNameArb = fc.stringMatching(/^[a-z]{2,12}$/);

/** Arbitrary for provider health state (throws only — timeouts tested separately) */
const unhealthyStateArb = fc.constant<ProviderHealthState>("throws");

/**
 * Arbitrary for a list of providers with random health states.
 * Uses only "healthy" and "throws" to avoid real 3s waits per timeout provider.
 */
const providerListArb = fc
  .array(
    fc.tuple(providerNameArb, fc.constantFrom<ProviderHealthState>("healthy", "throws")),
    { minLength: 1, maxLength: 6 },
  )
  .map((entries) => {
    const seen = new Set<string>();
    return entries.filter(([name]) => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  })
  .filter((entries) => entries.length >= 1);

describe("Feature: console-integration, Property 15: Unhealthy provider exclusion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only healthy providers appear in availability response; throwing providers are excluded", () => {
    return fc.assert(
      fc.asyncProperty(
        providerListArb,
        async (providers) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          for (const [name, healthState] of providers) {
            const plugin = makeMockConsolePlugin(name, healthState);
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const resultPromise = manager.getConsoleAvailability("test-node");
          // Advance timers to resolve any pending timeouts
          await vi.advanceTimersByTimeAsync(0);
          const result = await resultPromise;

          // Determine expected healthy providers
          const healthyProviders = providers
            .filter(([, state]) => state === "healthy")
            .map(([name]) => name)
            .sort();

          // Result should contain exactly the healthy providers
          const resultProviders = result.map((entry) => entry.provider).sort();
          expect(resultProviders).toEqual(healthyProviders);

          // Each entry from a healthy provider should have correct structure
          for (const entry of result) {
            expect(entry.provider).toBeTruthy();
            expect(entry.transport).toBe("websocket-vnc");
            expect(entry.displayName).toContain("VNC Console");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when all providers are unhealthy (throwing), availability returns empty array", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(providerNameArb, { minLength: 1, maxLength: 5 })
          .map((names) => [...new Set(names)])
          .filter((names) => names.length >= 1),
        async (names) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          for (const name of names) {
            const plugin = makeMockConsolePlugin(name, "throws");
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const resultPromise = manager.getConsoleAvailability("test-node");
          await vi.advanceTimersByTimeAsync(0);
          const result = await resultPromise;

          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when all providers are healthy, all appear in availability response", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(providerNameArb, { minLength: 1, maxLength: 6 })
          .map((names) => [...new Set(names)])
          .filter((names) => names.length >= 1),
        async (names) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          for (const name of names) {
            const plugin = makeMockConsolePlugin(name, "healthy");
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const resultPromise = manager.getConsoleAvailability("test-node");
          await vi.advanceTimersByTimeAsync(0);
          const result = await resultPromise;

          const resultProviders = result.map((e) => e.provider).sort();
          const expectedProviders = [...names].sort();
          expect(resultProviders).toEqual(expectedProviders);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("healthy providers are included regardless of other providers' health states", () => {
    return fc.assert(
      fc.asyncProperty(
        providerListArb.filter((providers) => {
          const hasHealthy = providers.some(([, s]) => s === "healthy");
          const hasUnhealthy = providers.some(([, s]) => s !== "healthy");
          return hasHealthy && hasUnhealthy;
        }),
        async (providers) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          for (const [name, healthState] of providers) {
            const plugin = makeMockConsolePlugin(name, healthState);
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const resultPromise = manager.getConsoleAvailability("test-node");
          await vi.advanceTimersByTimeAsync(0);
          const result = await resultPromise;

          const resultProviderSet = new Set(result.map((e) => e.provider));

          // Every healthy provider must appear
          for (const [name, state] of providers) {
            if (state === "healthy") {
              expect(resultProviderSet.has(name)).toBe(true);
            }
          }

          // No unhealthy provider should appear
          for (const [name, state] of providers) {
            if (state !== "healthy") {
              expect(resultProviderSet.has(name)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("timeout providers are excluded after the 3s deadline elapses", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(providerNameArb, { minLength: 1, maxLength: 3 })
          .map((names) => [...new Set(names)])
          .filter((names) => names.length >= 1),
        async (names) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          // Register one healthy provider and all generated names as timeout providers
          const healthyName = "healthyprovider";
          const healthyPlugin = makeMockConsolePlugin(healthyName, "healthy");
          manager.registerPlugin(healthyPlugin, {
            enabled: true,
            name: healthyName,
            type: "information",
            config: {},
          });

          for (const name of names) {
            // Skip if name collides with the healthy provider name
            if (name === healthyName) continue;
            const plugin = makeMockConsolePlugin(name, "timeouts");
            manager.registerPlugin(plugin, {
              enabled: true,
              name,
              type: "information",
              config: {},
            });
          }

          const resultPromise = manager.getConsoleAvailability("test-node");
          // Advance past the 3s timeout
          await vi.advanceTimersByTimeAsync(3100);
          const result = await resultPromise;

          // Only the healthy provider should appear
          const resultProviderSet = new Set(result.map((e) => e.provider));
          expect(resultProviderSet.has(healthyName)).toBe(true);

          // Timeout providers should be excluded
          for (const name of names) {
            if (name !== healthyName) {
              expect(resultProviderSet.has(name)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
