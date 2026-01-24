import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  BoltNodeUnreachableError,
  BoltExecutionError,
  BoltParseError,
  BoltInventoryNotFoundError,
} from "../bolt/types";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

/**
 * Create facts router
 */
export function createFactsRouter(
  integrationManager: IntegrationManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * POST /api/nodes/:id/facts
   * Trigger facts gathering for a node
   */
  router.post(
    "/:id/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/nodes/:id/facts', requestId, 0)
        : null;

      logger.info("Processing facts gathering request", {
        component: "FactsRouter",
        integration: "bolt",
        operation: "gatherFacts",
        metadata: { nodeId: req.params.id },
      });

      try {
        // Validate request parameters
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            level: 'debug',
          });
        }

        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Verifying node exists in inventory",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        // Verify node exists in inventory using IntegrationManager
        const aggregatedInventory =
          await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );

        if (!node) {
          logger.warn("Node not found in inventory", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: `Node '${nodeId}' not found in inventory`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Getting Bolt information source",
            level: 'debug',
          });
        }

        // Gather facts from the node using IntegrationManager
        // This will get facts from Bolt (the default execution tool)
        const boltSource = integrationManager.getInformationSource("bolt");
        if (!boltSource) {
          logger.warn("Bolt integration not available", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Bolt integration is not available",
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_NOT_AVAILABLE",
              message: "Bolt integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Gathering facts from node",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        const facts = await boltSource.getNodeFacts(nodeId);

        const duration = Date.now() - startTime;

        logger.info("Facts gathered successfully", {
          component: "FactsRouter",
          integration: "bolt",
          operation: "gatherFacts",
          metadata: { nodeId, factCount: Object.keys(facts).length, duration },
        });

        const responseData = { facts };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'factCount', String(Object.keys(facts).length));
          expertModeService.addInfo(debugInfo, {
            message: `Gathered ${String(Object.keys(facts).length)} facts from node`,
            context: JSON.stringify({ nodeId }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid node ID parameter", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid node ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid node ID parameter",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltNodeUnreachableError) {
          logger.error("Node unreachable", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { details: error.details },
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Node unreachable: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NODE_UNREACHABLE",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltInventoryNotFoundError) {
          logger.error("Bolt configuration missing", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt configuration missing: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltExecutionError) {
          logger.error("Bolt execution failed", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { stderr: error.stderr },
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt execution failed: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltParseError) {
          logger.error("Bolt parse error", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt parse error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error gathering facts", {
          component: "FactsRouter",
          integration: "bolt",
          operation: "gatherFacts",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error gathering facts: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to gather facts",
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
