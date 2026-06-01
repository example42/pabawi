import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import type { CheckmkConfig } from "../../src/integrations/checkmk/types";
import type { LoggerService } from "../../src/services/LoggerService";

/**
 * Property-Based Tests for CheckmkService
 *
 * **Validates: Requirements 3.1, 3.3**
 *
 * Tests the two correctness properties from the design document:
 * - Property 4: Authorization header correctness
 * - Property 5: Password non-exposure
 */

/**
 * Captured request options from mocked http/https.request calls.
 */
let capturedRequestOptions: Array<{ headers?: Record<string, string> }> = [];

/**
 * Controls what the mock response does: "success", "error", "timeout", "http-error"
 */
let mockBehavior: "success" | "connection-error" | "timeout" | "http-error" = "success";
let mockErrorBody = "";

// Mock node:https and node:http to intercept all requests
vi.mock("node:https", () => {
  const Agent = vi.fn();
  return {
    default: { request: vi.fn(), Agent },
    Agent,
    request: (options: Record<string, unknown>, callback?: (res: unknown) => void) => {
      capturedRequestOptions.push(options as { headers?: Record<string, string> });

      if (mockBehavior === "connection-error") {
        const req = {
          on: (event: string, handler: (err?: Error) => void) => {
            if (event === "error") {
              process.nextTick(() => { handler(new Error("ECONNREFUSED")); });
            }
            return req;
          },
          end: () => {},
          destroy: () => {},
        };
        return req;
      }

      if (mockBehavior === "timeout") {
        const req = {
          on: (event: string, handler: () => void) => {
            if (event === "timeout") {
              process.nextTick(() => { handler(); });
            }
            return req;
          },
          end: () => {},
          destroy: () => {},
        };
        return req;
      }

      const statusCode = mockBehavior === "http-error" ? 401 : 200;
      const body = mockBehavior === "http-error"
        ? mockErrorBody
        : JSON.stringify({ versions: { checkmk: "2.2.0" }, value: [] });

      const mockRes = {
        statusCode,
        on: (event: string, handler: (data?: unknown) => void) => {
          if (event === "data") {
            handler(Buffer.from(body));
          }
          if (event === "end") {
            handler();
          }
          return mockRes;
        },
      };

      if (callback) {
        process.nextTick(() => { callback(mockRes); });
      }

      const req = {
        on: (_event: string, _handler: unknown) => req,
        end: () => {},
        destroy: () => {},
      };
      return req;
    },
  };
});

vi.mock("node:http", () => {
  return {
    default: { request: vi.fn() },
    request: (options: Record<string, unknown>, callback?: (res: unknown) => void) => {
      capturedRequestOptions.push(options as { headers?: Record<string, string> });

      const body = JSON.stringify({ versions: { checkmk: "2.2.0" }, value: [] });
      const mockRes = {
        statusCode: 200,
        on: (event: string, handler: (data?: unknown) => void) => {
          if (event === "data") {
            handler(Buffer.from(body));
          }
          if (event === "end") {
            handler();
          }
          return mockRes;
        },
      };

      if (callback) {
        process.nextTick(() => { callback(mockRes); });
      }

      const req = {
        on: (_event: string, _handler: unknown) => req,
        end: () => {},
        destroy: () => {},
      };
      return req;
    },
  };
});

/**
 * Creates a mock LoggerService that captures all log calls for inspection.
 */
function createMockLogger(): LoggerService & { calls: Array<{ level: string; args: unknown[] }> } {
  const calls: Array<{ level: string; args: unknown[] }> = [];

  const logger = {
    calls,
    debug: (...args: unknown[]) => { calls.push({ level: "debug", args }); },
    info: (...args: unknown[]) => { calls.push({ level: "info", args }); },
    warn: (...args: unknown[]) => { calls.push({ level: "warn", args }); },
    error: (...args: unknown[]) => { calls.push({ level: "error", args }); },
    child: () => logger,
    setLevel: () => {},
  } as unknown as LoggerService & { calls: Array<{ level: string; args: unknown[] }> };

  return logger;
}

/**
 * Creates a CheckmkConfig with the given username and password.
 */
function createConfig(username: string, password: string): CheckmkConfig { // pragma: allowlist secret
  return {
    enabled: true,
    serverUrl: "https://monitoring.example.com",
    site: "mysite",
    username,
    password, // pragma: allowlist secret
    sslVerify: true,
  };
}

/**
 * Arbitrary for non-empty credential strings.
 * Uses alphanumeric strings long enough to avoid false substring matches
 * with fixed log text (e.g. "monitoring", "constructor", "error").
 */
const credentialArb = fc.stringMatching(/^[a-zA-Z0-9]{5,40}$/)
  .filter((s) => !["monitoring", "constructor", "error", "checkmk", "testconnection", "operation", "integration", "component", "metadata", "serverurl"].some(
    (word) => word.includes(s.toLowerCase()) || s.toLowerCase().includes(word),
  ));

/**
 * Arbitrary for passwords that are non-trivial and won't appear as
 * substrings of standard log vocabulary. Uses a prefix to guarantee
 * uniqueness against fixed log text.
 */
