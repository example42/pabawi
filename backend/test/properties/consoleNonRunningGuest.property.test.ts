/**
 * Property-Based Tests for Non-Running Guest Rejection
 *
 * Feature: console-integration, Property 13: Non-running guest rejection
 *
 * **Validates: Requirements 9.6**
 *
 * Property 13: Non-running guest rejection
 * ∀ Proxmox guest not in the "running" state:
 *   console session creation SHALL fail with an error message indicating
 *   the guest must be running.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

import { ProxmoxConsoleProvider } from "../../src/integrations/proxmox/ProxmoxConsoleProvider";
import type { ProxmoxClient } from "../../src/integrations/proxmox/ProxmoxClient";
import type { ProxmoxConfig } from "../../src/integrations/proxmox/types";
import type { LoggerService } from "../../src/services/LoggerService";

// ============================================================
// Constants
// ============================================================

/** Proxmox guest states from the API vocabulary */
const PROXMOX_STATES = [
  "running",
  "stopped",
  "paused",
  "suspended",
  "shutdown",
  "prelaunch",
  "postmigrate",
] as const;

const NON_RUNNING_STATES = PROXMOX_STATES.filter((s) => s !== "running");

const GUEST_TYPES = ["qemu", "lxc"] as const;

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

function createMockProxmoxClient(
  guestType: "qemu" | "lxc",
  node: string,
  vmid: number,
  status: string,
): ProxmoxClient {
  return {
    get: vi.fn().mockImplementation((endpoint: string) => {
      if (endpoint.includes("/cluster/resources")) {
        return Promise.resolve([
          { node, vmid, type: guestType, name: `guest-${String(vmid)}`, status },
        ]);
      }
      if (endpoint.includes("/status/current")) {
        return Promise.resolve({ status });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({ ticket: "PVEVNC:test", port: "5900" }),
    authenticate: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(""),
    waitForTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProxmoxClient;
}

const defaultProxmoxConfig: ProxmoxConfig = {
  host: "proxmox.test.local",
  port: 8006,
};

// ============================================================
// Arbitraries
// ============================================================

/** Random non-running guest state */
const nonRunningStateArb = fc.constantFrom(...NON_RUNNING_STATES);

/** Random guest type */
const guestTypeArb = fc.constantFrom<"qemu" | "lxc">(...GUEST_TYPES);

/** Random node name: lowercase alpha 3-12 chars */
const nodeNameArb = fc.stringMatching(/^[a-z]{3,12}$/);

/** Random VMID: positive integer in typical Proxmox range */
const vmidArb = fc.integer({ min: 100, max: 99999 });

/** Random user ID */
const userIdArb = fc.stringMatching(/^[a-z0-9-]{3,20}$/);

/** Any Proxmox state (including running) */
const anyStateArb = fc.constantFrom(...PROXMOX_STATES);

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 13: Non-running guest rejection", () => {
  it("session creation fails with 'Guest must be running' for any non-running state", () => {
    return fc.assert(
      fc.asyncProperty(
        nonRunningStateArb,
        guestTypeArb,
        nodeNameArb,
        vmidArb,
        userIdArb,
        async (state, guestType, node, vmid, userId) => {
          const logger = createMockLogger();
          const client = createMockProxmoxClient(guestType, node, vmid, state);
          const provider = new ProxmoxConsoleProvider(client, defaultProxmoxConfig, logger);

          const nodeId = `proxmox:${node}:${String(vmid)}`;

          await expect(
            provider.createSession(nodeId, userId),
          ).rejects.toThrow("Guest must be running for console access");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("session creation does NOT throw for running state", () => {
    return fc.assert(
      fc.asyncProperty(
        guestTypeArb,
        nodeNameArb,
        vmidArb,
        userIdArb,
        async (guestType, node, vmid, userId) => {
          const logger = createMockLogger();
          const client = createMockProxmoxClient(guestType, node, vmid, "running");
          const provider = new ProxmoxConsoleProvider(client, defaultProxmoxConfig, logger);

          const nodeId = `proxmox:${node}:${String(vmid)}`;

          // Should not throw — session creation proceeds past the running check
          const session = await provider.createSession(nodeId, userId);
          expect(session).toBeDefined();
          expect(session.sessionId).toBeDefined();
          expect(session.transport).toBe("websocket-vnc");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("non-running rejection applies regardless of guest type", () => {
    return fc.assert(
      fc.asyncProperty(
        nonRunningStateArb,
        guestTypeArb,
        vmidArb,
        async (state, guestType, vmid) => {
          const logger = createMockLogger();
          const node = "testnode";
          const client = createMockProxmoxClient(guestType, node, vmid, state);
          const provider = new ProxmoxConsoleProvider(client, defaultProxmoxConfig, logger);

          const nodeId = `proxmox:${node}:${String(vmid)}`;

          try {
            await provider.createSession(nodeId, "user-1");
            // If we get here, the test fails — non-running should always throw
            expect.fail("Expected createSession to throw for non-running guest");
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
              "Guest must be running for console access",
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("only 'running' state permits session creation among all Proxmox states", () => {
    return fc.assert(
      fc.asyncProperty(
        anyStateArb,
        guestTypeArb,
        nodeNameArb,
        vmidArb,
        userIdArb,
        async (state, guestType, node, vmid, userId) => {
          const logger = createMockLogger();
          const client = createMockProxmoxClient(guestType, node, vmid, state);
          const provider = new ProxmoxConsoleProvider(client, defaultProxmoxConfig, logger);

          const nodeId = `proxmox:${node}:${String(vmid)}`;

          if (state === "running") {
            // Should succeed
            const session = await provider.createSession(nodeId, userId);
            expect(session).toBeDefined();
          } else {
            // Should fail with the expected message
            await expect(
              provider.createSession(nodeId, userId),
            ).rejects.toThrow("Guest must be running for console access");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
