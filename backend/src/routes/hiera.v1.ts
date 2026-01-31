/**
 * Hiera API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for Hiera data lookup, key resolution, and code analysis
 * using capability-based routing through CapabilityRegistry.
 *
 * Capabilities used:
 * - hiera.lookup: Resolve a key for a node
 * - hiera.keys: List or search keys
 * - hiera.key: Get key details
 * - hiera.hierarchy: Get hierarchy info
 * - hiera.scan: Scan/reload hieradata
 * - hiera.node: Get all Hiera data for a node
 * - hiera.values: Get key values across nodes
 * - hiera.analysis: Get code analysis results
 *
 * Requirements: 14.1-14.6, 13.2, 15.6
 *
 * @module routes/hiera
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeParamSchema } from "../validation/commonSchemas";
import { requireCapability, requireAnyCapability } from "../middleware/rbac";
import {
  requestUserToCapabilityUser,
  createDebugContext,
  createErrorResponse,
} from "./capabilityRouter";

// =============================================================================
// Request Validation Schemas
// =============================================================================

const KeyNameParamSchema = z.object({
  key: z.string().min(1, "Key name is required"),
});

const NodeKeyParamSchema = z.object({
  nodeId: NodeParamSchema.shape.nodeId,
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
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(parseInt(val, 10), 100) : 50)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
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

// KeyFilterQuerySchema available for future use
// const KeyFilterQuerySchema = z.object({
//   filter: z.enum(["used", "unused", "all"]).optional().default("all"),
// });

const BooleanQuerySchema = z.object({
  refresh: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  includeLint: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === undefined),
  includeModuleUpdates: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === undefined),
});

const LookupMethodQuerySchema = z.object({
  lookupMethod: z.enum(["first", "unique", "hash", "deep"]).optional().default("first"),
  environment: z.string().optional().default("production"),
});

// =============================================================================
// Response Types
// =============================================================================

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create Hiera router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @returns Express router
 */
