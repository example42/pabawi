/**
 * Capability Router Utilities
 *
 * Helper utilities for creating capability-based routes in v1.0.0.
 * Provides standardized patterns for:
 * - Capability execution via IntegrationManager
 * - RBAC middleware integration
 * - Expert/debug mode response handling
 * - Consistent error handling
 *
 * @module routes/capabilityRouter
 * @version 1.0.0
 */

import type { Request, Response, NextFunction } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { User as CapabilityUser, DebugContext } from "../integrations/CapabilityRegistry";
import { ExpertModeService } from "../services/ExpertModeService";
import { LoggerService } from "../services/LoggerService";

/**
 * Convert Express request user to CapabilityRegistry user format
 */
export function requestUserToCapabilityUser(req: Request): CapabilityUser {
  const user = req.user;
  if (!user) {
    // Return anonymous user for unauthenticated requests
    // Note: RBAC middleware should block unauthenticated requests if auth is required
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
    permissions: [], // Will be checked via authorization service
  };
}

/**
 * Create debug context from request for capability execution tracing
 */
export function createDebugContext(req: Request): DebugContext | undefined {
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
 * Options for capability route execution
 */
export interface CapabilityRouteOptions {
  /** Capability name to execute */
  capability: string;
  /** Route name for logging */
  routeName: string;
  /** Integration name for logging */
  integration?: string;
  /** Parameter extractor from request */
  extractParams: (req: Request) => Record<string, unknown>;
  /** Transform result before sending response */
  transformResult?: (data: unknown, req: Request) => unknown;
  /** Custom response status code (default: 200) */
  successStatus?: number;
  /** Whether to wrap result in data object (default: true) */
  wrapResult?: boolean;
}

/**
 * Execute a capability and send response with standard formatting
 *
 * This is the v1.0.0 standard pattern for capability-based routes:
 * 1. Extract user and debug context from request
 * 2. Execute capability via IntegrationManager
 * 3. Handle success/error responses with expert mode support
 *
 * @param integrationManager - IntegrationManager instance
 * @param options - Route execution options
 * @returns Express route handler
 */
export function createCapabilityHandler(
  integrationManager: IntegrationManager,
  options: CapabilityRouteOptions
) {
  const logger = new LoggerService();

  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const expertModeService = new ExpertModeService();
    const requestId = req.id ?? expertModeService.generateRequestId();

    // Create debug info if expert mode is enabled
    const debugInfo = req.expertMode
      ? expertModeService.createDebugInfo(options.routeName, requestId, 0)
      : null;

    logger.info(`Processing ${options.routeName} request`, {
      component: "CapabilityRouter",
      integration: options.integration,
      operation: options.capability,
      metadata: { requestId },
    });

    try {
      // Extract parameters from request
      const params = options.extractParams(req);

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: `Executing capability: ${options.capability}`,
          context: JSON.stringify(params),
          level: "debug",
        });
      }

      // Get user context for capability execution
      const user = requestUserToCapabilityUser(req);
      const debugContext = createDebugContext(req);

      // Execute capability via IntegrationManager
      const result = await integrationManager.executeCapability(
        user,
        options.capability,
        params,
        debugContext
      );

      const duration = Date.now() - startTime;

      if (!result.success) {
        // Handle capability execution failure
        logger.warn(`Capability execution failed: ${options.capability}`, {
          component: "CapabilityRouter",
          integration: options.integration,
          operation: options.capability,
          metadata: {
            error: result.error?.code,
            message: result.error?.message,
            duration,
          },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          if (options.integration) {
            expertModeService.setIntegration(debugInfo, options.integration);
          }
          expertModeService.addWarning(debugInfo, {
            message: result.error?.message ?? "Capability execution failed",
            context: result.error?.code,
            level: "warn",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        // Map error codes to HTTP status codes
        const statusCode = mapErrorCodeToStatus(result.error?.code);
        const errorResponse = {
          error: {
            code: result.error?.code ?? "CAPABILITY_FAILED",
            message: result.error?.message ?? "Capability execution failed",
            details: result.error?.details,
          },
        };

        res.status(statusCode).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
        return;
      }

      // Success
      logger.info(`${options.routeName} completed successfully`, {
        component: "CapabilityRouter",
        integration: options.integration,
        operation: options.capability,
        metadata: { duration, handledBy: result.handledBy },
      });

      // Transform result if transformer provided
      const transformedData = options.transformResult
        ? options.transformResult(result.data, req)
        : result.data;

      // Build response
      const wrapResult = options.wrapResult ?? true;
      const responseData = wrapResult
        ? { data: transformedData, source: result.handledBy }
        : transformedData;

      // Attach debug info if expert mode is enabled
      if (debugInfo) {
        debugInfo.duration = duration;
        if (options.integration) {
          expertModeService.setIntegration(debugInfo, options.integration);
        }
        expertModeService.addMetadata(debugInfo, "handledBy", result.handledBy);
        expertModeService.addMetadata(debugInfo, "durationMs", result.durationMs);
        expertModeService.addInfo(debugInfo, {
          message: `Capability ${options.capability} executed successfully`,
          level: "info",
        });

        if (result.debug) {
          expertModeService.addMetadata(debugInfo, "capabilityDebug", result.debug);
        }

        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);

        res.status(options.successStatus ?? 200).json(
          expertModeService.attachDebugInfo(responseData, debugInfo)
        );
      } else {
        res.status(options.successStatus ?? 200).json(responseData);
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`Error executing ${options.routeName}`, {
        component: "CapabilityRouter",
        integration: options.integration,
        operation: options.capability,
        metadata: { duration },
      }, error instanceof Error ? error : undefined);

      if (debugInfo) {
        debugInfo.duration = duration;
        if (options.integration) {
          expertModeService.setIntegration(debugInfo, options.integration);
        }
        expertModeService.addError(debugInfo, {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          level: "error",
        });
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
      }

      const errorResponse = {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      };

      res.status(500).json(
        debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
      );
    }
  };
}

/**
 * Map capability error codes to HTTP status codes
 */
function mapErrorCodeToStatus(code?: string): number {
  switch (code) {
    case "CAPABILITY_NOT_FOUND":
      return 404;
    case "PERMISSION_DENIED":
      return 403;
    case "INVALID_PARAMETERS":
      return 400;
    case "NOT_INITIALIZED":
      return 503;
    case "EXECUTION_TIMEOUT":
      return 504;
    default:
      return 500;
  }
}

/**
 * Response formatter for capability results
 */
export interface CapabilityResponse<T = unknown> {
  data: T;
  source: string;
  debug?: {
    correlationId: string;
    durationMs: number;
    capabilityName: string;
    pluginName: string;
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown
): { error: { code: string; message: string; details?: unknown } } {
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}