const passwordArb = fc.stringMatching(/^[A-Z][a-z][0-9][!@#$%^&*][a-zA-Z0-9!@#$%^&*]{4,40}$/); // pragma: allowlist secret

describe("CheckmkService Properties", () => {
  beforeEach(() => {
    capturedRequestOptions = [];
    mockBehavior = "success";
    mockErrorBody = "";
  });

  afterEach(() => {
    capturedRequestOptions = [];
  });

  /**
   * Property 4: Authorization header correctness
   *
   * **Validates: Requirements 3.1**
   *
   * For any request made by CheckmkService to the Checkmk API, the request
   * SHALL include an Authorization header with the value
   * `Bearer {username} {password}` where username and password are the
   * configured credentials.
   */
  describe("Property 4: Authorization header correctness", () => {
    it("every request includes Bearer {username} {password} header", async () => {
      // Import dynamically after mocks are set up
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(credentialArb, credentialArb, async (username, password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          const logger = createMockLogger();
          const config = createConfig(username, password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.testConnection();

          // Verify the request was made with the correct Authorization header
          expect(capturedRequestOptions.length).toBeGreaterThan(0);
          const lastOptions = capturedRequestOptions[capturedRequestOptions.length - 1];

          expect(lastOptions.headers).toBeDefined();
          expect(lastOptions.headers?.Authorization).toBe(
            `Bearer ${username} ${password}`, // pragma: allowlist secret
          );
        }),
        { numRuns: 100 },
      );
    });

    it("auth header format is exactly 'Bearer {username} {password}' with literal space separator", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(credentialArb, credentialArb, async (username, password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          const logger = createMockLogger();
          const config = createConfig(username, password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.getHosts();

          expect(capturedRequestOptions.length).toBeGreaterThan(0);
          const lastOptions = capturedRequestOptions[capturedRequestOptions.length - 1];
          const authHeader = lastOptions.headers?.Authorization as string;

          // Must start with "Bearer "
          expect(authHeader.startsWith("Bearer ")).toBe(true);

          // After "Bearer ", the rest is "{username} {password}"
          const afterBearer = authHeader.slice("Bearer ".length);
          expect(afterBearer).toBe(`${username} ${password}`); // pragma: allowlist secret
        }),
        { numRuns: 100 },
      );
    });

    it("auth header is present on getServices requests", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(credentialArb, credentialArb, async (username, password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          const logger = createMockLogger();
          const config = createConfig(username, password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.getServices("testhost");

          expect(capturedRequestOptions.length).toBeGreaterThan(0);
          const lastOptions = capturedRequestOptions[capturedRequestOptions.length - 1];

          expect(lastOptions.headers?.Authorization).toBe(
            `Bearer ${username} ${password}`, // pragma: allowlist secret
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Password non-exposure
   *
   * **Validates: Requirements 3.3**
   *
   * For any operation performed by the Checkmk plugin that produces log
   * output, error messages, or API responses, the configured CHECKMK_PASSWORD
   * value SHALL NOT appear in any of those outputs.
   */
  describe("Property 5: Password non-exposure", () => {
    it("password never appears in log output during successful operations", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(credentialArb, passwordArb, async (username, password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          mockBehavior = "success";
          const logger = createMockLogger();
          const config = createConfig(username, password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          // Perform operations that produce log output
          await service.testConnection();
          await service.getHosts();
          await service.getServices("testhost");

          // Stringify all log call arguments and verify password is absent
          const allLogOutput = JSON.stringify(logger.calls);
          expect(allLogOutput).not.toContain(password); // pragma: allowlist secret
        }),
        { numRuns: 100 },
      );
    });

    it("password never appears in log output during connection failures", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(passwordArb, async (password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          mockBehavior = "connection-error";
          const logger = createMockLogger();
          const config = createConfig("automation", password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.testConnection();
          await service.getHosts();
          await service.getServices("testhost");

          // Stringify all log call arguments and verify password is absent
          const allLogOutput = JSON.stringify(logger.calls);
          expect(allLogOutput).not.toContain(password); // pragma: allowlist secret
        }),
        { numRuns: 100 },
      );
    });

    it("password never appears in log output during HTTP error responses", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(passwordArb, async (password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          mockBehavior = "http-error";
          // Simulate a response body that contains the password (upstream leak)
          mockErrorBody = `Authentication failed for user with password: ${password}`; // pragma: allowlist secret
          const logger = createMockLogger();
          const config = createConfig("automation", password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.testConnection();

          // Stringify all log call arguments and verify password is absent
          const allLogOutput = JSON.stringify(logger.calls);
          expect(allLogOutput).not.toContain(password); // pragma: allowlist secret
        }),
        { numRuns: 100 },
      );
    });

    it("password never appears in log output during timeout errors", async () => {
      const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");

      await fc.assert(
        fc.asyncProperty(passwordArb, async (password) => { // pragma: allowlist secret
          capturedRequestOptions = [];
          mockBehavior = "timeout";
          const logger = createMockLogger();
          const config = createConfig("automation", password); // pragma: allowlist secret
          const service = new CheckmkService(config, logger);

          await service.testConnection();

          // Stringify all log call arguments and verify password is absent
          const allLogOutput = JSON.stringify(logger.calls);
          expect(allLogOutput).not.toContain(password); // pragma: allowlist secret
        }),
        { numRuns: 100 },
      );
    });
  });
});
