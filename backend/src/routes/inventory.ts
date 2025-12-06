import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../bolt/BoltService";
import {
  BoltInventoryNotFoundError,
  BoltExecutionError,
  BoltParseError,
  type Node,
} from "../bolt/types";
import { asyncHandler } from "./asyncHandler";
import type { IntegrationManager } from "../integrations/IntegrationManager";

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

const InventoryQuerySchema = z.object({
  sources: z.string().optional(),
  pql: z.string().optional(),
  certificateStatus: z.string().optional(),
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
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate query parameters
        const query = InventoryQuerySchema.parse(req.query);

        // Parse sources parameter
        const requestedSources = query.sources
          ? query.sources.split(",").map((s) => s.trim().toLowerCase())
          : ["all"];

        // If integration manager is available and sources include more than just bolt
        if (
          integrationManager &&
          integrationManager.isInitialized() &&
          (requestedSources.includes("all") ||
            requestedSources.some((s) => s !== "bolt"))
        ) {
          // Get linked inventory from all sources (Requirement 3.3)
          const aggregated = await integrationManager.getLinkedInventory();

          // Filter by requested sources if specified
          let filteredNodes = aggregated.nodes;
          if (!requestedSources.includes("all")) {
            filteredNodes = aggregated.nodes.filter((node) => {
              const nodeSource = (node as { source?: string }).source ?? "bolt";
              return requestedSources.includes(nodeSource);
            });
          }

          // Filter by certificate status for Puppetserver nodes (Requirement 2.2)
          if (query.certificateStatus) {
            const statusFilter = query.certificateStatus
              .split(",")
              .map((s) => s.trim().toLowerCase());
            filteredNodes = filteredNodes.filter((node) => {
              const nodeWithCert = node as {
                source?: string;
                certificateStatus?: string;
              };
              // Only filter Puppetserver nodes
              if (nodeWithCert.source === "puppetserver") {
                return (
                  nodeWithCert.certificateStatus &&
                  statusFilter.includes(
                    nodeWithCert.certificateStatus.toLowerCase(),
                  )
                );
              }
              // Keep non-Puppetserver nodes
              return true;
            });
          }

          // Apply PQL filter if specified (only for PuppetDB nodes)
          if (query.pql) {
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

                // Filter to only include nodes that match PQL query
                filteredNodes = filteredNodes.filter((node) => {
                  const nodeSource =
                    (node as { source?: string }).source ?? "bolt";
                  if (nodeSource === "puppetdb") {
                    return pqlNodeIds.has(node.id);
                  }
                  return true; // Keep non-PuppetDB nodes
                });
              } catch (error) {
                console.error("Error applying PQL filter:", error);
                // Return error response for PQL query failures
                res.status(400).json({
                  error: {
                    code: "PQL_QUERY_ERROR",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to apply PQL query",
                  },
                });
                return;
              }
            }
          }

          // Sort nodes if requested (Requirement 2.2)
          if (query.sortBy) {
            const sortOrder = query.sortOrder ?? "asc";
            const sortMultiplier = sortOrder === "asc" ? 1 : -1;

            filteredNodes.sort((a, b) => {
              const nodeA = a as {
                source?: string;
                certificateStatus?: string;
                name?: string;
              };
              const nodeB = b as {
                source?: string;
                certificateStatus?: string;
                name?: string;
              };

              switch (query.sortBy) {
                case "certificateStatus": {
                  // Sort by certificate status (signed < requested < revoked)
                  const statusOrder = { signed: 1, requested: 2, revoked: 3 };
                  const statusA =
                    statusOrder[
                      nodeA.certificateStatus as keyof typeof statusOrder
                    ] || 999;
                  const statusB =
                    statusOrder[
                      nodeB.certificateStatus as keyof typeof statusOrder
                    ] || 999;
                  return (statusA - statusB) * sortMultiplier;
                }
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

          res.json({
            nodes: filteredNodes,
            sources: filteredSources,
          });
          return;
        }

        // Fallback to Bolt-only inventory
        const nodes = await boltService.getInventory();
        res.json({
          nodes,
          sources: {
            bolt: {
              nodeCount: nodes.length,
              lastSync: new Date().toISOString(),
              status: "healthy" as const,
            },
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid query parameters",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof BoltInventoryNotFoundError) {
          res.status(404).json({
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof BoltExecutionError) {
          res.status(500).json({
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          });
          return;
        }

        if (error instanceof BoltParseError) {
          res.status(500).json({
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching inventory:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch inventory",
          },
        });
      }
    }),
  );

  /**
   * GET /api/inventory/sources
   * Return available inventory sources and their status
   */
  router.get(
    "/sources",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      try {
        if (integrationManager?.isInitialized()) {
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
          }

          res.json({ sources });
          return;
        }

        // Fallback to Bolt-only
        res.json({
          sources: {
            bolt: {
              type: "execution",
              status: "connected" as const,
              lastCheck: new Date().toISOString(),
            },
          },
        });
      } catch (error) {
        console.error("Error fetching inventory sources:", error);
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
   * Return specific node details
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = NodeIdParamSchema.parse(req.params);
        const nodeId = params.id;

        // Get all nodes from inventory
        const nodes = await boltService.getInventory();

        // Find the specific node
        const node = nodes.find((n) => n.id === nodeId || n.name === nodeId);

        if (!node) {
          res.status(404).json({
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          });
          return;
        }

        res.json({ node });
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

        if (error instanceof BoltInventoryNotFoundError) {
          res.status(404).json({
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof BoltExecutionError) {
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
        console.error("Error fetching node details:", error);
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
