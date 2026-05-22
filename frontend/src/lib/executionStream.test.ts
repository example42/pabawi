/**
 * Tests for executionStream SSE client module.
 *
 * Validates that the SSEClient handles all event types with typed interfaces
 * and reflects SSE-first behaviour (no polling, single-fetch fallback only).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the auth manager — tests need a valid auth header so obtainStreamTicket
// can POST to /stream-ticket (C4 — no more ?token= in URL).
vi.mock("./auth.svelte", () => ({
  authManager: {
    getAuthHeader: () => "Bearer fake-jwt",
  },
}));
import type {
  StreamingEvent,
  StreamingEventType,
  StartEventData,
  StdoutEventData,
  StderrEventData,
  StatusEventData,
  CompleteEventData,
  ErrorEventData,
  CommandEventData,
} from "./executionStream.svelte";

/**
 * Mock EventSource that captures addEventListener calls and allows
 * dispatching events programmatically.
 */
class MockEventSource {
  url: string;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
  }

  close(): void {
    // no-op
  }

  /** Test helper: dispatch a named event */
  dispatch(type: string, data: string): void {
    const handlers = this.listeners.get(type) ?? [];
    const event = new MessageEvent(type, { data });
    for (const handler of handlers) {
      handler(event);
    }
  }

  /** Test helper: get registered event type names */
  getRegisteredTypes(): string[] {
    return [...this.listeners.keys()];
  }
}

let lastMockEventSource: MockEventSource | null = null;

