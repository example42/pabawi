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

/**
 * Middleware enforcing authentication/authorization for lifecycle actions.
 *
 * This uses a simple bearer token check so that protection travels with the
 * endpoint instead of relying solely on how the router is mounted.
 *
 * Configure the shared secret via the PABAWI_LIFECYCLE_TOKEN environment variable.
 */
function requireLifecycleAuth(req: Request, res: Response, next: () => void): void {
  const token = process.env.PABAWI_LIFECYCLE_TOKEN;

  if (!token) {
    res.status(500).json({
      error: {
        code: "LIFECYCLE_AUTH_MISCONFIGURED",
        message: "Lifecycle authentication is not configured on the server",
      },
    });
    return;
  }

  const authHeader = req.headers["authorization"];
  const expectedHeader = `Bearer ${token}`;

  if (authHeader !== expectedHeader) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized to perform lifecycle actions",
      },
    });
    return;
  }

  next();
}

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
  options?: { allowDestructiveActions?: boolean },
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

          // Get aggregated inventory from all sources (includes groups)
          const aggregated = await integrationManager.getAggregatedInventory();

          // Filter by requested sources if specified
          let filteredNodes = aggregated.nodes;
          let filteredGroups = aggregated.groups;

          if (!requestedSources.includes("all")) {
            filteredNodes = aggregated.nodes.filter((node) => {
              // Check both 'sources' (plural, from linked nodes) and 'source' (singular, from single-source nodes)
              const linkedNode = node as { source?: string; sources?: string[] };
              const nodeSources = linkedNode.sources && linkedNode.sources.length > 0
                ? linkedNode.sources
                : [linkedNode.source ?? "bolt"];
              return nodeSources.some((s) => requestedSources.includes(s));
            });

            // Apply same source filtering to groups
            filteredGroups = aggregated.groups.filter((group) => {
              const linkedGroup = group as { source?: string; sources?: string[] };
              const groupSources = linkedGroup.sources && linkedGroup.sources.length > 0
                ? linkedGroup.sources
                : [linkedGroup.source ?? "bolt"];
              return groupSources.some((s) => requestedSources.includes(s));
            });

            logger.debug("Filtered nodes and groups by source", {
              component: "InventoryRouter",
              operation: "getInventory",
              metadata: {
                originalNodeCount: aggregated.nodes.length,
                filteredNodeCount: filteredNodes.length,
                originalGroupCount: aggregated.groups.length,
                filteredGroupCount: filteredGroups.length
              },
            });

            // Capture debug in expert mode
            if (debugInfo) {
              expertModeService.addDebug(debugInfo, {
                message: "Filtered nodes and groups by source",
                context: JSON.stringify({
                  originalNodeCount: aggregated.nodes.length,
                  filteredNodeCount: filteredNodes.length,
                  originalGroupCount: aggregated.groups.length,
                  filteredGroupCount: filteredGroups.length
                }),
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

            // Apply same sorting to groups
            filteredGroups.sort((a, b) => {
              const groupA = a as {
                source?: string;
                name?: string;
              };
              const groupB = b as {
                source?: string;
                name?: string;
              };

              switch (query.sortBy) {
                case "name": {
                  // Sort by group name
                  const nameA = groupA.name ?? "";
                  const nameB = groupB.name ?? "";
                  return nameA.localeCompare(nameB) * sortMultiplier;
                }
                case "source": {
                  // Sort by source
                  const sourceA = groupA.source ?? "";
                  const sourceB = groupB.source ?? "";
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
            metadata: {
              nodeCount: filteredNodes.length,
              groupCount: filteredGroups.length,
              sourceCount: Object.keys(filteredSources).length,
              duration
            },
          });

          const responseData = {
            nodes: filteredNodes,
            groups: filteredGroups,
            sources: filteredSources,
          };

          // Attach debug info if expert mode is enabled
          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addMetadata(debugInfo, 'nodeCount', filteredNodes.length);
            expertModeService.addMetadata(debugInfo, 'groupCount', filteredGroups.length);
            expertModeService.addMetadata(debugInfo, 'requestedSources', requestedSources);
            expertModeService.addMetadata(debugInfo, 'pqlQuery', query.pql);
            expertModeService.addInfo(debugInfo, {
              message: `Retrieved ${String(filteredNodes.length)} nodes and ${String(filteredGroups.length)} groups from ${String(Object.keys(filteredSources).length)} sources`,
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
          groups: [], // Bolt-only mode doesn't have groups yet
          sources: {
            bolt: {
              nodeCount: nodes.length,
              groupCount: 0,
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

          const useCache = req.query.nocache !== '1';
          const aggregated = await integrationManager.getLinkedInventory(useCache);
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

  /**
   * Map action names to the node states where they are available.
   * This provides sensible defaults; the frontend can further refine.
   */
  function getAvailableWhen(actionName: string): string[] {
    const mapping: Record<string, string[]> = {
      start: ["stopped"],
      stop: ["running", "paused"],
      shutdown: ["running", "paused"],
      reboot: ["running", "paused"],
      suspend: ["running"],
      resume: ["suspended", "paused"],
      snapshot: ["running", "stopped"],
      terminate: ["running", "stopped", "suspended", "paused", "unknown"],
      destroy: ["stopped", "running", "suspended", "paused", "unknown"],
      destroy_vm: ["stopped", "running", "suspended", "paused", "unknown"],
      destroy_lxc: ["stopped", "running", "suspended", "paused", "unknown"],
    };
    return mapping[actionName] ?? [];
  }

  /**
   * Resolve the provider name from a node ID prefix.
   * Node IDs follow the pattern "{provider}:{...}" (e.g. "proxmox:node:vmid", "aws:region:instanceId").
   * Returns null when the prefix doesn't map to a known integration.
   */
  function resolveProvider(nodeId: string): string | null {
    const prefix = nodeId.split(":")[0];
    const providerMap: Record<string, string> = {
      proxmox: "proxmox",
      aws: "aws",
    };
    return providerMap[prefix] ?? null;
  }

  /**
   * Look up the execution tool for a given node ID.
   * Returns the tool and provider name, or sends an error response and returns null.
   */
  function getExecutionToolForNode(
    nodeId: string,
    res: Response,
  ): { tool: import("../integrations/types").ExecutionToolPlugin; provider: string } | null {
    if (!integrationManager?.isInitialized()) {
      res.status(503).json({
        error: { code: "INTEGRATION_NOT_AVAILABLE", message: "Integration manager is not available" },
      });
      return null;
    }

    const provider = resolveProvider(nodeId);
    if (!provider) {
      res.status(400).json({
        error: {
          code: "UNSUPPORTED_PROVIDER",
          message: `No provisioning provider found for node ID: ${nodeId}`,
        },
      });
      return null;
    }

    const tool = integrationManager.getExecutionTool(provider);
    if (!tool) {
      res.status(503).json({
        error: {
          code: "PROVIDER_NOT_CONFIGURED",
          message: `Integration "${provider}" is not configured`,
        },
      });
      return null;
    }

    return { tool, provider };
  }

  /**
   * GET /api/nodes/:id/lifecycle-actions
   * Discover available lifecycle actions for a node based on its provider.
   * Returns actions with metadata so the frontend can render them dynamically.
   */
  router.get(
    "/:id/lifecycle-actions",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const params = NodeIdParamSchema.parse(req.params);
      const nodeId = params.id;

      const resolved = getExecutionToolForNode(nodeId, res);
      if (!resolved) return;

      const { tool, provider } = resolved;
      const capabilities = tool.listCapabilities();

      // Build lifecycle action definitions from the provider's capabilities
      const actions = capabilities.map((cap) => {
        const isDestructive = ["destroy", "terminate", "destroy_vm", "destroy_lxc"].includes(cap.name);
        return {
          name: cap.name,
          displayName: cap.name.charAt(0).toUpperCase() + cap.name.slice(1).replace(/_/g, " "),
          description: cap.description,
          requiresConfirmation: isDestructive,
          destructive: isDestructive,
          // Provider-specific availability hints; frontend can refine with node status
          availableWhen: getAvailableWhen(cap.name),
        };
      });

      // Add destroy action from provisioning capabilities if not already present
      const provisioningTool = tool as unknown as { listProvisioningCapabilities?: () => Array<{ name: string; description: string; operation: string }> };
      if (typeof provisioningTool.listProvisioningCapabilities === "function") {
        const provCaps = provisioningTool.listProvisioningCapabilities();
        for (const cap of provCaps) {
          if (cap.operation === "destroy" && !actions.some((a) => a.name === cap.name)) {
            actions.push({
              name: cap.name,
              displayName: cap.name.charAt(0).toUpperCase() + cap.name.slice(1).replace(/_/g, " "),
              description: cap.description,
              requiresConfirmation: true,
              destructive: true,
              availableWhen: ["stopped", "running", "suspended", "unknown"],
            });
          }
        }
      }

      logger.info("Lifecycle actions resolved", {
        component: "InventoryRouter",
        operation: "getLifecycleActions",
        metadata: { nodeId, provider, actionCount: actions.length },
      });

      // Filter out destructive actions when destructive provisioning is disabled
      const filteredActions = options?.allowDestructiveActions === false
        ? actions.filter((a) => !a.destructive)
        : actions;

      res.json({ provider, actions: filteredActions });
    }),
  );

  /**
   * POST /api/nodes/:id/action
   * Execute a lifecycle action on a node via its provider integration.
   * Provider-agnostic: routes to the correct integration based on node ID prefix.
   *
   * Authentication/RBAC is enforced explicitly via requireLifecycleAuth in this
   * router so protection travels with the endpoint. Additional RBAC middleware
   * may still be applied at the route mounting level in server.ts.
   * Required permission: lifecycle:* or lifecycle:{action}
   */
  router.post(
    "/:id/action",
    requireLifecycleAuth,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();

      logger.info("Executing node action", {
        component: "InventoryRouter",
        operation: "executeNodeAction",
      });

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        // Accept any action string — the provider will validate it
        const ActionSchema = z.object({
          action: z.string().min(1),
          parameters: z.record(z.unknown()).optional(),
        });
        const body = ActionSchema.parse(req.body);

        // Guard: reject destructive actions when disabled
        const destructiveActions = ["destroy", "destroy_vm", "destroy_lxc", "terminate", "terminate_instance"];
        if (destructiveActions.includes(body.action) && options?.allowDestructiveActions === false) {
          res.status(403).json({
            error: {
              code: "DESTRUCTIVE_ACTION_DISABLED",
              message: "Destructive provisioning actions are disabled by configuration (ALLOW_DESTRUCTIVE_PROVISIONING=false)",
            },
          });
          return;
        }

        const resolved = getExecutionToolForNode(nodeId, res);
        if (!resolved) return;

        const { tool, provider } = resolved;

        logger.debug("Executing action on node", {
          component: "InventoryRouter",
          operation: "executeNodeAction",
          metadata: { nodeId, provider, action: body.action },
        });

        const result = await tool.executeAction({
          type: "task",
          target: nodeId,
          action: body.action,
          parameters: body.parameters,
        });

        const duration = Date.now() - startTime;

        if (result.status === "failed") {
          logger.error("Node action failed", {
            component: "InventoryRouter",
            integration: provider,
            operation: "executeNodeAction",
            metadata: { nodeId, action: body.action, duration, error: result.error },
          });
          res.status(500).json({
            error: {
              code: "ACTION_EXECUTION_FAILED",
              message: result.error ?? `Action ${body.action} failed`,
            },
            result,
          });
          return;
        }

        logger.info("Node action executed successfully", {
          component: "InventoryRouter",
          integration: provider,
          operation: "executeNodeAction",
          metadata: { nodeId, action: body.action, duration },
        });

        res.json({
          success: true,
          message: `Action ${body.action} executed successfully`,
          result,
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request parameters", {
            component: "InventoryRouter",
            operation: "executeNodeAction",
            metadata: { errors: error.errors },
          });

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        logger.error("Error executing node action", {
          component: "InventoryRouter",
          operation: "executeNodeAction",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "ACTION_EXECUTION_FAILED",
            message: error instanceof Error ? error.message : "Failed to execute action",
          },
        });
      }
    }),
  );

  /**
   * DELETE /api/nodes/:id
   * Destroy a node (permanently delete VM, container, or cloud instance).
   * Provider-agnostic: routes to the correct integration based on node ID prefix.
   *
   * Note: RBAC middleware should be applied at the route mounting level in server.ts
   * Required permission: lifecycle:destroy
   */
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();

      logger.info("Destroying node", {
        component: "InventoryRouter",
        operation: "destroyNode",
      });

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        const resolved = getExecutionToolForNode(nodeId, res);
        if (!resolved) return;

        const { tool, provider } = resolved;

        logger.debug("Destroying node", {
          component: "InventoryRouter",
          operation: "destroyNode",
          metadata: { nodeId, provider },
        });

        // Determine the correct destroy action based on provider
        let destroyAction: string;
        let destroyParams: Record<string, unknown> | undefined;

        if (provider === "proxmox") {
          const parts = nodeId.split(":");
          if (parts.length !== 3) {
            res.status(400).json({
              error: { code: "INVALID_NODE_ID", message: "Invalid Proxmox node ID format" },
            });
            return;
          }
          const node = parts[1];
          const vmid = parseInt(parts[2], 10);
          if (!Number.isFinite(vmid)) {
            res.status(400).json({
              error: { code: "INVALID_NODE_ID", message: "Invalid Proxmox node ID: vmid is not a valid number" },
            });
            return;
          }
          destroyAction = "destroy_vm";
          destroyParams = { node, vmid };
        } else if (provider === "aws") {
          destroyAction = "terminate";
          destroyParams = undefined;
        } else {
          destroyAction = "destroy";
          destroyParams = undefined;
        }

        const result = await tool.executeAction({
          type: "task",
          target: nodeId,
          action: destroyAction,
          parameters: destroyParams,
        });

        const duration = Date.now() - startTime;

        if (result.status === "failed") {
          logger.error("Node destruction failed", {
            component: "InventoryRouter",
            integration: provider,
            operation: "destroyNode",
            metadata: { nodeId, duration, error: result.error },
          });
          res.status(500).json({
            error: {
              code: "DESTROY_FAILED",
              message: result.error ?? "Failed to destroy node",
            },
            result,
          });
          return;
        }

        logger.info("Node destroyed successfully", {
          component: "InventoryRouter",
          integration: provider,
          operation: "destroyNode",
          metadata: { nodeId, duration },
        });

        res.json({
          success: true,
          message: "Node destroyed successfully",
          result,
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request parameters", {
            component: "InventoryRouter",
            operation: "destroyNode",
            metadata: { errors: error.errors },
          });

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        logger.error("Error destroying node", {
          component: "InventoryRouter",
          operation: "destroyNode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "DESTROY_FAILED",
            message: error instanceof Error ? error.message : "Failed to destroy node",
          },
        });
      }
    }),
  );

  return router;
}
