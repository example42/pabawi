/**
 * Facts API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for gathering facts from nodes using capability-based routing.
 * Facts can be retrieved from multiple sources (Bolt, PuppetDB, etc.) through
 * the CapabilityRegistry for:
 * - Permission checking via RBAC
 * - Plugin routing based on priority
 * - Multi-source data aggregation
 *
 * @module routes/facts
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { Facts } from "../integrations/types";
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

const FactsQuerySchema = z.object({
  refresh: z.string().optional().transform(v => v === "true"),
  source: z.enum(["bolt", "puppetdb", "any"]).optional().default("any"),
});

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create facts router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @returns Express router
 */
export function createFactsRouterV1(
  integrationManager: IntegrationManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  // =========================================================================
  // POST /api/nodes/:id/facts
  // Gather facts from a node via capability system
  // =========================================================================
  router.post(
    "/:id/facts",
    requireAnyCapability(["facts.gather", "bolt.facts.query", "puppetdb.facts"]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/nodes/:id/facts", requestId, 0)
        : null;

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const query = FactsQuerySchema.parse(req.query);
        const nodeId = params.id;

        logger.info("Gathering facts via capability system", {
          component: "FactsRouter",
          operation: "gatherFacts",
          metadata: { nodeId, source: query.source },
        });

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

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
            component: "FactsRouter",
            operation: "gatherFacts",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
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
            message: "Gathering facts from node",
            context: JSON.stringify({ nodeId, source: query.source }),
            level: "debug",
          });
        }

        // Determine which capability to use based on source preference
        let facts: Facts | undefined;
        let handledBy = "unknown";

        if (query.source === "puppetdb") {
          // Try PuppetDB first
          const result = await integrationManager.executeCapability<Facts>(
            user,
            "puppetdb.facts",
            { node: nodeId, refresh: query.refresh },
            debugContext
          );

          if (result.success && result.data) {
            facts = result.data;
            handledBy = result.handledBy;
          }
        } else if (query.source === "bolt") {
          // Try Bolt first
          const result = await integrationManager.executeCapability<Facts>(
            user,
            "bolt.facts.query",
            { target: nodeId, refresh: query.refresh },
            debugContext
          );

          if (result.success && result.data) {
            facts = result.data;
            handledBy = result.handledBy;
          }
        } else {
          // Try any available source via IntegrationManager
          try {
            facts = await integrationManager.getNodeFactsViaCapability(
              user,
              nodeId,
              debugContext
            );
            handledBy = "capability-routed";
          } catch {
            // Fall back to legacy method
            try {
              const nodeData = await integrationManager.getNodeData(nodeId);
              // Get facts from first available source
              const factsSources = Object.entries(nodeData.facts);
              if (factsSources.length > 0) {
                facts = factsSources[0][1];
                handledBy = factsSources[0][0];
              }
            } catch {
              // No facts available
            }
          }
        }

        const duration = Date.now() - startTime;

        if (!facts || Object.keys(facts).length === 0) {
          logger.warn("No facts available for node", {
            component: "FactsRouter",
            operation: "gatherFacts",
            metadata: { nodeId, source: query.source },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: `No facts available for node '${nodeId}'`,
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = createErrorResponse(
            "FACTS_NOT_AVAILABLE",
            `Unable to gather facts for node '${nodeId}'`
          );

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.info("Facts gathered successfully via capability system", {
          component: "FactsRouter",
          operation: "gatherFacts",
          metadata: { nodeId, factCount: Object.keys(facts).length, handledBy, duration },
        });

        const responseData = {
          facts,
          source: handledBy,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "factCount", Object.keys(facts).length);
          expertModeService.addMetadata(debugInfo, "handledBy", handledBy);
          expertModeService.addInfo(debugInfo, {
            message: `Gathered ${String(Object.keys(facts).length)} facts from ${handledBy}`,
            level: "info",
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
          const errorResponse = createErrorResponse(
            "INVALID_REQUEST",
            "Invalid request parameters",
            error.errors
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters",
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

        logger.error("Error gathering facts", {
          component: "FactsRouter",
          operation: "gatherFacts",
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to gather facts"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // =========================================================================
  // GET /api/nodes/:id/facts
  // Get cached facts for a node (from PuppetDB or cache)
  // =========================================================================
  router.get(
    "/:id/facts",
    requireAnyCapability(["facts.read", "puppetdb.facts"]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/nodes/:id/facts", requestId, 0)
        : null;

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        logger.info("Fetching cached facts via capability system", {
          component: "FactsRouter",
          operation: "getCachedFacts",
          metadata: { nodeId },
        });

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        // Try PuppetDB first (cached facts)
        const puppetdbResult = await integrationManager.executeCapability<Facts>(
          user,
          "puppetdb.facts",
          { node: nodeId },
          debugContext
        );

        const duration = Date.now() - startTime;

        if (puppetdbResult.success && puppetdbResult.data) {
          const facts = puppetdbResult.data;

          logger.info("Cached facts fetched successfully", {
            component: "FactsRouter",
            operation: "getCachedFacts",
            metadata: { nodeId, factCount: Object.keys(facts).length, source: "puppetdb" },
          });

          const responseData = {
            facts,
            source: "puppetdb",
            cached: true,
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "puppetdb");
            expertModeService.addMetadata(debugInfo, "factCount", Object.keys(facts).length);
            expertModeService.addInfo(debugInfo, {
              message: `Retrieved ${String(Object.keys(facts).length)} cached facts from PuppetDB`,
              level: "info",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
          } else {
            res.json(responseData);
          }
          return;
        }

        // No cached facts available
        const errorResponse = createErrorResponse(
          "FACTS_NOT_CACHED",
          `No cached facts available for node '${nodeId}'. Use POST to gather facts.`
        );

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addWarning(debugInfo, {
            message: "No cached facts available",
            level: "warn",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        res.status(404).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching cached facts", {
          component: "FactsRouter",
          operation: "getCachedFacts",
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to fetch cached facts"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
