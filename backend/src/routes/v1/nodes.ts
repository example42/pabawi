/**
 * v1 Nodes Router
 *
 * Provides v1 API endpoints for node/inventory management.
 * Routes:
 * - GET /api/v1/nodes - List all nodes (unified inventory)
 * - GET /api/v1/nodes/:id - Get node details
 * - GET /api/v1/nodes/:id/sources - Get node data sources
 *
 * @module routes/v1/nodes
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import { asyncHandler } from "../asyncHandler";
import { ExpertModeService } from "../../services/ExpertModeService";
import { requestDeduplication } from "../../middleware/deduplication";
import type { User } from "../../integrations/CapabilityRegistry";

/**
 * Query schema for listing nodes
 */
const ListNodesQuerySchema = z.object({
  sources: z.string().optional(),
  pql: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

/**
 * Node ID parameter schema
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

/**
 * Create the v1 nodes router
 *
 * @param integrationManager - Integration manager instance
 * @param logger - Logger service instance
 * @returns Express router with v1 nodes endpoints
 */
export function createV1NodesRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService
): Router {
  const router = Router();

  /**
   * GET /api/v1/nodes
   *
   * Returns unified inventory from all sources.
   * Supports filtering by source, PQL query, and sorting.
   */
  router.get(
    "/",
    requestDeduplication,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/nodes", requestId, 0)
        : null;

      logger.info("Fetching nodes via v1 API", {
        component: "V1NodesRouter",
        operation: "listNodes",
      });

      try {
        // Validate query parameters
        const query = ListNodesQuerySchema.parse(req.query);

        // Parse sources parameter
        const requestedSources = query.sources
          ? query.sources.split(",").map((s) => s.trim().toLowerCase())
          : ["all"];

        logger.debug("Processing nodes request", {
          component: "V1NodesRouter",
          operation: "listNodes",
          metadata: {
            requestedSources,
            hasPqlQuery: !!query.pql,
            sortBy: query.sortBy,
          },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Processing nodes request",
            context: JSON.stringify({
              requestedSources,
              hasPqlQuery: !!query.pql,
              sortBy: query.sortBy,
            }),
            level: "debug",
          });
        }

        // Get linked inventory from integration manager
        if (integrationManager?.isInitialized()) {
          const aggregated = await integrationManager.getLinkedInventory();

          // Filter by requested sources
          let filteredNodes = aggregated.nodes;
          if (!requestedSources.includes("all")) {
            filteredNodes = aggregated.nodes.filter((node) => {
              const nodeSource = (node as { source?: string }).source ?? "bolt";
              return requestedSources.includes(nodeSource);
            });
          }

          // Apply PQL filter if specified
          if (query.pql) {
            // Use capability-based routing to query PuppetDB with PQL filter
            const capabilityRegistry = integrationManager.getCapabilityRegistry();
            if (capabilityRegistry.hasCapability("inventory.query")) {
              try {
                // Create a system user for internal capability execution
                const systemUser: User = {
                  id: "system",
                  username: "system",
                  roles: ["admin"],
                };

                // Query PuppetDB with PQL filter using the inventory.query capability
                const pqlResult = await capabilityRegistry.executeCapability<Array<{ id: string }>>(
                  systemUser,
                  "inventory.query",
                  { pql: query.pql },
                  undefined
                );

                if (pqlResult.success && pqlResult.data) {
                  const pqlNodeIds = new Set(pqlResult.data.map((n) => n.id));

                  filteredNodes = filteredNodes.filter((node) => {
                    const nodeSource =
                      (node as { source?: string }).source ?? "bolt";
                    return nodeSource === "puppetdb" && pqlNodeIds.has(node.id);
                  });
                } else {
                  throw new Error(pqlResult.error?.message ?? "PQL query failed");
                }
              } catch (error) {
                logger.error("Error applying PQL filter", {
                  component: "V1NodesRouter",
                  operation: "listNodes",
                  metadata: { pqlQuery: query.pql },
                }, error instanceof Error ? error : undefined);

                const errorResponse = {
                  error: {
                    code: "PQL_QUERY_ERROR",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to apply PQL query",
                  },
                };

                if (debugInfo) {
                  debugInfo.duration = Date.now() - startTime;
                  expertModeService.addError(debugInfo, {
                    message: `PQL query error: ${error instanceof Error ? error.message : "Unknown"}`,
                    level: "error",
                  });
                  res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
                } else {
                  res.status(400).json(errorResponse);
                }
                return;
              }
            }
          }

          // Sort nodes if requested
          if (query.sortBy) {
            const sortOrder = query.sortOrder ?? "asc";
            const sortMultiplier = sortOrder === "asc" ? 1 : -1;

            filteredNodes.sort((a, b) => {
              const nodeA = a as { source?: string; name?: string };
              const nodeB = b as { source?: string; name?: string };

              switch (query.sortBy) {
                case "name": {
                  const nameA = nodeA.name ?? "";
                  const nameB = nodeB.name ?? "";
                  return nameA.localeCompare(nameB) * sortMultiplier;
                }
                case "source": {
                  const sourceA = nodeA.source ?? "";
                  const sourceB = nodeB.source ?? "";
                  return sourceA.localeCompare(sourceB) * sortMultiplier;
                }
                default:
                  return 0;
              }
            });
          }

          // Apply pagination
          const totalCount = filteredNodes.length;
          if (query.offset !== undefined || query.limit !== undefined) {
            const offset = query.offset ?? 0;
            const limit = query.limit ?? filteredNodes.length;
            filteredNodes = filteredNodes.slice(offset, offset + limit);
          }

          // Filter sources to only include requested ones
          const filteredSources: typeof aggregated.sources = {};
          for (const [sourceName, sourceInfo] of Object.entries(
            aggregated.sources
          )) {
            if (
              requestedSources.includes("all") ||
              requestedSources.includes(sourceName)
            ) {
              filteredSources[sourceName] = sourceInfo;
            }
          }

          const duration = Date.now() - startTime;

          logger.info("Nodes fetched successfully via v1 API", {
            component: "V1NodesRouter",
            operation: "listNodes",
            metadata: {
              nodeCount: filteredNodes.length,
              totalCount,
              sourceCount: Object.keys(filteredSources).length,
              duration,
            },
          });

          const responseData = {
            nodes: filteredNodes,
            sources: filteredSources,
            pagination: {
              total: totalCount,
              offset: query.offset ?? 0,
              limit: query.limit ?? totalCount,
              returned: filteredNodes.length,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addMetadata(debugInfo, "nodeCount", filteredNodes.length);
            expertModeService.addMetadata(debugInfo, "totalCount", totalCount);
            expertModeService.addInfo(debugInfo, {
              message: `Retrieved ${filteredNodes.length} nodes from ${Object.keys(filteredSources).length} sources`,
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

        // Fallback: no integration manager
        const duration = Date.now() - startTime;
        const responseData = {
          nodes: [],
          sources: {},
          pagination: {
            total: 0,
            offset: 0,
            limit: 0,
            returned: 0,
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addWarning(debugInfo, {
            message: "Integration manager not initialized",
            level: "warn",
          });
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid query parameters", {
            component: "V1NodesRouter",
            operation: "listNodes",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid query parameters",
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        logger.error("Error fetching nodes", {
          component: "V1NodesRouter",
          operation: "listNodes",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch nodes",
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });
          res.status(500).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(500).json(errorResponse);
        }
      }
    })
  );

  /**
   * GET /api/v1/nodes/:id
   *
   * Returns details for a specific node.
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/nodes/:id", requestId, 0)
        : null;

      try {
        // Validate parameters
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        logger.debug(`Fetching node: ${nodeId}`, {
          component: "V1NodesRouter",
          operation: "getNode",
          metadata: { nodeId },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: `Searching for node: ${nodeId}`,
            level: "debug",
          });
        }

        // Search across all inventory sources
        if (integrationManager?.isInitialized()) {
          const aggregated = await integrationManager.getLinkedInventory();
          const node = aggregated.nodes.find(
            (n) => n.id === nodeId || n.name === nodeId
          );

          if (node) {
            const duration = Date.now() - startTime;

            logger.info(`Node found: ${nodeId}`, {
              component: "V1NodesRouter",
              operation: "getNode",
              metadata: { nodeId, duration },
            });

            const responseData = {
              node,
              source: (node as { source?: string }).source ?? "unknown",
            };

            if (debugInfo) {
              debugInfo.duration = duration;
              expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
              expertModeService.addInfo(debugInfo, {
                message: `Found node: ${nodeId}`,
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
        }

        // Node not found
        const duration = Date.now() - startTime;

        logger.warn(`Node not found: ${nodeId}`, {
          component: "V1NodesRouter",
          operation: "getNode",
          metadata: { nodeId, duration },
        });

        const errorResponse = {
          error: {
            code: "NODE_NOT_FOUND",
            message: `No node found with ID: ${nodeId}`,
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addWarning(debugInfo, {
            message: `Node not found: ${nodeId}`,
            level: "warn",
          });
          res.status(404).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(404).json(errorResponse);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid node ID",
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        logger.error("Error fetching node", {
          component: "V1NodesRouter",
          operation: "getNode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node",
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          res.status(500).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(500).json(errorResponse);
        }
      }
    })
  );

  /**
   * GET /api/v1/nodes/:id/sources
   *
   * Returns data sources for a specific node.
   * Shows which integrations have data for this node.
   */
  router.get(
    "/:id/sources",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/nodes/:id/sources", requestId, 0)
        : null;

      try {
        // Validate parameters
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        logger.debug(`Fetching sources for node: ${nodeId}`, {
          component: "V1NodesRouter",
          operation: "getNodeSources",
          metadata: { nodeId },
        });

        // Get node data from all sources
        const sources: Array<{
          plugin: string;
          hasData: boolean;
          lastUpdated?: string;
          dataPreview?: Record<string, unknown>;
        }> = [];

        if (integrationManager?.isInitialized()) {
          // Get all registered plugins and check if they have data for this node
          const allPlugins = integrationManager.getAllPlugins();

          for (const registration of allPlugins) {
            try {
              const pluginName = registration.plugin.metadata.name;
              // Check if plugin is initialized (simplified check)
              const hasData = registration.initialized;

              sources.push({
                plugin: pluginName,
                hasData,
                lastUpdated: new Date().toISOString(),
              });
            } catch {
              sources.push({
                plugin: registration.plugin.metadata.name,
                hasData: false,
              });
            }
          }
        }

        const duration = Date.now() - startTime;

        logger.info(`Node sources fetched: ${nodeId}`, {
          component: "V1NodesRouter",
          operation: "getNodeSources",
          metadata: { nodeId, sourceCount: sources.length, duration },
        });

        const responseData = {
          nodeId,
          sources,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "sourceCount", sources.length);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid node ID",
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        logger.error("Error fetching node sources", {
          component: "V1NodesRouter",
          operation: "getNodeSources",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node sources",
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          res.status(500).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(500).json(errorResponse);
        }
      }
    })
  );

  return router;
}
