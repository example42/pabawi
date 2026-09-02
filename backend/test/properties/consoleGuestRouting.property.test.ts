/**
 * Property-Based Tests for Guest Type Routing Correctness
 *
 * Feature: console-integration, Property 12: Guest type routing correctness
 *
 * **Validates: Requirements 9.4**
 *
 * Property 12: Guest type routing correctness
 * ∀ guestType ∈ {qemu, lxc}, node ∈ alphabetic strings, vmid ∈ positive integers:
 *   When createSession is called, the provider SHALL POST to
 *   `/api2/json/nodes/{node}/{guestType}/{vmid}/vncproxy`.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

import { ProxmoxConsoleProvider } from "../../src/integrations/proxmox/ProxmoxConsoleProvider";
import type { ProxmoxClient } from "../../src/integrations/proxmox/ProxmoxClient";
import type { ProxmoxConfig } from "../../src/integrations/proxmox/types";
import type { LoggerService } from "../../src/services/LoggerService";

function makeLogger(): LoggerService {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerService;
}

function makeProxmoxConfig(): ProxmoxConfig {
  return {
    host: "proxmox.example.com",
    port: 8006,
  };
}

/**
 * Create a mock ProxmoxClient that:
 * - Returns a guest resource with the specified type from cluster/resources
 * - Returns running status from the status endpoint
 * - Returns a VNC ticket from the vncproxy endpoint
 * - Tracks calls to `post` for assertion
 */
function makeMockClient(
  node: string,
  vmid: number,
  guestType: "qemu" | "lxc",
): { client: ProxmoxClient; postSpy: ReturnType<typeof vi.fn> } {
  const postSpy = vi.fn().mockResolvedValue({
    ticket: "PVEVNC:test-ticket", // pragma: allowlist secret
    port: "5900",
  });

  const getSpy = vi.fn().mockImplementation((endpoint: string) => {
    if (endpoint.includes("/cluster/resources")) {
      return Promise.resolve([
        { node, vmid, name: `guest-${String(vmid)}`, type: guestType, status: "running" },
      ]);
    }
    if (endpoint.includes("/status/current")) {
      return Promise.resolve({ status: "running" });
    }
    return Promise.resolve({});
  });

  const client = {
    get: getSpy,
    post: postSpy,
  } as unknown as ProxmoxClient;

  return { client, postSpy };
}

describe("Feature: console-integration, Property 12: Guest type routing correctness", () => {
  it("routes QEMU guests to /qemu/{vmid}/vncproxy endpoint", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz") }),
        fc.integer({ min: 100, max: 99999 }),
        async (node, vmid) => {
          const { client, postSpy } = makeMockClient(node, vmid, "qemu");
          const provider = new ProxmoxConsoleProvider(client, makeProxmoxConfig(), makeLogger());

          const nodeId = `proxmox:${node}:${String(vmid)}`;
          await provider.createSession(nodeId, "user-1");

          expect(postSpy).toHaveBeenCalledOnce();
          const calledEndpoint = postSpy.mock.calls[0][0] as string;
          expect(calledEndpoint).toBe(
            `/api2/json/nodes/${node}/qemu/${String(vmid)}/vncproxy`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("routes LXC guests to /lxc/{vmid}/vncproxy endpoint", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz") }),
        fc.integer({ min: 100, max: 99999 }),
        async (node, vmid) => {
          const { client, postSpy } = makeMockClient(node, vmid, "lxc");
          const provider = new ProxmoxConsoleProvider(client, makeProxmoxConfig(), makeLogger());

          const nodeId = `proxmox:${node}:${String(vmid)}`;
          await provider.createSession(nodeId, "user-1");

          expect(postSpy).toHaveBeenCalledOnce();
          const calledEndpoint = postSpy.mock.calls[0][0] as string;
          expect(calledEndpoint).toBe(
            `/api2/json/nodes/${node}/lxc/${String(vmid)}/vncproxy`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("uses the correct guest type path segment for any random guest type", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.constantFrom("qemu" as const, "lxc" as const),
        fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz") }),
        fc.integer({ min: 100, max: 99999 }),
        async (guestType, node, vmid) => {
          const { client, postSpy } = makeMockClient(node, vmid, guestType);
          const provider = new ProxmoxConsoleProvider(client, makeProxmoxConfig(), makeLogger());

          const nodeId = `proxmox:${node}:${String(vmid)}`;
          await provider.createSession(nodeId, "user-1");

          expect(postSpy).toHaveBeenCalledOnce();
          const calledEndpoint = postSpy.mock.calls[0][0] as string;

          // The endpoint must contain the guest type as a path segment
          expect(calledEndpoint).toContain(`/${guestType}/`);
          expect(calledEndpoint).toBe(
            `/api2/json/nodes/${node}/${guestType}/${String(vmid)}/vncproxy`,
          );

          // Verify it does NOT contain the other type
          const otherType = guestType === "qemu" ? "lxc" : "qemu";
          expect(calledEndpoint).not.toContain(`/${otherType}/`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
