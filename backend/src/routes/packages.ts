import type { PermissionMiddlewareFactory } from "../middleware/routeAuthorization";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { type ExecutionService, ExecutionLifecycleError } from "../services/ExecutionService";
import { ExecutionQueueFullError } from "../services/ExecutionQueue";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { asyncHandler } from "./asyncHandler";
import { PackageNameSchema } from "../validation/commonSchemas";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

/**
 * Request body schema for package installation
 */
const InstallPackageRequestSchema = z.object({
  taskName: z.string().min(1, "Task name is required").optional(),
  packageName: PackageNameSchema,
  ensure: z.enum(["present", "absent", "latest"]).optional().default("present"),
  version: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional().default(false),
  tool: z.enum(["bolt", "ansible"]).optional(),
});

/**
 * Package task configuration type
 */
interface PackageTaskConfig {
  name: string;
  label: string;
  parameterMapping: {
    packageName: string;
    ensure?: string;
    version?: string;
    settings?: string;
  };
}

/**
 * Create router for package installation endpoints
 *
 * @param executionService - Shared execution owner
 * @param packageTasks - Array of available package installation tasks
 * @returns Express router
 */
export function createPackagesRouter(
  integrationManager: IntegrationManager,
  requirePermission: PermissionMiddlewareFactory,
  executionService: ExecutionService,
  packageTasks: PackageTaskConfig[],
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  /**
   * GET /api/packages/package-tasks
   * Get available package installation tasks
   */
  router.get("/package-tasks", requirePermission("bolt", "read"), (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.id ?? expertModeService.generateRequestId();

    // Create debug info once at the start if expert mode is enabled
    const debugInfo = req.expertMode
      ? expertModeService.createDebugInfo('GET /api/packages/package-tasks', requestId, 0)
      : null;

    logger.info("Fetching available package tasks", {
      component: "PackagesRouter",
      integration: "bolt",
      operation: "listPackageTasks",
    });

    if (debugInfo) {
      expertModeService.addDebug(debugInfo, {
        message: "Retrieving configured package tasks",
        level: 'debug',
      });
    }

    const duration = Date.now() - startTime;

    logger.info("Package tasks fetched successfully", {
      component: "PackagesRouter",
      integration: "bolt",
      operation: "listPackageTasks",
      metadata: { taskCount: packageTasks.length, duration },
    });

    const responseData = {
      tasks: packageTasks,
    };

    // Attach debug info if expert mode is enabled
    if (debugInfo) {
      debugInfo.duration = duration;
      expertModeService.setIntegration(debugInfo, 'bolt');
      expertModeService.addMetadata(debugInfo, 'taskCount', packageTasks.length);
      expertModeService.addInfo(debugInfo, {
        message: `Retrieved ${String(packageTasks.length)} package tasks`,
        level: 'info',
      });

      debugInfo.performance = expertModeService.collectPerformanceMetrics();
      debugInfo.context = expertModeService.collectRequestContext(req);

      res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
    } else {
      res.json(responseData);
    }
  });

  /**
   * POST /api/packages/:id/install-package
   * Install a package on a target node
   */
  router.post(
    "/:id/install-package",
    (req, res, next): void => {
      const parsed = InstallPackageRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid package request" } });
        return;
      }
      const tool = parsed.data.tool
        ?? (["bolt", "ansible"].find(name => integrationManager.getExecutionTool(name)) ?? "bolt");
      req.body = { ...parsed.data, tool };
      requirePermission(tool, "execute")(req, res, next);
    },
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/packages/:id/install-package', requestId, 0)
        : null;

      const nodeId = req.params.id;

      logger.info("Processing package installation request", {
        component: "PackagesRouter",
        integration: "bolt",
        operation: "installPackage",
        metadata: { nodeId },
      });

      try {
        // Validate request body
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request body",
            level: 'debug',
          });
        }

        const validationResult = InstallPackageRequestSchema.safeParse(req.body);
        if (!validationResult.success) {
          logger.warn("Invalid package installation request", {
            component: "PackagesRouter",
            integration: "bolt",
            operation: "installPackage",
            metadata: { errors: validationResult.error.issues },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid package installation request",
              context: JSON.stringify(validationResult.error.issues),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid package installation request",
              details: validationResult.error.issues,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const {
          taskName,
          packageName,
          ensure,
          version,
          settings,
          expertMode,
          tool,
        } =
          validationResult.data;

        const boltTool = integrationManager.getExecutionTool("bolt");
        const ansibleTool = integrationManager.getExecutionTool("ansible");
        const selectedTool = tool ?? (boltTool ? "bolt" : ansibleTool ? "ansible" : "bolt");

        if (!integrationManager.getExecutionTool(selectedTool)) {
          const errorResponse = {
            error: {
              code: "EXECUTION_TOOL_NOT_AVAILABLE",
              message: `Execution tool '${selectedTool}' is not available`,
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Determining package execution mode",
            context: JSON.stringify({ taskName, selectedTool }),
            level: 'debug',
          });
        }

        // Find the task configuration (required for Bolt only)
        const taskConfig = taskName ? packageTasks.find((t) => t.name === taskName) : undefined;
        if (selectedTool === "bolt" && !taskConfig) {
          logger.warn("Package installation task not configured", {
            component: "PackagesRouter",
            integration: "bolt",
            operation: "installPackage",
            metadata: { taskName: taskName ?? "", availableTasks: packageTasks.map((t) => t.name) },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: `Package installation task '${taskName ?? ""}' is not configured`,
              context: `Available tasks: ${packageTasks.map((t) => t.name).join(", ")}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_TASK",
              message: `Package installation task '${taskName ?? "unknown"}' is not configured`,
              details: `Available tasks: ${packageTasks.map((t) => t.name).join(", ")}`,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, taskName, packageName, expertMode }),
            level: 'debug',
          });
        }

        const admission = await executionService.submit([{
          type: "package",
          targetNodes: [nodeId],
          action: selectedTool === "ansible" ? "ansible.builtin.package" : (taskName ?? "package"),
          parameters: { packageName, ensure, version, settings },
          expertMode,
          executionTool: selectedTool,
        }], req.user?.userId ?? "unknown", (ids) => ({
          status: 202,
          body: { executionId: ids[0], status: "queued", message: "Package installation queued" },
        }));
        const responseData = admission.body as { executionId: string; status: string; message: string };
        const { executionId } = responseData;

        const duration = Date.now() - startTime;

        logger.info("Package installation request accepted", {
          component: "PackagesRouter",
          integration: selectedTool,
          operation: "installPackage",
          metadata: { executionId, nodeId, taskName: taskName ?? "", packageName, duration, selectedTool },
        });

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, selectedTool);
          expertModeService.addMetadata(debugInfo, 'executionId', executionId);
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'taskName', taskName ?? 'ansible.builtin.package');
          expertModeService.addMetadata(debugInfo, 'packageName', packageName);
          expertModeService.addMetadata(debugInfo, 'tool', selectedTool);
          expertModeService.addInfo(debugInfo, {
            message: "Package installation started",
            context: JSON.stringify({ executionId, nodeId, taskName, packageName, selectedTool }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(202).json(responseData);
        }
      } catch (error) {
        if (error instanceof ExecutionQueueFullError || error instanceof ExecutionLifecycleError) {
          res.status(503).json({ error: { code: "EXECUTION_UNAVAILABLE", message: error.message } });
          return;
        }
        const duration = Date.now() - startTime;

        // Unknown error
        logger.error("Error processing package installation request", {
          component: "PackagesRouter",
          integration: "bolt",
          operation: "installPackage",
          metadata: { nodeId, duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error processing package installation request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process package installation request",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  return router;
}
