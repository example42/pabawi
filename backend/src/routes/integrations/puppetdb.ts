import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PuppetDBService } from "../../integrations/puppetdb/PuppetDBService";
import {
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
} from "../../integrations/puppetdb";
import { asyncHandler } from "../asyncHandler";
import { requestDeduplication } from "../../middleware/deduplication";
import {
  CertnameParamSchema,
  ReportParamsSchema,
  PQLQuerySchema,
  ReportsQuerySchema,
  createLogger,
} from "./utils";
import { ExpertModeService } from "../../services/ExpertModeService";
import { ReportFilterService, type ReportFilters } from "../../services/ReportFilterService";

/**
 * Create PuppetDB router for all PuppetDB-related routes
 */
export function createPuppetDBRouter(puppetDBService?: PuppetDBService): Router {
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
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes', requestId, 0)
        : null;

      logger.info("Fetching PuppetDB nodes", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getPuppetDBNodes",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching PuppetDB nodes",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getPuppetDBNodes",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getPuppetDBNodes",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate query parameters
        const queryParams = PQLQuerySchema.parse(req.query);
        const pqlQuery = queryParams.query;

        logger.debug("Querying PuppetDB inventory", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getPuppetDBNodes",
          metadata: { hasQuery: !!pqlQuery },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB inventory",
            context: JSON.stringify({ hasQuery: !!pqlQuery }),
            level: 'debug',
          });
        }

        // Get inventory from PuppetDB
        const nodes = await puppetDBService.getInventory(pqlQuery);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched PuppetDB nodes", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getPuppetDBNodes",
          metadata: { nodeCount: nodes.length, duration },
        });

        const responseData = {
          nodes,
          source: "puppetdb",
          count: nodes.length,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'nodeCount', nodes.length);
          expertModeService.addMetadata(debugInfo, 'hasQuery', !!pqlQuery);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched PuppetDB nodes",
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
          logger.warn("Invalid query parameters for PuppetDB nodes", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getPuppetDBNodes",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters for PuppetDB nodes",
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

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getPuppetDBNodes",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getPuppetDBNodes",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getPuppetDBNodes",
            metadata: { query: error.query },
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching PuppetDB inventory", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getPuppetDBNodes",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching PuppetDB inventory: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch inventory from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
      }
    }),
  );

  /**
   * GET /api/integrations/puppetdb/nodes/:certname
   * Return specific node details from PuppetDB
   */
  router.get(
    "/nodes/:certname",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname', requestId, 0)
        : null;

      logger.info("Fetching node details from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeDetails",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node details from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeDetails",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeDetails",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node details",
            context: JSON.stringify({ certname }),
            level: 'debug',
          });
        }

        // Get all nodes from inventory
        const nodes = await puppetDBService.getInventory();

        // Find the specific node
        const node = nodes.find(
          (n) => n.id === certname || n.name === certname,
        );

        if (!node) {
          logger.warn("Node not found in PuppetDB", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeDetails",
            metadata: { certname },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Node '${certname}' not found in PuppetDB`,
              context: `Searched for node with certname: ${certname}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NODE_NOT_FOUND",
              message: `Node '${certname}' not found in PuppetDB`,
            },
          };

          res.status(404).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        const duration = Date.now() - startTime;
        const responseData = {
          node,
          source: "puppetdb",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched node details from PuppetDB",
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
          logger.warn("Invalid certname parameter", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeDetails",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid certname parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeDetails",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeDetails",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching node details from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeDetails",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching node details from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch node details from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/facts",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/facts', requestId, 0)
        : null;

      logger.info("Fetching node facts from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeFacts",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node facts from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeFacts",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeFacts",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        logger.debug("Querying PuppetDB for node facts", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeFacts",
          metadata: { certname },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node facts",
            context: JSON.stringify({ certname }),
            level: 'debug',
          });
        }

        // Get facts from PuppetDB
        const facts = await puppetDBService.getNodeFacts(certname);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node facts from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeFacts",
          metadata: { certname, duration },
        });

        const responseData = {
          facts,
          source: "puppetdb",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched node facts from PuppetDB",
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
          logger.warn("Invalid certname parameter", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeFacts",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid certname parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid certname parameter",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeFacts",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeFacts",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeFacts",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Handle node not found
        if (error instanceof Error && error.message.includes("not found")) {
          logger.warn("Node not found in PuppetDB", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeFacts",
            metadata: { error: error.message },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Node not found in PuppetDB",
              context: error.message,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "NODE_NOT_FOUND",
              message: error.message,
            },
          };

          res.status(404).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching facts from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeFacts",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching facts from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch facts from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/reports/summary",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/reports/summary', requestId, 0)
        : null;

      logger.info("Fetching PuppetDB reports summary", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getReportsSummary",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching PuppetDB reports summary",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReportsSummary",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReportsSummary",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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

        logger.debug("Querying PuppetDB for reports summary", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReportsSummary",
          metadata: { limit, hours },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for reports summary",
            context: JSON.stringify({ limit, hours }),
            level: 'debug',
          });
        }

        // Get reports summary from PuppetDB
        const summary = await puppetDBService.getReportsSummary(limit, hours);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched PuppetDB reports summary", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReportsSummary",
          metadata: { duration, limit, hours },
        });

        const responseData = {
          summary,
          source: "puppetdb",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'limit', limit);
          expertModeService.addMetadata(debugInfo, 'hours', hours);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched PuppetDB reports summary",
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
          logger.warn("Invalid query parameters for reports summary", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReportsSummary",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters for reports summary",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReportsSummary",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: "PuppetDB authentication error",
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReportsSummary",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: "PuppetDB connection error",
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReportsSummary",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: "PuppetDB query error",
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching reports summary from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReportsSummary",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: "Error fetching reports summary from PuppetDB",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch reports summary from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/reports",
    requestDeduplication,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/reports', requestId, 0)
        : null;

      logger.info("Fetching all reports from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getAllReports",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching all reports from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getAllReports",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getAllReports",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Get query parameters
        const queryParams = ReportsQuerySchema.parse(req.query);
        const limit = queryParams.limit || 100;
        const offset = queryParams.offset || 0;

        // Build filter object from query parameters
        const filters: ReportFilters = {};
        if (queryParams.status) {
          filters.status = queryParams.status as ("success" | "failed" | "changed" | "unchanged")[];
        }
        if (queryParams.minDuration !== undefined) {
          filters.minDuration = queryParams.minDuration;
        }
        if (queryParams.minCompileTime !== undefined) {
          filters.minCompileTime = queryParams.minCompileTime;
        }
        if (queryParams.minTotalResources !== undefined) {
          filters.minTotalResources = queryParams.minTotalResources;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for all reports",
            context: JSON.stringify({ limit, offset, filters }),
            level: 'debug',
          });
        }

        // Get total count for pagination
        const totalCount = await puppetDBService.getTotalReportsCount();

        // Get reports from PuppetDB with pagination
        const allReports = await puppetDBService.getAllReports(limit, offset);

        // Apply filters if any are specified
        const reportFilterService = new ReportFilterService();
        const hasFilters = Object.keys(filters).length > 0;
        const reports = hasFilters
          ? reportFilterService.filterReports(allReports, filters)
          : allReports;

        // When filters are applied, we need to calculate the filtered total count
        // This is a limitation of applying filters client-side after fetching from PuppetDB
        let filteredTotalCount = totalCount;
        let actualHasMore = false;

        if (hasFilters) {
          // If filtering reduced results significantly, we can't accurately determine total count
          // without fetching all reports. For now, use hasMore based on whether we got results.
          if (reports.length === 0 && offset > 0) {
            // No results on this page after filtering - likely past the end of filtered results
            actualHasMore = false;
            filteredTotalCount = offset; // Approximate
          } else if (reports.length < limit && (offset + limit) < totalCount) {
            // Got fewer results than requested, but there are more unfiltered results
            // Keep hasMore true to allow fetching next page
            actualHasMore = true;
            filteredTotalCount = totalCount; // Can't determine exact count
          } else {
            // Calculate hasMore based on unfiltered count (best we can do)
            actualHasMore = (offset + limit) < totalCount;
            filteredTotalCount = totalCount;
          }
        } else {
          // No filters - use simple calculation
          actualHasMore = (offset + reports.length) < totalCount;
          filteredTotalCount = totalCount;
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched all reports from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getAllReports",
          metadata: {
            totalReports: allReports.length,
            filteredReports: reports.length,
            filtersApplied: hasFilters,
            totalCount: filteredTotalCount,
            offset,
            hasMore: actualHasMore,
            duration
          },
        });

        const responseData = {
          reports,
          source: "puppetdb",
          count: reports.length,
          totalCount: filteredTotalCount,
          offset,
          hasMore: actualHasMore,
          filtersApplied: hasFilters,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'limit', limit);
          expertModeService.addMetadata(debugInfo, 'offset', offset);
          expertModeService.addMetadata(debugInfo, 'totalReports', allReports.length);
          expertModeService.addMetadata(debugInfo, 'filteredReports', reports.length);
          expertModeService.addMetadata(debugInfo, 'totalCount', filteredTotalCount);
          expertModeService.addMetadata(debugInfo, 'hasMore', actualHasMore);
          expertModeService.addMetadata(debugInfo, 'filtersApplied', hasFilters);
          if (hasFilters) {
            expertModeService.addMetadata(debugInfo, 'filters', filters);
          }
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched and filtered reports from PuppetDB (${reports.length}/${allReports.length} after filtering, page ${Math.floor(offset / limit) + 1})`,
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
          logger.warn("Invalid request parameters for reports", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getAllReports",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for reports",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Handle filter validation errors
        if (error instanceof Error && error.message.startsWith("Invalid filters:")) {
          logger.warn("Invalid filter parameters for reports", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getAllReports",
            metadata: { error: error.message },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid filter parameters for reports",
              context: error.message,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_FILTERS",
              message: error.message,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getAllReports",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getAllReports",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching all reports from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getAllReports",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching all reports from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch reports from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/reports",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/reports', requestId, 0)
        : null;

      logger.info("Fetching node reports from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeReports",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node reports from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeReports",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeReports",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const queryParams = ReportsQuerySchema.parse(req.query);
        const certname = params.certname;
        const limit = queryParams.limit;
        const offset = queryParams.offset || 0;

        logger.debug("Querying PuppetDB for node reports", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeReports",
          metadata: { certname, limit, offset },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node reports",
            context: JSON.stringify({ certname, limit, offset }),
            level: 'debug',
          });
        }

        // Get reports from PuppetDB with pagination
        const reports = await puppetDBService.getNodeReports(certname, limit, offset);

        // Calculate hasMore - if we got exactly 'limit' reports, there might be more
        // This is a simple heuristic; a more accurate approach would require a separate count query
        const hasMore = reports.length === limit;

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node reports from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeReports",
          metadata: { certname, reportCount: reports.length, offset, hasMore, duration },
        });

        const responseData = {
          reports,
          source: "puppetdb",
          count: reports.length,
          offset,
          hasMore,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'reportCount', reports.length);
          expertModeService.addMetadata(debugInfo, 'limit', limit);
          expertModeService.addMetadata(debugInfo, 'offset', offset);
          expertModeService.addMetadata(debugInfo, 'hasMore', hasMore);
          expertModeService.addInfo(debugInfo, {
            message: `Successfully fetched node reports from PuppetDB (page ${Math.floor(offset / limit) + 1})`,
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
          logger.warn("Invalid request parameters for node reports", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeReports",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for node reports",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeReports",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeReports",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeReports",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching reports from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeReports",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching reports from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch reports from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/reports/:hash",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/reports/:hash', requestId, 0)
        : null;

      logger.info("Fetching report details from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getReport",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching report details from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReport",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReport",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate request parameters
        const params = ReportParamsSchema.parse(req.params);
        const { certname, hash } = params;

        logger.debug("Querying PuppetDB for report details", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReport",
          metadata: { certname, hash },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for report details",
            context: JSON.stringify({ certname, hash }),
            level: 'debug',
          });
        }

        // Get specific report from PuppetDB
        const report = await puppetDBService.getReport(hash);

        if (!report) {
          logger.warn("Report not found in PuppetDB", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
            metadata: { certname, hash },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Report '${hash}' not found for node '${certname}'`,
              context: `Searched for report with hash: ${hash}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "REPORT_NOT_FOUND",
              message: `Report '${hash}' not found for node '${certname}'`,
            },
          };

          res.status(404).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Verify the report belongs to the requested node
        if (report.certname !== certname) {
          logger.warn("Report does not belong to requested node", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
            metadata: { certname, hash, actualCertname: report.certname },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Report '${hash}' does not belong to node '${certname}'`,
              context: `Report belongs to: ${report.certname}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "REPORT_NOT_FOUND",
              message: `Report '${hash}' does not belong to node '${certname}'`,
            },
          };

          res.status(404).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched report details from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReport",
          metadata: { certname, hash, duration },
        });

        const responseData = {
          report,
          source: "puppetdb",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'hash', hash);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched report details from PuppetDB",
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
          logger.warn("Invalid request parameters for report details", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for report details",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getReport",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching report from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getReport",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching report from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch report from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/catalog",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/catalog', requestId, 0)
        : null;

      logger.info("Fetching node catalog from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeCatalog",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node catalog from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeCatalog",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeCatalog",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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

        logger.debug("Querying PuppetDB for node catalog", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeCatalog",
          metadata: { certname, resourceType },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node catalog",
            context: JSON.stringify({ certname, resourceType }),
            level: 'debug',
          });
        }

        // Get catalog from PuppetDB
        const catalog = await puppetDBService.getNodeCatalog(certname);

        if (!catalog) {
          logger.warn("Catalog not found in PuppetDB", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
            metadata: { certname },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Catalog not found for node '${certname}'`,
              context: `Searched for catalog with certname: ${certname}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "CATALOG_NOT_FOUND",
              message: `Catalog not found for node '${certname}'`,
            },
          };

          res.status(404).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        const duration = Date.now() - startTime;

        // If resourceType filter is specified, get organized resources
        if (resourceType) {
          const resourcesByType = await puppetDBService.getCatalogResources(
            certname,
            resourceType,
          );

          logger.info("Successfully fetched filtered catalog from PuppetDB", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
            metadata: { certname, resourceType, duration },
          });

          const responseData = {
            catalog: {
              ...catalog,
              resources: resourcesByType[resourceType] ?? [],
            },
            source: "puppetdb",
            filtered: true,
            resourceType,
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'puppetdb');
            expertModeService.addMetadata(debugInfo, 'certname', certname);
            expertModeService.addMetadata(debugInfo, 'resourceType', resourceType);
            expertModeService.addMetadata(debugInfo, 'filtered', true);
            expertModeService.addInfo(debugInfo, {
              message: "Successfully fetched filtered catalog from PuppetDB",
              level: 'info',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
            res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
          } else {
            res.json(responseData);
          }
          return;
        }

        logger.info("Successfully fetched catalog from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeCatalog",
          metadata: { certname, duration },
        });

        const responseData = {
          catalog,
          source: "puppetdb",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched catalog from PuppetDB",
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
          logger.warn("Invalid request parameters for catalog", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for catalog",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeCatalog",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching catalog from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeCatalog",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching catalog from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch catalog from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/resources",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/resources', requestId, 0)
        : null;

      logger.info("Fetching node resources from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeResources",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node resources from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeResources",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeResources",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        // Validate request parameters
        const params = CertnameParamSchema.parse(req.params);
        const certname = params.certname;

        logger.debug("Querying PuppetDB for node resources", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeResources",
          metadata: { certname },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node resources",
            context: JSON.stringify({ certname }),
            level: 'debug',
          });
        }

        // Get resources from PuppetDB
        const resourcesByType =
          await puppetDBService.getNodeResources(certname);

        const duration = Date.now() - startTime;
        const typeCount = Object.keys(resourcesByType).length;
        const totalResources = Object.values(resourcesByType).reduce(
          (sum, resources) => sum + resources.length,
          0,
        );

        logger.info("Successfully fetched node resources from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeResources",
          metadata: { certname, typeCount, totalResources, duration },
        });

        const responseData = {
          resources: resourcesByType,
          source: "puppetdb",
          certname,
          typeCount,
          totalResources,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'typeCount', typeCount);
          expertModeService.addMetadata(debugInfo, 'totalResources', totalResources);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched node resources from PuppetDB",
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
          logger.warn("Invalid request parameters for resources", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeResources",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for resources",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeResources",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeResources",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeResources",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching resources from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeResources",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching resources from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch resources from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/nodes/:certname/events",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/nodes/:certname/events', requestId, 0)
        : null;

      logger.info("Fetching node events from PuppetDB", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getNodeEvents",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching node events from PuppetDB",
          level: 'info',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeEvents",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeEvents",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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

        logger.debug("Querying PuppetDB for node events", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeEvents",
          metadata: { certname, filters },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for node events",
            context: JSON.stringify({ certname, filters }),
            level: 'debug',
          });
        }

        // Get events from PuppetDB
        const events = await puppetDBService.getNodeEvents(certname, filters);
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched node events from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeEvents",
          metadata: { certname, eventCount: events.length, duration },
        });

        const responseData = {
          events,
          source: "puppetdb",
          count: events.length,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'certname', certname);
          expertModeService.addMetadata(debugInfo, 'eventCount', events.length);
          expertModeService.addMetadata(debugInfo, 'hasFilters', Object.keys(filters).length > 0);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched node events from PuppetDB",
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
          logger.warn("Invalid request parameters for events", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeEvents",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters for events",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeEvents",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeEvents",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBQueryError) {
          logger.error("PuppetDB query error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getNodeEvents",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB query error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_QUERY_ERROR",
              message: error.message,
              query: error.query,
            },
          };

          res.status(400).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching events from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getNodeEvents",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching events from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch events from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
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
    "/admin/summary-stats",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/puppetdb/admin/summary-stats', requestId, 0)
        : null;

      logger.info("Fetching PuppetDB summary stats", {
        component: "PuppetDBRouter",
        integration: "puppetdb",
        operation: "getSummaryStats",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Fetching PuppetDB summary stats",
          level: 'info',
        });
        expertModeService.addWarning(debugInfo, {
          message: "This endpoint can be resource-intensive on large PuppetDB instances",
          context: "Performance warning for admin endpoint",
          level: 'warn',
        });
      }

      if (!puppetDBService) {
        logger.warn("PuppetDB integration is not configured", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getSummaryStats",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not configured",
            context: "PuppetDB service is not available",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_CONFIGURED",
            message: "PuppetDB integration is not configured",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      if (!puppetDBService.isInitialized()) {
        logger.warn("PuppetDB integration is not initialized", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getSummaryStats",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "PuppetDB integration is not initialized",
            context: "PuppetDB service is not ready",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PUPPETDB_NOT_INITIALIZED",
            message: "PuppetDB integration is not initialized",
          },
        };

        res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
        return;
      }

      try {
        logger.debug("Querying PuppetDB for summary stats", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getSummaryStats",
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Querying PuppetDB for summary stats",
            context: "Fetching database statistics",
            level: 'debug',
          });
        }

        const summaryStats = await puppetDBService.getSummaryStats();
        const duration = Date.now() - startTime;

        logger.info("Successfully fetched PuppetDB summary stats", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getSummaryStats",
          metadata: { duration },
        });

        const responseData = {
          stats: summaryStats,
          source: "puppetdb",
          warning:
            "This endpoint can be resource-intensive on large PuppetDB instances",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'puppetdb');
          expertModeService.addMetadata(debugInfo, 'resourceIntensive', true);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched PuppetDB summary stats",
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

        if (error instanceof PuppetDBAuthenticationError) {
          logger.error("PuppetDB authentication error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getSummaryStats",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB authentication error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_AUTH_ERROR",
              message: error.message,
            },
          };

          res.status(401).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        if (error instanceof PuppetDBConnectionError) {
          logger.error("PuppetDB connection error", {
            component: "PuppetDBRouter",
            integration: "puppetdb",
            operation: "getSummaryStats",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: `PuppetDB connection error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "PUPPETDB_CONNECTION_ERROR",
              message: error.message,
              details: error.details,
            },
          };

          res.status(503).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
          return;
        }

        // Unknown error
        logger.error("Error fetching summary stats from PuppetDB", {
          component: "PuppetDBRouter",
          integration: "puppetdb",
          operation: "getSummaryStats",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error fetching summary stats from PuppetDB: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch summary stats from PuppetDB",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
      }
    }),
  );

  /**
   * GET /api/integrations/puppetserver/nodes
   * Return all nodes from Puppetserver CA inventory
   *
   * Implements requirement 2.1: Retrieve nodes from CA and transform to normalized inventory format
   */

  return router;
}
