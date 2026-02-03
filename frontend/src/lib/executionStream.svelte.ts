/**
 * SSE (Server-Sent Events) client utility for streaming execution output
 *
 * This utility provides a Svelte 5 reactive interface for subscribing to
 * real-time execution output streams from the backend.
 */

import { debugMode } from "./debug";

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
 * Connection status
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Execution stream state
 */
export interface ExecutionStreamState {
  status: ConnectionStatus;
  command: string | null;
  stdout: string;
  stderr: string;
  executionStatus: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  events: StreamingEvent[];
}

/**
 * Options for execution stream
 */
export interface ExecutionStreamOptions {
  /**
   * Maximum number of reconnection attempts
   * @default 3
   */
  maxReconnectAttempts?: number;

  /**
   * Delay between reconnection attempts in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Whether to automatically reconnect on connection loss
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Callback when connection status changes
   */
  onStatusChange?: (status: ConnectionStatus) => void;

  /**
   * Callback when an event is received
   */
  onEvent?: (event: StreamingEvent) => void;

  /**
   * Callback when execution completes
   */
  onComplete?: (result: Record<string, unknown>) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: string) => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<
    ExecutionStreamOptions,
    "onStatusChange" | "onEvent" | "onComplete" | "onError"
  >
> = {
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  autoReconnect: true,
};

/**
 * Create an execution stream for real-time output
 *
 * @param executionId - Unique execution identifier
 * @param options - Stream configuration options
 * @returns Reactive stream state and control methods
 */
