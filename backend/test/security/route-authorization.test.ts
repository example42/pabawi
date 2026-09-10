import type { PuppetRunHistoryService } from "../../src/services/PuppetRunHistoryService";
import { createAuthRouter } from "../../src/routes/auth";
import { mountInfrastructureRoutes } from "../../src/routes/mountInfrastructureRoutes";
import { createInventoryRouter } from "../../src/routes/inventory";
import { createSourceAuthorization } from "../../src/middleware/sourceAuthorization";
import type { InformationSourcePlugin } from "../../src/integrations/types";
import type { BoltService } from "../../src/integrations/bolt/BoltService";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createHttpHarness, type HttpHarness } from "../helpers/httpHarness";
import { DatabaseService } from "../../src/database/DatabaseService";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { createAuthMiddleware } from "../../src/middleware/authMiddleware";
import { createRbacMiddleware } from "../../src/middleware/rbacMiddleware";
import type { PermissionMiddlewareFactory } from "../../src/middleware/routeAuthorization";
import { asyncHandler } from "../../src/routes/asyncHandler";
import { createDefaultContainer } from "../../src/container/DIContainer";
import { BoltCommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import type { BatchExecutionService } from "../../src/services/BatchExecutionService";
import type { AWSPlugin } from "../../src/integrations/aws/AWSPlugin";
import type { AzurePlugin } from "../../src/integrations/azure/AzurePlugin";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { ExecutionRepository } from "../../src/database/ExecutionRepository";
import type { StreamingExecutionManager } from "../../src/services/StreamingExecutionManager";
import type { PuppetserverService } from "../../src/integrations/puppetserver/PuppetserverService";

/**
 * Authorization regression matrix for finding S01 (infrastructure routes
 * mounted with authentication but no authorization).
 *
 * The app under test is assembled from the same route factories, the same real
 * `authMiddleware` / `rbacMiddleware`, and the same migrated schema as
 * `server.ts`; only the providers behind each router are mocked. Every case
 * asserts both the HTTP status AND that the provider was never reached, so a
 * gate that runs after dispatch would still fail here.
 *
 * Production and tests both call `mountInfrastructureRoutes`; the mount order
 * and authorization boundaries cannot drift between separate assemblies.
 */

const JWT_SECRET = "route-authorization-test-secret-32-chars"; // pragma: allowlist secret

/** Built-in roles seeded by migrations 002 / 007 / 013 / 019 / 020. */
const ROLE_IDS = {
  viewer: "role-viewer-001",
  operator: "role-operator-001",
  provisioner: "role-provisioner-001",
  admin: "role-admin-001",
} as const;

type Principal = "awsOnly" | "boltOnly" | "anonymous" | "noRole" | "viewer" | "operator" | "provisioner" | "admin";

const ALL_PRINCIPALS: Principal[] = [
  "anonymous",
  "noRole",
  "viewer",
  "operator",
  "provisioner",
  "admin",
];

interface Spies {
  awsInventory: ReturnType<typeof vi.fn>;
  awsAction: ReturnType<typeof vi.fn>;
  azureInventory: ReturnType<typeof vi.fn>;
  azureAction: ReturnType<typeof vi.fn>;
  proxmoxNodes: ReturnType<typeof vi.fn>;
  proxmoxAction: ReturnType<typeof vi.fn>;
  proxmoxProvisionVm: ReturnType<typeof vi.fn>;
  proxmoxDestroy: ReturnType<typeof vi.fn>;
  puppetserverNodes: ReturnType<typeof vi.fn>;
  puppetserverDeploy: ReturnType<typeof vi.fn>;
  puppetserverFlush: ReturnType<typeof vi.fn>;
  hieraKeys: ReturnType<typeof vi.fn>;
  hieraReload: ReturnType<typeof vi.fn>;
  executionsFindAll: ReturnType<typeof vi.fn>;
  executionsFindById: ReturnType<typeof vi.fn>;
}

let harness: HttpHarness;
let databaseService: DatabaseService;
let app: Express;
let spies: Spies;
const restrictedInventory = vi.fn().mockResolvedValue([{ id: "private", name: "private", uri: "ssh://private", transport: "ssh" }]);
const restrictedFacts = vi.fn().mockResolvedValue({ secret: "restricted-canary" });
const createReExecution = vi.fn().mockResolvedValue("new-exec");
const updateExecution = vi.fn().mockResolvedValue(undefined);
const cancelBatch = vi.fn().mockResolvedValue({ cancelledCount: 1 });
const createBatch = vi.fn().mockResolvedValue({ batchId: "batch-1", executionIds: [], targetCount: 0, expandedNodeIds: [] });
const tokens = new Map<Principal, string>();

function makeSpies(): Spies {
  return {
    awsInventory: vi.fn().mockResolvedValue([]),
    awsAction: vi.fn().mockResolvedValue({ status: "success", results: [] }),
    azureInventory: vi.fn().mockResolvedValue([]),
    azureAction: vi.fn().mockResolvedValue({ status: "success", results: [] }),
    proxmoxNodes: vi.fn().mockResolvedValue([]),
    proxmoxAction: vi.fn().mockResolvedValue({ status: "success" }),
    proxmoxProvisionVm: vi.fn().mockResolvedValue({ status: "success" }),
    proxmoxDestroy: vi.fn().mockResolvedValue({ status: "success" }),
    puppetserverNodes: vi.fn().mockResolvedValue([]),
    puppetserverDeploy: vi.fn().mockResolvedValue({ status: "success" }),
    puppetserverFlush: vi.fn().mockResolvedValue({ status: "success" }),
    hieraKeys: vi.fn().mockResolvedValue([]),
    hieraReload: vi.fn().mockResolvedValue(undefined),
    executionsFindAll: vi.fn().mockResolvedValue([]),
    executionsFindById: vi.fn().mockResolvedValue(null),
  };
}

beforeAll(async () => {
  harness = await createHttpHarness();

  process.env.JWT_SECRET = JWT_SECRET;
  databaseService = new DatabaseService(":memory:");
  await databaseService.initialize();

  const db = databaseService.getAdapter();
  const authService = new AuthenticationService(db, JWT_SECRET);
  const userService = new UserService(db, authService);

  // One user per principal, holding exactly one built-in role (or none).
  for (const principal of ALL_PRINCIPALS) {
    if (principal === "anonymous") continue;
    const user = await userService.createUser({
      username: `s01_${principal}`,
      email: `s01_${principal}@test.local`,
      password: "RouteAuthzPass123!",
      firstName: "S01",
      lastName: principal,
      isAdmin: false,
    });
    // New users receive the configured default role (Viewer); strip it so each
    // principal holds exactly the role under test, including none at all.
    await db.execute("DELETE FROM user_roles WHERE user_id = ?", [user.id]);
    if (principal !== "noRole" && principal !== "boltOnly" && principal !== "awsOnly") {
      await userService.assignRoleToUser(user.id, ROLE_IDS[principal]);
    }
    tokens.set(principal, await authService.generateToken(user));
  }

  const scoped = await userService.createUser({ username: "bolt_only", email: "bolt_only@test.local", password: "RouteAuthzPass123!", firstName: "Bolt", lastName: "Only", isAdmin: false });
  await db.execute("DELETE FROM user_roles WHERE user_id = ?", [scoped.id]);
  await db.execute("INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at) VALUES ('bolt-only', 'Bolt only', '', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
  await db.execute("INSERT INTO role_permissions (role_id, permission_id, assigned_at) SELECT 'bolt-only', id, CURRENT_TIMESTAMP FROM permissions WHERE (resource = 'bolt' AND \"action\" IN ('read', 'execute')) OR (resource = 'executions' AND \"action\" = 'read')");
  await userService.assignRoleToUser(scoped.id, "bolt-only");
  tokens.set("boltOnly", await authService.generateToken(scoped));
  const awsScoped = await userService.createUser({ username: "aws_only", email: "aws_only@test.local", password: "RouteAuthzPass123!", firstName: "AWS", lastName: "Only", isAdmin: false });
  await db.execute("DELETE FROM user_roles WHERE user_id = ?", [awsScoped.id]);
  await db.execute("INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at) VALUES ('aws-only', 'AWS lifecycle only', '', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
  await db.execute("INSERT INTO role_permissions (role_id, permission_id, assigned_at) SELECT 'aws-only', id, CURRENT_TIMESTAMP FROM permissions WHERE resource = 'aws' AND \"action\" IN ('read', 'lifecycle')");
  await userService.assignRoleToUser(awsScoped.id, "aws-only");
  tokens.set("awsOnly", await authService.generateToken(awsScoped));


  spies = makeSpies();

  const authMiddleware = asyncHandler(createAuthMiddleware(db, JWT_SECRET));
  const rawRbac = createRbacMiddleware(db);
  const rbacMiddleware: PermissionMiddlewareFactory = (resource, action) =>
    asyncHandler(rawRbac(resource, action));

  const awsPlugin = {
    getInventory: spies.awsInventory,
    executeAction: spies.awsAction,
  } as unknown as AWSPlugin;

  const azurePlugin = {
    getInventory: spies.azureInventory,
    executeAction: spies.azureAction,
  } as unknown as AzurePlugin;

  const proxmoxIntegration = {
    name: "proxmox",
    getNodes: spies.proxmoxNodes,
    executeAction: spies.proxmoxAction,
    provisionVM: spies.proxmoxProvisionVm,
    deleteVM: spies.proxmoxDestroy,
    getLastHealthCheck: () => ({ healthy: true }),
    listProvisioningCapabilities: () => [],
  };

  const hieraPlugin = {
    name: "hiera",
    isInitialized: () => true,
    getAllKeys: spies.hieraKeys,
    reload: spies.hieraReload,
  };

  const integrationManager = {
    getExecutionTool: (name: string) => name === "proxmox" ? proxmoxIntegration : name === "aws" ? awsPlugin : name === "azure" ? azurePlugin : {},
    getAggregatedInventory: (useCache?: boolean, sources?: string[]) => readManager.getAggregatedInventory(useCache, sources),
    getLinkedInventory: (useCache?: boolean, sources?: string[]) => readManager.getLinkedInventory(useCache, sources),
    getAllInformationSources: () => readManager.getAllInformationSources(),
    getInformationSource: (name: string) => readManager.getInformationSource(name),
    isInitialized: () => true,
    getAllPlugins: () => [{ plugin: hieraPlugin }],
    clearInventoryCache: vi.fn(),
  } as unknown as IntegrationManager;

  const puppetserverService = {
    getNodes: spies.puppetserverNodes,
    deployEnvironment: spies.puppetserverDeploy,
    flushEnvironmentCache: spies.puppetserverFlush,
  } as unknown as PuppetserverService;

  const executionRepository = {
    findAll: spies.executionsFindAll,
    findById: spies.executionsFindById,
    createReExecution,
    update: updateExecution,
    findBatchExecutionTools: vi.fn().mockResolvedValue(["ssh"]),
    countByStatus: vi.fn().mockResolvedValue({}),
  } as unknown as ExecutionRepository;

  const streamingManager = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as StreamingExecutionManager;

  const readManager = new IntegrationManager();
  for (const name of ["bolt", "aws"]) {
    const source = {
      name, type: "information", isInitialized: () => true,
      getInventory: name === "aws" ? restrictedInventory : vi.fn().mockResolvedValue([{ id: "public", name: "public", uri: "ssh://public", transport: "ssh" }]),
      getGroups: vi.fn().mockResolvedValue([]),
      getNodeFacts: name === "aws" ? restrictedFacts : vi.fn().mockResolvedValue({ os: "linux" }),
    } as unknown as InformationSourcePlugin;
    readManager.registerPlugin(source, { name, type: "information", enabled: true, config: {} });
  }
  vi.spyOn(readManager, "isInitialized").mockReturnValue(true);
  await readManager.getAggregatedInventory();
  const authorizeSources = createSourceAuthorization(db, readManager);

  app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(databaseService, createDefaultContainer()));
  const lifecycleContainer = createDefaultContainer();
  lifecycleContainer.register("config", {
    getLifecycleToken: () => tokens.get("boltOnly"),
  } as unknown as ReturnType<typeof lifecycleContainer.resolve<"config">>);
  app.use("/legacy-inventory", authMiddleware, createInventoryRouter({} as BoltService, authorizeSources, rbacMiddleware, readManager, { allowDestructiveActions: true }, lifecycleContainer));
  mountInfrastructureRoutes(app, {
    db, integrationManager, boltService: {} as BoltService,
    executionRepository, streamingManager,
    batchExecutionService: { createBatch, cancelBatch } as unknown as BatchExecutionService,
    puppetserverService,
    puppetRunHistoryService: {} as PuppetRunHistoryService,
    commandWhitelistService: new BoltCommandWhitelistService({ allowAll: true, whitelist: [], matchMode: "exact" }),
    container: createDefaultContainer(),
    config: { provisioning: { allowDestructiveActions: true }, packageTasks: [] },
    authMiddleware, rbacMiddleware,
    rateLimitMiddleware: (_req, _res, next) => { next(); },
  });
});

afterAll(async () => {
  await databaseService.close();
  await harness.close();
});

interface Case {
  name: string;
  method: "get" | "post" | "delete";
  path: string;
  body?: Record<string, unknown>;
  /** Principals that must be authorized; every other principal must be denied. */
  allowed: Principal[];
  /** Spies that must not be called when the request is denied. */
  guarded: (keyof Spies)[];
  /**
   * Exact status expected for an authorized principal. Set it where reaching
   * the handler is itself the assertion (for example a route that only exists
   * behind a second router mounted on the same prefix, where a fall-through
   * failure would surface as 404 rather than an authorization error).
   */
  authorizedStatus?: number;
}

const VIEWERS: Principal[] = ["viewer", "operator", "provisioner", "admin"];

const CASES: Case[] = [
  // --- AWS ---------------------------------------------------------------
  { name: "AWS inventory", method: "get", path: "/api/integrations/aws/inventory", allowed: VIEWERS, guarded: ["awsInventory"] },
  { name: "AWS provision", method: "post", path: "/api/integrations/aws/provision", body: { imageId: "ami-1" }, allowed: ["provisioner", "admin"], guarded: ["awsAction"] },
  { name: "AWS lifecycle stop", method: "post", path: "/api/integrations/aws/lifecycle", body: { instanceId: "i-1", action: "stop" }, allowed: ["operator", "provisioner", "admin"], guarded: ["awsAction"] },
  { name: "AWS lifecycle terminate", method: "post", path: "/api/integrations/aws/lifecycle", body: { instanceId: "i-1", action: "terminate" }, allowed: ["provisioner", "admin"], guarded: ["awsAction"] },

  // --- Azure -------------------------------------------------------------
  { name: "Azure inventory", method: "get", path: "/api/integrations/azure/inventory", allowed: VIEWERS, guarded: ["azureInventory"] },
  { name: "Azure provision", method: "post", path: "/api/integrations/azure/provision", body: { name: "vm1", resourceGroup: "rg", location: "westeurope" }, allowed: ["provisioner", "admin"], guarded: ["azureAction"] },
  { name: "Azure lifecycle start", method: "post", path: "/api/integrations/azure/lifecycle", body: { vmName: "vm1", resourceGroup: "rg", action: "start" }, allowed: ["operator", "provisioner", "admin"], guarded: ["azureAction"] },
  { name: "Azure lifecycle deallocate", method: "post", path: "/api/integrations/azure/lifecycle", body: { vmName: "vm1", resourceGroup: "rg", action: "deallocate" }, allowed: ["provisioner", "admin"], guarded: ["azureAction"] },

  // --- Proxmox -----------------------------------------------------------
  { name: "Proxmox nodes", method: "get", path: "/api/integrations/proxmox/nodes", allowed: VIEWERS, guarded: ["proxmoxNodes"] },
  { name: "Proxmox provision VM", method: "post", path: "/api/integrations/proxmox/provision/vm", body: { node: "pve", vmid: 100, name: "vm" }, allowed: ["provisioner", "admin"], guarded: ["proxmoxProvisionVm"] },
  { name: "Proxmox destroy", method: "delete", path: "/api/integrations/proxmox/provision/100", allowed: ["provisioner", "admin"], guarded: ["proxmoxDestroy"] },
  { name: "Proxmox lifecycle action", method: "post", path: "/api/integrations/proxmox/action", body: { node: "pve", vmid: 100, type: "qemu", action: "start" }, allowed: ["operator", "provisioner", "admin"], guarded: ["proxmoxAction"] },

  // --- Puppetserver ------------------------------------------------------
  { name: "Puppetserver nodes", method: "get", path: "/api/integrations/puppetserver/nodes", allowed: VIEWERS, guarded: ["puppetserverNodes"] },
  { name: "Puppetserver deploy environment", method: "post", path: "/api/integrations/puppetserver/environments/production/deploy", allowed: ["admin"], guarded: ["puppetserverDeploy"] },
  { name: "Puppetserver flush environment cache", method: "delete", path: "/api/integrations/puppetserver/environments/production/cache", allowed: ["admin"], guarded: ["puppetserverFlush"] },

  // --- Hiera -------------------------------------------------------------
  { name: "Hiera keys", method: "get", path: "/api/integrations/hiera/keys", allowed: VIEWERS, guarded: ["hieraKeys"] },
  { name: "Hiera reload", method: "post", path: "/api/integrations/hiera/reload", allowed: ["admin"], guarded: ["hieraReload"] },

  // --- Execution history and streamed output -----------------------------
  { name: "Executions list", method: "get", path: "/api/executions", allowed: VIEWERS, guarded: ["executionsFindAll"] },
  { name: "Execution detail", method: "get", path: "/api/executions/exec-1", allowed: VIEWERS, guarded: ["executionsFindById"] },
  { name: "Execution output", method: "get", path: "/api/executions/exec-1/output", allowed: VIEWERS, guarded: ["executionsFindById"] },
  { name: "Execution stream", method: "get", path: "/api/executions/exec-1/stream", allowed: VIEWERS, guarded: ["executionsFindById"] },
  // Mounted only on the streaming router, which sits behind the executions
  // router on the same /api/executions prefix. Covered here so the fall-through
  // between the two chains stays verified.
  { name: "Execution stream ticket", method: "post", path: "/api/executions/exec-1/stream-ticket", allowed: VIEWERS, guarded: [], authorizedStatus: 200 },
];

function send(c: Case, principal: Principal): request.Test {
  const agent = request(harness.use(app));
  const req = c.method === "get"
    ? agent.get(c.path)
    : c.method === "delete"
      ? agent.delete(c.path)
      : agent.post(c.path);
  const token = tokens.get(principal);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return c.body ? req.send(c.body) : req;
}

describe("S01: deny-by-default authorization on infrastructure routes", () => {
  for (const c of CASES) {
    for (const principal of ALL_PRINCIPALS) {
      const denied = !c.allowed.includes(principal);
      const expectation = principal === "anonymous" ? 401 : denied ? 403 : "authorized";

      it(`${c.name} / ${principal}: ${denied ? `rejected with ${String(expectation)}` : "authorized"}`, async () => {
        for (const key of c.guarded) spies[key].mockClear();

        const response = await send(c, principal);

        if (denied) {
          expect(response.status).toBe(expectation);
          for (const key of c.guarded) {
            expect(spies[key], `${key} must not be reached`).not.toHaveBeenCalled();
          }
        } else {
          // The provider is mocked, so the handler may still fail; what matters
          // is that authorization did not reject the request.
          expect([401, 403]).not.toContain(response.status);
          if (c.authorizedStatus !== undefined) {
            expect(response.status).toBe(c.authorizedStatus);
          }
        }
      });
    }
  }
});

describe("S01: SSE ticket flow through the assembled mount order", () => {
  it("issues a ticket and redeems it on the stream endpoint without an Authorization header", async () => {
    const token = tokens.get("operator");

    const issued = await request(harness.use(app))
      .post("/api/executions/exec-1/stream-ticket")
      .set("Authorization", `Bearer ${String(token)}`);

    expect(issued.status).toBe(200);
    const ticket = (issued.body as { ticket?: string }).ticket;
    expect(typeof ticket).toBe("string");

    // EventSource cannot set headers, so the ticket is the only credential.
    const streamed = await request(harness.use(app))
      .get(`/api/executions/exec-1/stream?ticket=${String(ticket)}`);

    // 404 because the mocked repository has no such execution. What matters is
    // that the request was authenticated and authorized rather than rejected
    // by the executions chain before reaching the streaming router.
    expect(streamed.status).toBe(404);
  });

  it("rejects a stream request with no ticket and no Authorization header", async () => {
    const response = await request(harness.use(app)).get("/api/executions/exec-1/stream");
    expect(response.status).toBe(401);
  });
});


describe("S01: execution tool isolation", () => {
  for (const tool of ["ssh", "ansible"]) {
    it(`rejects a Bolt-only caller's ${tool} batch before admission`, async () => {
      createBatch.mockClear();
      const response = await request(harness.use(app)).post("/api/executions/batch")
        .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`)
        .send({ type: "command", action: "whoami", targetNodeIds: ["node-1"], tool });
      expect(response.status).toBe(403);
      expect(createBatch).not.toHaveBeenCalled();
    });
    it(`rejects a Bolt-only caller's ${tool} command`, async () => {
      const response = await request(harness.use(app)).post("/api/nodes/node-1/command")
        .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`)
        .send({ command: "whoami", tool });
      expect(response.status).toBe(403);
    });
  }
});

describe("S01: stream tickets cannot authenticate other operations", () => {
  for (const path of ["/api/executions/another/stream", "/api/executions", "/api/executions/exec-1/output"]) {
    it(`rejects ticket redemption on ${path}`, async () => {
      const issued = await request(harness.use(app)).post("/api/executions/exec-1/stream-ticket")
        .set("Authorization", `Bearer ${String(tokens.get("operator"))}`);
      const ticket = (issued.body as { ticket: string }).ticket;
      const response = await request(harness.use(app)).get(path).query({ ticket });
      expect(response.status).toBe(401);
    });
  }
});


describe("S01: authenticated source scope through assembled routes", () => {
  it("does not reuse unrestricted inventory for a Bolt-only reader", async () => {
    restrictedInventory.mockClear();
    const response = await request(harness.use(app)).get("/api/inventory")
      .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("private");
    expect(restrictedInventory).not.toHaveBeenCalled();
  });
  it("rejects explicit restricted fact sources before querying them", async () => {
    restrictedFacts.mockClear();
    const response = await request(harness.use(app)).get("/api/nodes/private/facts?source=aws")
      .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`);
    expect(response.status).toBe(403);
    expect(restrictedFacts).not.toHaveBeenCalled();
  });
  it("rejects restricted PQL before querying PuppetDB", async () => {
    const response = await request(harness.use(app)).get("/api/inventory?pql=inventory")
      .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`);
    expect(response.status).toBe(403);
  });
  for (const path of ["/api/inventory", "/api/nodes/private/facts"]) {
    it(`rejects a no-role reader on ${path}`, async () => {
      const response = await request(harness.use(app)).get(path)
        .set("Authorization", `Bearer ${String(tokens.get("noRole"))}`);
      expect(response.status).toBe(403);
    });
  }
});


describe("S01: stored execution tool authorization", () => {
  for (const operation of ["cancel", "re-execute"]) {
    it(`rejects ${operation} of an SSH execution by a Bolt-only user`, async () => {
      spies.executionsFindById.mockResolvedValue({ id: "ssh-run", executionTool: "ssh", type: "command", action: "whoami", targetNodes: ["node-1"], status: "running" });
      createReExecution.mockClear();
      updateExecution.mockClear();
      try {
        const response = await request(harness.use(app)).post(`/api/executions/ssh-run/${operation}`)
          .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`).send({});
        expect(response.status).toBe(403);
        expect(createReExecution).not.toHaveBeenCalled();
        expect(updateExecution).not.toHaveBeenCalled();
      } finally {
        spies.executionsFindById.mockResolvedValue(null);
      }
    });
  }
  it("rejects cancellation of an SSH batch by a Bolt-only user", async () => {
    cancelBatch.mockClear();
    const response = await request(harness.use(app)).post("/api/executions/batch/ssh-batch/cancel")
      .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`).send({});
    expect(response.status).toBe(403);
    expect(cancelBatch).not.toHaveBeenCalled();
  });
});


describe("S01: generic lifecycle retains provider authorization", () => {
  for (const action of ["start", "provision", "create_instance", "terminate"]) {
    it(`denies AWS ${action} to a Bolt-only caller even with the configured lifecycle credential`, async () => {
      const response = await request(harness.use(app)).post("/legacy-inventory/aws:eu-west-1:i-test/action")
        .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`).send({ action });
      expect(response.status).toBe(403);
    });
  }
});


