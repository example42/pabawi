import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
} from "vitest";
import express, { type Express } from "express";
import { BoltService } from "../../src/integrations/bolt";
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { CommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import { StreamingExecutionManager } from "../../src/services/StreamingExecutionManager";
import { createCommandsRouter } from "../../src/routes/commands";
import { createTasksRouter } from "../../src/routes/tasks";
import { errorHandler, requestIdMiddleware } from "../../src/middleware/errorHandler";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { Database } from "sqlite3";

// Mock child_process to avoid actual Bolt CLI execution
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock sqlite3 database
vi.mock("sqlite3", () => {
  const mockDb = {
    run: vi.fn(
      (
        _sql: string,
        _params: unknown,
        callback?: (err: Error | null) => void,
      ) => {
        if (callback) callback(null);
        return mockDb;
      },
    ),
    get: vi.fn(
      (
        _sql: string,
        _params: unknown,
        callback: (err: Error | null, row: unknown) => void,
      ) => {
        callback(null, null);
        return mockDb;
      },
    ),
    all: vi.fn(
      (
        _sql: string,
        _params: unknown,
        callback: (err: Error | null, rows: unknown[]) => void,
      ) => {
        callback(null, []);
        return mockDb;
      },
    ),
    close: vi.fn((callback?: (err: Error | null) => void) => {
      if (callback) callback(null);
    }),
  };

  return {
    Database: vi.fn(() => mockDb),
    verbose: vi.fn(() => ({ Database: vi.fn(() => mockDb) })),
  };
});

describe("API Integration Tests", () => {
  let app: Express;
  let boltService: BoltService;
  let executionRepository: ExecutionRepository;
  let commandWhitelistService: CommandWhitelistService;
  let streamingManager: StreamingExecutionManager;
  let integrationManager: IntegrationManager;

  beforeAll(() => {
    // Mock spawn is initialized via vi.mock at the top of the file
  });

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Initialize services
    boltService = new BoltService("./bolt-project", 5000);
    executionRepository = new ExecutionRepository({} as Database);
    commandWhitelistService = new CommandWhitelistService({
      allowAll: false,
      whitelist: ["ls", "pwd", "whoami"],
      matchMode: "exact",
    });
    integrationManager = new IntegrationManager();
    streamingManager = new StreamingExecutionManager({
      bufferMs: 100,
      maxOutputSize: 10485760,
      maxLineLength: 10000,
    });

    // Add routes
    app.use(
      "/api/nodes",
      createCommandsRouter(
        integrationManager,
        executionRepository,
        commandWhitelistService,
        streamingManager,
      ),
    );
    app.use(
      "/api/nodes",
      createTasksRouter(integrationManager, executionRepository, streamingManager),
    );

    // Add error handler
    app.use(errorHandler);

    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Command Whitelist Service Integration", () => {
    it("should reject command not in whitelist", () => {
      expect(commandWhitelistService.isCommandAllowed("rm -rf /")).toBe(false);
    });

    it("should allow whitelisted commands", () => {
      expect(commandWhitelistService.isCommandAllowed("ls")).toBe(true);
      expect(commandWhitelistService.isCommandAllowed("pwd")).toBe(true);
      expect(commandWhitelistService.isCommandAllowed("whoami")).toBe(true);
    });

    it("should validate command format", () => {
      expect(() => {
        commandWhitelistService.validateCommand("ls");
      }).not.toThrow();
      expect(() => {
        commandWhitelistService.validateCommand("rm -rf /");
      }).toThrow();
    });
  });

  describe("BoltService and Repository Integration", () => {
    it("should initialize BoltService with correct configuration", () => {
      expect(boltService.getBoltProjectPath()).toBe("./bolt-project");
      expect(boltService.getDefaultTimeout()).toBe(5000);
    });

    it("should initialize StreamingExecutionManager", () => {
      expect(streamingManager).toBeDefined();
    });
  });

  describe("Error Message Improvements", () => {
    it("should return actionable error messages with troubleshooting guidance", async () => {
      // Create a test app with error handler
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      // Create a route that throws a validation error
      testApp.get("/test-validation-error", () => {
        const error = new Error("Invalid input provided");
        error.name = "ValidationError";
        throw error;
      });

      testApp.use(errorHandler);

      const request = (await import("supertest")).default;
      const response = await request(testApp)
        .get("/test-validation-error")
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.type).toBe("validation");
      expect(response.body.error.actionableMessage).toBeDefined();
      expect(response.body.error.troubleshooting).toBeDefined();
      expect(response.body.error.troubleshooting.steps).toBeInstanceOf(Array);
      expect(response.body.error.troubleshooting.steps.length).toBeGreaterThan(0);
    });

    it("should categorize connection errors correctly", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      testApp.get("/test-connection-error", () => {
        const error = new Error("ECONNREFUSED");
        error.name = "PuppetserverConnectionError";
        throw error;
      });

      testApp.use(errorHandler);

      const request = (await import("supertest")).default;
      const response = await request(testApp)
        .get("/test-connection-error")
        .expect(503);

      expect(response.body.error.type).toBe("connection");
      expect(response.body.error.actionableMessage).toContain("connect");
      expect(response.body.error.troubleshooting.documentation).toBeDefined();
    });

    it("should include expert mode details when header is set", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      testApp.get("/test-expert-mode", () => {
        const error = new Error("Test error");
        throw error;
      });

      testApp.use(errorHandler);

      const request = (await import("supertest")).default;
      const response = await request(testApp)
        .get("/test-expert-mode")
        .set("X-Expert-Mode", "true")
        .expect(500);

      expect(response.body.error.stackTrace).toBeDefined();
      expect(response.body.error.requestId).toBeDefined();
      expect(response.body.error.timestamp).toBeDefined();
      expect(response.body.error.executionContext).toBeDefined();
    });

    it("should not include expert mode details without header", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      testApp.get("/test-no-expert-mode", () => {
        const error = new Error("Test error");
        throw error;
      });

      testApp.use(errorHandler);

      const request = (await import("supertest")).default;
      const response = await request(testApp)
        .get("/test-no-expert-mode")
        .expect(500);

      expect(response.body.error.stackTrace).toBeUndefined();
      expect(response.body.error.executionContext).toBeUndefined();
      // But actionable message and troubleshooting should still be present
      expect(response.body.error.actionableMessage).toBeDefined();
      expect(response.body.error.troubleshooting).toBeDefined();
    });
  });
});
