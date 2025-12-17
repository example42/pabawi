import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { ConfigService } from "./config/ConfigService";
import { DatabaseService } from "./database/DatabaseService";
import { BoltValidator, BoltValidationError } from "./validation/BoltValidator";
import { BoltService } from "./bolt/BoltService";
import { ExecutionRepository } from "./database/ExecutionRepository";
import { CommandWhitelistService } from "./validation/CommandWhitelistService";
import { createInventoryRouter } from "./routes/inventory";
import { createFactsRouter } from "./routes/facts";
import { createCommandsRouter } from "./routes/commands";
import { createTasksRouter } from "./routes/tasks";
import { createExecutionsRouter } from "./routes/executions";
import { createPuppetRouter } from "./routes/puppet";
import { createPackagesRouter } from "./routes/packages";
import { createStreamingRouter } from "./routes/streaming";
import { createIntegrationsRouter } from "./routes/integrations";
import { StreamingExecutionManager } from "./services/StreamingExecutionManager";
import { ExecutionQueue } from "./services/ExecutionQueue";
import { errorHandler, requestIdMiddleware } from "./middleware";
import { IntegrationManager } from "./integrations/IntegrationManager";
import { PuppetDBService } from "./integrations/puppetdb/PuppetDBService";
import { PuppetserverService } from "./integrations/puppetserver/PuppetserverService";
import { BoltPlugin } from "./integrations/bolt";
import type { IntegrationConfig } from "./integrations/types";

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
    console.warn(`- Host: ${config.host}`);
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

    // Validate Bolt configuration (non-blocking)
    console.warn("Validating Bolt configuration...");
    const boltValidator = new BoltValidator(config.boltProjectPath);
    try {
      boltValidator.validate();
      console.warn("Bolt configuration validated successfully");
    } catch (error) {
      if (error instanceof BoltValidationError) {
        console.warn(`Bolt validation failed: ${error.message}`);
        if (error.details) {
          console.warn(`Details: ${error.details}`);
        }
        if (error.missingFiles.length > 0) {
          console.warn(`Missing files: ${error.missingFiles.join(", ")}`);
        }
        console.warn("Server will continue to start, but Bolt operations may be limited");
      } else {
        console.warn(`Unexpected error during Bolt validation: ${String(error)}`);
        console.warn("Server will continue to start, but Bolt operations may be limited");
      }
    }

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
      config.cache,
    );
    console.warn("Bolt service initialized successfully");

    // Defer package task validation to avoid blocking startup
    // Validation will occur on-demand when package operations are requested
    void (async (): Promise<void> => {
      try {
        const tasks = await boltService.listTasks();
        for (const packageTask of config.packageTasks) {
          const task = tasks.find((t) => t.name === packageTask.name);
          if (task) {
            console.warn(
              `✓ Package task '${packageTask.name}' (${packageTask.label}) is available`,
            );
          } else {
            console.warn(
              `✗ WARNING: Package task '${packageTask.name}' (${packageTask.label}) not found`,
            );
          }
        }
      } catch (error) {
        console.warn(
          `WARNING: Could not validate package installation tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    })();

    // Initialize execution repository
    const executionRepository = new ExecutionRepository(
      databaseService.getConnection(),
    );

    // Initialize command whitelist service
    const commandWhitelistService = new CommandWhitelistService(
      config.commandWhitelist,
    );

    // Initialize streaming execution manager
    const streamingManager = new StreamingExecutionManager(config.streaming);
    console.warn("Streaming execution manager initialized successfully");
    console.warn(`- Buffer interval: ${String(config.streaming.bufferMs)}ms`);
    console.warn(
      `- Max output size: ${String(config.streaming.maxOutputSize)} bytes`,
    );
    console.warn(
      `- Max line length: ${String(config.streaming.maxLineLength)} characters`,
    );

    // Initialize execution queue
    const executionQueue = new ExecutionQueue(
      config.executionQueue.concurrentLimit,
      config.executionQueue.maxQueueSize,
    );
    console.warn("Execution queue initialized successfully");
    console.warn(
      `- Concurrent execution limit: ${String(config.executionQueue.concurrentLimit)}`,
    );
    console.warn(
      `- Maximum queue size: ${String(config.executionQueue.maxQueueSize)}`,
    );

    // Initialize integration manager
    console.warn("Initializing integration manager...");
    const integrationManager = new IntegrationManager();

    // Initialize Bolt integration only if configured
    let boltPlugin: BoltPlugin | undefined;
    const boltProjectPath = config.boltProjectPath;

    // Check if Bolt is properly configured by looking for project files
    let boltConfigured = false;
    if (boltProjectPath && boltProjectPath !== '.') {
      const { existsSync } = await import("fs");
      const { join } = await import("path");

      const inventoryYaml = join(boltProjectPath, "inventory.yaml");
      const inventoryYml = join(boltProjectPath, "inventory.yml");
      const boltProjectYaml = join(boltProjectPath, "bolt-project.yaml");
      const boltProjectYml = join(boltProjectPath, "bolt-project.yml");

      const hasInventory = existsSync(inventoryYaml) || existsSync(inventoryYml);
      const hasBoltProject = existsSync(boltProjectYaml) || existsSync(boltProjectYml);

      boltConfigured = hasInventory || hasBoltProject;
    }

    console.warn("=== Bolt Integration Setup ===");
    console.warn(`Bolt configured: ${String(boltConfigured)}`);
    console.warn(`Bolt project path: ${boltProjectPath || 'not set'}`);

    if (boltConfigured) {
      console.warn("Registering Bolt integration...");
      try {
        boltPlugin = new BoltPlugin(boltService);
        const boltConfig: IntegrationConfig = {
          enabled: true,
          name: "bolt",
          type: "both",
          config: {
            projectPath: config.boltProjectPath,
          },
          priority: 5, // Lower priority than PuppetDB
        };
        integrationManager.registerPlugin(boltPlugin, boltConfig);
        console.warn("Bolt integration registered successfully");
        console.warn(`- Project Path: ${config.boltProjectPath}`);
      } catch (error) {
        console.warn(
          `WARNING: Failed to initialize Bolt integration: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        boltPlugin = undefined;
      }
    } else {
      console.warn(
        "Bolt integration not configured - skipping registration",
      );
      console.warn("Set BOLT_PROJECT_PATH to a valid project directory to enable Bolt integration");
    }

    // Initialize PuppetDB integration only if configured
    let puppetDBService: PuppetDBService | undefined;
    const puppetDBConfig = config.integrations.puppetdb;
    const puppetDBConfigured = !!puppetDBConfig?.serverUrl;

    if (puppetDBConfigured) {
      console.warn("Initializing PuppetDB integration...");
      try {
        puppetDBService = new PuppetDBService();
        const integrationConfig: IntegrationConfig = {
          enabled: puppetDBConfig.enabled,
          name: "puppetdb",
          type: "information",
          config: puppetDBConfig,
          priority: 10, // Higher priority than Bolt
        };

        integrationManager.registerPlugin(puppetDBService, integrationConfig);

        console.warn("PuppetDB integration registered and enabled");
        console.warn(`- Server URL: ${puppetDBConfig.serverUrl}`);
        console.warn(
          `- SSL enabled: ${String(puppetDBConfig.ssl?.enabled ?? false)}`,
        );
        console.warn(
          `- Authentication: ${puppetDBConfig.token ? "configured" : "not configured"}`,
        );
      } catch (error) {
        console.warn(
          `WARNING: Failed to initialize PuppetDB integration: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        puppetDBService = undefined;
      }
    } else {
      console.warn(
        "PuppetDB integration not configured - skipping registration",
      );
    }

    // Initialize Puppetserver integration only if configured
    let puppetserverService: PuppetserverService | undefined;
    const puppetserverConfig = config.integrations.puppetserver;
    const puppetserverConfigured = !!puppetserverConfig?.serverUrl;

    console.warn("=== Puppetserver Integration Setup ===");
    console.warn(`Puppetserver configured: ${String(puppetserverConfigured)}`);
    console.warn(
      `Puppetserver config: ${JSON.stringify(puppetserverConfig, null, 2)}`,
    );

    if (puppetserverConfigured) {
      console.warn("Initializing Puppetserver integration...");
      try {
        puppetserverService = new PuppetserverService();
        console.warn("PuppetserverService instance created");

        const integrationConfig: IntegrationConfig = {
          enabled: puppetserverConfig.enabled,
          name: "puppetserver",
          type: "information",
          config: puppetserverConfig,
          priority: 8, // Lower priority than PuppetDB (10), higher than Bolt (5)
        };

        console.warn(
          `Registering Puppetserver plugin with config: ${JSON.stringify(integrationConfig, null, 2)}`,
        );
        integrationManager.registerPlugin(
          puppetserverService,
          integrationConfig,
        );

        console.warn("Puppetserver integration registered successfully");
        console.warn(`- Enabled: ${String(puppetserverConfig.enabled)}`);
        console.warn(`- Server URL: ${puppetserverConfig.serverUrl}`);
        console.warn(`- Port: ${String(puppetserverConfig.port)}`);
        console.warn(
          `- SSL enabled: ${String(puppetserverConfig.ssl?.enabled ?? false)}`,
        );
        console.warn(
          `- Authentication: ${puppetserverConfig.token ? "token configured" : "no token"}`,
        );
        console.warn(`- Priority: 8`);
      } catch (error) {
        console.warn(
          `WARNING: Failed to initialize Puppetserver integration: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        if (error instanceof Error && error.stack) {
          console.warn(error.stack);
        }
        puppetserverService = undefined;
      }
    } else {
      console.warn(
        "Puppetserver integration not configured - skipping registration",
      );
    }
    console.warn("=== End Puppetserver Integration Setup ===");

    // Initialize all registered plugins
    console.warn("=== Initializing All Integration Plugins ===");
    console.warn(
      `Total plugins registered: ${String(integrationManager.getPluginCount())}`,
    );

    // Log all registered plugins before initialization
    const allPlugins = integrationManager.getAllPlugins();
    console.warn("Registered plugins:");
    for (const registration of allPlugins) {
      console.warn(
        `  - ${registration.plugin.name} (${registration.plugin.type})`,
      );
      console.warn(`    Enabled: ${String(registration.config.enabled)}`);
      console.warn(`    Priority: ${String(registration.config.priority)}`);
    }

    const initErrors = await integrationManager.initializePlugins();

    if (initErrors.length > 0) {
      console.warn(
        `Integration initialization completed with ${String(initErrors.length)} error(s):`,
      );
      for (const { plugin, error } of initErrors) {
        console.warn(`  - ${plugin}: ${error.message}`);
        if (error.stack) {
          console.warn(error.stack);
        }
      }
    } else {
      console.warn("All integrations initialized successfully");
    }

    // Log information sources after initialization
    console.warn("Information sources after initialization:");
    const infoSources = integrationManager.getAllInformationSources();
    for (const source of infoSources) {
      console.warn(
        `  - ${source.name}: initialized=${String(source.isInitialized())}`,
      );
    }

    console.warn("Integration manager initialized successfully");
    console.warn("=== End Integration Plugin Initialization ===");

    // Make integration manager available globally for cross-service access
    (global as any).integrationManager = integrationManager;

    // Start health check scheduler for integrations
    if (integrationManager.getPluginCount() > 0) {
      integrationManager.startHealthCheckScheduler();
      console.warn("Integration health check scheduler started");
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

    // Request logging middleware
    app.use((req: Request, res: Response, next) => {
      const timestamp = new Date().toISOString();
      const startTime = Date.now();

      console.warn(
        `[${timestamp}] [${req.id ?? "unknown"}] ${req.method} ${req.path}`,
      );

      // Log response when finished
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        console.warn(
          `[${timestamp}] [${req.id ?? "unknown"}] ${req.method} ${req.path} - ${String(res.statusCode)} (${String(duration)}ms)`,
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
    app.use(
      "/api/inventory",
      createInventoryRouter(boltService, integrationManager),
    );
    app.use(
      "/api/nodes",
      createInventoryRouter(boltService, integrationManager),
    );
    app.use("/api/nodes", createFactsRouter(integrationManager));
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
      createTasksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
      ),
    );
    app.use(
      "/api/nodes",
      createPuppetRouter(boltService, executionRepository, streamingManager),
    );
    app.use(
      "/api",
      createPackagesRouter(
        boltService,
        executionRepository,
        config.packageTasks,
        streamingManager,
      ),
    );
    app.use(
      "/api/nodes",
      createPackagesRouter(
        boltService,
        executionRepository,
        config.packageTasks,
        streamingManager,
      ),
    );
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
        puppetDBService,
        puppetserverService,
      ),
    );

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
      console.warn(
        `Backend server running on ${config.host}:${String(config.port)}`,
      );
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.warn("SIGTERM received, shutting down gracefully...");
      streamingManager.cleanup();
      integrationManager.stopHealthCheckScheduler();
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
