import type { PermissionMiddlewareFactory } from "../middleware/routeAuthorization";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { type ExecutionService, ExecutionLifecycleError } from "../services/ExecutionService";
import { ExecutionQueueFullError } from "../services/ExecutionQueue";
import { asyncHandler } from "./asyncHandler";
import { NodeIdParamSchema } from "../validation/commonSchemas";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

/**
 * Regex for safe playbook paths:
 * - Must be relative (no leading /)
 * - No path traversal (..)
 * - Alphanumeric, hyphens, underscores, slashes, dots only
 * - Must end in .yml or .yaml
 */
const SAFE_PLAYBOOK_PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_\-/.]*\.ya?ml$/;

const PlaybookExecutionBodySchema = z.object({
  playbookPath: z.string()
    .min(1, "Playbook path is required")
    .max(500, "Playbook path too long")
    .regex(SAFE_PLAYBOOK_PATH_PATTERN, "Playbook path contains invalid characters or must end in .yml/.yaml")
    .refine((p) => !p.includes(".."), { message: "Path traversal sequences (..) are not allowed" })
    .refine((p) => !p.startsWith("/"), { message: "Absolute paths are not allowed" }),
  extraVars: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional(),
  tool: z.enum(["ansible"]).optional(),
});

export function createPlaybooksRouter(
  integrationManager: IntegrationManager,
  requirePermission: PermissionMiddlewareFactory,
  executionService: ExecutionService,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  router.post(
    "/:id/playbook",
    requirePermission("ansible", "execute"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/nodes/:id/playbook", requestId, 0)
        : null;

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const body = PlaybookExecutionBodySchema.parse(req.body);

        const nodeId = params.id;
        const playbookPath = body.playbookPath;
        const extraVars = body.extraVars;
        const expertMode = body.expertMode ?? false;

        const ansibleTool = integrationManager.getExecutionTool("ansible");
        if (!ansibleTool) {
          const errorResponse = {
            error: {
              code: "EXECUTION_TOOL_NOT_AVAILABLE",
              message: "Ansible integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        const aggregatedInventory = await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );

        if (!node) {
          const errorResponse = {
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        const admission = await executionService.submit([{
          type: "plan",
          targetNodes: [nodeId],
          action: playbookPath,
          parameters: { extraVars },
          expertMode,
          executionTool: "ansible",
        }], req.user?.userId ?? "unknown", (ids) => ({
          status: 202,
          body: { executionId: ids[0], status: "queued", message: "Playbook execution queued" },
        }));
        const responseData = admission.body as { executionId: string; status: string; message: string };
        const { executionId } = responseData;

        const duration = Date.now() - startTime;



        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "ansible");
          expertModeService.addMetadata(debugInfo, "executionId", executionId);
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "playbookPath", playbookPath);
          expertModeService.addInfo(debugInfo, {
            message: "Playbook execution started",
            context: JSON.stringify({ executionId, nodeId, playbookPath }),
            level: "info",
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

        logger.error("Error processing playbook execution request", {
          component: "PlaybooksRouter",
          integration: "ansible",
          operation: "executePlaybook",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process playbook execution request",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
        );
      }
    }),
  );

  return router;
}
