import express, { type Express } from "express";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createAWSRouter } from "../../src/routes/integrations/aws";
import { DatabaseService } from "../../src/database/DatabaseService";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { PermissionService } from "../../src/services/PermissionService";
import { RoleService } from "../../src/services/RoleService";
import { AWSAuthenticationError } from "../../src/integrations/aws/types";
import type { AWSPlugin } from "../../src/integrations/aws/AWSPlugin";

/**
 * Create a mock AWSPlugin with vi.fn() stubs for all methods used by the router
 */
function createMockAWSPlugin(): AWSPlugin {
  return {
    getInventory: vi.fn().mockResolvedValue([]),
    executeAction: vi.fn().mockResolvedValue({
      id: "aws-test-1",
      type: "task",
      targetNodes: ["new"],
      action: "provision",
      status: "success",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [],
    }),
    getRegions: vi.fn().mockResolvedValue(["us-east-1", "us-west-2"]),
    getInstanceTypes: vi.fn().mockResolvedValue([]),
    getAMIs: vi.fn().mockResolvedValue([]),
    getVPCs: vi.fn().mockResolvedValue([]),
    getSubnets: vi.fn().mockResolvedValue([]),
    getSecurityGroups: vi.fn().mockResolvedValue([]),
    getKeyPairs: vi.fn().mockResolvedValue([]),
  } as unknown as AWSPlugin;
}

