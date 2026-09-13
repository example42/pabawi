import { ExecutionService } from "../../src/services/ExecutionService";
import { ExecutionDispatcher } from "../../src/services/ExecutionDispatcher";
import type { BoltService } from "../../src/integrations/bolt/BoltService";
import { BoltCommandWhitelistService } from "../../src/validation/CommandWhitelistService";
/**
 * Idempotent admission over HTTP (A14 / I05).
 *
 * The acceptance case: drop the response to a committed submission, resend the
 * same request with the same `Idempotency-Key`, and prove only one batch or
 * Puppet run exists. The same submission without a key must admit twice, which
 * is why the transport does not retry it.
 */
import { initializeTestSchema } from "../helpers/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createHttpHarness, type HttpHarness } from "../helpers/httpHarness";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { createExecutionsRouter } from "../../src/routes/executions";
import { createPuppetRouter } from "../../src/routes/puppet";
import { errorHandler, requestIdMiddleware } from "../../src/middleware/errorHandler";
import { BatchExecutionService } from "../../src/services/BatchExecutionService";
import { RequestIdempotencyService } from "../../src/services/RequestIdempotencyService";
import { ExecutionQueue } from "../../src/services/ExecutionQueue";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { noPermissionCheck } from "../../src/middleware/routeAuthorization";

let harness: HttpHarness;

