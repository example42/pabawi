import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
} from "../integrations/puppetdb";
import { asyncHandler } from "./asyncHandler";

/**
 * Request validation schemas
 */
const CertnameParamSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
});

const ReportParamsSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  hash: z.string().min(1, "Report hash is required"),
});

const PQLQuerySchema = z.object({
  query: z.string().optional(),
});

const ReportsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
});

/**
 * Create integrations router
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
): Router {
  const router = Router();

  /**
   * GET /api/integrations/status
   * Return status for all configured integrations
   *
   * Implements requirement 9.5: Display connection status for each integration source
   * Returns:
   * - Connection status for each integration
   * - Last health check time
   * - Error details if unhealthy
   *
   * Query parameters:
   * - refresh: If 'true', force a fresh health check instead of using cache
   */
  router.get(
    "/status",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Check if refresh is requested
        const refresh = req.query.refresh === "true";

        // Get health status from all registered plugins
        // Use cache unless refresh is explicitly requested
        const healthStatuses =
          await integrationManager.healthCheckAll(!refresh);

        // Transform health statuses into response format
        const integrations = Array.from(healthStatuses.entries()).map(
          ([name, status]) => {
            // Get plugin registration to include type information
            const plugins = integrationManager.getAllPlugins();
            const plugin = plugins.find((p) => p.plugin.name === name);

            return {
              name,
              type: plugin?.plugin.type ?? "unknown",
              status: status.healthy ? "connected" : "error",
              lastCheck: status.lastCheck,
              message: status.message,
              details: status.details,
            };
          },
        );

        res.json({
          integrations,
          timestamp: new Date().toISOString(),
          cached: !refresh,
        });
      } catch (error) {
        console.error("Error fetching integration status:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch integration status",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes
   * Return all nodes from PuppetDB inventory
   */
  router.get(
    "/puppetdb/nodes",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate query parameters
        const queryParams = PQLQuerySchema.parse(req.query);
        const pqlQuery = queryParams.query;

        // Get inventory from PuppetDB
        const nodes = await puppetDBService.getInventory(pqlQuery);

        res.json({
          nodes,
          source: "puppetdb",
          count: nodes.length,
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

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching PuppetDB inventory:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch inventory from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname
   * Return specific node details from PuppetDB
   */
  router.get(
    "/puppetdb/nodes/:certname",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Get all nodes from inventory
        const nodes = await puppetDBService.getInventory();

        // Find the specific node
        const node = nodes.find(
          (n) => n.id === certname || n.name === certname,
        );

        if (!node) {
          res.status(404).json({
            error: {
              code: "NODE_NOT_FOUND",
              message: `Node '${certname}' not found in PuppetDB`,
            },
          });
          return;
        }

        res.json({
          node,
          source: "puppetdb",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching node details from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node details from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname/facts
   * Return facts for a specific node from PuppetDB
   *
   * Implements requirement 2.1: Query PuppetDB for latest facts
   * Returns facts with:
   * - Source attribution (requirement 2.2)
   * - Categorization (requirement 2.3)
   * - Timestamp and source metadata (requirement 2.4)
   */
  router.get(
    "/puppetdb/nodes/:certname/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Get facts from PuppetDB
        const facts = await puppetDBService.getNodeFacts(certname);

        res.json({
          facts,
          source: "puppetdb",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Handle node not found
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({
            error: {
              code: "NODE_NOT_FOUND",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching facts from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch facts from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname/reports
   * Return Puppet reports for a specific node from PuppetDB
   *
   * Implements requirement 3.1: Query PuppetDB for recent Puppet reports
   * Returns reports with:
   * - Reverse chronological order (requirement 3.2)
   * - Run timestamp, status, and resource change summary (requirement 3.3)
   */
  router.get(
    "/puppetdb/nodes/:certname/reports",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const queryParams = ReportsQuerySchema.parse(req.query);
        const certname = params.certname;
        const limit = queryParams.limit;

        // Get reports from PuppetDB
        const reports = await puppetDBService.getNodeReports(certname, limit);

        res.json({
          reports,
          source: "puppetdb",
          count: reports.length,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching reports from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch reports from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname/reports/:hash
   * Return detailed information for a specific Puppet report
   *
   * Implements requirement 3.4: Display detailed report information
   * Returns report with:
   * - Changed resources
   * - Logs
   * - Metrics
   */
  router.get(
    "/puppetdb/nodes/:certname/reports/:hash",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = ReportParamsSchema.parse(req.params);
        const { certname, hash } = params;

        // Get specific report from PuppetDB
        const report = await puppetDBService.getReport(hash);

        if (!report) {
          res.status(404).json({
            error: {
              code: "REPORT_NOT_FOUND",
              message: `Report '${hash}' not found for node '${certname}'`,
            },
          });
          return;
        }

        // Verify the report belongs to the requested node
        if (report.certname !== certname) {
          res.status(404).json({
            error: {
              code: "REPORT_NOT_FOUND",
              message: `Report '${hash}' does not belong to node '${certname}'`,
            },
          });
          return;
        }

        res.json({
          report,
          source: "puppetdb",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching report from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch report from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname/catalog
   * Return Puppet catalog for a specific node from PuppetDB
   *
   * Implements requirement 4.1: Query PuppetDB for latest catalog
   * Returns catalog with:
   * - Catalog resources in structured format (requirement 4.2)
   * - Metadata (timestamp, environment) (requirement 4.5)
   *
   * Query parameters:
   * - resourceType: Optional filter to return only resources of a specific type
   */
  router.get(
    "/puppetdb/nodes/:certname/catalog",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Check for resourceType query parameter
        const resourceType =
          typeof req.query.resourceType === "string"
            ? req.query.resourceType
            : undefined;

        // Get catalog from PuppetDB
        const catalog = await puppetDBService.getNodeCatalog(certname);

        if (!catalog) {
          res.status(404).json({
            error: {
              code: "CATALOG_NOT_FOUND",
              message: `Catalog not found for node '${certname}'`,
            },
          });
          return;
        }

        // If resourceType filter is specified, get organized resources
        if (resourceType) {
          const resourcesByType = await puppetDBService.getCatalogResources(
            certname,
            resourceType,
          );

          res.json({
            catalog: {
              ...catalog,
              resources: resourcesByType[resourceType] ?? [],
            },
            source: "puppetdb",
            filtered: true,
            resourceType,
          });
          return;
        }

        res.json({
          catalog,
          source: "puppetdb",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching catalog from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch catalog from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname/events
   * Return Puppet events for a specific node from PuppetDB
   *
   * Implements requirement 5.1: Query PuppetDB for recent events
   * Returns events with:
   * - Reverse chronological order (requirement 5.2)
   * - Event timestamp, resource, status, and message (requirement 5.3)
   * - Filtering by status, resource type, and time range (requirement 5.5)
   *
   * Query parameters:
   * - status: Filter by event status (success, failure, noop, skipped)
   * - resourceType: Filter by resource type
   * - startTime: Filter events after this timestamp
   * - endTime: Filter events before this timestamp
   * - limit: Maximum number of events to return (default: 100)
   */
  router.get(
    "/puppetdb/nodes/:certname/events",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetDBService) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        });
        return;
      }

      if (!puppetDBService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Build event filters from query parameters
        const filters: {
          status?: "success" | "failure" | "noop" | "skipped";
          resourceType?: string;
          startTime?: string;
          endTime?: string;
          limit?: number;
        } = {};

        // Parse status filter
        if (typeof req.query.status === "string") {
          const status = req.query.status.toLowerCase();
          if (["success", "failure", "noop", "skipped"].includes(status)) {
            filters.status = status as
              | "success"
              | "failure"
              | "noop"
              | "skipped";
          }
        }

        // Parse resourceType filter
        if (typeof req.query.resourceType === "string") {
          filters.resourceType = req.query.resourceType;
        }

        // Parse time range filters
        if (typeof req.query.startTime === "string") {
          filters.startTime = req.query.startTime;
        }

        if (typeof req.query.endTime === "string") {
          filters.endTime = req.query.endTime;
        }

        // Parse limit
        if (typeof req.query.limit === "string") {
          const limit = parseInt(req.query.limit, 10);
          if (!isNaN(limit) && limit > 0) {
            filters.limit = limit;
          }
        }

        // Get events from PuppetDB
        const events = await puppetDBService.getNodeEvents(certname, filters);

        res.json({
          events,
          source: "puppetdb",
          count: events.length,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          res.status(401).json({
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          res.status(400).json({
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching events from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch events from PuppetDB",
          },
        });
      }
    }),
  );

  return router;
}
