import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../integrations/bolt";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";

/**
 * Request body schema for package installation
 */
const InstallPackageRequestSchema = z.object({
  taskName: z.string().min(1, "Task name is required"),
  packageName: z.string().min(1, "Package name is required"),
  ensure: z.enum(["present", "absent", "latest"]).optional().default("present"),
  version: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional().default(false),
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
 * @param boltService - Bolt service instance
 * @param executionRepository - Execution repository instance
 * @param packageTasks - Array of available package installation tasks
 * @returns Express router
 */
export function createPackagesRouter(
  boltService: BoltService,
  executionRepository: ExecutionRepository,
  packageTasks: PackageTaskConfig[],
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/package-tasks
   * Get available package installation tasks
   */
  router.get("/package-tasks", (req: Request, res: Response) => {
    const startTime = Date.now();
    const expertModeService = new ExpertModeService();
    const requestId = req.id ?? expertModeService.generateRequestId();

    // Create debug info once at the start if expert mode is enabled
    const debugInfo = req.expertMode
      ? expertModeService.createDebugInfo('GET /api/package-tasks', requestId, 0)
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
   * POST /api/nodes/:id/install-package
   * Install a package on a target node
   */
  router.post(
    "/:id/install-package",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/nodes/:id/install-package', requestId, 0)
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

        const { taskName, packageName, ensure, version, settings, expertMode } =
          validationResult.data;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Finding task configuration",
            context: JSON.stringify({ taskName }),
            level: 'debug',
          });
        }

        // Find the task configuration
        const taskConfig = packageTasks.find((t) => t.name === taskName);
        if (!taskConfig) {
          logger.warn("Package installation task not configured", {
            component: "PackagesRouter",
            integration: "bolt",
            operation: "installPackage",
            metadata: { taskName, availableTasks: packageTasks.map((t) => t.name) },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: `Package installation task '${taskName}' is not configured`,
              context: `Available tasks: ${packageTasks.map((t) => t.name).join(", ")}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_TASK",
              message: `Package installation task '${taskName}' is not configured`,
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

        // Create initial execution record
        const executionId = await executionRepository.create({
          type: "package",
          targetNodes: [nodeId],
          action: taskName,
          parameters: { packageName, ensure, version, settings },
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting package installation", {
          component: "PackagesRouter",
          integration: "bolt",
          operation: "installPackage",
          metadata: { executionId, nodeId, taskName, packageName },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Execution record created, starting package installation",
            context: JSON.stringify({ executionId, nodeId, taskName, packageName }),
            level: 'info',
          });
        }

        // Execute package installation asynchronously
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            // Execute package installation task with parameter mapping
            const result = await boltService.installPackage(
              nodeId,
              taskName,
              {
                packageName,
                ensure,
                version,
                settings,
              },
              taskConfig.parameterMapping,
              streamingCallback,
            );

            // Update execution record with results
            // Include stdout/stderr when expert mode is enabled
            await executionRepository.update(executionId, {
              status: result.status,
              completedAt: result.completedAt,
              results: result.results,
              error: result.error,
              command: result.command,
              stdout: expertMode ? result.stdout : undefined,
              stderr: expertMode ? result.stderr : undefined,
            });

            // Emit completion event if streaming
            if (streamingManager) {
              streamingManager.emitComplete(executionId, result);
            }
          } catch (error) {
            logger.error("Error installing package", {
              component: "PackagesRouter",
              integration: "bolt",
              operation: "installPackage",
              metadata: { executionId, nodeId, taskName, packageName },
            }, error instanceof Error ? error : undefined);

            let errorMessage = "Unknown error";
            if (error instanceof Error) {
              errorMessage = error.message;
            }

            // Update execution record with error
            await executionRepository.update(executionId, {
              status: "failed",
              completedAt: new Date().toISOString(),
              results: [
                {
                  nodeId,
                  status: "failed",
                  error: errorMessage,
                  duration: 0,
                },
              ],
              error: errorMessage,
            });

            // Emit error event if streaming
            if (streamingManager) {
              streamingManager.emitError(executionId, errorMessage);
            }
          }
        })();

        const duration = Date.now() - startTime;

        logger.info("Package installation request accepted", {
          component: "PackagesRouter",
          integration: "bolt",
          operation: "installPackage",
          metadata: { executionId, nodeId, taskName, packageName, duration },
        });

        // Return execution ID and initial status immediately
        const responseData = {
          executionId,
          status: "running",
          message: "Package installation started",
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'executionId', executionId);
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'taskName', taskName);
          expertModeService.addMetadata(debugInfo, 'packageName', packageName);
          expertModeService.addInfo(debugInfo, {
            message: "Package installation started",
            context: JSON.stringify({ executionId, nodeId, taskName, packageName }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(202).json(responseData);
        }
      } catch (error) {
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
