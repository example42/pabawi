import { SessionAuthorization } from "./SessionAuthorization";
import type { Response } from "express";
import type { StreamingConfig } from "../config/schema";
import { LoggerService } from "./LoggerService";

/**
 * Event types for streaming execution output
 */
export type StreamingEventType =
  | "start"
  | "stdout"
  | "stderr"
  | "status"
  | "complete"
  | "error"
  | "command";

/**
 * Streaming event data structure
 */
export interface StreamingEvent {
  type: StreamingEventType;
  executionId: string;
  timestamp: string;
  data?: unknown;
}

export interface StreamingCallback {
  onCommand: (cmd: string) => void;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

/**
 * Subscriber connection information
 */
interface Subscriber {
  response: Response;
  connectedAt: string;
  authorization?: SessionAuthorization;
}

/**
 * Buffered output for an execution
 */
interface BufferedOutput {
  stdout: string[];
  stderr: string[];
  timer: NodeJS.Timeout | null;
  /** Epoch millis of the last buffered chunk, for the abandoned-state sweep. */
  lastActivityAt: number;
}

/**
 * Payload of a `complete` event.
 *
 * `status` is required because the client shows the run's outcome from it. An
 * event that omitted it used to be rendered as success, so a failed run looked
 * like a successful one (finding I07).
 */
export interface ExecutionCompletion {
  /**
   * The run's terminal status.
   *
   * Deliberately a plain string rather than the terminal union: callers hand
   * over the execution result they just stored, whose status type also admits
   * in-flight values. The client fails closed on anything that is not an
   * explicit success, so an implausible status is reported, not hidden.
   */
  status: string;
  results?: unknown;
  error?: string;
  command?: string;
}

/**
 * How long output state for an execution with no subscribers survives its last
 * chunk.
 *
 * Every execution that reaches `complete` or `error` releases its state at
 * once; this only bounds the state of one that never reaches either, such as a
 * worker that died mid-run.
 */
const ABANDONED_STATE_TTL_MS = 5 * 60_000;

/**
 * Execution output tracking
 */
interface ExecutionTracking {
  totalOutputSize: number;
  outputLimitReached: boolean;
}

/**
 * Service for managing streaming execution output via Server-Sent Events (SSE)
 *
 * This service maintains a registry of active streaming connections and provides
 * methods to emit events to all subscribers of a specific execution.
 *
 * Performance optimizations:
 * - Output buffering to reduce event frequency
 * - Maximum output size limits per execution
 * - Line length truncation for very long lines
 */
export class StreamingExecutionManager {
  private subscribers: Map<string, Set<Subscriber>>;
  private heartbeatInterval: NodeJS.Timeout | null;
  private readonly heartbeatIntervalMs = 30000; // 30 seconds
  private buffers: Map<string, BufferedOutput>;
  private executionTracking: Map<string, ExecutionTracking>;
  private config: StreamingConfig;
  private logger: LoggerService;
  /** Track SSE connection count per client IP to prevent resource exhaustion */
  private connectionCountByIp: Map<string, number>;
  private readonly maxConnectionsPerIp = 10;

  constructor(config: StreamingConfig) {
    this.subscribers = new Map();
    this.heartbeatInterval = null;
    this.buffers = new Map();
    this.executionTracking = new Map();
    this.connectionCountByIp = new Map();
    this.config = config;
    this.logger = new LoggerService();
    this.startHeartbeat();
  }

  public createStreamingCallback(
    executionId: string,
    expertMode: boolean
  ): StreamingCallback | undefined {
    if (!expertMode) {
      return undefined;
    }

    return {
      onCommand: (cmd: string): void => {
        this.emitCommand(executionId, cmd);
      },
      onStdout: (chunk: string): void => {
        this.emitStdout(executionId, chunk);
      },
      onStderr: (chunk: string): void => {
        this.emitStderr(executionId, chunk);
      },
    };
  }

