/**
 * v1 Widgets Router
 *
 * Provides v1 API endpoints for widget discovery.
 * Routes:
 * - GET /api/v1/widgets - List all widgets
 * - GET /api/v1/widgets/slot/:slot - Get widgets for a specific slot
 *
 * @module routes/v1/widgets
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import type { User as CapabilityUser } from "../../integrations/CapabilityRegistry";
import { asyncHandler } from "../asyncHandler";
import { ExpertModeService } from "../../services/ExpertModeService";

/**
 * Valid widget slots
 */
const VALID_SLOTS = [
  "home-summary",
  "dashboard",
  "node-detail",
  "node-journal",
  "inventory-panel",
  "standalone-page",
  "sidebar",
  "modal",
] as const;

/**
 * Query schema for listing widgets
 */
const ListWidgetsQuerySchema = z.object({
  pluginName: z.string().optional(),
});

/**
 * Slot parameter schema
 */
const SlotParamSchema = z.object({
  slot: z.enum(VALID_SLOTS),
});

/**
 * Convert Express request user to CapabilityRegistry user format
 */
function requestUserToCapabilityUser(req: Request): CapabilityUser {
  const user = req.user;
  if (!user) {
    return {
      id: "anonymous",
      username: "anonymous",
      roles: [],
      permissions: [],
    };
  }

  return {
    id: user.id,
    username: user.username,
    roles: user.roles ?? [],
    permissions: [],
  };
}

/**
 * Create the v1 widgets router
 *
 * @param integrationManager - Integration manager instance
 * @param logger - Logger service instance
 * @returns Express router with v1 widgets endpoints
 */
export function createV1WidgetsRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService
): Router {
  const router = Router();

  /**
   * GET /api/v1/widgets
   *
   * Returns list of all registered widgets.
   * Supports filtering by plugin name.
   * Widgets are sorted by priority (highest first).
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/widgets", requestId, 0)
        : null;

      logger.debug("Fetching all widgets for v1 API", {
        component: "V1WidgetsRouter",
        operation: "listWidgets",
      });

      try {
        // Validate query parameters
        const query = ListWidgetsQuerySchema.parse(req.query);

        const capabilityRegistry = integrationManager.getCapabilityRegistry();
        const user = requestUserToCapabilityUser(req);

        // Get all widgets (already sorted by priority)
        let allWidgets = capabilityRegistry.getAllWidgets(user);

        // Filter by plugin name if specified
        if (query.pluginName) {
          allWidgets = allWidgets.filter(
            (w) => w.pluginName === query.pluginName
          );
        }

        const widgets = allWidgets.map((w) => ({
          id: w.widgetId,
          name: w.widget.name,
          component: w.widget.component,
          slots: w.widget.slots,
          size: w.widget.size,
          requiredCapabilities: w.widget.requiredCapabilities,
          config: w.widget.config,
          icon: w.widget.icon,
          priority: w.widget.priority ?? 0,
          pluginName: w.pluginName,
          authorized: w.authorized,
        }));

        const duration = Date.now() - startTime;

        logger.info(`Returning ${widgets.length} widgets via v1 API`, {
          component: "V1WidgetsRouter",
          operation: "listWidgets",
          metadata: {
            widgetCount: widgets.length,
            filter: query.pluginName,
            duration,
          },
        });

        const responseData = {
          widgets,
          slots: VALID_SLOTS,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "widgetCount", widgets.length);
          expertModeService.addMetadata(debugInfo, "filter", query.pluginName);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid query parameters", {
            component: "V1WidgetsRouter",
            operation: "listWidgets",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid query parameters",
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        throw error;
      }
    })
  );

  /**
   * GET /api/v1/widgets/slot/:slot
   *
   * Returns widgets for a specific slot.
   * Widgets are sorted by priority (highest first).
   */
  router.get(
    "/slot/:slot",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/widgets/slot/:slot", requestId, 0)
        : null;

      try {
        // Validate slot parameter
        const params = SlotParamSchema.parse(req.params);
        const slot = params.slot;

        logger.debug(`Fetching widgets for slot: ${slot}`, {
          component: "V1WidgetsRouter",
          operation: "getWidgetsBySlot",
          metadata: { slot },
        });

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: `Fetching widgets for slot: ${slot}`,
            level: "debug",
          });
        }

        const capabilityRegistry = integrationManager.getCapabilityRegistry();
        const user = requestUserToCapabilityUser(req);

        // Get widgets for the specified slot (already sorted by priority)
        const slotWidgets = capabilityRegistry.getAllWidgets(user, slot);

        const widgets = slotWidgets.map((w) => ({
          id: w.widgetId,
          name: w.widget.name,
          component: w.widget.component,
          slots: w.widget.slots,
          size: w.widget.size,
          requiredCapabilities: w.widget.requiredCapabilities,
          config: w.widget.config,
          icon: w.widget.icon,
          priority: w.widget.priority ?? 0,
          pluginName: w.pluginName,
          authorized: w.authorized,
        }));

        const duration = Date.now() - startTime;

        logger.info(`Returning ${widgets.length} widgets for slot: ${slot}`, {
          component: "V1WidgetsRouter",
          operation: "getWidgetsBySlot",
          metadata: {
            slot,
            widgetCount: widgets.length,
            duration,
          },
        });

        const responseData = {
          slot,
          widgets,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "slot", slot);
          expertModeService.addMetadata(debugInfo, "widgetCount", widgets.length);
          expertModeService.addInfo(debugInfo, {
            message: `Found ${widgets.length} widgets for slot: ${slot}`,
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

        if (error instanceof z.ZodError) {
          logger.warn("Invalid slot parameter", {
            component: "V1WidgetsRouter",
            operation: "getWidgetsBySlot",
            metadata: { errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_SLOT",
              message: `Invalid slot. Valid slots are: ${VALID_SLOTS.join(", ")}`,
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid slot parameter",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        logger.error("Error fetching widgets by slot", {
          component: "V1WidgetsRouter",
          operation: "getWidgetsBySlot",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch widgets",
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          res.status(500).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(500).json(errorResponse);
        }
      }
    })
  );

  return router;
}
