import type { Response } from "express";

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
 * Service for managing streaming execution output via Server-Sent Events (SSE)
 *
 * This service maintains a registry of active streaming connections and provides
 * methods to emit events to all subscribers of a specific execution.
 */
export class StreamingExecutionManager {
  private subscribers: Map<string, Set<Subscriber>>;
  private heartbeatInterval: NodeJS.Timeout | null;
  private readonly heartbeatIntervalMs = 30000; // 30 seconds

  constructor() {
    this.subscribers = new Map();
    this.heartbeatInterval = null;
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
            console.error(
              `Failed to send heartbeat to subscriber for execution ${executionId}:`,
              error,
            );
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
      console.error(
        `New subscriber for execution ${executionId}. Total subscribers: ${String(executionSubscribers.size)}`,
      );
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
        console.error(
          `Subscriber disconnected from execution ${executionId}. Remaining subscribers: ${String(subscribers.size)}`,
        );
        break;
      }
    }

    // Clean up empty subscriber sets
    if (subscribers.size === 0) {
      this.subscribers.delete(executionId);
      console.error(
        `No more subscribers for execution ${executionId}, cleaning up`,
      );
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
        console.error(
          `Failed to emit event to subscriber for execution ${executionId}:`,
          error,
        );
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
   * Emit stdout output
   *
   * @param executionId - Unique execution identifier
   * @param output - Stdout output chunk
   */
  public emitStdout(executionId: string, output: string): void {
    this.emit(executionId, {
      type: "stdout",
      data: { output },
    });
  }

  /**
   * Emit stderr output
   *
   * @param executionId - Unique execution identifier
   * @param output - Stderr output chunk
   */
  public emitStderr(executionId: string, output: string): void {
    this.emit(executionId, {
      type: "stderr",
      data: { output },
    });
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
        console.error(
          `Failed to close connection for execution ${executionId}:`,
          error,
        );
      }
    }

    this.subscribers.delete(executionId);
    console.error(`Closed all connections for execution ${executionId}`);
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
  }
}