describe("AWS Router", () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let mockPlugin: AWSPlugin;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(":memory:");
    await databaseService.initialize();

    const jwtSecret = "test-secret-key"; // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    mockPlugin = createMockAWSPlugin();

    // Create admin user with aws permissions
    const adminUser = await userService.createUser({
      username: "aws_admin",
      email: "aws_admin@test.com",
      password: "AdminPass123!",
      firstName: "AWS",
      lastName: "Admin",
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Ensure aws permissions exist
    const permNames = [
      { resource: "aws", action: "read", description: "Read AWS resources" },
      { resource: "aws", action: "provision", description: "Provision AWS resources" },
      { resource: "aws", action: "lifecycle", description: "AWS lifecycle actions" },
    ];

    const permIds: string[] = [];
    for (const p of permNames) {
      try {
        const perm = await permissionService.createPermission(p);
        permIds.push(perm.id);
      } catch {
        const all = await permissionService.listPermissions();
        const found = all.items.find(
          (x) => x.resource === p.resource && x.action === p.action
        );
        if (found) permIds.push(found.id);
      }
    }

    // Create role with aws permissions
    const awsRole = await roleService.createRole({
      name: "AWSAdmin",
      description: "Can manage AWS resources",
    });

    for (const pid of permIds) {
      await roleService.assignPermissionToRole(awsRole.id, pid);
    }
    await userService.assignRoleToUser(adminUserId, awsRole.id);

    adminToken = await authService.generateToken(adminUser);

    // Build app with the mock plugin
    app = express();
    app.use(express.json());
    app.use("/api/integrations/aws", createAWSRouter(mockPlugin));
  });

  afterEach(async () => {
    const db = databaseService.getConnection();
    await db.execute("DELETE FROM user_roles");
    await db.execute("DELETE FROM role_permissions");
    await db.execute('DELETE FROM users WHERE username = "aws_admin"');
    await db.execute('DELETE FROM roles WHERE name = "AWSAdmin"');
  });

  describe("GET /api/integrations/aws/inventory", () => {
    it("should return inventory from the plugin", async () => {
      const mockNodes = [
        { id: "aws:us-east-1:i-abc123", name: "test-instance", uri: "aws:us-east-1:i-abc123" },
      ];
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue(mockNodes);

      const response = await request(app).get("/api/integrations/aws/inventory");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("inventory");
      expect(response.body.inventory).toEqual(mockNodes);
    });

    it("should return 401 when AWS auth fails", async () => {
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AWSAuthenticationError("Invalid credentials")
      );

      const response = await request(app).get("/api/integrations/aws/inventory");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 500 on generic error", async () => {
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Something went wrong")
      );

      const response = await request(app).get("/api/integrations/aws/inventory");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("POST /api/integrations/aws/provision", () => {
    it("should provision an instance with valid params", async () => {
      const response = await request(app)
        .post("/api/integrations/aws/provision")
        .send({ imageId: "ami-12345", instanceType: "t2.micro" });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result.status).toBe("success");
    });

    it("should return 400 when imageId is missing", async () => {
      const response = await request(app)
        .post("/api/integrations/aws/provision")
        .send({ instanceType: "t2.micro" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 401 on AWS auth error", async () => {
      (mockPlugin.executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AWSAuthenticationError("Expired token")
      );

      const response = await request(app)
        .post("/api/integrations/aws/provision")
        .send({ imageId: "ami-12345" });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/integrations/aws/lifecycle", () => {
    it("should execute a lifecycle action", async () => {
      const response = await request(app)
        .post("/api/integrations/aws/lifecycle")
        .send({ instanceId: "i-abc123", action: "stop" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("result");
    });

    it("should return 400 for invalid action", async () => {
      const response = await request(app)
        .post("/api/integrations/aws/lifecycle")
        .send({ instanceId: "i-abc123", action: "destroy" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when instanceId is missing", async () => {
      const response = await request(app)
        .post("/api/integrations/aws/lifecycle")
        .send({ action: "start" });

      expect(response.status).toBe(400);
    });

    it("should include region in target when provided", async () => {
      await request(app)
        .post("/api/integrations/aws/lifecycle")
        .send({ instanceId: "i-abc123", action: "reboot", region: "eu-west-1" });

      expect(mockPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "aws:eu-west-1:i-abc123",
          action: "reboot",
        })
      );
    });
  });

  describe("GET /api/integrations/aws/regions", () => {
    it("should return regions", async () => {
      const response = await request(app).get("/api/integrations/aws/regions");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("regions");
      expect(response.body.regions).toEqual(["us-east-1", "us-west-2"]);
    });
  });

  describe("GET /api/integrations/aws/instance-types", () => {
    it("should return instance types", async () => {
      const response = await request(app).get("/api/integrations/aws/instance-types");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("instanceTypes");
    });

    it("should pass region query param to plugin", async () => {
      await request(app)
        .get("/api/integrations/aws/instance-types")
        .query({ region: "eu-west-1" });

      expect(mockPlugin.getInstanceTypes).toHaveBeenCalledWith("eu-west-1");
    });
  });

  describe("GET /api/integrations/aws/amis", () => {
    it("should return AMIs for a region", async () => {
      const response = await request(app)
        .get("/api/integrations/aws/amis")
        .query({ region: "us-east-1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("amis");
    });

    it("should return 400 when region is missing", async () => {
      const response = await request(app).get("/api/integrations/aws/amis");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/integrations/aws/vpcs", () => {
    it("should return VPCs for a region", async () => {
      const response = await request(app)
        .get("/api/integrations/aws/vpcs")
        .query({ region: "us-east-1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("vpcs");
    });

    it("should return 400 when region is missing", async () => {
      const response = await request(app).get("/api/integrations/aws/vpcs");
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/integrations/aws/subnets", () => {
    it("should return subnets for a region", async () => {
      const response = await request(app)
        .get("/api/integrations/aws/subnets")
        .query({ region: "us-east-1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("subnets");
    });

    it("should pass vpcId filter when provided", async () => {
      await request(app)
        .get("/api/integrations/aws/subnets")
        .query({ region: "us-east-1", vpcId: "vpc-123" });

      expect(mockPlugin.getSubnets).toHaveBeenCalledWith("us-east-1", "vpc-123");
    });

    it("should return 400 when region is missing", async () => {
      const response = await request(app).get("/api/integrations/aws/subnets");
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/integrations/aws/security-groups", () => {
    it("should return security groups for a region", async () => {
      const response = await request(app)
        .get("/api/integrations/aws/security-groups")
        .query({ region: "us-east-1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("securityGroups");
    });

    it("should pass vpcId filter when provided", async () => {
      await request(app)
        .get("/api/integrations/aws/security-groups")
        .query({ region: "us-east-1", vpcId: "vpc-456" });

      expect(mockPlugin.getSecurityGroups).toHaveBeenCalledWith("us-east-1", "vpc-456");
    });
  });

  describe("GET /api/integrations/aws/key-pairs", () => {
    it("should return key pairs for a region", async () => {
      const response = await request(app)
        .get("/api/integrations/aws/key-pairs")
        .query({ region: "us-east-1" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("keyPairs");
    });

    it("should return 400 when region is missing", async () => {
      const response = await request(app).get("/api/integrations/aws/key-pairs");
      expect(response.status).toBe(400);
    });
  });
});
