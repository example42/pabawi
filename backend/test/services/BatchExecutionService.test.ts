import { describe, it, expect, beforeEach, vi } from "vitest";
import sqlite3 from "sqlite3";
import { BatchExecutionService } from "../../src/services/BatchExecutionService";
import type { ExecutionQueue } from "../../src/services/ExecutionQueue";
import type { ExecutionRepository } from "../../src/database/ExecutionRepository";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";

describe("BatchExecutionService - getBatchStatus", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(":memory:");

    // Create tables
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE batch_executions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          action TEXT NOT NULL,
          parameters TEXT,
          target_nodes TEXT NOT NULL,
          target_groups TEXT NOT NULL,
          status TEXT NOT NULL,
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
        );

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
          batch_id TEXT,
          batch_position INTEGER
        );
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Mock dependencies
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: "node1", name: "server1.example.com" },
          { id: "node2", name: "server2.example.com" },
          { id: "node3", name: "server3.example.com" },
        ],
        groups: [],
      }),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should fetch batch status with aggregated statistics", async () => {
    // Insert test batch
    const batchId = "batch-123";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2", "node3"]),
          JSON.stringify([]),
          "running",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2", "exec3"]),
          3,
          0,
          1,
          1,
          1,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert test executions
    const executions = [
      {
        id: "exec1",
        nodeId: "node1",
        status: "success",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:05Z",
        results: JSON.stringify([
          {
            nodeId: "node1",
            status: "success",
            output: { exitCode: 0, stdout: "up 5 days", stderr: "" },
            duration: 5000,
          },
        ]),
      },
      {
        id: "exec2",
        nodeId: "node2",
        status: "failed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:03Z",
        results: JSON.stringify([
          {
            nodeId: "node2",
            status: "failed",
            output: { exitCode: 1, stdout: "", stderr: "Connection refused" },
            duration: 3000,
          },
        ]),
      },
      {
        id: "exec3",
        nodeId: "node3",
        status: "running",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: null,
        results: JSON.stringify([]),
      },
    ];

    for (const exec of executions) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exec.id,
            "command",
            JSON.stringify([exec.nodeId]),
            "uptime",
            null,
            exec.status,
            exec.startedAt,
            exec.completedAt,
            exec.results,
            batchId,
            executions.indexOf(exec),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Test getBatchStatus
    const result = await service.getBatchStatus(batchId);

    // Verify batch details
    expect(result.batch.id).toBe(batchId);
    expect(result.batch.type).toBe("command");
    expect(result.batch.action).toBe("uptime");
    expect(result.batch.targetNodes).toEqual(["node1", "node2", "node3"]);

    // Verify statistics
    expect(result.batch.stats.total).toBe(3);
    expect(result.batch.stats.success).toBe(1);
    expect(result.batch.stats.failed).toBe(1);
    expect(result.batch.stats.running).toBe(1);

    // Verify progress
    expect(result.progress).toBe(67); // 2 completed out of 3 = 66.67% rounded to 67

    // Verify executions
    expect(result.executions).toHaveLength(3);
    expect(result.executions[0].nodeId).toBe("node1");
    expect(result.executions[0].nodeName).toBe("server1.example.com");
    expect(result.executions[0].status).toBe("success");
    expect(result.executions[0].duration).toBe(5000);
    expect(result.executions[0].result?.exitCode).toBe(0);
    expect(result.executions[0].result?.stdout).toBe("up 5 days");
  });

  it("should throw error when batch does not exist", async () => {
    await expect(service.getBatchStatus("nonexistent")).rejects.toThrow(
      "Batch execution nonexistent not found"
    );
  });

  it("should support status filtering", async () => {
    // Insert test batch
    const batchId = "batch-456";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2"]),
          JSON.stringify([]),
          "partial",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2"]),
          2,
          0,
          0,
          1,
          1,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert test executions
    const executions = [
      {
        id: "exec1",
        nodeId: "node1",
        status: "success",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:05Z",
        results: JSON.stringify([]),
      },
      {
        id: "exec2",
        nodeId: "node2",
        status: "failed",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:00:03Z",
        results: JSON.stringify([]),
      },
    ];

    for (const exec of executions) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exec.id,
            "command",
            JSON.stringify([exec.nodeId]),
            "uptime",
            null,
            exec.status,
            exec.startedAt,
            exec.completedAt,
            exec.results,
            batchId,
            executions.indexOf(exec),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Test with status filter
    const result = await service.getBatchStatus(batchId, "success");

    // Should only return success executions
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe("success");

    // But stats should still reflect all executions
    expect(result.batch.stats.total).toBe(2);
    expect(result.batch.stats.success).toBe(1);
    expect(result.batch.stats.failed).toBe(1);
  });

  it("should calculate correct progress percentage", async () => {
    // Insert test batch with all completed
    const batchId = "batch-789";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2"]),
          JSON.stringify([]),
          "success",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2"]),
          2,
          0,
          0,
          2,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert completed executions
    for (let i = 1; i <= 2; i++) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `exec${i}`,
            "command",
            JSON.stringify([`node${i}`]),
            "uptime",
            null,
            "success",
            "2024-01-01T10:00:00Z",
            "2024-01-01T10:00:05Z",
            JSON.stringify([]),
            batchId,
            i - 1,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    const result = await service.getBatchStatus(batchId);

    // All completed = 100%
    expect(result.progress).toBe(100);
    expect(result.batch.status).toBe("success");
  });
});

