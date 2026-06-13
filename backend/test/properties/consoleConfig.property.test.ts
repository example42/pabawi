/**
 * Property-Based Tests for Console Configuration Parsing
 *
 * Feature: console-integration, Property 14: Configuration parsing with defaults
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
 *
 * Property 14: Configuration parsing with defaults
 * ∀ env var value ∈ {non-numeric, negative, zero, float, valid positive int}:
 *   invalid values → defaults applied + warning logged
 *   heartbeatIntervalMs >= sessionTimeoutMs → both revert to defaults + warning logged
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { ConfigService } from "../../src/config/ConfigService";

const DEFAULTS = {
  sessionTimeoutMs: 300000,
  maxSessionDuration: 28800000,
  maxConcurrentSessions: 3,
  heartbeatIntervalMs: 30000,
} as const;

const ENV_VARS = [
  "CONSOLE_SESSION_TIMEOUT_MS",
  "CONSOLE_MAX_SESSION_DURATION",
  "CONSOLE_MAX_CONCURRENT_SESSIONS",
  "CONSOLE_HEARTBEAT_INTERVAL_MS",
] as const;

const ENV_TO_KEY: Record<string, keyof typeof DEFAULTS> = {
  CONSOLE_SESSION_TIMEOUT_MS: "sessionTimeoutMs",
  CONSOLE_MAX_SESSION_DURATION: "maxSessionDuration",
  CONSOLE_MAX_CONCURRENT_SESSIONS: "maxConcurrentSessions",
  CONSOLE_HEARTBEAT_INTERVAL_MS: "heartbeatIntervalMs",
};

const savedEnv: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  Object.assign(savedEnv, process.env);
}

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setRequiredEnv(): void {
  process.env.JWT_SECRET = "test-jwt-secret-for-property-tests-32chars"; // pragma: allowlist secret
  process.env.PABAWI_LIFECYCLE_TOKEN = "test-lifecycle-token"; // pragma: allowlist secret
}

function clearConsoleEnv(): void {
  for (const envVar of ENV_VARS) {
    delete process.env[envVar];
  }
}

/**
 * Determines if a string would be parsed as a valid positive integer by the ConfigService.
 * Mirrors the parsePositiveInt logic: Number(raw) must be finite, integer, and >= 1.
 */
function wouldParseAsValidPositiveInt(raw: string): boolean {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1;
}

/** Arbitrary that produces strings that are NOT valid positive integers per ConfigService logic */
const invalidEnvValueArb = fc.oneof(
  // Pure non-numeric strings
  fc.constantFrom("abc", "hello", "NaN", "undefined", "null", "true", "Infinity", "-Infinity"),
  // Negative integers as strings
  fc.integer({ min: -1000000, max: -1 }).map(String),
  // Zero
  fc.constant("0"),
  // Floating point values (non-integer)
  fc.tuple(fc.integer({ min: 1, max: 999999 }), fc.integer({ min: 1, max: 99 })).map(([a, b]) => `${String(a)}.${String(b)}`),
  // Strings with letters embedded (guaranteed not parseable)
  fc.tuple(fc.nat({ max: 999 }), fc.constantFrom("px", "ms", "abc", "x")).map(([n, s]) => `${String(n)}${s}`),
).filter((v) => !wouldParseAsValidPositiveInt(v));

/** Arbitrary that produces valid positive integer strings (>= 1) */
const validPositiveIntArb = fc.integer({ min: 1, max: 10000000 }).map(String);