describe("S01: remaining production mutation routes", () => {
  it("denies package installation to a Viewer", async () => {
    const response = await request(harness.use(app)).post("/api/packages/node-1/install-package")
      .set("Authorization", `Bearer ${String(tokens.get("viewer"))}`)
      .send({ packageName: "vim", tool: "ansible" });
    expect(response.status).toBe(403);
  });
  it("denies an SSH Puppet run to a Bolt-only caller", async () => {
    const response = await request(harness.use(app)).post("/api/puppet-run")
      .set("Authorization", `Bearer ${String(tokens.get("boltOnly"))}`)
      .send({ targetNodeIds: ["public"], tool: "ssh" });
    expect(response.status).toBe(403);
  });
  it("allows a Viewer to reach monitoring reads through the node mount chain", async () => {
    const response = await request(harness.use(app)).get("/api/nodes/public/services")
      .set("Authorization", `Bearer ${String(tokens.get("viewer"))}`);
    expect(response.status).toBe(503);
  });
});


describe("S01: caller permission discovery", () => {
  it("requires authentication", async () => {
    expect((await request(harness.use(app)).get("/api/auth/permissions")).status).toBe(401);
  });
  it("returns only the caller's grants even when another user is requested", async () => {
    const response = await request(harness.use(app)).get("/api/auth/permissions?userId=admin")
      .set("Authorization", `Bearer ${String(tokens.get("noRole"))}`);
    expect(response.status).toBe(200);
    expect(response.body.permissions).toEqual([]);
  });
});