describe("BatchExecutionService - expandGroups", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    db = new sqlite3.Database(":memory:");
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn(),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should expand single group to node IDs", async () => {
    // Mock inventory with a group
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
      ],
      groups: [
        {
          id: "group1",
          name: "web-servers",
          source: "bolt",
          nodes: ["node1", "node2"],
        },
      ],
    });

    // Access private method via type assertion
    const result = await (service as any).expandGroups(["group1"]);

    expect(result).toEqual(["node1", "node2"]);
  });

  it("should expand multiple groups to node IDs", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
        { id: "node3", name: "server3.example.com" },
      ],
      groups: [
        {
          id: "group1",
          name: "web-servers",
          source: "bolt",
          nodes: ["node1", "node2"],
        },
        {
          id: "group2",
          name: "db-servers",
          source: "bolt",
          nodes: ["node3"],
        },
      ],
    });

    const result = await (service as any).expandGroups(["group1", "group2"]);

    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should handle linked groups from multiple sources", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
        { id: "node3", name: "server3.example.com" },
      ],
      groups: [
        {
          id: "group1",
          name: "production",
          source: "bolt",
          nodes: ["node1", "node2", "node3"], // Linked group includes all nodes
        },
      ],
    });

    const result = await (service as any).expandGroups(["group1"]);

    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should skip missing groups and continue with others", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
      ],
      groups: [
        {
          id: "group1",
          name: "web-servers",
          source: "bolt",
          nodes: ["node1", "node2"],
        },
      ],
    });

    // Request includes a missing group
    const result = await (service as any).expandGroups(["group1", "missing-group"]);

    // Should return nodes from group1 and skip missing-group
    expect(result).toEqual(["node1", "node2"]);
  });

  it("should return empty array when all groups are missing", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [],
      groups: [],
    });

    const result = await (service as any).expandGroups(["missing1", "missing2"]);

    expect(result).toEqual([]);
  });

  it("should return empty array when no groups provided", async () => {
    const result = await (service as any).expandGroups([]);

    expect(result).toEqual([]);
  });

  it("should handle errors gracefully and continue with other groups", async () => {
    let callCount = 0;
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network error");
      }
      return {
        nodes: [{ id: "node1", name: "server1.example.com" }],
        groups: [
          {
            id: "group2",
            name: "db-servers",
            source: "bolt",
            nodes: ["node1"],
          },
        ],
      };
    });

    const result = await (service as any).expandGroups(["group1", "group2"]);

    // Should continue after error and process group2
    expect(result).toEqual(["node1"]);
  });
});

