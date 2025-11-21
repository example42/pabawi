import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { BoltService } from "../bolt/BoltService";
import { ExecutionRepository } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";
import {
  BoltTaskNotFoundError,
  BoltNodeUnreachableError,
  BoltExecutionError,
} from "../bolt/types";

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

      try {
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
        );

        // Store execution in database
        await executionRepository.create({
          type: result.type,
          targetNodes: result.targetNodes,
          action: result.action,
          parameters: result.parameters,
          status: result.status,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          results: result.results,
          error: result.error,
          command: result.command,
          expertMode: expertMode,
        });

        // Return execution ID
        res.status(202).json({
          executionId: result.id,
          status: result.status,
        });
      } catch (error) {
        // Handle specific Bolt errors
        if (error instanceof BoltTaskNotFoundError) {
          res.status(404).json({
            error: {
              code: "TASK_NOT_FOUND",
              message: `Package installation task '${taskName}' not found`,
              details: error.message,
            },
          });
          return;
        }

        if (error instanceof BoltNodeUnreachableError) {
          res.status(503).json({
            error: {
              code: "NODE_UNREACHABLE",
              message: `Node ${nodeId} is unreachable`,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof BoltExecutionError) {
          res.status(500).json({
            error: {
              code: "EXECUTION_FAILED",
              message: "Package installation failed",
              details: error.message,
              stderr: error.stderr,
            },
          });
          return;
        }

        // Re-throw other errors to be handled by global error handler
        throw error;
      }
    }),
  );

  return router;
}
