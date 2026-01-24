import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../asyncHandler";
import { IntegrationColorService } from "../../services/IntegrationColorService";
import { ExpertModeService } from "../../services/ExpertModeService";
import { createLogger } from "./utils";

/**
 * Create colors router for integration color configuration
 */
export function createColorsRouter(): Router {
  const router = Router();
  const colorService = new IntegrationColorService();
  const logger = createLogger();

  /**
   * GET /api/integrations/colors
   * Return color configuration for all integrations
   *
   * Returns consistent color palette for visual identification of data sources.
   * Each integration (bolt, puppetdb, puppetserver, hiera) has a unique color
   * with primary, light, and dark variants for different UI contexts.
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/integrations/colors', requestId, 0)
        : null;

      logger.info("Fetching integration colors", {
        component: "ColorsRouter",
        operation: "getColors",
      });

      try {
        const colors = colorService.getAllColors();
        const integrations = colorService.getValidIntegrations();
        const duration = Date.now() - startTime;

        logger.debug("Successfully fetched integration colors", {
          component: "ColorsRouter",
          operation: "getColors",
          metadata: { integrationCount: integrations.length, duration },
        });

        // Capture debug in expert mode
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Successfully fetched integration colors",
            context: JSON.stringify({ integrationCount: integrations.length, duration }),
            level: 'debug',
          });
        }

        const responseData = {
          colors,
          integrations,
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, 'integrationCount', integrations.length);
          expertModeService.addInfo(debugInfo, {
            message: 'Color configuration retrieved successfully',
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
        logger.error("Error fetching integration colors", {
          component: "ColorsRouter",
          operation: "getColors",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: "Error fetching integration colors",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch integration colors",
          },
        };

        res.status(500).json(debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse);
      }
    }),
  );

  return router;
}
