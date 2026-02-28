import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import sqlite3 from "sqlite3";
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { createExecutionsRouter } from "../../src/routes/executions";
import { errorHandler, requestIdMiddleware } from "../../src/middleware/errorHandler";
import type { BatchExecutionService } from "../../src/services/BatchExecutionService";
import type { BatchStatusResponse, BatchExecutionResponse } from "../../src/services/BatchExecutionService";
import { BatchExecutionService as RealBatchExecutionService } from "../../src/services/BatchExecutionService";
import type { ExecutionQueue } from "../../src/services/ExecutionQueue";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";

/**
 * Integration tests for batch execution API endpoints
 *
 * **Validates: Requirements 5.1, 5.2, 5.8, 5.9, 5.10, 6.1, 6.2, 6.6, 6.7, 8.2, 8.9, 15.3**
 */
describe("Batch Execution API Endpoints", () => {
  let app: Express;
  let executionRepository: ExecutionRepository;
  let batchExecutionService: BatchExecutionService;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Mock execution repository
    executionRepository = {} as ExecutionRepository;

    // Mock batch execution service
    batchExecutionService = {
      createBatch: vi.fn(),
      getBatchStatus: vi.fn(),
      cancelBatch: vi.fn(),
    } as unknown as BatchExecutionService;

    // Add routes
    app.use(
      "/api/executions",
      createExecutionsRouter(executionRepository, undefined, batchExecutionService)
    );

    // Add error handler
    app.use(errorHandler);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/executions/batch", () => {
    it("should create batch execution with node IDs and return batch details", async () => {
      const mockResponse: BatchExecutionResponse = {
        batchId: "batch-123",
        executionIds: ["exec-1", "exec-2", "exec-3"],
        targetCount: 3,
        expandedNodeIds: ["node1", "node2", "node3"],
      };

      vi.spyOn(batchExecutionService, "createBatch").mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1", "node2", "node3"],
          type: "command",
          action: "uptime",
        })
        .expect(201);

      expect(response.body).toHaveProperty("batchId", "batch-123");
      expect(response.body).toHaveProperty("executionIds");
      expect(response.body.executionIds).toHaveLength(3);
      expect(response.body).toHaveProperty("targetCount", 3);
      expect(response.body).toHaveProperty("expandedNodeIds");
      expect(batchExecutionService.createBatch).toHaveBeenCalledWith(
        {
          targetNodeIds: ["node1", "node2", "node3"],
          type: "command",
          action: "uptime",
        },
        "unknown"
      );
    });

    it("should create batch execution with group IDs", async () => {
      const mockResponse: BatchExecutionResponse = {
        batchId: "batch-456",
        executionIds: ["exec-1", "exec-2"],
        targetCount: 2,
        expandedNodeIds: ["node1", "node2"],
      };

      vi.spyOn(batchExecutionService, "createBatch").mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetGroupIds: ["group1"],
          type: "task",
          action: "package::install",
          parameters: { name: "nginx" },
        })
        .expect(201);

      expect(response.body.batchId).toBe("batch-456");
      expect(response.body.targetCount).toBe(2);
      expect(batchExecutionService.createBatch).toHaveBeenCalledWith(
        {
          targetGroupIds: ["group1"],
          type: "task",
          action: "package::install",
          parameters: { name: "nginx" },
        },
        "unknown"
      );
    });

    it("should create batch execution with mixed node and group IDs", async () => {
      const mockResponse: BatchExecutionResponse = {
        batchId: "batch-789",
        executionIds: ["exec-1", "exec-2", "exec-3", "exec-4"],
        targetCount: 4,
        expandedNodeIds: ["node1", "node2", "node3", "node4"],
      };

      vi.spyOn(batchExecutionService, "createBatch").mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1", "node2"],
          targetGroupIds: ["group1"],
          type: "command",
          action: "hostname",
        })
        .expect(201);

      expect(response.body.batchId).toBe("batch-789");
      expect(response.body.targetCount).toBe(4);
    });

    it("should return 400 when no targets are specified", async () => {
      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          type: "command",
          action: "uptime",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toContain("Invalid request body");
      expect(batchExecutionService.createBatch).not.toHaveBeenCalled();
    });

    it("should return 400 when action is missing", async () => {
      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1"],
          type: "command",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(batchExecutionService.createBatch).not.toHaveBeenCalled();
    });

    it("should return 400 when type is invalid", async () => {
      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1"],
          type: "invalid-type",
          action: "uptime",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(batchExecutionService.createBatch).not.toHaveBeenCalled();
    });

    it("should return 400 when node IDs are invalid", async () => {
      vi.spyOn(batchExecutionService, "createBatch").mockRejectedValue(
        new Error("Invalid node IDs: node-nonexistent")
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node-nonexistent"],
          type: "command",
          action: "uptime",
        })
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_NODES");
      expect(response.body.error.message).toContain("invalid");
    });

    it("should return 429 when execution queue is full", async () => {
      vi.spyOn(batchExecutionService, "createBatch").mockRejectedValue(
        new Error("Execution queue is full. Maximum concurrent executions: 5")
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1", "node2", "node3"],
          type: "command",
          action: "uptime",
        })
        .expect(429);

      expect(response.body.error.code).toBe("QUEUE_FULL");
      expect(response.body.error.message).toContain("queue is full");
    });

    it("should return 500 on internal server error", async () => {
      vi.spyOn(batchExecutionService, "createBatch").mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await request(app)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1"],
          type: "command",
          action: "uptime",
        })
        .expect(500);

      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.body.error.message).toBe("Failed to create batch execution");
    });

    it("should return 500 when BatchExecutionService is not available", async () => {
      // Create app without batch execution service
      const appWithoutService = express();
      appWithoutService.use(express.json());
      appWithoutService.use(requestIdMiddleware);
      appWithoutService.use(
        "/api/executions",
        createExecutionsRouter(executionRepository, undefined, undefined)
      );
      appWithoutService.use(errorHandler);

      const response = await request(appWithoutService)
        .post("/api/executions/batch")
        .send({
          targetNodeIds: ["node1"],
          type: "command",
          action: "uptime",
        })
        .expect(500);

      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(response.body.error.message).toContain("not available");
    });
  });

  describe("GET /api/executions/batch/:batchId", () => {
    it("should return batch status with aggregated statistics", async () => {
      const mockBatchStatus: BatchStatusResponse = {
        batch: {
          id: "batch-123",
          type: "command",
          action: "uptime",
          targetNodes: ["node1", "node2", "node3"],
          targetGroups: [],
          status: "running",
          createdAt: new Date("2024-01-01T00:00:00Z"),
          startedAt: new Date("2024-01-01T00:00:01Z"),
          userId: "user-1",
          executionIds: ["exec-1", "exec-2", "exec-3"],
          stats: {
            total: 3,
            queued: 0,
            running: 1,
            success: 2,
            failed: 0,
          },
        },
        executions: [
          {
            id: "exec-1",
            nodeId: "node1",
            nodeName: "node1.example.com",
            status: "success",
            startedAt: new Date("2024-01-01T00:00:01Z"),
            completedAt: new Date("2024-01-01T00:00:02Z"),
            duration: 1000,
            result: {
              exitCode: 0,
              stdout: "output",
              stderr: "",
            },
          },
          {
            id: "exec-2",
            nodeId: "node2",
            nodeName: "node2.example.com",
            status: "success",
            startedAt: new Date("2024-01-01T00:00:01Z"),
            completedAt: new Date("2024-01-01T00:00:03Z"),
            duration: 2000,
          },
          {
            id: "exec-3",
            nodeId: "node3",
            nodeName: "node3.example.com",
            status: "running",
            startedAt: new Date("2024-01-01T00:00:02Z"),
          },
        ],
        progress: 67,
      };

      vi.spyOn(batchExecutionService, "getBatchStatus").mockResolvedValue(
        mockBatchStatus
      );

      const response = await request(app)
        .get("/api/executions/batch/batch-123")
        .expect(200);

      expect(response.body).toHaveProperty("batch");
      expect(response.body).toHaveProperty("executions");
      expect(response.body).toHaveProperty("progress");
      expect(response.body.batch.id).toBe("batch-123");
      expect(response.body.batch.stats.total).toBe(3);
      expect(response.body.batch.stats.success).toBe(2);
      expect(response.body.executions).toHaveLength(3);
      expect(response.body.progress).toBe(67);
      expect(batchExecutionService.getBatchStatus).toHaveBeenCalledWith(
        "batch-123",
        undefined
      );
    });

    it("should support status query parameter for filtering", async () => {
      const mockBatchStatus: BatchStatusResponse = {
        batch: {
          id: "batch-123",
          type: "command",
          action: "uptime",
          targetNodes: ["node1"],
          targetGroups: [],
          status: "partial",
          createdAt: new Date("2024-01-01T00:00:00Z"),
          userId: "user-1",
          executionIds: ["exec-1"],
          stats: {
            total: 3,
            queued: 0,
            running: 0,
            success: 2,
            failed: 1,
          },
        },
        executions: [
          {
            id: "exec-1",
            nodeId: "node1",
            nodeName: "node1.example.com",
            status: "failed",
            startedAt: new Date("2024-01-01T00:00:01Z"),
            completedAt: new Date("2024-01-01T00:00:02Z"),
            duration: 1000,
            result: {
              exitCode: 1,
              stdout: "",
              stderr: "error",
            },
          },
        ],
        progress: 100,
      };

      vi.spyOn(batchExecutionService, "getBatchStatus").mockResolvedValue(
        mockBatchStatus
      );

      const response = await request(app)
        .get("/api/executions/batch/batch-123?status=failed")
        .expect(200);

      expect(response.body.executions).toHaveLength(1);
      expect(response.body.executions[0].status).toBe("failed");
      expect(batchExecutionService.getBatchStatus).toHaveBeenCalledWith(
        "batch-123",
        "failed"
      );
    });

    it("should return 404 when batch ID does not exist", async () => {
      vi.spyOn(batchExecutionService, "getBatchStatus").mockRejectedValue(
        new Error("Batch execution batch-nonexistent not found")
      );

      const response = await request(app)
        .get("/api/executions/batch/batch-nonexistent")
        .expect(404);

      expect(response.body.error.code).toBe("BATCH_NOT_FOUND");
      expect(response.body.error.message).toContain("not found");
    });

    it("should return 500 on internal server error", async () => {
      vi.spyOn(batchExecutionService, "getBatchStatus").mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await request(app)
        .get("/api/executions/batch/batch-123")
        .expect(500);

      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.body.error.message).toBe("Failed to fetch batch status");
    });

    it("should return 500 when BatchExecutionService is not available", async () => {
      // Create app without batch execution service
      const appWithoutService = express();
      appWithoutService.use(express.json());
      appWithoutService.use(requestIdMiddleware);
      appWithoutService.use(
        "/api/executions",
        createExecutionsRouter(executionRepository, undefined, undefined)
      );
      appWithoutService.use(errorHandler);

      const response = await request(appWithoutService)
        .get("/api/executions/batch/batch-123")
        .expect(500);

      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(response.body.error.message).toContain("not available");
    });
  });

  describe("POST /api/executions/batch/:batchId/cancel", () => {
    it("should cancel batch execution and return cancelled count", async () => {
      const mockResult = { cancelledCount: 3 };

      vi.spyOn(batchExecutionService, "cancelBatch").mockResolvedValue(
        mockResult
      );

      const response = await request(app)
        .post("/api/executions/batch/batch-123/cancel")
        .expect(200);

      expect(response.body).toHaveProperty("batchId", "batch-123");
      expect(response.body).toHaveProperty("cancelledCount", 3);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("Cancelled 3 executions");
      expect(batchExecutionService.cancelBatch).toHaveBeenCalledWith("batch-123");
    });

    it("should handle singular execution in message", async () => {
      const mockResult = { cancelledCount: 1 };

      vi.spyOn(batchExecutionService, "cancelBatch").mockResolvedValue(
        mockResult
      );

      const response = await request(app)
        .post("/api/executions/batch/batch-456/cancel")
        .expect(200);

      expect(response.body.cancelledCount).toBe(1);
      expect(response.body.message).toBe("Cancelled 1 execution");
    });

    it("should return 404 when batch ID does not exist", async () => {
      vi.spyOn(batchExecutionService, "cancelBatch").mockRejectedValue(
        new Error("Batch execution batch-nonexistent not found")
      );

      const response = await request(app)
        .post("/api/executions/batch/batch-nonexistent/cancel")
        .expect(404);

      expect(response.body.error.code).toBe("BATCH_NOT_FOUND");
      expect(response.body.error.message).toContain("not found");
    });

    it("should return 500 on internal server error", async () => {
      vi.spyOn(batchExecutionService, "cancelBatch").mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await request(app)
        .post("/api/executions/batch/batch-123/cancel")
        .expect(500);

      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.body.error.message).toBe("Failed to cancel batch execution");
    });

    it("should return 500 when BatchExecutionService is not available", async () => {
      // Create app without batch execution service
      const appWithoutService = express();
      appWithoutService.use(express.json());
      appWithoutService.use(requestIdMiddleware);
      appWithoutService.use(
        "/api/executions",
        createExecutionsRouter(executionRepository, undefined, undefined)
      );
      appWithoutService.use(errorHandler);

      const response = await request(appWithoutService)
        .post("/api/executions/batch/batch-123/cancel")
        .expect(500);

      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(response.body.error.message).toContain("not available");
    });
  });
});

