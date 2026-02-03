/**
 * v1 Capabilities Router
 *
 * Provides v1 API endpoints for capability discovery and execution.
 * Routes:
 * - GET /api/v1/capabilities - List all capabilities
 * - GET /api/v1/capabilities/:name - Get capability details
 * - POST /api/v1/capabilities/:name/execute - Execute a capability
 *
 * @module routes/v1/capabilities
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import type { User as CapabilityUser, DebugContext } from "../../integrations/CapabilityRegistry";
import { asyncHandler } from "../asyncHandler";
import { ExpertModeService } from "../../services/ExpertModeService";

/**
 * Query schema for listing capabilities
 */
const ListCapabilitiesQuerySchema = z.object({
  category: z.string().optional(),
  riskLevel: z.enum(["read", "write", "execute", "admin"]).optional(),
  pluginName: z.string().optional(),
});

/**
 * Schema for capability execution request body
 */
const ExecuteCapabilityBodySchema = z.object({
  params: z.record(z.unknown()).optional().default({}),
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
 * Create debug context from request
 */
function createDebugContext(req: Request): DebugContext | undefined {
  if (!req.expertMode) {
    return undefined;
  }

  return {
    correlationId: req.id ?? new ExpertModeService().generateRequestId(),
    startTime: Date.now(),
    metadata: {
      path: req.path,
      method: req.method,
      userAgent: req.headers["user-agent"],
    },
  };
}

/**
 * Create the v1 capabilities router
 *
 * @param integrationManager - Integration manager instance
 * @param logger - Logger service instance
 * @returns Express router with v1 capabilities endpoints
 */
export function createV1CapabilitiesRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService
): Router {
  const router = Router();

  /**
   * GET /api/v1/capabilities
   *
   * Returns list of all registered capabilities.
   * Supports filtering by category, risk level, and plugin name.
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/v1/capabilities", requestId, 0)
        : null;

      logger.debug("Fetching all capabilities for v1 API", {
        component: "V1CapabilitiesRouter",
        operation: "listCapabilities",
      });

      try {
        // Validate query parameters
        const query = ListCapabilitiesQuerySchema.parse(req.query);

        const capabilityRegistry = integrationManager.getCapabilityRegistry();
        const user = requestUserToCapabilityUser(req);

        // Get all capabilities with optional filtering
        const allCapabilities = capabilityRegistry.getAllCapabilities(user, {
          category: query.category,
          riskLevel: query.riskLevel,
          pluginName: query.pluginName,
          includeUnauthorized: false,
        });

        const capabilities = allCapabilities.map((c) => ({
          name: c.capability.name,
          category: c.capability.category,
          description: c.capability.description,
          riskLevel: c.capability.riskLevel,
          requiredPermissions: c.capability.requiredPermissions,
          pluginName: c.pluginName,
          priority: c.priority,
          authorized: c.authorized,
        }));

        const duration = Date.now() - startTime;

        logger.info(`Returning ${capabilities.length} capabilities via v1 API`, {
          component: "V1CapabilitiesRouter",
          operation: "listCapabilities",
          metadata: {
            capabilityCount: capabilities.length,
            filters: query,
            duration,
          },
        });

        const responseData = { capabilities };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "capabilityCount", capabilities.length);
          expertModeService.addMetadata(debugInfo, "filters", query);
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
            component: "V1CapabilitiesRouter",
            operation: "listCapabilities",
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
   * GET /api/v1/capabilities/:name
   *
   * Returns detailed information about a specific capability.
   */
  router.get(
    "/:name",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      logger.debug(`Fetching capability: ${name}`, {
        component: "V1CapabilitiesRouter",
        operation: "getCapability",
        metadata: { capabilityName: name },
      });

      const capabilityRegistry = integrationManager.getCapabilityRegistry();
      const providers = capabilityRegistry.getProvidersForCapability(name);

      if (providers.length === 0) {
        logger.warn(`Capability not found: ${name}`, {
          component: "V1CapabilitiesRouter",
          operation: "getCapability",
          metadata: { capabilityName: name },
        });

        res.status(404).json({
          error: {
            code: "CAPABILITY_NOT_FOUND",
            message: `No capability found with name: ${name}`,
          },
        });
        return;
      }

      // Get primary provider (highest priority)
      const primary = providers[0];

      // Check user authorization
      const user = requestUserToCapabilityUser(req);
      const allCapabilities = capabilityRegistry.getAllCapabilities(user, {
        includeUnauthorized: true,
      });
      const capabilityWithAuth = allCapabilities.find(
        (c) => c.capability.name === name
      );

      res.json({
        name: primary.capability.name,
        category: primary.capability.category,
        description: primary.capability.description,
        riskLevel: primary.capability.riskLevel,
        requiredPermissions: primary.capability.requiredPermissions,
        pluginName: primary.pluginName,
        priority: primary.priority,
        registeredAt: primary.registeredAt,
        authorized: capabilityWithAuth?.authorized ?? false,
        providers: providers.map((p) => ({
          pluginName: p.pluginName,
          priority: p.priority,
        })),
      });
    })
  );

  /**
   * POST /api/v1/capabilities/:name/execute
   *
   * Execute a capability with the provided parameters.
   * Requires appropriate RBAC permissions.
   */
  router.post(
    "/:name/execute",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(`POST /api/v1/capabilities/${name}/execute`, requestId, 0)
        : null;

      logger.info(`Executing capability: ${name}`, {
        component: "V1CapabilitiesRouter",
        operation: "executeCapability",
        metadata: { capabilityName: name, requestId },
      });

      try {
        // Validate request body
        const body = ExecuteCapabilityBodySchema.parse(req.body);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: `Executing capability: ${name}`,
            context: JSON.stringify(body.params),
            level: "debug",
          });
        }

        // Get user context
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        // Execute capability via IntegrationManager
        const result = await integrationManager.executeCapability(
          user,
          name,
          body.params,
          debugContext
        );

        const duration = Date.now() - startTime;

        if (!result.success) {
          logger.warn(`Capability execution failed: ${name}`, {
            component: "V1CapabilitiesRouter",
            operation: "executeCapability",
            metadata: {
              capabilityName: name,
              error: result.error?.code,
              message: result.error?.message,
              duration,
            },
          });

          // Map error codes to HTTP status codes
          let statusCode = 500;
          switch (result.error?.code) {
            case "CAPABILITY_NOT_FOUND":
              statusCode = 404;
              break;
            case "PERMISSION_DENIED":
              statusCode = 403;
              break;
            case "INVALID_PARAMETERS":
              statusCode = 400;
              break;
            case "NOT_INITIALIZED":
              statusCode = 503;
              break;
            case "EXECUTION_TIMEOUT":
              statusCode = 504;
              break;
          }

          const errorResponse = {
            error: {
              code: result.error?.code ?? "CAPABILITY_FAILED",
              message: result.error?.message ?? "Capability execution failed",
              details: result.error?.details,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addError(debugInfo, {
              message: result.error?.message ?? "Capability execution failed",
              context: result.error?.code,
              level: "error",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
            res.status(statusCode).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(statusCode).json(errorResponse);
          }
          return;
        }

        // Success
        logger.info(`Capability executed successfully: ${name}`, {
          component: "V1CapabilitiesRouter",
          operation: "executeCapability",
          metadata: {
            capabilityName: name,
            handledBy: result.handledBy,
            duration,
          },
        });

        const responseData = {
          success: true,
          data: result.data,
          handledBy: result.handledBy,
          durationMs: result.durationMs,
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addMetadata(debugInfo, "handledBy", result.handledBy);
          expertModeService.addMetadata(debugInfo, "durationMs", result.durationMs);
          expertModeService.addInfo(debugInfo, {
            message: `Capability ${name} executed successfully`,
            level: "info",
          });

          if (result.debug) {
            expertModeService.addMetadata(debugInfo, "capabilityDebug", result.debug);
          }

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request body", {
            component: "V1CapabilitiesRouter",
            operation: "executeCapability",
            metadata: { capabilityName: name, errors: error.errors },
          });

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request body",
              details: error.errors,
            },
          };

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request body",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            res.status(400).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(400).json(errorResponse);
          }
          return;
        }

        logger.error(`Error executing capability: ${name}`, {
          component: "V1CapabilitiesRouter",
          operation: "executeCapability",
          metadata: { capabilityName: name, duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred",
          },
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(500).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
        } else {
          res.status(500).json(errorResponse);
        }
      }
    })
  );

  return router;
}
