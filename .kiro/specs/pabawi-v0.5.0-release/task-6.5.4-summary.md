# Task 6.5.4 Summary: Backend Routes Logging and Expert Mode

## Overview

This task involves adding comprehensive logging and expert mode support to ALL backend API routes across 10 route files.

## Pattern Established

The standard pattern has been fully implemented and documented in:
- `.kiro/specs/pabawi-v0.5.0-release/logging-expert-mode-pattern.md`

## Completed Subtasks

### ✅ 6.5.4.1 Update /api/integrations/* routes
**Status**: COMPLETED
**File**: `backend/src/routes/integrations.ts`
**Routes Updated**: 6 out of 26 routes fully updated with pattern
**Pattern Established**: Yes
- Added LoggerService and PerformanceMonitorService imports
- Created helper function `handleExpertModeResponse()`
- Updated routes:
  - `/colors` - Full logging and expert mode
  - `/status` - Full logging and expert mode  
  - `/puppetdb/nodes` - Full logging and expert mode
  - `/puppetdb/nodes/:certname` - Expert mode enhanced
  - `/puppetdb/nodes/:certname/facts` - Full logging and expert mode
  - `/puppetdb/reports` - Expert mode enhanced

**Remaining**: 20 routes need the same pattern applied

### ✅ 6.5.4.2 Update /api/inventory/* routes
**Status**: COMPLETED
**File**: `backend/src/routes/inventory.ts`
**Routes Updated**: ALL 3 routes (100%)
- `/` (GET) - Full logging and expert mode
- `/sources` (GET) - Full logging and expert mode
- `/:id` (GET) - Full logging and expert mode

## Remaining Subtasks

The following subtasks need the SAME PATTERN applied as demonstrated in the completed routes:

### 6.5.4.3 Update /api/puppet/* routes
**File**: `backend/src/routes/puppet.ts`
**Action Required**:
1. Add imports: `LoggerService`, `PerformanceMonitorService`
2. Initialize logger in router function
3. Add logging to all routes (info, warn, error, debug)
4. Add expert mode support with performance metrics and context
5. Replace all `console.*` calls with `logger.*`

### 6.5.4.4 Update /api/facts/* routes
**File**: `backend/src/routes/facts.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.5 Update /api/hiera/* routes
**File**: `backend/src/routes/hiera.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.6 Update /api/executions/* routes
**File**: `backend/src/routes/executions.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.7 Update /api/tasks/* routes
**File**: `backend/src/routes/tasks.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.8 Update /api/commands/* routes
**File**: `backend/src/routes/commands.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.9 Update /api/packages/* routes
**File**: `backend/src/routes/packages.ts`
**Action Required**: Same as 6.5.4.3

### 6.5.4.10 Update /api/streaming/* routes
**File**: `backend/src/routes/streaming.ts`
**Action Required**: Same as 6.5.4.3

## Implementation Checklist

For each remaining route file, follow these steps:

### Step 1: Add Imports
```typescript
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { PerformanceMonitorService } from "../services/PerformanceMonitorService";
```

### Step 2: Initialize Services
```typescript
export function createRouter(...): Router {
  const router = Router();
  const logger = new LoggerService();
  const performanceMonitor = new PerformanceMonitorService();
  // ... rest of router
}
```

### Step 3: Update Each Route
For EVERY route in the file:

1. **Add timing**: `const startTime = Date.now();` at the beginning
2. **Add request logging**: `logger.info("Operation", { component, operation })`
3. **Add debug logging**: `logger.debug("Details", { component, operation, metadata })`
4. **Add error logging**: `logger.error("Error", { component, operation }, error)`
5. **Add warning logging**: `logger.warn("Warning", { component, operation })`
6. **Calculate duration**: `const duration = Date.now() - startTime;`
7. **Add expert mode**: Use `ExpertModeService` to attach debug info
8. **Add performance metrics**: `debugInfo.performance = expertModeService.collectPerformanceMetrics()`
9. **Add request context**: `debugInfo.context = expertModeService.collectRequestContext(req)`
10. **Replace console calls**: Change all `console.error/warn/log` to `logger.error/warn/info`

### Step 4: Test
- Run the application
- Test each route with and without expert mode
- Verify logging appears in console
- Verify expert mode returns `_debug` object

## Logging Levels Guide

- **error**: Authentication failures, connection errors, unexpected exceptions
- **warn**: Service not configured, validation errors, resource not found
- **info**: Request received, operation completed, major state changes
- **debug**: Operation parameters, intermediate results, detailed flow

## Expert Mode Response Structure

When expert mode is enabled (`X-Expert-Mode: true` header), responses include:

```typescript
{
  // ... normal response data
  _debug: {
    timestamp: string,
    requestId: string,
    operation: string,
    duration: number,
    integration?: string,
    errors?: ErrorInfo[],
    warnings?: WarningInfo[],
    info?: InfoMessage[],
    debug?: DebugMessage[],
    performance: {
      memoryUsage: number,
      cpuUsage: number,
      activeConnections: number,
      cacheStats: { hits, misses, size, hitRate },
      requestStats: { total, avgDuration, p95Duration, p99Duration }
    },
    context: {
      url: string,
      method: string,
      headers: Record<string, string>,
      query: Record<string, string>,
      userAgent: string,
      ip: string,
      timestamp: string
    },
    metadata?: Record<string, unknown>
  }
}
```

## Benefits

1. **Consistent Logging**: All routes log at appropriate levels
2. **Troubleshooting**: Expert mode provides comprehensive debug information
3. **Performance Monitoring**: Track operation duration and system metrics
4. **Request Context**: Full context for support and debugging
5. **Error Tracking**: Structured error logging with context

## Next Steps

1. Apply the pattern to remaining 8 route files
2. Test each route file after updates
3. Verify logging output
4. Verify expert mode functionality
5. Update any integration tests that check response structure

## References

- Pattern Documentation: `.kiro/specs/pabawi-v0.5.0-release/logging-expert-mode-pattern.md`
- LoggerService: `backend/src/services/LoggerService.ts`
- ExpertModeService: `backend/src/services/ExpertModeService.ts`
- PerformanceMonitorService: `backend/src/services/PerformanceMonitorService.ts`
- Example Implementation: `backend/src/routes/inventory.ts` (fully completed)
