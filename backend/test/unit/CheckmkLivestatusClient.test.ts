/**
 * Unit tests for CheckmkLivestatusClient
 *
 * Validates: Requirements 8.1, 13.3, 13.4, 13.6, 13.8
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:net", () => ({
  createConnection: vi.fn(),
}));

vi.mock("node:tls", () => ({
  connect: vi.fn(),
}));

import * as net from "node:net";
import * as tls from "node:tls";
import { CheckmkLivestatusClient } from "../../src/integrations/checkmk/CheckmkLivestatusClient";
import type { CheckmkLivestatusConfig } from "../../src/integrations/checkmk/types";
import type { LoggerService } from "../../src/services/LoggerService";

const mockNetCreateConnection = net.createConnection as unknown as Mock;
const mockTlsConnect = tls.connect as unknown as Mock;

/**
 * Creates a mock socket (EventEmitter) that simulates net.Socket behavior.
 * The `write` callback captures the query sent to the socket.
 */
function createMockSocket(): EventEmitter & {
  write: Mock;
  destroy: Mock;
  removeAllListeners: Mock;
} {
  const socket = new EventEmitter() as EventEmitter & {
    write: Mock;
    destroy: Mock;
    removeAllListeners: Mock;
  };
  socket.write = vi.fn();
  socket.destroy = vi.fn();
  socket.removeAllListeners = vi.fn();
  return socket;
}

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerService;
}

function createDefaultConfig(
  overrides?: Partial<CheckmkLivestatusConfig>,
): CheckmkLivestatusConfig {
  return {
    host: "livestatus.example.com",
    port: 6557,
    tls: false,
    timeoutMs: 5000,
    ...overrides,
  };
}