  /**
   * Start heartbeat mechanism to keep SSE connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [executionId, subscribers] of this.subscribers.entries()) {
        for (const subscriber of subscribers) {
          try {
            subscriber.response.write(": heartbeat\n\n");
          } catch (error) {
            this.logger.error(`Failed to send heartbeat to subscriber for execution ${executionId}`, {
              component: "StreamingExecutionManager",
              operation: "startHeartbeat",
              metadata: { executionId },
            }, error instanceof Error ? error : undefined);
            // Remove dead connection
            this.unsubscribe(executionId, subscriber.response);
          }
        }
      }
      this.sweepAbandonedState();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Drop output state for executions that will never report a terminal event.
   *
   * A completed or failed execution releases its state through
   * `closeAllConnections`. This covers the remainder: a worker that died
   * mid-run leaves a buffer and an output counter behind, and nothing else
   * would ever remove them.
   *
   * @returns number of executions whose state was released
   */
  public sweepAbandonedState(): number {
    const cutoff = Date.now() - ABANDONED_STATE_TTL_MS;
    let released = 0;

    for (const [executionId, buffer] of [...this.buffers]) {
      if (this.subscribers.has(executionId)) continue;
      if (buffer.lastActivityAt > cutoff) continue;
      this.releaseExecutionState(executionId);
      released += 1;
    }

    // Tracking without a buffer is possible: an execution can hit the output
    // limit before anything is buffered.
    for (const executionId of [...this.executionTracking.keys()]) {
      if (this.subscribers.has(executionId) || this.buffers.has(executionId)) continue;
      this.executionTracking.delete(executionId);
      released += 1;
    }

    if (released > 0) {
      this.logger.debug(`Released output state for ${String(released)} abandoned executions`, {
        component: "StreamingExecutionManager",
        operation: "sweepAbandonedState",
        metadata: { released },
      });
    }

    return released;
  }

  /**
   * Stop heartbeat mechanism
   */
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Subscribe to streaming events for an execution
   *
   * @param executionId - Unique execution identifier
   * @param response - Express response object for SSE
   * @returns true if subscribed, false if connection limit exceeded
   */
  public subscribe(executionId: string, response: Response): boolean {
    // Enforce per-IP SSE connection limit to prevent resource exhaustion
    const clientIp = response.req.ip ?? response.req.socket.remoteAddress ?? 'unknown';
    const currentCount = this.connectionCountByIp.get(clientIp) ?? 0;
    if (currentCount >= this.maxConnectionsPerIp) {
      this.logger.warn(`SSE connection limit exceeded for IP ${clientIp}`, {
        component: "StreamingExecutionManager",
        operation: "subscribe",
        metadata: { clientIp, currentCount, maxConnectionsPerIp: this.maxConnectionsPerIp },
      });
      return false;
    }
    this.connectionCountByIp.set(clientIp, currentCount + 1);

    // Set up SSE headers
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Create subscriber
    const subscriber: Subscriber = {
      response,
      connectedAt: new Date().toISOString(),
    };

    if (response.req.revalidateAuth) {
      subscriber.authorization = new SessionAuthorization(response.req.revalidateAuth, () => {
        response.end();
        this.unsubscribe(executionId, response);
      });
    }

    // Add to subscribers map
    if (!this.subscribers.has(executionId)) {
      this.subscribers.set(executionId, new Set());
    }
    const executionSubscribers = this.subscribers.get(executionId);
    if (executionSubscribers) {
      executionSubscribers.add(subscriber);
      this.logger.debug(`New subscriber for execution ${executionId}`, {
        component: "StreamingExecutionManager",
        operation: "subscribe",
        metadata: {
          executionId,
          totalSubscribers: executionSubscribers.size,
        },
      });
    }

    // Handle client disconnect
    response.on("close", () => {
      this.unsubscribe(executionId, response);
    });

    // Send initial connection event
    this.emitToSubscriber(subscriber, {
      type: "start",
      executionId,
      timestamp: new Date().toISOString(),
      data: { message: "Connected to execution stream" },
    });

    return true;
  }

  /**
   * Unsubscribe from streaming events
   *
   * @param executionId - Unique execution identifier
   * @param response - Express response object to remove
   */
  public unsubscribe(executionId: string, response: Response): void {
    const subscribers = this.subscribers.get(executionId);
    if (!subscribers) {
      return;
    }

    if (![...subscribers].some(subscriber => subscriber.response === response)) return;

    this.releaseConnectionSlot(response);

    // Find and remove subscriber
    for (const subscriber of subscribers) {
      if (subscriber.response === response) {
        subscriber.authorization?.close();
        subscribers.delete(subscriber);
        this.logger.debug(`Subscriber disconnected from execution ${executionId}`, {
          component: "StreamingExecutionManager",
          operation: "unsubscribe",
          metadata: {
            executionId,
            remainingSubscribers: subscribers.size,
          },
        });
        break;
      }
    }

    // Clean up empty subscriber sets
    if (subscribers.size === 0) {
      this.subscribers.delete(executionId);
      this.logger.debug(`No more subscribers for execution ${executionId}, cleaning up`, {
        component: "StreamingExecutionManager",
        operation: "unsubscribe",
        metadata: { executionId },
      });
    }
  }

