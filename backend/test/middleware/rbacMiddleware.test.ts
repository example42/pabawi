import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { Database } from "sqlite3";
import { createRbacMiddleware } from "../../src/middleware/rbacMiddleware";
import { PermissionService } from "../../src/services/PermissionService";
import { UserService } from "../../src/services/UserService";
import { RoleService } from "../../src/services/RoleService";

describe("RBAC Middleware", () => {
  let db: Database;
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
    db = new Database(':memory:');

    // Initialize database schema
    await initializeSchema(db);

    // Initialize services
    permissionService = new PermissionService(db);
    userService = new UserService(db);
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

    // Create test permissions
    const ansibleRead = await permissionService.createPermission({
      resource: "ansible",
      action: "read",
      description: "Read Ansible resources"
    });
    ansibleReadPermId = ansibleRead.id;

    const ansibleWrite = await permissionService.createPermission({
      resource: "ansible",
      action: "write",
      description: "Write Ansible resources"
    });
    ansibleWritePermId = ansibleWrite.id;

    const boltExecute = await permissionService.createPermission({
      resource: "bolt",
      action: "execute",
      description: "Execute Bolt tasks"
    });
    boltExecutePermId = boltExecute.id;

    // Create test roles
    const viewerRole = await roleService.createRole({
      name: "Viewer",
      description: "Can view resources"
    });
    viewerRoleId = viewerRole.id;

    const operatorRole = await roleService.createRole({
      name: "Operator",
      description: "Can view and execute"
    });
    operatorRoleId = operatorRole.id;

    // Assign permissions to roles
    await roleService.assignPermissionToRole(viewerRoleId, ansibleReadPermId);
    await roleService.assignPermissionToRole(operatorRoleId, ansibleReadPermId);
    await roleService.assignPermissionToRole(operatorRoleId, boltExecutePermId);

    // Assign role to regular user
    await userService.assignRoleToUser(regularUserId, viewerRoleId);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
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

      expect(loggedMessage).toContain("[RBAC] Authorization denied");
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
      let loggedMessage = "";  // pragma: allowlist secret
      console.error = (message: string) => {
        loggedMessage = message;
      };

      const badDb = {} as Database;
      const badMiddleware = createRbacMiddleware(badDb);
      const middleware = badMiddleware("ansible", "read");

      const { req, res, next } = createMocks(regularUserId, "regular");

      await middleware(req, res, next);

      console.error = originalError;

      expect(loggedMessage).toContain("[RBAC] Error checking permissions");
      expect(loggedMessage).toContain(regularUserId);
      expect(loggedMessage).toContain("ansible");
      expect(loggedMessage).toContain("read");
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
async function initializeSchema(db: Database): Promise<void> {
  const schema = `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      isAdmin INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastLoginAt TEXT
    );

    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      isBuiltIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE permissions (
      id TEXT PRIMARY KEY,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(resource, action)
    );

    CREATE TABLE user_groups (
      userId TEXT NOT NULL,
      groupId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, groupId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE user_roles (
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE group_roles (
      groupId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (groupId, roleId),
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE role_permissions (
      roleId TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (roleId, permissionId),
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE revoked_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      revokedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      eventType TEXT NOT NULL,
      action TEXT NOT NULL,
      userId TEXT,
      targetUserId TEXT,
      targetResourceType TEXT,
      targetResourceId TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      details TEXT,
      result TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens(expiresAt);
    CREATE INDEX idx_user_roles_user ON user_roles(userId);
    CREATE INDEX idx_user_groups_user ON user_groups(userId);
    CREATE INDEX idx_group_roles_group ON group_roles(groupId);
    CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
    CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
    CREATE INDEX idx_audit_logs_user ON audit_logs(userId);
    CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to create a user
async function createUser(
  db: Database,
  data: {
    id: string;
    username: string;
    email: string;
    isActive: number;
    isAdmin: number;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
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
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