/**
 * End-to-end integration tests with real database and queue
 * Tests complete batch execution flow including database operations
 *
 * **Validates: Requirements 15.3**
 */
describe("Batch Execution End-to-End Flow", () => {
  let app: Express;
  let db: sqlite3.Database;
  let executionRepository: ExecutionRepository;
  let batchExecutionService: RealBatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockIntegrationManager: IntegrationManager;

  // Helper to run database queries
  const runQuery = (sql: string, params: any[] = []): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  // Helper to get database rows
  const getRows = (sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(":memory:");

    // Create executions table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_nodes TEXT NOT NULL,
        action TEXT NOT NULL,
        parameters TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        results TEXT NOT NULL,
        error TEXT,
        command TEXT,
        expert_mode INTEGER DEFAULT 0,
        original_execution_id TEXT,
        re_execution_count INTEGER DEFAULT 0,
        stdout TEXT,
        stderr TEXT,
        execution_tool TEXT DEFAULT 'bolt',
        batch_id TEXT,
        batch_position INTEGER
      )
    `);

    // Create batch_executions table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS batch_executions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('command', 'task', 'plan')),
        action TEXT NOT NULL,
        parameters TEXT,
        target_nodes TEXT NOT NULL,
        target_groups TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial', 'cancelled')),
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        user_id TEXT NOT NULL,
        execution_ids TEXT NOT NULL,
        stats_total INTEGER NOT NULL,
        stats_queued INTEGER NOT NULL,
        stats_running INTEGER NOT NULL,
        stats_success INTEGER NOT NULL,
        stats_failed INTEGER NOT NULL
      )
    `);

    // Create indexes
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_executions_batch ON executions(batch_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_batch_executions_created ON batch_executions(created_at DESC)`);

    // Initialize repository
    executionRepository = new ExecutionRepository(db);

    // Mock execution queue
    mockExecutionQueue = {
      acquire: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      cancel: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue({
        running: 0,
        queued: 0,
        limit: 5,
        queue: [],
      }),
    } as unknown as ExecutionQueue;

    // Mock integration manager with inventory
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: "node1", name: "node1.example.com", source: "ssh" },
          { id: "node2", name: "node2.example.com", source: "ssh" },
          { id: "node3", name: "node3.example.com", source: "ssh" },
          { id: "node4", name: "node4.example.com", source: "bolt" },
        ],
        groups: [
          {
            id: "group1",
            name: "web-servers",
            source: "ssh",
            nodes: ["node1", "node2"],
          },
          {
            id: "group2",
            name: "db-servers",
            source: "bolt",
            nodes: ["node3", "node4"],
          },
        ],
      }),
    } as unknown as IntegrationManager;

    // Create real batch execution service
    batchExecutionService = new RealBatchExecutionService(
      db,
      mockExecutionQueue,
      executionRepository,
      mockIntegrationManager
    );

    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(
      "/api/executions",
      createExecutionsRouter(executionRepository, mockExecutionQueue, batchExecutionService)
    );
    app.use(errorHandler);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  it("should create batch execution with nodes and store in database", async () => {
    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2"],
        type: "command",
        action: "uptime",
      })
      .expect(201);

    expect(response.body).toHaveProperty("batchId");
    expect(response.body).toHaveProperty("executionIds");
    expect(response.body.executionIds).toHaveLength(2);
    expect(response.body.targetCount).toBe(2);

    // Verify batch record in database
    const batchRows = await getRows(
      "SELECT * FROM batch_executions WHERE id = ?",
      [response.body.batchId]
    );
    expect(batchRows).toHaveLength(1);
    expect(batchRows[0].type).toBe("command");
    expect(batchRows[0].action).toBe("uptime");
    expect(batchRows[0].status).toBe("running");

    // Verify execution records in database
    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [response.body.batchId]
    );
    expect(execRows).toHaveLength(2);
    expect(execRows[0].batch_id).toBe(response.body.batchId);
    expect(execRows[1].batch_id).toBe(response.body.batchId);

    // Verify queue was called
    expect(mockExecutionQueue.acquire).toHaveBeenCalledTimes(2);
  });

  it("should expand groups and create executions for all members", async () => {
    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetGroupIds: ["group1"],
        type: "command",
        action: "hostname",
      })
      .expect(201);

    expect(response.body.targetCount).toBe(2);
    expect(response.body.expandedNodeIds).toEqual(["node1", "node2"]);

    // Verify execution records for group members
    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [response.body.batchId]
    );
    expect(execRows).toHaveLength(2);

    const targetNodes = execRows.map((row) => JSON.parse(row.target_nodes)[0]);
    expect(targetNodes).toContain("node1");
    expect(targetNodes).toContain("node2");
  });

  it("should deduplicate nodes when mixing node IDs and group IDs", async () => {
    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2"],
        targetGroupIds: ["group1"], // group1 contains node1 and node2
        type: "command",
        action: "uptime",
      })
      .expect(201);

    // Should deduplicate to 2 nodes, not 4
    expect(response.body.targetCount).toBe(2);
    expect(response.body.expandedNodeIds).toHaveLength(2);

    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [response.body.batchId]
    );
    expect(execRows).toHaveLength(2);
  });

  it("should fetch batch status with aggregated statistics", async () => {
    // Create batch
    const createResponse = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2", "node3"],
        type: "command",
        action: "uptime",
      })
      .expect(201);

    const batchId = createResponse.body.batchId;

    // Update some executions to completed status
    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [batchId]
    );

    await runQuery(
      "UPDATE executions SET status = ?, completed_at = ? WHERE id = ?",
      ["success", new Date().toISOString(), execRows[0].id]
    );

    await runQuery(
      "UPDATE executions SET status = ?, completed_at = ? WHERE id = ?",
      ["failed", new Date().toISOString(), execRows[1].id]
    );

    // Fetch batch status
    const statusResponse = await request(app)
      .get(`/api/executions/batch/${batchId}`)
      .expect(200);

    expect(statusResponse.body.batch.id).toBe(batchId);
    expect(statusResponse.body.batch.stats.total).toBe(3);
    expect(statusResponse.body.batch.stats.success).toBe(1);
    expect(statusResponse.body.batch.stats.failed).toBe(1);
    expect(statusResponse.body.batch.stats.running).toBe(1);
    expect(statusResponse.body.executions).toHaveLength(3);
    expect(statusResponse.body.progress).toBeGreaterThan(0);
  });

  it("should filter batch status by execution status", async () => {
    // Create batch
    const createResponse = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2", "node3"],
        type: "command",
        action: "uptime",
      })
      .expect(201);

    const batchId = createResponse.body.batchId;

    // Update executions
    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [batchId]
    );

    await runQuery(
      "UPDATE executions SET status = ?, completed_at = ? WHERE id = ?",
      ["success", new Date().toISOString(), execRows[0].id]
    );

    await runQuery(
      "UPDATE executions SET status = ?, completed_at = ? WHERE id = ?",
      ["failed", new Date().toISOString(), execRows[1].id]
    );

    // Fetch only failed executions
    const statusResponse = await request(app)
      .get(`/api/executions/batch/${batchId}?status=failed`)
      .expect(200);

    expect(statusResponse.body.executions).toHaveLength(1);
    expect(statusResponse.body.executions[0].status).toBe("failed");
  });

  it("should cancel batch execution and update database", async () => {
    // Create batch
    const createResponse = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2", "node3"],
        type: "command",
        action: "sleep 100",
      })
      .expect(201);

    const batchId = createResponse.body.batchId;

    // Cancel batch
    const cancelResponse = await request(app)
      .post(`/api/executions/batch/${batchId}/cancel`)
      .expect(200);

    expect(cancelResponse.body.batchId).toBe(batchId);
    expect(cancelResponse.body.cancelledCount).toBeGreaterThan(0);

    // Verify batch status updated
    const batchRows = await getRows(
      "SELECT * FROM batch_executions WHERE id = ?",
      [batchId]
    );
    expect(batchRows[0].status).toBe("cancelled");

    // Verify executions were cancelled
    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ? AND status = ?",
      [batchId, "failed"]
    );
    expect(execRows.length).toBeGreaterThan(0);
  });

  it("should handle queue full error gracefully", async () => {
    // Mock queue to throw error
    mockExecutionQueue.acquire = vi.fn().mockRejectedValue(
      new Error("Execution queue is full. Maximum concurrent executions: 5")
    );

    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "node2"],
        type: "command",
        action: "uptime",
      })
      .expect(429);

    expect(response.body.error.code).toBe("QUEUE_FULL");

    // Verify no batch record was created
    const batchRows = await getRows("SELECT * FROM batch_executions");
    expect(batchRows).toHaveLength(0);
  });

  it("should validate node IDs and return error for invalid nodes", async () => {
    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1", "invalid-node"],
        type: "command",
        action: "uptime",
      })
      .expect(400);

    expect(response.body.error.code).toBe("INVALID_NODES");
    expect(response.body.error.message).toContain("invalid");

    // Verify no batch record was created
    const batchRows = await getRows("SELECT * FROM batch_executions");
    expect(batchRows).toHaveLength(0);
  });

  it("should handle multiple groups with overlapping nodes", async () => {
    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetGroupIds: ["group1", "group2"],
        type: "command",
        action: "uptime",
      })
      .expect(201);

    // group1 has node1, node2; group2 has node3, node4
    expect(response.body.targetCount).toBe(4);
    expect(response.body.expandedNodeIds).toHaveLength(4);

    const execRows = await getRows(
      "SELECT * FROM executions WHERE batch_id = ?",
      [response.body.batchId]
    );
    expect(execRows).toHaveLength(4);
  });

  it("should store batch parameters correctly", async () => {
    const parameters = { package: "nginx", version: "latest" };

    const response = await request(app)
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1"],
        type: "task",
        action: "package::install",
        parameters,
      })
      .expect(201);

    const batchRows = await getRows(
      "SELECT * FROM batch_executions WHERE id = ?",
      [response.body.batchId]
    );

    expect(batchRows[0].parameters).toBeTruthy();
    const storedParams = JSON.parse(batchRows[0].parameters);
    expect(storedParams).toEqual(parameters);
  });
});
