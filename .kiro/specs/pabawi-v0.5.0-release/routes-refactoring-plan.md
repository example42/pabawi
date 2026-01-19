# Routes Refactoring Plan

## Current State
- Single file: `backend/src/routes/integrations.ts` (5197 lines)
- Contains routes for: colors, status, PuppetDB (13 routes), Puppetserver (13 routes)

## Target Structure

```
backend/src/routes/
├── integrations.ts (main router - 50-100 lines)
├── integrations/
│   ├── colors.ts (color configuration routes)
│   ├── status.ts (integration status routes)
│   ├── puppetdb.ts (all PuppetDB routes)
│   └── puppetserver.ts (all Puppetserver routes)
└── ... (other existing routes)
```

## Route Distribution

### integrations.ts (Main Router)
- Import and mount sub-routers
- Export createIntegrationsRouter function
- ~50-100 lines

### integrations/colors.ts
- GET /api/integrations/colors
- ~100 lines

### integrations/status.ts
- GET /api/integrations/status
- ~300 lines

### integrations/puppetdb.ts (13 routes)
- GET /api/integrations/puppetdb/nodes
- GET /api/integrations/puppetdb/nodes/:certname
- GET /api/integrations/puppetdb/nodes/:certname/facts
- GET /api/integrations/puppetdb/reports/summary
- GET /api/integrations/puppetdb/reports
- GET /api/integrations/puppetdb/nodes/:certname/reports
- GET /api/integrations/puppetdb/nodes/:certname/reports/:hash
- GET /api/integrations/puppetdb/nodes/:certname/catalog
- GET /api/integrations/puppetdb/nodes/:certname/resources
- GET /api/integrations/puppetdb/nodes/:certname/events
- GET /api/integrations/puppetdb/admin/summary-stats
- ~2000 lines

### integrations/puppetserver.ts (13 routes)
- GET /api/integrations/puppetserver/nodes
- GET /api/integrations/puppetserver/nodes/:certname
- GET /api/integrations/puppetserver/nodes/:certname/status
- GET /api/integrations/puppetserver/nodes/:certname/facts
- GET /api/integrations/puppetserver/catalog/:certname/:environment
- POST /api/integrations/puppetserver/catalog/compare
- GET /api/integrations/puppetserver/environments
- GET /api/integrations/puppetserver/environments/:name
- POST /api/integrations/puppetserver/environments/:name/deploy
- DELETE /api/integrations/puppetserver/environments/:name/cache
- GET /api/integrations/puppetserver/status/services
- GET /api/integrations/puppetserver/status/simple
- GET /api/integrations/puppetserver/admin-api
- GET /api/integrations/puppetserver/metrics
- ~2500 lines

## Shared Utilities

Create `backend/src/routes/integrations/utils.ts` for:
- Validation schemas (CertnameParamSchema, etc.)
- Helper functions (handleExpertModeResponse, captureError, captureWarning)
- Common imports

## Implementation Steps

1. Create directory structure
2. Create utils.ts with shared code
3. Create colors.ts
4. Create status.ts
5. Create puppetdb.ts
6. Create puppetserver.ts
7. Update main integrations.ts to mount sub-routers
8. Run tests to verify no breaking changes
9. Delete old code from integrations.ts

## Benefits

- **Maintainability**: Easier to find and modify specific routes
- **Readability**: Each file focuses on one integration
- **Collaboration**: Multiple developers can work on different integrations
- **Testing**: Easier to test individual integration routes
- **Performance**: Faster IDE navigation and search