describe("CheckmkLivestatusClient", () => {
  let mockLogger: LoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("LQL query construction", () => {
    it("should construct correct LQL query for getEvents", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        // Invoke the connect callback asynchronously
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      // Capture the query written to the socket and respond
      mockSocket.write.mockImplementation((query: string) => {
        // Respond with valid JSON after write
        const response = JSON.stringify([
          [1700000000, "myhost", "CPU load", 2, 1, "CRIT - load is 5.0"],
        ]);
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(response));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("myhost");
      await vi.runAllTimersAsync();
      await promise;

      // Verify the query written to the socket
      expect(mockSocket.write).toHaveBeenCalledTimes(1);
      const query = mockSocket.write.mock.calls[0][0] as string;

      expect(query).toContain("GET log");
      expect(query).toContain(
        "Columns: time host_name service_description state state_type plugin_output",
      );
      expect(query).toContain("Filter: class = 1");
      expect(query).toContain("Filter: host_name = myhost");
      expect(query).toMatch(/Filter: time >= \d+/);
      expect(query).toContain("Limit: 500");
      expect(query).toContain("OutputFormat: json");
    });

    it("should use time filter approximately 7 days in the past", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const now = Date.now();
      const sevenDaysAgo = Math.floor(now / 1000) - 7 * 86400;

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("testhost");
      await vi.runAllTimersAsync();
      await promise;

      const query = mockSocket.write.mock.calls[0][0] as string;
      const timeMatch = query.match(/Filter: time >= (\d+)/);
      expect(timeMatch).not.toBeNull();

      const filterTime = Number(timeMatch![1]);
      // Should be within 1 second of the expected value
      expect(Math.abs(filterTime - sevenDaysAgo)).toBeLessThan(2);
    });

    it("should respect custom days and limit options", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("testhost", { days: 3, limit: 100 });
      await vi.runAllTimersAsync();
      await promise;

      const query = mockSocket.write.mock.calls[0][0] as string;
      expect(query).toContain("Limit: 100");

      const now = Math.floor(Date.now() / 1000);
      const threeDaysAgo = now - 3 * 86400;
      const timeMatch = query.match(/Filter: time >= (\d+)/);
      const filterTime = Number(timeMatch![1]);
      expect(Math.abs(filterTime - threeDaysAgo)).toBeLessThan(2);
    });
  });

  describe("Row→CheckmkEvent mapping", () => {
    it("should map Livestatus rows to CheckmkEvent objects", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const rows = [
        [1700000000, "myhost", "CPU load", 1, 1, "WARN - load is 3.0"],
        [1700000100, "myhost", "CPU load", 2, 1, "CRIT - load is 5.0"],
        [1700000200, "myhost", "Memory", 1, 1, "WARN - 85% used"],
      ];

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(JSON.stringify(rows)));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("myhost");
      await vi.runAllTimersAsync();
      const events = await promise;

      // Events should be sorted descending by timestamp (most recent first)
      expect(events).toHaveLength(3);

      // Most recent first: Memory at 1700000200
      expect(events[0]).toEqual({
        timestamp: new Date(1700000200 * 1000).toISOString(),
        serviceDescription: "Memory",
        previousState: 1, // first entry for Memory, so previousState = currentState
        currentState: 1,
        output: "WARN - 85% used",
      });

      // CPU load at 1700000100 (previousState from earlier CPU load entry)
      expect(events[1]).toEqual({
        timestamp: new Date(1700000100 * 1000).toISOString(),
        serviceDescription: "CPU load",
        previousState: 1, // from the earlier CPU load entry
        currentState: 2,
        output: "CRIT - load is 5.0",
      });

      // CPU load at 1700000000 (first entry, previousState = currentState)
      expect(events[2]).toEqual({
        timestamp: new Date(1700000000 * 1000).toISOString(),
        serviceDescription: "CPU load",
        previousState: 1, // no prior entry, so equals currentState
        currentState: 1,
        output: "WARN - load is 3.0",
      });
    });

    it("should derive previousState from consecutive entries per service", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      // Three transitions for the same service: OK → WARN → CRIT
      const rows = [
        [1700000000, "host1", "Disk", 0, 1, "OK - 50% used"],
        [1700000100, "host1", "Disk", 1, 1, "WARN - 80% used"],
        [1700000200, "host1", "Disk", 2, 1, "CRIT - 95% used"],
      ];

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(JSON.stringify(rows)));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events).toHaveLength(3);
      // Descending order: most recent first
      expect(events[0].previousState).toBe(1); // WARN → CRIT
      expect(events[0].currentState).toBe(2);
      expect(events[1].previousState).toBe(0); // OK → WARN
      expect(events[1].currentState).toBe(1);
      expect(events[2].previousState).toBe(0); // first entry, prev = current
      expect(events[2].currentState).toBe(0);
    });

    it("should truncate output to 4096 characters", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const longOutput = "X".repeat(5000);
      const rows = [[1700000000, "host1", "Service1", 2, 1, longOutput]];

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(JSON.stringify(rows)));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events).toHaveLength(1);
      expect(events[0].output.length).toBe(4096);
      expect(events[0].output.endsWith("...")).toBe(true);
    });

    it("should produce ISO 8601 timestamps", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const rows = [[1700000000, "host1", "HTTP", 0, 1, "OK"]];

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(JSON.stringify(rows)));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events[0].timestamp).toBe(
        new Date(1700000000 * 1000).toISOString(),
      );
      // Verify it's valid ISO 8601
      expect(new Date(events[0].timestamp).toISOString()).toBe(
        events[0].timestamp,
      );
    });

    it("should skip rows with missing service description", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const rows = [
        [1700000000, "host1", "", 0, 1, "OK"], // empty service description
        [1700000100, "host1", "HTTP", 1, 1, "WARN"],
      ];

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(JSON.stringify(rows)));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events).toHaveLength(1);
      expect(events[0].serviceDescription).toBe("HTTP");
    });

    it("should return empty array for empty response", async () => {
      const config = createDefaultConfig();
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from(""));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events).toEqual([]);
    });
  });

  describe("TLS vs plaintext socket selection", () => {
    it("should use net.createConnection when tls is false", async () => {
      const config = createDefaultConfig({ tls: false });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      await promise;

      expect(mockNetCreateConnection).toHaveBeenCalledTimes(1);
      expect(mockNetCreateConnection).toHaveBeenCalledWith(
        { host: "livestatus.example.com", port: 6557 },
        expect.any(Function),
      );
      expect(mockTlsConnect).not.toHaveBeenCalled();
    });

    it("should use tls.connect when tls is true", async () => {
      const config = createDefaultConfig({ tls: true });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockTlsConnect.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      await promise;

      expect(mockTlsConnect).toHaveBeenCalledTimes(1);
      expect(mockNetCreateConnection).not.toHaveBeenCalled();
    });

    it("should set rejectUnauthorized=true when sslVerify is true", async () => {
      const config = createDefaultConfig({ tls: true });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockTlsConnect.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      await promise;

      expect(mockTlsConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "livestatus.example.com",
          port: 6557,
          rejectUnauthorized: true,
        }),
        expect.any(Function),
      );
    });

    it("should set rejectUnauthorized=false when sslVerify is false", async () => {
      const config = createDefaultConfig({ tls: true });
      const client = new CheckmkLivestatusClient(config, false, mockLogger);

      const mockSocket = createMockSocket();
      mockTlsConnect.mockImplementation((_opts, callback) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        setTimeout(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        }, 0);
      });

      const promise = client.getEvents("host1");
      await vi.runAllTimersAsync();
      await promise;

      expect(mockTlsConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          rejectUnauthorized: false,
        }),
        expect.any(Function),
      );
    });
  });

  describe("Timeout behavior", () => {
    it("should reject with timeout error when socket does not respond", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 50 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        // Connect fires immediately, but no data ever arrives
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        // Socket accepts the write but never responds — timeout will fire
      });

      await expect(client.getEvents("host1")).rejects.toThrow(
        /timed out after 50ms/,
      );
    });

    it("should include host:port in timeout error message", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({
        host: "ls.example.com",
        port: 6558,
        timeoutMs: 50,
      });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        // No response
      });

      await expect(client.getEvents("host1")).rejects.toThrow(
        "ls.example.com:6558",
      );
    });

    it("should throw on connection error (enables plugin fallback)", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, _callback) => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("ECONNREFUSED"));
        });
        return mockSocket;
      });

      await expect(client.getEvents("host1")).rejects.toThrow(
        /connection error/i,
      );
    });
  });

  describe("Secrets non-exposure", () => {
    it("should not include password in connection error messages", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, _callback) => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("ECONNREFUSED"));
        });
        return mockSocket;
      });

      try {
        await client.getEvents("host1");
        expect.fail("Should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        // Error should contain host:port for debugging
        expect(message).toContain("livestatus.example.com");
        expect(message).toContain("6557");
        // Error should NOT contain any password-like content
        expect(message).not.toContain("password");
        expect(message).not.toContain("secret");
        expect(message).not.toContain("Bearer");
      }
    });

    it("should not include secrets in timeout error messages", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 50 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        // No response — will timeout
      });

      try {
        await client.getEvents("host1");
        expect.fail("Should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain("password");
        expect(message).not.toContain("secret");
        expect(message).not.toContain("Bearer");
        // Should contain useful debugging info
        expect(message).toContain("livestatus.example.com");
      }
    });

    it("should not include secrets in parse error messages", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("data", Buffer.from("not valid json {{{"));
          mockSocket.emit("end");
        });
      });

      try {
        await client.getEvents("host1");
        expect.fail("Should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain("parse error");
        expect(message).not.toContain("password");
        expect(message).not.toContain("secret");
        expect(message).not.toContain("Bearer");
      }
    });
  });

  describe("ping()", () => {
    it("should send GET status query and return true on valid response", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        process.nextTick(() => {
          const response = JSON.stringify([["2.2.0p1"]]);
          mockSocket.emit("data", Buffer.from(response));
          mockSocket.emit("end");
        });
      });

      const result = await client.ping();

      expect(result).toBe(true);

      // Verify the query sent
      const query = mockSocket.write.mock.calls[0][0] as string;
      expect(query).toContain("GET status");
      expect(query).toContain("Columns: program_version");
      expect(query).toContain("OutputFormat: json");
    });

    it("should return false on connection error", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, _callback) => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("ECONNREFUSED"));
        });
        return mockSocket;
      });

      const result = await client.ping();
      expect(result).toBe(false);
    });

    it("should return false on empty response", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("data", Buffer.from("[]"));
          mockSocket.emit("end");
        });
      });

      const result = await client.ping();
      expect(result).toBe(false);
    });

    it("should return false on invalid JSON response", async () => {
      vi.useRealTimers();
      const config = createDefaultConfig({ timeoutMs: 5000 });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);

      const mockSocket = createMockSocket();
      mockNetCreateConnection.mockImplementation((_opts, callback) => {
        process.nextTick(() => callback());
        return mockSocket;
      });

      mockSocket.write.mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("data", Buffer.from("not json"));
          mockSocket.emit("end");
        });
      });

      const result = await client.ping();
      expect(result).toBe(false);
    });
  });

  describe("isEnabled()", () => {
    it("should return true when host is configured", () => {
      const config = createDefaultConfig({ host: "livestatus.example.com" });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);
      expect(client.isEnabled()).toBe(true);
    });

    it("should return false when host is empty", () => {
      const config = createDefaultConfig({ host: "" });
      const client = new CheckmkLivestatusClient(config, true, mockLogger);
      expect(client.isEnabled()).toBe(false);
    });
  });
});
