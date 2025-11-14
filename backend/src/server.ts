import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { ConfigService } from "./config/ConfigService";
import { DatabaseService } from "./database/DatabaseService";
import { BoltValidator } from "./validation/BoltValidator";
import { BoltService } from "./bolt/BoltService";
import { ExecutionRepository } from "./database/ExecutionRepository";
import { CommandWhitelistService } from "./validation/CommandWhitelistService";
import { createInventoryRouter } from "./routes/inventory";
import { createFactsRouter } from "./routes/facts";
import { createCommandsRouter } from "./routes/commands";
import { createTasksRouter } from "./routes/tasks";
import { createExecutionsRouter } from "./routes/executions";

/**
 * Initialize and start the application
 */
async function startServer(): Promise<Express> {
  try {
    // Load configuration
    console.warn("Loading configuration...");
    const configService = new ConfigService();
    const config = configService.getConfig();

    console.warn(`Configuration loaded successfully`);
    console.warn(`- Port: ${String(config.port)}`);
    console.warn(`- Bolt Project Path: ${config.boltProjectPath}`);
    console.warn(`- Database Path: ${config.databasePath}`);
    console.warn(`- Execution Timeout: ${String(config.executionTimeout)}ms`);
    console.warn(
      `- Command Whitelist Allow All: ${String(config.commandWhitelist.allowAll)}`,
    );
    console.warn(
      `- Command Whitelist Count: ${String(config.commandWhitelist.whitelist.length)}`,
    );

    // Validate Bolt configuration
    console.warn("Validating Bolt configuration...");
    const boltValidator = new BoltValidator(config.boltProjectPath);
    boltValidator.validate();
    console.warn("Bolt configuration validated successfully");

    // Initialize database
    console.warn("Initializing database...");
    const databaseService = new DatabaseService(config.databasePath);
    await databaseService.initialize();
    console.warn("Database initialized successfully");

    // Initialize Bolt service
    console.warn("Initializing Bolt service...");
    const boltService = new BoltService(
      config.boltProjectPath,
      config.executionTimeout,
    );
    console.warn("Bolt service initialized successfully");

    // Initialize execution repository
    const executionRepository = new ExecutionRepository(
      databaseService.getConnection(),
    );

    // Initialize command whitelist service
    const commandWhitelistService = new CommandWhitelistService(
      config.commandWhitelist,
    );

    // Create Express app
    const app: Express = express();

    // Middleware
    app.use(
      cors({
        origin: true, // Allow same-origin requests
        credentials: true,
      }),
    );
    app.use(express.json());

    // Request logging middleware
    app.use((req: Request, res: Response, next) => {
      const timestamp = new Date().toISOString();
      const startTime = Date.now();

      console.warn(`[${timestamp}] ${req.method} ${req.path}`);

      // Log response when finished
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        console.warn(
          `[${timestamp}] ${req.method} ${req.path} - ${String(res.statusCode)} (${String(duration)}ms)`,
        );
      });

      next();
    });

    // Health check endpoint
    app.get("/api/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        message: "Backend API is running",
        config: {
          boltProjectPath: config.boltProjectPath,
          commandWhitelistEnabled: !config.commandWhitelist.allowAll,
          databaseInitialized: databaseService.isInitialized(),
        },
      });
    });

    // Configuration endpoint (excluding sensitive values)
    app.get("/api/config", (_req: Request, res: Response) => {
      res.json({
        commandWhitelist: {
          allowAll: config.commandWhitelist.allowAll,
          whitelist: config.commandWhitelist.allowAll
            ? []
            : config.commandWhitelist.whitelist,
          matchMode: config.commandWhitelist.matchMode,
        },
        executionTimeout: config.executionTimeout,
      });
    });

    // API Routes
    app.use("/api/inventory", createInventoryRouter(boltService));
    app.use("/api/nodes", createInventoryRouter(boltService));
    app.use("/api/nodes", createFactsRouter(boltService));
    app.use(
      "/api/nodes",
      createCommandsRouter(
        boltService,
        executionRepository,
        commandWhitelistService,
      ),
    );
    app.use("/api/nodes", createTasksRouter(boltService, executionRepository));
    app.use("/api/tasks", createTasksRouter(boltService, executionRepository));
    app.use("/api/executions", createExecutionsRouter(executionRepository));

    // Serve static frontend files in production
    const publicPath = path.resolve(__dirname, "..", "public");
    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for non-API routes
    app.get("*", (_req: Request, res: Response) => {
      const indexPath = path.join(publicPath, "index.html");
      res.sendFile(indexPath);
    });

    // Global error handling middleware
    app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
      console.error("Error:", err);

      // Handle different error types
      if (err.name === "ValidationError") {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: err.message || "Request validation failed",
          },
        });
        return;
      }

      if (err.name === "ZodError") {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Request validation failed",
            details: err.message,
          },
        });
        return;
      }

      // Default to 500 Internal Server Error
      res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "An unexpected error occurred",
        },
      });
    });

    // Start server
    const server = app.listen(config.port, () => {
      console.warn(`Backend server running on port ${String(config.port)}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.warn("SIGTERM received, shutting down gracefully...");
      server.close(() => {
        void databaseService.close().then(() => {
          console.warn("Server closed");
          process.exit(0);
        });
      });
    });

    return app;
  } catch (error: unknown) {
    console.error("Failed to start server:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Start the server
startServer().catch((error: unknown) => {
  console.error("Unhandled error during startup:", error);
  process.exit(1);
});

export default startServer;
