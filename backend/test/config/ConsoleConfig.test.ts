/**
 * Unit tests for console configuration parsing in ConfigService
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConfigService } from "../../src/config/ConfigService";

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
  process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-with-32"; // pragma: allowlist secret
  process.env.PABAWI_LIFECYCLE_TOKEN = "test-lifecycle-token"; // pragma: allowlist secret
}

describe("ConfigService - Console Configuration", () => {
  beforeEach(() => {
    snapshotEnv();
    setRequiredEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("defaults (Req 11.1–11.4)", () => {
    it("should apply default values when no CONSOLE_* env vars are set", () => {
      const config = new ConfigService();
      const console = config.getConsoleConfig();

      expect(console.sessionTimeoutMs).toBe(300000);
      expect(console.maxSessionDuration).toBe(28800000);
      expect(console.maxConcurrentSessions).toBe(3);
      expect(console.heartbeatIntervalMs).toBe(30000);
    });
  });

  describe("valid env var parsing (Req 11.1–11.4)", () => {
    it("should parse CONSOLE_SESSION_TIMEOUT_MS", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "600000";
      const config = new ConfigService();
      expect(config.getConsoleConfig().sessionTimeoutMs).toBe(600000);
    });

    it("should parse CONSOLE_MAX_SESSION_DURATION", () => {
      process.env.CONSOLE_MAX_SESSION_DURATION = "3600000";
      const config = new ConfigService();
      expect(config.getConsoleConfig().maxSessionDuration).toBe(3600000);
    });

    it("should parse CONSOLE_MAX_CONCURRENT_SESSIONS", () => {
      process.env.CONSOLE_MAX_CONCURRENT_SESSIONS = "10";
      const config = new ConfigService();
      expect(config.getConsoleConfig().maxConcurrentSessions).toBe(10);
    });

    it("should parse CONSOLE_HEARTBEAT_INTERVAL_MS", () => {
      process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = "15000";
      const config = new ConfigService();
      expect(config.getConsoleConfig().heartbeatIntervalMs).toBe(15000);
    });
  });

  describe("invalid values fall back to defaults with warning (Req 11.5)", () => {
    it("should use default for non-numeric session timeout", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "abc";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      expect(config.getConsoleConfig().sessionTimeoutMs).toBe(300000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLE_SESSION_TIMEOUT_MS"),
      );
    });

    it("should use default for floating point value", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "300.5";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      expect(config.getConsoleConfig().sessionTimeoutMs).toBe(300000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLE_SESSION_TIMEOUT_MS"),
      );
    });

    it("should use default for negative value", () => {
      process.env.CONSOLE_MAX_SESSION_DURATION = "-1";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      expect(config.getConsoleConfig().maxSessionDuration).toBe(28800000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLE_MAX_SESSION_DURATION"),
      );
    });

    it("should use default for zero concurrent sessions", () => {
      process.env.CONSOLE_MAX_CONCURRENT_SESSIONS = "0";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      expect(config.getConsoleConfig().maxConcurrentSessions).toBe(3);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLE_MAX_CONCURRENT_SESSIONS"),
      );
    });

    it("should use default for empty string", () => {
      process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = "";
      const config = new ConfigService();
      expect(config.getConsoleConfig().heartbeatIntervalMs).toBe(30000);
    });
  });

  describe("cross-field validation (Req 11.6)", () => {
    it("should reset both to defaults when heartbeat >= session timeout", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "30000";
      process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = "30000";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      const consoleConf = config.getConsoleConfig();

      expect(consoleConf.sessionTimeoutMs).toBe(300000);
      expect(consoleConf.heartbeatIntervalMs).toBe(30000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("CONSOLE_HEARTBEAT_INTERVAL_MS"),
      );
    });

    it("should reset both to defaults when heartbeat > session timeout", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "10000";
      process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = "20000";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config = new ConfigService();
      const consoleConf = config.getConsoleConfig();

      expect(consoleConf.sessionTimeoutMs).toBe(300000);
      expect(consoleConf.heartbeatIntervalMs).toBe(30000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("must be less than"),
      );
    });

    it("should keep valid values when heartbeat < session timeout", () => {
      process.env.CONSOLE_SESSION_TIMEOUT_MS = "60000";
      process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = "5000";
      const config = new ConfigService();
      const consoleConf = config.getConsoleConfig();

      expect(consoleConf.sessionTimeoutMs).toBe(60000);
      expect(consoleConf.heartbeatIntervalMs).toBe(5000);
    });
  });

  describe("AppConfig integration", () => {
    it("should expose console config through getConfig()", () => {
      process.env.CONSOLE_MAX_CONCURRENT_SESSIONS = "5";
      const config = new ConfigService();
      const appConfig = config.getConfig();

      expect(appConfig.console).toBeDefined();
      expect(appConfig.console.maxConcurrentSessions).toBe(5);
    });
  });
});
