import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Mock IntegrationConfigService
const mockSaveConfig = vi.fn();
const mockGetEffectiveConfig = vi.fn();
const mockDeleteConfig = vi.fn();
const mockListConfigs = vi.fn();

vi.mock("../src/services/IntegrationConfigService", () => ({
  IntegrationConfigService: class {
    saveConfig = mockSaveConfig;
    getEffectiveConfig = mockGetEffectiveConfig;
    deleteConfig = mockDeleteConfig;
    listConfigs = mockListConfigs;
  },
}));

// Mock auth middleware — pass through and set req.user
vi.mock("../src/middleware/authMiddleware", () => ({
  createAuthMiddleware: () => {
    return (req: any, _res: any, next: any) => {
      // If test sets no-auth header, skip setting user
      if (req.headers["x-test-no-auth"] === "true") {
        return next();
      }
      req.user = {
        userId: "user-123",
        username: "testuser",
        roles: ["Administrator"],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      next();
    };
  },
}));

// Mock RBAC middleware — check for x-test-forbidden header
vi.mock("../src/middleware/rbacMiddleware", () => ({
  createRbacMiddleware: () => {
    return (resource: string, action: string) => {
      return (req: any, res: any, next: any) => {
        if (req.headers["x-test-forbidden"] === "true") {
          return res.status(403).json({
            error: {
              code: "INSUFFICIENT_PERMISSIONS",
              message: "Insufficient permissions",
              required: { resource, action },
            },
          });
        }
        next();
      };
    };
  },
}));

// Mock LoggerService
vi.mock("../src/services/LoggerService", () => ({
  LoggerService: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

import { createIntegrationConfigRouter } from "../src/routes/integrationConfig";

describe("Integration Config Routes", () => {
  let app: Express;

  const fakeDatabaseService = {
    getConnection: () => ({} as any),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/config/integrations", createIntegrationConfigRouter(fakeDatabaseService));
  });

  // ---- Authentication tests ----

  describe("Authentication", () => {
    it("GET / returns 401 when user is not authenticated", async () => {
      const res = await request(app)
        .get("/api/config/integrations")
        .set("x-test-no-auth", "true")
        .expect(401);

      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("PUT /:name returns 401 when user is not authenticated", async () => {
      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .set("x-test-no-auth", "true")
        .send({ config: { host: "10.0.0.1" } })
        .expect(401);

      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("DELETE /:name returns 401 when user is not authenticated", async () => {
      const res = await request(app)
        .delete("/api/config/integrations/proxmox")
        .set("x-test-no-auth", "true")
        .expect(401);

      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ---- Authorization tests ----

  describe("Authorization", () => {
    it("GET / returns 403 when user lacks integration_config:read", async () => {
      const res = await request(app)
        .get("/api/config/integrations")
        .set("x-test-forbidden", "true")
        .expect(403);

      expect(res.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("PUT /:name returns 403 when user lacks integration_config:configure", async () => {
      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .set("x-test-forbidden", "true")
        .send({ config: { host: "10.0.0.1" } })
        .expect(403);

      expect(res.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("DELETE /:name returns 403 when user lacks integration_config:configure", async () => {
      const res = await request(app)
        .delete("/api/config/integrations/proxmox")
        .set("x-test-forbidden", "true")
        .expect(403);

      expect(res.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
    });
  });

  // ---- Validation tests ----

  describe("Validation", () => {
    it("PUT /:name returns 400 when body is missing config", async () => {
      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("PUT /:name returns 400 when config is not an object", async () => {
      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .send({ config: "not-an-object" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ---- Happy path tests ----

  describe("GET /api/config/integrations", () => {
    it("returns list of configs for the authenticated user", async () => {
      const mockConfigs = [
        { id: "cfg-1", userId: "user-123", integrationName: "proxmox", config: { host: "10.0.0.1" }, isActive: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
      ];
      mockListConfigs.mockResolvedValue(mockConfigs);

      const res = await request(app)
        .get("/api/config/integrations")
        .expect(200);

      expect(res.body.configs).toEqual(mockConfigs);
      expect(mockListConfigs).toHaveBeenCalledWith("user-123");
    });
  });

  describe("GET /api/config/integrations/:name", () => {
    it("returns effective config for the integration", async () => {
      const effectiveConfig = { host: "10.0.0.1", port: 8006 };
      mockGetEffectiveConfig.mockResolvedValue(effectiveConfig);

      const res = await request(app)
        .get("/api/config/integrations/proxmox")
        .expect(200);

      expect(res.body.config).toEqual(effectiveConfig);
      expect(mockGetEffectiveConfig).toHaveBeenCalledWith("proxmox");
    });

    it("returns empty object when no config exists", async () => {
      mockGetEffectiveConfig.mockResolvedValue({});

      const res = await request(app)
        .get("/api/config/integrations/unknown")
        .expect(200);

      expect(res.body.config).toEqual({});
    });
  });

  describe("PUT /api/config/integrations/:name", () => {
    it("saves config and returns success", async () => {
      mockSaveConfig.mockResolvedValue(undefined);

      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .send({ config: { host: "10.0.0.1", api_token: "secret-value" } })
        .expect(200);

      expect(res.body.message).toBe("Config saved successfully");
      expect(mockSaveConfig).toHaveBeenCalledWith(
        "user-123",
        "proxmox",
        { host: "10.0.0.1", api_token: "secret-value" },
      );
    });

    it("returns 500 when service throws", async () => {
      mockSaveConfig.mockRejectedValue(new Error("DB error"));

      const res = await request(app)
        .put("/api/config/integrations/proxmox")
        .send({ config: { host: "10.0.0.1" } })
        .expect(500);

      expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("DELETE /api/config/integrations/:name", () => {
    it("deletes config and returns success", async () => {
      mockDeleteConfig.mockResolvedValue(undefined);

      const res = await request(app)
        .delete("/api/config/integrations/proxmox")
        .expect(200);

      expect(res.body.message).toBe("Config deleted successfully");
      expect(mockDeleteConfig).toHaveBeenCalledWith("user-123", "proxmox");
    });

    it("returns 500 when service throws", async () => {
      mockDeleteConfig.mockRejectedValue(new Error("DB error"));

      const res = await request(app)
        .delete("/api/config/integrations/proxmox")
        .expect(500);

      expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });
});
