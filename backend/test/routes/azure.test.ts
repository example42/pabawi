/**
 * Tests for Azure Router
 *
 * Validates: auth/validation/403 guard behavior, inventory, provision,
 * lifecycle, locations, vm-sizes, images, resource-groups endpoints.
 */

import express, { type Express } from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAzureRouter } from "../../src/routes/integrations/azure";
import { AzureAuthenticationError } from "../../src/integrations/azure/types";
import type { AzurePlugin } from "../../src/integrations/azure/AzurePlugin";

/**
 * Create a mock AzurePlugin with vi.fn() stubs for all methods used by the router.
 */
function createMockAzurePlugin(): AzurePlugin {
  return {
    getInventory: vi.fn().mockResolvedValue([]),
    executeAction: vi.fn().mockResolvedValue({
      id: "azure-test-1",
      type: "task",
      targetNodes: ["new"],
      action: "provision",
      status: "success",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [],
    }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "OK" }),
    getLocations: vi.fn().mockResolvedValue([
      { name: "eastus", displayName: "East US" },
      { name: "westeurope", displayName: "West Europe" },
    ]),
    getVMSizes: vi.fn().mockResolvedValue([
      { name: "Standard_B1s", vCpus: 1, memoryMB: 1024, osDiskSizeGB: 30 },
    ]),
    getImages: vi.fn().mockResolvedValue([
      { publisher: "Canonical", offer: "UbuntuServer", sku: "18.04-LTS", version: "18.04.202101290" },
    ]),
    getResourceGroups: vi.fn().mockResolvedValue([
      { name: "my-rg", location: "eastus", tags: {} },
    ]),
  } as unknown as AzurePlugin;
}

