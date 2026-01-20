/**
 * API Logger Tests
 *
 * Tests for comprehensive API logging functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiLogger, createApiLogger } from "../../src/integrations/ApiLogger";

describe("ApiLogger", () => {
  let logger: ApiLogger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new ApiLogger("test-integration", "debug");
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("generateCorrelationId", () => {
    it("should generate unique correlation IDs", () => {
      const id1 = logger.generateCorrelationId();
      const id2 = logger.generateCorrelationId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe("logRequest", () => {
    it("should log API request with all details", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logRequest(correlationId, "GET", "/api/test", "https://example.com/api/test", {
        headers: { "Content-Type": "application/json" },
        queryParams: { limit: 10, offset: 0 },
        authentication: {
          type: "token",
          hasToken: true,
          tokenLength: 32,
        },
      });

      // LoggerService uses console.log for info level, not console.warn
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      expect(logCall[0]).toContain("API Request");
      expect(logCall[0]).toContain(correlationId);
    });

    it("should sanitize sensitive headers", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logRequest(correlationId, "POST", "/api/auth", "https://example.com/api/auth", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer secret-token-12345",
          "X-Authentication": "another-secret",
        },
      });

      // LoggerService uses console.log for info level
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      const logData = logCall[0];

      // Check that sensitive headers are redacted
      expect(logData).toContain("[REDACTED");
      expect(logData).not.toContain("secret-token");
      expect(logData).not.toContain("another-secret");
    });

    it("should log request body in debug mode", () => {
      const correlationId = logger.generateCorrelationId();
      const body = { username: "test", data: "value" };

      logger.logRequest(correlationId, "POST", "/api/data", "https://example.com/api/data", {
        body,
      });

      // In debug mode, LoggerService uses console.log for debug level
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      const logData = logCall[0];
      expect(logData).toContain("username");
    });

    it("should sanitize sensitive body fields", () => {
      const correlationId = logger.generateCorrelationId();
      const body = {
        username: "test",
        password: "secret123", // pragma: allowlist secret
        token: "secret-token",
        data: "value",
      };

      logger.logRequest(correlationId, "POST", "/api/auth", "https://example.com/api/auth", {
        body,
      });

      // In debug mode, LoggerService uses console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      const logData = logCall[0];

      // Check that sensitive fields are redacted
      expect(logData).toContain("[REDACTED]");
      expect(logData).not.toContain("secret123");
      expect(logData).not.toContain("secret-token");
      // Non-sensitive fields should still be present
      expect(logData).toContain("username");
      expect(logData).toContain("value");
    });
  });

  describe("logResponse", () => {
    it("should log successful API response", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logResponse(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
          body: { result: "success" },
        },
        150,
      );

      // Successful responses (2xx) are logged at info level using console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      expect(logCall[0]).toContain("API Response");
      expect(logCall[0]).toContain(correlationId);
    });

    it("should log 4xx responses as warnings", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logResponse(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          status: 404,
          statusText: "Not Found",
          headers: {},
          body: { error: "Resource not found" },
        },
        100,
      );

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0];
      expect(logCall[0]).toContain("404");
      expect(logCall[0]).toContain("Not Found");
    });

    it("should log 5xx responses as errors", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logResponse(
        correlationId,
        "POST",
        "/api/test",
        "https://example.com/api/test",
        {
          status: 500,
          statusText: "Internal Server Error",
          headers: {},
          body: { error: "Server error" },
        },
        200,
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(logCall[0]).toContain("500");
      expect(logCall[0]).toContain("Internal Server Error");
    });

    it("should include duration in response log", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logResponse(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          status: 200,
          statusText: "OK",
          body: {},
        },
        1234,
      );

      // Successful responses use console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      const logData = logCall[0];
      expect(logData).toContain("1234");
    });

    it("should create body preview for large responses", () => {
      const correlationId = logger.generateCorrelationId();
      const largeBody = { data: "x".repeat(500) };

      logger.logResponse(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          status: 200,
          statusText: "OK",
          body: largeBody,
        },
        100,
      );

      // Successful responses use console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      const logData = logCall[0];
      expect(logData).toContain("truncated");
    });
  });

  describe("logError", () => {
    it("should log API error with details", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logError(
        correlationId,
        "POST",
        "/api/test",
        "https://example.com/api/test",
        {
          message: "Connection failed",
          type: "ConnectionError",
          category: "connection",
          statusCode: undefined,
          details: { reason: "ECONNREFUSED" },
        },
        500,
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(logCall[0]).toContain("API Error");
      expect(logCall[0]).toContain(correlationId);
      expect(logCall[0]).toContain("Connection failed");
    });

    it("should include error category and type", () => {
      const correlationId = logger.generateCorrelationId();

      logger.logError(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          message: "Authentication failed",
          type: "AuthenticationError",
          category: "authentication",
          statusCode: 401,
        },
        100,
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      // LoggerService formats everything into a single string
      const logData = logCall[0];
      expect(logData).toContain("authentication");
      expect(logData).toContain("AuthenticationError");
      expect(logData).toContain("401");
    });
  });

  describe("log levels", () => {
    it("should respect info log level", () => {
      const infoLogger = new ApiLogger("test", "info");
      const correlationId = infoLogger.generateCorrelationId();

      infoLogger.logRequest(correlationId, "GET", "/api/test", "https://example.com/api/test", {
        body: { data: "test" },
      });

      // In info mode, requests are logged using console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0];
      expect(logCall[0]).toContain("API Request");
    });

    it("should respect warn log level", () => {
      const warnLogger = new ApiLogger("test", "warn");
      const correlationId = warnLogger.generateCorrelationId();

      warnLogger.logRequest(correlationId, "GET", "/api/test", "https://example.com/api/test");

      // In warn mode, info-level requests should not be logged
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should always log errors regardless of log level", () => {
      const errorLogger = new ApiLogger("test", "error");
      const correlationId = errorLogger.generateCorrelationId();

      errorLogger.logError(
        correlationId,
        "GET",
        "/api/test",
        "https://example.com/api/test",
        {
          message: "Error occurred",
          type: "Error",
        },
        100,
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("createApiLogger", () => {
    it("should create logger with default log level", () => {
      const logger = createApiLogger("test-integration");

      expect(logger).toBeInstanceOf(ApiLogger);
      expect(logger.getIntegration()).toBe("test-integration");
      expect(logger.getLogLevel()).toBe("info");
    });

    it("should create logger with custom log level", () => {
      const logger = createApiLogger("test-integration", "debug");

      expect(logger.getLogLevel()).toBe("debug");
    });
  });

  describe("setLogLevel", () => {
    it("should update log level", () => {
      const logger = new ApiLogger("test", "info");

      expect(logger.getLogLevel()).toBe("info");

      logger.setLogLevel("debug");

      expect(logger.getLogLevel()).toBe("debug");
    });
  });
});
