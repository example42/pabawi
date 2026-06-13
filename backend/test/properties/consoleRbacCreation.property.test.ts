/**
 * Property-Based Tests for RBAC Enforcement on Session Creation
 *
 * Feature: console-integration, Property 5: RBAC enforcement for session creation
 *
 * **Validates: Requirements 6.2, 6.3**
 *
 * Property 5: RBAC enforcement for session creation
 * ∀ user ∈ Users, hasConsoleAccess ∈ {true, false}:
 *   POST /api/console/sessions returns 201 iff user holds `console:access`;
 *   otherwise 403 with FORBIDDEN error code.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

import { createConsoleRouter } from "../../src/routes/console";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { PermissionService } from "../../src/services/PermissionService";
import { RoleService } from "../../src/services/RoleService";
import { DIContainer } from "../../src/container/DIContainer";
import { LoggerService } from "../../src/services/LoggerService";
import { ExpertModeService } from "../../src/services/ExpertModeService";
import { ConfigService } from "../../src/config/ConfigService";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { ConsoleSession } from "../../src/integrations/console/types";
import { initializeTestSchema } from "../helpers/schema";

const JWT_SECRET = "test-jwt-secret-for-property-tests-minimum-32chars!!"; // pragma: allowlist secret

function buildContainer(): DIContainer {
  const container = new DIContainer();
  container.register("logger", new LoggerService());
  container.register("expertMode", new ExpertModeService());
  container.register("config", new ConfigService());
  return container;
}

function makeMockIntegrationManager(): IntegrationManager {
  return {
    getConsoleProvider: vi.fn().mockReturnValue({
      createSession: vi.fn().mockImplementation(
        (nodeId: string, userId: string): ConsoleSession => ({
          sessionId: randomUUID(),
          token: randomUUID(),
          wsUrl: `/ws/console/vnc?token=${randomUUID()}`,
          transport: "websocket-vnc",
          state: "active",
          startedAt: new Date().toISOString(),
          nodeId,
          userId,
          provider: "proxmox",
        }),
      ),
    }),
  } as unknown as IntegrationManager;
}

function makeMockSessionManager(): ConsoleSessionManager {
  return {
    getActiveSessionCount: vi.fn().mockResolvedValue(0),
    createSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConsoleSessionManager;
}

describe("Feature: console-integration, Property 5: RBAC enforcement for session creation", () => {
  let db: SQLiteAdapter;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.HOST = "localhost";
    process.env.PORT = "3000";

    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);

    authService = new AuthenticationService(db, JWT_SECRET);
    userService = new UserService(db, authService);
    permissionService = new PermissionService(db);
    roleService = new RoleService(db);
  });

  afterEach(async () => {
    await db.close();
    delete process.env.JWT_SECRET;
    delete process.env.HOST;
    delete process.env.PORT;
    vi.restoreAllMocks();
  });

  /**
   * Helper: create a user with or without `console:access` permission.
   * Returns the generated JWT token.
   */
  async function createUserWithPermission(
    hasConsoleAccess: boolean,
    suffix: string,
  ): Promise<{ token: string; userId: string }> {
    const user = await userService.createUser({
      username: `user_${suffix}`,
      email: `user_${suffix}@test.com`,
      password: "TestPass123!",
      firstName: "Test",
      lastName: "User",
      isAdmin: false,
    });

    if (hasConsoleAccess) {
      // Find or create console:access permission
      let consoleAccessPerm;
      const allPerms = await permissionService.listPermissions();
      consoleAccessPerm = allPerms.items.find(
        (p) => p.resource === "console" && p.action === "access",
      );
      if (!consoleAccessPerm) {
        consoleAccessPerm = await permissionService.createPermission({
          resource: "console",
          action: "access",
          description: "Access console sessions",
        });
      }

      // Create a role with console:access and assign to user
      const role = await roleService.createRole({
        name: `console_role_${suffix}`,
        description: "Console access role",
      });
      await roleService.assignPermissionToRole(role.id, consoleAccessPerm.id);
      await userService.assignRoleToUser(user.id, role.id);
    }

    const token = await authService.generateToken(user);
    return { token, userId: user.id };
  }

  /**
   * Build an Express app with the console router mounted.
   */
  function buildApp(): express.Express {
    const app = express();
    app.use(express.json());

    const container = buildContainer();
    const integrationManager = makeMockIntegrationManager();
    const sessionManager = makeMockSessionManager();

    const router = createConsoleRouter(
      container,
      integrationManager,
      sessionManager,
      db,
    );
    app.use("/api/console", router);
    return app;
  }

  it("users with console:access get 201 on POST /sessions", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (iteration) => {
          const app = buildApp();
          const suffix = `access_${String(iteration)}_${String(Date.now())}`;
          const { token } = await createUserWithPermission(true, suffix);

          const response = await request(app)
            .post("/api/console/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send({ nodeId: "node-1", provider: "proxmox" });

          expect(response.status).toBe(201);
          expect(response.body.session).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);

  it("users without console:access get 403 on POST /sessions", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (iteration) => {
          const app = buildApp();
          const suffix = `noaccess_${String(iteration)}_${String(Date.now())}`;
          const { token } = await createUserWithPermission(false, suffix);

          const response = await request(app)
            .post("/api/console/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send({ nodeId: "node-1", provider: "proxmox" });

          expect(response.status).toBe(403);
          expect(response.body.error).toBeDefined();
          expect(response.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);

  it("RBAC enforcement is consistent: access iff console:access held", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.integer({ min: 1, max: 100 }),
        async (hasAccess, iteration) => {
          const app = buildApp();
          const suffix = `rbac_${String(hasAccess)}_${String(iteration)}_${String(Date.now())}`;
          const { token } = await createUserWithPermission(hasAccess, suffix);

          const response = await request(app)
            .post("/api/console/sessions")
            .set("Authorization", `Bearer ${token}`)
            .send({ nodeId: "node-1", provider: "proxmox" });

          if (hasAccess) {
            expect(response.status).toBe(201);
            expect(response.body.session).toBeDefined();
          } else {
            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 120000);
});
