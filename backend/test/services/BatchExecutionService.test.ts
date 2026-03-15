import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { BatchExecutionService } from "../../src/services/BatchExecutionService";
import type { ExecutionQueue } from "../../src/services/ExecutionQueue";
import type { ExecutionRepository } from "../../src/database/ExecutionRepository";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";

async function createSchema(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
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
    )
  `);
  await db.execute(`
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
    )
  `);
}

async function insertBatch(db: DatabaseAdapter, batchId: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const defaults = {
    type: "command",
    action: "uptime",
    parameters: null,
    target_nodes: JSON.stringify(["node1", "node2", "node3"]),
    target_groups: JSON.stringify([]),
    status: "running",
    created_at: "2024-01-01T10:00:00Z",
    started_at: "2024-01-01T10:00:00Z",
    user_id: "user1",
    execution_ids: JSON.stringify(["exec1", "exec2", "exec3"]),
    stats_total: 3,
    stats_queued: 0,
    stats_running: 1,
    stats_success: 1,
    stats_failed: 1,
    ...overrides,
  };
  await db.execute(
    `INSERT INTO batch_executions (
      id, type, action, parameters, target_nodes, target_groups,
      status, created_at, started_at, user_id, execution_ids,
      stats_total, stats_queued, stats_running, stats_success, stats_failed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batchId, defaults.type, defaults.action, defaults.parameters,
      defaults.target_nodes, defaults.target_groups, defaults.status,
      defaults.created_at, defaults.started_at, defaults.user_id,
      defaults.execution_ids, defaults.stats_total, defaults.stats_queued,
      defaults.stats_running, defaults.stats_success, defaults.stats_failed,
    ]
  );
}

