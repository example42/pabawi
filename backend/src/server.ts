import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import type { Database } from "sqlite3";
import { ConfigService } from "./config/ConfigService";
import { DatabaseService } from "./database/DatabaseService";
import { ExecutionRepository } from "./database/ExecutionRepository";
import { CommandWhitelistService } from "./validation/CommandWhitelistService";
import { createFactsRouter } from "./routes/facts";
import { createCommandsRouter } from "./routes/commands";
import { createTasksRouter } from "./routes/tasks";
import { createExecutionsRouter } from "./routes/executions";
import { createPuppetHistoryRouter } from "./routes/puppetHistory";
import { createStreamingRouter } from "./routes/streaming";
import { createIntegrationsRouter } from "./routes/integrations";
import { createDebugRouter } from "./routes/debug";
import { createPluginsRouter } from "./routes/plugins";
import { createSetupRouter } from "./routes/setup";
import { createAuthRouter } from "./routes/auth";
import { createUserRouter } from "./routes/users";
import { createRoleRouter } from "./routes/roles";
import { createGroupRouter } from "./routes/groups";
import configRouter from "./routes/config";
import { createV1Router } from "./routes/v1";
import { StreamingExecutionManager } from "./services/StreamingExecutionManager";
import { ExecutionQueue } from "./services/ExecutionQueue";
import { errorHandler, requestIdMiddleware } from "./middleware/errorHandler";
import { expertModeMiddleware } from "./middleware/expertMode";
import { IntegrationManager } from "./integrations/IntegrationManager";
import { LoggerService } from "./services/LoggerService";
import { PuppetRunHistoryService } from "./services/PuppetRunHistoryService";

/**
 * Initialize and start the application
 */
