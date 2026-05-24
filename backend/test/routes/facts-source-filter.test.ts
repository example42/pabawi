import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { createFactsRouter } from "../../src/routes/facts";
import { requestIdMiddleware } from "../../src/middleware/errorHandler";
import { expertModeMiddleware } from "../../src/middleware/expertMode";
import type {
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
} from "../../src/integrations/types";
import type { Facts, Node, NodeGroup } from "../../src/integrations/bolt/types";

/**
 * Minimal in-memory information-source plugin used to exercise the facts
 * route's source selection logic without touching real integrations.
 *
 * Captures every getNodeFacts call so the test can verify which sources
 * were queried for a given request.
 */
class FakeInformationSource implements InformationSourcePlugin {
  type = "information" as const;
  public getNodeFactsCalls: string[] = [];
  private initialized = true;

  constructor(
    public name: string,
    private factsByNode: Record<string, Record<string, unknown>> = {},
  ) {}

  initialize(_config: IntegrationConfig): Promise<void> {
    return Promise.resolve();
  }

  healthCheck(): Promise<HealthStatus> {
    return Promise.resolve({
      healthy: true,
      message: "ok",
      lastCheck: new Date().toISOString(),
    });
  }

  getConfig(): IntegrationConfig {
    return { enabled: true, name: this.name, type: "information", config: {} };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInventory(): Promise<Node[]> {
    return Promise.resolve([]);
  }

  getGroups(): Promise<NodeGroup[]> {
    return Promise.resolve([]);
  }

  getNodeFacts(nodeId: string): Promise<Facts> {
    this.getNodeFactsCalls.push(nodeId);
    const facts = this.factsByNode[nodeId] ?? {};
    return Promise.resolve({
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: this.name,
      facts: facts as Facts["facts"],
    });
  }

  getNodeData(_nodeId: string, _dataType: string): Promise<unknown> {
    return Promise.resolve(null);
  }
}

function buildApp(...plugins: InformationSourcePlugin[]): {
  app: Express;
  manager: IntegrationManager;
} {
  const manager = new IntegrationManager();
  for (const plugin of plugins) {
    manager.registerPlugin(plugin, plugin.getConfig());
  }

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(expertModeMiddleware);
  app.use("/api/nodes", createFactsRouter(manager));

  return { app, manager };
}

describe("GET /api/nodes/:id/facts source selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips active fact sources (bolt/ssh/ansible) when no ?source query is provided", async () => {
    const bolt = new FakeInformationSource("bolt", { node1: { os: "linux" } });
    const ssh = new FakeInformationSource("ssh", { node1: { os: "linux" } });
    const ansible = new FakeInformationSource("ansible", { node1: { os: "linux" } });
    const puppetdb = new FakeInformationSource("puppetdb", {
      node1: { os: "linux", kernel: "6.1" },
    });

    const { app } = buildApp(bolt, ssh, ansible, puppetdb);

    const response = await request(app).get("/api/nodes/node1/facts").expect(200);

    expect(Object.keys(response.body.sources as Record<string, unknown>)).toEqual([
      "puppetdb",
    ]);
    expect(bolt.getNodeFactsCalls).toEqual([]);
    expect(ssh.getNodeFactsCalls).toEqual([]);
    expect(ansible.getNodeFactsCalls).toEqual([]);
    expect(puppetdb.getNodeFactsCalls).toEqual(["node1"]);
  });

  it("queries only the named source when ?source= is provided, including active sources", async () => {
    const bolt = new FakeInformationSource("bolt", { node1: { os: "linux" } });
    const puppetdb = new FakeInformationSource("puppetdb", { node1: { os: "linux" } });
    const proxmox = new FakeInformationSource("proxmox", {
      node1: { cpu: 4, memory: "8 GB" },
    });

    const { app } = buildApp(bolt, puppetdb, proxmox);

    const response = await request(app)
      .get("/api/nodes/node1/facts?source=bolt")
      .expect(200);

    expect(Object.keys(response.body.sources as Record<string, unknown>)).toEqual([
      "bolt",
    ]);
    expect(bolt.getNodeFactsCalls).toEqual(["node1"]);
    expect(puppetdb.getNodeFactsCalls).toEqual([]);
    expect(proxmox.getNodeFactsCalls).toEqual([]);
  });

  it("returns 404 with UNKNOWN_SOURCE when ?source= names an unregistered integration", async () => {
    const puppetdb = new FakeInformationSource("puppetdb");
    const { app } = buildApp(puppetdb);

    const response = await request(app)
      .get("/api/nodes/node1/facts?source=does-not-exist")
      .expect(404);

    expect(response.body.error?.code).toBe("UNKNOWN_SOURCE");
    expect(puppetdb.getNodeFactsCalls).toEqual([]);
  });

  it("returns each source's facts under its own key without the auto fan-out filter when scoped", async () => {
    const ssh = new FakeInformationSource("ssh", {
      "host.example": { uptime: "1d" },
    });

    const { app } = buildApp(ssh);

    const response = await request(app)
      .get("/api/nodes/host.example/facts?source=ssh")
      .expect(200);

    const sources = response.body.sources as Record<
      string,
      { facts: Record<string, unknown>; timestamp: string }
    >;

    expect(sources.ssh.facts).toEqual({ uptime: "1d" });
    expect(typeof sources.ssh.timestamp).toBe("string");
    expect(ssh.getNodeFactsCalls).toEqual(["host.example"]);
  });
});
