# Routes Refactoring Implementation Guide

## Current State Analysis
- **File**: `backend/src/routes/integrations.ts`
- **Size**: 5,198 lines
- **Routes**: 27 total
  - PuppetDB: 11 routes
  - Puppetserver: 14 routes  
  - Colors: 1 route
  - Status: 1 route

## Target Structure

```
backend/src/routes/
├── integrations.ts (main router - mounts sub-routers)
└── integrations/
    ├── utils.ts (✅ DONE - shared utilities and schemas)
    ├── colors.ts (✅ DONE - color configuration route)
    ├── status.ts (TODO - integration status route)
    ├── puppetdb.ts (TODO - 11 PuppetDB routes)
    └── puppetserver.ts (TODO - 14 Puppetserver routes)
```

## Completed Files

### ✅ utils.ts
Contains:
- All validation schemas (CertnameParamSchema, ReportParamsSchema, etc.)
- Helper functions (handleExpertModeResponse, captureError, captureWarning)
- createLogger function

### ✅ colors.ts  
Contains:
- GET /colors route
- Fully functional with expert mode support

## Remaining Work

### 1. Create status.ts

**Route to extract**:
- GET /status (with deduplication middleware)

**Dependencies**:
- IntegrationManager (passed as parameter)
- PuppetDBService (optional, passed as parameter)
- PuppetserverService (optional, passed as parameter)
- requestDeduplication middleware

**Function signature**:
```typescript
export function createStatusRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
): Router
```

**Line range in original**: ~275-530

### 2. Create puppetdb.ts

**Routes to extract** (11 total):
1. GET /puppetdb/nodes
2. GET /puppetdb/nodes/:certname
3. GET /puppetdb/nodes/:certname/facts
4. GET /puppetdb/reports/summary
5. GET /puppetdb/reports (with deduplication)
6. GET /puppetdb/nodes/:certname/reports (✅ UPDATED with full expert mode)
7. GET /puppetdb/nodes/:certname/reports/:hash
8. GET /puppetdb/nodes/:certname/catalog
9. GET /puppetdb/nodes/:certname/resources
10. GET /puppetdb/nodes/:certname/events
11. GET /puppetdb/admin/summary-stats

**Dependencies**:
- PuppetDBService (required, passed as parameter)
- All error types from puppetdb module
- requestDeduplication middleware (for some routes)
- All schemas from utils.ts

**Function signature**:
```typescript
export function createPuppetDBRouter(
  puppetDBService: PuppetDBService,
): Router
```

**Line range in original**: ~534-2850

### 3. Create puppetserver.ts

**Routes to extract** (14 total):
1. GET /puppetserver/nodes
2. GET /puppetserver/nodes/:certname
3. GET /puppetserver/nodes/:certname/status
4. GET /puppetserver/nodes/:certname/facts
5. GET /puppetserver/catalog/:certname/:environment
6. POST /puppetserver/catalog/compare
7. GET /puppetserver/environments
8. GET /puppetserver/environments/:name
9. POST /puppetserver/environments/:name/deploy
10. DELETE /puppetserver/environments/:name/cache
11. GET /puppetserver/status/services
12. GET /puppetserver/status/simple
13. GET /puppetserver/admin-api
14. GET /puppetserver/metrics

**Dependencies**:
- PuppetserverService (required, passed as parameter)
- All error types from puppetserver/errors module
- All schemas from utils.ts

**Function signature**:
```typescript
export function createPuppetserverRouter(
  puppetserverService: PuppetserverService,
): Router
```

**Line range in original**: ~2851-5190

### 4. Update main integrations.ts

**New structure**:
```typescript
import { Router } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createPuppetDBRouter } from "./integrations/puppetdb";
import { createPuppetserverRouter } from "./integrations/puppetserver";

export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
): Router {
  const router = Router();

  // Mount colors router
  router.use("/colors", createColorsRouter());

  // Mount status router
  router.use("/status", createStatusRouter(
    integrationManager,
    puppetDBService,
    puppetserverService
  ));

  // Mount PuppetDB router if service is available
  if (puppetDBService) {
    router.use("/puppetdb", createPuppetDBRouter(puppetDBService));
  }

  // Mount Puppetserver router if service is available
  if (puppetserverService) {
    router.use("/puppetserver", createPuppetserverRouter(puppetserverService));
  }

  return router;
}
```

## Implementation Steps

1. ✅ Create utils.ts with shared code
2. ✅ Create colors.ts
3. ⏳ Create status.ts
4. ⏳ Create puppetdb.ts
5. ⏳ Create puppetserver.ts
6. ⏳ Update main integrations.ts
7. ⏳ Run tests to verify no breaking changes
8. ⏳ Delete old integrations.ts content (keep only new structure)

## Important Notes

### Route Path Changes
When moving routes to sub-routers, the paths change:
- **Before**: `router.get("/puppetdb/nodes", ...)`
- **After**: `router.get("/nodes", ...)` (in puppetdb.ts)

The `/puppetdb` prefix is added when mounting: `router.use("/puppetdb", createPuppetDBRouter(...))`

### Middleware Handling
- `requestDeduplication` middleware should be applied to specific routes, not the entire sub-router
- Keep middleware imports in the files where they're used

### Expert Mode
- All routes should maintain their current expert mode implementation
- The recently updated `/puppetdb/nodes/:certname/reports` route has the complete pattern

### Testing
After refactoring, verify:
- All 1104 tests still pass
- No TypeScript compilation errors
- API endpoints respond correctly
- Expert mode works on all routes

## Benefits After Completion

1. **Maintainability**: Each integration in its own file (~500-1000 lines each)
2. **Clarity**: Easier to find and modify specific routes
3. **Collaboration**: Multiple developers can work on different integrations
4. **Performance**: Faster IDE navigation and search
5. **Testing**: Easier to test individual integration routes
6. **Future Growth**: Easy to add new integrations without bloating a single file
