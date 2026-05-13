import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { ConfigService } from "./config/ConfigService";
import { DatabaseService } from "./database/DatabaseService";
import { BoltValidator, BoltValidationError } from "./validation/BoltValidator";
import { BoltService } from "./integrations/bolt/BoltService";
import { ExecutionRepository } from "./database/ExecutionRepository";
import { CommandWhitelistService } from "./validation/CommandWhitelistService";
import { createInventoryRouter } from "./routes/inventory";
import { createFactsRouter } from "./routes/facts";
import { createCommandsRouter } from "./routes/commands";
import { createTasksRouter } from "./routes/tasks";
import { createPlaybooksRouter } from "./routes/playbooks";
import { createExecutionsRouter } from "./routes/executions";
import { createPuppetRouter } from "./routes/puppet";
import { createPuppetHistoryRouter } from "./routes/puppetHistory";
import { createPackagesRouter } from "./routes/packages";
import { createStreamingRouter, streamAuthMiddleware } from "./routes/streaming";
import { createIntegrationsRouter } from "./routes/integrations";
import { createHieraRouter } from "./routes/hiera";
import { createDebugRouter } from "./routes/debug";
import configRouter from "./routes/config";
import { asyncHandler } from "./routes/asyncHandler";
import { createAuthRouter } from "./routes/auth";
import { createSetupRouter } from "./routes/setup";
import { createUsersRouter } from "./routes/users";
import { createGroupsRouter } from "./routes/groups";
import { createRolesRouter } from "./routes/roles";
import { createPermissionsRouter } from "./routes/permissions";
import { createJournalRouter } from "./routes/journal";
import { createAWSRouter } from "./routes/integrations/aws";
import { createAzureRouter } from "./routes/integrations/azure";
import type { AWSPlugin } from "./integrations/aws/AWSPlugin";
import type { AzurePlugin } from "./integrations/azure/AzurePlugin";
import monitoringRouter from "./routes/monitoring";
import { StreamingExecutionManager } from "./services/StreamingExecutionManager";
import { ExecutionQueue } from "./services/ExecutionQueue";
import { BatchExecutionService } from "./services/BatchExecutionService";
import { errorHandler, requestIdMiddleware } from "./middleware/errorHandler";
import { expertModeMiddleware } from "./middleware/expertMode";
import { createAuthMiddleware } from "./middleware/authMiddleware";
import { createRbacMiddleware } from "./middleware/rbacMiddleware";
import {
  helmetMiddleware,
  createRateLimitMiddleware,
  createAuthRateLimitMiddleware,
  inputSanitizationMiddleware,
  additionalSecurityHeaders,
} from "./middleware/securityMiddleware";
import { IntegrationManager } from "./integrations/IntegrationManager";
import type { PuppetDBService } from "./integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "./integrations/puppetserver/PuppetserverService";
import type { HieraPlugin } from "./integrations/hiera/HieraPlugin";
import type { ProxmoxIntegration } from "./integrations/proxmox/ProxmoxIntegration";
import { pluginRegistry } from "./plugins/registry";
import { LoggerService } from "./services/LoggerService";
import { ExpertModeService } from "./services/ExpertModeService";
import { PerformanceMonitorService } from "./services/PerformanceMonitorService";
import { DIContainer } from "./container/DIContainer";
import { PuppetRunHistoryService } from "./services/PuppetRunHistoryService";
import { JournalService } from "./services/journal/JournalService";
import { AuthenticationService } from "./services/AuthenticationService";
import { UserService } from "./services/UserService";
import { RoleService } from "./services/RoleService";
import { PermissionService } from "./services/PermissionService";
import { provisionMcpServiceUser } from "./mcp/McpServiceUser";
import { createMcpServer } from "./mcp/McpServer";

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

    // Initialize DI container with shared service instances
    const container = new DIContainer();
    container.register("config", configService);
    container.register("logger", logger);
    container.register("expertMode", new ExpertModeService());

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
      databaseService.getAdapter(),
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

    // Initialize batch execution service
    // Note: This will be fully functional once all integrations are registered
    const batchExecutionService = new BatchExecutionService(
      databaseService.getAdapter(),
      executionQueue,
      executionRepository,
      integrationManager,
    );
    logger.info("Batch execution service initialized successfully", {
      component: "Server",
      operation: "startServer",
    });

    // Register all integration plugins via declarative registry
    logger.info("=== Plugin Registry Initialisation ===", {
      component: "Server",
      operation: "initializePlugins",
    });

    for (const entry of pluginRegistry) {
      const entryConfig = entry.resolveConfig(configService);
      if (!entryConfig) {
        logger.warn(`${entry.name} integration not configured — skipping`, {
          component: "Server",
          operation: "initializePlugins",
        });
        continue;
      }
      try {
        const plugin = await entry.create({
          configService,
          logger,
          performanceMonitor,
          integrationManager,
          boltService,
        });
        integrationManager.registerPlugin(plugin, {
          enabled: true,
          name: entry.name,
          type: entry.type,
          config: entryConfig,
          priority: entry.priority,
        });
        logger.info(`${entry.name} integration registered`, {
          component: "Server",
          operation: "initializePlugins",
        });
      } catch (err) {
        logger.warn(`${entry.name} integration failed to initialise: ${(err as Error).message}`, {
          component: "Server",
          operation: "initializePlugins",
        });
      }
    }

    logger.info("=== End Plugin Registry Initialisation ===", {
      component: "Server",
      operation: "initializePlugins",
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

    // Create shared JournalService and wire it to plugins
    const journalService = new JournalService(databaseService.getAdapter());
    const proxmoxPlugin = integrationManager.getExecutionTool("proxmox") as ProxmoxIntegration | null;
    if (proxmoxPlugin) {
      proxmoxPlugin.setJournalService(journalService);
      logger.info("JournalService wired to ProxmoxIntegration", {
        component: "Server",
        operation: "wireJournalService",
      });
    }
    const awsPlugin = integrationManager.getExecutionTool("aws") as AWSPlugin | null;
    if (awsPlugin) {
      awsPlugin.setJournalService(journalService);
      logger.info("JournalService wired to AWSPlugin", {
        component: "Server",
        operation: "wireJournalService",
      });
    }
    const azurePlugin = integrationManager.getExecutionTool("azure") as AzurePlugin | null;
    if (azurePlugin) {
      azurePlugin.setJournalService(journalService);
      logger.info("JournalService wired to AzurePlugin", {
        component: "Server",
        operation: "wireJournalService",
      });
    }

    // Retrieve specific plugin instances needed by downstream consumers
    const puppetDBService = (integrationManager.getInformationSource("puppetdb") ?? undefined) as PuppetDBService | undefined;
    const puppetserverService = (integrationManager.getInformationSource("puppetserver") ?? undefined) as PuppetserverService | undefined;
    const hieraPlugin = (integrationManager.getInformationSource("hiera") ?? undefined) as HieraPlugin | undefined;

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

    // Security middleware - must be first
    app.use(helmetMiddleware);
    app.use(additionalSecurityHeaders);

    // Middleware
    app.use(
      cors({
        origin: config.corsAllowedOrigins,
        credentials: true,
      }),
    );
    app.use(express.json({ limit: '100kb' }));

    // Input sanitization - after body parsing
    app.use(inputSanitizationMiddleware);

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
        version: "1.0.0",
      });
    });

    // Setup routes (no authentication required - only accessible when setup is incomplete)
    app.use("/api/setup", createSetupRouter(databaseService, container));

    // Authentication routes with stricter rate limiting
    const authRateLimitMiddleware = createAuthRateLimitMiddleware();
    app.use("/api/auth", authRateLimitMiddleware, createAuthRouter(databaseService, container));

    // Create authentication and RBAC middleware instances
    // Wrap async middleware with asyncHandler to satisfy Express's void return expectation
    const authMiddleware = asyncHandler(createAuthMiddleware(databaseService.getAdapter()));
    const rawRbacMiddleware = createRbacMiddleware(databaseService.getAdapter());
    const rbacMiddleware = (resource: string, action: string): express.RequestHandler =>
      asyncHandler(rawRbacMiddleware(resource, action));

    // Create rate limiting middleware for authenticated routes
    const rateLimitMiddleware = createRateLimitMiddleware();

    // Configuration endpoint (security-sensitive — requires authentication)
    app.get("/api/config", authMiddleware, (_req: Request, res: Response) => {
      res.json({
        commandWhitelist: {
          allowAll: config.commandWhitelist.allowAll,
          matchMode: config.commandWhitelist.matchMode,
          whitelist: config.commandWhitelist.whitelist,
        },
        executionTimeout: config.executionTimeout,
      });
    });

    // Config routes (UI settings — requires authentication)
    app.use("/api/config", authMiddleware, configRouter);

    // User management routes
    app.use("/api/users", authMiddleware, rateLimitMiddleware, createUsersRouter(databaseService, container));

    // Group management routes
    app.use("/api/groups", authMiddleware, rateLimitMiddleware, createGroupsRouter(databaseService, container));

    // Role management routes
    app.use("/api/roles", authMiddleware, rateLimitMiddleware, createRolesRouter(databaseService, container));

    // Permission management routes
    app.use("/api/permissions", authMiddleware, rateLimitMiddleware, createPermissionsRouter(databaseService, container));

    // Journal routes
    app.use("/api/journal", authMiddleware, rateLimitMiddleware, createJournalRouter(databaseService, {
      puppetdb: puppetDBService,
      integrationManager,
    }, container));

    // Monitoring routes (performance metrics)
    app.use("/api/monitoring", authMiddleware, rateLimitMiddleware, monitoringRouter);

    // API Routes - Inventory routes (protected with RBAC)
    app.use(
      "/api/inventory",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('ansible', 'read'),
      createInventoryRouter(boltService, integrationManager, {
        allowDestructiveActions: config.provisioning.allowDestructiveActions,
      }, container),
    );
    app.use(
      "/api/nodes",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'read'),
      createFactsRouter(integrationManager, container),
    );
    app.use(
      "/api/nodes",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'execute'),
      createCommandsRouter(
        integrationManager,
        executionRepository,
        commandWhitelistService,
        streamingManager,
        container,
      ),
    );
    app.use(
      "/api/nodes",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'execute'),
      createTasksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
        container,
      ),
    );
    app.use(
      "/api/nodes",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('ansible', 'execute'),
      createPlaybooksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
        container,
      ),
    );
    app.use(
      "/api/nodes",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'execute'),
      createPuppetRouter(integrationManager, executionRepository, journalService, streamingManager, container),
    );
    // Multi-node puppet run endpoint (global action)
    app.use(
      "/api/puppet-run",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'execute'),
      createPuppetRouter(integrationManager, executionRepository, journalService, streamingManager, container),
    );
    // Add puppet history routes if PuppetDB is available
    if (puppetRunHistoryService) {
      app.use(
        "/api/puppet",
        authMiddleware,
        rateLimitMiddleware,
        createPuppetHistoryRouter(puppetRunHistoryService, container),
      );
    }
    app.use(
      "/api/packages",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'read'),
      createPackagesRouter(
        integrationManager,
        boltService,
        executionRepository,
        config.packageTasks,
        streamingManager,
        container,
      ),
    );
    app.use(
      "/api/tasks",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware('bolt', 'read'),
      createTasksRouter(
        integrationManager,
        executionRepository,
        streamingManager,
        container,
      ),
    );
    app.use(
      "/api/executions",
      authMiddleware,
      rateLimitMiddleware,
      createExecutionsRouter(executionRepository, executionQueue, batchExecutionService, container),
    );
    app.use(
      "/api/executions",
      streamAuthMiddleware, // resolve ?ticket= / ?token= before auth check
      authMiddleware,
      rateLimitMiddleware,
      createStreamingRouter(streamingManager, executionRepository, container),
    );
    app.use(
      "/api/streaming",
      streamAuthMiddleware, // resolve ?ticket= / ?token= before auth check
      authMiddleware,
      rateLimitMiddleware,
      createStreamingRouter(streamingManager, executionRepository, container),
    );
    app.use(
      "/api/integrations",
      authMiddleware,
      rateLimitMiddleware,
      createIntegrationsRouter(
        integrationManager,
        puppetDBService,
        puppetserverService,
        databaseService.getAdapter(),
        configService.getJwtSecret(),
        { allowDestructiveProvisioning: config.provisioning.allowDestructiveActions },
        container,
      ),
    );
    app.use(
      "/api/integrations/hiera",
      authMiddleware,
      rateLimitMiddleware,
      createHieraRouter(integrationManager, container),
    );

    // AWS integration routes (conditional on plugin availability)
    const awsPluginInstance = integrationManager.getExecutionTool("aws") as AWSPlugin | null;
    if (awsPluginInstance) {
      app.use(
        "/api/integrations/aws",
        authMiddleware,
        rateLimitMiddleware,
        createAWSRouter(awsPluginInstance, integrationManager, {
          allowDestructiveActions: config.provisioning.allowDestructiveActions,
        }, container),
      );
    }

    // Azure integration routes (conditional on plugin availability)
    const azurePluginInstance = integrationManager.getExecutionTool("azure") as AzurePlugin | null;
    if (azurePluginInstance) {
      app.use(
        "/api/integrations/azure",
        authMiddleware,
        rateLimitMiddleware,
        createAzureRouter(azurePluginInstance, integrationManager, {
          allowDestructiveActions: config.provisioning.allowDestructiveActions,
        }, container),
      );
    }

    app.use(
      "/api/debug",
      authMiddleware,
      rateLimitMiddleware,
      rbacMiddleware("debug", "admin"),
      createDebugRouter(container),
    );

    // Conditionally initialize MCP server
    if (configService.isMcpEnabled()) {
      logger.info("MCP server enabled, initializing...", {
        component: "Server",
        operation: "initializeMcp",
      });

      try {
        const authService = new AuthenticationService(databaseService.getAdapter());
        const userService = new UserService(databaseService.getAdapter(), authService);
        const roleService = new RoleService(databaseService.getAdapter());
        const permissionService = new PermissionService(databaseService.getAdapter());

        const { userId: mcpUserId } = await provisionMcpServiceUser(
          userService, roleService, permissionService, logger,
        );

        // Read version from package.json using require() for CJS compatibility
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkgJson = require("../package.json") as { version?: string };
        const version = pkgJson.version ?? "1.0.0";

        // MCP SDK uses package.json "exports" which requires moduleResolution >= node16.
        // The backend uses moduleResolution: "node", so we use require() for runtime compat.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js") as typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { randomUUID } = require("node:crypto") as { randomUUID: () => string };

        // Session-based transport registry for Streamable HTTP protocol.
        // Limited to MCP_MAX_SESSIONS active sessions; stale sessions are evicted
        // after MCP_SESSION_TTL_MS to prevent unbounded memory growth.
        const MCP_MAX_SESSIONS = 100;
        const MCP_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

        interface McpSessionEntry {
          transport: InstanceType<typeof StreamableHTTPServerTransport>;
          createdAt: number;
        }

        const mcpSessions = new Map<string, McpSessionEntry>();

        function evictExpiredMcpSessions(): void {
          const now = Date.now();
          for (const [id, session] of mcpSessions) {
            if (now - session.createdAt > MCP_SESSION_TTL_MS) {
              mcpSessions.delete(id);
              session.transport.close();
            }
          }
        }

        // Dependencies captured for creating per-session MCP server instances
        const mcpDeps = {
          integrationManager, executionRepository, journalService,
          permissionService, hieraPlugin, puppetDBService,
          puppetRunHistoryService, mcpUserId, logger, version,
        };

        app.post("/mcp", asyncHandler(async (req: Request, res: Response) => {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          let transport: InstanceType<typeof StreamableHTTPServerTransport> | undefined;

          if (sessionId && mcpSessions.has(sessionId)) {
            transport = mcpSessions.get(sessionId)?.transport;
          } else if (!sessionId) {
            // Evict stale sessions and enforce session limit before creating a new one
            evictExpiredMcpSessions();
            if (mcpSessions.size >= MCP_MAX_SESSIONS) {
              res.status(503).json({ error: "Maximum MCP session limit reached" });
              return;
            }
            // New session — create transport + server per session
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: (): string => randomUUID(),
              onsessioninitialized: (id: string): void => {
                mcpSessions.set(id, { transport: transport!, createdAt: Date.now() });
                transport!.onclose = (): void => { mcpSessions.delete(id); };
              },
            });
            const sessionServer = createMcpServer(mcpDeps);
            await sessionServer.connect(transport);
          } else {
            res.status(400).json({ error: "Invalid or missing session" });
            return;
          }

          await transport!.handleRequest(req, res, req.body);
        }));

        app.get("/mcp", asyncHandler(async (req: Request, res: Response) => {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          const session = sessionId ? mcpSessions.get(sessionId) : undefined;
          if (!session) {
            res.status(400).json({ error: "Invalid or missing session" });
            return;
          }
          await session.transport.handleRequest(req, res);
        }));

        app.delete("/mcp", (req: Request, res: Response) => {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId) {
            const session = mcpSessions.get(sessionId);
            mcpSessions.delete(sessionId);
            if (session) {
              session.transport.close();
            }
          }
          res.sendStatus(200);
        });

        logger.info("MCP server initialized, /mcp endpoint registered (session-based)", {
          component: "Server",
          operation: "initializeMcp",
        });
      } catch (error) {
        logger.error("Failed to initialize MCP server, continuing without MCP", {
          component: "Server",
          operation: "initializeMcp",
        }, error instanceof Error ? error : undefined);
      }
    } else {
      logger.info("MCP server disabled (MCP_ENABLED != true)", {
        component: "Server",
        operation: "initializeMcp",
      });
    }

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
