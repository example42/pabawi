/**
 * Puppet API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for Puppet agent runs using capability-based routing.
 * Puppet runs are executed via Bolt tasks through the CapabilityRegistry for:
 * - Permission checking via RBAC
 * - Plugin routing based on priority
 * - Consistent error handling
 *
 * @module routes/puppet
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { ExecutionStatus, NodeResult } from "../database/ExecutionRepository";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";
import { asyncHandler } from "./asyncHandler";
import {
  requestUserToCapabilityUser,
  createDebugContext,
  createErrorResponse,
} from "./capabilityRouter";
import { requireAnyCapability } from "../middleware/rbac";

// =============================================================================
// Request Validation Schemas
// =============================================================================

const PuppetRunBodySchema = z.object({
  tags: z.array(z.string()).optional(),
  environment: z.string().optional(),
  noop: z.boolean().optional(),
  noNoop: z.boolean().optional(),
  debug: z.boolean().optional(),
  expertMode: z.boolean().optional(),
});

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create Puppet router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @param executionRepository - Repository for execution history
 * @param streamingManager - Optional streaming manager for real-time output
 * @returns Express router
 */
export function createPuppetRouterV1(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  streamingManager?: StreamingExecutionManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  // =========================================================================
  // POST /api/nodes/:id/puppet-run
  // Execute Puppet agent run on a node via capability system
  // =========================================================================
  router.post(
    "/:id/puppet-run",
    requireAnyCapability(["puppet.run", "bolt.task.execute"], {
      contextExtractor: (req) => ({
        node: req.params.id,
        metadata: { task: "puppet_agent" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/nodes/:id/puppet-run", requestId, 0)
        : null;

      logger.info("Processing Puppet run request via capability", {
        component: "PuppetRouter",
        integration: "bolt",
        operation: "puppet-run",
        metadata: { nodeId: req.params.id },
      });

      try {
        // Validate request
        const params = NodeIdParamSchema.parse(req.params);
        const body = PuppetRunBodySchema.parse(req.body);
        const nodeId = params.id;
        const expertMode = body.expertMode ?? false;

        // Build Puppet run configuration
        const puppetConfig = {
          tags: body.tags,
          environment: body.environment,
          noop: body.noop,
          noNoop: body.noNoop,
          debug: body.debug,
        };

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Verifying node exists in inventory",
            context: JSON.stringify({ nodeId }),
            level: "debug",
          });
        }

        // Verify node exists in inventory
        const aggregatedInventory = await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          n => n.id === nodeId || n.name === nodeId
        );

        if (!node) {
          logger.warn("Node not found in inventory", {
            component: "PuppetRouter",
            integration: "bolt",
            operation: "puppet-run",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: `Node '${nodeId}' not found in inventory`,
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = createErrorResponse(
            "NODE_NOT_FOUND",
            `Node '${nodeId}' not found in inventory`
          );

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, puppetConfig }),
            level: "debug",
          });
        }

        // Create execution record
        const executionId = await executionRepository.create({
          type: "puppet",
          targetNodes: [nodeId],
          action: "puppet_agent",
          parameters: puppetConfig,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting capability execution", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { executionId, nodeId },
        });

        // Execute Puppet run asynchronously via capability system
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            const user = requestUserToCapabilityUser(req);
            const debugContext = createDebugContext(req);

            // Convert puppetConfig to task parameters
            const taskParameters: Record<string, unknown> = {};
            if (puppetConfig.tags && puppetConfig.tags.length > 0) {
              taskParameters.tags = puppetConfig.tags.join(",");
            }
            if (puppetConfig.environment) {
              taskParameters.environment = puppetConfig.environment;
            }
            if (puppetConfig.noop !== undefined) {
              taskParameters.noop = puppetConfig.noop;
            }

            // Execute via capability system using bolt.task.execute
            const result = await integrationManager.executeCapability(
              user,
              "bolt.task.execute",
              {
                task: "puppet_agent",
                targets: [nodeId],
                parameters: taskParameters,
                streamingCallback,
              },
              debugContext
            );

            if (result.success && result.data) {
              const execResult = result.data as {
                status: ExecutionStatus;
                completedAt?: string;
                results: NodeResult[];
                error?: string;
                command?: string;
                stdout?: string;
                stderr?: string;
              };

              await executionRepository.update(executionId, {
                status: execResult.status as ExecutionStatus,
                completedAt: execResult.completedAt ?? new Date().toISOString(),
                results: execResult.results as NodeResult[],
                error: execResult.error,
                command: execResult.command,
                stdout: expertMode ? execResult.stdout : undefined,
                stderr: expertMode ? execResult.stderr : undefined,
              });

              if (streamingManager) {
                streamingManager.emitComplete(executionId, execResult);
              }
            } else {
              const errorMessage = result.error?.message ?? "Puppet run failed";
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
          } catch (error) {
            logger.error("Error executing Puppet run via capability", {
              component: "PuppetRouter",
              integration: "bolt",
              operation: "puppet-run",
              metadata: { executionId, nodeId },
            }, error instanceof Error ? error : undefined);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

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

        logger.info("Puppet run request accepted", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { executionId, nodeId, duration },
        });

        const responseData = {
          executionId,
          status: "running",
          message: "Puppet run started",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addMetadata(debugInfo, "executionId", executionId);
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "puppetConfig", puppetConfig);
          expertModeService.addInfo(debugInfo, {
            message: "Puppet run started via capability system",
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

        if (error instanceof z.ZodError) {
          const errorResponse = createErrorResponse(
            "INVALID_REQUEST",
            "Request validation failed",
            error.errors
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error processing Puppet run request", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to process Puppet run request"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
