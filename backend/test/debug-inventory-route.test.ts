import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { BoltService } from "../src/bolt/BoltService";
import { IntegrationManager } from "../src/integrations/IntegrationManager";
import { createInventoryRouter } from "../src/routes/inventory";
import { requestIdMiddleware } from "../src/middleware/errorHandler";
import { expertModeMiddleware } from "../src/middleware/expertMode";
import type { Node } from "../src/bolt/types";

// Mock child_process to avoid actual Bolt CLI execution
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("Debug Inventory Route", () => {
  let app: Express;
  let boltService: BoltService;
  let integrationManager: IntegrationManager;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(expertModeMiddleware);

    // Add a debug middleware to log req.expertMode
    app.use((req, _res, next) => {
      console.log("req.expertMode:", req.expertMode);
      console.log("req.headers['x-expert-mode']:", req.headers['x-expert-mode']);
      next();
    });

    boltService = new BoltService("./bolt-project", 5000);
    integrationManager = new IntegrationManager();

    vi.spyOn(boltService, "getInventory").mockResolvedValue([
      {
        id: "node1",
        name: "node1.example.com",
        uri: "ssh://node1.example.com",
      } as Node,
      {
        id: "node2",
        name: "node2.example.com",
        uri: "ssh://node2.example.com",
      } as Node,
    ]);

    app.use("/api/inventory", createInventoryRouter(boltService, integrationManager));

    vi.clearAllMocks();
  });

  it("should NOT include debug info when expert mode is disabled", async () => {
    const response = await request(app)
      .get("/api/inventory")
      .expect(200);

    console.log("Response body keys:", Object.keys(response.body));
    console.log("Response body._debug:", response.body._debug);

    expect(response.body._debug).toBeUndefined();
  });

  it("should include debug info when expert mode is enabled", async () => {
    const response = await request(app)
      .get("/api/inventory")
      .set("X-Expert-Mode", "true")
      .expect(200);

    console.log("Response body keys:", Object.keys(response.body));
    console.log("Response body._debug:", response.body._debug);

    expect(response.body._debug).toBeDefined();
  });
});
