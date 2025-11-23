import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { BoltService } from "../bolt/BoltService";
import { ExecutionRepository } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";

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
  streamingManager?: import("../services/StreamingExecutionManager").StreamingExecutionManager,
): Router {
  const router = Router();

  /**
   * GET /api/package-tasks
   * Get available package installation tasks
   */
  router.get("/package-tasks", (_req: Request, res: Response) => {
    res.json({
      tasks: packageTasks,
    });
  });

  /**
   * POST /api/nodes/:id/install-package
   * Install a package on a target node
   */
  router.post(
    "/:id/install-package",
    asyncHandler(async (req: Request, res: Response) => {
      const nodeId = req.params.id;

      // Validate request body
      const validationResult = InstallPackageRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid package installation request",
            details: validationResult.error.issues,
          },
        });
        return;
      }

      const { taskName, packageName, ensure, version, settings, expertMode } =
        validationResult.data;

      // Find the task configuration
      const taskConfig = packageTasks.find((t) => t.name === taskName);
      if (!taskConfig) {
        res.status(400).json({
          error: {
            code: "INVALID_TASK",
            message: `Package installation task '${taskName}' is not configured`,
            details: `Available tasks: ${packageTasks.map((t) => t.name).join(", ")}`,
          },
        });
        return;
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

      // Execute package installation asynchronously
      void (async (): Promise<void> => {
        try {
          // Set up streaming callback if expert mode is enabled and streaming manager is available
          const streamingCallback = expertMode && streamingManager ? {
            onCommand: (cmd: string) => streamingManager.emitCommand(executionId, cmd),
            onStdout: (chunk: string) => streamingManager.emitStdout(executionId, chunk),
            onStderr: (chunk: string) => streamingManager.emitStderr(executionId, chunk),
          } : undefined;

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
          await executionRepository.update(executionId, {
            status: result.status,
            completedAt: result.completedAt,
            results: result.results,
            error: result.error,
            command: result.command,
          });

          // Emit completion event if streaming
          if (streamingManager) {
            streamingManager.emitComplete(executionId, result);
          }
        } catch (error) {
          console.error("Error installing package:", error);

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

      // Return execution ID and initial status immediately
      res.status(202).json({
        executionId,
        status: "running",
        message: "Package installation started",
      });
    }),
  );

  return router;
}
