import type { ExecutionDispatcher } from "./ExecutionDispatcher";
import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { ExecutionRepository, NewExecution } from "../database/ExecutionRepository";
import type { ExecutionQueue, QueuedExecution } from "./ExecutionQueue";
import { LoggerService } from "./LoggerService";
import { RequestIdempotencyService, type IdempotentSubmission, type IdempotentResponse } from "./RequestIdempotencyService";
import type { StreamingExecutionManager } from "./StreamingExecutionManager";

export class ExecutionLifecycleError extends Error {
  constructor(message: string) { super(message); this.name = "ExecutionLifecycleError"; }
}

export type ExecutionSubmission = Omit<NewExecution, "status" | "results" | "userId" | "startedAt">;

/** Owns direct work from atomic admission through actual provider settlement. */
export class ExecutionService {
  private stopping = false;
  private failed = false;
  private readonly admissions = new Set<Promise<unknown>>();
  private readonly ownedIds = new Set<string>();
  private readonly workers = new Set<Promise<void>>();
  private readonly idempotency: RequestIdempotencyService;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly queue: ExecutionQueue,
    private readonly repository: ExecutionRepository,
    private readonly dispatcher: ExecutionDispatcher,
    private readonly streaming?: StreamingExecutionManager,
    private readonly logger = new LoggerService(),
  ) { this.idempotency = new RequestIdempotencyService(db); }

  async submit(
    submissions: ExecutionSubmission[],
    userId: string,
    response: (ids: string[]) => IdempotentResponse,
    idempotency?: IdempotentSubmission,
  ): Promise<IdempotentResponse> {
    if (this.isStopping()) throw new ExecutionLifecycleError("Execution admission is stopped");
    const ids = submissions.map(() => randomUUID());
    const accepted = response(ids);
    const entries: QueuedExecution[] = submissions.map((record, index) => ({
      id: ids[index], nodeId: record.targetNodes[0], type: record.type,
      action: record.action, enqueuedAt: new Date(),
    }));
    const admission = this.db.withTransaction(async () => {
      if (this.isStopping()) throw new ExecutionLifecycleError("Execution admission is stopped");
      if (idempotency?.key !== undefined) {
        const outcome = await this.idempotency.claim({ ...idempotency, key: idempotency.key }, accepted);
        if (!outcome.claimed) return outcome.replay;
      }
      // Replays consume no new capacity, including when the original filled the queue.
      for (const record of submissions) this.dispatcher.validate(record);
      this.queue.reserve(entries);
      for (const id of ids) this.ownedIds.add(id);
      for (const [index, submission] of submissions.entries()) {
        await this.repository.create({ ...submission, userId, status: "queued", results: [] }, ids[index]);
        if (submission.originalExecutionId) {
          await this.db.execute("UPDATE executions SET re_execution_count = COALESCE(re_execution_count, 0) + 1 WHERE id = ?",
            [submission.originalExecutionId]);
        }
      }
      return undefined;
    });
    this.admissions.add(admission);
    try {
      const replay = await admission;
      if (replay) return replay;
      // Register workers before resolving admission, so shutdown cannot miss a scheduled callback.
      for (const [index, submission] of submissions.entries()) {
        const worker = this.execute(entries[index], submission).catch((error: unknown) => {
          this.failed = true;
          this.logger.error("Execution persistence failed; restart reconciliation is required", {
            component: "ExecutionService", operation: "execute", metadata: { executionId: ids[index] },
          }, error instanceof Error ? error : undefined);
        });
        this.workers.add(worker);
        void worker.then(() => this.workers.delete(worker));
      }
      return accepted;
    } catch (error) {
      this.queue.releaseReservations(ids);
      for (const id of ids) this.ownedIds.delete(id);
      throw error;
    } finally {
      this.admissions.delete(admission);
    }
  }

  replay(request: IdempotentSubmission): Promise<IdempotentResponse | undefined> {
    return this.idempotency.lookup(request);
  }

  async reExecute(record: ExecutionSubmission, userId: string): Promise<string> {
    await this.dispatcher.validateTargets(record.targetNodes);
    const response = await this.submit([record], userId, ids => ({ status: 202, body: { executionId: ids[0] } }));
    return (response.body as { executionId: string }).executionId;
  }

  private async execute(entry: QueuedExecution, submission: ExecutionSubmission): Promise<void> {
    let dispatched = false;
    try {
      if (this.isStopping()) throw new ExecutionLifecycleError("Process stopped before dispatch");
      await this.queue.acquire(entry);
      if (this.isStopping()) throw new ExecutionLifecycleError("Process stopped before dispatch");
      const claimed = await this.db.execute("UPDATE executions SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'",
        [new Date().toISOString(), entry.id]);
      if (!claimed.changes) return;
      if (this.isStopping()) throw new ExecutionLifecycleError("Process stopped before dispatch");
      dispatched = true;
      const result = await this.dispatcher.run(submission, entry.id);
      if (!["success", "failed", "partial"].includes(result.status)) {
        throw new ExecutionLifecycleError("Provider returned without a terminal outcome");
      }
      await this.repository.update(entry.id, {
        status: result.status, completedAt: result.completedAt ?? new Date().toISOString(),
        results: result.results, error: result.error, command: result.command ?? submission.command,
        stdout: submission.expertMode ? result.stdout : undefined,
        stderr: submission.expertMode ? result.stderr : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution outcome";
      await this.db.execute(`UPDATE executions SET status = ?, completed_at = ?, error = ?
        WHERE id = ? AND status IN ('queued', 'running')`,
      [dispatched ? "interrupted" : "cancelled", new Date().toISOString(), message, entry.id]);
    } finally {
      this.queue.releaseReservations([entry.id]);
      this.queue.release(entry.id);
      this.ownedIds.delete(entry.id);
    }
    const record = await this.repository.findById(entry.id);
    if (record) {
      this.streaming?.emitComplete(entry.id, record);
      await this.dispatcher.completed(record);
    }
  }

  async cancel(id: string): Promise<{ cancelledCount: number; runningCount: number }> {
    const now = new Date().toISOString();
    const cancelled = await this.db.execute(`UPDATE executions SET status = 'cancelled', completed_at = ?,
      cancellation_requested_at = COALESCE(cancellation_requested_at, ?), error = 'Cancelled before dispatch'
      WHERE id = ? AND batch_id IS NULL AND status = 'queued'`, [now, now, id]);
    if (cancelled.changes) {
      this.queue.cancel(id);
      this.streaming?.emitComplete(id, { status: "cancelled", error: "Cancelled before dispatch" });
      return { cancelledCount: 1, runningCount: 0 };
    }
    const running = await this.db.execute(`UPDATE executions SET cancellation_requested_at = COALESCE(cancellation_requested_at, ?)
      WHERE id = ? AND batch_id IS NULL AND status = 'running'`, [now, id]);
    return { cancelledCount: 0, runningCount: running.changes };
  }

  private isStopping(): boolean { return this.stopping; }

  stopAdmission(): void {
    this.stopping = true;
    for (const id of this.ownedIds) this.queue.cancel(id);
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.admissions);
    await Promise.all(this.workers);
    if (this.failed) throw new ExecutionLifecycleError("Execution workers failed to persist their final state");
  }
}
