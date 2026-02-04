import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  NodeUnreachableError,
  ExecutionError,
  ParseError,
  InventoryNotFoundError,
  normalizePluginError,
} from "../errors/PluginErrors";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";
import type { User } from "../integrations/CapabilityRegistry";

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
            message: "Getting facts via capability-based routing",
            level: 'debug',
          });
        }

        // Gather facts using capability-based routing
        // Create a system user for internal capability execution
        const systemUser: User = {
          id: "system",
          username: "system",
          roles: ["admin"],
        };

        const capabilityRegistry = integrationManager.getCapabilityRegistry();

        // Check if info.facts capability is available
        if (!capabilityRegistry.hasCapability("info.facts")) {
          logger.warn("No plugin provides info.facts capability", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "No plugin provides info.facts capability",
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "CAPABILITY_NOT_AVAILABLE",
              message: "No plugin provides facts gathering capability",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Gathering facts from node via capability",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        const factsResult = await capabilityRegistry.executeCapability<Record<string, unknown>>(
          systemUser,
          "info.facts",
          { nodeId },
          undefined
        );

        if (!factsResult.success || !factsResult.data) {
          logger.error("Failed to gather facts via capability", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { nodeId, error: factsResult.error?.message },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Failed to gather facts: ${factsResult.error?.message ?? 'Unknown error'}`,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: factsResult.error?.code ?? "FACTS_GATHERING_FAILED",
              message: factsResult.error?.message ?? "Failed to gather facts",
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const facts = factsResult.data;

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

        if (error instanceof NodeUnreachableError || (error instanceof Error && error.name === 'BoltNodeUnreachableError')) {
          const normalizedError = normalizePluginError(error, 'bolt');
          logger.error("Node unreachable", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { details: normalizedError.details },
          }, error instanceof Error ? error : undefined);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Node unreachable: ${normalizedError.message}`,
              stack: error instanceof Error ? error.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
              details: normalizedError.details,
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof InventoryNotFoundError || (error instanceof Error && error.name === 'BoltInventoryNotFoundError')) {
          const normalizedError = normalizePluginError(error, 'bolt');
          logger.error("Inventory configuration missing", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
          }, error instanceof Error ? error : undefined);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Inventory configuration missing: ${normalizedError.message}`,
              stack: error instanceof Error ? error.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ExecutionError || (error instanceof Error && error.name === 'BoltExecutionError')) {
          const normalizedError = normalizePluginError(error, 'bolt');
          logger.error("Execution failed", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
            metadata: { stderr: normalizedError instanceof ExecutionError ? normalizedError.stderr : undefined },
          }, error instanceof Error ? error : undefined);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Execution failed: ${normalizedError.message}`,
              stack: error instanceof Error ? error.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
              details: normalizedError instanceof ExecutionError ? normalizedError.stderr : undefined,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ParseError || (error instanceof Error && error.name === 'BoltParseError')) {
          const normalizedError = normalizePluginError(error, 'bolt');
          logger.error("Parse error", {
            component: "FactsRouter",
            integration: "bolt",
            operation: "gatherFacts",
          }, error instanceof Error ? error : undefined);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Parse error: ${normalizedError.message}`,
              stack: error instanceof Error ? error.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
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
