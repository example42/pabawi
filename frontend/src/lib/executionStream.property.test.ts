/**
 * Property-based tests for SSE execution stream event handling
 * Feature: code-review-fixes
 * Task 11.3: Property test for SSE event handling
 *
 * Property 8: SSE client handles all event types without error
 * **Validates: Requirements 9.4**
 *
 * Uses fast-check to generate arbitrary valid StreamingEvent objects
 * and verifies that processing them does not throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import type {
  StreamingEvent,
  StreamingEventType,
  StreamingEventData,
  StartEventData,
  StdoutEventData,
  StderrEventData,
  StatusEventData,
  CompleteEventData,
  ErrorEventData,
  CommandEventData,
} from "./executionStream.svelte";

// --- Mock EventSource ---

type EventSourceListener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0; // CONNECTING
  private listeners: Map<string, EventSourceListener[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.dispatchEvent("open", new MessageEvent("open"));
    }, 0);
  }

  addEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: EventSourceListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      existing.filter((l) => l !== listener),
    );
  }

  dispatchEvent(type: string, event: MessageEvent): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }

  close(): void {
    this.readyState = 2; // CLOSED
  }
}

// Mock dependencies that executionStream.svelte.ts imports
vi.mock("./expertMode.svelte", () => ({
  expertMode: { enabled: false },
}));

vi.mock("./auth.svelte", () => ({
  authManager: {
    getAuthHeader: (): string => "Bearer test-token",
  },
}));

// --- Arbitraries ---

const ALL_EVENT_TYPES: StreamingEventType[] = [
  "start",
  "stdout",
  "stderr",
  "status",
  "complete",
  "error",
  "command",
];

const streamingEventTypeArb: fc.Arbitrary<StreamingEventType> =
  fc.constantFrom(...ALL_EVENT_TYPES);

const executionIdArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9-]+$/)
  .filter((s) => s.length > 0 && s.length <= 50);

const timestampArb: fc.Arbitrary<string> = fc
  .integer({ min: 1577836800000, max: 1924991999000 }) // 2020-01-01 to 2030-12-31 in ms
  .map((ms) => new Date(ms).toISOString());

function startEventDataArb(): fc.Arbitrary<StartEventData> {
  return fc.record({
    executionId: executionIdArb,
    startedAt: fc.option(timestampArb).map((v) => v ?? undefined),
  });
}

function stdoutEventDataArb(): fc.Arbitrary<StdoutEventData> {
  return fc.record({
    output: fc.string({ minLength: 0, maxLength: 500 }),
  });
}

function stderrEventDataArb(): fc.Arbitrary<StderrEventData> {
  return fc.record({
    output: fc.string({ minLength: 0, maxLength: 500 }),
  });
}

function statusEventDataArb(): fc.Arbitrary<StatusEventData> {
  return fc.record({
    status: fc.constantFrom("running", "pending", "success", "failed"),
  });
}

function completeEventDataArb(): fc.Arbitrary<CompleteEventData> {
  return fc.record({
    status: fc.constantFrom("success", "failed"),
    results: fc.option(fc.array(fc.anything(), { maxLength: 3 })).map((v) => v ?? undefined),
    completedAt: fc.option(timestampArb).map((v) => v ?? undefined),
  });
}

function errorEventDataArb(): fc.Arbitrary<ErrorEventData> {
  return fc.record({
    error: fc.string({ minLength: 1, maxLength: 200 }),
    code: fc.option(fc.string({ minLength: 1, maxLength: 20 })).map((v) => v ?? undefined),
  });
}

function commandEventDataArb(): fc.Arbitrary<CommandEventData> {
  return fc.record({
    command: fc.string({ minLength: 1, maxLength: 200 }),
  });
}

/**
 * Generate event data matching the given event type
 */
function eventDataForType(
  eventType: StreamingEventType,
): fc.Arbitrary<StreamingEventData | undefined> {
  switch (eventType) {
    case "start":
      return startEventDataArb();
    case "stdout":
      return stdoutEventDataArb();
    case "stderr":
      return stderrEventDataArb();
    case "status":
      return statusEventDataArb();
    case "complete":
      return completeEventDataArb();
    case "error":
      return errorEventDataArb();
    case "command":
      return commandEventDataArb();
  }
}