describe("BatchExecutionService - deduplicateNodes", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    db = new sqlite3.Database(":memory:");
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {} as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should remove duplicate node IDs", () => {
    const result = (service as any).deduplicateNodes([
      "node1",
      "node2",
      "node1",
      "node3",
      "node2",
    ]);

    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should handle array with no duplicates", () => {
    const result = (service as any).deduplicateNodes(["node1", "node2", "node3"]);

    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should handle empty array", () => {
    const result = (service as any).deduplicateNodes([]);

    expect(result).toEqual([]);
  });

  it("should handle array with all duplicates", () => {
    const result = (service as any).deduplicateNodes([
      "node1",
      "node1",
      "node1",
    ]);

    expect(result).toEqual(["node1"]);
  });

  it("should be idempotent - applying twice gives same result", () => {
    const input = ["node1", "node2", "node1", "node3", "node2"];
    const firstPass = (service as any).deduplicateNodes(input);
    const secondPass = (service as any).deduplicateNodes(firstPass);

    expect(firstPass).toEqual(secondPass);
    expect(firstPass).toEqual(["node1", "node2", "node3"]);
  });
});

describe("BatchExecutionService - validateNodes", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    db = new sqlite3.Database(":memory:");
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn(),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should validate all nodes exist", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
        { id: "node3", name: "server3.example.com" },
      ],
      groups: [],
    });

    await expect(
      (service as any).validateNodes(["node1", "node2", "node3"])
    ).resolves.toBeUndefined();
  });

  it("should throw error for invalid node IDs", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
        { id: "node2", name: "server2.example.com" },
      ],
      groups: [],
    });

    await expect(
      (service as any).validateNodes(["node1", "invalid1", "invalid2"])
    ).rejects.toThrow("Invalid node IDs: invalid1, invalid2");
  });

  it("should throw error when all nodes are invalid", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [
        { id: "node1", name: "server1.example.com" },
      ],
      groups: [],
    });

    await expect(
      (service as any).validateNodes(["invalid1", "invalid2"])
    ).rejects.toThrow("Invalid node IDs: invalid1, invalid2");
  });

  it("should handle empty node array", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [],
      groups: [],
    });

    await expect(
      (service as any).validateNodes([])
    ).resolves.toBeUndefined();
  });
});

