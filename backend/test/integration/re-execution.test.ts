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
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { createExecutionsRouter } from "../../src/routes/executions";
import { errorHandler, requestIdMiddleware } from "../../src/middleware";
import type { Database } from "sqlite3";
import type { ExecutionRecord } from "../../src/database/ExecutionRepository";

// Mock sqlite3 database
const mockDb = {
  run: vi.fn(
    (
      _sql: string,
      _params: unknown,
      callback?: (err: Error | null) => void,
    ) => {
      if (callback) callback(null);
      return mockDb;
    },
  ),
  get: vi.fn(
    (
      _sql: string,
      _params: unknown,
      callback: (err: Error | null, row: unknown) => void,
    ) => {
      callback(null, null);
      return mockDb;
    },
  ),
  all: vi.fn(
    (
      _sql: string,
      _params: unknown,
      callback: (err: Error | null, rows: unknown[]) => void,
    ) => {
      callback(null, []);
      return mockDb;
    },
  ),
  close: vi.fn((callback?: (err: Error | null) => void) => {
    if (callback) callback(null);
  }),
};

describe("Re-execution API Endpoints", () => {
  let app: Express;
  let executionRepository: ExecutionRepository;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Initialize repository
    executionRepository = new ExecutionRepository(mockDb as unknown as Database);

    // Add routes
    app.use("/api/executions", createExecutionsRouter(executionRepository));

    // Add error handler
    app.use(errorHandler);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/executions/:id/original", () => {
    it("should return original execution for a re-execution", async () => {
      const originalExecution: ExecutionRecord = {
        id: "original-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
        reExecutionCount: 1,
      };

      // Mock findOriginalExecution to return the original
      vi.spyOn(executionRepository, "findOriginalExecution").mockResolvedValue(
        originalExecution,
      );

      const response = await request(app)
        .get("/api/executions/re-exec-456/original")
        .expect(200);

      expect(response.body).toHaveProperty("execution");
      expect(response.body.execution.id).toBe("original-123");
      expect(executionRepository.findOriginalExecution).toHaveBeenCalledWith(
        "re-exec-456",
      );
    });

    it("should return 404 when execution is not found", async () => {
      // Mock findOriginalExecution to return null
      vi.spyOn(executionRepository, "findOriginalExecution").mockResolvedValue(
        null,
      );
      // Mock findById to return null (execution doesn't exist)
      vi.spyOn(executionRepository, "findById").mockResolvedValue(null);

      const response = await request(app)
        .get("/api/executions/nonexistent/original")
        .expect(404);

      expect(response.body.error.code).toBe("EXECUTION_NOT_FOUND");
    });

    it("should return 404 when execution is not a re-execution", async () => {
      const execution: ExecutionRecord = {
        id: "exec-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
      };

      // Mock findOriginalExecution to return null (not a re-execution)
      vi.spyOn(executionRepository, "findOriginalExecution").mockResolvedValue(
        null,
      );
      // Mock findById to return the execution (it exists)
      vi.spyOn(executionRepository, "findById").mockResolvedValue(execution);

      const response = await request(app)
        .get("/api/executions/exec-123/original")
        .expect(404);

      expect(response.body.error.code).toBe("NOT_A_RE_EXECUTION");
    });
  });

  describe("GET /api/executions/:id/re-executions", () => {
    it("should return all re-executions of an execution", async () => {
      const execution: ExecutionRecord = {
        id: "original-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
        reExecutionCount: 2,
      };

      const reExecutions: ExecutionRecord[] = [
        {
          id: "re-exec-1",
          type: "command",
          targetNodes: ["node1"],
          action: "ls -la",
          status: "success",
          startedAt: "2024-01-02T00:00:00Z",
          results: [],
          originalExecutionId: "original-123",
        },
        {
          id: "re-exec-2",
          type: "command",
          targetNodes: ["node1"],
          action: "ls -la",
          status: "success",
          startedAt: "2024-01-03T00:00:00Z",
          results: [],
          originalExecutionId: "original-123",
        },
      ];

      // Mock findById to return the execution
      vi.spyOn(executionRepository, "findById").mockResolvedValue(execution);
      // Mock findReExecutions to return the re-executions
      vi.spyOn(executionRepository, "findReExecutions").mockResolvedValue(
        reExecutions,
      );

      const response = await request(app)
        .get("/api/executions/original-123/re-executions")
        .expect(200);

      expect(response.body).toHaveProperty("executions");
      expect(response.body).toHaveProperty("count", 2);
      expect(response.body.executions).toHaveLength(2);
      expect(executionRepository.findReExecutions).toHaveBeenCalledWith(
        "original-123",
      );
    });

    it("should return empty array when no re-executions exist", async () => {
      const execution: ExecutionRecord = {
        id: "exec-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
        reExecutionCount: 0,
      };

      // Mock findById to return the execution
      vi.spyOn(executionRepository, "findById").mockResolvedValue(execution);
      // Mock findReExecutions to return empty array
      vi.spyOn(executionRepository, "findReExecutions").mockResolvedValue([]);

      const response = await request(app)
        .get("/api/executions/exec-123/re-executions")
        .expect(200);

      expect(response.body).toHaveProperty("executions");
      expect(response.body).toHaveProperty("count", 0);
      expect(response.body.executions).toHaveLength(0);
    });

    it("should return 404 when execution is not found", async () => {
      // Mock findById to return null
      vi.spyOn(executionRepository, "findById").mockResolvedValue(null);

      const response = await request(app)
        .get("/api/executions/nonexistent/re-executions")
        .expect(404);

      expect(response.body.error.code).toBe("EXECUTION_NOT_FOUND");
    });
  });

  describe("POST /api/executions/:id/re-execute", () => {
    it("should create a re-execution with preserved parameters", async () => {
      const originalExecution: ExecutionRecord = {
        id: "original-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
        command: "bolt command run 'ls -la' --targets node1",
        expertMode: false,
        reExecutionCount: 0,
      };

      const newExecution: ExecutionRecord = {
        id: "re-exec-456",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "running",
        startedAt: "2024-01-02T00:00:00Z",
        results: [],
        command: "bolt command run 'ls -la' --targets node1",
        expertMode: false,
        originalExecutionId: "original-123",
      };

      // Mock findById to return the original execution
      vi.spyOn(executionRepository, "findById")
        .mockResolvedValueOnce(originalExecution)
        .mockResolvedValueOnce(newExecution);
      // Mock createReExecution to return new ID
      vi.spyOn(executionRepository, "createReExecution").mockResolvedValue(
        "re-exec-456",
      );

      const response = await request(app)
        .post("/api/executions/original-123/re-execute")
        .send({})
        .expect(201);

      expect(response.body).toHaveProperty("execution");
      expect(response.body).toHaveProperty("message");
      expect(response.body.execution.id).toBe("re-exec-456");
      expect(response.body.execution.originalExecutionId).toBe("original-123");
      expect(executionRepository.createReExecution).toHaveBeenCalledWith(
        "original-123",
        expect.objectContaining({
          type: "command",
          targetNodes: ["node1"],
          action: "ls -la",
          status: "running",
        }),
      );
    });

    it("should allow parameter modifications in re-execution", async () => {
      const originalExecution: ExecutionRecord = {
        id: "original-123",
        type: "command",
        targetNodes: ["node1"],
        action: "ls -la",
        status: "success",
        startedAt: "2024-01-01T00:00:00Z",
        results: [],
        reExecutionCount: 0,
      };

      const newExecution: ExecutionRecord = {
        id: "re-exec-456",
        type: "command",
        targetNodes: ["node1", "node2"],
        action: "ls -la",
        status: "running",
        startedAt: "2024-01-02T00:00:00Z",
        results: [],
        originalExecutionId: "original-123",
      };

      // Mock findById to return the original execution
      vi.spyOn(executionRepository, "findById")
        .mockResolvedValueOnce(originalExecution)
        .mockResolvedValueOnce(newExecution);
      // Mock createReExecution to return new ID
      vi.spyOn(executionRepository, "createReExecution").mockResolvedValue(
        "re-exec-456",
      );

      const response = await request(app)
        .post("/api/executions/original-123/re-execute")
        .send({
          targetNodes: ["node1", "node2"],
        })
        .expect(201);

      expect(response.body.execution.targetNodes).toEqual(["node1", "node2"]);
      expect(executionRepository.createReExecution).toHaveBeenCalledWith(
        "original-123",
        expect.objectContaining({
          targetNodes: ["node1", "node2"],
        }),
      );
    });

    it("should return 404 when original execution is not found", async () => {
      // Mock findById to return null
      vi.spyOn(executionRepository, "findById").mockResolvedValue(null);

      const response = await request(app)
        .post("/api/executions/nonexistent/re-execute")
        .send({})
        .expect(404);

      expect(response.body.error.code).toBe("EXECUTION_NOT_FOUND");
    });
  });
});
