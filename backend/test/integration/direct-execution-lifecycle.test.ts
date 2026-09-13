import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { DatabaseService } from "../../src/database/DatabaseService";
import { PostgresAdapter } from "../../src/database/PostgresAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { randomUUID } from "node:crypto";
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { ExecutionService, type ExecutionSubmission } from "../../src/services/ExecutionService";
import { ExecutionDispatcher } from "../../src/services/ExecutionDispatcher";
import { ExecutionQueue } from "../../src/services/ExecutionQueue";
import { BatchExecutionService } from "../../src/services/BatchExecutionService";
import { RequestIdempotencyService } from "../../src/services/RequestIdempotencyService";
import { ShutdownCoordinator } from "../../src/services/ShutdownCoordinator";
import { LoggerService } from "../../src/services/LoggerService";
import { BoltCommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { BoltService } from "../../src/integrations/bolt/BoltService";
import type { ExecutionResult } from "../../src/integrations/bolt/types";
import type { StreamingExecutionManager } from "../../src/services/StreamingExecutionManager";
import { createCommandsRouter } from "../../src/routes/commands";
import { createTasksRouter } from "../../src/routes/tasks";
import { createPackagesRouter } from "../../src/routes/packages";
import { createPlaybooksRouter } from "../../src/routes/playbooks";
import { createPuppetRouter } from "../../src/routes/puppet";
import { createExecutionsRouter } from "../../src/routes/executions";
import { noPermissionCheck } from "../../src/middleware/routeAuthorization";
import { createHttpHarness, type HttpHarness } from "../helpers/httpHarness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const success: ExecutionResult = {
  id: "provider-id", type: "command", targetNodes: ["node1"], action: "uptime",
  status: "success", startedAt: new Date().toISOString(), results: [],
};
const command: ExecutionSubmission = {
  type: "command", targetNodes: ["node1"], action: "uptime", executionTool: "bolt",
};
const response = (ids: string[]) => ({ status: 202, body: { executionIds: ids } });

