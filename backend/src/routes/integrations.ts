import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
} from "../integrations/puppetdb";
import {
  PuppetserverConnectionError,
  PuppetserverConfigurationError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "../integrations/puppetserver/errors";
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

const CatalogParamsSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  environment: z.string().min(1, "Environment is required"),
});

const CatalogCompareSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  environment1: z.string().min(1, "First environment is required"),
  environment2: z.string().min(1, "Second environment is required"),
});

const EnvironmentParamSchema = z.object({
  name: z.string().min(1, "Environment name is required"),
});

/**
 * Create integrations router
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
): Router {
  const router = Router();

  /**
   * GET /api/integrations/status
   * Return status for all configured and available integrations
   *
   * Implements requirement 9.5: Display connection status for each integration source
   * Returns:
   * - Connection status for each integration
   * - Last health check time
   * - Error details if unhealthy
   * - Configuration status for available but unconfigured integrations
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

            // Determine status: degraded takes precedence over error
            let integrationStatus: string;
            if (status.healthy) {
              integrationStatus = "connected";
            } else if (status.degraded) {
              integrationStatus = "degraded";
            } else {
              integrationStatus = "error";
            }

            return {
              name,
              type: plugin?.plugin.type ?? "unknown",
              status: integrationStatus,
              lastCheck: status.lastCheck,
              message: status.message,
              details: status.details,
              workingCapabilities: status.workingCapabilities,
              failingCapabilities: status.failingCapabilities,
            };
          },
        );

        // Add unconfigured integrations (like PuppetDB or Puppetserver if not configured)
        const configuredNames = new Set(integrations.map((i) => i.name));

        // Check if PuppetDB is not configured
        if (!puppetDBService && !configuredNames.has("puppetdb")) {
          integrations.push({
            name: "puppetdb",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "PuppetDB integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Puppetserver is not configured
        if (!puppetserverService && !configuredNames.has("puppetserver")) {
          integrations.push({
            name: "puppetserver",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Puppetserver integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Bolt is not configured
        if (!configuredNames.has("bolt")) {
          integrations.push({
            name: "bolt",
            type: "both",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Bolt integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Hiera is not configured
        if (!configuredNames.has("hiera")) {
          integrations.push({
            name: "hiera",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Hiera integration is not configured",
            details: {
              setupRequired: true,
              setupUrl: "/integrations/hiera/setup",
            },
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

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
   * GET /api/integrations/puppetdb/reports/summary
   * Return summary statistics of recent Puppet reports across all nodes
   *
   * Used for home page dashboard display.
   * Returns aggregated statistics:
   * - Total number of recent reports
   * - Count of failed reports
   * - Count of changed reports
   * - Count of unchanged reports
   * - Count of noop reports
   */
  router.get(
    "/puppetdb/reports/summary",
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
        // Get query parameters
        const queryParams = ReportsQuerySchema.parse(req.query);
        const limit = queryParams.limit || 100; // Default to 100 for summary
        const hoursValue = req.query.hours;
        const hours = typeof hoursValue === 'string'
          ? parseInt(hoursValue, 10)
          : undefined;

        // Get reports summary from PuppetDB
        const summary = await puppetDBService.getReportsSummary(limit, hours);

        res.json({
          summary,
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
        console.error("Error fetching reports summary from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch reports summary from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/reports
   * Return all recent Puppet reports across all nodes from PuppetDB
   *
   * Used for Puppet page reports tab.
   * Returns reports with:
   * - Reverse chronological order
   * - Run timestamp, status, and resource change summary
   * - Limit parameter to control number of results
   */
  router.get(
    "/puppetdb/reports",
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
        // Get query parameters
        const queryParams = ReportsQuerySchema.parse(req.query);
        const limit = queryParams.limit || 100;

        // Get all reports from PuppetDB
        const reports = await puppetDBService.getAllReports(limit);

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
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching all reports from PuppetDB:", error);
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
   * GET /api/integrations/puppetdb/nodes/:certname/resources
   * Return managed resources for a specific node from PuppetDB
   *
   * Implements requirement 16.13: Use PuppetDB /pdb/query/v4/resources endpoint
   * Returns resources organized by type.
   */
  router.get(
    "/puppetdb/nodes/:certname/resources",
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

        // Get resources from PuppetDB
        const resourcesByType =
          await puppetDBService.getNodeResources(certname);

        res.json({
          resources: resourcesByType,
          source: "puppetdb",
          certname,
          typeCount: Object.keys(resourcesByType).length,
          totalResources: Object.values(resourcesByType).reduce(
            (sum, resources) => sum + resources.length,
            0,
          ),
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
        console.error("Error fetching resources from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch resources from PuppetDB",
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

  /**
   * GET /api/integrations/puppetdb/admin/archive
   * Return PuppetDB archive information
   *
   * Implements requirement 16.7: Display PuppetDB admin components
   * Returns information about PuppetDB's archive functionality.
   */
  router.get(
    "/puppetdb/admin/archive",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
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
        const archiveInfo = await puppetDBService.getArchiveInfo();

        res.json({
          archive: archiveInfo,
          source: "puppetdb",
        });
      } catch (error) {
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
        console.error("Error fetching archive info from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch archive info from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/admin/summary-stats
   * Return PuppetDB summary statistics
   *
   * Implements requirement 16.7: Display PuppetDB admin components with performance warning
   * WARNING: This endpoint can be resource-intensive on large PuppetDB instances.
   * Returns database statistics including node counts, resource counts, etc.
   */
  router.get(
    "/puppetdb/admin/summary-stats",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
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
        const summaryStats = await puppetDBService.getSummaryStats();

        res.json({
          stats: summaryStats,
          source: "puppetdb",
          warning:
            "This endpoint can be resource-intensive on large PuppetDB instances",
        });
      } catch (error) {
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
        console.error("Error fetching summary stats from PuppetDB:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch summary stats from PuppetDB",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes
   * Return all nodes from Puppetserver CA inventory
   *
   * Implements requirement 2.1: Retrieve nodes from CA and transform to normalized inventory format
   */
  router.get(
    "/puppetserver/nodes",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Get inventory from Puppetserver
        const nodes = await puppetserverService.getInventory();

        res.json({
          nodes,
          source: "puppetserver",
          count: nodes.length,
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching nodes from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch nodes from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes/:certname
   * Return specific node details from Puppetserver CA
   *
   * Implements requirement 2.1: Retrieve specific node from CA
   */
  router.get(
    "/puppetserver/nodes/:certname",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Get node from Puppetserver
        const node = await puppetserverService.getNode(certname);

        if (!node) {
          res.status(404).json({
            error: {
              code: "NODE_NOT_FOUND",
              message: `Node '${certname}' not found in Puppetserver CA`,
            },
          });
          return;
        }

        res.json({
          node,
          source: "puppetserver",
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

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching node from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes/:certname/status
   * Return node status from Puppetserver
   *
   * Implements requirement 4.1: Query Puppetserver for node status information
   * Returns status with:
   * - Last run timestamp, catalog version, and run status (requirement 4.2)
   * - Activity categorization (active, inactive, never checked in) (requirement 4.3)
   */
  router.get(
    "/puppetserver/nodes/:certname/status",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Get node status from Puppetserver
        const status = await puppetserverService.getNodeStatus(certname);

        // Add activity categorization
        const activityCategory =
          puppetserverService.categorizeNodeActivity(status);
        const shouldHighlight = puppetserverService.shouldHighlightNode(status);
        const secondsSinceLastCheckIn =
          puppetserverService.getSecondsSinceLastCheckIn(status);

        res.json({
          status,
          activityCategory,
          shouldHighlight,
          secondsSinceLastCheckIn,
          source: "puppetserver",
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

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Handle node not found
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({
            error: {
              code: "NODE_STATUS_NOT_FOUND",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching node status from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node status from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes/:certname/facts
   * Return facts for a specific node from Puppetserver
   *
   * Implements requirement 6.1: Query Puppetserver for node facts
   * Returns facts with:
   * - Source attribution (requirement 6.2)
   * - Categorization by type (system, network, hardware, custom) (requirement 6.4)
   * - Timestamp for freshness comparison (requirement 6.3)
   */
  router.get(
    "/puppetserver/nodes/:certname/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        // Get facts from Puppetserver
        const facts = await puppetserverService.getNodeFacts(certname);

        res.json({
          facts,
          source: "puppetserver",
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

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
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
        console.error("Error fetching facts from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch facts from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/catalog/:certname/:environment
   * Compile and return catalog for a node in a specific environment
   *
   * Implements requirement 5.2: Call Puppetserver catalog compilation API
   * Returns catalog with:
   * - Compiled catalog resources in structured format (requirement 5.3)
   * - Environment name, compilation timestamp, and catalog version (requirement 5.4)
   * - Detailed error messages with line numbers on failure (requirement 5.5)
   */
  router.get(
    "/puppetserver/catalog/:certname/:environment",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = CatalogParamsSchema.parse(req.params);
        const { certname, environment } = params;

        // Compile catalog from Puppetserver
        const catalog = await puppetserverService.compileCatalog(
          certname,
          environment,
        );

        res.json({
          catalog,
          source: "puppetserver",
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

        if (error instanceof CatalogCompilationError) {
          res.status(400).json({
            error: {
              code: "CATALOG_COMPILATION_ERROR",
              message: error.message,
              certname: error.certname,
              environment: error.environment,
              compilationErrors: error.compilationErrors,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error compiling catalog from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to compile catalog from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * POST /api/integrations/puppetserver/catalog/compare
   * Compare catalogs between two environments for a node
   *
   * Implements requirement 15.2: Compile catalogs for both environments
   * Returns catalog diff with:
   * - Added, removed, and modified resources (requirement 15.3)
   * - Resource parameter changes highlighted (requirement 15.4)
   * - Detailed error messages for failed compilations (requirement 15.5)
   *
   * Request body:
   * - certname: Node certname
   * - environment1: First environment name
   * - environment2: Second environment name
   */
  router.post(
    "/puppetserver/catalog/compare",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request body
        console.warn(
          "[Catalog Compare] Request body:",
          JSON.stringify(req.body),
        );
        const body = CatalogCompareSchema.parse(req.body);
        const { certname, environment1, environment2 } = body;
        console.warn("[Catalog Compare] Parsed values:", {
          certname,
          environment1,
          environment2,
        });

        // Compare catalogs from Puppetserver
        const diff = await puppetserverService.compareCatalogs(
          certname,
          environment1,
          environment2,
        );

        res.json({
          diff,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request body",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof CatalogCompilationError) {
          res.status(400).json({
            error: {
              code: "CATALOG_COMPILATION_ERROR",
              message: error.message,
              certname: error.certname,
              environment: error.environment,
              compilationErrors: error.compilationErrors,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error comparing catalogs from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to compare catalogs from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/environments
   * Return list of available Puppet environments
   *
   * Implements requirement 7.1: Retrieve list of available environments
   * Returns environments with:
   * - Environment names and metadata (requirement 7.2)
   * - Last deployment timestamp and status (requirement 7.5)
   */
  router.get(
    "/puppetserver/environments",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Get environments from Puppetserver
        const environments = await puppetserverService.listEnvironments();

        res.json({
          environments,
          source: "puppetserver",
          count: environments.length,
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching environments from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch environments from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/environments/:name
   * Return details for a specific Puppet environment
   *
   * Implements requirement 7.1: Retrieve specific environment details
   * Returns environment with:
   * - Environment name and metadata (requirement 7.2)
   * - Last deployment timestamp and status (requirement 7.5)
   */
  router.get(
    "/puppetserver/environments/:name",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = EnvironmentParamSchema.parse(req.params);
        const name = params.name;

        // Get environment from Puppetserver
        const environment = await puppetserverService.getEnvironment(name);

        if (!environment) {
          res.status(404).json({
            error: {
              code: "ENVIRONMENT_NOT_FOUND",
              message: `Environment '${name}' not found in Puppetserver`,
            },
          });
          return;
        }

        res.json({
          environment,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid environment name parameter",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching environment from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch environment from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * POST /api/integrations/puppetserver/environments/:name/deploy
   * Deploy a Puppet environment
   *
   * Implements requirement 7.4: Trigger environment deployment
   * Returns deployment result with:
   * - Deployment status (success/failed)
   * - Deployment timestamp
   * - Error message if failed
   */
  router.post(
    "/puppetserver/environments/:name/deploy",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Validate request parameters
        const params = EnvironmentParamSchema.parse(req.params);
        const name = params.name;

        // Deploy environment in Puppetserver
        const result = await puppetserverService.deployEnvironment(name);

        res.json({
          result,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid environment name parameter",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof EnvironmentDeploymentError) {
          res.status(400).json({
            error: {
              code: "ENVIRONMENT_DEPLOYMENT_ERROR",
              message: error.message,
              environment: error.environment,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error deploying environment in Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to deploy environment in Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/status/services
   * Get services status from Puppetserver
   *
   * Implements requirement 17.1: Display component for /status/v1/services
   * Returns detailed status information for all Puppetserver services.
   */
  router.get(
    "/puppetserver/status/services",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        const servicesStatus = await puppetserverService.getServicesStatus();

        res.json({
          services: servicesStatus,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        console.error(
          "Error fetching services status from Puppetserver:",
          error,
        );
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch services status from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/status/simple
   * Get simple status from Puppetserver
   *
   * Implements requirement 17.2: Display component for /status/v1/simple
   * Returns a simple running/error status for lightweight health checks.
   */
  router.get(
    "/puppetserver/status/simple",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        const simpleStatus = await puppetserverService.getSimpleStatus();

        res.json({
          status: simpleStatus,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        console.error("Error fetching simple status from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch simple status from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/admin-api
   * Get admin API information from Puppetserver
   *
   * Implements requirement 17.3: Display component for /puppet-admin-api/v1
   * Returns information about available admin operations.
   */
  router.get(
    "/puppetserver/admin-api",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        const adminApiInfo = await puppetserverService.getAdminApiInfo();

        res.json({
          adminApi: adminApiInfo,
          source: "puppetserver",
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        console.error(
          "Error fetching admin API info from Puppetserver:",
          error,
        );
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch admin API info from Puppetserver",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/metrics
   * Get metrics from Puppetserver via Jolokia
   *
   * Implements requirement 17.4: Display component for /metrics/v2 with performance warning
   * Returns JMX metrics from Puppetserver.
   *
   * WARNING: This endpoint can be resource-intensive on the Puppetserver.
   * Use sparingly and consider caching results.
   *
   * Query parameters:
   * - mbean: Optional MBean name to query specific metrics
   */
  router.get(
    "/puppetserver/metrics",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      if (!puppetserverService) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        });
        return;
      }

      if (!puppetserverService.isInitialized()) {
        res.status(503).json({
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        });
        return;
      }

      try {
        // Get optional mbean parameter
        const mbean =
          typeof req.query.mbean === "string" ? req.query.mbean : undefined;

        const metrics = await puppetserverService.getMetrics(mbean);

        res.json({
          metrics,
          source: "puppetserver",
          mbean,
          warning:
            "This endpoint can be resource-intensive on Puppetserver. Use sparingly.",
        });
      } catch (error) {
        if (error instanceof PuppetserverConfigurationError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof PuppetserverConnectionError) {
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        console.error("Error fetching metrics from Puppetserver:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch metrics from Puppetserver",
          },
        });
      }
    }),
  );

  return router;
}
