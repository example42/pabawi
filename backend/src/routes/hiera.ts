/**
 * Hiera API Routes
 *
 * REST API endpoints for Hiera data lookup, key resolution, and code analysis.
 *
 * Requirements: 14.1-14.6, 13.2, 15.6
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { HieraPlugin } from "../integrations/hiera/HieraPlugin";
import {
  HIERA_ERROR_CODES,
  type HieraKeyInfo,
  type HieraResolutionInfo,
  type PaginatedResponse,
} from "../integrations/hiera/types";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";

/**
 * Request validation schemas
 */
const KeyNameParamSchema = z.object({
  key: z.string().min(1, "Key name is required"),
});

const NodeIdParamSchema = z.object({
  nodeId: z.string().min(1, "Node ID is required"),
});

const NodeKeyParamSchema = z.object({
  nodeId: z.string().min(1, "Node ID is required"),
  key: z.string().min(1, "Key name is required"),
});

const SearchQuerySchema = z.object({
  q: z.string().optional(),
  query: z.string().optional(),
});

const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(parseInt(val, 10), 100) : 50)),
});

const LintFilterQuerySchema = z.object({
  severity: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
  types: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
});

const KeyFilterQuerySchema = z.object({
  filter: z.enum(["used", "unused", "all"]).optional().default("all"),
});

/**
 * Helper to get HieraPlugin from IntegrationManager
 */
function getHieraPlugin(integrationManager: IntegrationManager): HieraPlugin | null {
  const plugins = integrationManager.getAllPlugins();
  const hieraRegistration = plugins.find((p) => p.plugin.name === "hiera");

  if (!hieraRegistration) {
    return null;
  }

  return hieraRegistration.plugin as HieraPlugin;
}

/**
 * Helper to check if Hiera integration is configured and initialized
 */
function checkHieraAvailability(
  hieraPlugin: HieraPlugin | null,
  res: Response
): hieraPlugin is HieraPlugin {
  if (!hieraPlugin) {
    res.status(503).json({
      error: {
        code: HIERA_ERROR_CODES.NOT_CONFIGURED,
        message: "Hiera integration is not configured",
        details: {
          suggestion: "Configure the Hiera integration by setting HIERA_CONTROL_REPO_PATH environment variable",
        },
      },
    });
    return false;
  }

  if (!hieraPlugin.isInitialized()) {
    res.status(503).json({
      error: {
        code: HIERA_ERROR_CODES.NOT_CONFIGURED,
        message: "Hiera integration is not initialized",
        details: {
          suggestion: "Check the server logs for initialization errors",
        },
      },
    });
    return false;
  }

  if (!hieraPlugin.isEnabled()) {
    res.status(503).json({
      error: {
        code: HIERA_ERROR_CODES.NOT_CONFIGURED,
        message: "Hiera integration is disabled",
        details: {
          suggestion: "Enable the Hiera integration in the configuration",
        },
      },
    });
    return false;
  }

  return true;
}

/**
 * Apply pagination to an array
 */
function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const data = items.slice(startIndex, endIndex);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Create Hiera API router
 *
 * @param integrationManager - IntegrationManager instance
 * @returns Express router
 */