describe("Azure Router", () => {
  let app: Express;
  let mockPlugin: AzurePlugin;

  beforeEach(() => {
    mockPlugin = createMockAzurePlugin();
    app = express();
    app.use(express.json());
    app.use("/api/integrations/azure", createAzureRouter(mockPlugin, undefined, { allowDestructiveActions: true }));
  });

  // ─── Inventory ───────────────────────────────────────────────────────────

  describe("GET /api/integrations/azure/inventory", () => {
    it("should return inventory from the plugin", async () => {
      const mockNodes = [
        { id: "azure:sub-1:rg-1:vm-1", name: "vm-1", uri: "azure:sub-1:rg-1:vm-1" },
      ];
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue(mockNodes);

      const response = await request(app).get("/api/integrations/azure/inventory");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("inventory");
      expect(response.body.inventory).toEqual(mockNodes);
    });

    it("should return 401 when Azure auth fails", async () => {
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Invalid credentials"),
      );

      const response = await request(app).get("/api/integrations/azure/inventory");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 500 on generic error", async () => {
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Something went wrong"),
      );

      const response = await request(app).get("/api/integrations/azure/inventory");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  // ─── Provision ────────────────────────────────────────────────────────────

  describe("POST /api/integrations/azure/provision", () => {
    const validProvisionBody = {
      resourceGroup: "my-rg",
      vmName: "my-vm",
      location: "eastus",
      imageReference: { publisher: "Canonical", offer: "UbuntuServer", sku: "18.04-LTS" },
      adminUsername: "azureuser",
      networkInterfaceId: "/subscriptions/sub-1/resourceGroups/my-rg/providers/Microsoft.Network/networkInterfaces/nic-1",
    };

    it("should provision a VM with valid params and return 201", async () => {
      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(validProvisionBody);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result.status).toBe("success");
    });

    it("should return 400 when resourceGroup is missing", async () => {
      const { resourceGroup: _rg, ...body } = validProvisionBody;
      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when networkInterfaceId is missing", async () => {
      const { networkInterfaceId: _nic, ...body } = validProvisionBody;
      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when adminUsername is missing", async () => {
      const { adminUsername: _u, ...body } = validProvisionBody;
      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 401 on Azure auth error", async () => {
      (mockPlugin.executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Expired token"),
      );

      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(validProvisionBody);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 500 on generic error", async () => {
      (mockPlugin.executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Azure SDK error"),
      );

      const response = await request(app)
        .post("/api/integrations/azure/provision")
        .send(validProvisionBody);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe("POST /api/integrations/azure/lifecycle", () => {
    it("should execute a lifecycle action (start)", async () => {
      (mockPlugin.executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "azure-start-1",
        type: "command",
        targetNodes: ["azure:rg-1:my-vm"],
        action: "start",
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        results: [],
      });

      const response = await request(app)
        .post("/api/integrations/azure/lifecycle")
        .send({ vmName: "my-vm", resourceGroup: "rg-1", action: "start" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("result");
      expect(response.body.result.action).toBe("start");
    });

    it("should return 400 for invalid action", async () => {
      const response = await request(app)
        .post("/api/integrations/azure/lifecycle")
        .send({ vmName: "my-vm", resourceGroup: "rg-1", action: "destroy" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when vmName is missing", async () => {
      const response = await request(app)
        .post("/api/integrations/azure/lifecycle")
        .send({ resourceGroup: "rg-1", action: "stop" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject deallocate when destructive actions are disabled", async () => {
      const restrictedApp = express();
      restrictedApp.use(express.json());
      restrictedApp.use(
        "/api/integrations/azure",
        createAzureRouter(mockPlugin, undefined, { allowDestructiveActions: false }),
      );

      const response = await request(restrictedApp)
        .post("/api/integrations/azure/lifecycle")
        .send({ vmName: "my-vm", resourceGroup: "rg-1", action: "deallocate" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("DESTRUCTIVE_ACTION_DISABLED");
    });

    it("should use canonical target format azure:{rg}:{vmName}", async () => {
      await request(app)
        .post("/api/integrations/azure/lifecycle")
        .send({ vmName: "my-vm", resourceGroup: "rg-1", action: "restart" });

      expect(mockPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "azure:rg-1:my-vm",
          action: "restart",
        }),
      );
    });

    it("should return 401 on Azure auth error", async () => {
      (mockPlugin.executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Auth failed"),
      );

      const response = await request(app)
        .post("/api/integrations/azure/lifecycle")
        .send({ vmName: "my-vm", resourceGroup: "rg-1", action: "stop" });

      expect(response.status).toBe(401);
    });
  });

  // ─── Test Connection ─────────────────────────────────────────────────────

  describe("POST /api/integrations/azure/test", () => {
    it("should return success when health check passes", async () => {
      const response = await request(app).post("/api/integrations/azure/test");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return failure when health check fails", async () => {
      (mockPlugin.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        healthy: false,
        message: "Auth failed",
      });

      const response = await request(app).post("/api/integrations/azure/test");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });
  });

  // ─── Locations ───────────────────────────────────────────────────────────

  describe("GET /api/integrations/azure/locations", () => {
    it("should return available locations", async () => {
      const response = await request(app).get("/api/integrations/azure/locations");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("locations");
      expect(response.body.locations).toHaveLength(2);
    });

    it("should return 401 on auth error", async () => {
      (mockPlugin.getLocations as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Auth failed"),
      );

      const response = await request(app).get("/api/integrations/azure/locations");

      expect(response.status).toBe(401);
    });
  });

  // ─── VM Sizes ─────────────────────────────────────────────────────────────

  describe("GET /api/integrations/azure/vm-sizes", () => {
    it("should return VM sizes for a location", async () => {
      const response = await request(app)
        .get("/api/integrations/azure/vm-sizes")
        .query({ location: "eastus" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("vmSizes");
      expect(mockPlugin.getVMSizes).toHaveBeenCalledWith("eastus");
    });

    it("should return 400 when location is missing", async () => {
      const response = await request(app).get("/api/integrations/azure/vm-sizes");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ─── Images ──────────────────────────────────────────────────────────────

  describe("GET /api/integrations/azure/images", () => {
    it("should return images and pass all query params including location", async () => {
      const response = await request(app)
        .get("/api/integrations/azure/images")
        .query({ location: "westeurope", publisher: "Canonical", offer: "UbuntuServer", sku: "18.04-LTS" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("images");
      expect(mockPlugin.getImages).toHaveBeenCalledWith("westeurope", "Canonical", "UbuntuServer", "18.04-LTS");
    });

    it("should work without location (falls back to plugin default)", async () => {
      const response = await request(app)
        .get("/api/integrations/azure/images")
        .query({ publisher: "Canonical", offer: "UbuntuServer", sku: "18.04-LTS" });

      expect(response.status).toBe(200);
      expect(mockPlugin.getImages).toHaveBeenCalledWith(undefined, "Canonical", "UbuntuServer", "18.04-LTS");
    });

    it("should return 401 on auth error", async () => {
      (mockPlugin.getImages as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Auth failed"),
      );

      const response = await request(app)
        .get("/api/integrations/azure/images")
        .query({ publisher: "Canonical", offer: "UbuntuServer", sku: "18.04-LTS" });

      expect(response.status).toBe(401);
    });
  });

  // ─── Resource Groups ─────────────────────────────────────────────────────

  describe("GET /api/integrations/azure/resource-groups", () => {
    it("should return resource groups", async () => {
      const response = await request(app).get("/api/integrations/azure/resource-groups");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("resourceGroups");
      expect(response.body.resourceGroups).toHaveLength(1);
    });

    it("should return 401 on auth error", async () => {
      (mockPlugin.getResourceGroups as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AzureAuthenticationError("Auth failed"),
      );

      const response = await request(app).get("/api/integrations/azure/resource-groups");

      expect(response.status).toBe(401);
    });

    it("should return 500 on generic error", async () => {
      (mockPlugin.getResourceGroups as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Azure SDK error"),
      );

      const response = await request(app).get("/api/integrations/azure/resource-groups");

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });
});
