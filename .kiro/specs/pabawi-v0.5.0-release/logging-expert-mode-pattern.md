# Logging and Expert Mode Pattern for Routes

## Overview

This document describes the standard pattern for adding comprehensive logging and expert mode support to all backend API routes.

## Pattern Components

### 1. Import Required Services

```typescript
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { PerformanceMonitorService } from "../services/PerformanceMonitorService";
```

### 2. Initialize Services in Router

```typescript
import { getFrontendLogs } from "../routes/debug";

export function createRouter(...): Router {
  const router = Router();
  const logger = new LoggerService();
  const performanceMonitor = new PerformanceMonitorService();
  
  // Helper function for expert mode responses
  const handleExpertModeResponse = (
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
      
      // Add frontend logs if correlation ID is present
      if (req.correlationId) {
        const frontendLogs = getFrontendLogs(req.correlationId);
        if (frontendLogs.length > 0) {
          expertModeService.addFrontendLogs(debugInfo, frontendLogs);
        }
      }
      
      res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
    } else {
      res.json(responseData);
    }
  };
  
  // ... routes
}
```

### 3. Standard Route Pattern

```typescript
router.get(
  "/api/endpoint",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    // Log the incoming request
    logger.info("Processing request", {
      component: "RouterName",
      integration: "integration_name", // if applicable
      operation: "operationName",
      metadata: { /* relevant request data */ },
    });
    
    // Service availability checks with logging
    if (!service) {
      logger.warn("Service not configured", {
        component: "RouterName",
        integration: "integration_name",
        operation: "operationName",
      });
      res.status(503).json({
        error: {
          code: "SERVICE_NOT_CONFIGURED",
          message: "Service is not configured",
        },
      });
      return;
    }
    
    try {
      // Log debug information before operation
      logger.debug("Executing operation", {
        component: "RouterName",
        integration: "integration_name",
        operation: "operationName",
        metadata: { /* operation parameters */ },
      });
      
      // Perform the operation
      const result = await service.doSomething();
      const duration = Date.now() - startTime;
      
      // Log successful completion
      logger.info("Operation completed successfully", {
        component: "RouterName",
        integration: "integration_name",
        operation: "operationName",
        metadata: { duration, /* result summary */ },
      });
      
      const responseData = {
        result,
        source: "integration_name",
      };
      
      // Use helper function for expert mode response
      handleExpertModeResponse(
        req,
        res,
        responseData,
        'GET /api/endpoint',
        duration,
        'integration_name',
        { /* additional metadata */ }
      );
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle specific error types with appropriate logging
      if (error instanceof ValidationError) {
        logger.warn("Validation error", {
          component: "RouterName",
          integration: "integration_name",
          operation: "operationName",
          metadata: { errors: error.errors },
        });
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: error.message,
            details: error.errors,
          },
        });
        return;
      }
      
      if (error instanceof AuthenticationError) {
        logger.error("Authentication error", {
          component: "RouterName",
          integration: "integration_name",
          operation: "operationName",
        }, error);
        res.status(401).json({
          error: {
            code: "AUTH_ERROR",
            message: error.message,
          },
        });
        return;
      }
      
      if (error instanceof ConnectionError) {
        logger.error("Connection error", {
          component: "RouterName",
          integration: "integration_name",
          operation: "operationName",
        }, error);
        res.status(503).json({
          error: {
            code: "CONNECTION_ERROR",
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      
      // Unknown error - always log with error level
      logger.error("Unexpected error", {
        component: "RouterName",
        integration: "integration_name",
        operation: "operationName",
        metadata: { duration },
      }, error instanceof Error ? error : undefined);
      
      res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }),
);
```

## Logging Levels

### error

- Authentication failures
- Connection errors
- Unexpected exceptions
- Service failures

### warn

- Service not configured
- Service not initialized
- Validation errors
- Degraded service states
- Resource not found (404)

### info

- Request received
- Operation completed successfully
- Major state changes

### debug

- Operation parameters
- Intermediate results
- Cache hits/misses
- Detailed execution flow

## Expert Mode Integration

### When Expert Mode is Enabled

The response includes:

- `_debug` object with:
  - `timestamp`: ISO timestamp
  - `requestId`: Unique request identifier
  - `operation`: Operation name
  - `duration`: Operation duration in ms
  - `integration`: Integration name (if applicable)
  - `errors`: Array of error messages
  - `warnings`: Array of warning messages
  - `info`: Array of info messages
  - `debug`: Array of debug messages
  - `performance`: Performance metrics
    - `memoryUsage`: Heap memory usage
    - `cpuUsage`: CPU usage percentage
    - `activeConnections`: Active connection count
    - `cacheStats`: Cache hit/miss statistics
    - `requestStats`: Request timing statistics
  - `context`: Request context
    - `url`: Request URL
    - `method`: HTTP method
    - `headers`: Request headers
    - `query`: Query parameters
    - `userAgent`: User agent string
    - `ip`: Client IP address
    - `timestamp`: Request timestamp
  - `metadata`: Additional operation-specific metadata

## Implementation Status

### Completed Routes

- `/api/integrations/colors` - ✅ Full logging and expert mode
- `/api/integrations/status` - ✅ Full logging and expert mode
- `/api/integrations/puppetdb/nodes` - ✅ Full logging and expert mode
- `/api/integrations/puppetdb/nodes/:certname` - ✅ Expert mode only
- `/api/integrations/puppetdb/nodes/:certname/facts` - ✅ Full logging and expert mode
- `/api/integrations/puppetdb/reports` - ✅ Expert mode only

### Remaining Routes (23 routes)

All remaining routes in `backend/src/routes/integrations.ts` need to follow the same pattern:

1. Add `const startTime = Date.now();` at the beginning
2. Add `logger.info()` call for request logging
3. Add `logger.warn()` for service checks
4. Add `logger.debug()` for operation details
5. Add `logger.error()` for all error cases
6. Replace all `console.error/warn/log` with `logger.*` calls
7. Calculate `duration` before response
8. Use `handleExpertModeResponse()` instead of direct `res.json()`
9. Add performance metrics and context to debug info

## Next Steps

Apply this pattern to all remaining routes in:

- `backend/src/routes/integrations.ts` (23 routes remaining)
- `backend/src/routes/inventory.ts`
- `backend/src/routes/puppet.ts`
- `backend/src/routes/facts.ts`
- `backend/src/routes/hiera.ts`
- `backend/src/routes/executions.ts`
- `backend/src/routes/tasks.ts`
- `backend/src/routes/commands.ts`
- `backend/src/routes/packages.ts`
- `backend/src/routes/streaming.ts`
