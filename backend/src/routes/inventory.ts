import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../integrations/bolt/BoltService";
import {
  BoltInventoryNotFoundError,
  BoltExecutionError,
  BoltParseError,
  type Node,
} from "../integrations/bolt/types";
import { asyncHandler } from "./asyncHandler";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { ExpertModeService } from "../services/ExpertModeService";
import { LoggerService } from "../services/LoggerService";
import { requestDeduplication } from "../middleware/deduplication";
import { NodeIdParamSchema } from "../validation/commonSchemas";

const InventoryQuerySchema = z.object({
  sources: z.string().optional(),
  pql: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/**
 * Create inventory router
 */
export function createInventoryRouter(
  boltService: BoltService,
  integrationManager?: IntegrationManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/inventory
   * Return all nodes from inventory sources
   *
   * Query parameters:
   * - sources: Comma-separated list of sources (e.g., "bolt,puppetdb")
   * - pql: PuppetDB PQL query for filtering (only applies to PuppetDB source)
   */
  router.get(
    "/",
    requestDeduplication,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/inventory', requestId, 0)
        : null;

      logger.info("Fetching inventory", {
        component: "InventoryRouter",
        operation: "getInventory",
      });

      try {
        // Validate query parameters
        const query = InventoryQuerySchema.parse(req.query);

        // Parse sources parameter
        const requestedSources = query.sources
          ? query.sources.split(",").map((s) => s.trim().toLowerCase())
          : ["all"];

        logger.debug("Processing inventory request", {
          component: "InventoryRouter",
          operation: "getInventory",
          metadata: { requestedSources, hasPqlQuery: !!query.pql, sortBy: query.sortBy },
        });

        // Capture debug in expert mode
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Processing inventory request",
            context: JSON.stringify({ requestedSources, hasPqlQuery: !!query.pql, sortBy: query.sortBy }),
            level: 'debug',
          });
        }

        // If integration manager is available and sources include more than just bolt
        if (
          integrationManager &&
          integrationManager.isInitialized() &&
          (requestedSources.includes("all") ||
            requestedSources.some((s) => s !== "bolt"))
        ) {
          logger.debug("Using integration manager for linked inventory", {
            component: "InventoryRouter",
            operation: "getInventory",
          });

          // Capture debug in expert mode
          if (debugInfo) {
            expertModeService.addDebug(debugInfo, {
              message: "Using integration manager for linked inventory",
              level: 'debug',
            });
          }

          // Get linked inventory from all sources (Requirement 3.3)
          const aggregated = await integrationManager.getLinkedInventory();

          // Filter by requested sources if specified
          let filteredNodes = aggregated.nodes;
          if (!requestedSources.includes("all")) {
            filteredNodes = aggregated.nodes.filter((node) => {
              const nodeSource = (node as { source?: string }).source ?? "bolt";
              return requestedSources.includes(nodeSource);
            });
            logger.debug("Filtered nodes by source", {
              component: "InventoryRouter",
              operation: "getInventory",
              metadata: { originalCount: aggregated.nodes.length, filteredCount: filteredNodes.length },
            });

            // Capture debug in expert mode
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Filtered nodes by source",
                context: JSON.stringify({ originalCount: aggregated.nodes.length, filteredCount: filteredNodes.length }),
                level: 'debug',
              });
            }
          }

          // Apply PQL filter if specified (show only PuppetDB nodes that match)
          if (query.pql) {
            logger.debug("Applying PQL filter", {
              component: "InventoryRouter",
              integration: "puppetdb",
              operation: "getInventory",
              metadata: { pqlQuery: query.pql },
            });

            // Capture debug in expert mode
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Applying PQL filter",
                context: JSON.stringify({ pqlQuery: query.pql }),
                level: 'debug',
              });
            }

            const puppetdbSource =
              integrationManager.getInformationSource("puppetdb");
            if (puppetdbSource) {
              try {
                // Query PuppetDB with PQL filter using the queryInventory method
                // Cast to PuppetDBService to access the queryInventory method
                const puppetdbService = puppetdbSource as unknown as {
                  queryInventory: (pql: string) => Promise<Node[]>;
                };
                const pqlNodes = await puppetdbService.queryInventory(
                  query.pql,
                );
                const pqlNodeIds = new Set(pqlNodes.map((n) => n.id));

                // Filter to only include PuppetDB nodes that match PQL query
                filteredNodes = filteredNodes.filter((node) => {
                  const nodeSource =
                    (node as { source?: string }).source ?? "bolt";
                  // When PQL query is applied, only show PuppetDB nodes that match
                  return nodeSource === "puppetdb" && pqlNodeIds.has(node.id);
                });

                logger.info("PQL filter applied successfully", {
                  component: "InventoryRouter",
                  integration: "puppetdb",
                  operation: "getInventory",
                  metadata: { matchedNodes: filteredNodes.length },
                });
              } catch (error) {
                logger.error("Error applying PQL filter", {
                  component: "InventoryRouter",
                  integration: "puppetdb",
                  operation: "getInventory",
                  metadata: { pqlQuery: query.pql },
                }, error instanceof Error ? error : undefined);

                // Capture error in expert mode
                if (debugInfo) {
                  expertModeService.addError(debugInfo, {
                    message: `Error applying PQL filter: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    stack: error instanceof Error ? error.stack : undefined,
                    level: 'error',
                  });
                  debugInfo.duration = Date.now() - startTime;
                  debugInfo.performance = expertModeService.collectPerformanceMetrics();
                  debugInfo.context = expertModeService.collectRequestContext(req);
                }

                // Return error response for PQL query failures
                const errorResponse = {
                  error: {
                    code: "PQL_QUERY_ERROR",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to apply PQL query",
                  },
                };

                res.status(400).json(
                  debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
                );
                return;
              }
            } else {
              logger.warn("PuppetDB source not available for PQL query", {
                component: "InventoryRouter",
                integration: "puppetdb",
                operation: "getInventory",
              });

              // Capture warning in expert mode
              if (debugInfo) {
                expertModeService.addWarning(debugInfo, {
                  message: "PuppetDB source not available for PQL query",
                  context: "PQL query requested but PuppetDB source is not available",
                  level: 'warn',
                });
              }
            }
          }

          // Sort nodes if requested (Requirement 2.2)
          if (query.sortBy) {
            const sortOrder = query.sortOrder ?? "asc";
            const sortMultiplier = sortOrder === "asc" ? 1 : -1;

            logger.debug("Sorting inventory", {
              component: "InventoryRouter",
              operation: "getInventory",
              metadata: { sortBy: query.sortBy, sortOrder },
            });

            // Capture debug in expert mode
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Sorting inventory",
                context: JSON.stringify({ sortBy: query.sortBy, sortOrder }),
                level: 'debug',
              });
            }

            filteredNodes.sort((a, b) => {
              const nodeA = a as {
                source?: string;
                name?: string;
              };
              const nodeB = b as {
                source?: string;
                name?: string;
              };

              switch (query.sortBy) {
                case "name": {
                  // Sort by node name
                  const nameA = nodeA.name ?? "";
                  const nameB = nodeB.name ?? "";
                  return nameA.localeCompare(nameB) * sortMultiplier;
                }
                case "source": {
                  // Sort by source
                  const sourceA = nodeA.source ?? "";
                  const sourceB = nodeB.source ?? "";
                  return sourceA.localeCompare(sourceB) * sortMultiplier;
                }
                default:
                  return 0;
              }
            });
          }

          // Filter sources to only include requested ones
          const filteredSources: typeof aggregated.sources = {};
          for (const [sourceName, sourceInfo] of Object.entries(
            aggregated.sources,
          )) {
            if (
              requestedSources.includes("all") ||
              requestedSources.includes(sourceName)
            ) {
              filteredSources[sourceName] = sourceInfo;
            }
          }

          const duration = Date.now() - startTime;

          logger.info("Inventory fetched successfully", {
            component: "InventoryRouter",
            operation: "getInventory",
            metadata: { nodeCount: filteredNodes.length, sourceCount: Object.keys(filteredSources).length, duration },
          });

          const responseData = {
            nodes: filteredNodes,
            sources: filteredSources,
          };

          // Attach debug info if expert mode is enabled
          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addMetadata(debugInfo, 'nodeCount', filteredNodes.length);
            expertModeService.addMetadata(debugInfo, 'requestedSources', requestedSources);
            expertModeService.addMetadata(debugInfo, 'pqlQuery', query.pql);
            expertModeService.addInfo(debugInfo, {
              message: `Retrieved ${String(filteredNodes.length)} nodes from ${String(Object.keys(filteredSources).length)} sources`,
              level: 'info',
            });

            // Add performance metrics
            debugInfo.performance = expertModeService.collectPerformanceMetrics();

            // Add request context
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
          } else {
            res.json(responseData);
          }
          return;
        }

        // Fallback to Bolt-only inventory
        logger.debug("Using Bolt-only inventory", {
          component: "InventoryRouter",
          integration: "bolt",
          operation: "getInventory",
        });

        // Capture debug in expert mode
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Using Bolt-only inventory",
            level: 'debug',
          });
        }

        const nodes = await boltService.getInventory();
        const duration = Date.now() - startTime;

        logger.info("Bolt inventory fetched successfully", {
          component: "InventoryRouter",
          integration: "bolt",
          operation: "getInventory",
          metadata: { nodeCount: nodes.length, duration },
        });

        const responseData = {
          nodes,
          sources: {
            bolt: {
              nodeCount: nodes.length,
              lastSync: new Date().toISOString(),
              status: "healthy" as const,
            },
          },
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'nodeCount', nodes.length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(nodes.length)} nodes from Bolt`,
            level: 'info',
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid query parameters", {
            component: "InventoryRouter",
            operation: "getInventory",
            metadata: { errors: error.errors },
          });

          // Capture warning in expert mode
          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid query parameters",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltInventoryNotFoundError) {
          logger.warn("Bolt inventory not found", {
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getInventory",
          });

          // Capture warning in expert mode
          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Bolt inventory not found",
              context: error.message,
              level: 'warn',
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
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getInventory",
          }, error);

          // Capture error in expert mode
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
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getInventory",
          }, error);

          // Capture error in expert mode
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
        logger.error("Error fetching inventory", {
          component: "InventoryRouter",
          operation: "getInventory",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching inventory: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch inventory",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * GET /api/inventory/sources
   * Return available inventory sources and their status
   */
  router.get(
    "/sources",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching inventory sources", {
        component: "InventoryRouter",
        operation: "getSources",
      });

      try {
        if (integrationManager?.isInitialized()) {
          logger.debug("Checking health status for all information sources", {
            component: "InventoryRouter",
            operation: "getSources",
          });

          // Capture debug in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/sources',
              requestId,
              Date.now() - startTime
            );
            expertModeService.addDebug(debugInfo, {
              message: "Checking health status for all information sources",
              level: 'debug',
            });
          }

          // Get health status for all information sources
          const healthStatuses = await integrationManager.healthCheckAll(true);

          const sources: Record<
            string,
            {
              type: string;
              status: "connected" | "disconnected" | "error";
              lastCheck: string;
              error?: string;
            }
          > = {};

          // Add Bolt as a source
          sources.bolt = {
            type: "execution",
            status: "connected",
            lastCheck: new Date().toISOString(),
          };

          // Add other information sources
          for (const source of integrationManager.getAllInformationSources()) {
            const health = healthStatuses.get(source.name);
            sources[source.name] = {
              type: source.type,
              status: health?.healthy ? "connected" : "error",
              lastCheck: health?.lastCheck ?? new Date().toISOString(),
              error: health?.healthy ? undefined : health?.message,
            };

            if (!health?.healthy) {
              logger.warn(`Source ${source.name} is not healthy`, {
                component: "InventoryRouter",
                integration: source.name,
                operation: "getSources",
                metadata: { error: health?.message },
              });

              // Capture warning in expert mode (already exists below, but ensuring consistency)
              if (req.expertMode) {
                const debugInfo = expertModeService.createDebugInfo(
                  'GET /api/inventory/sources',
                  requestId,
                  Date.now() - startTime
                );
                expertModeService.addWarning(debugInfo, {
                  message: `Source ${source.name} is not healthy`,
                  context: health?.message,
                  level: 'warn',
                });
              }
            }
          }

          const duration = Date.now() - startTime;

          logger.info("Inventory sources fetched successfully", {
            component: "InventoryRouter",
            operation: "getSources",
            metadata: { sourceCount: Object.keys(sources).length, duration },
          });

          const responseData = { sources };

          // Attach debug info if expert mode is enabled
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/sources',
              requestId,
              duration
            );
            expertModeService.addMetadata(debugInfo, 'sourceCount', Object.keys(sources).length);
            expertModeService.addInfo(debugInfo, {
              message: `Retrieved ${String(Object.keys(sources).length)} inventory sources`,
              level: 'info',
            });

            // Add performance metrics
            debugInfo.performance = expertModeService.collectPerformanceMetrics();

            // Add request context
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
          } else {
            res.json(responseData);
          }
          return;
        }

        // Fallback to Bolt-only
        logger.debug("Using Bolt-only sources", {
          component: "InventoryRouter",
          integration: "bolt",
          operation: "getSources",
        });

        // Capture debug in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/sources',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addDebug(debugInfo, {
            message: "Using Bolt-only sources",
            level: 'debug',
          });
        }

        const duration = Date.now() - startTime;
        const responseData = {
          sources: {
            bolt: {
              type: "execution",
              status: "connected" as const,
              lastCheck: new Date().toISOString(),
            },
          },
        };

        // Attach debug info if expert mode is enabled
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/sources',
            requestId,
            duration
          );
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addInfo(debugInfo, {
            message: 'Retrieved Bolt source only',
            level: 'info',
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching inventory sources", {
          component: "InventoryRouter",
          operation: "getSources",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode (already exists below, but ensuring consistency)
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/sources',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Error fetching inventory sources",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch inventory sources",
          },
        });
      }
    }),
  );

  /**
   * GET /api/nodes/:id
   * Return specific node details from any inventory source
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching node details", {
        component: "InventoryRouter",
        operation: "getNode",
      });

      try {
        // Validate request parameters
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        logger.debug("Searching for node", {
          component: "InventoryRouter",
          operation: "getNode",
          metadata: { nodeId },
        });

        // Capture debug in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/:id',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addDebug(debugInfo, {
            message: "Searching for node",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        let node: Node | undefined;

        // If integration manager is available, search across all sources
        if (integrationManager?.isInitialized()) {
          logger.debug("Searching across all inventory sources", {
            component: "InventoryRouter",
            operation: "getNode",
          });

          // Capture debug in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              Date.now() - startTime
            );
            expertModeService.addDebug(debugInfo, {
              message: "Searching across all inventory sources",
              level: 'debug',
            });
          }

          const aggregated = await integrationManager.getLinkedInventory();
          node = aggregated.nodes.find(
            (n) => n.id === nodeId || n.name === nodeId,
          );
        } else {
          logger.debug("Searching in Bolt inventory only", {
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getNode",
          });

          // Capture debug in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              Date.now() - startTime
            );
            expertModeService.addDebug(debugInfo, {
              message: "Searching in Bolt inventory only",
              level: 'debug',
            });
          }

          // Fallback to Bolt-only inventory
          const nodes = await boltService.getInventory();
          node = nodes.find((n) => n.id === nodeId || n.name === nodeId);
        }

        if (!node) {
          const duration = Date.now() - startTime;
          logger.warn("Node not found in inventory", {
            component: "InventoryRouter",
            operation: "getNode",
            metadata: { nodeId },
          });

          const errorResponse = {
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          };

          // Attach debug info if expert mode is enabled
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Node '${nodeId}' not found in inventory`,
              context: `Searched for node with ID or name: ${nodeId}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(404).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(404).json(errorResponse);
          }
          return;
        }

        const duration = Date.now() - startTime;
        const nodeSource = (node as { source?: string }).source ?? "bolt";

        logger.info("Node details fetched successfully", {
          component: "InventoryRouter",
          integration: nodeSource,
          operation: "getNode",
          metadata: { nodeId, source: nodeSource, duration },
        });

        const responseData = { node };

        // Attach debug info if expert mode is enabled
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/:id',
            requestId,
            duration
          );
          expertModeService.setIntegration(debugInfo, nodeSource);
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'source', nodeSource);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved node ${nodeId} from ${nodeSource}`,
            level: 'info',
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const expertModeService = new ExpertModeService();
        const requestId = req.id ?? expertModeService.generateRequestId();

        if (error instanceof z.ZodError) {
          logger.warn("Invalid node ID parameter", {
            component: "InventoryRouter",
            operation: "getNode",
            metadata: { errors: error.errors },
          });

          // Capture warning in expert mode (already exists below, but ensuring consistency)
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid node ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
          }

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid node ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof BoltInventoryNotFoundError) {
          logger.warn("Bolt inventory not found", {
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getNode",
          });

          // Capture warning in expert mode (already exists below, but ensuring consistency)
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Bolt inventory not found",
              context: error.message,
              level: 'warn',
            });
          }

          res.status(404).json({
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof BoltExecutionError) {
          logger.error("Bolt execution failed", {
            component: "InventoryRouter",
            integration: "bolt",
            operation: "getNode",
          }, error);

          // Capture error in expert mode (already exists below, but ensuring consistency)
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/inventory/:id',
              requestId,
              duration
            );
            expertModeService.addError(debugInfo, {
              message: "Bolt execution failed",
              stack: error.stack,
              level: 'error',
            });
          }

          res.status(500).json({
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          });
          return;
        }

        // Unknown error
        logger.error("Error fetching node details", {
          component: "InventoryRouter",
          operation: "getNode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode (already exists below, but ensuring consistency)
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/inventory/:id',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Error fetching node details",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node details",
          },
        });
      }
    }),
  );

  return router;
}
