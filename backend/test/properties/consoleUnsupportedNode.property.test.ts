/**
 * Property-Based Tests for Unsupported Node Empty Availability
 *
 * Feature: console-integration, Property 11: Unsupported node returns empty availability
 *
 * **Validates: Requirements 3.2**
 *
 * Property 11: Unsupported node returns empty availability
 * ∀ nodeId ∈ arbitrary strings, providers ∈ [0..5]:
 *   When no registered provider supports console access for the given nodeId
 *   (all return empty capabilities), getConsoleAvailability returns [].
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { ConsolePlugin, ConsoleCapability, ConsoleSession, ConsoleSessionStatus, ConsoleTransport } from "../../src/integrations/console/types";
import type { IntegrationConfig, HealthStatus } from "../../src/integrations/types";
import type { LoggerService } from "../../src/services/LoggerService";

function makeLogger(): LoggerService {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerService;
}

/**
 * Create a mock ConsolePlugin that returns empty capabilities for any node.
 * This simulates a provider that does not support the queried node.
 */
function makeUnsupportingProvider(name: string): ConsolePlugin {
  return {
    name,
    type: "information" as const,
    initialize: async () => {},
    healthCheck: async (): Promise<HealthStatus> => ({
      healthy: true,
      message: "OK",
      lastCheck: new Date().toISOString(),
    }),
    getConfig: (): IntegrationConfig => ({
      name,
      enabled: true,
      priority: 5,
    }),
    isInitialized: () => true,
    getConsoleCapabilities: async (): Promise<ConsoleCapability[]> => [],
    createSession: async (): Promise<ConsoleSession> => {
      throw new Error("No console capability for this node");
    },
    terminateSession: async (): Promise<boolean> => false,
    getSessionStatus: async (): Promise<ConsoleSessionStatus> => ({
      state: "terminated",
      startedAt: new Date().toISOString(),
    }),
    getSupportedTransports: (): ConsoleTransport[] => ["websocket-vnc"],
  };
}

describe("Feature: console-integration, Property 11: Unsupported node returns empty availability", () => {
  it("returns empty array when no providers are registered", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (nodeId) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          const result = await manager.getConsoleAvailability(nodeId);

          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns empty array when all registered providers return empty capabilities", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 5 }),
        async (nodeId, providerCount) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          // Register N providers that all return empty capabilities
          for (let i = 0; i < providerCount; i++) {
            const provider = makeUnsupportingProvider(`provider-${String(i)}`);
            manager.registerPlugin(provider, {
              name: `provider-${String(i)}`,
              enabled: true,
              priority: 5,
            });
          }

          const result = await manager.getConsoleAvailability(nodeId);

          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns empty array for varied node ID formats when providers do not support them", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // UUID-like IDs
          fc.uuid(),
          // Numeric IDs
          fc.integer({ min: 1, max: 99999 }).map(String),
          // Prefixed IDs (proxmox-style)
          fc.tuple(
            fc.constantFrom("proxmox", "aws", "azure", "ssh", "bolt"),
            fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          ).map(([prefix, suffix]) => `${prefix}:${suffix}`),
          // Hostname-style IDs
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789") }),
            fc.constantFrom(".local", ".internal", ".example.com", ""),
          ).map(([host, domain]) => `${host}${domain}`),
          // Arbitrary non-empty strings
          fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        ),
        fc.integer({ min: 1, max: 5 }),
        async (nodeId, providerCount) => {
          const manager = new IntegrationManager({ logger: makeLogger() });

          for (let i = 0; i < providerCount; i++) {
            const provider = makeUnsupportingProvider(`provider-${String(i)}`);
            manager.registerPlugin(provider, {
              name: `provider-${String(i)}`,
              enabled: true,
              priority: 5,
            });
          }

          const result = await manager.getConsoleAvailability(nodeId);

          expect(result).toEqual([]);
          expect(Array.isArray(result)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