/**
 * Generate a valid StreamingEvent with type-appropriate data
 */
function streamingEventArb(): fc.Arbitrary<StreamingEvent> {
  return streamingEventTypeArb.chain((eventType) =>
    fc.record({
      type: fc.constant(eventType),
      executionId: executionIdArb,
      timestamp: timestampArb,
      data: fc.option(eventDataForType(eventType)).map((v) => v ?? undefined),
    }),
  );
}

describe("Feature: code-review-fixes, Property 8: SSE client handles all event types without error", () => {
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    originalEventSource = globalThis.EventSource;
    // Install mock EventSource
    (globalThis as Record<string, unknown>).EventSource =
      MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  it("Property 8: handleEvent processes any valid StreamingEvent without throwing", async () => {
    // Dynamic import after mocks are set up
    const { useExecutionStream } = await import("./executionStream.svelte");

    await fc.assert(
      fc.asyncProperty(streamingEventArb(), async (event) => {
        const errors: string[] = [];
        const stream = useExecutionStream("test-exec-id", {
          onError: (err) => errors.push(err),
        });

        stream.connect();

        // Wait for EventSource to be created
        await new Promise((resolve) => setTimeout(resolve, 5));

        const mockES = MockEventSource.instances[MockEventSource.instances.length - 1];
        expect(mockES).toBeDefined();

        // Dispatch the event through the mock EventSource
        const messageEvent = new MessageEvent(event.type, {
          data: JSON.stringify(event),
        });

        // This should not throw
        expect(() => {
          mockES.dispatchEvent(event.type, messageEvent);
        }).not.toThrow();

        // Verify the event was recorded
        expect(stream.events.length).toBeGreaterThanOrEqual(1);

        // Clean up
        stream.disconnect();
      }),
      { numRuns: 100 },
    );
  });

  it("Property 8: all 7 event types are handled without throwing (exhaustive)", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_EVENT_TYPES),
        async (eventType) => {
          // Generate type-appropriate data inline
          const event: StreamingEvent = {
            type: eventType,
            executionId: "test-exec-123",
            timestamp: new Date().toISOString(),
            data:
              eventType === "start"
                ? { executionId: "test-exec-123" }
                : eventType === "stdout"
                  ? { output: "hello" }
                  : eventType === "stderr"
                    ? { output: "warning" }
                    : eventType === "status"
                      ? { status: "running" }
                      : eventType === "complete"
                        ? { status: "success" }
                        : eventType === "error"
                          ? { error: "something failed" }
                          : { command: "puppet agent -t" },
          };

          const stream = useExecutionStream("test-exec-exhaustive", {});
          stream.connect();

          await new Promise((resolve) => setTimeout(resolve, 5));

          const mockES =
            MockEventSource.instances[MockEventSource.instances.length - 1];
          expect(mockES).toBeDefined();

          const messageEvent = new MessageEvent(event.type, {
            data: JSON.stringify(event),
          });

          expect(() => {
            mockES.dispatchEvent(event.type, messageEvent);
          }).not.toThrow();

          stream.disconnect();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("Property 8: events with missing data field do not throw", async () => {
    const { useExecutionStream } = await import("./executionStream.svelte");

    await fc.assert(
      fc.asyncProperty(streamingEventTypeArb, async (eventType) => {
        const event: StreamingEvent = {
          type: eventType,
          executionId: "test-no-data",
          timestamp: new Date().toISOString(),
          data: undefined,
        };

        const stream = useExecutionStream("test-no-data-exec", {});
        stream.connect();

        await new Promise((resolve) => setTimeout(resolve, 5));

        const mockES =
          MockEventSource.instances[MockEventSource.instances.length - 1];
        expect(mockES).toBeDefined();

        const messageEvent = new MessageEvent(event.type, {
          data: JSON.stringify(event),
        });

        expect(() => {
          mockES.dispatchEvent(event.type, messageEvent);
        }).not.toThrow();

        stream.disconnect();
      }),
      { numRuns: 50 },
    );
  });
});
