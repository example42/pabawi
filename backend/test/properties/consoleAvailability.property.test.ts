/**
 * Property-Based Tests for Console Availability Response Structure and Ordering
 *
 * Feature: console-integration, Property 10: Availability response structure and ordering
 *
 * **Validates: Requirements 3.3, 3.4**
 *
 * Property 10: Availability response structure and ordering
 * ∀ console availability query returning multiple providers:
 *   each entry SHALL contain provider name, transport type, and display label,
 *   and entries SHALL be sorted by provider name in ascending alphabetical order.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { ConsolePlugin, ConsoleCapability, ConsoleTransport } from "../../src/integrations/console/types";
import type { IntegrationConfig, HealthStatus } from "../../src/integrations/types";
import type { LoggerService } from "../../src/services/LoggerService";

// ============================================================
// Constants
// ============================================================

const TRANSPORTS: ConsoleTransport[] = ["websocket-vnc", "websocket-terminal"];

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

function createMockConsolePlugin(
  name: string,
  transport: ConsoleTransport,
  displayName: string,
): ConsolePlugin {
  return {
    name,
    type: "information" as const,
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "ok", lastCheck: new Date().toISOString() } satisfies HealthStatus),
    getConfig: vi.fn().mockReturnValue({ enabled: true } as unknown as IntegrationConfig),
    isInitialized: vi.fn().mockReturnValue(true),
    getConsoleCapabilities: vi.fn().mockResolvedValue([
      { transport, displayName, connectionSchema: {} } satisfies ConsoleCapability,
    ]),
    createSession: vi.fn().mockResolvedValue({}),
    terminateSession: vi.fn().mockResolvedValue(true),
    getSessionStatus: vi.fn().mockResolvedValue({ state: "active", startedAt: new Date().toISOString() }),
    getSupportedTransports: vi.fn().mockReturnValue([transport]),
  };
}

// ============================================================
// Arbitraries
// ============================================================

/** Unique provider names: 2-6 alphabetically random strings */
const providerNamesArb = fc
  .uniqueArray(fc.stringMatching(/^[a-z]{3,12}$/), { minLength: 2, maxLength: 6 })
  .filter((arr) => arr.length >= 2);

/** Random transport type */
const transportArb = fc.constantFrom<ConsoleTransport>(...TRANSPORTS);

/** Random display name (1-100 chars, printable) */
const displayNameArb = fc.stringMatching(/^[A-Za-z0-9 _-]{1,50}$/).filter((s) => s.length >= 1);

/** A provider definition: name + transport + displayName */
const providerDefArb = fc.record({
  transport: transportArb,
  displayName: displayNameArb,
});

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 10: Availability response structure and ordering", () => {
  it("availability response entries contain provider, transport, and displayName, sorted by provider name ascending", () => {
    return fc.assert(
      fc.asyncProperty(
        providerNamesArb,
        fc.array(providerDefArb, { minLength: 6, maxLength: 6 }),
        async (names, defs) => {
          const logger = createMockLogger();
          const manager = new IntegrationManager({ logger });

          // Register mock console plugins — one per unique name
          for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const def = defs[i % defs.length];
            const plugin = createMockConsolePlugin(name, def.transport, def.displayName);

            manager.registerPlugin(plugin, { enabled: true } as unknown as IntegrationConfig);
          }

          const result = await manager.getConsoleAvailability("test-node-123");

          // Each entry must have provider, transport, and displayName
          for (const entry of result) {
            expect(entry).toHaveProperty("provider");
            expect(entry).toHaveProperty("transport");
            expect(entry).toHaveProperty("displayName");

            expect(typeof entry.provider).toBe("string");
            expect(entry.provider.length).toBeGreaterThan(0);
            expect(TRANSPORTS).toContain(entry.transport);
            expect(typeof entry.displayName).toBe("string");
            expect(entry.displayName.length).toBeGreaterThan(0);
            expect(entry.displayName.length).toBeLessThanOrEqual(100);
          }

          // Entries must be sorted by provider name ascending (alphabetical)
          for (let i = 1; i < result.length; i++) {
            expect(
              result[i - 1].provider.localeCompare(result[i].provider),
            ).toBeLessThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("response length matches number of registered providers that return capabilities", () => {
    return fc.assert(
      fc.asyncProperty(
        providerNamesArb,
        fc.array(providerDefArb, { minLength: 6, maxLength: 6 }),
        async (names, defs) => {
          const logger = createMockLogger();
          const manager = new IntegrationManager({ logger });

          for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const def = defs[i % defs.length];
            const plugin = createMockConsolePlugin(name, def.transport, def.displayName);

            manager.registerPlugin(plugin, { enabled: true } as unknown as IntegrationConfig);
          }

          const result = await manager.getConsoleAvailability("test-node-456");

          // Each provider returns exactly one capability in our mock,
          // so result length should equal the number of providers registered
          expect(result.length).toBe(names.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
