import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { Database } from "sqlite3";
import { createAuthMiddleware } from "../../src/middleware/authMiddleware";
import { AuthenticationService } from "../../src/services/AuthenticationService";

describe("Authentication Middleware", () => {
  let db: Database;
  let authService: AuthenticationService;
  let middleware: ReturnType<typeof createAuthMiddleware>;
  const jwtSecret = "test-secret-key-for-middleware-testing"; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize database schema
    await initializeSchema(db);

    authService = new AuthenticationService(db, jwtSecret);

    // Create test user
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "test-user-id",
          "testuser",
          "test@example.com",
          "$2b$10$abcdefghijklmnopqrstuv", // dummy hash
          "Test",
          "User",
          1,
          0,
          new Date().toISOString(),
          new Date().toISOString()
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create middleware instance
    middleware = createAuthMiddleware(db, jwtSecret);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  // Helper to create mock request/response
  const createMocks = () => {
    const req = {
      headers: {}
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

  describe("Valid Token", () => {
    it("should attach user payload to request and call next() with valid token", async () => {
      // Generate valid token
      const user = {
        id: "test-user-id",
        username: "testuser",
        email: "test@example.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        firstName: "Test",
        lastName: "User",
        isActive: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null
      };

      const token = await authService.generateToken(user);

      const { req, res, next } = createMocks();
      req.headers.authorization = `Bearer ${token}`;

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user?.userId).toBe("test-user-id");
      expect(req.user?.username).toBe("testuser");
      expect(req.user?.roles).toEqual([]);
    });
  });

  describe("Missing Token", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const { req, res, next } = createMocks();

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing authorization header"
        }
      });
    });

    it("should return 401 when token is empty after Bearer prefix", async () => {
      const { req, res, next } = createMocks();
      req.headers.authorization = "Bearer ";  // pragma: allowlist secret

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing token"
        }
      });
    });
  });

  describe("Invalid Token Format", () => {
    it("should return 401 when Authorization header doesn't start with Bearer", async () => {
      const { req, res, next } = createMocks();
      req.headers.authorization = "Basic sometoken";  // pragma: allowlist secret

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid authorization header format. Expected 'Bearer <token>'"
        }
      });
    });
  });

  describe("Invalid Token Signature", () => {
    it("should return 401 when token has invalid signature", async () => {
      const { req, res, next } = createMocks();
      req.headers.authorization = "Bearer invalid.token.signature";  // pragma: allowlist secret

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid token signature"
        }
      });
    });
  });

  describe("Expired Token", () => {
    it("should return 401 when token is expired", async () => {
      // Create a token that's already expired
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        {
          userId: "test-user-id",
          username: "testuser",
          roles: [],
          iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
          exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
        },
        jwtSecret,
        { algorithm: "HS256" }
      );

      const { req, res, next } = createMocks();
      req.headers.authorization = `Bearer ${expiredToken}`;

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "TOKEN_EXPIRED",
          message: "Token has expired. Please refresh your token or login again."
        }
      });
    });
  });

  describe("Revoked Token", () => {
    it("should return 401 when token has been revoked", async () => {
      // Generate valid token
      const user = {
        id: "test-user-id",
        username: "testuser",
        email: "test@example.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        firstName: "Test",
        lastName: "User",
        isActive: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null
      };

      const token = await authService.generateToken(user);

      // Revoke the token
      await authService.revokeToken(token);

      const { req, res, next } = createMocks();
      req.headers.authorization = `Bearer ${token}`;

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toEqual({
        error: {
          code: "TOKEN_REVOKED",
          message: "Token has been revoked. Please login again."
        }
      });
    });
  });

  describe("User Payload", () => {
    it("should include all required fields in user payload", async () => {
      const user = {
        id: "test-user-id",
        username: "testuser",
        email: "test@example.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        firstName: "Test",
        lastName: "User",
        isActive: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null
      };

      const token = await authService.generateToken(user);

      const { req, res, next } = createMocks();
      req.headers.authorization = `Bearer ${token}`;

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user).toHaveProperty("userId");
      expect(req.user).toHaveProperty("username");
      expect(req.user).toHaveProperty("roles");
      expect(req.user).toHaveProperty("iat");
      expect(req.user).toHaveProperty("exp");
    });
  });

  describe("Error Handling", () => {
    it("should return generic error for unexpected errors", async () => {
      // Create middleware with invalid database to trigger error
      const badDb = {} as Database;
      const badMiddleware = createAuthMiddleware(badDb, jwtSecret);

      const user = {
        id: "test-user-id",
        username: "testuser",
        email: "test@example.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        firstName: "Test",
        lastName: "User",
        isActive: true,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: null
      };

      const token = await authService.generateToken(user);

      const { req, res, next } = createMocks();
      req.headers.authorization = `Bearer ${token}`;

      await badMiddleware(req, res, next);

      expect(next.called).toBe(false);
      expect((res as any).statusCode).toBe(401);
      expect((res as any).body).toHaveProperty("error");
      expect((res as any).body.error).toHaveProperty("code");
      expect((res as any).body.error).toHaveProperty("message");
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

    CREATE TABLE revoked_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      revokedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens(expiresAt);
    CREATE INDEX idx_user_roles_user ON user_roles(userId);
    CREATE INDEX idx_user_groups_user ON user_groups(userId);
    CREATE INDEX idx_group_roles_group ON group_roles(groupId);
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