  /**
   * Emit an event to all subscribers of an execution
   *
   * @param executionId - Unique execution identifier
   * @param event - Event to emit
   */
  public emit(
    executionId: string,
    event: Omit<StreamingEvent, "executionId" | "timestamp">,
  ): void {
    const subscribers = this.subscribers.get(executionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const fullEvent: StreamingEvent = {
      ...event,
      executionId,
      timestamp: new Date().toISOString(),
    };

    const deadSubscribers: Subscriber[] = [];

    for (const subscriber of subscribers) {
      try {
        this.emitToSubscriber(subscriber, fullEvent);
      } catch (error) {
        this.logger.error(`Failed to emit event to subscriber for execution ${executionId}`, {
          component: "StreamingExecutionManager",
          operation: "emit",
          metadata: { executionId },
        }, error instanceof Error ? error : undefined);
        deadSubscribers.push(subscriber);
      }
    }

    // Remove dead subscribers
    for (const deadSubscriber of deadSubscribers) {
      deadSubscriber.authorization?.close();
      subscribers.delete(deadSubscriber);
    }
  }

  /**
   * Emit an event to a specific subscriber
   *
   * @param subscriber - Subscriber to emit to
   * @param event - Event to emit
   */
  private emitToSubscriber(
    subscriber: Subscriber,
    event: StreamingEvent,
  ): void {
    const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    if (subscriber.authorization) {
      subscriber.authorization.run(() => { subscriber.response.write(eventData); });
    } else {
      subscriber.response.write(eventData);
    }
  }

  /**
   * Truncate a line if it exceeds the maximum line length
   *
   * @param line - Line to truncate
   * @returns Truncated line with indicator if truncated
   */
  private truncateLine(line: string): string {
    if (line.length <= this.config.maxLineLength) {
      return line;
    }

    const truncated = line.substring(0, this.config.maxLineLength);
    const remaining = line.length - this.config.maxLineLength;
    return `${truncated}... [truncated ${remaining.toString()} characters]`;
  }

  /**
   * Check if adding output would exceed the maximum output size
   *
   * @param executionId - Unique execution identifier
   * @param output - Output to add
   * @returns True if output can be added, false if limit reached
   */
  private canAddOutput(executionId: string, output: string): boolean {
    let tracking = this.executionTracking.get(executionId);

    if (!tracking) {
      tracking = {
        totalOutputSize: 0,
        outputLimitReached: false,
      };
      this.executionTracking.set(executionId, tracking);
    }

    // Output counts as activity even when it is refused, so an execution past
    // its output limit cannot be swept and then start counting from zero.
    this.getBuffer(executionId).lastActivityAt = Date.now();

    if (tracking.outputLimitReached) {
      return false;
    }

    const newSize = tracking.totalOutputSize + output.length;

    if (newSize > this.config.maxOutputSize) {
      tracking.outputLimitReached = true;
      return false;
    }

    tracking.totalOutputSize = newSize;
    return true;
  }

  /**
   * Get or create buffer for an execution
   *
   * @param executionId - Unique execution identifier
   * @returns Buffered output object
   */
  private getBuffer(executionId: string): BufferedOutput {
    let buffer = this.buffers.get(executionId);

    if (!buffer) {
      buffer = {
        stdout: [],
        stderr: [],
        timer: null,
        lastActivityAt: Date.now(),
      };
      this.buffers.set(executionId, buffer);
    }

    return buffer;
  }

  /**
   * Flush buffered output for an execution
   *
   * @param executionId - Unique execution identifier
   * @param type - Output type (stdout or stderr)
   */
  private flushBuffer(executionId: string, type: "stdout" | "stderr"): void {
    const buffer = this.buffers.get(executionId);

    if (!buffer) {
      return;
    }

    const output = type === "stdout" ? buffer.stdout : buffer.stderr;

    if (output.length === 0) {
      return;
    }

    // Join all buffered output and emit as single event
    const combined = output.join("");

    if (combined.length > 0) {
      this.emit(executionId, {
        type,
        data: { output: combined },
      });
    }

    // Clear the buffer
    if (type === "stdout") {
      buffer.stdout = [];
    } else {
      buffer.stderr = [];
    }
  }

  /**
   * Schedule buffer flush for an execution
   *
   * @param executionId - Unique execution identifier
   */
  private scheduleFlush(executionId: string): void {
    const buffer = this.getBuffer(executionId);
    buffer.lastActivityAt = Date.now();

    // A pending flush is left alone rather than restarted. Restarting it on
    // every chunk meant continuously arriving output waited for a quiet
    // interval that never came, so latency was unbounded instead of bufferMs.
    if (buffer.timer) {
      return;
    }

    buffer.timer = setTimeout(() => {
      buffer.timer = null;
      this.flushBuffer(executionId, "stdout");
      this.flushBuffer(executionId, "stderr");
    }, this.config.bufferMs);
  }

  /** Cancel a pending flush, so a terminal path leaves nothing scheduled. */
  private clearFlushTimer(executionId: string): void {
    const buffer = this.buffers.get(executionId);
    if (buffer?.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }
  }

  /**
   * Release the output state for an execution.
   *
   * Unconditional by design: it must not depend on a subscriber set still
   * existing, because the client usually disconnects before the delayed
   * teardown runs (finding I07).
   */
  private releaseExecutionState(executionId: string): void {
    this.clearFlushTimer(executionId);
    this.buffers.delete(executionId);
    this.executionTracking.delete(executionId);
  }

  /**
   * Release the per-IP connection slot a subscriber holds.
   *
   * Counted on subscribe, so it has to be released on every path that ends a
   * response. Releasing it only through `unsubscribe` leaked a slot for each
   * stream the server closed itself, and ten of those locked a client out.
   */
  private releaseConnectionSlot(response: Response): void {
    const clientIp = response.req.ip ?? response.req.socket.remoteAddress ?? 'unknown';
    const currentCount = this.connectionCountByIp.get(clientIp) ?? 0;
    if (currentCount > 1) {
      this.connectionCountByIp.set(clientIp, currentCount - 1);
    } else {
      this.connectionCountByIp.delete(clientIp);
    }
  }

  /**
   * Emit stdout output with buffering and truncation
   *
   * @param executionId - Unique execution identifier
   * @param output - Stdout output chunk
   */
  public emitStdout(executionId: string, output: string): void {
    // Check output size limit
    if (!this.canAddOutput(executionId, output)) {
      const tracking = this.executionTracking.get(executionId);
      if (tracking && !tracking.outputLimitReached) {
        // This shouldn't happen, but just in case
        tracking.outputLimitReached = true;
      }

      // Emit warning message once
      const buffer = this.getBuffer(executionId);
      if (buffer.stdout.length === 0 && buffer.stderr.length === 0) {
        this.emit(executionId, {
          type: "stdout",
          data: {
            output: `\n[Output limit of ${this.config.maxOutputSize.toString()} bytes reached. Further output will be truncated.]\n`,
          },
        });
      }
      return;
    }

    // Truncate long lines
    const truncated = this.truncateLine(output);

    // Add to buffer
    const buffer = this.getBuffer(executionId);
    buffer.stdout.push(truncated);

    // Schedule flush
    this.scheduleFlush(executionId);
  }

  /**
   * Emit stderr output with buffering and truncation
   *
   * @param executionId - Unique execution identifier
   * @param output - Stderr output chunk
   */
  public emitStderr(executionId: string, output: string): void {
    // Check output size limit
    if (!this.canAddOutput(executionId, output)) {
      const tracking = this.executionTracking.get(executionId);
      if (tracking && !tracking.outputLimitReached) {
        // This shouldn't happen, but just in case
        tracking.outputLimitReached = true;
      }

      // Emit warning message once
      const buffer = this.getBuffer(executionId);
      if (buffer.stdout.length === 0 && buffer.stderr.length === 0) {
        this.emit(executionId, {
          type: "stderr",
          data: {
            output: `\n[Output limit of ${this.config.maxOutputSize.toString()} bytes reached. Further output will be truncated.]\n`,
          },
        });
      }
      return;
    }

    // Truncate long lines
    const truncated = this.truncateLine(output);

    // Add to buffer
    const buffer = this.getBuffer(executionId);
    buffer.stderr.push(truncated);

    // Schedule flush
    this.scheduleFlush(executionId);
  }

  /**
   * Emit status update
   *
   * @param executionId - Unique execution identifier
   * @param status - Execution status
   */
  public emitStatus(executionId: string, status: string): void {
    this.emit(executionId, {
      type: "status",
      data: { status },
    });
  }

  /**
   * Emit command being executed
   *
   * @param executionId - Unique execution identifier
   * @param command - Bolt command string
   */
  public emitCommand(executionId: string, command: string): void {
    this.emit(executionId, {
      type: "command",
      data: { command },
    });
  }

  /**
   * Emit completion event.
   *
   * The payload carries the run's own terminal status, which the client
   * displays. Do not synthesise one here: "the stream ended" and "the run
   * succeeded" are different facts.
   *
   * @param executionId - Unique execution identifier
   * @param result - Execution result data, including its terminal status
   */
  public emitComplete(executionId: string, result: ExecutionCompletion): void {
    // Flush any remaining buffered output
    this.flushBuffer(executionId, "stdout");
    this.flushBuffer(executionId, "stderr");
    this.clearFlushTimer(executionId);

    this.emit(executionId, {
      type: "complete",
      data: result,
    });

    // Close all connections for this execution after a short delay
    setTimeout(() => {
      this.closeAllConnections(executionId);
    }, 1000);
  }

  /**
   * Emit error event
   *
   * @param executionId - Unique execution identifier
   * @param error - Error message or object
   */
  public emitError(executionId: string, error: unknown): void {
    // Flush any remaining buffered output
    this.flushBuffer(executionId, "stdout");
    this.flushBuffer(executionId, "stderr");
    this.clearFlushTimer(executionId);

    this.emit(executionId, {
      type: "error",
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Close all connections for this execution after a short delay
    setTimeout(() => {
      this.closeAllConnections(executionId);
    }, 1000);
  }

  /**
   * Close all connections for an execution
   *
   * @param executionId - Unique execution identifier
   */
  private closeAllConnections(executionId: string): void {
    // No early return on a missing subscriber set: the client normally
    // disconnects before this runs, and the output state still has to go.
    const subscribers = this.subscribers.get(executionId) ?? new Set<Subscriber>();
    // Deregistered before the responses end, so the 'close' handler cannot
    // release the same connection slot a second time.
    this.subscribers.delete(executionId);

    for (const subscriber of subscribers) {
      try {
        subscriber.authorization?.close();
        this.releaseConnectionSlot(subscriber.response);
        subscriber.response.end();
      } catch (error) {
        this.logger.error(`Failed to close connection for execution ${executionId}`, {
          component: "StreamingExecutionManager",
          operation: "closeAllConnections",
          metadata: { executionId },
        }, error instanceof Error ? error : undefined);
      }
    }

    this.releaseExecutionState(executionId);

    this.logger.debug(`Closed all connections for execution ${executionId}`, {
      component: "StreamingExecutionManager",
      operation: "closeAllConnections",
      metadata: { executionId },
    });
  }

  /**
   * Get number of active subscribers for an execution
   *
   * @param executionId - Unique execution identifier
   * @returns Number of active subscribers
   */
  public getSubscriberCount(executionId: string): number {
    return this.subscribers.get(executionId)?.size ?? 0;
  }

  /**
   * Get total number of active executions being streamed
   *
   * @returns Number of active executions
   */
  public getActiveExecutionCount(): number {
    return this.subscribers.size;
  }

  /**
   * Connections currently counted against the per-IP limit.
   *
   * Reported so a leaked slot is observable: it should return to zero once
   * every stream has ended, however it ended.
   */
  public getTrackedConnectionCount(): number {
    let total = 0;
    for (const count of this.connectionCountByIp.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Number of executions still holding output state (buffers or output
   * counters), whether or not anyone is subscribed.
   *
   * Reported so the leak this replaced is observable rather than inferred: it
   * should fall back to zero as executions finish.
   */
  public getRetainedStateCount(): number {
    return new Set([...this.buffers.keys(), ...this.executionTracking.keys()]).size;
  }

  /**
   * Clean up all connections and stop heartbeat
   */
  public cleanup(): void {
    this.stopHeartbeat();

    for (const [executionId] of this.subscribers.entries()) {
      this.closeAllConnections(executionId);
    }

    this.subscribers.clear();
    this.buffers.clear();
    this.executionTracking.clear();
  }
}
