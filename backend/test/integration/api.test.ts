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
import { BoltService } from "../../src/bolt/BoltService";
import { ExecutionRepository } from "../../src/database/ExecutionRepository";
import { CommandWhitelistService } from "../../src/validation/CommandWhitelistService";
import { StreamingExecutionManager } from "../../src/services/StreamingExecutionManager";
import { createCommandsRouter } from "../../src/routes/commands";
import { createTasksRouter } from "../../src/routes/tasks";
import { errorHandler, requestIdMiddleware } from "../../src/middleware";
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
    streamingManager = new StreamingExecutionManager({
      bufferMs: 100,
      maxOutputSize: 10485760,
      maxLineLength: 10000,
    });

    // Add routes
    app.use(
      "/api/nodes",
      createCommandsRouter(
        boltService,
        executionRepository,
        commandWhitelistService,
        streamingManager,
      ),
    );
    app.use(
      "/api/nodes",
      createTasksRouter(boltService, executionRepository, streamingManager),
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
});