export function createHieraRouter(integrationManager: IntegrationManager): Router {
  const router = Router();
  const logger = new LoggerService();


  // ============================================================================
  // Status and Reload Endpoints (18.6)
  // ============================================================================

  /**
   * GET /api/integrations/hiera/status
   * Return status of the Hiera integration
   *
   * Requirements: 13.2
   */
  router.get(
    "/status",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/status', requestId, 0)
        : null;

      logger.info("Fetching Hiera integration status", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getStatus",
      });

      try {
        const hieraPlugin = getHieraPlugin(integrationManager);

        if (!hieraPlugin) {
          if (debugInfo) {
            expertModeService.addWarning(debugInfo, {
              message: "Hiera integration is not configured",
              context: "HIERA_CONTROL_REPO_PATH environment variable not set",
              level: 'warn',
            });
            debugInfo.duration = Date.now() - startTime;
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const responseData = {
            enabled: false,
            configured: false,
            healthy: false,
            message: "Hiera integration is not configured",
          };

          res.json(debugInfo ? expertModeService.attachDebugInfo(responseData, debugInfo) : responseData);
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Checking Hiera plugin health status",
            level: 'debug',
          });
        }

        const healthStatus = await hieraPlugin.healthCheck();
        const hieraConfig = hieraPlugin.getHieraConfig();
        const validationResult = hieraPlugin.getValidationResult();

        const duration = Date.now() - startTime;

        logger.info("Hiera status fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getStatus",
          metadata: { healthy: healthStatus.healthy, keyCount: healthStatus.details?.keyCount, duration },
        });

        const responseData = {
          enabled: hieraPlugin.isEnabled(),
          configured: true,
          healthy: healthStatus.healthy,
          controlRepoPath: hieraConfig?.controlRepoPath,
          lastScan: healthStatus.details?.lastScanTime as string | undefined,
          keyCount: healthStatus.details?.keyCount as number | undefined,
          fileCount: healthStatus.details?.fileCount as number | undefined,
          message: healthStatus.message,
          errors: validationResult?.errors,
          warnings: validationResult?.warnings,
          structure: validationResult?.structure,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'healthy', healthStatus.healthy);
          expertModeService.addMetadata(debugInfo, 'keyCount', healthStatus.details?.keyCount);
          expertModeService.addInfo(debugInfo, {
            message: `Hiera integration is ${healthStatus.healthy ? 'healthy' : 'unhealthy'}`,
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

        logger.error("Error fetching Hiera status", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Error fetching Hiera status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch Hiera status",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * POST /api/integrations/hiera/reload
   * Reload control repository data
   *
   * Requirements: 1.6, 13.2
   */
  router.post(
    "/reload",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/integrations/hiera/reload', requestId, 0)
        : null;

      logger.info("Reloading Hiera control repository", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "reload",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Starting control repository reload",
            level: 'debug',
          });
        }

        await hieraPlugin.reload();

        const healthStatus = await hieraPlugin.healthCheck();
        const duration = Date.now() - startTime;

        logger.info("Control repository reloaded successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "reload",
          metadata: { keyCount: healthStatus.details?.keyCount, fileCount: healthStatus.details?.fileCount, duration },
        });

        const responseData = {
          success: true,
          message: "Control repository reloaded successfully",
          keyCount: healthStatus.details?.keyCount as number | undefined,
          fileCount: healthStatus.details?.fileCount as number | undefined,
          lastScan: healthStatus.details?.lastScanTime as string | undefined,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          const keyCount = typeof healthStatus.details?.keyCount === 'number' ? healthStatus.details.keyCount : 0;
          const fileCount = typeof healthStatus.details?.fileCount === 'number' ? healthStatus.details.fileCount : 0;
          expertModeService.addMetadata(debugInfo, 'keyCount', keyCount.toString());
          expertModeService.addMetadata(debugInfo, 'fileCount', fileCount.toString());
          expertModeService.addInfo(debugInfo, {
            message: `Reloaded ${String(keyCount)} keys from ${String(fileCount)} files`,
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

        logger.error("Failed to reload control repository", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "reload",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to reload control repository: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.PARSE_ERROR,
            message: `Failed to reload control repository: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ============================================================================
  // Key Discovery Endpoints (18.2)
  // ============================================================================

  /**
   * GET /api/integrations/hiera/keys
   * Return all discovered Hiera keys
   *
   * Requirements: 14.1, 15.6
   */
  router.get(
    "/keys",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/keys', requestId, 0)
        : null;

      logger.info("Fetching all Hiera keys", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getAllKeys",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const paginationParams = PaginationQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching key index from Hiera plugin",
            context: JSON.stringify({ page: paginationParams.page, pageSize: paginationParams.pageSize }),
            level: 'debug',
          });
        }

        const keyIndex = await hieraPlugin.getAllKeys();

        // Convert Map to array of HieraKeyInfo
        const keysArray: HieraKeyInfo[] = [];
        for (const [name, key] of keyIndex.keys) {
          keysArray.push({
            name,
            locationCount: key.locations.length,
            hasLookupOptions: !!key.lookupOptions,
          });
        }

        // Sort alphabetically
        keysArray.sort((a, b) => a.name.localeCompare(b.name));

        // Apply pagination
        const paginatedResult = paginate(
          keysArray,
          paginationParams.page,
          paginationParams.pageSize
        );

        const duration = Date.now() - startTime;

        logger.info("Hiera keys fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getAllKeys",
          metadata: { totalKeys: paginatedResult.total, page: paginatedResult.page, duration },
        });

        const responseData = {
          keys: paginatedResult.data,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'totalKeys', String(paginatedResult.total));
          expertModeService.addMetadata(debugInfo, 'page', String(paginatedResult.page));
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(paginatedResult.data.length)} keys (page ${String(paginatedResult.page)} of ${String(paginatedResult.totalPages)})`,
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

        logger.error("Failed to get Hiera keys", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getAllKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/keys/search
   * Search for Hiera keys by partial name
   *
   * Requirements: 14.1, 4.5, 7.4
   */
  router.get(
    "/keys/search",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/keys/search', requestId, 0)
        : null;

      logger.info("Searching Hiera keys", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "searchKeys",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const searchParams = SearchQuerySchema.parse(req.query);
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const query = searchParams.q ?? searchParams.query ?? "";

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Searching for keys matching query",
            context: JSON.stringify({ query, page: paginationParams.page, pageSize: paginationParams.pageSize }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();
        const matchingKeys = await hieraService.searchKeys(query);

        // Convert to HieraKeyInfo array
        const keysArray: HieraKeyInfo[] = matchingKeys.map((key) => ({
          name: key.name,
          locationCount: key.locations.length,
          hasLookupOptions: !!key.lookupOptions,
        }));

        // Apply pagination
        const paginatedResult = paginate(
          keysArray,
          paginationParams.page,
          paginationParams.pageSize
        );

        const duration = Date.now() - startTime;

        logger.info("Hiera key search completed", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "searchKeys",
          metadata: { query, matchCount: paginatedResult.total, duration },
        });

        const responseData = {
          keys: paginatedResult.data,
          query,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'query', query);
          expertModeService.addMetadata(debugInfo, 'matchCount', paginatedResult.total);
          expertModeService.addInfo(debugInfo, {
            message: `Found ${String(paginatedResult.total)} keys matching query "${query}"`,
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

        logger.error("Failed to search Hiera keys", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "searchKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to search Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to search Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/keys/:key
   * Get details for a specific Hiera key
   *
   * Requirements: 14.1
   */
  router.get(
    "/keys/:key",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/keys/:key', requestId, 0)
        : null;

      logger.info("Fetching Hiera key details", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getKeyDetails",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const params = KeyNameParamSchema.parse(req.params);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching key details from Hiera service",
            context: JSON.stringify({ key: params.key }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();
        const key = await hieraService.getKey(params.key);

        if (!key) {
          const duration = Date.now() - startTime;

          logger.warn("Hiera key not found", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "getKeyDetails",
            metadata: { key: params.key, duration },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: `Key '${params.key}' not found`,
              context: `Searched for key: ${params.key}`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
              message: `Key '${params.key}' not found`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Hiera key details fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getKeyDetails",
          metadata: { key: params.key, locationCount: key.locations.length, duration },
        });

        const responseData = {
          key: {
            name: key.name,
            locations: key.locations,
            lookupOptions: key.lookupOptions,
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'key', params.key);
          expertModeService.addMetadata(debugInfo, 'locationCount', key.locations.length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved key '${params.key}' with ${String(key.locations.length)} locations`,
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
          logger.warn("Invalid key parameter", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "getKeyDetails",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid key parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid key parameter",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Failed to get key details", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getKeyDetails",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get key details: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get key details: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );


  // ============================================================================
  // Node-Specific Endpoints (18.3)
  // ============================================================================

  /**
   * GET /api/integrations/hiera/nodes/:nodeId/data
   * Get all Hiera data for a specific node
   *
   * Requirements: 14.3, 6.2, 6.6
   */
  router.get(
    "/nodes/:nodeId/data",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/nodes/:nodeId/data', requestId, 0)
        : null;

      logger.info("Fetching node Hiera data", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getNodeData",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const filterParams = KeyFilterQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching Hiera data for node",
            context: JSON.stringify({ nodeId: params.nodeId, filter: filterParams.filter }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();
        const nodeData = await hieraService.getNodeHieraData(params.nodeId);

        // Convert Map to array of resolution info
        let keysArray: HieraResolutionInfo[] = [];
        for (const [, resolution] of nodeData.keys) {
          keysArray.push({
            key: resolution.key,
            resolvedValue: resolution.resolvedValue,
            lookupMethod: resolution.lookupMethod,
            sourceFile: resolution.sourceFile,
            hierarchyLevel: resolution.hierarchyLevel,
            found: resolution.found,
            allValues: resolution.allValues,
            interpolatedVariables: resolution.interpolatedVariables,
          });
        }

        // Apply filter
        if (filterParams.filter === "used") {
          keysArray = keysArray.filter((k) => nodeData.usedKeys.has(k.key));
        } else if (filterParams.filter === "unused") {
          keysArray = keysArray.filter((k) => nodeData.unusedKeys.has(k.key));
        }

        // Sort alphabetically
        keysArray.sort((a, b) => a.key.localeCompare(b.key));

        // Get fact source info
        const factService = hieraService.getFactService();
        const factSource = await factService.getFactSource(params.nodeId);

        const duration = Date.now() - startTime;

        logger.info("Node Hiera data fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getNodeData",
          metadata: { nodeId: params.nodeId, keyCount: keysArray.length, filter: filterParams.filter, duration },
        });

        const responseData = {
          nodeId: nodeData.nodeId,
          keys: keysArray,
          usedKeys: Array.from(nodeData.usedKeys),
          unusedKeys: Array.from(nodeData.unusedKeys),
          factSource,
          totalKeys: keysArray.length,
          hierarchyFiles: nodeData.hierarchyFiles,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'nodeId', params.nodeId);
          expertModeService.addMetadata(debugInfo, 'keyCount', keysArray.length);
          expertModeService.addMetadata(debugInfo, 'filter', filterParams.filter);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(keysArray.length)} keys for node ${params.nodeId}`,
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
          logger.warn("Invalid request parameters", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "getNodeData",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters",
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

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Failed to get node Hiera data", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getNodeData",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get node Hiera data: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get node Hiera data: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/nodes/:nodeId/keys
   * Get all Hiera keys for a specific node (with resolved values)
   *
   * Requirements: 14.2, 15.6
   */
  router.get(
    "/nodes/:nodeId/keys",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/nodes/:nodeId/keys', requestId, 0)
        : null;

      logger.info("Fetching node Hiera keys", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getNodeKeys",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const filterParams = KeyFilterQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching Hiera keys for node",
            context: JSON.stringify({ nodeId: params.nodeId, filter: filterParams.filter, page: paginationParams.page }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();
        const nodeData = await hieraService.getNodeHieraData(params.nodeId);

        // Convert Map to array of resolution info
        let keysArray: HieraResolutionInfo[] = [];
        for (const [, resolution] of nodeData.keys) {
          keysArray.push({
            key: resolution.key,
            resolvedValue: resolution.resolvedValue,
            lookupMethod: resolution.lookupMethod,
            sourceFile: resolution.sourceFile,
            hierarchyLevel: resolution.hierarchyLevel,
            found: resolution.found,
            allValues: resolution.allValues,
            interpolatedVariables: resolution.interpolatedVariables,
          });
        }

        // Apply filter
        if (filterParams.filter === "used") {
          keysArray = keysArray.filter((k) => nodeData.usedKeys.has(k.key));
        } else if (filterParams.filter === "unused") {
          keysArray = keysArray.filter((k) => nodeData.unusedKeys.has(k.key));
        }

        // Sort alphabetically
        keysArray.sort((a, b) => a.key.localeCompare(b.key));

        // Apply pagination
        const paginatedResult = paginate(
          keysArray,
          paginationParams.page,
          paginationParams.pageSize
        );

        const duration = Date.now() - startTime;

        logger.info("Node Hiera keys fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getNodeKeys",
          metadata: { nodeId: params.nodeId, keyCount: paginatedResult.total, page: paginatedResult.page, duration },
        });

        const responseData = {
          nodeId: params.nodeId,
          keys: paginatedResult.data,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'nodeId', params.nodeId);
          expertModeService.addMetadata(debugInfo, 'keyCount', paginatedResult.total);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(paginatedResult.data.length)} keys for node ${params.nodeId} (page ${String(paginatedResult.page)} of ${String(paginatedResult.totalPages)})`,
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
          logger.warn("Invalid request parameters", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "getNodeKeys",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters",
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

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Failed to get node keys", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getNodeKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get node keys: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get node keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/nodes/:nodeId/keys/:key
   * Resolve a specific Hiera key for a node
   *
   * Requirements: 14.2
   */
  router.get(
    "/nodes/:nodeId/keys/:key",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/nodes/:nodeId/keys/:key', requestId, 0)
        : null;

      logger.info("Resolving Hiera key for node", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "resolveKey",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const params = NodeKeyParamSchema.parse(req.params);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Resolving key for node",
            context: JSON.stringify({ nodeId: params.nodeId, key: params.key }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();
        const resolution = await hieraService.resolveKey(params.nodeId, params.key);

        const duration = Date.now() - startTime;

        logger.info("Hiera key resolved successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "resolveKey",
          metadata: { nodeId: params.nodeId, key: params.key, found: resolution.found, duration },
        });

        const responseData = {
          nodeId: params.nodeId,
          key: resolution.key,
          resolvedValue: resolution.resolvedValue,
          lookupMethod: resolution.lookupMethod,
          sourceFile: resolution.sourceFile,
          hierarchyLevel: resolution.hierarchyLevel,
          allValues: resolution.allValues,
          interpolatedVariables: resolution.interpolatedVariables,
          found: resolution.found,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'nodeId', params.nodeId);
          expertModeService.addMetadata(debugInfo, 'key', params.key);
          expertModeService.addMetadata(debugInfo, 'found', resolution.found);
          expertModeService.addInfo(debugInfo, {
            message: `Resolved key '${params.key}' for node ${params.nodeId}: ${resolution.found ? 'found' : 'not found'}`,
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
          logger.warn("Invalid request parameters", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "resolveKey",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters",
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

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Failed to resolve key", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "resolveKey",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to resolve key: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to resolve key: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );


  // ============================================================================
  // Global Key Lookup Endpoint (18.4)
  // ============================================================================

  /**
   * GET /api/integrations/hiera/keys/:key/nodes
   * Get key values across all nodes
   *
   * Requirements: 14.2, 7.2, 7.3, 7.5, 7.6
   */
  router.get(
    "/keys/:key/nodes",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/keys/:key/nodes', requestId, 0)
        : null;

      logger.info("Fetching key values across all nodes", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getKeyAcrossNodes",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const params = KeyNameParamSchema.parse(req.params);
        const paginationParams = PaginationQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching key values across all nodes",
            context: JSON.stringify({ key: params.key, page: paginationParams.page }),
            level: 'debug',
          });
        }

        const hieraService = hieraPlugin.getHieraService();

        // Get key values across all nodes
        const keyNodeValues = await hieraService.getKeyValuesAcrossNodes(params.key);

        // Group nodes by value
        const groupedByValue = hieraService.groupNodesByValue(keyNodeValues);

        // Apply pagination to the flat list
        const paginatedResult = paginate(
          keyNodeValues,
          paginationParams.page,
          paginationParams.pageSize
        );

        const duration = Date.now() - startTime;

        logger.info("Key values across nodes fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getKeyAcrossNodes",
          metadata: { key: params.key, nodeCount: paginatedResult.total, uniqueValues: Object.keys(groupedByValue).length, duration },
        });

        const responseData = {
          key: params.key,
          nodes: paginatedResult.data,
          groupedByValue,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'key', params.key);
          expertModeService.addMetadata(debugInfo, 'nodeCount', paginatedResult.total);
          expertModeService.addMetadata(debugInfo, 'uniqueValues', Object.keys(groupedByValue).length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved key '${params.key}' across ${String(paginatedResult.total)} nodes with ${String(Object.keys(groupedByValue).length)} unique values`,
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
          logger.warn("Invalid key parameter", {
            component: "HieraRouter",
            integration: "hiera",
            operation: "getKeyAcrossNodes",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'hiera');
            expertModeService.addWarning(debugInfo, {
              message: "Invalid key parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid key parameter",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Failed to get key values across nodes", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getKeyAcrossNodes",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get key values across nodes: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get key values across nodes: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ============================================================================
  // Code Analysis Endpoints (18.5)
  // ============================================================================

  /**
   * GET /api/integrations/hiera/analysis
   * Get complete code analysis results
   *
   * Requirements: 14.4
   */
  router.get(
    "/analysis",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/analysis', requestId, 0)
        : null;

      logger.info("Fetching complete code analysis", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getAnalysis",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Running code analysis",
            level: 'debug',
          });
        }

        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const analysisResult = await codeAnalyzer.analyze();

        const duration = Date.now() - startTime;

        logger.info("Code analysis completed successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getAnalysis",
          metadata: { duration },
        });

        const responseData = {
          unusedCode: analysisResult.unusedCode,
          lintIssues: analysisResult.lintIssues,
          moduleUpdates: analysisResult.moduleUpdates,
          statistics: analysisResult.statistics,
          analyzedAt: analysisResult.analyzedAt,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addInfo(debugInfo, {
            message: `Analysis completed at ${analysisResult.analyzedAt}`,
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

        logger.error("Failed to get code analysis", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getAnalysis",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get code analysis: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get code analysis: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/analysis/unused
   * Get unused code report
   *
   * Requirements: 14.4, 8.1, 8.2, 8.3, 8.4
   */
  router.get(
    "/analysis/unused",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/analysis/unused', requestId, 0)
        : null;

      logger.info("Fetching unused code report", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getUnusedCode",
      });

      await Promise.resolve(); // Satisfy linter requirement for await in async function
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Retrieving unused code from analyzer",
            level: 'debug',
          });
        }

        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const unusedCode = codeAnalyzer.getUnusedCode();

        const duration = Date.now() - startTime;

        logger.info("Unused code report fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getUnusedCode",
          metadata: {
            unusedClasses: unusedCode.unusedClasses.length,
            unusedDefinedTypes: unusedCode.unusedDefinedTypes.length,
            unusedHieraKeys: unusedCode.unusedHieraKeys.length,
            duration
          },
        });

        const responseData = {
          unusedClasses: unusedCode.unusedClasses,
          unusedDefinedTypes: unusedCode.unusedDefinedTypes,
          unusedHieraKeys: unusedCode.unusedHieraKeys,
          totals: {
            classes: unusedCode.unusedClasses.length,
            definedTypes: unusedCode.unusedDefinedTypes.length,
            hieraKeys: unusedCode.unusedHieraKeys.length,
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'unusedClasses', unusedCode.unusedClasses.length);
          expertModeService.addMetadata(debugInfo, 'unusedDefinedTypes', unusedCode.unusedDefinedTypes.length);
          expertModeService.addMetadata(debugInfo, 'unusedHieraKeys', unusedCode.unusedHieraKeys.length);
          expertModeService.addInfo(debugInfo, {
            message: `Found ${String(unusedCode.unusedClasses.length)} unused classes, ${String(unusedCode.unusedDefinedTypes.length)} unused defined types, ${String(unusedCode.unusedHieraKeys.length)} unused Hiera keys`,
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

        logger.error("Failed to get unused code report", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getUnusedCode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get unused code report: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get unused code report: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/analysis/lint
   * Get lint issues with optional filtering
   *
   * Requirements: 14.4, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  router.get(
    "/analysis/lint",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/analysis/lint', requestId, 0)
        : null;

      logger.info("Fetching lint issues", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getLintIssues",
      });

      await Promise.resolve(); // Satisfy linter requirement for await in async function
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        const filterParams = LintFilterQuerySchema.parse(req.query);
        const paginationParams = PaginationQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Retrieving and filtering lint issues",
            context: JSON.stringify({ severity: filterParams.severity, types: filterParams.types, page: paginationParams.page }),
            level: 'debug',
          });
        }

        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();

        let lintIssues = codeAnalyzer.getLintIssues();

        // Apply filters
        if (filterParams.severity || filterParams.types) {
          lintIssues = codeAnalyzer.filterIssues(lintIssues, {
            severity: filterParams.severity as ("error" | "warning" | "info")[] | undefined,
            types: filterParams.types,
          });
        }

        // Get issue counts
        const issueCounts = codeAnalyzer.countIssues(lintIssues);

        // Apply pagination
        const paginatedResult = paginate(
          lintIssues,
          paginationParams.page,
          paginationParams.pageSize
        );

        const duration = Date.now() - startTime;

        logger.info("Lint issues fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getLintIssues",
          metadata: { totalIssues: paginatedResult.total, page: paginatedResult.page, duration },
        });

        const responseData = {
          issues: paginatedResult.data,
          counts: issueCounts,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'totalIssues', paginatedResult.total);
          expertModeService.addMetadata(debugInfo, 'issueCounts', issueCounts);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(paginatedResult.total)} lint issues`,
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

        logger.error("Failed to get lint issues", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getLintIssues",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get lint issues: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get lint issues: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/analysis/modules
   * Get module update information
   *
   * Requirements: 14.5, 10.1, 10.2, 10.3, 10.4
   */
  router.get(
    "/analysis/modules",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/analysis/modules', requestId, 0)
        : null;

      logger.info("Fetching module update information", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getModuleUpdates",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Checking for module updates",
            level: 'debug',
          });
        }

        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const moduleUpdates = await codeAnalyzer.getModuleUpdates();

        // Separate modules with updates from up-to-date modules
        const modulesWithUpdates = moduleUpdates.filter(
          (m) => m.currentVersion !== m.latestVersion
        );
        const upToDateModules = moduleUpdates.filter(
          (m) => m.currentVersion === m.latestVersion
        );
        const modulesWithSecurityAdvisories = moduleUpdates.filter(
          (m) => m.hasSecurityAdvisory
        );

        const duration = Date.now() - startTime;

        logger.info("Module updates fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getModuleUpdates",
          metadata: {
            totalModules: moduleUpdates.length,
            withUpdates: modulesWithUpdates.length,
            withSecurityAdvisories: modulesWithSecurityAdvisories.length,
            duration
          },
        });

        const responseData = {
          modules: moduleUpdates,
          summary: {
            total: moduleUpdates.length,
            withUpdates: modulesWithUpdates.length,
            upToDate: upToDateModules.length,
            withSecurityAdvisories: modulesWithSecurityAdvisories.length,
          },
          modulesWithUpdates,
          modulesWithSecurityAdvisories,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addMetadata(debugInfo, 'totalModules', moduleUpdates.length);
          expertModeService.addMetadata(debugInfo, 'withUpdates', modulesWithUpdates.length);
          expertModeService.addMetadata(debugInfo, 'withSecurityAdvisories', modulesWithSecurityAdvisories.length);
          expertModeService.addInfo(debugInfo, {
            message: `Found ${String(modulesWithUpdates.length)} modules with updates (${String(modulesWithSecurityAdvisories.length)} with security advisories)`,
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

        logger.error("Failed to get module updates", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getModuleUpdates",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get module updates: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get module updates: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  /**
   * GET /api/integrations/hiera/analysis/statistics
   * Get usage statistics
   *
   * Requirements: 14.4, 11.1, 11.2, 11.3, 11.4, 11.5
   */
  router.get(
    "/analysis/statistics",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/hiera/analysis/statistics', requestId, 0)
        : null;

      logger.info("Fetching usage statistics", {
        component: "HieraRouter",
        integration: "hiera",
        operation: "getUsageStatistics",
      });

      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        if (debugInfo) {
          expertModeService.addError(debugInfo, {
            message: "Hiera integration is not available",
            level: 'error',
          });
          debugInfo.duration = Date.now() - startTime;
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }
        return;
      }

      try {
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Retrieving usage statistics from analyzer",
            level: 'debug',
          });
        }

        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const statistics = await codeAnalyzer.getUsageStatistics();

        const duration = Date.now() - startTime;

        logger.info("Usage statistics fetched successfully", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getUsageStatistics",
          metadata: { duration },
        });

        const responseData = {
          statistics,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addInfo(debugInfo, {
            message: "Retrieved usage statistics",
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

        logger.error("Failed to get usage statistics", {
          component: "HieraRouter",
          integration: "hiera",
          operation: "getUsageStatistics",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'hiera');
          expertModeService.addError(debugInfo, {
            message: `Failed to get usage statistics: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get usage statistics: ${error instanceof Error ? error.message : String(error)}`,
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