describe("Feature: console-integration, Property 14: Configuration parsing with defaults", () => {
  beforeEach(() => {
    snapshotEnv();
    setRequiredEnv();
    clearConsoleEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("invalid env var values → default applied for each config field", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ENV_VARS),
        invalidEnvValueArb,
        (envVar, invalidValue) => {
          clearConsoleEnv();
          vi.spyOn(console, "warn").mockImplementation(() => {});

          process.env[envVar] = invalidValue;
          const config = new ConfigService();
          const consoleConfig = config.getConsoleConfig();
          const key = ENV_TO_KEY[envVar];

          expect(consoleConfig[key]).toBe(DEFAULTS[key]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("invalid env var values → warning logged mentioning the env var name", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ENV_VARS),
        invalidEnvValueArb,
        (envVar, invalidValue) => {
          clearConsoleEnv();
          const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

          process.env[envVar] = invalidValue;
          new ConfigService();

          const calls = warnSpy.mock.calls.map((c) => String(c[0]));
          const mentionsEnvVar = calls.some((msg) => msg.includes(envVar));
          expect(mentionsEnvVar).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("valid positive integers → correctly parsed (no defaults applied)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ENV_VARS),
        validPositiveIntArb,
        (envVar, validValue) => {
          clearConsoleEnv();
          vi.spyOn(console, "warn").mockImplementation(() => {});

          process.env[envVar] = validValue;

          // Ensure heartbeat < timeout to avoid cross-field default revert
          if (envVar === "CONSOLE_HEARTBEAT_INTERVAL_MS") {
            const hb = parseInt(validValue, 10);
            process.env.CONSOLE_SESSION_TIMEOUT_MS = String(hb + 1000000);
          } else if (envVar === "CONSOLE_SESSION_TIMEOUT_MS") {
            const timeout = parseInt(validValue, 10);
            process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = String(Math.max(1, timeout - 1));
          }

          const config = new ConfigService();
          const consoleConfig = config.getConsoleConfig();
          const key = ENV_TO_KEY[envVar];

          expect(consoleConfig[key]).toBe(parseInt(validValue, 10));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("heartbeatIntervalMs >= sessionTimeoutMs → both revert to defaults", () => {
    fc.assert(
      fc.property(
        // heartbeat value
        fc.integer({ min: 1, max: 10000000 }),
        // offset: 0 means equal, positive means heartbeat > timeout
        fc.nat({ max: 5000000 }),
        (heartbeat, offset) => {
          clearConsoleEnv();
          vi.spyOn(console, "warn").mockImplementation(() => {});

          const timeout = Math.max(1, heartbeat - offset);
          // heartbeat >= timeout guaranteed since offset >= 0
          process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = String(heartbeat);
          process.env.CONSOLE_SESSION_TIMEOUT_MS = String(timeout);

          const config = new ConfigService();
          const consoleConfig = config.getConsoleConfig();

          expect(consoleConfig.sessionTimeoutMs).toBe(DEFAULTS.sessionTimeoutMs);
          expect(consoleConfig.heartbeatIntervalMs).toBe(DEFAULTS.heartbeatIntervalMs);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("heartbeatIntervalMs >= sessionTimeoutMs → warning logged", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10000000 }),
        (heartbeat) => {
          clearConsoleEnv();
          const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

          // Equal case: heartbeat === timeout
          process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = String(heartbeat);
          process.env.CONSOLE_SESSION_TIMEOUT_MS = String(heartbeat);

          new ConfigService();

          const calls = warnSpy.mock.calls.map((c) => String(c[0]));
          const mentionsCrossField = calls.some(
            (msg) =>
              msg.includes("CONSOLE_HEARTBEAT_INTERVAL_MS") &&
              msg.includes("must be less than"),
          );
          expect(mentionsCrossField).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no CONSOLE_* env vars set → all defaults applied", () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          clearConsoleEnv();
          vi.spyOn(console, "warn").mockImplementation(() => {});

          const config = new ConfigService();
          const consoleConfig = config.getConsoleConfig();

          expect(consoleConfig.sessionTimeoutMs).toBe(DEFAULTS.sessionTimeoutMs);
          expect(consoleConfig.maxSessionDuration).toBe(DEFAULTS.maxSessionDuration);
          expect(consoleConfig.maxConcurrentSessions).toBe(DEFAULTS.maxConcurrentSessions);
          expect(consoleConfig.heartbeatIntervalMs).toBe(DEFAULTS.heartbeatIntervalMs);
        },
      ),
      { numRuns: 10 },
    );
  });
});