async function insertExecution(
  db: DatabaseAdapter,
  exec: { id: string; nodeId: string; status: string; startedAt: string; completedAt: string | null; results: string },
  batchId: string,
  position: number
): Promise<void> {
  await db.execute(
    `INSERT INTO executions (
      id, type, target_nodes, action, parameters, status,
      started_at, completed_at, results, batch_id, batch_position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      exec.id, "command", JSON.stringify([exec.nodeId]), "uptime", null,
      exec.status, exec.startedAt, exec.completedAt, exec.results,
      batchId, position,
    ]
  );
}

describe("BatchExecutionService - getBatchStatus", () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await createSchema(db);

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

    service = new BatchExecutionService(db, mockExecutionQueue, mockExecutionRepository, mockIntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should fetch batch status with aggregated statistics", async () => {
    const batchId = "batch-123";
    await insertBatch(db, batchId);

    const executions = [
      { id: "exec1", nodeId: "node1", status: "success", startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:05Z",
        results: JSON.stringify([{ nodeId: "node1", status: "success", output: { exitCode: 0, stdout: "up 5 days", stderr: "" }, duration: 5000 }]) },
      { id: "exec2", nodeId: "node2", status: "failed", startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:03Z",
        results: JSON.stringify([{ nodeId: "node2", status: "failed", output: { exitCode: 1, stdout: "", stderr: "Connection refused" }, duration: 3000 }]) },
      { id: "exec3", nodeId: "node3", status: "running", startedAt: "2024-01-01T10:00:00Z", completedAt: null, results: JSON.stringify([]) },
    ];

    for (let i = 0; i < executions.length; i++) {
      await insertExecution(db, executions[i], batchId, i);
    }

    const result = await service.getBatchStatus(batchId);

    expect(result.batch.id).toBe(batchId);
    expect(result.batch.type).toBe("command");
    expect(result.batch.action).toBe("uptime");
    expect(result.batch.targetNodes).toEqual(["node1", "node2", "node3"]);
    expect(result.batch.stats.total).toBe(3);
    expect(result.batch.stats.success).toBe(1);
    expect(result.batch.stats.failed).toBe(1);
    expect(result.batch.stats.running).toBe(1);
    expect(result.progress).toBe(67);
    expect(result.executions).toHaveLength(3);
    expect(result.executions[0].nodeId).toBe("node1");
    expect(result.executions[0].nodeName).toBe("server1.example.com");
    expect(result.executions[0].status).toBe("success");
    expect(result.executions[0].duration).toBe(5000);
    expect(result.executions[0].result?.exitCode).toBe(0);
    expect(result.executions[0].result?.stdout).toBe("up 5 days");
  });

  it("should throw error when batch does not exist", async () => {
    await expect(service.getBatchStatus("nonexistent")).rejects.toThrow("Batch execution nonexistent not found");
  });

  it("should support status filtering", async () => {
    const batchId = "batch-456";
    await insertBatch(db, batchId, {
      target_nodes: JSON.stringify(["node1", "node2"]),
      status: "partial",
      execution_ids: JSON.stringify(["exec1", "exec2"]),
      stats_total: 2, stats_queued: 0, stats_running: 0, stats_success: 1, stats_failed: 1,
    });

    const executions = [
      { id: "exec1", nodeId: "node1", status: "success", startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:05Z", results: JSON.stringify([]) },
      { id: "exec2", nodeId: "node2", status: "failed", startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:03Z", results: JSON.stringify([]) },
    ];

    for (let i = 0; i < executions.length; i++) {
      await insertExecution(db, executions[i], batchId, i);
    }

    const result = await service.getBatchStatus(batchId, "success");
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe("success");
    expect(result.batch.stats.total).toBe(2);
    expect(result.batch.stats.success).toBe(1);
    expect(result.batch.stats.failed).toBe(1);
  });

  it("should calculate correct progress percentage", async () => {
    const batchId = "batch-789";
    await insertBatch(db, batchId, {
      target_nodes: JSON.stringify(["node1", "node2"]),
      status: "success",
      execution_ids: JSON.stringify(["exec1", "exec2"]),
      stats_total: 2, stats_queued: 0, stats_running: 0, stats_success: 2, stats_failed: 0,
    });

    for (let i = 1; i <= 2; i++) {
      await insertExecution(db, {
        id: `exec${i}`, nodeId: `node${i}`, status: "success",
        startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:05Z", results: JSON.stringify([]),
      }, batchId, i - 1);
    }

    const result = await service.getBatchStatus(batchId);
    expect(result.progress).toBe(100);
    expect(result.batch.status).toBe("success");
  });
});

describe("BatchExecutionService - expandGroups", () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn(),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(db, mockExecutionQueue, mockExecutionRepository, mockIntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should expand single group to node IDs", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }],
      groups: [{ id: "group1", name: "web-servers", source: "bolt", nodes: ["node1", "node2"] }],
    });
    const result = await (service as any).expandGroups(["group1"]);
    expect(result).toEqual(["node1", "node2"]);
  });

  it("should expand multiple groups to node IDs", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }, { id: "node3", name: "server3.example.com" }],
      groups: [
        { id: "group1", name: "web-servers", source: "bolt", nodes: ["node1", "node2"] },
        { id: "group2", name: "db-servers", source: "bolt", nodes: ["node3"] },
      ],
    });
    const result = await (service as any).expandGroups(["group1", "group2"]);
    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should handle linked groups from multiple sources", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }, { id: "node3", name: "server3.example.com" }],
      groups: [{ id: "group1", name: "production", source: "bolt", nodes: ["node1", "node2", "node3"] }],
    });
    const result = await (service as any).expandGroups(["group1"]);
    expect(result).toEqual(["node1", "node2", "node3"]);
  });

  it("should skip missing groups and continue with others", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }],
      groups: [{ id: "group1", name: "web-servers", source: "bolt", nodes: ["node1", "node2"] }],
    });
    const result = await (service as any).expandGroups(["group1", "missing-group"]);
    expect(result).toEqual(["node1", "node2"]);
  });

  it("should return empty array when all groups are missing", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({ nodes: [], groups: [] });
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
      if (callCount === 1) throw new Error("Network error");
      return {
        nodes: [{ id: "node1", name: "server1.example.com" }],
        groups: [{ id: "group2", name: "db-servers", source: "bolt", nodes: ["node1"] }],
      };
    });
    const result = await (service as any).expandGroups(["group1", "group2"]);
    expect(result).toEqual(["node1"]);
  });
});

describe("BatchExecutionService - deduplicateNodes", () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    service = new BatchExecutionService(db, {} as ExecutionQueue, {} as ExecutionRepository, {} as IntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should remove duplicate node IDs", () => {
    const result = (service as any).deduplicateNodes(["node1", "node2", "node1", "node3", "node2"]);
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
    const result = (service as any).deduplicateNodes(["node1", "node1", "node1"]);
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
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    mockIntegrationManager = { getAggregatedInventory: vi.fn() } as unknown as IntegrationManager;
    service = new BatchExecutionService(db, {} as ExecutionQueue, {} as ExecutionRepository, mockIntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should validate all nodes exist", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }, { id: "node3", name: "server3.example.com" }],
      groups: [],
    });
    await expect((service as any).validateNodes(["node1", "node2", "node3"])).resolves.toBeUndefined();
  });

  it("should throw error for invalid node IDs", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }],
      groups: [],
    });
    await expect((service as any).validateNodes(["node1", "invalid1", "invalid2"])).rejects.toThrow("Invalid node IDs: invalid1, invalid2");
  });

  it("should throw error when all nodes are invalid", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({
      nodes: [{ id: "node1", name: "server1.example.com" }],
      groups: [],
    });
    await expect((service as any).validateNodes(["invalid1", "invalid2"])).rejects.toThrow("Invalid node IDs: invalid1, invalid2");
  });

  it("should handle empty node array", async () => {
    vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue({ nodes: [], groups: [] });
    await expect((service as any).validateNodes([])).resolves.toBeUndefined();
  });
});

describe("BatchExecutionService - createBatch", () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await createSchema(db);

    mockExecutionQueue = {
      acquire: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    } as unknown as ExecutionQueue;

    mockExecutionRepository = {
      create: vi.fn().mockImplementation(async () => {
        const { randomUUID } = await import("crypto");
        return randomUUID();
      }),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutionRepository;

    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: "node1", name: "server1.example.com" },
          { id: "node2", name: "server2.example.com" },
          { id: "node3", name: "server3.example.com" },
        ],
        groups: [{ id: "group1", name: "web-servers", source: "bolt", nodes: ["node1", "node2"] }],
      }),
      executeAction: vi.fn().mockResolvedValue({
        status: "success",
        completedAt: new Date().toISOString(),
        results: [{ nodeId: "node1", status: "success", duration: 100 }],
      }),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(db, mockExecutionQueue, mockExecutionRepository, mockIntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create batch with direct node IDs", async () => {
    const result = await service.createBatch({ targetNodeIds: ["node1", "node2"], type: "command", action: "uptime" }, "user1");
    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(2);
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);
    expect(mockExecutionQueue.acquire).toHaveBeenCalledTimes(2);
    expect(mockExecutionRepository.create).toHaveBeenCalledTimes(2);
  });

  it("should create batch with group IDs and expand them", async () => {
    const result = await service.createBatch({ targetGroupIds: ["group1"], type: "command", action: "uptime" }, "user1");
    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(2);
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);
  });

  it("should create batch with mixed node and group IDs", async () => {
    const result = await service.createBatch({ targetNodeIds: ["node3"], targetGroupIds: ["group1"], type: "command", action: "uptime" }, "user1");
    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(3);
    expect(result.targetCount).toBe(3);
    expect(result.expandedNodeIds).toEqual(["node3", "node1", "node2"]);
  });

  it("should deduplicate nodes from overlapping groups", async () => {
    const result = await service.createBatch({ targetNodeIds: ["node1"], targetGroupIds: ["group1"], type: "command", action: "uptime" }, "user1");
    expect(result.targetCount).toBe(2);
    expect(result.expandedNodeIds).toEqual(["node1", "node2"]);
  });

  it("should create batch with parameters", async () => {
    const result = await service.createBatch({
      targetNodeIds: ["node1"], type: "task", action: "package::install",
      parameters: { package: "nginx", version: "latest" },
    }, "user1");
    expect(result.batchId).toBeDefined();
    expect(result.executionIds).toHaveLength(1);
    expect(mockExecutionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      parameters: { package: "nginx", version: "latest" },
    }));
  });

  it("should throw error for invalid node IDs", async () => {
    await expect(service.createBatch({ targetNodeIds: ["invalid-node"], type: "command", action: "uptime" }, "user1"))
      .rejects.toThrow("Invalid node IDs: invalid-node");
  });

  it("should handle execution queue full error", async () => {
    let acquireCount = 0;
    vi.mocked(mockExecutionQueue.acquire).mockImplementation(async () => {
      acquireCount++;
      if (acquireCount === 2) {
        const error = new Error("Queue is full");
        error.name = "ExecutionQueueFullError";
        throw error;
      }
    });
    await expect(service.createBatch({ targetNodeIds: ["node1", "node2"], type: "command", action: "uptime" }, "user1"))
      .rejects.toThrow("Failed to enqueue execution for node node2");
  });

  it("should create batch record in database with correct stats", async () => {
    const result = await service.createBatch({ targetNodeIds: ["node1", "node2", "node3"], type: "command", action: "uptime" }, "user1");
    const batchRow = await db.queryOne<any>("SELECT * FROM batch_executions WHERE id = ?", [result.batchId]);
    expect(batchRow).toBeDefined();
    expect(batchRow.type).toBe("command");
    expect(batchRow.action).toBe("uptime");
    expect(batchRow.status).toBe("running");
    expect(batchRow.user_id).toBe("user1");
    expect(batchRow.stats_total).toBe(3);
    expect(batchRow.stats_queued).toBe(3);
    expect(JSON.parse(batchRow.target_nodes)).toEqual(["node1", "node2", "node3"]);
    expect(JSON.parse(batchRow.execution_ids)).toHaveLength(3);
  });

  it("should set batch_id and batch_position on execution records", async () => {
    await service.createBatch({ targetNodeIds: ["node1", "node2"], type: "command", action: "uptime" }, "user1");
    const calls = vi.mocked(mockExecutionRepository.create).mock.calls;
    expect(calls[0][0]).toMatchObject({ batchId: expect.any(String), batchPosition: 0 });
    expect(calls[1][0]).toMatchObject({ batchId: expect.any(String), batchPosition: 1 });
  });
});

describe("BatchExecutionService - cancelBatch", () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await createSchema(db);

    mockIntegrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [{ id: "node1", name: "server1.example.com" }, { id: "node2", name: "server2.example.com" }, { id: "node3", name: "server3.example.com" }],
        groups: [],
      }),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(db, {} as ExecutionQueue, {} as ExecutionRepository, mockIntegrationManager);
  });

  afterEach(async () => {
    await db.close();
  });

  it("should cancel running executions and update batch status", async () => {
    const batchId = "batch-cancel-1";
    await insertBatch(db, batchId, { stats_running: 3, stats_success: 0, stats_failed: 0 });

    for (let i = 0; i < 3; i++) {
      await insertExecution(db, {
        id: `exec${i + 1}`, nodeId: `node${i + 1}`, status: "running",
        startedAt: "2024-01-01T10:00:00Z", completedAt: null, results: JSON.stringify([]),
      }, batchId, i);
    }

    const result = await service.cancelBatch(batchId);
    expect(result.cancelledCount).toBe(3);

    const updatedExecutions = await db.query<any>("SELECT * FROM executions WHERE batch_id = ?", [batchId]);
    expect(updatedExecutions).toHaveLength(3);
    for (const exec of updatedExecutions) {
      expect(exec.status).toBe("failed");
      expect(exec.error).toBe("Cancelled by user");
      expect(exec.completed_at).toBeTruthy();
    }

    const updatedBatch = await db.queryOne<any>("SELECT * FROM batch_executions WHERE id = ?", [batchId]);
    expect(updatedBatch.status).toBe("cancelled");
    expect(updatedBatch.completed_at).toBeTruthy();
  });

  it("should only cancel running executions, not completed ones", async () => {
    const batchId = "batch-cancel-2";
    await insertBatch(db, batchId, { stats_running: 2, stats_success: 1, stats_failed: 0 });

    await insertExecution(db, { id: "exec1", nodeId: "node1", status: "success", startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:05Z", results: JSON.stringify([]) }, batchId, 0);
    await insertExecution(db, { id: "exec2", nodeId: "node2", status: "running", startedAt: "2024-01-01T10:00:00Z", completedAt: null, results: JSON.stringify([]) }, batchId, 1);
    await insertExecution(db, { id: "exec3", nodeId: "node3", status: "running", startedAt: "2024-01-01T10:00:00Z", completedAt: null, results: JSON.stringify([]) }, batchId, 2);

    const result = await service.cancelBatch(batchId);
    expect(result.cancelledCount).toBe(2);

    const successExecution = await db.queryOne<any>("SELECT * FROM executions WHERE id = ?", ["exec1"]);
    expect(successExecution.status).toBe("success");
    expect(successExecution.error).toBeNull();
  });

  it("should throw error when batch does not exist", async () => {
    await expect(service.cancelBatch("nonexistent")).rejects.toThrow("Batch execution nonexistent not found");
  });

  it("should return zero cancelled count when no running executions", async () => {
    const batchId = "batch-cancel-3";
    await insertBatch(db, batchId, {
      target_nodes: JSON.stringify(["node1", "node2"]),
      status: "success",
      execution_ids: JSON.stringify(["exec1", "exec2"]),
      stats_total: 2, stats_queued: 0, stats_running: 0, stats_success: 2, stats_failed: 0,
    });

    for (let i = 1; i <= 2; i++) {
      await insertExecution(db, {
        id: `exec${i}`, nodeId: `node${i}`, status: "success",
        startedAt: "2024-01-01T10:00:00Z", completedAt: "2024-01-01T10:00:05Z", results: JSON.stringify([]),
      }, batchId, i - 1);
    }

    const result = await service.cancelBatch(batchId);
    expect(result.cancelledCount).toBe(0);

    const updatedBatch = await db.queryOne<any>("SELECT * FROM batch_executions WHERE id = ?", [batchId]);
    expect(updatedBatch.status).toBe("cancelled");
  });
});