export function createHieraRouterV1(integrationManager: IntegrationManager): Router {
  const router = Router();
  const logger = new LoggerService();

  // ===========================================================================
  // GET /api/integrations/hiera/status
  // Return status of the Hiera integration
  // ===========================================================================
  router.get(
    "/status",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/status", requestId, 0)
        : null;

      logger.info("Fetching Hiera integration status via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getStatus",
      });

      try {
        // Use capability to check status (hiera.scan with no refresh is a lightweight check)
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.keys",
          { limit: 1, offset: 0 },
          debugContext
        );

        const duration = Date.now() - startTime;
        const healthy = result.success;

        const responseData = {
          enabled: true,
          configured: true,
          healthy,
          message: healthy ? "Hiera integration is healthy" : result.error?.message,
          keyCount: healthy && result.data ? (result.data as { keys?: Map<string, unknown> }).keys?.size : undefined,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "healthy", healthy);
          expertModeService.addInfo(debugInfo, {
            message: `Hiera integration is ${healthy ? "healthy" : "unhealthy"}`,
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

        logger.error("Error fetching Hiera status", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        // Return not configured status if capability fails
        const responseData = {
          enabled: false,
          configured: false,
          healthy: false,
          message: error instanceof Error ? error.message : "Hiera integration is not available",
        };

        res.json(
          debugInfo ? expertModeService.attachDebugInfo(responseData, debugInfo) : responseData
        );
      }
    })
  );

  // ===========================================================================
  // POST /api/integrations/hiera/reload
  // Reload control repository data
  // ===========================================================================
  router.post(
    "/reload",
    requireCapability("hiera.scan", {
      contextExtractor: () => ({
        metadata: { refresh: true },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/integrations/hiera/reload", requestId, 0)
        : null;

      logger.info("Reloading Hiera control repository via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "reload",
      });

      try {
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.scan",
          { refresh: true },
          debugContext
        );

        const duration = Date.now() - startTime;

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to reload control repository");
        }

        const scanData = result.data as {
          keys?: Map<string, unknown>;
          scanTime?: string;
          fileCount?: number;
        };

        const responseData = {
          success: true,
          message: "Control repository reloaded successfully",
          keyCount: scanData.keys?.size,
          lastScan: scanData.scanTime,
          fileCount: scanData.fileCount,
        };

        logger.info("Control repository reloaded successfully", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "reload",
          metadata: { keyCount: scanData.keys?.size, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "keyCount", String(scanData.keys?.size ?? 0));
          expertModeService.addInfo(debugInfo, {
            message: `Reloaded ${String(scanData.keys?.size ?? 0)} keys`,
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

        logger.error("Failed to reload control repository", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "reload",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "RELOAD_FAILED",
          error instanceof Error ? error.message : "Failed to reload control repository"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/keys
  // Return all discovered Hiera keys
  // ===========================================================================
  router.get(
    "/keys",
    requireCapability("hiera.keys", {
      contextExtractor: (req) => ({
        metadata: { query: req.query.q ?? req.query.query },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/keys", requestId, 0)
        : null;

      logger.info("Fetching all Hiera keys via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getAllKeys",
      });

      try {
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.keys",
          {
            limit: paginationParams.limit ?? paginationParams.pageSize,
            offset: paginationParams.offset ?? (paginationParams.page - 1) * paginationParams.pageSize,
          },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch Hiera keys");
        }

        const duration = Date.now() - startTime;
        const keyIndex = result.data as {
          keys: Map<string, { locations: unknown[]; lookupOptions?: unknown }>;
          scanTime?: string;
        };

        // Convert Map to array for pagination
        const keysArray = Array.from(keyIndex.keys?.entries?.() ?? []).map(([name, key]) => ({
          name,
          locationCount: key.locations?.length ?? 0,
          hasLookupOptions: !!key.lookupOptions,
        }));

        // Sort alphabetically and paginate
        keysArray.sort((a, b) => a.name.localeCompare(b.name));
        const paginatedResult = paginate(keysArray, paginationParams.page, paginationParams.pageSize);

        logger.info("Hiera keys fetched successfully", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getAllKeys",
          metadata: { total: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "totalKeys", String(paginatedResult.total));
          expertModeService.addInfo(debugInfo, {
            message: `Found ${paginatedResult.total} Hiera keys`,
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(paginatedResult, debugInfo));
        } else {
          res.json(paginatedResult);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching Hiera keys", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getAllKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch Hiera keys"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/keys/search
  // Search for Hiera keys by partial name
  // ===========================================================================
  router.get(
    "/keys/search",
    requireCapability("hiera.keys", {
      contextExtractor: (req) => ({
        metadata: { query: req.query.q ?? req.query.query },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/keys/search", requestId, 0)
        : null;

      logger.info("Searching Hiera keys via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "searchKeys",
      });

      try {
        const searchParams = SearchQuerySchema.parse(req.query);
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const searchQuery = searchParams.q ?? searchParams.query ?? "";

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.keys",
          {
            query: searchQuery,
            limit: paginationParams.limit ?? paginationParams.pageSize,
            offset: paginationParams.offset ?? (paginationParams.page - 1) * paginationParams.pageSize,
          },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to search Hiera keys");
        }

        const duration = Date.now() - startTime;
        const keyIndex = result.data as {
          keys: Map<string, { locations: unknown[]; lookupOptions?: unknown }>;
        };

        // Convert and filter by search query
        const keysArray = Array.from(keyIndex.keys?.entries?.() ?? [])
          .filter(([name]) => !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(([name, key]) => ({
            name,
            locationCount: key.locations?.length ?? 0,
            hasLookupOptions: !!key.lookupOptions,
          }));

        keysArray.sort((a, b) => a.name.localeCompare(b.name));
        const paginatedResult = paginate(keysArray, paginationParams.page, paginationParams.pageSize);

        logger.info("Hiera keys search completed", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "searchKeys",
          metadata: { query: searchQuery, total: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "searchQuery", searchQuery);
          expertModeService.addMetadata(debugInfo, "matches", String(paginatedResult.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(paginatedResult, debugInfo));
        } else {
          res.json(paginatedResult);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error searching Hiera keys", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "searchKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "SEARCH_FAILED",
          error instanceof Error ? error.message : "Failed to search Hiera keys"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/keys/:key
  // Get details for a specific Hiera key
  // ===========================================================================
  router.get(
    "/keys/:key",
    requireCapability("hiera.key", {
      contextExtractor: (req) => ({
        metadata: { key: req.params.key },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/keys/:key", requestId, 0)
        : null;

      logger.info("Fetching Hiera key details via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getKeyDetails",
      });

      try {
        const params = KeyNameParamSchema.parse(req.params);
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.key",
          { key: params.key },
          debugContext
        );

        if (!result.success) {
          if (result.error?.message?.includes("not found")) {
            const errorResponse = createErrorResponse(
              "KEY_NOT_FOUND",
              `Hiera key '${params.key}' not found`
            );

            if (debugInfo) {
              debugInfo.duration = Date.now() - startTime;
              expertModeService.setIntegration(debugInfo, "hiera");
              expertModeService.addWarning(debugInfo, {
                message: `Key '${params.key}' not found`,
                level: "warn",
              });
              debugInfo.performance = expertModeService.collectPerformanceMetrics();
              debugInfo.context = expertModeService.collectRequestContext(req);
            }

            res.status(404).json(
              debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
            );
            return;
          }
          throw new Error(result.error?.message ?? "Failed to fetch key details");
        }

        const duration = Date.now() - startTime;
        const keyData = result.data;

        logger.info("Hiera key details fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getKeyDetails",
          metadata: { key: params.key, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "key", params.key);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(keyData, debugInfo));
        } else {
          res.json(keyData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching Hiera key details", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getKeyDetails",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch key details"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/hierarchy
  // Get Hiera hierarchy configuration
  // ===========================================================================
  router.get(
    "/hierarchy",
    requireCapability("hiera.hierarchy", {
      contextExtractor: (req) => ({
        node: req.query.node as string | undefined,
        metadata: { environment: req.query.environment },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/hierarchy", requestId, 0)
        : null;

      logger.info("Fetching Hiera hierarchy via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getHierarchy",
      });

      try {
        const queryParams = LookupMethodQuerySchema.parse(req.query);
        const nodeId = req.query.node as string | undefined;

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.hierarchy",
          {
            node: nodeId,
            environment: queryParams.environment,
          },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch hierarchy");
        }

        const duration = Date.now() - startTime;
        const hierarchyData = result.data;

        logger.info("Hiera hierarchy fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getHierarchy",
          metadata: { nodeId, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          if (nodeId) expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(hierarchyData, debugInfo));
        } else {
          res.json(hierarchyData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching Hiera hierarchy", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getHierarchy",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch hierarchy"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/nodes/:nodeId/data
  // Get all Hiera data for a specific node
  // ===========================================================================
  router.get(
    "/nodes/:nodeId/data",
    requireCapability("hiera.node", {
      contextExtractor: (req) => ({
        node: req.params.nodeId,
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/nodes/:nodeId/data", requestId, 0)
        : null;

      logger.info("Fetching node Hiera data via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getNodeData",
      });

      try {
        const params = NodeParamSchema.parse({ nodeId: req.params.nodeId });
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.node",
          { node: params.nodeId },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch node Hiera data");
        }

        const duration = Date.now() - startTime;
        const nodeData = result.data;

        logger.info("Node Hiera data fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getNodeData",
          metadata: { nodeId: params.nodeId, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "nodeId", params.nodeId);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(nodeData, debugInfo));
        } else {
          res.json(nodeData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching node Hiera data", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getNodeData",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch node Hiera data"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/nodes/:nodeId/keys
  // Get all Hiera keys for a specific node (with resolved values)
  // ===========================================================================
  router.get(
    "/nodes/:nodeId/keys",
    requireAnyCapability(["hiera.node", "hiera.keys"], {
      contextExtractor: (req) => ({
        node: req.params.nodeId,
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/nodes/:nodeId/keys", requestId, 0)
        : null;

      logger.info("Fetching node Hiera keys via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getNodeKeys",
      });

      try {
        const params = NodeParamSchema.parse({ nodeId: req.params.nodeId });
        const paginationParams = PaginationQuerySchema.parse(req.query);

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        // Get node data which includes resolved keys
        const result = await integrationManager.executeCapability(
          user,
          "hiera.node",
          { node: params.nodeId },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch node Hiera keys");
        }

        const duration = Date.now() - startTime;
        const nodeData = result.data as { resolvedKeys?: Record<string, unknown> };

        // Convert resolved keys to array for pagination
        const keysArray = Object.entries(nodeData.resolvedKeys ?? {}).map(([key, value]) => ({
          key,
          value,
          resolved: true,
        }));

        keysArray.sort((a, b) => a.key.localeCompare(b.key));
        const paginatedResult = paginate(keysArray, paginationParams.page, paginationParams.pageSize);

        logger.info("Node Hiera keys fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getNodeKeys",
          metadata: { nodeId: params.nodeId, total: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "nodeId", params.nodeId);
          expertModeService.addMetadata(debugInfo, "totalKeys", String(paginatedResult.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(paginatedResult, debugInfo));
        } else {
          res.json(paginatedResult);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching node Hiera keys", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getNodeKeys",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch node Hiera keys"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/nodes/:nodeId/keys/:key
  // Resolve a specific Hiera key for a node
  // ===========================================================================
  router.get(
    "/nodes/:nodeId/keys/:key",
    requireCapability("hiera.lookup", {
      contextExtractor: (req) => ({
        node: req.params.nodeId,
        metadata: { key: req.params.key },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/nodes/:nodeId/keys/:key", requestId, 0)
        : null;

      logger.info("Resolving Hiera key for node via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "resolveKey",
      });

      try {
        const params = NodeKeyParamSchema.parse({
          nodeId: req.params.nodeId,
          key: req.params.key,
        });
        const queryParams = LookupMethodQuerySchema.parse(req.query);

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.lookup",
          {
            node: params.nodeId,
            key: params.key,
            environment: queryParams.environment,
            lookupMethod: queryParams.lookupMethod,
          },
          debugContext
        );

        if (!result.success) {
          if (result.error?.message?.includes("not found")) {
            const errorResponse = createErrorResponse(
              "KEY_NOT_FOUND",
              `Hiera key '${params.key}' not found for node '${params.nodeId}'`
            );

            if (debugInfo) {
              debugInfo.duration = Date.now() - startTime;
              expertModeService.setIntegration(debugInfo, "hiera");
              expertModeService.addWarning(debugInfo, {
                message: `Key '${params.key}' not found for node '${params.nodeId}'`,
                level: "warn",
              });
              debugInfo.performance = expertModeService.collectPerformanceMetrics();
              debugInfo.context = expertModeService.collectRequestContext(req);
            }

            res.status(404).json(
              debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
            );
            return;
          }
          throw new Error(result.error?.message ?? "Failed to resolve Hiera key");
        }

        const duration = Date.now() - startTime;
        const resolutionData = result.data;

        logger.info("Hiera key resolved", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "resolveKey",
          metadata: { nodeId: params.nodeId, key: params.key, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "nodeId", params.nodeId);
          expertModeService.addMetadata(debugInfo, "key", params.key);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(resolutionData, debugInfo));
        } else {
          res.json(resolutionData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error resolving Hiera key", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "resolveKey",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "RESOLVE_FAILED",
          error instanceof Error ? error.message : "Failed to resolve Hiera key"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/keys/:key/nodes
  // Get key values across all nodes
  // ===========================================================================
  router.get(
    "/keys/:key/nodes",
    requireCapability("hiera.values", {
      contextExtractor: (req) => ({
        metadata: { key: req.params.key },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/keys/:key/nodes", requestId, 0)
        : null;

      logger.info("Fetching key values across all nodes via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getKeyAcrossNodes",
      });

      try {
        const params = KeyNameParamSchema.parse(req.params);
        const paginationParams = PaginationQuerySchema.parse(req.query);

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.values",
          { key: params.key },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch key values across nodes");
        }

        const duration = Date.now() - startTime;
        const valuesData = result.data as {
          key: string;
          nodeValues: Array<{ node: string; value: unknown; source?: string }>;
        };

        // Paginate node values
        const paginatedResult = paginate(
          valuesData.nodeValues ?? [],
          paginationParams.page,
          paginationParams.pageSize
        );

        const responseData = {
          key: valuesData.key,
          ...paginatedResult,
        };

        logger.info("Key values across nodes fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getKeyAcrossNodes",
          metadata: { key: params.key, nodeCount: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "key", params.key);
          expertModeService.addMetadata(debugInfo, "nodeCount", String(paginatedResult.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching key values across nodes", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getKeyAcrossNodes",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "FETCH_FAILED",
          error instanceof Error ? error.message : "Failed to fetch key values across nodes"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/analysis
  // Get complete code analysis results
  // ===========================================================================
  router.get(
    "/analysis",
    requireCapability("hiera.analysis", {
      contextExtractor: (req) => ({
        metadata: { refresh: req.query.refresh === "true" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/analysis", requestId, 0)
        : null;

      logger.info("Fetching complete code analysis via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getAnalysis",
      });

      try {
        const queryParams = BooleanQuerySchema.parse(req.query);

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.analysis",
          {
            refresh: queryParams.refresh,
            includeLint: queryParams.includeLint,
            includeModuleUpdates: queryParams.includeModuleUpdates,
          },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch code analysis");
        }

        const duration = Date.now() - startTime;
        const analysisData = result.data;

        logger.info("Code analysis fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getAnalysis",
          metadata: { duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(analysisData, debugInfo));
        } else {
          res.json(analysisData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching code analysis", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getAnalysis",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "ANALYSIS_FAILED",
          error instanceof Error ? error.message : "Failed to fetch code analysis"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/analysis/unused
  // Get unused code report (derived from analysis)
  // ===========================================================================
  router.get(
    "/analysis/unused",
    requireCapability("hiera.analysis", {
      contextExtractor: () => ({
        metadata: { type: "unused" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/analysis/unused", requestId, 0)
        : null;

      logger.info("Fetching unused code report via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getUnusedCode",
      });

      try {
        // Pagination available for future use: PaginationQuerySchema.parse(req.query)
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.analysis",
          { refresh: false, includeLint: false, includeModuleUpdates: false },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch unused code report");
        }

        const duration = Date.now() - startTime;
        const analysisData = result.data as {
          unusedKeys?: unknown[];
          unusedFiles?: unknown[];
          unusedValues?: unknown[];
        };

        // Extract unused code information
        const unusedReport = {
          unusedKeys: analysisData.unusedKeys ?? [],
          unusedFiles: analysisData.unusedFiles ?? [],
          unusedValues: analysisData.unusedValues ?? [],
          total: (analysisData.unusedKeys?.length ?? 0) +
                 (analysisData.unusedFiles?.length ?? 0) +
                 (analysisData.unusedValues?.length ?? 0),
        };

        logger.info("Unused code report fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getUnusedCode",
          metadata: { total: unusedReport.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "unusedCount", String(unusedReport.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(unusedReport, debugInfo));
        } else {
          res.json(unusedReport);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching unused code report", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getUnusedCode",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "ANALYSIS_FAILED",
          error instanceof Error ? error.message : "Failed to fetch unused code report"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/analysis/lint
  // Get lint issues with optional filtering
  // ===========================================================================
  router.get(
    "/analysis/lint",
    requireCapability("hiera.analysis", {
      contextExtractor: () => ({
        metadata: { type: "lint" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/analysis/lint", requestId, 0)
        : null;

      logger.info("Fetching lint issues via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getLintIssues",
      });

      try {
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const filterParams = LintFilterQuerySchema.parse(req.query);

        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.analysis",
          { refresh: false, includeLint: true, includeModuleUpdates: false },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch lint issues");
        }

        const duration = Date.now() - startTime;
        const analysisData = result.data as {
          lintIssues?: Array<{ severity?: string; type?: string; [key: string]: unknown }>;
        };

        // Filter lint issues
        let lintIssues = analysisData.lintIssues ?? [];

        if (filterParams.severity && filterParams.severity.length > 0) {
          lintIssues = lintIssues.filter(
            (issue) => filterParams.severity!.includes(issue.severity ?? "")
          );
        }

        if (filterParams.types && filterParams.types.length > 0) {
          lintIssues = lintIssues.filter(
            (issue) => filterParams.types!.includes(issue.type ?? "")
          );
        }

        const paginatedResult = paginate(lintIssues, paginationParams.page, paginationParams.pageSize);

        logger.info("Lint issues fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getLintIssues",
          metadata: { total: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "issueCount", String(paginatedResult.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(paginatedResult, debugInfo));
        } else {
          res.json(paginatedResult);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching lint issues", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getLintIssues",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "ANALYSIS_FAILED",
          error instanceof Error ? error.message : "Failed to fetch lint issues"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/analysis/modules
  // Get module update information
  // ===========================================================================
  router.get(
    "/analysis/modules",
    requireCapability("hiera.analysis", {
      contextExtractor: () => ({
        metadata: { type: "modules" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/analysis/modules", requestId, 0)
        : null;

      logger.info("Fetching module update information via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getModuleUpdates",
      });

      try {
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.analysis",
          { refresh: false, includeLint: false, includeModuleUpdates: true },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch module updates");
        }

        const duration = Date.now() - startTime;
        const analysisData = result.data as {
          moduleUpdates?: Array<{ [key: string]: unknown }>;
        };

        const paginatedResult = paginate(
          analysisData.moduleUpdates ?? [],
          paginationParams.page,
          paginationParams.pageSize
        );

        logger.info("Module update info fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getModuleUpdates",
          metadata: { total: paginatedResult.total, duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addMetadata(debugInfo, "moduleCount", String(paginatedResult.total));
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(paginatedResult, debugInfo));
        } else {
          res.json(paginatedResult);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching module updates", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getModuleUpdates",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "ANALYSIS_FAILED",
          error instanceof Error ? error.message : "Failed to fetch module updates"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // ===========================================================================
  // GET /api/integrations/hiera/analysis/statistics
  // Get usage statistics
  // ===========================================================================
  router.get(
    "/analysis/statistics",
    requireCapability("hiera.analysis", {
      contextExtractor: () => ({
        metadata: { type: "statistics" },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/integrations/hiera/analysis/statistics", requestId, 0)
        : null;

      logger.info("Fetching usage statistics via capability", {
        component: "HieraRouterV1",
        integration: "hiera",
        operation: "getUsageStatistics",
      });

      try {
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        const result = await integrationManager.executeCapability(
          user,
          "hiera.analysis",
          { refresh: false, includeLint: false, includeModuleUpdates: false },
          debugContext
        );

        if (!result.success) {
          throw new Error(result.error?.message ?? "Failed to fetch usage statistics");
        }

        const duration = Date.now() - startTime;
        const analysisData = result.data as {
          statistics?: Record<string, unknown>;
          keyCount?: number;
          fileCount?: number;
          nodeCount?: number;
        };

        const statistics = {
          statistics: analysisData.statistics ?? {},
          keyCount: analysisData.keyCount,
          fileCount: analysisData.fileCount,
          nodeCount: analysisData.nodeCount,
        };

        logger.info("Usage statistics fetched", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getUsageStatistics",
          metadata: { duration },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(statistics, debugInfo));
        } else {
          res.json(statistics);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching usage statistics", {
          component: "HieraRouterV1",
          integration: "hiera",
          operation: "getUsageStatistics",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "hiera");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "ANALYSIS_FAILED",
          error instanceof Error ? error.message : "Failed to fetch usage statistics"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
