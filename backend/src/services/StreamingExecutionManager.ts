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

/**
 * Subscriber connection information
 */
interface Subscriber {
  response: Response;
  connectedAt: string;
}

/**
 * Buffered output for an execution
 */
interface BufferedOutput {
  stdout: string[];
  stderr: string[];
  timer: NodeJS.Timeout | null;
}

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

  constructor(config: StreamingConfig) {
    this.subscribers = new Map();
    this.heartbeatInterval = null;
    this.buffers = new Map();
    this.executionTracking = new Map();
    this.config = config;
    this.logger = new LoggerService();
    this.startHeartbeat();
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
    }, this.heartbeatIntervalMs);
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
   */
  public subscribe(executionId: string, response: Response): void {
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

    // Find and remove subscriber
    for (const subscriber of subscribers) {
      if (subscriber.response === response) {
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
    subscriber.response.write(eventData);
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

    // Clear existing timer if any
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    // Schedule new flush
    buffer.timer = setTimeout(() => {
      this.flushBuffer(executionId, "stdout");
      this.flushBuffer(executionId, "stderr");
      buffer.timer = null;
    }, this.config.bufferMs);
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
   * Emit completion event
   *
   * @param executionId - Unique execution identifier
   * @param result - Execution result data
   */
  public emitComplete(executionId: string, result: unknown): void {
    // Flush any remaining buffered output
    this.flushBuffer(executionId, "stdout");
    this.flushBuffer(executionId, "stderr");

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
    const subscribers = this.subscribers.get(executionId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      try {
        subscriber.response.end();
      } catch (error) {
        this.logger.error(`Failed to close connection for execution ${executionId}`, {
          component: "StreamingExecutionManager",
          operation: "closeAllConnections",
          metadata: { executionId },
        }, error instanceof Error ? error : undefined);
      }
    }

    this.subscribers.delete(executionId);

    // Clean up buffers and tracking
    const buffer = this.buffers.get(executionId);
    if (buffer?.timer) {
      clearTimeout(buffer.timer);
    }
    this.buffers.delete(executionId);
    this.executionTracking.delete(executionId);

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
