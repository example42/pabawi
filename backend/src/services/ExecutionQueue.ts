/**
 * Execution queue for managing concurrent execution limits
 *
 * This service ensures that only a limited number of Bolt executions
 * run concurrently to prevent resource exhaustion.
 */

export interface QueuedExecution {
  id: string;
  type: "command" | "task" | "facts" | "puppet" | "package";
  nodeId: string;
  action: string;
  enqueuedAt: Date;
}

export interface QueueStatus {
  running: number;
  queued: number;
  limit: number;
  queue: QueuedExecution[];
}

/**
 * Error thrown when execution queue is full
 */
export class ExecutionQueueFullError extends Error {
  constructor(
    message: string,
    public readonly queueSize: number,
    public readonly limit: number,
  ) {
    super(message);
    this.name = "ExecutionQueueFullError";
  }
}

/**
 * Service for managing concurrent execution limits with a queue
 */
export class ExecutionQueue {
  private readonly limit: number;
  private readonly maxQueueSize: number;
  private runningExecutions = new Set<string>();
  private queuedExecutions = new Map<string, QueuedExecution>();
  private waitingPromises = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  constructor(limit = 5, maxQueueSize = 50) {
    this.limit = limit;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Acquire a slot for execution
   *
   * This method will either:
   * 1. Immediately grant execution if under the limit
   * 2. Queue the execution and wait for a slot to become available
   * 3. Reject if the queue is full
   *
   * @param execution - Execution metadata
   * @returns Promise that resolves when execution can proceed
   * @throws ExecutionQueueFullError if queue is full
   */
  public async acquire(execution: QueuedExecution): Promise<void> {
    // If under limit, allow immediate execution
    if (this.runningExecutions.size < this.limit) {
      this.runningExecutions.add(execution.id);
      return Promise.resolve();
    }

    // Check if queue is full
    if (this.queuedExecutions.size >= this.maxQueueSize) {
      throw new ExecutionQueueFullError(
        `Execution queue is full. Maximum queue size: ${this.maxQueueSize.toString()}. Please wait for running executions to complete.`,
        this.queuedExecutions.size,
        this.maxQueueSize,
      );
    }

    // Add to queue and wait
    this.queuedExecutions.set(execution.id, execution);

    return new Promise<void>((resolve, reject) => {
      this.waitingPromises.set(execution.id, { resolve, reject });
    });
  }

  /**
   * Release an execution slot
   *
   * This should be called when an execution completes (success or failure)
   * to allow the next queued execution to proceed.
   *
   * @param executionId - ID of the completed execution
   */
  public release(executionId: string): void {
    // Remove from running set
    this.runningExecutions.delete(executionId);

    // Process next queued execution if any
    this.processNextInQueue();
  }

  /**
   * Process the next execution in the queue
   */
  private processNextInQueue(): void {
    // Check if we can process more executions
    if (this.runningExecutions.size >= this.limit) {
      return;
    }

    // Get the oldest queued execution (FIFO)
    const entries = Array.from(this.queuedExecutions.entries());
    if (entries.length === 0) {
      return;
    }

    // Sort by enqueued time (oldest first)
    entries.sort(
      (a, b) => a[1].enqueuedAt.getTime() - b[1].enqueuedAt.getTime(),
    );

    const [executionId] = entries[0];

    // Move from queue to running
    this.queuedExecutions.delete(executionId);
    this.runningExecutions.add(executionId);

    // Resolve the waiting promise
    const promise = this.waitingPromises.get(executionId);
    if (promise) {
      this.waitingPromises.delete(executionId);
      promise.resolve();
    }
  }

  /**
   * Cancel a queued execution
   *
   * @param executionId - ID of the execution to cancel
   * @returns true if execution was cancelled, false if not found or already running
   */
  public cancel(executionId: string): boolean {
    if (!this.queuedExecutions.has(executionId)) {
      return false;
    }

    // Remove from queue
    this.queuedExecutions.delete(executionId);

    // Reject the waiting promise
    const promise = this.waitingPromises.get(executionId);
    if (promise) {
      this.waitingPromises.delete(executionId);
      promise.reject(new Error("Execution cancelled"));
    }

    return true;
  }

  /**
   * Get current queue status
   *
   * @returns Queue status including running count, queued count, and queue details
   */
  public getStatus(): QueueStatus {
    return {
      running: this.runningExecutions.size,
      queued: this.queuedExecutions.size,
      limit: this.limit,
      queue: Array.from(this.queuedExecutions.values())
        .sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime())
        .map((exec) => ({
          id: exec.id,
          type: exec.type,
          nodeId: exec.nodeId,
          action: exec.action,
          enqueuedAt: exec.enqueuedAt,
        })),
    };
  }

  /**
   * Get the current limit
   */
  public getLimit(): number {
    return this.limit;
  }

  /**
   * Get the maximum queue size
   */
  public getMaxQueueSize(): number {
    return this.maxQueueSize;
  }

  /**
   * Check if an execution is running
   *
   * @param executionId - ID of the execution to check
   * @returns true if execution is currently running
   */
  public isRunning(executionId: string): boolean {
    return this.runningExecutions.has(executionId);
  }

  /**
   * Check if an execution is queued
   *
   * @param executionId - ID of the execution to check
   * @returns true if execution is currently queued
   */
  public isQueued(executionId: string): boolean {
    return this.queuedExecutions.has(executionId);
  }

  /**
   * Clear all queued executions
   *
   * This will reject all waiting promises with a cancellation error.
   * Running executions are not affected.
   */
  public clearQueue(): void {
    // Reject all waiting promises
    for (const promise of this.waitingPromises.values()) {
      promise.reject(new Error("Queue cleared"));
    }

    // Clear the queue and promises
    this.queuedExecutions.clear();
    this.waitingPromises.clear();
  }
}