beforeAll(async () => {
  harness = await createHttpHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("Idempotent admission", () => {
  let app: Express;
  let db: DatabaseAdapter;
  let executionRepository: ExecutionRepository;
  let queue: ExecutionQueue;
  let executionService: ExecutionService;
  let integrationManager: IntegrationManager;
  let batchExecutionService: BatchExecutionService;
  let requestIdempotency: RequestIdempotencyService;
  let release!: () => void;
  let blocked: Promise<void>;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);
    executionRepository = new ExecutionRepository(db);
    queue = new ExecutionQueue(4, 32);
    requestIdempotency = new RequestIdempotencyService(db);

    // Providers stay blocked for the whole test: admission must be decided by
    // the database, never by how far the provider work has got.
    blocked = new Promise<void>((resolve) => { release = resolve; });
    integrationManager = {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: ["node1", "node2"].map((id) => ({
          id, name: id, uri: id, source: "bolt", sources: ["bolt"], linked: false, sourceData: {},
        })),
        groups: [],
        sources: {},
      }),
      getExecutionTool: vi.fn().mockReturnValue({}),
      executeAction: vi.fn().mockImplementation(async (_tool: string, action: { action: string }) => {
        await blocked;
        return {
          id: "provider", type: "command", action: action.action, targetNodes: [],
          status: "success", startedAt: new Date().toISOString(), results: [],
        };
      }),
    } as unknown as IntegrationManager;

    batchExecutionService = new BatchExecutionService(db, queue, executionRepository, integrationManager);

    executionService = new ExecutionService(db, queue, executionRepository,
      new ExecutionDispatcher(integrationManager, {} as BoltService, [],
        new BoltCommandWhitelistService({ allowAll: true, whitelist: [], matchMode: "exact" })));

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use("/api/executions", createExecutionsRouter(
      executionRepository, noPermissionCheck, queue, batchExecutionService, undefined, undefined, requestIdempotency,
    ));
    app.use("/api/puppet-run", createPuppetRouter(
      integrationManager, noPermissionCheck, executionService,
    ));
    app.use(errorHandler);
  });

  afterEach(async () => {
    // Let the blocked providers finish and every record reach a terminal state
    // before admission stops: a stopping service deliberately abandons in-flight
    // work to restart reconciliation, and the Puppet route dispatches without a
    // tracked worker set, so its runs can only be drained through their records.
    release();
    await vi.waitFor(async () => {
      const records = await executionRepository.findAll();
      expect(records.filter((record) => record.status === "running" || record.status === "queued")).toHaveLength(0);
    }, { timeout: 3000 });
    batchExecutionService.stopAdmission();
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    await executionService.drain();
    await db.close();
    vi.restoreAllMocks();
  });

  const batchBody = { targetNodeIds: ["node1", "node2"], type: "command", action: "uptime" };

  async function batchCount(): Promise<number> {
    return (await db.query("SELECT id FROM batch_executions")).length;
  }

  describe("POST /api/executions/batch", () => {
    it("admits one batch when the response is lost and the submission is resent", async () => {
      const first = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send(batchBody)
        .timeout(2000)
        .expect(201);

      const replay = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send(batchBody)
        .timeout(2000)
        .expect(201);

      expect(replay.body).toEqual(first.body);
      expect(await batchCount()).toBe(1);
      expect(await executionRepository.findAll()).toHaveLength(2);
    });

    it("ignores property order in the resent body", async () => {
      const first = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send(batchBody)
        .expect(201);

      const replay = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send({ action: "uptime", type: "command", targetNodeIds: ["node1", "node2"] })
        .expect(201);

      expect(replay.body.batchId).toBe(first.body.batchId);
      expect(await batchCount()).toBe(1);
    });

    it("admits twice without a key, which is why the transport must not retry", async () => {
      const first = await request(harness.use(app))
        .post("/api/executions/batch").send(batchBody).expect(201);
      const second = await request(harness.use(app))
        .post("/api/executions/batch").send(batchBody).expect(201);

      expect(second.body.batchId).not.toBe(first.body.batchId);
      expect(await batchCount()).toBe(2);
    });

    it("rejects a key reused for a different request and admits nothing new", async () => {
      await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send(batchBody)
        .expect(201);

      const conflict = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send({ ...batchBody, action: "whoami" })
        .expect(409);

      expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
      expect(await batchCount()).toBe(1);
    });

    it("rejects a key that cannot identify a submission", async () => {
      const response = await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "   ")
        .send(batchBody)
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_IDEMPOTENCY_KEY");
      expect(await batchCount()).toBe(0);
    });

    it("keeps one user's key from reaching another user's batch", async () => {
      // The router's user comes from auth middleware; without it both requests
      // are the same principal, so the store is exercised directly here.
      await request(harness.use(app))
        .post("/api/executions/batch")
        .set("Idempotency-Key", "submission-1")
        .send(batchBody)
        .expect(201);

      const rows = await db.query<{ user_id: string }>("SELECT user_id FROM request_idempotency");
      expect(rows).toHaveLength(1);
      const other = await requestIdempotency.claim(
        {
          userId: "someone-else",
          key: "submission-1",
          scope: "POST /api/executions/batch",
          fingerprint: RequestIdempotencyService.fingerprint("POST /api/executions/batch", batchBody),
        },
        { status: 201, body: { batchId: "theirs" } },
      );
      expect(other).toEqual({ claimed: true });
    });
  });

  describe("POST /api/puppet-run", () => {
    const puppetBody = { targetNodeIds: ["node1", "node2"] };

    it("starts one set of runs when the response is lost and the submission is resent", async () => {
      const first = await request(harness.use(app))
        .post("/api/puppet-run")
        .set("Idempotency-Key", "puppet-1")
        .send(puppetBody)
        .timeout(2000)
        .expect(202);

      const replay = await request(harness.use(app))
        .post("/api/puppet-run")
        .set("Idempotency-Key", "puppet-1")
        .send(puppetBody)
        .timeout(2000)
        .expect(202);

      expect(replay.body.executionIds).toEqual(first.body.executionIds);
      expect(await executionRepository.findAll()).toHaveLength(2);
      // The replay names runs that are already dispatched; dispatching again is
      // exactly the duplication the key exists to prevent.
      await vi.waitFor(() => expect(integrationManager.executeAction).toHaveBeenCalledTimes(2));
      expect(integrationManager.executeAction).toHaveBeenCalledTimes(2);
    });

    it("starts two sets of runs without a key", async () => {
      const first = await request(harness.use(app)).post("/api/puppet-run").send(puppetBody).expect(202);
      const second = await request(harness.use(app)).post("/api/puppet-run").send(puppetBody).expect(202);

      expect(second.body.executionIds).not.toEqual(first.body.executionIds);
      expect(await executionRepository.findAll()).toHaveLength(4);
    });

    it("rejects a key reused for a different run", async () => {
      await request(harness.use(app))
        .post("/api/puppet-run")
        .set("Idempotency-Key", "puppet-1")
        .send(puppetBody)
        .expect(202);

      const conflict = await request(harness.use(app))
        .post("/api/puppet-run")
        .set("Idempotency-Key", "puppet-1")
        .send({ ...puppetBody, noop: true })
        .expect(409);

      expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
      expect(await executionRepository.findAll()).toHaveLength(2);
    });
  });
});
