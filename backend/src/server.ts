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
import { createPuppetHistoryRouter } from "./routes/puppetHistory";
import { createPackagesRouter } from "./routes/packages";
import { createStreamingRouter } from "./routes/streaming";
import { createIntegrationsRouter } from "./routes/integrations";
import { createHieraRouter } from "./routes/hiera";
import { createDebugRouter } from "./routes/debug";
import configRouter from "./routes/config";
import { StreamingExecutionManager } from "./services/StreamingExecutionManager";
import { ExecutionQueue } from "./services/ExecutionQueue";
import { errorHandler, requestIdMiddleware } from "./middleware/errorHandler";
import { expertModeMiddleware } from "./middleware/expertMode";
import { IntegrationManager } from "./integrations/IntegrationManager";
import { PuppetDBService } from "./integrations/puppetdb/PuppetDBService";
import { PuppetserverService } from "./integrations/puppetserver/PuppetserverService";
import { HieraPlugin } from "./integrations/hiera/HieraPlugin";
import { BoltPlugin } from "./integrations/bolt/BoltPlugin";
import type { IntegrationConfig } from "./integrations/types";
import { LoggerService } from "./services/LoggerService";
import { PerformanceMonitorService } from "./services/PerformanceMonitorService";
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

    // Validate Bolt configuration (non-blocking)
    logger.info("Validating Bolt configuration...", {
      component: "Server",
      operation: "startServer",
    });
    const boltValidator = new BoltValidator(config.boltProjectPath);
    try {
      boltValidator.validate();
      logger.info("Bolt configuration validated successfully", {
        component: "Server",
        operation: "startServer",
      });
    } catch (error) {
      if (error instanceof BoltValidationError) {
        logger.warn(`Bolt validation failed: ${error.message}`, {
          component: "Server",
          operation: "startServer",
          metadata: {
            details: error.details,
            missingFiles: error.missingFiles,
          },
        });
        logger.warn("Server will continue to start, but Bolt operations may be limited", {
          component: "Server",
          operation: "startServer",
        });
      } else {
        logger.warn(`Unexpected error during Bolt validation: ${String(error)}`, {
          component: "Server",
          operation: "startServer",
        });
        logger.warn("Server will continue to start, but Bolt operations may be limited", {
          component: "Server",
          operation: "startServer",
        });
      }
    }

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

    // Initialize Bolt service
    logger.info("Initializing Bolt service...", {
      component: "Server",
      operation: "startServer",
    });
    const boltService = new BoltService(
      config.boltProjectPath,
      config.executionTimeout,
      config.cache,
    );
    logger.info("Bolt service initialized successfully", {
      component: "Server",
      operation: "startServer",
    });

    // Defer package task validation to avoid blocking startup
    // Validation will occur on-demand when package operations are requested
    void (async (): Promise<void> => {
      try {
        const tasks = await boltService.listTasks();
        for (const packageTask of config.packageTasks) {
          const task = tasks.find((t) => t.name === packageTask.name);
          if (task) {
            logger.info(`✓ Package task '${packageTask.name}' (${packageTask.label}) is available`, {
              component: "Server",
              operation: "validatePackageTasks",
            });
          } else {
            logger.warn(`✗ WARNING: Package task '${packageTask.name}' (${packageTask.label}) not found`, {
              component: "Server",
              operation: "validatePackageTasks",
            });
          }
        }
      } catch (error) {
        logger.warn(`WARNING: Could not validate package installation tasks: ${error instanceof Error ? error.message : "Unknown error"}`, {
          component: "Server",
          operation: "validatePackageTasks",
        });
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

    // Create shared PerformanceMonitorService instance for all plugins
    const performanceMonitor = new PerformanceMonitorService();
    logger.info("PerformanceMonitorService initialized", {
      component: "Server",
      operation: "startServer",
    });

    const integrationManager = new IntegrationManager({ logger });

    // Initialize Bolt integration only if configured
    let boltPlugin: BoltPlugin | undefined;
    const boltProjectPath = config.boltProjectPath;

    // Check if Bolt is properly configured by looking for project files
    let boltConfigured = false;
    if (boltProjectPath && boltProjectPath !== '.') {
      const fs = await import("fs");
      const path = await import("path");

      const inventoryYaml = path.join(boltProjectPath, "inventory.yaml");
      const inventoryYml = path.join(boltProjectPath, "inventory.yml");
      const boltProjectYaml = path.join(boltProjectPath, "bolt-project.yaml");
      const boltProjectYml = path.join(boltProjectPath, "bolt-project.yml");

      const hasInventory = fs.existsSync(inventoryYaml) || fs.existsSync(inventoryYml);
      const hasBoltProject = fs.existsSync(boltProjectYaml) || fs.existsSync(boltProjectYml);

      boltConfigured = hasInventory || hasBoltProject;
    }

    logger.info("=== Bolt Integration Setup ===", {
      component: "Server",
      operation: "initializeBolt",
      metadata: {
        configured: boltConfigured,
        projectPath: boltProjectPath || 'not set',
      },
    });

    if (boltConfigured) {
      logger.info("Registering Bolt integration...", {
        component: "Server",
        operation: "initializeBolt",
      });
      try {
        boltPlugin = new BoltPlugin(boltService, logger, performanceMonitor);
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
        logger.info("Bolt integration registered successfully", {
          component: "Server",
          operation: "initializeBolt",
          metadata: { projectPath: config.boltProjectPath },
        });
      } catch (error) {
        logger.warn(`WARNING: Failed to initialize Bolt integration: ${error instanceof Error ? error.message : "Unknown error"}`, {
          component: "Server",
          operation: "initializeBolt",
        });
        boltPlugin = undefined;
      }
    } else {
      logger.warn("Bolt integration not configured - skipping registration", {
        component: "Server",
        operation: "initializeBolt",
      });
      logger.info("Set BOLT_PROJECT_PATH to a valid project directory to enable Bolt integration", {
        component: "Server",
        operation: "initializeBolt",
      });
    }

    // Initialize PuppetDB integration only if configured
    let puppetDBService: PuppetDBService | undefined;
    const puppetDBConfig = config.integrations.puppetdb;
    const puppetDBConfigured = !!puppetDBConfig?.serverUrl;

    if (puppetDBConfigured) {
      logger.info("Initializing PuppetDB integration...", {
        component: "Server",
        operation: "initializePuppetDB",
      });
      try {
        puppetDBService = new PuppetDBService(logger, performanceMonitor);
        const integrationConfig: IntegrationConfig = {
          enabled: puppetDBConfig.enabled,
          name: "puppetdb",
          type: "information",
          config: puppetDBConfig,
          priority: 10, // Higher priority than Bolt
        };

        integrationManager.registerPlugin(puppetDBService, integrationConfig);

        logger.info("PuppetDB integration registered and enabled", {
          component: "Server",
          operation: "initializePuppetDB",
          metadata: {
            serverUrl: puppetDBConfig.serverUrl,
            sslEnabled: puppetDBConfig.ssl?.enabled ?? false,
            hasAuthentication: !!puppetDBConfig.token,
          },
        });
      } catch (error) {
        logger.warn(`WARNING: Failed to initialize PuppetDB integration: ${error instanceof Error ? error.message : "Unknown error"}`, {
          component: "Server",
          operation: "initializePuppetDB",
        });
        puppetDBService = undefined;
      }
    } else {
      logger.warn("PuppetDB integration not configured - skipping registration", {
        component: "Server",
        operation: "initializePuppetDB",
      });
    }

    // Initialize Puppetserver integration only if configured
    let puppetserverService: PuppetserverService | undefined;
    const puppetserverConfig = config.integrations.puppetserver;
    const puppetserverConfigured = !!puppetserverConfig?.serverUrl;

    logger.debug("=== Puppetserver Integration Setup ===", {
      component: "Server",
      operation: "initializePuppetserver",
      metadata: {
        configured: puppetserverConfigured,
        config: puppetserverConfig,
      },
    });

    if (puppetserverConfigured) {
      logger.info("Initializing Puppetserver integration...", {
        component: "Server",
        operation: "initializePuppetserver",
      });
      try {
        puppetserverService = new PuppetserverService(logger, performanceMonitor);
        logger.debug("PuppetserverService instance created", {
          component: "Server",
          operation: "initializePuppetserver",
        });

        const integrationConfig: IntegrationConfig = {
          enabled: puppetserverConfig.enabled,
          name: "puppetserver",
          type: "information",
          config: puppetserverConfig,
          priority: 8, // Lower priority than PuppetDB (10), higher than Bolt (5)
        };

        logger.debug("Registering Puppetserver plugin", {
          component: "Server",
          operation: "initializePuppetserver",
          metadata: { config: integrationConfig },
        });
        integrationManager.registerPlugin(
          puppetserverService,
          integrationConfig,
        );

        logger.info("Puppetserver integration registered successfully", {
          component: "Server",
          operation: "initializePuppetserver",
          metadata: {
            enabled: puppetserverConfig.enabled,
            serverUrl: puppetserverConfig.serverUrl,
            port: puppetserverConfig.port,
            sslEnabled: puppetserverConfig.ssl?.enabled ?? false,
            hasAuthentication: !!puppetserverConfig.token,
            priority: 8,
          },
        });
      } catch (error) {
        logger.warn(`WARNING: Failed to initialize Puppetserver integration: ${error instanceof Error ? error.message : "Unknown error"}`, {
          component: "Server",
          operation: "initializePuppetserver",
        });
        if (error instanceof Error && error.stack) {
          logger.error("Puppetserver initialization error stack", {
            component: "Server",
            operation: "initializePuppetserver",
          }, error);
        }
        puppetserverService = undefined;
      }
    } else {
      logger.warn("Puppetserver integration not configured - skipping registration", {
        component: "Server",
        operation: "initializePuppetserver",
      });
    }
    logger.debug("=== End Puppetserver Integration Setup ===", {
      component: "Server",
      operation: "initializePuppetserver",
    });

    // Initialize Hiera integration only if configured
    let hieraPlugin: HieraPlugin | undefined;
    const hieraConfig = config.integrations.hiera;
    const hieraConfigured = !!hieraConfig?.controlRepoPath;

    logger.debug("=== Hiera Integration Setup ===", {
      component: "Server",
      operation: "initializeHiera",
      metadata: {
        configured: hieraConfigured,
        config: hieraConfig,
      },
    });

    if (hieraConfigured) {
      logger.info("Initializing Hiera integration...", {
        component: "Server",
        operation: "initializeHiera",
      });
      try {
        hieraPlugin = new HieraPlugin(logger, performanceMonitor);
        hieraPlugin.setIntegrationManager(integrationManager);
        logger.debug("HieraPlugin instance created", {
          component: "Server",
          operation: "initializeHiera",
        });

        const integrationConfig: IntegrationConfig = {
          enabled: hieraConfig.enabled,
          name: "hiera",
          type: "information",
          config: hieraConfig,
          priority: 6, // Lower priority than Puppetserver (8), higher than Bolt (5)
        };

        logger.debug("Registering Hiera plugin", {
          component: "Server",
          operation: "initializeHiera",
          metadata: { config: integrationConfig },
        });
        integrationManager.registerPlugin(
          hieraPlugin,
          integrationConfig,
        );

        logger.info("Hiera integration registered successfully", {
          component: "Server",
          operation: "initializeHiera",
          metadata: {
            enabled: hieraConfig.enabled,
            controlRepoPath: hieraConfig.controlRepoPath,
            hieraConfigPath: hieraConfig.hieraConfigPath,
            priority: 6,
          },
        });
      } catch (error) {
        logger.warn(`WARNING: Failed to initialize Hiera integration: ${error instanceof Error ? error.message : "Unknown error"}`, {
          component: "Server",
          operation: "initializeHiera",
        });
        if (error instanceof Error && error.stack) {
          logger.error("Hiera initialization error stack", {
            component: "Server",
            operation: "initializeHiera",
          }, error);
        }
        hieraPlugin = undefined;
      }
    } else {
      logger.warn("Hiera integration not configured - skipping registration", {
        component: "Server",
        operation: "initializeHiera",
      });
      logger.info("Set HIERA_CONTROL_REPO_PATH to a valid control repository to enable Hiera integration", {
        component: "Server",
        operation: "initializeHiera",
      });
    }
    logger.debug("=== End Hiera Integration Setup ===", {
      component: "Server",
      operation: "initializeHiera",
    });

    // Initialize all registered plugins
    logger.info("=== Initializing All Integration Plugins ===", {
      component: "Server",
      operation: "initializePlugins",
      metadata: {
        totalPlugins: integrationManager.getPluginCount(),
      },
    });

    // Log all registered plugins before initialization
    const allPlugins = integrationManager.getAllPlugins();
    logger.info("Registered plugins:", {
      component: "Server",
      operation: "initializePlugins",
    });
    for (const registration of allPlugins) {
      logger.info(`  - ${registration.plugin.name} (${registration.plugin.type})`, {
        component: "Server",
        operation: "initializePlugins",
        metadata: {
          enabled: registration.config.enabled,
          priority: registration.config.priority,
        },
      });
    }

    const initErrors = await integrationManager.initializePlugins();

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

    // Log information sources after initialization
    logger.info("Information sources after initialization:", {
      component: "Server",
      operation: "initializePlugins",
    });
    const infoSources = integrationManager.getAllInformationSources();
    for (const source of infoSources) {
      logger.info(`  - ${source.name}: initialized=${String(source.isInitialized())}`, {
        component: "Server",
        operation: "initializePlugins",
      });
    }

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

    // Initialize PuppetRunHistoryService if PuppetDB is available
    let puppetRunHistoryService: PuppetRunHistoryService | undefined;
    if (puppetDBService) {
      puppetRunHistoryService = new PuppetRunHistoryService(puppetDBService, logger);
      logger.info("PuppetRunHistoryService initialized successfully", {
        component: "Server",
        operation: "startServer",
      });
    }

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
    // Add puppet history routes if PuppetDB is available
    if (puppetRunHistoryService) {
      app.use(
        "/api/puppet",
        createPuppetHistoryRouter(puppetRunHistoryService),
      );
    }
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
    app.use(
      "/api/integrations/hiera",
      createHieraRouter(integrationManager),
    );
    app.use(
      "/api/debug",
      createDebugRouter(),
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
