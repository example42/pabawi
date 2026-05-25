import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { createRbacMiddleware } from "../../src/middleware/rbacMiddleware";
import { PermissionService } from "../../src/services/PermissionService";
import { UserService } from "../../src/services/UserService";
import { RoleService } from "../../src/services/RoleService";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { initializeTestSchema } from "../helpers/schema";

describe("RBAC Middleware", () => {
  let db: DatabaseAdapter;
  let permissionService: PermissionService;
  let userService: UserService;
  let roleService: RoleService;
  let rbacMiddleware: ReturnType<typeof createRbacMiddleware>;

  // Test user IDs
  const adminUserId = "admin-user-id";  // pragma: allowlist secret
  const regularUserId = "regular-user-id";  // pragma: allowlist secret
  const inactiveUserId = "inactive-user-id";  // pragma: allowlist secret
  const noPermUserId = "no-perm-user-id";  // pragma: allowlist secret

  // Test permission IDs
  let ansibleReadPermId: string;
  let ansibleWritePermId: string;
  let boltExecutePermId: string;

  // Test role IDs
  let viewerRoleId: string;
  let operatorRoleId: string;

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Apply real migrations — see .kiro/steering/database-conventions.md
    await initializeTestSchema(db);

    // Initialize services
    permissionService = new PermissionService(db);
    const authForUserService = new AuthenticationService(db, 'rbac-test-secret'); // pragma: allowlist secret
    userService = new UserService(db, authForUserService);
    roleService = new RoleService(db);
    rbacMiddleware = createRbacMiddleware(db);

    // Create test users
    await createUser(db, {
      id: adminUserId,
      username: "admin",
      email: "admin@example.com",
      isActive: 1,
      isAdmin: 1
    });

    await createUser(db, {
      id: regularUserId,
      username: "regular",
      email: "regular@example.com",
      isActive: 1,
      isAdmin: 0
    });

    await createUser(db, {
      id: inactiveUserId,
      username: "inactive",
      email: "inactive@example.com",
      isActive: 0,
      isAdmin: 0
    });

    await createUser(db, {
      id: noPermUserId,
      username: "noperm",
      email: "noperm@example.com",
      isActive: 1,
      isAdmin: 0
    });

    // Use the permissions that migrations already seed; creating duplicates
    // would collide on the unique (resource, action) constraint.
    const ansibleRead = await permissionService.getPermissionById('ansible-read-001');
    if (!ansibleRead) throw new Error('Expected seeded ansible-read permission');
    ansibleReadPermId = ansibleRead.id;

    const ansibleWrite = await permissionService.getPermissionById('ansible-write-001');
    if (!ansibleWrite) throw new Error('Expected seeded ansible-write permission');
    ansibleWritePermId = ansibleWrite.id;

    const boltExecute = await permissionService.getPermissionById('bolt-exec-001');
    if (!boltExecute) throw new Error('Expected seeded bolt-execute permission');
    boltExecutePermId = boltExecute.id;

    // Use seeded built-in roles instead of creating duplicates
    const viewerRole = await roleService.getRoleById('role-viewer-001');
    if (!viewerRole) throw new Error('Expected seeded Viewer role');
    viewerRoleId = viewerRole.id;

    const operatorRole = await roleService.getRoleById('role-operator-001');
    if (!operatorRole) throw new Error('Expected seeded Operator role');
    operatorRoleId = operatorRole.id;

    // The seeded role-permission assignments already include the ones we
    // need (viewer→ansible-read, operator→ansible-read, operator→bolt-exec),
    // so no extra assignPermissionToRole calls are required.

    // Assign role to regular user
    await userService.assignRoleToUser(regularUserId, viewerRoleId);
  });

  afterEach(async () => {
    // Close database
    await db.close();
  });

  // Helper to create mock request/response
  const createMocks = (userId?: string, username?: string) => {
    const req = {
      user: userId ? {
        userId,
        username: username || "testuser",
        roles: [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      } : undefined,
      method: "GET",
      path: "/api/test",
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      headers: { 'user-agent': 'test-agent' }
    } as Request;

    const res = {
      status: function(code: number) {
        this.statusCode = code;
        return this;
      },
      json: function(data: unknown) {
        this.body = data;
        return this;
      },
      statusCode: 0,
      body: null
    } as unknown as Response;

    const next = (() => {
      next.called = true;
    }) as NextFunction & { called?: boolean };
    next.called = false;

    return { req, res, next };
  };

  describe("Authentication Check", () => {
    it("should return 401 when req.user is missing", async () => {
      const middleware = rbacMiddleware("ansible", "read");
      const { req, res, next } = createMocks(); // No user

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Please login first."
        }
      });
    });

    it("should return 401 when req.user.userId is missing", async () => {
      const middleware = rbacMiddleware("ansible", "read");
      const { req, res, next } = createMocks();
      req.user = { userId: "", username: "test", roles: [], iat: 0, exp: 0 };

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
    });
  });

  describe("Permission Check - Sufficient Permissions", () => {
    it("should call next() when user has required permission", async () => {
      const middleware = rbacMiddleware("ansible", "read");
      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect((res as any).statusCode).toBe(0); // No response sent
    });

    it("should call next() when admin user accesses any resource", async () => {
      const middleware = rbacMiddleware("ansible", "admin");
      const { req, res, next } = createMocks(adminUserId, "admin");

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect((res as any).statusCode).toBe(0);
    });

    it("should call next() for multiple different permissions", async () => {
      // Assign operator role to regular user (has both ansible:read and bolt:execute)
      await userService.assignRoleToUser(regularUserId, operatorRoleId);

      // Test ansible:read
      const middleware1 = rbacMiddleware("ansible", "read");
      const { req: req1, res: res1, next: next1 } = createMocks(regularUserId, "regular");
      await middleware1(req1, res1, next1);
      expect(next1.called).toBe(true);

      // Test bolt:execute
      const middleware2 = rbacMiddleware("bolt", "execute");
      const { req: req2, res: res2, next: next2 } = createMocks(regularUserId, "regular");
      await middleware2(req2, res2, next2);
      expect(next2.called).toBe(true);
    });
  });

  describe("Permission Check - Insufficient Permissions", () => {
    it("should return 403 when user lacks required permission", async () => {
      const middleware = rbacMiddleware("ansible", "write");
      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(403);
      expect((res as any).body).toEqual({
        error: {
          code: "INSUFFICIENT_PERMISSIONS",
          message: "Insufficient permissions to perform this action",
          required: {
            resource: "ansible",
            action: "write"
          }
        }
      });
    });

    it("should return 403 when user has no roles assigned", async () => {
      const middleware = rbacMiddleware("ansible", "read");
      const { req, res, next } = createMocks(noPermUserId, "noperm");

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(403);
      expect((res as any).body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("should return 403 for inactive user", async () => {
      const middleware = rbacMiddleware("ansible", "read");
      const { req, res, next } = createMocks(inactiveUserId, "inactive");

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(403);
    });

    it("should include required permission info in 403 response", async () => {
      const middleware = rbacMiddleware("bolt", "execute");
      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      expect((res as any).statusCode).toBe(403);
      expect((res as any).body.error.required).toEqual({
        resource: "bolt",
        action: "execute"
      });
    });
  });

  describe("Authorization Logging", () => {
    it("should log authorization failures", async () => {
      // Capture console.warn output
      const originalWarn = console.warn;
      let loggedMessage = "";  // pragma: allowlist secret
      console.warn = (message: string) => {
        loggedMessage = message;
      };

      const middleware = rbacMiddleware("ansible", "write");
      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      // Restore console.warn
      console.warn = originalWarn;

      expect(loggedMessage).toContain("Authorization denied");
      expect(loggedMessage).toContain("regular");
      expect(loggedMessage).toContain(regularUserId);
      expect(loggedMessage).toContain("ansible");
      expect(loggedMessage).toContain("write");
    });

    it("should include request details in authorization log", async () => {
      const originalWarn = console.warn;
      let loggedMessage = "";  // pragma: allowlist secret
      console.warn = (message: string) => {
        loggedMessage = message;
      };

      const middleware = rbacMiddleware("bolt", "admin");
      const { req, res, next } = createMocks(regularUserId, "regular");
      req.method = "DELETE";  // pragma: allowlist secret
      req.path = "/api/bolt/tasks/123";  // pragma: allowlist secret

      await middleware(req, res, next);

      console.warn = originalWarn;

      expect(loggedMessage).toContain("DELETE");
      expect(loggedMessage).toContain("/api/bolt/tasks/123");
      expect(loggedMessage).toContain("127.0.0.1");
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on unexpected errors", async () => {
      // Create middleware with invalid database to trigger error
      const badDb = {} as Database;
      const badMiddleware = createRbacMiddleware(badDb);
      const middleware = badMiddleware("ansible", "read");

      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(500);
      expect((res as any).body).toEqual({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to check permissions"
        }
      });
    });

    it("should log unexpected errors", async () => {
      const originalError = console.error;
      const loggedMessages: string[] = [];
      console.error = (message: string) => {
        loggedMessages.push(message);
      };

      const badDb = {} as Database;
      const badMiddleware = createRbacMiddleware(badDb);
      const middleware = badMiddleware("ansible", "read");

      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      console.error = originalError;

      // Check that at least one log message contains the expected information
      const combinedLogs = loggedMessages.join('\n');
      expect(combinedLogs).toContain("Error");
      // The error may be logged as a stack trace, so we check for either the formatted message or the error itself
      expect(loggedMessages.length).toBeGreaterThan(0);
    });
  });

  describe("Middleware Factory Pattern", () => {
    it("should create different middleware instances for different permissions", async () => {
      const middleware1 = rbacMiddleware("ansible", "read");
      const middleware2 = rbacMiddleware("bolt", "execute");

      expect(middleware1).not.toBe(middleware2);
      expect(typeof middleware1).toBe("function");
      expect(typeof middleware2).toBe("function");
    });

    it("should work with multiple middleware in chain", async () => {
      // Assign operator role (has both permissions)
      await userService.assignRoleToUser(regularUserId, operatorRoleId);

      const middleware1 = rbacMiddleware("ansible", "read");
      const middleware2 = rbacMiddleware("bolt", "execute");

      const { req, res, next } = createMocks(regularUserId, "regular");

      // First middleware
      await middleware1(req, res, next);
      expect(next.called).toBe(true);

      // Reset next
      next.called = false;

      // Second middleware
      await middleware2(req, res, next);
      expect(next.called).toBe(true);
    });
  });

  describe("Integration with PermissionService", () => {
    it("should respect permission caching", async () => {
      const middleware = rbacMiddleware("ansible", "read");

      // First call - cache miss
      const { req: req1, res: res1, next: next1 } = createMocks(regularUserId, "regular");
      await middleware(req1, res1, next1);
      expect(next1.called).toBe(true);

      // Second call - cache hit (should still work)
      const { req: req2, res: res2, next: next2 } = createMocks(regularUserId, "regular");
      await middleware(req2, res2, next2);
      expect(next2.called).toBe(true);
    });

    it("should work correctly with permission service for different resources", async () => {
      // Assign operator role (has both ansible:read and bolt:execute)
      await userService.assignRoleToUser(regularUserId, operatorRoleId);

      // Test ansible:read
      const middleware1 = rbacMiddleware("ansible", "read");
      const { req: req1, res: res1, next: next1 } = createMocks(regularUserId, "regular");
      await middleware1(req1, res1, next1);
      expect(next1.called).toBe(true);

      // Test bolt:execute
      const middleware2 = rbacMiddleware("bolt", "execute");
      const { req: req2, res: res2, next: next2 } = createMocks(regularUserId, "regular");
      await middleware2(req2, res2, next2);
      expect(next2.called).toBe(true);

      // Test permission user doesn't have
      const middleware3 = rbacMiddleware("ansible", "write");
      const { req: req3, res: res3, next: next3 } = createMocks(regularUserId, "regular");
      await middleware3(req3, res3, next3);
      expect(next3.called).toBe(false);
      expect((res3 as any).statusCode).toBe(403);
    });
  });
});

// Helper function to initialize database schema

// Helper function to create a user
async function createUser(
  db: DatabaseAdapter,
  data: {
    id: string;
    username: string;
    email: string;
    isActive: number;
    isAdmin: number;
  }
): Promise<void> {
  await db.execute(
    `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.username,
      data.email,
      "$2b$10$abcdefghijklmnopqrstuv", // dummy hash
      "Test",
      "User",
      data.isActive,
      data.isAdmin,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );
}
