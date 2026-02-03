/**
 * Inventory API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for inventory listing using capability-based routing.
 * Aggregates inventory from multiple sources (Bolt, PuppetDB, etc.) through
 * the CapabilityRegistry for:
 * - Permission checking via RBAC
 * - Plugin routing based on priority
 * - Multi-source data aggregation
 *
 * @module routes/inventory
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { Node } from "../bolt/types";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";
import { asyncHandler } from "./asyncHandler";
import { requestDeduplication } from "../middleware/deduplication";
import {
  requestUserToCapabilityUser,
  createDebugContext,
  createErrorResponse,
} from "./capabilityRouter";
import { requireAnyCapability } from "../middleware/rbac";

// =============================================================================
// Request Validation Schemas
// =============================================================================

const InventoryQuerySchema = z.object({
  sources: z.string().optional(),
  pql: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  refresh: z.string().optional().transform(v => v === "true"),
});

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create inventory router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @returns Express router
 */
export function createInventoryRouterV1(
  integrationManager: IntegrationManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  // =========================================================================
  // GET /api/inventory
  // List inventory from all sources via capability system
  // =========================================================================
  router.get(
    "/",
    requestDeduplication,
    requireAnyCapability(["inventory.read", "bolt.inventory.list", "puppetdb.nodes"]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/inventory", requestId, 0)
        : null;

      logger.info("Fetching inventory via capability system", {
        component: "InventoryRouter",
        operation: "getInventory",
      });

      try {
        const query = InventoryQuerySchema.parse(req.query);
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        // Parse requested sources
        const requestedSources = query.sources
          ? query.sources.split(",").map(s => s.trim().toLowerCase())
          : ["all"];

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Processing inventory request",
            context: JSON.stringify({ requestedSources, pql: query.pql, sortBy: query.sortBy }),
            level: "debug",
          });
        }

        // Use IntegrationManager to get capability-based aggregated inventory
        // This uses the v1.0.0 getInventoryViaCapability if available
        let aggregatedInventory;

        try {
          aggregatedInventory = await integrationManager.getInventoryViaCapability(
            user,
            debugContext
          );
        } catch {
          // Fall back to legacy method
          aggregatedInventory = await integrationManager.getAggregatedInventory();
        }

        let filteredNodes = aggregatedInventory.nodes;

        // Filter by source if specified
        if (!requestedSources.includes("all")) {
          filteredNodes = filteredNodes.filter(node => {
            const nodeSource = (node as Node & { source?: string }).source ?? "bolt";
            return requestedSources.includes(nodeSource);
          });

          if (debugInfo) {
            expertModeService.addDebug(debugInfo, {
              message: "Filtered nodes by source",
              context: JSON.stringify({
                originalCount: aggregatedInventory.nodes.length,
                filteredCount: filteredNodes.length,
              }),
              level: "debug",
            });
          }
        }

        // Apply PQL filter if specified (PuppetDB-specific)
        if (query.pql) {
          logger.debug("Applying PQL filter", {
            component: "InventoryRouter",
            integration: "puppetdb",
            operation: "getInventory",
            metadata: { pqlQuery: query.pql },
          });

          try {
            // Execute PuppetDB query capability
            const pqlResult = await integrationManager.executeCapability(
              user,
              "puppetdb.query",
              { query: query.pql },
              debugContext
            );

            if (pqlResult.success && Array.isArray(pqlResult.data)) {
              const pqlNodeIds = new Set(
                pqlResult.data.map((n: { certname?: string; id?: string }) =>
                  n.certname ?? n.id
                )
              );

              // Filter to only PuppetDB nodes that match
              filteredNodes = filteredNodes.filter(node => {
                const nodeSource = (node as Node & { source?: string }).source ?? "bolt";
                return nodeSource === "puppetdb" && pqlNodeIds.has(node.id);
              });

              if (debugInfo) {
                expertModeService.addDebug(debugInfo, {
                  message: "PQL filter applied",
                  context: JSON.stringify({ matchedNodes: filteredNodes.length }),
                  level: "debug",
                });
              }
            }
          } catch (error) {
            logger.error("Error applying PQL filter", {
              component: "InventoryRouter",
              integration: "puppetdb",
              operation: "getInventory",
            }, error instanceof Error ? error : undefined);

            if (debugInfo) {
              expertModeService.addWarning(debugInfo, {
                message: "PQL filter failed, showing unfiltered results",
                context: error instanceof Error ? error.message : "Unknown error",
                level: "warn",
              });
            }
          }
        }

        // Sort nodes if requested
        if (query.sortBy) {
          const sortOrder = query.sortOrder ?? "asc";
          const sortMultiplier = sortOrder === "asc" ? 1 : -1;

          filteredNodes.sort((a, b) => {
            const nodeA = a as Node & { source?: string };
            const nodeB = b as Node & { source?: string };

            switch (query.sortBy) {
              case "name":
                return (nodeA.name ?? "").localeCompare(nodeB.name ?? "") * sortMultiplier;
              case "source":
                return ((nodeA.source ?? "") as string).localeCompare((nodeB.source ?? "") as string) * sortMultiplier;
              default:
                return 0;
            }
          });
        }

        // Filter sources to only include requested ones
        const filteredSources: typeof aggregatedInventory.sources = {};
        for (const [sourceName, sourceInfo] of Object.entries(aggregatedInventory.sources)) {
          if (requestedSources.includes("all") || requestedSources.includes(sourceName)) {
            filteredSources[sourceName] = sourceInfo;
          }
        }

        const duration = Date.now() - startTime;

        logger.info("Inventory fetched successfully via capability system", {
          component: "InventoryRouter",
          operation: "getInventory",
          metadata: {
            nodeCount: filteredNodes.length,
            sourceCount: Object.keys(filteredSources).length,
            duration,
          },
        });

        const responseData = {
          nodes: filteredNodes,
          sources: filteredSources,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "nodeCount", filteredNodes.length);
          expertModeService.addMetadata(debugInfo, "requestedSources", requestedSources);
          expertModeService.addMetadata(debugInfo, "sourceCount", Object.keys(filteredSources).length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(filteredNodes.length)} nodes from ${String(Object.keys(filteredSources).length)} sources`,
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
            "Invalid query parameters",
            error.errors
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters",
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

        logger.error("Error fetching inventory", {
          component: "InventoryRouter",
          operation: "getInventory",
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
          "Failed to fetch inventory"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // =========================================================================
  // GET /api/inventory/:id
  // Get specific node from inventory via capability system
  // =========================================================================
  router.get(
    "/:id",
    requireAnyCapability(["inventory.read", "bolt.inventory.list"]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/inventory/:id", requestId, 0)
        : null;

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        logger.info("Fetching node via capability system", {
          component: "InventoryRouter",
          operation: "getNode",
          metadata: { nodeId },
        });

        // Get aggregated inventory
        let aggregatedInventory;
        try {
          aggregatedInventory = await integrationManager.getInventoryViaCapability(
            user,
            debugContext
          );
        } catch {
          aggregatedInventory = await integrationManager.getAggregatedInventory();
        }

        // Find the node
        const node = aggregatedInventory.nodes.find(
          n => n.id === nodeId || n.name === nodeId
        );

        const duration = Date.now() - startTime;

        if (!node) {
          logger.warn("Node not found in inventory", {
            component: "InventoryRouter",
            operation: "getNode",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
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

        logger.info("Node fetched successfully", {
          component: "InventoryRouter",
          operation: "getNode",
          metadata: { nodeId, duration },
        });

        const responseData = {
          node,
          source: (node as Node & { source?: string }).source ?? "bolt",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "source", responseData.source);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved node '${nodeId}' from ${responseData.source}`,
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
            "Invalid node ID format",
            error.errors
          );

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error fetching node", {
          component: "InventoryRouter",
          operation: "getNode",
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
          "Failed to fetch node"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