export function useExecutionStream(
  executionId: string,
  options: ExecutionStreamOptions = {},
): ExecutionStream {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Reactive state
  const state = $state<ExecutionStreamState>({
    status: "disconnected",
    command: null,
    stdout: "",
    stderr: "",
    executionStatus: null,
    result: null,
    error: null,
    events: [],
  });

  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isManualDisconnect = false;

  /**
   * Update connection status
   */
  function setStatus(status: ConnectionStatus): void {
    state.status = status;
    options.onStatusChange?.(status);
  }

  /**
   * Build SSE URL with expert mode parameter
   */
  function buildStreamUrl(): string {
    const baseUrl = `/api/executions/${executionId}/stream`;
    const params = new URLSearchParams();

    if (debugMode.enabled) {
      params.set("expertMode", "true");
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  /**
   * Handle incoming SSE event
   */
  function handleEvent(event: StreamingEvent): void {
    // Add to events array
    state.events.push(event);

    // Call event callback
    options.onEvent?.(event);

    // Update state based on event type
    switch (event.type) {
      case "start":
        setStatus("connected");
        reconnectAttempts = 0; // Reset reconnect counter on successful connection
        break;

      case "command":
        if (
          event.data &&
          typeof event.data === "object" &&
          "command" in event.data
        ) {
          state.command = String(event.data.command);
        }
        break;

      case "stdout":
        if (
          event.data &&
          typeof event.data === "object" &&
          "output" in event.data
        ) {
          state.stdout += String(event.data.output);
        }
        break;

      case "stderr":
        if (
          event.data &&
          typeof event.data === "object" &&
          "output" in event.data
        ) {
          state.stderr += String(event.data.output);
        }
        break;

      case "status":
        if (
          event.data &&
          typeof event.data === "object" &&
          "status" in event.data
        ) {
          state.executionStatus = String(event.data.status);
        }
        break;

      case "complete":
        state.result = event.data
          ? (event.data as Record<string, unknown>)
          : null;
        state.executionStatus = "success";
        setStatus("disconnected");
        if (event.data) {
          options.onComplete?.(event.data as Record<string, unknown>);
        }
        disconnect(); // Clean disconnect on completion
        break;

      case "error":
        if (
          event.data &&
          typeof event.data === "object" &&
          "error" in event.data
        ) {
          state.error = String(event.data.error);
          state.executionStatus = "failed";
        }
        setStatus("error");
        options.onError?.(state.error ?? "Unknown error");
        disconnect(); // Clean disconnect on error
        break;
    }
  }

  /**
   * Connect to SSE stream
   */
  function connect(): void {
    // Prevent multiple connections
    if (eventSource) {
      return;
    }

    isManualDisconnect = false;
    setStatus("connecting");

    try {
      const url = buildStreamUrl();
      eventSource = new EventSource(url);

      // Handle different event types
      const eventTypes: StreamingEventType[] = [
        "start",
        "stdout",
        "stderr",
        "status",
        "complete",
        "error",
        "command",
      ];

      for (const eventType of eventTypes) {
        eventSource.addEventListener(eventType, (e: MessageEvent): void => {
          try {
            const event = JSON.parse(e.data as string) as StreamingEvent;
            handleEvent(event);
          } catch (error) {
            console.error(`Failed to parse ${eventType} event:`, error);
          }
        });
      }

      // Handle connection open
      eventSource.addEventListener("open", (): void => {
        // Connection opened successfully
      });

      // Handle connection errors
      eventSource.addEventListener("error", (): void => {
        // Close the current connection
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        // Attempt reconnection if not manually disconnected
        if (
          !isManualDisconnect &&
          opts.autoReconnect &&
          reconnectAttempts < opts.maxReconnectAttempts
        ) {
          setStatus("reconnecting");
          reconnectAttempts++;

          const delay = opts.reconnectDelay * reconnectAttempts; // Exponential backoff

          reconnectTimeout = setTimeout((): void => {
            connect();
          }, delay);
        } else {
          setStatus("error");
          state.error =
            "Connection lost and maximum reconnection attempts reached";
        }
      });
    } catch (error) {
      console.error(
        `Failed to create SSE connection for execution ${executionId}:`,
        error,
      );
      setStatus("error");
      state.error =
        error instanceof Error ? error.message : "Failed to connect";
    }
  }

  /**
   * Disconnect from SSE stream
   */
  function disconnect(): void {
    isManualDisconnect = true;

    // Clear reconnection timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Close EventSource connection
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    setStatus("disconnected");
  }

  /**
   * Reconnect to SSE stream
   */
  function reconnect(): void {
    disconnect();
    reconnectAttempts = 0;
    connect();
  }

  /**
   * Clear accumulated output
   */
  function clearOutput(): void {
    state.stdout = "";
    state.stderr = "";
    state.events = [];
  }

  /**
   * Reset state to initial values
   */
  function reset(): void {
    state.command = null;
    state.stdout = "";
    state.stderr = "";
    state.executionStatus = null;
    state.result = null;
    state.error = null;
    state.events = [];
  }

  // Return reactive state and control methods
  return {
    // Reactive state (can be accessed directly in Svelte components)
    get status(): ConnectionStatus {
      return state.status;
    },
    get command(): string | null {
      return state.command;
    },
    get stdout(): string {
      return state.stdout;
    },
    get stderr(): string {
      return state.stderr;
    },
    get executionStatus(): string | null {
      return state.executionStatus;
    },
    get result(): Record<string, unknown> | null {
      return state.result;
    },
    get error(): string | null {
      return state.error;
    },
    get events(): StreamingEvent[] {
      return state.events;
    },
    get isConnected(): boolean {
      return state.status === "connected";
    },
    get isConnecting(): boolean {
      return state.status === "connecting" || state.status === "reconnecting";
    },
    get hasError(): boolean {
      return state.status === "error" || state.error !== null;
    },

    // Control methods
    connect,
    disconnect,
    reconnect,
    clearOutput,
    reset,
  };
}

/**
 * Type for the return value of useExecutionStream
 */
export interface ExecutionStream {
  // Reactive state
  readonly status: ConnectionStatus;
  readonly command: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly executionStatus: string | null;
  readonly result: Record<string, unknown> | null;
  readonly error: string | null;
  readonly events: StreamingEvent[];
  readonly isConnected: boolean;
  readonly isConnecting: boolean;
  readonly hasError: boolean;

  // Control methods
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  clearOutput: () => void;
  reset: () => void;
}