async function startServer(): Promise<Express> {
  // Create logger early for startup logging
  const logger = new LoggerService();

  try {
    // Load configuration
    logger.info("Loading configuration...", {
      component: "Server",
      operation: "startServer",
    });
    const configService = new ConfigService();
    const config = configService.getConfig();

    logger.info("Configuration loaded successfully", {
      component: "Server",
      operation: "startServer",
      metadata: {
        host: config.host,
        port: config.port,
        boltProjectPath: config.boltProjectPath,
        databasePath: config.databasePath,
        executionTimeout: config.executionTimeout,
        commandWhitelistAllowAll: config.commandWhitelist.allowAll,
        commandWhitelistCount: config.commandWhitelist.whitelist.length,
      },
    });

    // Initialize database
    logger.info("Initializing database...", {
      component: "Server",
      operation: "startServer",
    });
    const databaseService = new DatabaseService(config.databasePath);
    await databaseService.initialize();
    logger.info("Database initialized successfully", {
      component: "Server",
      operation: "startServer",
    });

    // Initialize execution repository
    // Note: ExecutionRepository still uses raw sqlite3 connection for backward compatibility
    // This will be refactored in a future update to use the DatabaseAdapter interface
    const executionRepository = new ExecutionRepository(
      databaseService.getConnection() as Database,
    );

    // Initialize command whitelist service
    const commandWhitelistService = new CommandWhitelistService(
      config.commandWhitelist,
    );

    // Initialize streaming execution manager
    const streamingManager = new StreamingExecutionManager(config.streaming);
    logger.info("Streaming execution manager initialized successfully", {
      component: "Server",
      operation: "startServer",
      metadata: {
        bufferMs: config.streaming.bufferMs,
        maxOutputSize: config.streaming.maxOutputSize,
        maxLineLength: config.streaming.maxLineLength,
      },
    });

    // Initialize execution queue
    const executionQueue = new ExecutionQueue(
      config.executionQueue.concurrentLimit,
      config.executionQueue.maxQueueSize,
    );
    logger.info("Execution queue initialized successfully", {
      component: "Server",
      operation: "startServer",
      metadata: {
        concurrentLimit: config.executionQueue.concurrentLimit,
        maxQueueSize: config.executionQueue.maxQueueSize,
      },
    });

    // Initialize integration manager
    logger.info("Initializing integration manager...", {
      component: "Server",
      operation: "startServer",
    });

    // Logger already created at the top of the function
    logger.info(`LoggerService initialized with level: ${logger.getLevel()}`, {
      component: "Server",
      operation: "startServer",
    });

    // Note: PerformanceMonitorService is now injected into plugins by PluginLoader
    // when loading from plugins/native/ directory

    const integrationManager = new IntegrationManager({ logger });

    // NOTE: All plugins are now auto-discovered and loaded by PluginLoader v1.0.0
    // from plugins/native/ and plugins/external/ directories.
    // Legacy manual plugin registration has been removed.
    // See plugins/native/{pluginName}/backend/ for plugin implementations.

    // Initialize all plugins (loads from plugins/ directory)
    logger.info("=== Initializing All Integration Plugins ===", {
      component: "Server",
      operation: "initializePlugins",
    });

    const initErrors = await integrationManager.initializePlugins({
      loadV1Plugins: true,
    });

    if (initErrors.length > 0) {
      logger.warn(`Integration initialization completed with ${String(initErrors.length)} error(s):`, {
        component: "Server",
        operation: "initializePlugins",
      });
      for (const { plugin, error } of initErrors) {
        logger.error(`  - ${plugin}: ${error.message}`, {
          component: "Server",
          operation: "initializePlugins",
        }, error);
      }
    } else {
      logger.info("All integrations initialized successfully", {
        component: "Server",
        operation: "initializePlugins",
      });
    }

    // Log loaded plugins
    const v1PluginNames = integrationManager.getV1PluginNames();
    logger.info(`Loaded ${String(v1PluginNames.length)} v1.0.0 plugins:`, {
      component: "Server",
      operation: "initializePlugins",
      metadata: { plugins: v1PluginNames },
    });

    // Log registered capabilities
    const capabilities = integrationManager.getAllCapabilities();
    logger.info(`Registered ${String(capabilities.length)} capabilities`, {
      component: "Server",
      operation: "initializePlugins",
      metadata: { capabilityCount: capabilities.length },
    });

    logger.info("Integration manager initialized successfully", {
      component: "Server",
      operation: "initializePlugins",
    });
    logger.info("=== End Integration Plugin Initialization ===", {
      component: "Server",
      operation: "initializePlugins",
    });

    // Make integration manager available globally for cross-service access
    (global as Record<string, unknown>).integrationManager = integrationManager;

    // Initialize PuppetRunHistoryService
    // Note: PuppetRunHistoryService will be updated to use capability-based access in a future task
    const puppetRunHistoryService: PuppetRunHistoryService | undefined = undefined;

    // Start health check scheduler for integrations
    if (integrationManager.getPluginCount() > 0) {
      const startScheduler = integrationManager.startHealthCheckScheduler.bind(integrationManager);
      startScheduler();
      logger.info("Integration health check scheduler started", {
        component: "Server",
        operation: "startServer",
      });
    }

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

    // Request ID middleware - adds unique ID to each request
    app.use(requestIdMiddleware);

    // Expert mode middleware - detects expert mode from request header
    app.use(expertModeMiddleware);

    // Request logging middleware
    app.use((req: Request, res: Response, next) => {
      const startTime = Date.now();

      logger.debug(`${req.method} ${req.path}`, {
        component: "Server",
        operation: "requestLogger",
        metadata: {
          requestId: req.id,
          method: req.method,
          path: req.path,
        },
      });

      // Log response when finished
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        logger.debug(`${req.method} ${req.path} - ${String(res.statusCode)} (${String(duration)}ms)`, {
          component: "Server",
          operation: "requestLogger",
          metadata: {
            requestId: req.id,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
          },
        });
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

    // Config routes (UI settings, etc.)
    app.use("/api/config", configRouter);

    // Get database adapter for auth routes
    const dbAdapter = databaseService.getAdapter();

    // Setup routes (first-run admin creation - no auth required)
    app.use(
      "/api/setup",
      createSetupRouter({ db: dbAdapter })
    );

    // Auth routes (login, logout, refresh - mostly no auth required)
    const jwtSecret = process.env.JWT_SECRET || "pabawi-dev-secret-change-in-production";
    const accessTokenExpiry = process.env.JWT_ACCESS_TOKEN_EXPIRY ? parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY, 10) : 3600;
    const refreshTokenExpiry = process.env.JWT_REFRESH_TOKEN_EXPIRY ? parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY, 10) : 604800;

    app.use(
      "/api/auth",
      createAuthRouter({
        db: dbAdapter,
        jwtSecret,
        accessTokenExpiry,
        refreshTokenExpiry,
      })
    );

    // User management routes (admin only)
    app.use(
      "/api/users",
      createUserRouter({ db: dbAdapter, jwtSecret })
    );

    // Role management routes (admin only)
    app.use(
      "/api/roles",
      createRoleRouter({ db: dbAdapter, jwtSecret })
    );

    // Group management routes (admin only)
    app.use(
      "/api/groups",
      createGroupRouter({ db: dbAdapter, jwtSecret })
    );

    logger.info("Authentication and authorization routes mounted", {
      component: "Server",
      operation: "startServer",
    });

    // API Routes
    // NOTE: Legacy routes using boltService directly have been removed.
    // All plugin functionality is now accessed via IntegrationManager and CapabilityRegistry.
    // See /api/v1/* routes for the new capability-based API.

    // Facts routes - uses IntegrationManager
    app.use("/api/nodes", createFactsRouter(integrationManager));

    // Commands routes - uses IntegrationManager
    app.use(
      "/api/nodes",
      createCommandsRouter(
        integrationManager,
        executionRepository,
        commandWhitelistService,
        streamingManager,
      ),
    );

    // Tasks routes - uses IntegrationManager
    app.use(
      "/api/nodes",
      createTasksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
      ),
    );

    // Add puppet history routes if PuppetDB is available
    if (puppetRunHistoryService) {
      app.use(
        "/api/puppet",
        createPuppetHistoryRouter(puppetRunHistoryService),
      );
    }

    app.use(
      "/api/tasks",
      createTasksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
      ),
    );
    app.use(
      "/api/executions",
      createExecutionsRouter(executionRepository, executionQueue),
    );
    app.use(
      "/api/executions",
      createStreamingRouter(streamingManager, executionRepository),
    );
    app.use(
      "/api/streaming",
      createStreamingRouter(streamingManager, executionRepository),
    );
    app.use(
      "/api/integrations",
      createIntegrationsRouter(
        integrationManager,
        logger,
      ),
    );
    // NOTE: Plugin-specific routes removed - functionality available via /api/v1/capabilities
    app.use(
      "/api/debug",
      createDebugRouter(),
    );
    app.use(
      "/api/plugins",
      createPluginsRouter(integrationManager),
    );

    // v1 API routes (versioned API)
    app.use(
      "/api/v1",
      createV1Router({
        integrationManager,
        logger,
        executionRepository,
        commandWhitelistService,
        streamingManager,
      }),
    );

    logger.info("v1 API routes mounted at /api/v1", {
      component: "Server",
      operation: "startServer",
    });

    // Serve static frontend files in production
    const publicPath = path.resolve(__dirname, "..", "public");
    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for non-API routes
    app.get("*", (_req: Request, res: Response) => {
      const indexPath = path.join(publicPath, "index.html");
      res.sendFile(indexPath);
    });

    // Global error handling middleware with expert mode support
    app.use(errorHandler);

    // Start server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`Backend server running on ${config.host}:${String(config.port)}`, {
        component: "Server",
        operation: "startServer",
        metadata: {
          host: config.host,
          port: config.port,
        },
      });
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM received, shutting down gracefully...", {
        component: "Server",
        operation: "shutdown",
      });
      streamingManager.cleanup();
      integrationManager.stopHealthCheckScheduler();
      server.close(() => {
        void databaseService.close().then(() => {
          logger.info("Server closed", {
            component: "Server",
            operation: "shutdown",
          });
          process.exit(0);
        });
      });
    });

    return app;
  } catch (error: unknown) {
    logger.error("Failed to start server", {
      component: "Server",
      operation: "startServer",
    }, error instanceof Error ? error : undefined);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error: unknown) => {
  const logger = new LoggerService();
  logger.error("Unhandled error during startup", {
    component: "Server",
    operation: "main",
  }, error instanceof Error ? error : undefined);
  process.exit(1);
});

export default startServer;