describe("BatchExecutionService - createBatch", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(":memory:");

    // Create tables
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE batch_executions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          action TEXT NOT NULL,
          parameters TEXT,
          target_nodes TEXT NOT NULL,
          target_groups TEXT NOT NULL,
          status TEXT NOT NULL,
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
        );

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
          batch_id TEXT,
          batch_position INTEGER
        );
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Mock dependencies
    mockExecutionQueue = {
      acquire: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutionQueue;

    mockExecutionRepository = {
      create: vi.fn().mockImplementation(async () => {
        const { randomUUID } = await import("crypto");
        return randomUUID();
      }),
    } as unknown as ExecutionRepository;

    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: "node1", name: "server1.example.com" },
          { id: "node2", name: "server2.example.com" },
          { id: "node3", name: "server3.example.com" },
        ],
        groups: [
          {
            id: "group1",
            name: "web-servers",
            source: "bolt",
            nodes: ["node1", "node2"],
          },
        ],
      }),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should create batch with direct node IDs", async () => {
    const request = {
      targetNodeIds: ["node1", "node2"],
      type: "command" as const,
      action: "uptime",
    };

    const result = await service.createBatch(request, "user1");

    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(2);
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);

    // Verify execution queue was called for each node
    expect(mockExecutionQueue.acquire).toHaveBeenCalledTimes(2);

    // Verify execution repository was called for each node
    expect(mockExecutionRepository.create).toHaveBeenCalledTimes(2);
  });

  it("should create batch with group IDs and expand them", async () => {
    const request = {
      targetGroupIds: ["group1"],
      type: "command" as const,
      action: "uptime",
    };

    const result = await service.createBatch(request, "user1");

    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(2);
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);
  });

  it("should create batch with mixed node and group IDs", async () => {
    const request = {
      targetNodeIds: ["node3"],
      targetGroupIds: ["group1"],
      type: "command" as const,
      action: "uptime",
    };

    const result = await service.createBatch(request, "user1");

    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(3);
    expect(result.targetCount).toBe(3);
    expect(result.expandedNodeIds).toEqual(["node3", "node1", "node2"]);
  });

  it("should deduplicate nodes from overlapping groups", async () => {
    const request = {
      targetNodeIds: ["node1"],
      targetGroupIds: ["group1"], // group1 contains node1 and node2
      type: "command" as const,
      action: "uptime",
    };

    const result = await service.createBatch(request, "user1");

    // node1 appears in both targetNodeIds and group1, should be deduplicated
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);
  });

  it("should create batch with parameters", async () => {
    const request = {
      targetNodeIds: ["node1"],
      type: "task" as const,
      action: "package::install",
      parameters: { package: "nginx", version: "latest" },
    };

    const result = await service.createBatch(request, "user1");

    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(1);

    // Verify parameters were passed to execution repository
    expect(mockExecutionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: { package: "nginx", version: "latest" },
      })
    );
  });

  it("should throw error for invalid node IDs", async () => {
    const request = {
      targetNodeIds: ["invalid-node"],
      type: "command" as const,
      action: "uptime",
    };

    await expect(service.createBatch(request, "user1")).rejects.toThrow(
      "Invalid node IDs: invalid-node"
    );
  });

  it("should handle execution queue full error", async () => {
    // Mock queue to throw error on second acquire
    let acquireCount = 0;
    vi.mocked(mockExecutionQueue.acquire).mockImplementation(async () => {
      acquireCount++;
      if (acquireCount === 2) {
        const error = new Error("Queue is full");
        error.name = "ExecutionQueueFullError";
        throw error;
      }
    });

    const request = {
      targetNodeIds: ["node1", "node2"],
      type: "command" as const,
      action: "uptime",
    };

    await expect(service.createBatch(request, "user1")).rejects.toThrow(
      "Failed to enqueue execution for node node2"
    );
  });

  it("should create batch record in database with correct stats", async () => {
    const request = {
      targetNodeIds: ["node1", "node2", "node3"],
      type: "command" as const,
      action: "uptime",
    };

    const result = await service.createBatch(request, "user1");

    // Verify batch record was created
    const batchRow = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM batch_executions WHERE id = ?",
        [result.batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(batchRow).toBeDefined();
    expect(batchRow.type).toBe("command");
    expect(batchRow.action).toBe("uptime");
    expect(batchRow.status).toBe("running");
    expect(batchRow.user_id).toBe("user1");
    expect(batchRow.stats_total).toBe(3);
    expect(batchRow.stats_queued).toBe(3);
    expect(batchRow.stats_running).toBe(0);
    expect(batchRow.stats_success).toBe(0);
    expect(batchRow.stats_failed).toBe(0);
    expect(JSON.parse(batchRow.target_nodes)).toEqual(["node1", "node2", "node3"]);
    expect(JSON.parse(batchRow.execution_ids)).toHaveLength(3);
  });

  it("should set batch_id and batch_position on execution records", async () => {
    const request = {
      targetNodeIds: ["node1", "node2"],
      type: "command" as const,
      action: "uptime",
    };

    await service.createBatch(request, "user1");

    // Verify execution records have batch tracking
    const calls = vi.mocked(mockExecutionRepository.create).mock.calls;
    expect(calls[0][0]).toMatchObject({
      batchId: expect.any(String),
      batchPosition: 0,
    });
    expect(calls[1][0]).toMatchObject({
      batchId: expect.any(String),
      batchPosition: 1,
    });
  });
});

