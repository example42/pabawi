/**
 * Property-Based Tests for RBAC Enforcement for Cross-User Termination
 *
 * Feature: console-integration, Property 6: RBAC enforcement for cross-user termination
 *
 * **Validates: Requirements 6.4, 6.5, 6.6, 8.3**
 *
 * Property 6: RBAC enforcement for cross-user termination
 * ∀ user, owner ∈ Users, hasAccess ∈ Bool, hasAdmin ∈ Bool:
 *   - No console:access → 403 (RBAC middleware blocks)
 *   - Same user + console:access → 204 (own session)
 *   - Different user + console:access but NOT console:admin → 403
 *   - Different user + console:access + console:admin → 204
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { PermissionService } from "../../src/services/PermissionService";
import { RoleService } from "../../src/services/RoleService";
import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import { createConsoleRouter } from "../../src/routes/console";
import { DIContainer } from "../../src/container/DIContainer";
import { LoggerService } from "../../src/services/LoggerService";
import { ConfigService } from "../../src/config/ConfigService";
import { ExpertModeService } from "../../src/services/ExpertModeService";
import { initializeTestSchema } from "../helpers/schema";

import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { ConsoleSession } from "../../src/integrations/console/types";
import type { ConsoleConfig } from "../../src/config/schema";

const JWT_SECRET = "test-secret-for-rbac-termination-prop-test"; // pragma: allowlist secret

function makeAuditLogger(): AuditLoggingService {
  return {
    logAdminAction: async () => {},
    logAuthorizationFailure: async () => {},
  } as unknown as AuditLoggingService;
}

function makeConsoleConfig(): ConsoleConfig {
  return {
    sessionTimeoutMs: 300000,
    maxSessionDuration: 28800000,
    maxConcurrentSessions: 10,
    heartbeatIntervalMs: 30000,
  };
}

function makeMockIntegrationManager(): IntegrationManager {
  return {
    getConsoleProvider: () => null,
    getAllConsoleProviders: () => [],
    getConsoleAvailability: async () => [],
  } as unknown as IntegrationManager;
}

describe("Feature: console-integration, Property 6: RBAC enforcement for cross-user termination", () => {
  let db: SQLiteAdapter;
  let app: Express;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let sessionManager: ConsoleSessionManager;

  // Pre-created permission and role IDs
  let accessPermId: string;
  let adminPermId: string;
  let accessOnlyRoleId: string;
  let accessAdminRoleId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.PABAWI_LIFECYCLE_TOKEN = "test-lifecycle-token"; // pragma: allowlist secret

    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);

    authService = new AuthenticationService(db, JWT_SECRET);
    userService = new UserService(db, authService);
    permissionService = new PermissionService(db);
    roleService = new RoleService(db);
    sessionManager = new ConsoleSessionManager(
      db,
      makeConsoleConfig(),
      new LoggerService(),
      makeAuditLogger(),
    );

    // Find or create console:access and console:admin permissions
    const allPerms = await permissionService.listPermissions();
    const existingAccess = allPerms.items.find(
      (p) => p.resource === "console" && p.action === "access",
    );
    const existingAdmin = allPerms.items.find(
      (p) => p.resource === "console" && p.action === "admin",
    );

    if (existingAccess) {
      accessPermId = existingAccess.id;
    } else {
      const perm = await permissionService.createPermission({
        resource: "console",
        action: "access",
        description: "Access console sessions",
      });
      accessPermId = perm.id;
    }

    if (existingAdmin) {
      adminPermId = existingAdmin.id;
    } else {
      const perm = await permissionService.createPermission({
        resource: "console",
        action: "admin",
        description: "Admin console sessions",
      });
      adminPermId = perm.id;
    }

    // Create reusable roles: one with access only, one with access+admin
    const accessRole = await roleService.createRole({
      name: "console_access_only",
      description: "console:access only",
    });
    accessOnlyRoleId = accessRole.id;
    await roleService.assignPermissionToRole(accessOnlyRoleId, accessPermId);

    const accessAdminRole = await roleService.createRole({
      name: "console_access_admin",
      description: "console:access + console:admin",
    });
    accessAdminRoleId = accessAdminRole.id;
    await roleService.assignPermissionToRole(accessAdminRoleId, accessPermId);
    await roleService.assignPermissionToRole(accessAdminRoleId, adminPermId);

    // Build Express app with console router
    const container = new DIContainer();
    container.register("logger", new LoggerService());
    container.register("expertMode", new ExpertModeService());
    container.register("config", new ConfigService());

    app = express();
    app.use(express.json());
    app.use(
      "/api/console",
      createConsoleRouter(container, makeMockIntegrationManager(), sessionManager, db),
    );
  });

  afterAll(async () => {
    await db.close();
    delete process.env.JWT_SECRET;
    delete process.env.PABAWI_LIFECYCLE_TOKEN;
  });

  /**
   * Helper: create a test user and return their ID + JWT token.
   */
  async function createUserWithToken(
    suffix: string,
    hasAccess: boolean,
    hasAdmin: boolean,
  ): Promise<{ userId: string; token: string }> {
    const id = randomUUID();
    const username = `user_${suffix}_${id.substring(0, 6)}`;
    const user = await userService.createUser({
      username,
      email: `${username}@test.com`,
      password: "TestPass123!",
      firstName: "Test",
      lastName: "User",
      isAdmin: false,
    });

    if (hasAccess && hasAdmin) {
      await userService.assignRoleToUser(user.id, accessAdminRoleId);
    } else if (hasAccess) {
      await userService.assignRoleToUser(user.id, accessOnlyRoleId);
    }
    // If neither, user has no console permissions

    const token = await authService.generateToken(user);
    return { userId: user.id, token };
  }

  /**
   * Helper: create a console session owned by a specific user.
   */
  async function createOwnedSession(ownerId: string): Promise<string> {
    const sessionId = randomUUID();
    const session: ConsoleSession = {
      sessionId,
      userId: ownerId,
      nodeId: `node-${randomUUID().substring(0, 8)}`,
      provider: "proxmox",
      transport: "websocket-vnc",
      state: "active",
      token: randomUUID(),
      wsUrl: `/ws/console/vnc?token=placeholder`,
      startedAt: new Date().toISOString(),
    };
    await sessionManager.createSession(session);
    return sessionId;
  }

  it("rejects with 403 when user lacks console:access (RBAC middleware blocks)", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.boolean(), // isSameUser (doesn't matter — blocked at middleware)
        async (_isSameUser) => {
          // User with no permissions at all
          const { token } = await createUserWithToken("noaccess", false, false);
          const owner = await createUserWithToken("owner", true, false);
          const sessionId = await createOwnedSession(owner.userId);

          const res = await request(app)
            .delete(`/api/console/sessions/${sessionId}`)
            .set("Authorization", `Bearer ${token}`);

          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);

  it("allows own session termination with only console:access (204)", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.boolean(), // has admin (irrelevant for own session — both should work)
        async (hasAdmin) => {
          const { userId, token } = await createUserWithToken(
            "self",
            true,
            hasAdmin,
          );
          const sessionId = await createOwnedSession(userId);

          const res = await request(app)
            .delete(`/api/console/sessions/${sessionId}`)
            .set("Authorization", `Bearer ${token}`);

          expect(res.status).toBe(204);
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);

  it("rejects cross-user termination when user has console:access but NOT console:admin (403)", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 99999 }), // seed for unique user names
        async (seed) => {
          const owner = await createUserWithToken(`xo${String(seed)}`, true, false);
          const { token } = await createUserWithToken(`xr${String(seed)}`, true, false);
          const sessionId = await createOwnedSession(owner.userId);

          const res = await request(app)
            .delete(`/api/console/sessions/${sessionId}`)
            .set("Authorization", `Bearer ${token}`);

          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe("FORBIDDEN");
          expect(res.body.error.message).toContain("console:admin");
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);

  it("allows cross-user termination when user has console:access + console:admin (204)", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 99999 }), // seed for unique user names
        async (seed) => {
          const owner = await createUserWithToken(`ao${String(seed)}`, true, false);
          const { token } = await createUserWithToken(`ad${String(seed)}`, true, true);
          const sessionId = await createOwnedSession(owner.userId);

          const res = await request(app)
            .delete(`/api/console/sessions/${sessionId}`)
            .set("Authorization", `Bearer ${token}`);

          expect(res.status).toBe(204);
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);
});
