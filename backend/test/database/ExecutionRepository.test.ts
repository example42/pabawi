import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sqlite3 from "sqlite3";
import {
  ExecutionRepository,
  ExecutionType,
  ExecutionStatus,
} from "../../src/database/ExecutionRepository";

describe("ExecutionRepository", () => {
  let db: sqlite3.Database;
  let repository: ExecutionRepository;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = new sqlite3.Database(":memory:");

    // Create executions table
    const schema = `
      CREATE TABLE executions (
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
        expert_mode INTEGER DEFAULT 0
      )
    `;

    await new Promise<void>((resolve, reject) => {
      db.run(schema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    repository = new ExecutionRepository(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  describe("constructor", () => {
    it("should create repository with database connection", () => {
      const repo = new ExecutionRepository(db);
      expect(repo).toBeDefined();
    });
  });

  describe("create", () => {
    it("should create a new execution record", async () => {
      const execution = {
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "uptime",
        status: "running" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      };

      const id = await repository.create(execution);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const found = await repository.findById(id);
      expect(found).toBeDefined();
      expect(found?.type).toBe("command");
      expect(found?.action).toBe("uptime");
    });

    it("should create execution with parameters", async () => {
      const execution = {
        type: "task" as ExecutionType,
        targetNodes: ["node1", "node2"],
        action: "deploy",
        parameters: { version: "1.0.0", env: "production" },
        status: "running" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      };

      const id = await repository.create(execution);
      const found = await repository.findById(id);

      expect(found?.parameters).toEqual({
        version: "1.0.0",
        env: "production",
      });
    });
  });

  describe("update", () => {
    it("should update execution status", async () => {
      const id = await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "uptime",
        status: "running" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      await repository.update(id, {
        status: "success" as ExecutionStatus,
        completedAt: new Date().toISOString(),
      });

      const found = await repository.findById(id);
      expect(found?.status).toBe("success");
      expect(found?.completedAt).toBeDefined();
    });

    it("should update execution results", async () => {
      const id = await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "uptime",
        status: "running" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      const results = [
        {
          nodeId: "node1",
          status: "success" as const,
          output: { stdout: "up 5 days", exitCode: 0 },
          duration: 123,
        },
      ];

      await repository.update(id, {
        results,
        status: "success" as ExecutionStatus,
      });

      const found = await repository.findById(id);
      expect(found?.results).toHaveLength(1);
      expect(found?.results[0].nodeId).toBe("node1");
    });
  });

  describe("findById", () => {
    it("should return null for non-existent ID", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeNull();
    });

    it("should find execution by ID", async () => {
      const id = await repository.create({
        type: "facts" as ExecutionType,
        targetNodes: ["node1"],
        action: "gather_facts",
        status: "success" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      const found = await repository.findById(id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(id);
      expect(found?.type).toBe("facts");
    });
  });

  describe("findAll", () => {
    beforeEach(async () => {
      // Create test data
      await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "uptime",
        status: "success" as ExecutionStatus,
        startedAt: "2024-01-01T10:00:00Z",
        results: [],
      });

      await repository.create({
        type: "task" as ExecutionType,
        targetNodes: ["node2"],
        action: "deploy",
        status: "failed" as ExecutionStatus,
        startedAt: "2024-01-02T10:00:00Z",
        results: [],
      });

      await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "ls",
        status: "success" as ExecutionStatus,
        startedAt: "2024-01-03T10:00:00Z",
        results: [],
      });
    });

    it("should return all executions without filters", async () => {
      const executions = await repository.findAll();
      expect(executions).toHaveLength(3);
    });

    it("should filter by type", async () => {
      const executions = await repository.findAll({ type: "command" });
      expect(executions).toHaveLength(2);
      expect(executions.every((e) => e.type === "command")).toBe(true);
    });

    it("should filter by status", async () => {
      const executions = await repository.findAll({ status: "failed" });
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe("failed");
    });

    it("should filter by target node", async () => {
      const executions = await repository.findAll({ targetNode: "node1" });
      expect(executions).toHaveLength(2);
    });

    it("should filter by date range", async () => {
      const executions = await repository.findAll({
        startDate: "2024-01-02T00:00:00Z",
        endDate: "2024-01-03T23:59:59Z",
      });
      expect(executions).toHaveLength(2);
    });

    it("should support pagination", async () => {
      const page1 = await repository.findAll({}, { page: 1, pageSize: 2 });
      expect(page1).toHaveLength(2);

      const page2 = await repository.findAll({}, { page: 2, pageSize: 2 });
      expect(page2).toHaveLength(1);
    });

    it("should order by started_at DESC", async () => {
      const executions = await repository.findAll();
      expect(executions[0].startedAt).toBe("2024-01-03T10:00:00Z");
      expect(executions[2].startedAt).toBe("2024-01-01T10:00:00Z");
    });
  });

  describe("countByStatus", () => {
    it("should return zero counts for empty database", async () => {
      const counts = await repository.countByStatus();
      expect(counts).toEqual({
        total: 0,
        running: 0,
        success: 0,
        failed: 0,
        partial: 0,
      });
    });

    it("should count executions by status", async () => {
      await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node1"],
        action: "uptime",
        status: "success" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node2"],
        action: "uptime",
        status: "success" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      await repository.create({
        type: "task" as ExecutionType,
        targetNodes: ["node3"],
        action: "deploy",
        status: "failed" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      await repository.create({
        type: "command" as ExecutionType,
        targetNodes: ["node4"],
        action: "ls",
        status: "running" as ExecutionStatus,
        startedAt: new Date().toISOString(),
        results: [],
      });

      const counts = await repository.countByStatus();
      expect(counts.total).toBe(4);
      expect(counts.success).toBe(2);
      expect(counts.failed).toBe(1);
      expect(counts.running).toBe(1);
      expect(counts.partial).toBe(0);
    });
  });
});
