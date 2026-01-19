import { type Request, type Response } from "express";
import { z } from "zod";
import { ExpertModeService } from "../../services/ExpertModeService";
import { LoggerService } from "../../services/LoggerService";

/**
 * EXPERT MODE PATTERN - CORRECT IMPLEMENTATION
 *
 * The correct pattern for expert mode is demonstrated in backend/src/routes/inventory.ts
 *
 * Key principles:
 * 1. Create debugInfo ONCE at route start if expert mode is enabled
 * 2. Reuse the SAME debugInfo object throughout the request
 * 3. Attach debugInfo to ALL responses (both success AND error)
 * 4. Include performance metrics and request context
 * 5. Capture external API errors with full stack traces
 *
 * Example:
 * ```typescript
 * const startTime = Date.now();
 * const expertModeService = new ExpertModeService();
 * const requestId = req.id ?? expertModeService.generateRequestId();
 *
 * // Create debugInfo once at start
 * const debugInfo = req.expertMode
 *   ? expertModeService.createDebugInfo('GET /api/route', requestId, 0)
 *   : null;
 *
 * try {
 *   // Add debug messages during processing
 *   if (debugInfo) {
 *     expertModeService.addDebug(debugInfo, {
 *       message: "Processing step",
 *       context: JSON.stringify({ details }),
 *       level: 'debug'
 *     });
 *   }
 *
 *   // ... route logic ...
 *
 *   const responseData = { ... };
 *
 *   // Attach to success response
 *   if (debugInfo) {
 *     debugInfo.duration = Date.now() - startTime;
 *     debugInfo.performance = expertModeService.collectPerformanceMetrics();
 *     debugInfo.context = expertModeService.collectRequestContext(req);
 *     res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
 *   } else {
 *     res.json(responseData);
 *   }
 * } catch (error) {
 *   // Attach to error response
 *   if (debugInfo) {
 *     debugInfo.duration = Date.now() - startTime;
 *     expertModeService.addError(debugInfo, {
 *       message: `Error: ${error.message}`,
 *       stack: error.stack,
 *       level: 'error'
 *     });
 *     debugInfo.performance = expertModeService.collectPerformanceMetrics();
 *     debugInfo.context = expertModeService.collectRequestContext(req);
 *   }
 *
 *   const errorResponse = { error: {...} };
 *   res.status(500).json(
 *     debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
 *   );
 * }
 * ```
 */

/**
 * Request validation schemas
 */
export const CertnameParamSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
});

export const ReportParamsSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  hash: z.string().min(1, "Report hash is required"),
});

export const PQLQuerySchema = z.object({
  query: z.string().optional(),
});

export const ReportsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  status: z
    .string()
    .optional()
    .transform((val) => val ? val.split(',').map(s => s.trim()) : undefined),
  minDuration: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
  minCompileTime: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
  minTotalResources: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

export const CatalogParamsSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  environment: z.string().min(1, "Environment is required"),
});

export const CatalogCompareSchema = z.object({
  certname: z.string().min(1, "Certname is required"),
  environment1: z.string().min(1, "First environment is required"),
  environment2: z.string().min(1, "Second environment is required"),
});

export const EnvironmentParamSchema = z.object({
  name: z.string().min(1, "Environment name is required"),
});

/**
 * Helper function to handle expert mode response
 */
export const handleExpertModeResponse = (
  req: Request,
  res: Response,
  responseData: unknown,
  operation: string,
  duration: number,
  integration?: string,
  additionalMetadata?: Record<string, unknown>
): void => {
  if (req.expertMode) {
    const expertModeService = new ExpertModeService();
    const requestId = req.id ?? expertModeService.generateRequestId();
    const debugInfo = expertModeService.createDebugInfo(operation, requestId, duration);

    if (integration) {
      expertModeService.setIntegration(debugInfo, integration);
    }

    if (additionalMetadata) {
      Object.entries(additionalMetadata).forEach(([key, value]) => {
        expertModeService.addMetadata(debugInfo, key, value);
      });
    }

    // Add performance metrics
    debugInfo.performance = expertModeService.collectPerformanceMetrics();

    // Add request context
    debugInfo.context = expertModeService.collectRequestContext(req);

    res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
  } else {
    res.json(responseData);
  }
};

/**
 * DEPRECATED: Use direct ExpertModeService calls instead.
 * This function creates debug info but doesn't attach it to responses.
 *
 * @deprecated Use the pattern from inventory.ts routes instead:
 * 1. Create debugInfo once at route start
 * 2. Reuse same debugInfo throughout request
 * 3. Attach to ALL responses (success AND error)
 */
export const captureError = (
  _req: Request,
  _error: Error | unknown,
  _message: string,
  _operation: string,
  _duration: number
): void => {
  // This function is broken by design - it creates debug info but doesn't return it
  // Routes using this will NOT have debug info in error responses
  const logger = new LoggerService();
  logger.warn('DEPRECATED: captureError() is broken. Use direct ExpertModeService calls.', {
    component: "IntegrationUtils",
    operation: "captureError",
  });
};

/**
 * DEPRECATED: Use direct ExpertModeService calls instead.
 * This function creates debug info but doesn't attach it to responses.
 *
 * @deprecated Use the pattern from inventory.ts routes instead:
 * 1. Create debugInfo once at route start
 * 2. Reuse same debugInfo throughout request
 * 3. Attach to ALL responses (success AND error)
 */
export const captureWarning = (
  _req: Request,
  _message: string,
  _context: string | undefined,
  _operation: string,
  _duration: number
): void => {
  // This function is broken by design - it creates debug info but doesn't return it
  // Routes using this will NOT have debug info in error responses
  const logger = new LoggerService();
  logger.warn('DEPRECATED: captureWarning() is broken. Use direct ExpertModeService calls.', {
    component: "IntegrationUtils",
    operation: "captureWarning",
  });
};

/**
 * Create a logger instance for routes
 */
export const createLogger = (): LoggerService => {
  return new LoggerService();
};
