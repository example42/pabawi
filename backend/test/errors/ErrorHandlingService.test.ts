import { describe, it, expect, beforeEach } from "vitest";
import {
  ErrorHandlingService,
  ExecutionContext,
} from "../../src/errors/ErrorHandlingService";

describe("ErrorHandlingService", () => {
  let service: ErrorHandlingService;

  beforeEach(() => {
    service = new ErrorHandlingService();
  });

  describe("generateRequestId", () => {
    it("should generate a valid UUID", () => {
      const requestId = service.generateRequestId();
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("should generate unique IDs", () => {
      const id1 = service.generateRequestId();
      const id2 = service.generateRequestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("captureStackTrace", () => {
    it("should capture stack trace from error", () => {
      const error = new Error("Test error");
      const stackTrace = service.captureStackTrace(error);
      expect(stackTrace).toContain("Error: Test error");
    });

    it("should return fallback message when no stack trace", () => {
      const error = new Error("Test error");
      error.stack = undefined;
      const stackTrace = service.captureStackTrace(error);
      expect(stackTrace).toBe("No stack trace available");
    });
  });

  describe("formatError", () => {
    it("should format basic error without expert mode", () => {
      const error = new Error("Test error");
      const result = service.formatError(error, false);

      expect(result.error.message).toBe("Test error");
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.error.type).toBe("unknown");
      expect(result.error.actionableMessage).toBeDefined();
      expect(result.error.troubleshooting).toBeDefined();
      expect(result.error.stackTrace).toBeUndefined();
      expect(result.error.executionContext).toBeUndefined();
    });

    it("should include stack trace in expert mode", () => {
      const error = new Error("Test error");
      const result = service.formatError(error, true);

      expect(result.error.stackTrace).toBeDefined();
      expect(result.error.stackTrace).toContain("Error: Test error");
    });

    it("should include execution context in expert mode", () => {
      const error = new Error("Test error");
      const context: ExecutionContext = {
        requestId: "test-123",
        timestamp: "2024-01-01T00:00:00Z",
        endpoint: "/api/test",
        method: "POST",
        nodeId: "node-1",
      };

      const result = service.formatError(error, true, context);

      expect(result.error.requestId).toBe("test-123");
      expect(result.error.timestamp).toBe("2024-01-01T00:00:00Z");
      expect(result.error.executionContext).toEqual(context);
    });

    it("should include Bolt command in expert mode when available", () => {
      const error = new Error("Test error");
      const context: ExecutionContext = {
        requestId: "test-123",
        timestamp: "2024-01-01T00:00:00Z",
        endpoint: "/api/test",
        method: "POST",
        boltCommand: "bolt command run 'ls -la' --targets node1",
      };

      const result = service.formatError(error, true, context);

      expect(result.error.boltCommand).toBe(
        "bolt command run 'ls -la' --targets node1",
      );
    });

    it("should include raw Bolt output in expert mode", () => {
      const error = new Error("Test error") as Error & {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
      error.stdout = "Command output";  // pragma: allowlist secret
      error.stderr = "Error output";  // pragma: allowlist secret
      error.exitCode = 1;

      const result = service.formatError(error, true);

      expect(result.error.rawResponse).toEqual({
        stdout: "Command output",
        stderr: "Error output",
        exitCode: 1,
      });
    });

    it("should map BoltExecutionError to correct code", () => {
      const error = new Error("Bolt execution failed");
      error.name = "BoltExecutionError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.code).toBe("BOLT_EXECUTION_FAILED");
    });

    it("should map BoltTimeoutError to correct code", () => {
      const error = new Error("Bolt timeout");
      error.name = "BoltTimeoutError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.code).toBe("BOLT_TIMEOUT");
    });

    it("should map ValidationError to correct code", () => {
      const error = new Error("Validation failed");
      error.name = "ValidationError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.type).toBe("validation");
    });

    it("should categorize connection errors correctly", () => {
      const error = new Error("ECONNREFUSED");
      error.name = "PuppetserverConnectionError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.type).toBe("connection");
      expect(result.error.actionableMessage).toContain("connect");
    });

    it("should categorize authentication errors correctly", () => {
      const error = new Error("Authentication failed");
      error.name = "PuppetserverAuthenticationError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.type).toBe("authentication");
      expect(result.error.actionableMessage).toContain("Authentication");
    });

    it("should categorize timeout errors correctly", () => {
      const error = new Error("Request timed out");
      error.name = "BoltTimeoutError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.type).toBe("timeout");
      expect(result.error.actionableMessage).toContain("timed out");
    });

    it("should provide troubleshooting steps", () => {
      const error = new Error("Connection failed");
      error.name = "PuppetserverConnectionError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.troubleshooting).toBeDefined();
      expect(result.error.troubleshooting?.steps).toBeInstanceOf(Array);
      expect(result.error.troubleshooting?.steps.length).toBeGreaterThan(0);
    });

    it("should include documentation links when available", () => {
      const error = new Error("Configuration error");
      error.name = "PuppetserverConfigurationError";  // pragma: allowlist secret

      const result = service.formatError(error, false);

      expect(result.error.troubleshooting?.documentation).toBeDefined();
    });

    it("should include error details when available", () => {
      const error = new Error("Test error") as Error & { details?: unknown };
      error.details = { field: "value", reason: "invalid" };

      const result = service.formatError(error, false);

      expect(result.error.details).toEqual({
        field: "value",
        reason: "invalid",
      });
    });
  });

  describe("sanitizeSensitiveData", () => {
    it("should redact password in strings", () => {
      const data = "password=secret123 other=data";  // pragma: allowlist secret
      const result = service.sanitizeSensitiveData(data);
      expect(result).toBe("password=*** other=data");
    });

    it("should redact token in strings", () => {
      const data = "token:abc123xyz";  // pragma: allowlist secret
      const result = service.sanitizeSensitiveData(data);
      expect(result).toBe("token=***");
    });

    it("should redact api_key in strings", () => {
      const data = "api_key=12345";  // pragma: allowlist secret
      const result = service.sanitizeSensitiveData(data);
      expect(result).toBe("api_key=***");
    });

    it("should redact secret in strings", () => {
      const data = "secret: mysecret";  // pragma: allowlist secret
      const result = service.sanitizeSensitiveData(data);
      expect(result).toBe("secret=***");
    });

    it("should redact sensitive keys in objects", () => {
      const data = {
        username: "user",
        password: "secret", // pragma: allowlist secret
        apiKey: "key123", // pragma: allowlist secret
        token: "token123",
      };

      const result = service.sanitizeSensitiveData(data);

      expect(result).toEqual({
        username: "user",
        password: "***",
        apiKey: "***",
        token: "***",
      });
    });

    it("should recursively sanitize nested objects", () => {
      const data = {
        user: {
          name: "John",
          password: "secret", // pragma: allowlist secret
        },
        config: {
          apiKey: "key123", // pragma: allowlist secret
        },
      };

      const result = service.sanitizeSensitiveData(data);

      expect(result).toEqual({
        user: {
          name: "John",
          password: "***",
        },
        config: {
          apiKey: "***",
        },
      });
    });

    it("should handle non-object, non-string values", () => {
      expect(service.sanitizeSensitiveData(123)).toBe(123);
      expect(service.sanitizeSensitiveData(true)).toBe(true);
      expect(service.sanitizeSensitiveData(null)).toBe(null);
    });
  });
});