const databaseUrl = process.env.TEST_DATABASE_URL;
for (const dialect of ["sqlite", "postgres"] as const) {
describe.skipIf(dialect === "postgres" && !databaseUrl)(`${dialect}: direct execution ownership`, () => {
  let db: DatabaseAdapter;
  let database: DatabaseService;
  let control: PostgresAdapter | undefined;
  let schema: string;
  let repository: ExecutionRepository;
  let queue: ExecutionQueue;
  let service: ExecutionService;
  let batch: BatchExecutionService;
  let provider: ReturnType<typeof deferred<ExecutionResult>>;
  let manager: IntegrationManager;
  let harness: HttpHarness;
  const execute = vi.fn();
  const install = vi.fn();
  const emitComplete = vi.fn();
  const whitelist = new BoltCommandWhitelistService({ allowAll: false, whitelist: ["uptime"], matchMode: "exact" });
  const packageTasks = [{ name: "package", label: "Package", parameterMapping: { packageName: "name", ensure: "ensure" } }];

  beforeEach(async () => {
    vi.clearAllMocks();
    if (dialect === "postgres" && databaseUrl) {
      control = new PostgresAdapter(databaseUrl);
      await control.initialize();
      schema = `direct_${randomUUID().replaceAll("-", "")}`;
      await control.execute(`CREATE SCHEMA ${schema}`);
      const url = new URL(databaseUrl);
      url.searchParams.set("options", `-csearch_path=${schema}`);
      database = new DatabaseService(":memory:", "postgres", url.toString());
    } else {
      database = new DatabaseService(":memory:");
    }
    await database.initialize();
    db = database.getAdapter();
    repository = new ExecutionRepository(db);
    queue = new ExecutionQueue(1, 2);
    provider = deferred<ExecutionResult>();
    execute.mockImplementation(() => provider.promise);
    install.mockImplementation(() => provider.promise);
    manager = {
      getExecutionTool: () => ({}),
      getAggregatedInventory: async () => ({ nodes: ["node1", "node2"].map(id => ({ id, name: id })), groups: [] }),
      executeAction: execute,
    } as unknown as IntegrationManager;
    const streaming = { createStreamingCallback: vi.fn(), emitComplete } as unknown as StreamingExecutionManager;
    service = new ExecutionService(db, queue, repository,
      new ExecutionDispatcher(manager, { installPackage: install } as unknown as BoltService, packageTasks, whitelist, streaming), streaming);
    batch = new BatchExecutionService(db, queue, repository, manager);
    harness = await createHttpHarness();
  });

  afterEach(async () => {
    provider.resolve(success);
    service.stopAdmission();
    batch.stopAdmission();
    await service.drain();
    await batch.drain();
    await batch.reconcileInterrupted();
    await harness.close();
    await database.close();
    if (control) {
      await control.execute(`DROP SCHEMA ${schema} CASCADE`);
      await control.close();
      control = undefined;
    }
    vi.restoreAllMocks();
  });

  function app() {
    const application = express();
    application.use(express.json());
    application.use((req, _res, next) => {
      req.user = { userId: "caller", username: "caller", roles: [], iat: 1, exp: 9999999999 };
      next();
    });
    application.use("/api/nodes", createCommandsRouter(manager, service, whitelist, noPermissionCheck));
    application.use("/api/nodes", createTasksRouter(manager, noPermissionCheck, service));
    application.use("/api/nodes", createPlaybooksRouter(manager, noPermissionCheck, service));
    application.use("/api/nodes", createPuppetRouter(manager, noPermissionCheck, service));
    application.use("/api/puppet-run", createPuppetRouter(manager, noPermissionCheck, service));
    application.use("/api/packages", createPackagesRouter(manager, noPermissionCheck, service, packageTasks));
    application.use("/api/executions", createExecutionsRouter(repository, noPermissionCheck, queue, batch, undefined, whitelist, undefined, service));
    return harness.use(application);
  }

  it.each([
    ["/api/nodes/node1/command", { command: "uptime" }, "command", "bolt"],
    ["/api/nodes/node1/task", { taskName: "test::run" }, "task", "bolt"],
    ["/api/nodes/node1/playbook", { playbookPath: "site.yml" }, "plan", "ansible"],
    ["/api/nodes/node1/puppet-run", {}, "puppet", "bolt"],
    ["/api/packages/node1/install-package", { taskName: "package", packageName: "httpd" }, "package", "bolt"],
  ])("%s persists attributed queued work before dispatch and shares batch capacity", async (url, body, type, tool) => {
    await batch.createBatch({ targetNodeIds: ["node1"], type: "command", action: "uptime" }, "batch-caller");
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const accepted = await request(app()).post(url).send(body).expect(202);
    expect(accepted.body.status).toBe("queued");
    const record = await repository.findById(accepted.body.executionId);
    expect(record).toMatchObject({ status: "queued", type, userId: "caller", executionTool: tool });
    expect(record?.startedAt).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
    const cancelled = await request(app()).post(`/api/executions/${record?.id}/cancel`).send({}).expect(200);
    expect(cancelled.body).toMatchObject({ cancelledCount: 1, runningCount: 0 });
    provider.resolve(success);
    await service.drain();
    await batch.drain();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    expect((await repository.findById(record!.id))?.status).toBe("cancelled");
  });

  it("records a running cancellation request and retains capacity until the provider settles", async () => {
    const accepted = await request(app()).post("/api/nodes/node1/command").send({ command: "uptime" }).expect(202);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const id = accepted.body.executionId;
    const cancelled = await request(app()).post(`/api/executions/${id}/cancel`).send({}).expect(200);
    expect(cancelled.body).toMatchObject({ cancelledCount: 0, runningCount: 1 });
    expect(await repository.findById(id)).toMatchObject({ status: "running", cancellationRequestedAt: expect.any(String) });
    expect(queue.getStatus().running).toBe(1);
    provider.resolve(success);
    await service.drain();
    expect(await repository.findById(id)).toMatchObject({ status: "success", cancellationRequestedAt: expect.any(String) });
    expect(queue.getStatus().running).toBe(0);
  });

  it("replays an atomic multi-node Puppet admission when its own work fills capacity", async () => {
    const body = { targetNodeIds: ["node1", "node2", "node1"] };
    const first = await request(app()).post("/api/puppet-run").set("Idempotency-Key", "same-intent").send(body).expect(202);
    const replay = await request(app()).post("/api/puppet-run").set("Idempotency-Key", "same-intent").send(body).expect(202);
    expect(replay.body).toEqual(first.body);
    expect(await repository.findAll()).toHaveLength(3);
    expect(queue.getStatus()).toMatchObject({ running: 1, queued: 2 });
    await request(app()).post("/api/nodes/node1/command").send({ command: "uptime" }).expect(503);
    expect(await repository.findAll()).toHaveLength(3);
  });

  it("replays committed Puppet work before mutable inventory validation", async () => {
    const body = { targetNodeIds: ["node1"], tool: "bolt" };
    const first = await request(app()).post("/api/puppet-run").set("Idempotency-Key", "existing").send(body).expect(202);
    vi.spyOn(manager, "getAggregatedInventory").mockRejectedValue(new Error("inventory unavailable"));
    const replay = await request(app()).post("/api/puppet-run").set("Idempotency-Key", "existing").send(body).expect(202);
    expect(replay.body).toEqual(first.body);
    expect(await repository.findAll()).toHaveLength(1);
  });

  it("rolls back all records, the key and capacity when a multi-node write fails", async () => {
    const create = repository.create.bind(repository);
    vi.spyOn(repository, "create").mockImplementationOnce(create).mockRejectedValueOnce(new Error("disk failure"));
    await expect(service.submit([command, command], "caller", response, {
      userId: "caller", key: "atomic", scope: "test", fingerprint: "same",
    })).rejects.toThrow("disk failure");
    expect(await repository.findAll()).toHaveLength(0);
    expect(await db.query("SELECT * FROM request_idempotency")).toHaveLength(0);
    expect(queue.getStatus()).toMatchObject({ running: 0, queued: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not report success or retry when a dispatched provider throws", async () => {
    const accepted = await service.submit([command], "caller", response);
    const id = (accepted.body as { executionIds: string[] }).executionIds[0];
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    provider.reject(new Error("transport dropped after dispatch"));
    await service.drain();
    expect(await repository.findById(id)).toMatchObject({ status: "interrupted" });
    expect(emitComplete).toHaveBeenCalledWith(id, expect.objectContaining({ status: "interrupted" }));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("dispatches re-execution, attributes the new caller and atomically updates its parent", async () => {
    const original = await repository.create({ ...command, status: "success", userId: "original-caller", results: [] });
    const accepted = await request(app()).post(`/api/executions/${original}/re-execute`).send({}).expect(201);
    const id = accepted.body.execution.id;
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(await repository.findById(id)).toMatchObject({ originalExecutionId: original, userId: "caller" });
    expect(await repository.findById(original)).toMatchObject({ reExecutionCount: 1 });
    await request(app()).post(`/api/executions/${original}/re-execute`).send({ action: "whoami" }).expect(403);
    expect(await repository.findAll()).toHaveLength(2);
  });

  it("drains actual work before database closure and cancels queued direct work", async () => {
    await service.submit([command, command], "caller", response);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const close = vi.fn().mockResolvedValue(undefined);
    const shutdown = new ShutdownCoordinator(() => { service.stopAdmission(); batch.stopAdmission(); },
      async () => { await Promise.all([service.drain(), batch.drain()]); }, close, new LoggerService(), 2000);
    const completion = shutdown.shutdown();
    await vi.waitFor(async () => expect((await repository.findAll()).filter(row => row.status === "cancelled")).toHaveLength(1));
    expect(close).not.toHaveBeenCalled();
    await expect(service.submit([command], "caller", response)).rejects.toThrow("stopped");
    provider.resolve(success);
    expect(await completion).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns nonzero at the shutdown deadline without closing storage beneath a provider", async () => {
    await service.submit([command], "caller", response);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const close = vi.fn().mockResolvedValue(undefined);
    const shutdown = new ShutdownCoordinator(() => service.stopAdmission(), () => service.drain(), close, new LoggerService(), 20);
    expect(await shutdown.shutdown()).toBe(1);
    expect(close).not.toHaveBeenCalled();
    expect(queue.getStatus().running).toBe(1);
    provider.resolve(success);
    await service.drain();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ["command", "uptime", undefined, "bolt", "command", "uptime"],
    ["task", "test::run", { value: 1 }, "bolt", "task", "test::run"],
    ["plan", "site.yml", { extraVars: { value: 1 } }, "ansible", "plan", "site.yml"],
    ["package", "ansible.builtin.package", { packageName: "httpd" }, "ansible", "task", "package"],
  ] as const)("preserves %s dispatch semantics on re-execution", async (type, action, parameters, tool, providerType, providerAction) => {
    execute.mockResolvedValue(success);
    const intent: ExecutionSubmission = { type, action, parameters, targetNodes: ["node1"], executionTool: tool };
    const accepted = await service.submit([intent], "first-caller", response);
    await service.drain();
    const id = (accepted.body as { executionIds: string[] }).executionIds[0];
    const repeated = await service.reExecute({ ...intent, originalExecutionId: id }, "second-caller");
    await service.drain();
    expect(execute).toHaveBeenCalledTimes(2);
    for (const call of execute.mock.calls) {
      expect(call).toEqual([tool, expect.objectContaining({ type: providerType, target: "node1", action: providerAction })]);
    }
    expect(await repository.findById(repeated)).toMatchObject({ status: "success", userId: "second-caller" });
  });

  it("preserves Bolt package mapping on initial and repeated work", async () => {
    install.mockResolvedValue(success);
    const record: ExecutionSubmission = {
      type: "package", action: "package", parameters: { packageName: "httpd", ensure: "latest" },
      targetNodes: ["node1"], executionTool: "bolt",
    };
    const accepted = await service.submit([record], "caller", response);
    await service.drain();
    await service.reExecute({ ...record, originalExecutionId: (accepted.body as { executionIds: string[] }).executionIds[0] }, "caller");
    await service.drain();
    expect(install).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenLastCalledWith("node1", "package", { packageName: "httpd", ensure: "latest" }, packageTasks[0].parameterMapping, undefined);
    expect(execute).not.toHaveBeenCalled();
  });

  it("normalizes Puppet exit code 2 and rebuilds a validated command for re-execution", async () => {
    execute.mockImplementation(async () => ({ ...success, status: "failed", results: [{
      nodeId: "node1", status: "failed", output: { exitCode: 2 }, error: "exit code 2", duration: 1,
    }] }));
    const record: ExecutionSubmission = {
      type: "puppet", action: "puppet_agent", parameters: { environment: "production", noop: true },
      targetNodes: ["node1"], executionTool: "ssh", command: "untrusted display text",
    };
    const accepted = await service.submit([record], "caller", response);
    await service.drain();
    const repeated = await service.reExecute({ ...record, originalExecutionId: (accepted.body as { executionIds: string[] }).executionIds[0] }, "caller");
    await service.drain();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith("ssh", expect.objectContaining({
      type: "command", action: expect.stringContaining("--noop --environment production"), parameters: { sudo: true },
    }));
    expect(await repository.findById(repeated)).toMatchObject({ status: "success", results: [{ status: "success" }] });
  });

  it("tracks an admission already writing when shutdown begins", async () => {
    const entered = deferred<void>();
    const proceed = deferred<void>();
    const create = repository.create.bind(repository);
    vi.spyOn(repository, "create").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await proceed.promise;
      return create(...args);
    });
    const admission = service.submit([command], "caller", response);
    await entered.promise;
    service.stopAdmission();
    const drained = vi.fn();
    const drain = service.drain().then(drained);
    expect(drained).not.toHaveBeenCalled();
    proceed.resolve();
    await admission;
    await drain;
    expect(execute).not.toHaveBeenCalled();
    expect(await repository.findAll()).toEqual([expect.objectContaining({ status: "cancelled" })]);
    expect(queue.getStatus()).toMatchObject({ running: 0, queued: 0 });
  });

  it("replays batch admission when the original occupies every slot", async () => {
    const idempotency = { service: new RequestIdempotencyService(db), key: "batch", scope: "batch", fingerprint: "same", status: 202 };
    const body = { targetNodeIds: ["node1", "node2"], type: "command" as const, action: "uptime" };
    const first = await batch.createBatch(body, "caller", idempotency);
    await service.submit([command], "caller", response);
    expect(await batch.createBatch(body, "caller", idempotency)).toEqual(first);
    expect(await repository.findAll()).toHaveLength(3);
  });
});
}
