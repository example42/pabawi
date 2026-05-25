import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { createAuthMiddleware } from "../../src/middleware/authMiddleware";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { initializeTestSchema } from "../helpers/schema";

describe("Authentication Middleware", () => {
  let db: DatabaseAdapter;
  let authService: AuthenticationService;
  let middleware: ReturnType<typeof createAuthMiddleware>;
  const jwtSecret = "test-secret-key-for-middleware-testing"; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Apply real migrations — see .kiro/steering/database-conventions.md
    await initializeTestSchema(db);

    authService = new AuthenticationService(db, jwtSecret);

    // Create test user
    await db.execute(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
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
        ]
    );

    // Create middleware instance
    middleware = createAuthMiddleware(db, jwtSecret);
  });

  afterEach(async () => {
    // Close database
    await db.close();
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