interface RouteLayer {
  regexp: RegExp & { fast_slash?: boolean };
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: RouteLayer[] };
}

function mountedRoutes(layers: RouteLayer[], prefix = ""): { method: string; path: string }[] {
  return layers.flatMap(layer => {
    if (layer.route) {
      return Object.keys(layer.route.methods).map(method => ({ method, path: prefix + layer.route!.path }));
    }
    if (!layer.handle.stack) return [];
    const source = layer.regexp.source;
    const mount = layer.regexp.fast_slash ? "" : source.split("\\/?")[0].replace(/^\^/, "").replaceAll("\\/", "/");
    if (/[()|*]/.test(mount)) throw new Error(`Unrecognized mount expression: ${source}`);
    return mountedRoutes(layer.handle.stack, prefix + mount);
  });
}

it("denies anonymous and no-role callers across the production infrastructure route inventory", async () => {
  const routes = mountedRoutes((app as unknown as { _router: { stack: RouteLayer[] } })._router.stack)
    .filter(route => route.path.startsWith("/api/") && !route.path.startsWith("/api/auth/"));
  expect(routes.length).toBeGreaterThan(60);
  for (const route of routes) {
    const path = route.path.replace(/:[A-Za-z][A-Za-z0-9_]*/g, "aws:eu-west-1:i-test");
    for (const principal of ["anonymous", "noRole"] as const) {
      // These two GET endpoints expose public presentation metadata and integration health.
      if (principal === "noRole" && /^\/api\/integrations\/(colors|status)\/?$/.test(path)) continue;
      const agent = request(harness.use(app));
      const call = route.method === "get" ? agent.get(path) : route.method === "delete" ? agent.delete(path) : route.method === "put" ? agent.put(path) : agent.post(path);
      if (principal === "noRole") call.set("Authorization", `Bearer ${String(tokens.get(principal))}`);
      const response = await call.send({ command: "whoami", tool: "bolt", packageName: "vim", type: "command", action: "start", targetNodeIds: ["public"] });
      expect(response.status, `${principal}: ${route.method.toUpperCase()} ${route.path}`).toBe(principal === "anonymous" ? 401 : 403);
    }
  }
});


