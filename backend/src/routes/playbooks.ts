import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";

const PlaybookExecutionBodySchema = z.object({
  playbookPath: z.string().min(1, "Playbook path is required"),
  extraVars: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional(),
  tool: z.enum(["ansible"]).optional(),
});

export function createPlaybooksRouter(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  router.post(
    "/:id/playbook",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
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

        const executionId = await executionRepository.create({
          type: "task",
          targetNodes: [nodeId],
          action: playbookPath,
          parameters: {
            playbook: true,
            extraVars,
          },
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
          executionTool: "ansible",
        });

        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode,
            );

            const result = await integrationManager.executeAction("ansible", {
              type: "plan",
              target: nodeId,
              action: playbookPath,
              parameters: {
                extraVars,
              },
              metadata: {
                streamingCallback,
              },
            });

            await executionRepository.update(executionId, {
              status: result.status,
              completedAt: result.completedAt,
              results: result.results,
              error: result.error,
              command: result.command,
              stdout: expertMode ? result.stdout : undefined,
              stderr: expertMode ? result.stderr : undefined,
            });

            if (streamingManager) {
              streamingManager.emitComplete(executionId, result);
            }
          } catch (error) {
            logger.error("Error executing playbook", {
              component: "PlaybooksRouter",
              integration: "ansible",
              operation: "executePlaybook",
              metadata: { executionId, nodeId, playbookPath },
            }, error instanceof Error ? error : undefined);

            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

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

            if (streamingManager) {
              streamingManager.emitError(executionId, errorMessage);
            }
          }
        })();

        const duration = Date.now() - startTime;

        const responseData = {
          executionId,
          status: "running",
          message: "Playbook execution started",
        };

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