describe("executionStream typed event interfaces", () => {
  it("defines all 7 streaming event types", async () => {
    // The StreamingEventType union should accept all 7 values
    const allTypes: StreamingEventType[] = [
      "start",
      "stdout",
      "stderr",
      "status",
      "complete",
      "error",
      "command",
    ];
    expect(allTypes).toHaveLength(7);
  });

  it("StartEventData has executionId field", () => {
    const event: StartEventData = { executionId: "exec-123", startedAt: "2024-01-01T00:00:00Z" };
    expect(event.executionId).toBe("exec-123");
    expect(event.startedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("StdoutEventData has output field", () => {
    const event: StdoutEventData = { output: "hello world\n" };
    expect(event.output).toBe("hello world\n");
  });

  it("StderrEventData has output field", () => {
    const event: StderrEventData = { output: "error: something failed\n" };
    expect(event.output).toBe("error: something failed\n");
  });

  it("StatusEventData has status field", () => {
    const event: StatusEventData = { status: "running" };
    expect(event.status).toBe("running");
  });

  it("CompleteEventData has status and optional results", () => {
    const event: CompleteEventData = {
      status: "success",
      results: [{ nodeId: "node1", status: "success" }],
      completedAt: "2024-01-01T00:01:00Z",
    };
    expect(event.status).toBe("success");
    expect(event.results).toHaveLength(1);
    expect(event.completedAt).toBeDefined();
  });

  it("ErrorEventData has error and optional code", () => {
    const event: ErrorEventData = { error: "Connection refused", code: "ECONNREFUSED" };
    expect(event.error).toBe("Connection refused");
    expect(event.code).toBe("ECONNREFUSED");
  });

  it("CommandEventData has command field", () => {
    const event: CommandEventData = { command: "bolt task run facts --targets node1" };
    expect(event.command).toBe("bolt task run facts --targets node1");
  });
});

describe("executionStream SSE-first architecture", () => {
  it("does not export pollExecutionResult or any polling utility", async () => {
    const mod = await import("./executionStream.svelte");
    const exports = Object.keys(mod);
    expect(exports).not.toContain("pollExecutionResult");
    expect(exports).not.toContain("poll");
    expect(exports).not.toContain("startPolling");
  });

  it("exports useExecutionStream as the primary execution result transport", async () => {
    const mod = await import("./executionStream.svelte");
    expect(mod.useExecutionStream).toBeDefined();
    expect(typeof mod.useExecutionStream).toBe("function");
  });
});

/**
 * After connect() the EventSource is created asynchronously because the
 * client first fetches a single-use ticket from /stream-ticket (C4 — we no
 * longer accept ?token= in the URL). Helper to wait until the mocked
 * EventSource appears so test assertions can interact with it.
 */
async function waitForEventSource(): Promise<MockEventSource> {
  for (let i = 0; i < 50; i++) {
    if (lastMockEventSource) return lastMockEventSource;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("EventSource was never created");
}

describe("executionStream handleEvent processes all event types", () => {
  beforeEach(() => {
    lastMockEventSource = null;
    vi.stubGlobal("EventSource", class extends MockEventSource {
      constructor(url: string) {
        super(url);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        lastMockEventSource = this;
      }
    });

    // Mock auth header so obtainStreamTicket sends an Authorization
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === "token" ? "fake-jwt" : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    });

    // Mock fetch so /stream-ticket returns a ticket
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: "fake-stream-ticket" }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    lastMockEventSource = null;
  });

  it("registers listeners for all 7 event types on connect", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    expect(lastMockEventSource).not.toBeNull();
    const registeredTypes = lastMockEventSource!.getRegisteredTypes();
    expect(registeredTypes).toContain("start");
    expect(registeredTypes).toContain("stdout");
    expect(registeredTypes).toContain("stderr");
    expect(registeredTypes).toContain("status");
    expect(registeredTypes).toContain("complete");
    expect(registeredTypes).toContain("error");
    expect(registeredTypes).toContain("command");

    stream.disconnect();
  });

  it("handles start event without throwing", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const onEvent = vi.fn();
    const stream = useExecutionStream("test-exec-id", { onEvent });
    stream.connect();
    await waitForEventSource();

    const startEvent: StreamingEvent = {
      type: "start",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { executionId: "test-exec-id", startedAt: new Date().toISOString() },
    };

    expect(() => {
      lastMockEventSource!.dispatch("start", JSON.stringify(startEvent));
    }).not.toThrow();

    expect(onEvent).toHaveBeenCalledWith(startEvent);
    stream.disconnect();
  });

  it("handles stdout event and appends output", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    const stdoutEvent: StreamingEvent = {
      type: "stdout",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { output: "line 1\n" },
    };

    lastMockEventSource!.dispatch("stdout", JSON.stringify(stdoutEvent));
    expect(stream.stdout).toBe("line 1\n");
    stream.disconnect();
  });

  it("handles stderr event and appends output", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    const stderrEvent: StreamingEvent = {
      type: "stderr",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { output: "warning: deprecated\n" },
    };

    lastMockEventSource!.dispatch("stderr", JSON.stringify(stderrEvent));
    expect(stream.stderr).toBe("warning: deprecated\n");
    stream.disconnect();
  });

  it("handles status event and updates executionStatus", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    const statusEvent: StreamingEvent = {
      type: "status",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { status: "running" },
    };

    lastMockEventSource!.dispatch("status", JSON.stringify(statusEvent));
    expect(stream.executionStatus).toBe("running");
    stream.disconnect();
  });

  it("handles complete event and calls onComplete callback", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const onComplete = vi.fn();
    const stream = useExecutionStream("test-exec-id", { onComplete });
    stream.connect();
    await waitForEventSource();

    const completeEvent: StreamingEvent = {
      type: "complete",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { status: "success", results: [{ nodeId: "n1", status: "success" }] },
    };

    lastMockEventSource!.dispatch("complete", JSON.stringify(completeEvent));
    expect(onComplete).toHaveBeenCalledWith(completeEvent.data);
    expect(stream.executionStatus).toBe("success");
  });

  it("handles error event and calls onError callback", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const onError = vi.fn();
    const stream = useExecutionStream("test-exec-id", { onError });
    stream.connect();
    await waitForEventSource();

    const errorEvent: StreamingEvent = {
      type: "error",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { error: "Connection timeout" },
    };

    lastMockEventSource!.dispatch("error", JSON.stringify(errorEvent));
    // The onError callback is invoked with the parsed error message
    expect(onError).toHaveBeenCalledWith("Connection timeout");
    // executionStatus is set to "failed" by the named error handler
    expect(stream.executionStatus).toBe("failed");
    // stream.error may be overwritten by the connection error handler
    // (in real browsers, named SSE events and native error events are distinct;
    // in our mock they share the same listener name)
    expect(stream.error).toBeDefined();
  });

  it("handles command event and updates command state", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    const commandEvent: StreamingEvent = {
      type: "command",
      executionId: "test-exec-id",
      timestamp: new Date().toISOString(),
      data: { command: "bolt task run facts --targets node1" },
    };

    lastMockEventSource!.dispatch("command", JSON.stringify(commandEvent));
    expect(stream.command).toBe("bolt task run facts --targets node1");
    stream.disconnect();
  });

  it("does not throw on malformed event data", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    // Simulate malformed JSON — the handler should catch and not throw
    expect(() => {
      lastMockEventSource!.dispatch("stdout", "not valid json{{{");
    }).not.toThrow();

    stream.disconnect();
  });

  it("accumulates multiple stdout events", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");
    const stream = useExecutionStream("test-exec-id");
    stream.connect();
    await waitForEventSource();

    const lines = ["line 1\n", "line 2\n", "line 3\n"];
    for (const line of lines) {
      const event: StreamingEvent = {
        type: "stdout",
        executionId: "test-exec-id",
        timestamp: new Date().toISOString(),
        data: { output: line },
      };
      lastMockEventSource!.dispatch("stdout", JSON.stringify(event));
    }

    expect(stream.stdout).toBe("line 1\nline 2\nline 3\n");
    stream.disconnect();
  });
});