describe("BatchExecutionService - cancelBatch", () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(":memory:");

    // Create tables
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE batch_executions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          action TEXT NOT NULL,
          parameters TEXT,
          target_nodes TEXT NOT NULL,
          target_groups TEXT NOT NULL,
          status TEXT NOT NULL,
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
        );

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
          batch_id TEXT,
          batch_position INTEGER,
          error TEXT
        );
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Mock dependencies
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: "node1", name: "server1.example.com" },
          { id: "node2", name: "server2.example.com" },
          { id: "node3", name: "server3.example.com" },
        ],
        groups: [],
      }),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  it("should cancel running executions and update batch status", async () => {
    // Insert test batch
    const batchId = "batch-cancel-1";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2", "node3"]),
          JSON.stringify([]),
          "running",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2", "exec3"]),
          3,
          0,
          3,
          0,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert running executions
    const executions = [
      { id: "exec1", nodeId: "node1", status: "running" },
      { id: "exec2", nodeId: "node2", status: "running" },
      { id: "exec3", nodeId: "node3", status: "running" },
    ];

    for (const exec of executions) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exec.id,
            "command",
            JSON.stringify([exec.nodeId]),
            "uptime",
            null,
            exec.status,
            "2024-01-01T10:00:00Z",
            null,
            JSON.stringify([]),
            batchId,
            executions.indexOf(exec),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Cancel the batch
    const result = await service.cancelBatch(batchId);

    // Verify cancelled count
    expect(result.cancelledCount).toBe(3);

    // Verify executions are marked as failed with error message
    const updatedExecutions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM executions WHERE batch_id = ?",
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    expect(updatedExecutions).toHaveLength(3);
    for (const exec of updatedExecutions) {
      expect(exec.status).toBe("failed");
      expect(exec.error).toBe("Cancelled by user");
      expect(exec.completed_at).toBeTruthy();
    }

    // Verify batch status is updated to cancelled
    const updatedBatch = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM batch_executions WHERE id = ?",
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(updatedBatch.status).toBe("cancelled");
    expect(updatedBatch.completed_at).toBeTruthy();
  });

  it("should only cancel running executions, not completed ones", async () => {
    // Insert test batch
    const batchId = "batch-cancel-2";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2", "node3"]),
          JSON.stringify([]),
          "running",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2", "exec3"]),
          3,
          0,
          2,
          1,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert mixed status executions
    const executions = [
      { id: "exec1", nodeId: "node1", status: "success", completedAt: "2024-01-01T10:00:05Z" },
      { id: "exec2", nodeId: "node2", status: "running", completedAt: null },
      { id: "exec3", nodeId: "node3", status: "running", completedAt: null },
    ];

    for (const exec of executions) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exec.id,
            "command",
            JSON.stringify([exec.nodeId]),
            "uptime",
            null,
            exec.status,
            "2024-01-01T10:00:00Z",
            exec.completedAt,
            JSON.stringify([]),
            batchId,
            executions.indexOf(exec),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Cancel the batch
    const result = await service.cancelBatch(batchId);

    // Should only cancel the 2 running executions
    expect(result.cancelledCount).toBe(2);

    // Verify the success execution is unchanged
    const successExecution = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM executions WHERE id = ?",
        ["exec1"],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(successExecution.status).toBe("success");
    expect(successExecution.error).toBeNull();
  });

  it("should throw error when batch does not exist", async () => {
    await expect(service.cancelBatch("nonexistent")).rejects.toThrow(
      "Batch execution nonexistent not found"
    );
  });

  it("should return zero cancelled count when no running executions", async () => {
    // Insert test batch with all completed executions
    const batchId = "batch-cancel-3";
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, parameters, target_nodes, target_groups,
          status, created_at, started_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          "command",
          "uptime",
          null,
          JSON.stringify(["node1", "node2"]),
          JSON.stringify([]),
          "success",
          "2024-01-01T10:00:00Z",
          "2024-01-01T10:00:00Z",
          "user1",
          JSON.stringify(["exec1", "exec2"]),
          2,
          0,
          0,
          2,
          0,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert completed executions
    for (let i = 1; i <= 2; i++) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO executions (
            id, type, target_nodes, action, parameters, status,
            started_at, completed_at, results, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `exec${i}`,
            "command",
            JSON.stringify([`node${i}`]),
            "uptime",
            null,
            "success",
            "2024-01-01T10:00:00Z",
            "2024-01-01T10:00:05Z",
            JSON.stringify([]),
            batchId,
            i - 1,
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Cancel the batch
    const result = await service.cancelBatch(batchId);

    // Should return 0 since no running executions
    expect(result.cancelledCount).toBe(0);

    // Batch should still be marked as cancelled
    const updatedBatch = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM batch_executions WHERE id = ?",
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(updatedBatch.status).toBe("cancelled");
  });
});