describe("S01: narrowly scoped cloud operator", () => {
  it("dispatches an authorized AWS lifecycle operation", async () => {
    spies.awsAction.mockClear();
    const response = await request(harness.use(app)).post("/api/integrations/aws/lifecycle")
      .set("Authorization", `Bearer ${String(tokens.get("awsOnly"))}`)
      .send({ instanceId: "i-test", action: "stop" });
    expect(response.status).toBe(200);
    expect(spies.awsAction).toHaveBeenCalledOnce();
  });
  for (const operation of [
    { path: "/api/integrations/aws/lifecycle", body: { instanceId: "i-test", action: "terminate" } },
    { path: "/api/integrations/aws/provision", body: { imageId: "ami-test" } },
    { path: "/api/integrations/azure/lifecycle", body: { vmName: "vm", resourceGroup: "rg", action: "start" } },
    { path: "/api/integrations/proxmox/action", body: { node: "pve", vmid: 100, type: "qemu", action: "start" } },
  ]) {
    it(`denies scope expansion through ${operation.path}`, async () => {
      spies.awsAction.mockClear(); spies.azureAction.mockClear(); spies.proxmoxAction.mockClear();
      const response = await request(harness.use(app)).post(operation.path)
        .set("Authorization", `Bearer ${String(tokens.get("awsOnly"))}`).send(operation.body);
      expect(response.status).toBe(403);
      expect(spies.awsAction).not.toHaveBeenCalled();
      expect(spies.azureAction).not.toHaveBeenCalled();
      expect(spies.proxmoxAction).not.toHaveBeenCalled();
    });
  }
});
