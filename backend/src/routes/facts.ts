import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  BoltNodeUnreachableError,
  BoltExecutionError,
  BoltParseError,
  BoltInventoryNotFoundError,
} from "../integrations/bolt/types";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";

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
   * Trigger facts gathering for a node from all available sources
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
            operation: "gatherFacts",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
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

        // Gather facts from all available sources
        const factsResults: Record<string, unknown> = {};
        const errors: Record<string, string> = {};

        // Try Bolt
        const boltSource = integrationManager.getInformationSource("bolt");
        if (boltSource) {
          try {
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Gathering facts from Bolt",
                level: 'debug',
              });
            }
            const boltFacts = await boltSource.getNodeFacts(nodeId);
            factsResults.bolt = boltFacts;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.bolt = errorMsg;
            logger.warn("Failed to gather facts from Bolt", {
              component: "FactsRouter",
              operation: "gatherFacts",
              metadata: { nodeId, error: errorMsg },
            });
          }
        }

        // Try SSH
        const sshSource = integrationManager.getInformationSource("ssh");
        if (sshSource) {
          try {
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Gathering facts from SSH",
                level: 'debug',
              });
            }
            const sshFacts = await sshSource.getNodeFacts(nodeId);
            factsResults.ssh = sshFacts;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.ssh = errorMsg;
            logger.warn("Failed to gather facts from SSH", {
              component: "FactsRouter",
              operation: "gatherFacts",
              metadata: { nodeId, error: errorMsg },
            });
          }
        }

        // Try Ansible
        const ansibleSource = integrationManager.getInformationSource("ansible");
        if (ansibleSource) {
          try {
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Gathering facts from Ansible",
                level: 'debug',
              });
            }
            const ansibleFacts = await ansibleSource.getNodeFacts(nodeId);
            factsResults.ansible = ansibleFacts;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.ansible = errorMsg;
            logger.warn("Failed to gather facts from Ansible", {
              component: "FactsRouter",
              operation: "gatherFacts",
              metadata: { nodeId, error: errorMsg },
            });
          }
        }

        const duration = Date.now() - startTime;

        // If no facts were gathered from any source, return error
        if (Object.keys(factsResults).length === 0) {
          logger.error("No facts could be gathered from any source", {
            component: "FactsRouter",
            operation: "gatherFacts",
            metadata: { nodeId, errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: "No facts could be gathered from any source",
              context: JSON.stringify(errors),
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NO_FACTS_AVAILABLE",
              message: "No facts could be gathered from any source",
              details: errors,
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.info("Facts gathered successfully", {
          component: "FactsRouter",
          operation: "gatherFacts",
          metadata: {
            nodeId,
            sources: Object.keys(factsResults),
            duration
          },
        });

        const responseData = {
          facts: factsResults,
          errors: Object.keys(errors).length > 0 ? errors : undefined,
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'sources', Object.keys(factsResults).join(', '));
          expertModeService.addInfo(debugInfo, {
            message: `Gathered facts from ${String(Object.keys(factsResults).length)} source(s)`,
            context: JSON.stringify({ nodeId, sources: Object.keys(factsResults) }),
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

  /**
   * GET /api/nodes/:id/facts
   * Get facts for a node from all available information sources
   */
  router.get(
    "/:id/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();

      logger.info("Fetching facts from all sources", {
        component: "FactsRouter",
        operation: "getAllFacts",
        metadata: { nodeId: req.params.id },
      });

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        // Skip the expensive getAggregatedInventory() call — if no source
        // knows about this node the response will simply have empty sources,
        // which the frontend already handles gracefully.

        // Gather facts from all information sources in parallel
        const sources = integrationManager.getAllInformationSources();
        const factsResults: Record<
          string,
          { facts: Record<string, unknown>; timestamp: string }
        > = {};
        const errors: Record<string, string> = {};

        // Per-source timeout (5s) — keep the page snappy
        const SOURCE_TIMEOUT_MS = 5_000;

        const promises = sources.map(async (source) => {
          if (!source.isInitialized()) return;
          try {
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => { reject(new Error(`Timeout after ${String(SOURCE_TIMEOUT_MS)}ms`)); },
                SOURCE_TIMEOUT_MS,
              );
            });
            let nodeFacts: unknown;
            try {
              nodeFacts = await Promise.race([
                source.getNodeFacts(nodeId),
                timeoutPromise,
              ]);
            } finally {
              clearTimeout(timeoutHandle);
            }
            if (nodeFacts && typeof nodeFacts === "object") {
              const raw = nodeFacts as unknown as Record<string, unknown>;
              const factsObj =
                "facts" in raw && typeof raw.facts === "object" && raw.facts !== null
                  ? (raw.facts as Record<string, unknown>)
                  : raw;
              const timestamp =
                typeof raw.gatheredAt === "string"
                  ? raw.gatheredAt
                  : typeof raw.timestamp === "string"
                    ? raw.timestamp
                    : new Date().toISOString();
              factsResults[source.name] = { facts: factsObj, timestamp };
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            errors[source.name] = errorMsg;
            logger.warn(`Failed to gather facts from '${source.name}'`, {
              component: "FactsRouter",
              operation: "getAllFacts",
              metadata: { nodeId, source: source.name, error: errorMsg },
            });
          }
        });

        await Promise.all(promises);

        const duration = Date.now() - startTime;

        logger.info("Facts fetched from all sources", {
          component: "FactsRouter",
          operation: "getAllFacts",
          metadata: {
            nodeId,
            sources: Object.keys(factsResults),
            errorSources: Object.keys(errors),
            duration,
          },
        });

        res.json({
          sources: factsResults,
          errors: Object.keys(errors).length > 0 ? errors : undefined,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid node ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        logger.error("Error fetching facts", {
          component: "FactsRouter",
          operation: "getAllFacts",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch facts",
          },
        });
      }
    }),
  );

  return router;
}
