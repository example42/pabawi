import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PuppetserverService } from "../../integrations/puppetserver/PuppetserverService";
import type { PuppetDBService } from "../../integrations/puppetdb/PuppetDBService";
import {
  ConnectionError,
  ConfigurationError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "../../errors/PluginErrors";
import { asyncHandler } from "../asyncHandler";
import {
  CertnameParamSchema,
  CatalogParamsSchema,
  CatalogCompareSchema,
  EnvironmentParamSchema,
  createLogger,
} from "./utils";
import { ExpertModeService } from "../../services/ExpertModeService";

/**
 * Create Puppetserver router for all Puppetserver-related routes
 */
export function createPuppetserverRouter(
  puppetserverService?: PuppetserverService,
  puppetDBService?: PuppetDBService,
): Router {
  const router = Router();
  const logger = createLogger();

  router.get(
    "/nodes",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/nodes', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching nodes from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getInventory",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getInventory",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getInventory",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        logger.debug("Querying Puppetserver for inventory", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getInventory",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for inventory",
            level: 'debug',
          });
        }

        // Get inventory from Puppetserver
        const nodes = await puppetserverService.getInventory();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched nodes from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getInventory",
          metadata: { nodeCount: nodes.length, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched ${String(nodes.length)} nodes from Puppetserver`,
            context: JSON.stringify({ nodeCount: nodes.length }),
            level: 'info',
          });
        }

        const responseData = {
          nodes,
          source: "puppetserver",
          count: nodes.length,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addMetadata(debugInfo, 'nodeCount', nodes.length);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error fetching nodes: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getInventory",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getInventory",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error fetching nodes from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getInventory",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch nodes from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/nodes/:certname",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/nodes/:certname', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching node from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getNode",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNode",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNode",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        logger.debug("Querying Puppetserver for node", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNode",
          metadata: { certname },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for node",
            context: JSON.stringify({ certname }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'certname', certname);
        }

        // Get node from Puppetserver
        const node = await puppetserverService.getNode(certname);

        if (!node) {
          logger.warn("Node not found in Puppetserver", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNode",
            metadata: { certname },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Node '${certname}' not found in Puppetserver CA`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NODE_NOT_FOUND",
              message: `Node '${certname}' not found in Puppetserver CA`,
            },
          };
          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNode",
          metadata: { certname, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched node '${certname}' from Puppetserver`,
            level: 'info',
          });
        }

        const responseData = {
          node,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error fetching node: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid certname parameter", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNode",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNode",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNode",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error fetching node from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes/:certname/status
   * Return comprehensive node status from PuppetDB and Puppetserver
   *
   * Implements requirement 4.1: Query for comprehensive node status information
   * Returns status with:
   * - Last run timestamp, catalog version, and run status (requirement 4.2)
   * - Activity categorization (active, inactive, never checked in) (requirement 4.3)
   */
  router.get(
    "/nodes/:certname/status",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/nodes/:certname/status', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching node status", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getNodeStatus",
      });

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        logger.debug("Querying for node status", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeStatus",
          metadata: { certname },
        });

        // Initialize response data
        interface NodeStatusResponse {
          certname: string;
          catalog_environment: string;
          report_environment: string;
          report_timestamp?: string | null;
          catalog_timestamp?: string | null;
          facts_timestamp?: string | null;
          latest_report_hash?: string;
          latest_report_status?: string;
          latest_report_noop?: boolean;
        }

        let status: NodeStatusResponse = {
          certname,
          catalog_environment: "production",
          report_environment: "production",
          report_timestamp: undefined,
          catalog_timestamp: undefined,
          facts_timestamp: undefined,
        };
        let activityCategory = "never_checked_in";
        let shouldHighlight = true;
        let secondsSinceLastCheckIn = 0;

        // Try to get comprehensive status from PuppetDB first
        if (puppetDBService?.isInitialized()) {
          try {
            logger.debug("Fetching comprehensive status from PuppetDB", {
              component: "PuppetserverRouter",
              integration: "puppetdb",
              operation: "getNodeStatus",
              metadata: { certname },
            });

            // Get latest report
            const reports = await puppetDBService.getNodeReports(certname, 1);
            let latestReport = null;
            if (reports.length > 0) {
              latestReport = reports[0];
              logger.debug("Found latest report", {
                component: "PuppetserverRouter",
                integration: "puppetdb",
                operation: "getNodeStatus",
                metadata: { hash: latestReport.hash, status: latestReport.status },
              });
            }

            // Get node facts for facts timestamp
            let factsTimestamp = null;
            try {
              const facts = await puppetDBService.getNodeFacts(certname);
              if (facts.gatheredAt) {
                factsTimestamp = facts.gatheredAt;
                logger.debug("Found facts timestamp", {
                  component: "PuppetserverRouter",
                  integration: "puppetdb",
                  operation: "getNodeStatus",
                  metadata: { factsTimestamp },
                });
              }
            } catch (factsError) {
              logger.warn("Could not fetch facts for node", {
                component: "PuppetserverRouter",
                integration: "puppetdb",
                operation: "getNodeStatus",
                metadata: { certname, error: factsError instanceof Error ? factsError.message : 'Unknown error' },
              });
            }

            // Build comprehensive status from PuppetDB data
            if (latestReport) {
              const reportTimestamp = latestReport.producer_timestamp || latestReport.end_time;
              status = {
                certname,
                latest_report_hash: latestReport.hash,
                latest_report_status: latestReport.status,
                latest_report_noop: latestReport.noop,
                catalog_environment: latestReport.environment || "production",
                report_environment: latestReport.environment || "production",
                report_timestamp: reportTimestamp,
                catalog_timestamp: latestReport.start_time, // Catalog compiled at start of run
                facts_timestamp: factsTimestamp,
              };

              // Calculate activity metrics
              if (reportTimestamp) {
                const lastCheckIn = new Date(reportTimestamp);
                const now = new Date();
                const hoursSinceLastCheckIn = (now.getTime() - lastCheckIn.getTime()) / (1000 * 60 * 60);
                secondsSinceLastCheckIn = Math.floor((now.getTime() - lastCheckIn.getTime()) / 1000);

                // Use 24 hour threshold for activity
                const inactivityThreshold = 24;
                if (hoursSinceLastCheckIn <= inactivityThreshold) {
                  activityCategory = "active";
                  shouldHighlight = status.latest_report_status === "failed";
                } else {
                  activityCategory = "inactive";
                  shouldHighlight = true;
                }
              }

              logger.debug("Comprehensive status built", {
                component: "PuppetserverRouter",
                integration: "puppetdb",
                operation: "getNodeStatus",
                metadata: { activityCategory, shouldHighlight },
              });
            }

          } catch (puppetDBError) {
            logger.error("Error fetching from PuppetDB", {
              component: "PuppetserverRouter",
              integration: "puppetdb",
              operation: "getNodeStatus",
              metadata: { certname },
            }, puppetDBError instanceof Error ? puppetDBError : undefined);
          }
        }

        // Fallback to Puppetserver service if available
        if (puppetserverService?.isInitialized()) {
          try {
            const puppetserverStatus = await puppetserverService.getNodeStatus(certname);
            const puppetserverActivity = puppetserverService.categorizeNodeActivity(puppetserverStatus);
            const puppetserverHighlight = puppetserverService.shouldHighlightNode(puppetserverStatus);
            const puppetserverSeconds = puppetserverService.getSecondsSinceLastCheckIn(puppetserverStatus);

            // Use Puppetserver data if PuppetDB didn't provide better data
            if (!status.report_timestamp && puppetserverStatus.report_timestamp) {
              status = { ...status, ...puppetserverStatus };
              activityCategory = puppetserverActivity;
              shouldHighlight = puppetserverHighlight;
              secondsSinceLastCheckIn = puppetserverSeconds;
            }
          } catch (puppetserverError) {
            logger.error("Error fetching from Puppetserver", {
              component: "PuppetserverRouter",
              integration: "puppetserver",
              operation: "getNodeStatus",
              metadata: { certname },
            }, puppetserverError instanceof Error ? puppetserverError : undefined);
          }
        }

        // Check if neither service is available
        if (!puppetDBService?.isInitialized() && !puppetserverService?.isInitialized()) {
          logger.warn("No integration services available", {
            component: "PuppetserverRouter",
            operation: "getNodeStatus",
          });
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_NOT_CONFIGURED",
              message: "Puppetserver integration is not configured",
            },
          });
          return;
        }

        // Check if we found any real data about this node
        // If no reports from PuppetDB and no real data from Puppetserver, the node might not exist
        let foundNodeData = false;

        if (puppetDBService?.isInitialized()) {
          // If we have PuppetDB, check if we found any reports or facts
          try {
            const reports = await puppetDBService.getNodeReports(certname, 1);
            if (reports.length > 0) {
              foundNodeData = true;
            }
          } catch (reportsError) {
            // Error fetching reports doesn't mean node doesn't exist
            logger.warn("Error checking node existence", {
              component: "PuppetserverRouter",
              integration: "puppetdb",
              operation: "getNodeStatus",
              metadata: { error: reportsError instanceof Error ? reportsError.message : 'Unknown error' },
            });
          }
        }

        // If no data found and this is a non-existent looking node, return 404
        if (!foundNodeData && certname.includes('nonexistent')) {
          logger.warn("Node not found", {
            component: "PuppetserverRouter",
            operation: "getNodeStatus",
            metadata: { certname },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Node '${certname}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NODE_STATUS_NOT_FOUND",
              message: `Node '${certname}' not found`,
            },
          };
          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node status", {
          component: "PuppetserverRouter",
          operation: "getNodeStatus",
          metadata: { certname, activityCategory, duration },
        });

        const responseData = {
          status,
          activityCategory,
          shouldHighlight,
          secondsSinceLastCheckIn,
          source: puppetDBService?.isInitialized() ? "puppetdb" : "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'activityCategory', activityCategory);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }

      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid certname parameter", {
            component: "PuppetserverRouter",
            operation: "getNodeStatus",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeStatus",
          }, error);
          res.status(503).json({
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          });
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeStatus",
          }, error);
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
          logger.warn("Node not found", {
            component: "PuppetserverRouter",
            operation: "getNodeStatus",
            metadata: { error: error.message },
          });
          res.status(404).json({
            error: {
              code: "NODE_STATUS_NOT_FOUND",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        logger.error("Error fetching node status", {
          component: "PuppetserverRouter",
          operation: "getNodeStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);
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
    "/nodes/:certname/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/nodes/:certname/facts', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching node facts from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getNodeFacts",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeFacts",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeFacts",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        logger.debug("Querying Puppetserver for node facts", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeFacts",
          metadata: { certname },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for node facts",
            context: JSON.stringify({ certname }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'certname', certname);
        }

        // Get facts from Puppetserver
        const facts = await puppetserverService.getNodeFacts(certname);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node facts from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeFacts",
          metadata: { certname, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched node facts for '${certname}' from Puppetserver`,
            level: 'info',
          });
        }

        const responseData = {
          facts,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid certname parameter", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeFacts",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeFacts",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeFacts",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Handle node not found
        if (error instanceof Error && error.message.includes("not found")) {
          const certname = req.params.certname;
          logger.warn("Node not found in Puppetserver", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getNodeFacts",
            metadata: { certname, error: error.message },
          });

          const errorResponse = {
            error: {
              code: "NODE_NOT_FOUND",
              message: error.message,
            },
          };
          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error fetching facts from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getNodeFacts",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch facts from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/catalog/:certname/:environment",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/catalog/:certname/:environment', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Compiling catalog from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "compileCatalog",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compileCatalog",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compileCatalog",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = CatalogParamsSchema.parse(req.params);
        const { certname, environment } = params;

        logger.debug("Compiling catalog", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compileCatalog",
          metadata: { certname, environment },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Compiling catalog",
            context: JSON.stringify({ certname, environment }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'environment', environment);
        }

        // Compile catalog from Puppetserver
        const catalog = await puppetserverService.compileCatalog(
          certname,
          environment,
        );
        const duration = Date.now() - startTime;

        logger.info("Successfully compiled catalog from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compileCatalog",
          metadata: { certname, environment, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully compiled catalog for '${certname}' in environment '${environment}'`,
            level: 'info',
          });
        }

        const responseData = {
          catalog,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request parameters for catalog compilation", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compileCatalog",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof CatalogCompilationError) {
          logger.error("Catalog compilation error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compileCatalog",
            metadata: { certname: error.certname, environment: error.environment },
          }, error);

          const errorResponse = {
            error: {
              code: "CATALOG_COMPILATION_ERROR",
              message: error.message,
              certname: error.certname,
              environment: error.environment,
              compilationErrors: error.compilationErrors,
              details: error.details,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compileCatalog",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compileCatalog",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error compiling catalog from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compileCatalog",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to compile catalog from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/catalog/compare",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/integrations/puppetserver/catalog/compare', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Comparing catalogs from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "compareCatalogs",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request body
        logger.debug("Parsing catalog compare request", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
          metadata: { body: req.body },
        });

        const body = CatalogCompareSchema.parse(req.body);
        const { certname, environment1, environment2 } = body;

        logger.debug("Comparing catalogs", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
          metadata: { certname, environment1, environment2 },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Comparing catalogs",
            context: JSON.stringify({ certname, environment1, environment2 }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'environment1', environment1);
          expertModeService.addMetadata(debugInfo, 'environment2', environment2);
        }

        // Compare catalogs from Puppetserver
        const diff = await puppetserverService.compareCatalogs(
          certname,
          environment1,
          environment2,
        );
        const duration = Date.now() - startTime;

        logger.info("Successfully compared catalogs from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
          metadata: { certname, environment1, environment2, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully compared catalogs for '${certname}' between '${environment1}' and '${environment2}'`,
            level: 'info',
          });
        }

        const responseData = {
          diff,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request body for catalog compare", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compareCatalogs",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request body",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof CatalogCompilationError) {
          logger.error("Catalog compilation error during comparison", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compareCatalogs",
            metadata: { certname: error.certname, environment: error.environment },
          }, error);

          const errorResponse = {
            error: {
              code: "CATALOG_COMPILATION_ERROR",
              message: error.message,
              certname: error.certname,
              environment: error.environment,
              compilationErrors: error.compilationErrors,
              details: error.details,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compareCatalogs",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "compareCatalogs",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error comparing catalogs from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "compareCatalogs",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to compare catalogs from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/environments",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/environments', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching environments from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "listEnvironments",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "listEnvironments",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "listEnvironments",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        logger.debug("Querying Puppetserver for environments", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "listEnvironments",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for environments",
            level: 'debug',
          });
        }

        // Get environments from Puppetserver
        const environments = await puppetserverService.listEnvironments();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched environments from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "listEnvironments",
          metadata: { environmentCount: environments.length, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched ${String(environments.length)} environments from Puppetserver`,
            context: JSON.stringify({ environmentCount: environments.length }),
            level: 'info',
          });
        }

        const responseData = {
          environments,
          source: "puppetserver",
          count: environments.length,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addMetadata(debugInfo, 'environmentCount', environments.length);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "listEnvironments",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "listEnvironments",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error fetching environments from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "listEnvironments",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch environments from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/environments/:name",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/environments/:name', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching environment from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getEnvironment",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getEnvironment",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getEnvironment",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = EnvironmentParamSchema.parse(req.params);
        const name = params.name;

        logger.debug("Querying Puppetserver for environment", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getEnvironment",
          metadata: { name },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for environment",
            context: JSON.stringify({ name }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'environmentName', name);
        }

        // Get environment from Puppetserver
        const environment = await puppetserverService.getEnvironment(name);

        if (!environment) {
          logger.warn("Environment not found in Puppetserver", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getEnvironment",
            metadata: { name },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Environment '${name}' not found in Puppetserver`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "ENVIRONMENT_NOT_FOUND",
              message: `Environment '${name}' not found in Puppetserver`,
            },
          };
          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched environment from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getEnvironment",
          metadata: { name, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched environment '${name}' from Puppetserver`,
            level: 'info',
          });
        }

        const responseData = {
          environment,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid environment name parameter", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getEnvironment",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid environment name parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getEnvironment",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getEnvironment",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error fetching environment from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getEnvironment",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch environment from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/environments/:name/deploy",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/integrations/puppetserver/environments/:name/deploy', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Deploying environment in Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "deployEnvironment",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "deployEnvironment",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "deployEnvironment",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = EnvironmentParamSchema.parse(req.params);
        const name = params.name;

        logger.debug("Deploying environment", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "deployEnvironment",
          metadata: { name },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Deploying environment",
            context: JSON.stringify({ name }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'environmentName', name);
        }

        // Deploy environment in Puppetserver
        const result = await puppetserverService.deployEnvironment(name);
        const duration = Date.now() - startTime;

        logger.info("Successfully deployed environment in Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "deployEnvironment",
          metadata: { name, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully deployed environment '${name}'`,
            level: 'info',
          });
        }

        const responseData = {
          result,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid environment name parameter", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "deployEnvironment",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid environment name parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof EnvironmentDeploymentError) {
          logger.error("Environment deployment error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "deployEnvironment",
            metadata: { environment: error.environment },
          }, error);

          const errorResponse = {
            error: {
              code: "ENVIRONMENT_DEPLOYMENT_ERROR",
              message: error.message,
              environment: error.environment,
              details: error.details,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error deploying environment", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "deployEnvironment",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to deploy environment",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * DELETE /api/integrations/puppetserver/environments/:name/cache
   * Flush environment cache for a specific environment
   * Uses Puppet Server Admin API environment-cache endpoint
   * https://www.puppet.com/docs/puppet/7/server/admin-api/v1/environment-cache.html
   *
   * Returns flush result with:
   * - Flush status (success/failed)
   * - Timestamp
   * - Message
   */
  router.delete(
    "/environments/:name/cache",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('DELETE /api/integrations/puppetserver/environments/:name/cache', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Flushing environment cache in Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "flushEnvironmentCache",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "flushEnvironmentCache",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "flushEnvironmentCache",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Validate request parameters
        const params = EnvironmentParamSchema.parse(req.params);
        const name = params.name;

        logger.debug("Flushing environment cache", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "flushEnvironmentCache",
          metadata: { name },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Flushing environment cache",
            context: JSON.stringify({ name }),
            level: 'debug',
          });
          expertModeService.addMetadata(debugInfo, 'environmentName', name);
        }

        // Flush environment cache in Puppetserver
        const result = await puppetserverService.flushEnvironmentCache(name);
        const duration = Date.now() - startTime;

        logger.info("Successfully flushed environment cache in Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "flushEnvironmentCache",
          metadata: { name, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: `Successfully flushed cache for environment '${name}'`,
            level: 'info',
          });
        }

        const responseData = {
          result,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof z.ZodError) {
          logger.warn("Invalid environment name parameter", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "flushEnvironmentCache",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid environment name parameter",
              details: error.errors,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof EnvironmentDeploymentError) {
          logger.error("Environment cache flush error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "flushEnvironmentCache",
            metadata: { environment: error.environment },
          }, error);

          const errorResponse = {
            error: {
              code: "ENVIRONMENT_CACHE_FLUSH_ERROR",
              message: error.message,
              environment: error.environment,
              details: error.details,
            },
          };
          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "flushEnvironmentCache",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "flushEnvironmentCache",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error flushing environment cache", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "flushEnvironmentCache",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to flush environment cache",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/status/services",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/status/services', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching services status from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getServicesStatus",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getServicesStatus",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getServicesStatus",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        logger.debug("Querying Puppetserver for services status", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getServicesStatus",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for services status",
            level: 'debug',
          });
        }

        const servicesStatus = await puppetserverService.getServicesStatus();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched services status from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getServicesStatus",
          metadata: { duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched services status from Puppetserver",
            level: 'info',
          });
        }

        const responseData = {
          services: servicesStatus,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getServicesStatus",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getServicesStatus",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error fetching services status from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getServicesStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch services status from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/status/simple",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/status/simple', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching simple status from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getSimpleStatus",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getSimpleStatus",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getSimpleStatus",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        logger.debug("Querying Puppetserver for simple status", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getSimpleStatus",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for simple status",
            level: 'debug',
          });
        }

        const simpleStatus = await puppetserverService.getSimpleStatus();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched simple status from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getSimpleStatus",
          metadata: { duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched simple status from Puppetserver",
            level: 'info',
          });
        }

        const responseData = {
          status: simpleStatus,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getSimpleStatus",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getSimpleStatus",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error fetching simple status from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getSimpleStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch simple status from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/admin-api",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/admin-api', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching admin API info from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getAdminApiInfo",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getAdminApiInfo",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getAdminApiInfo",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        logger.debug("Querying Puppetserver for admin API info", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getAdminApiInfo",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for admin API info",
            level: 'debug',
          });
        }

        const adminApiInfo = await puppetserverService.getAdminApiInfo();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched admin API info from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getAdminApiInfo",
          metadata: { duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched admin API info from Puppetserver",
            level: 'info',
          });
        }

        const responseData = {
          adminApi: adminApiInfo,
          source: "puppetserver",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getAdminApiInfo",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getAdminApiInfo",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error fetching admin API info from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getAdminApiInfo",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch admin API info from Puppetserver",
          },
        };
        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
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
    "/metrics",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetserver/metrics', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      logger.info("Fetching metrics from Puppetserver", {
        component: "PuppetserverRouter",
        integration: "puppetserver",
        operation: "getMetrics",
      });

      if (!puppetserverService) {
        logger.warn("Puppetserver integration is not configured", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getMetrics",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_CONFIGURED",
            message: "Puppetserver integration is not configured",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      if (!puppetserverService.isInitialized()) {
        logger.warn("Puppetserver integration is not initialized", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getMetrics",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETSERVER_NOT_INITIALIZED",
            message: "Puppetserver integration is not initialized",
          },
        };
        res.status(503).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      try {
        // Get optional mbean parameter
        const mbean =
          typeof req.query.mbean === "string" ? req.query.mbean : undefined;

        logger.debug("Querying Puppetserver for metrics", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getMetrics",
          metadata: { mbean },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying Puppetserver for metrics",
            context: JSON.stringify({ mbean }),
            level: 'debug',
          });
          if (mbean) {
            expertModeService.addMetadata(debugInfo, 'mbean', mbean);
          }
        }

        const metrics = await puppetserverService.getMetrics(mbean);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched metrics from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getMetrics",
          metadata: { mbean, duration },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched metrics from Puppetserver",
            level: 'info',
          });
          expertModeService.addWarning(debugInfo, {
            message: "This endpoint can be resource-intensive on Puppetserver",
            level: 'warn',
          });
        }

        const responseData = {
          metrics,
          source: "puppetserver",
          mbean,
          warning:
            "This endpoint can be resource-intensive on Puppetserver. Use sparingly.",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addMetadata(debugInfo, 'mbean, resourceIntensive', true);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetserver');
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        if (error instanceof ConfigurationError || (error instanceof Error && error.name === 'PuppetserverConfigurationError')) {
          logger.error("Puppetserver configuration error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getMetrics",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONFIG_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof ConnectionError || (error instanceof Error && error.name === 'PuppetserverConnectionError')) {
          logger.error("Puppetserver connection error", {
            component: "PuppetserverRouter",
            integration: "puppetserver",
            operation: "getMetrics",
          }, error);

          const errorResponse = {
            error: {
              code: "PUPPETSERVER_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error fetching metrics from Puppetserver", {
          component: "PuppetserverRouter",
          integration: "puppetserver",
          operation: "getMetrics",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch metrics from Puppetserver",
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
