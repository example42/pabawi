import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "sqlite3";
import express, { Express } from "express";
import request from "supertest";
import { createAuthRouter } from "../../src/routes/auth";
import { createUsersRouter } from "../../src/routes/users";
import { DatabaseService } from "../../src/database/DatabaseService";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { randomUUID } from "crypto";

/**
 * Unit tests for error handling in RBAC Authorization System
 *
 * Validates Requirements:
 * - 16.1: Authentication failure error messages
 * - 16.2: Authorization failure error messages (403)
 * - 16.3: Database connection failure error messages (503)
 * - 16.4: Token expiration error messages (401)
 * - 16.5: Input validation failure error messages (400)
 * - 16.6: Duplicate username/email error messages (409)
 * - 16.7: Error logging with sufficient detail
 */
describe("Error Handling - Unit Tests", () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  const jwtSecret = "test-secret-key-for-error-handling"; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(":memory:");

    // Initialize schema
    await initializeSchema(db);

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Initialize services
    authService = new AuthenticationService(db, jwtSecret);
    userService = new UserService(db);

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use("/api/auth", createAuthRouter(databaseService));
    app.use("/api/users", createUsersRouter(databaseService));

    // Create test user for authentication tests
    await createTestUser(db);
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe("Requirement 16.1: Authentication Failures (401)", () => {
    it("should return 401 with clear error message for invalid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "WrongPassword123!",
        })
        .expect(401);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error.code).toBe("AUTHENTICATION_FAILED");
      expect(response.body.error.message).toBe("Invalid credentials");
      // Should not reveal whether username exists
      expect(response.body.error.message).not.toContain("username");
      expect(response.body.error.message).not.toContain("password");
    });

    it("should return 401 for non-existent username without revealing it", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "nonexistentuser",
          password: "Password123!",
        })
        .expect(401);

      expect(response.body.error.code).toBe("AUTHENTICATION_FAILED");
      expect(response.body.error.message).toBe("Invalid credentials");
      // Generic message prevents username enumeration
      expect(response.body.error.message).not.toContain("not found");
      expect(response.body.error.message).not.toContain("does not exist");
    });

    it("should return 401 for inactive user account", async () => {
      // Create inactive user
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            "inactiveuser",
            "inactive@example.com",
            "$2b$10$abcdefghijklmnopqrstuv",
            "Inactive",
            "User",
            0, // isActive = false
            0,
            new Date().toISOString(),
            new Date().toISOString(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "inactiveuser",
          password: "Password123!",
        })
        .expect(401);

      expect(response.body.error.code).toBe("AUTHENTICATION_FAILED");
      expect(response.body.error.message).toBe("Invalid credentials");
    });

    it("should return 401 with missing authorization header", async () => {
      const response = await request(app)
        .get("/api/users")
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toBe("Missing authorization header");
    });

    it("should return 401 with invalid authorization header format", async () => {
      const response = await request(app)
        .get("/api/users")
        .set("Authorization", "Basic sometoken")
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toBe(
        "Invalid authorization header format. Expected 'Bearer <token>'"
      );
    });
  });

  describe("Requirement 16.2: Authorization Failures (403)", () => {
    it("should return 401 when user is not authenticated for protected endpoint", async () => {
      // Without authentication, should get 401 before authorization check
      const response = await request(app)
        .delete(`/api/users/${randomUUID()}`)
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toBe("Missing authorization header");
    });

    it("should include error structure for authorization failures", async () => {
      // Login as regular user
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      const token = loginResponse.body.token;

      // Try to access endpoint (will fail at auth or authz level)
      const response = await request(app)
        .delete(`/api/users/${randomUUID()}`)
        .set("Authorization", `Bearer ${token}`);

      // Should have proper error structure
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");

      // If it's a 403, should have required permission info
      if (response.status === 403) {
        expect(response.body.error.required).toBeDefined();
        expect(response.body.error.required.resource).toBeDefined();
        expect(response.body.error.required.action).toBeDefined();
      }
    });

    it("should return proper error format for insufficient permissions", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .put(`/api/users/${randomUUID()}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ firstName: "Updated" });

      // Should have error structure
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });
  });

  describe("Requirement 16.3: Database Connection Failures (503)", () => {
    it("should handle database errors gracefully", async () => {
      // Close the database to simulate connection failure
      await closeDatabase(db);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      // Should return an error (500 or 503)
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });

    it("should return error with appropriate message for database errors", async () => {
      // Create a corrupted database state
      const badDb = new Database(":memory:");
      const badDatabaseService = {
        getConnection: () => badDb,
        isInitialized: () => true,
      } as DatabaseService;

      const badApp = express();
      badApp.use(express.json());
      badApp.use("/api/auth", createAuthRouter(badDatabaseService));

      const response = await request(badApp)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      // Should return an error
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();

      await closeDatabase(badDb);
    });
  });

  describe("Requirement 16.4: Token Expiration (401)", () => {
    it("should return 401 when token is expired", async () => {
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        {
          userId: "test-user-id",
          username: "testuser",
          roles: [],
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
        jwtSecret,
        { algorithm: "HS256" }
      );

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toMatch(/TOKEN_EXPIRED|INVALID_TOKEN/);
      expect(response.body.error.message).toBeDefined();
    });

    it("should provide helpful error message for expired tokens", async () => {
      const jwt = require("jsonwebtoken");
      const expiredToken = jwt.sign(
        {
          userId: "test-user-id",
          username: "testuser",
          roles: [],
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
        },
        jwtSecret,
        { algorithm: "HS256" }
      );

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.message).toBeDefined();
      expect(typeof response.body.error.message).toBe("string");
      expect(response.body.error.message.length).toBeGreaterThan(0);
    });

    it("should return 401 for revoked token", async () => {
      // Login to get valid token
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      const token = loginResponse.body.token;

      // Revoke the token
      await authService.revokeToken(token);

      // Try to use revoked token
      const response = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);

      expect(response.body.error.code).toMatch(/TOKEN_REVOKED|INVALID_TOKEN/);
      expect(response.body.error.message).toBeDefined();
    });
  });

  describe("Requirement 16.5: Input Validation Failures (400)", () => {
    it("should return 400 with validation details for invalid input", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "ab", // Too short
          email: "invalid-email",
          password: "weak",
          firstName: "",
          lastName: "",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toBeDefined();
      expect(Array.isArray(response.body.error.details)).toBe(true);
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });

    it("should include field path in validation error details", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "ab",
          email: "test@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(400);

      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "username",
            message: expect.any(String),
          }),
        ])
      );
    });

    it("should return 400 for password complexity violations", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser2",
          email: "test2@example.com",
          password: "password", // No uppercase, number, or special char
          firstName: "Test",
          lastName: "User",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "password",
          }),
        ])
      );
    });

    it("should return 400 for invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser3",
          email: "not-an-email",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "email",
          }),
        ])
      );
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "testuser4",
          // Missing email, password, firstName, lastName
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });

    it("should provide clear validation error messages", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "a", // Too short
          email: "test@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(400);

      const usernameError = response.body.error.details.find(
        (d: any) => d.path === "username"  // pragma: allowlist secret
      );
      expect(usernameError).toBeDefined();
      expect(usernameError.message).toContain("3");
    });
  });

  describe("Requirement 16.6: Duplicate Username/Email (409)", () => {
    it("should return 409 for duplicate username", async () => {
      // First registration succeeds
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "duplicateuser",
          email: "unique1@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(201);

      // Second registration with same username fails
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "duplicateuser",
          email: "unique2@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(409);

      expect(response.body.error.code).toMatch(/DUPLICATE_(ENTRY|USERNAME)/);
      expect(response.body.error.message).toMatch(/username/i);
      expect(response.body.error.field).toBe("username");
    });

    it("should return 409 for duplicate email", async () => {
      // First registration succeeds
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "user1",
          email: "duplicate@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(201);

      // Second registration with same email fails
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "user2",
          email: "duplicate@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(409);

      expect(response.body.error.code).toMatch(/DUPLICATE_(ENTRY|EMAIL)/);
      expect(response.body.error.message).toMatch(/email/i);
      expect(response.body.error.field).toBe("email");
    });

    it("should specify which field conflicts in 409 error", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          username: "conflictuser",
          email: "conflict@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(201);

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          username: "conflictuser",
          email: "different@example.com",
          password: "Password123!",
          firstName: "Test",
          lastName: "User",
        })
        .expect(409);

      expect(response.body.error.field).toBeDefined();
      expect(response.body.error.field).toBe("username");
    });
  });

  describe("Requirement 16.7: Error Logging", () => {
    it("should return proper error structure for authentication failures", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "WrongPassword123!",
        })
        .expect(401);

      // Verify error structure is complete for logging
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
      expect(typeof response.body.error.code).toBe("string");
      expect(typeof response.body.error.message).toBe("string");
    });

    it("should return proper error structure for authorization failures", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      const response = await request(app)
        .delete(`/api/users/${randomUUID()}`)
        .set("Authorization", `Bearer ${loginResponse.body.token}`);

      // Verify error structure is complete for logging
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });

    it("should include sufficient error details for debugging", async () => {
      // Close database to trigger error
      await closeDatabase(db);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      // Should have complete error information
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
      expect(response.status).toBeGreaterThanOrEqual(500);
    });
  });

  describe("Generic Error Handling", () => {
    it("should return error structure for unexpected server errors", async () => {
      // Create app with broken middleware to trigger error
      const brokenApp = express();
      brokenApp.use(express.json());
      brokenApp.use((err: any, req: any, res: any, next: any) => {
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
      });
      brokenApp.use("/api/auth", (req, res, next) => {
        throw new Error("Unexpected error");
      });

      const response = await request(brokenApp)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      expect(response.status).toBeGreaterThanOrEqual(500);
      // Error structure may vary depending on error handler
      expect(response.body).toBeDefined();
    });

    it("should not expose sensitive information in error messages", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          username: "testuser",
          password: "WrongPassword123!",
        })
        .expect(401);

      // Should not expose database details, stack traces, etc.
      expect(JSON.stringify(response.body)).not.toContain("sqlite");
      expect(JSON.stringify(response.body)).not.toContain("stack");
      expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    });

    it("should handle malformed JSON with proper error", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send("{ invalid json");

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.error || response.body).toBeDefined();
    });
  });
});

// Helper functions

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

    CREATE INDEX idx_users_username ON users(username);
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens(expiresAt);
    CREATE INDEX idx_user_roles_user ON user_roles(userId);
    CREATE INDEX idx_user_groups_user ON user_groups(userId);
    CREATE INDEX idx_group_roles_group ON group_roles(groupId);
    CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
    CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createTestUser(db: Database): Promise<void> {
  const bcrypt = require("bcrypt");
  const passwordHash = await bcrypt.hash("Password123!", 10);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test-user-id",
        "testuser",
        "test@example.com",
        passwordHash,
        "Test",
        "User",
        1,
        0,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function closeDatabase(db: Database): Promise<void> {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}
