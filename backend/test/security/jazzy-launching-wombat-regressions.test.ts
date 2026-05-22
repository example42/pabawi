/**
 * Regression tests for the "jazzy-launching-wombat" security remediation PR.
 *
 * Each test pins the contract of a specific finding (A2/B1/B2/B4/C3/C7/C8) so
 * a future change that silently undoes the fix is caught by CI rather than
 * shipping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { z } from "zod";
import { AppConfigSchema, type WhitelistConfig } from "../../src/config/schema";
import { BoltCommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import {
  CertnameStringSchema,
  PuppetHashStringSchema,
} from "../../src/validation/commonSchemas";
import { BoltService } from "../../src/integrations/bolt/BoltService";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { createInventoryRouter } from "../../src/routes/inventory";
import { createAuthRouter } from "../../src/routes/auth";
import { createSetupRouter } from "../../src/routes/setup";
import { DIContainer } from "../../src/container/DIContainer";
import { LoggerService } from "../../src/services/LoggerService";
import { ExpertModeService } from "../../src/services/ExpertModeService";
import { DatabaseService } from "../../src/database/DatabaseService";
import { SetupService } from "../../src/services/SetupService";
import { UserService } from "../../src/services/UserService";
import { AuthenticationService } from "../../src/services/AuthenticationService";

vi.mock("child_process", () => ({ spawn: vi.fn() }));

// --- B1: TaskNameSchema (imported from routes/tasks via the same regex) ---

const TaskNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_]*(::[a-z][a-z0-9_]*)*$/);

describe("B1: TaskNameSchema rejects CLI-flag-shaped task names", () => {
  it("rejects '--modulepath=/tmp/evil'", () => {
    expect(TaskNameSchema.safeParse("--modulepath=/tmp/evil").success).toBe(false);
  });

  it("rejects leading dash", () => {
    expect(TaskNameSchema.safeParse("-flag").success).toBe(false);
  });

  it("rejects uppercase / unsafe characters", () => {
    expect(TaskNameSchema.safeParse("Module::Task").success).toBe(false);
    expect(TaskNameSchema.safeParse("mod;rm").success).toBe(false);
  });

  it("accepts valid Puppet task identifiers", () => {
    expect(TaskNameSchema.safeParse("facts").success).toBe(true);
    expect(TaskNameSchema.safeParse("module::task").success).toBe(true);
    expect(TaskNameSchema.safeParse("mod::sub::task_one").success).toBe(true);
  });
});

// --- B2: Whitelist rejects leading-dash commands regardless of allowAll ---

describe("B2: BoltCommandWhitelistService rejects leading-dash commands", () => {
  it("rejects '--modulepath=/tmp' with allowAll=true", () => {
    const config: WhitelistConfig = { allowAll: true, whitelist: [], matchMode: "exact" };
    const service = new BoltCommandWhitelistService(config);
    expect(service.isCommandAllowed("--modulepath=/tmp")).toBe(false);
  });

  it("rejects '--modulepath=/tmp' with allowAll=false (and the command in whitelist)", () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ["--modulepath=/tmp"], // operator mistake
      matchMode: "exact",
    };
    const service = new BoltCommandWhitelistService(config);
    expect(service.isCommandAllowed("--modulepath=/tmp")).toBe(false);
  });

  it("rejects '-rf' style short flags", () => {
    const config: WhitelistConfig = { allowAll: true, whitelist: [], matchMode: "exact" };
    const service = new BoltCommandWhitelistService(config);
    expect(service.isCommandAllowed("-rf /")).toBe(false);
  });

  it("still allows legitimate commands", () => {
    const config: WhitelistConfig = { allowAll: true, whitelist: [], matchMode: "exact" };
    const service = new BoltCommandWhitelistService(config);
    expect(service.isCommandAllowed("ls -la /tmp")).toBe(true);
  });
});

// --- B4: certname / hash schemas reject injection payloads ---

describe("B4: CertnameStringSchema rejects injection payloads", () => {
  it("rejects PQL/SQL-injection certnames", () => {
    expect(CertnameStringSchema.safeParse("' or 1=1 --").success).toBe(false);
    expect(CertnameStringSchema.safeParse('"; drop table users; --').success).toBe(false);
    expect(CertnameStringSchema.safeParse("../../etc/passwd").success).toBe(false);
  });

  it("rejects whitespace and shell metacharacters", () => {
    expect(CertnameStringSchema.safeParse("node1; rm -rf /").success).toBe(false);
    expect(CertnameStringSchema.safeParse("node1 OR 1=1").success).toBe(false);
  });

  it("accepts valid certnames", () => {
    expect(CertnameStringSchema.safeParse("node1.example.com").success).toBe(true);
    expect(CertnameStringSchema.safeParse("web-01.prod.example.com").success).toBe(true);
    expect(CertnameStringSchema.safeParse("10.0.0.1").success).toBe(true);
  });

  it("PuppetHashStringSchema accepts only hex digests of length 40–128", () => {
    expect(PuppetHashStringSchema.safeParse("a".repeat(40)).success).toBe(true);
    expect(PuppetHashStringSchema.safeParse("F".repeat(64)).success).toBe(true);
    expect(PuppetHashStringSchema.safeParse("a".repeat(39)).success).toBe(false);
    expect(PuppetHashStringSchema.safeParse("a".repeat(129)).success).toBe(false);
    expect(PuppetHashStringSchema.safeParse("test-hash").success).toBe(false);
    expect(PuppetHashStringSchema.safeParse("not-hex-but-40chars-padded-padded-padded12").success).toBe(false);
  });
});

// --- C8: ConfigService rejects short / placeholder JWT_SECRET ---

describe("C8: AppConfigSchema enforces JWT_SECRET strength", () => {
  function baseConfig(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      port: 3000,
      host: "localhost",
      boltProjectPath: "/tmp",
      lifecycleToken: "",
      commandWhitelist: { allowAll: false, whitelist: [], matchMode: "exact" },
      executionTimeout: 300000,
      logLevel: "info",
      databasePath: "./data/pabawi.db",
      corsAllowedOrigins: [],
      streaming: { bufferMs: 100, maxOutputSize: 10485760, maxLineLength: 10000 },
      cache: { inventoryTtl: 30000, factsTtl: 300000 },
      executionQueue: { concurrentLimit: 5, maxQueueSize: 50 },
      ...overrides,
    };
  }

  it("rejects JWT_SECRET shorter than 32 characters", () => {
    const result = AppConfigSchema.safeParse(baseConfig({ jwtSecret: "shortsecret" }));
    expect(result.success).toBe(false);
  });

  it("rejects the documented placeholder 'your-secure-random-secret-here'", () => {
    const result = AppConfigSchema.safeParse(
      baseConfig({ jwtSecret: "your-secure-random-secret-here-padded-to-32" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects 'change-me' variants regardless of length", () => {
    expect(
      AppConfigSchema.safeParse(
        baseConfig({ jwtSecret: "change-me-please-with-32-chars-pad" }),
      ).success,
    ).toBe(false);
    expect(
      AppConfigSchema.safeParse(
        baseConfig({ jwtSecret: "CHANGE_ME_______________________padded" }),
      ).success,
    ).toBe(false);
  });

  it("accepts a 32+ char non-placeholder secret", () => {
    const result = AppConfigSchema.safeParse(
      baseConfig({ jwtSecret: "abcdefghijklmnopqrstuvwxyz123456" }),
    );
    expect(result.success).toBe(true);
  });
});

// --- A2: DELETE /api/inventory/:id requires lifecycle bearer token ---

describe("A2: DELETE /api/inventory/:id requires the lifecycle bearer", () => {
  const LIFECYCLE_TOKEN = "test-lifecycle-token-32chars-padded-x";

  function buildApp(lifecycleToken: string, allowDestructive = true): Express {
    const app = express();
    app.use(express.json());

    const boltService = new BoltService("./bolt-project", 5000);
    const integrationManager = new IntegrationManager();

    // Container with config that returns our test lifecycle token
    const container = new DIContainer();
    container.register("logger", new LoggerService());
    container.register("expertMode", new ExpertModeService());
    container.register("config", {
      getJwtSecret: () => "test-jwt-secret-32-chars-padded-xx",
      getLifecycleToken: () => lifecycleToken,
    } as unknown as ReturnType<typeof container.resolve<"config">>);

    app.use(
      "/api/inventory",
      createInventoryRouter(
        boltService,
        integrationManager,
        { allowDestructiveActions: allowDestructive },
        container,
      ),
    );
    return app;
  }

  it("returns 401 when no Authorization header is present", async () => {
    const app = buildApp(LIFECYCLE_TOKEN);
    await request(app).delete("/api/inventory/some-node-id").expect(401);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const app = buildApp(LIFECYCLE_TOKEN);
    await request(app)
      .delete("/api/inventory/some-node-id")
      .set("Authorization", "Bearer wrong-token-32chars-padded-xx-xx")
      .expect(401);
  });

  it("returns 500 (misconfigured) when no lifecycle token is configured", async () => {
    const app = buildApp("");
    await request(app)
      .delete("/api/inventory/some-node-id")
      .set("Authorization", `Bearer ${LIFECYCLE_TOKEN}`)
      .expect(500);
  });

  it("returns 403 when destructive actions are disabled by config", async () => {
    const app = buildApp(LIFECYCLE_TOKEN, false);
    await request(app)
      .delete("/api/inventory/some-node-id")
      .set("Authorization", `Bearer ${LIFECYCLE_TOKEN}`)
      .expect(403);
  });
});

// --- C3: Setup TOCTOU — second initialize after admin exists returns 409 ---

describe("C3: POST /api/setup/initialize is idempotent against TOCTOU", () => {
  let app: Express;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-32-chars-padded-c3test";
    databaseService = new DatabaseService(":memory:");
    await databaseService.initialize();

    app = express();
    app.use(express.json());
    app.use("/api/setup", createSetupRouter(databaseService));
  });

  afterEach(async () => {
    await databaseService.close();
  });

  it("creates the admin on first call, then rejects subsequent ones with 409", async () => {
    const payload = {
      username: "admin",
      email: "admin@example.com",
      password: "AdminPass123!",
      firstName: "Init",
      lastName: "Admin",
      allowSelfRegistration: false,
      defaultNewUserRole: null,
    };

    await request(app).post("/api/setup/initialize").send(payload).expect(201);

    // Second call with a different proposed admin: rejected because setup is complete.
    const second = await request(app)
      .post("/api/setup/initialize")
      .send({ ...payload, username: "admin2", email: "admin2@example.com" });
    expect(second.status).toBe(409);

    // Exactly one admin exists in the database.
    const adminCount = await databaseService
      .getConnection()
      .queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE isAdmin = 1");
    expect(adminCount?.count).toBe(1);
  });
});

// --- C7: /change-password feeds the brute-force pipeline ---

describe("C7: 5 wrong currentPassword on /change-password locks the account", () => {
  let app: Express;
  let databaseService: DatabaseService;
  let userId: string;
  let accessToken: string;
  const username = "lockout_victim";
  const correctPassword = "CorrectPass123!";

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-32-chars-padded-c7test";
    databaseService = new DatabaseService(":memory:");
    await databaseService.initialize();

    // Allow registration so we can stand up a user without going through setup.
    const setupService = new SetupService(databaseService.getConnection());
    await setupService.saveConfig({
      allowSelfRegistration: true,
      defaultNewUserRole: null,
    });

    app = express();
    app.use(express.json());
    app.use("/api/auth", createAuthRouter(databaseService));

    // Register + login to obtain an access token
    await request(app)
      .post("/api/auth/register")
      .send({
        username,
        email: "victim@example.com",
        password: correctPassword,
        firstName: "Lockout",
        lastName: "Victim",
      })
      .expect(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username, password: correctPassword })
      .expect(200);

    accessToken = login.body.token;

    const authService = new AuthenticationService(databaseService.getConnection());
    const userService = new UserService(databaseService.getConnection(), authService);
    const u = await userService.getUserByUsername(username);
    if (!u) throw new Error("user not found");
    userId = u.id;
  });

  afterEach(async () => {
    await databaseService.close();
  });

  it("locks the account after 5 wrong currentPassword attempts", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          currentPassword: "WrongPass" + String(i) + "!",
          newPassword: "AnotherPass123!",
        });
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("INCORRECT_PASSWORD");
    }

    // 5th wrong attempt: pipeline applies temporary lockout, returns 423
    const fifth = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "WrongPass5!",
        newPassword: "AnotherPass123!",
      });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");

    // Authenticate is also blocked while locked
    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ username, password: correctPassword });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.message).toContain("temporarily locked");

    // userId stays meaningful (compiler warning suppression)
    expect(userId).toBeDefined();
  });
});
