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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!hieraPlugin) {
        res.json({
          enabled: false,
          configured: false,
          healthy: false,
          message: "Hiera integration is not configured",
        });
        return;
      }

      const healthStatus = await hieraPlugin.healthCheck();
      const hieraConfig = hieraPlugin.getHieraConfig();
      const validationResult = hieraPlugin.getValidationResult();

      res.json({
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
      });
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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        await hieraPlugin.reload();

        const healthStatus = await hieraPlugin.healthCheck();

        res.json({
          success: true,
          message: "Control repository reloaded successfully",
          keyCount: healthStatus.details?.keyCount as number | undefined,
          fileCount: healthStatus.details?.fileCount as number | undefined,
          lastScan: healthStatus.details?.lastScanTime as string | undefined,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.PARSE_ERROR,
            message: `Failed to reload control repository: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const paginationParams = PaginationQuerySchema.parse(req.query);
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

        res.json({
          keys: paginatedResult.data,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const searchParams = SearchQuerySchema.parse(req.query);
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const query = searchParams.q ?? searchParams.query ?? "";

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

        res.json({
          keys: paginatedResult.data,
          query,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to search Hiera keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const params = KeyNameParamSchema.parse(req.params);
        const hieraService = hieraPlugin.getHieraService();
        const key = await hieraService.getKey(params.key);

        if (!key) {
          res.status(404).json({
            error: {
              code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
              message: `Key '${params.key}' not found`,
            },
          });
          return;
        }

        res.json({
          key: {
            name: key.name,
            locations: key.locations,
            lookupOptions: key.lookupOptions,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid key parameter",
              details: error.errors,
            },
          });
          return;
        }

        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get key details: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const filterParams = KeyFilterQuerySchema.parse(req.query);
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

        res.json({
          nodeId: nodeData.nodeId,
          keys: keysArray,
          usedKeys: Array.from(nodeData.usedKeys),
          unusedKeys: Array.from(nodeData.unusedKeys),
          factSource,
          totalKeys: keysArray.length,
          hierarchyFiles: nodeData.hierarchyFiles,
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

        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get node Hiera data: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const paginationParams = PaginationQuerySchema.parse(req.query);
        const filterParams = KeyFilterQuerySchema.parse(req.query);
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

        res.json({
          nodeId: params.nodeId,
          keys: paginatedResult.data,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
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

        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get node keys: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const params = NodeKeyParamSchema.parse(req.params);
        const hieraService = hieraPlugin.getHieraService();

        const resolution = await hieraService.resolveKey(params.nodeId, params.key);

        res.json({
          nodeId: params.nodeId,
          key: resolution.key,
          resolvedValue: resolution.resolvedValue,
          lookupMethod: resolution.lookupMethod,
          sourceFile: resolution.sourceFile,
          hierarchyLevel: resolution.hierarchyLevel,
          allValues: resolution.allValues,
          interpolatedVariables: resolution.interpolatedVariables,
          found: resolution.found,
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

        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to resolve key: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const params = KeyNameParamSchema.parse(req.params);
        const paginationParams = PaginationQuerySchema.parse(req.query);
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

        res.json({
          key: params.key,
          nodes: paginatedResult.data,
          groupedByValue,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid key parameter",
              details: error.errors,
            },
          });
          return;
        }

        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.RESOLUTION_ERROR,
            message: `Failed to get key values across nodes: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const analysisResult = await codeAnalyzer.analyze();

        res.json({
          unusedCode: analysisResult.unusedCode,
          lintIssues: analysisResult.lintIssues,
          moduleUpdates: analysisResult.moduleUpdates,
          statistics: analysisResult.statistics,
          analyzedAt: analysisResult.analyzedAt,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get code analysis: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      await Promise.resolve(); // Satisfy linter requirement for await in async function
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const unusedCode = codeAnalyzer.getUnusedCode();

        res.json({
          unusedClasses: unusedCode.unusedClasses,
          unusedDefinedTypes: unusedCode.unusedDefinedTypes,
          unusedHieraKeys: unusedCode.unusedHieraKeys,
          totals: {
            classes: unusedCode.unusedClasses.length,
            definedTypes: unusedCode.unusedDefinedTypes.length,
            hieraKeys: unusedCode.unusedHieraKeys.length,
          },
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get unused code report: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
      await Promise.resolve(); // Satisfy linter requirement for await in async function
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const filterParams = LintFilterQuerySchema.parse(req.query);
        const paginationParams = PaginationQuerySchema.parse(req.query);
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

        res.json({
          issues: paginatedResult.data,
          counts: issueCounts,
          total: paginatedResult.total,
          page: paginatedResult.page,
          pageSize: paginatedResult.pageSize,
          totalPages: paginatedResult.totalPages,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get lint issues: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
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

        res.json({
          modules: moduleUpdates,
          summary: {
            total: moduleUpdates.length,
            withUpdates: modulesWithUpdates.length,
            upToDate: upToDateModules.length,
            withSecurityAdvisories: modulesWithSecurityAdvisories.length,
          },
          modulesWithUpdates,
          modulesWithSecurityAdvisories,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get module updates: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
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
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const hieraPlugin = getHieraPlugin(integrationManager);

      if (!checkHieraAvailability(hieraPlugin, res)) {
        return;
      }

      try {
        const codeAnalyzer = hieraPlugin.getCodeAnalyzer();
        const statistics = await codeAnalyzer.getUsageStatistics();

        res.json({
          statistics,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            code: HIERA_ERROR_CODES.ANALYSIS_ERROR,
            message: `Failed to get usage statistics: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    })
  );

  return router;
}
