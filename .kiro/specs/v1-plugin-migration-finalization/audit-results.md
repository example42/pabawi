# Backend Hardcoded Plugin Import Audit Results

## Summary

This audit identifies all files in `backend/src/` that contain hardcoded references to specific plugins (bolt, puppetdb, puppetserver, hiera) that need to be removed to make the core application plugin-agnostic.

## Files with Direct Plugin Imports

### 1. Imports from `integrations/hiera/`

| File | Import |
|------|--------|
| `backend/src/routes/hiera.ts` | `HieraPlugin`, `HIERA_ERROR_CODES`, `HieraResolutionInfo`, `PaginatedResponse` from `../integrations/hiera/` |

### 2. Imports from `integrations/puppetdb/`

| File | Import |
|------|--------|
| `backend/src/routes/integrations.ts` | `PuppetDBService` from `../integrations/puppetdb/PuppetDBService` |
| `backend/src/routes/integrations/status.ts` | `PuppetDBService` from `../../integrations/puppetdb/PuppetDBService` |
| `backend/src/routes/integrations/puppetdb.ts` | `PuppetDBService`, `PuppetDBConnectionError`, `PuppetDBQueryError`, `PuppetDBAuthenticationError` from `../../integrations/puppetdb/` |
| `backend/src/routes/integrations/puppetserver.ts` | `PuppetDBService` from `../../integrations/puppetdb/PuppetDBService` |
| `backend/src/services/ReportFilterService.ts` | `Report` type from `../integrations/puppetdb/types` |
| `backend/src/services/PuppetRunHistoryService.ts` | `Report`, `PuppetDBService` from `../integrations/puppetdb/` |

### 3. Imports from `integrations/puppetserver/`

| File | Import |
|------|--------|
| `backend/src/routes/integrations.ts` | `PuppetserverService` from `../integrations/puppetserver/PuppetserverService` |
| `backend/src/routes/integrations/status.ts` | `PuppetserverService` from `../../integrations/puppetserver/PuppetserverService` |
| `backend/src/routes/integrations/puppetserver.ts` | `PuppetserverService`, `PuppetserverConnectionError`, `CatalogCompilationError`, `EnvironmentDeploymentError` from `../../integrations/puppetserver/` |

### 4. Imports from `plugins/native/`

| File | Import |
|------|--------|
| `backend/src/server.ts` | `BoltService` from `../../plugins/native/bolt/backend/services/BoltService` |
| `backend/src/routes/facts.ts` | `BoltParseError`, `BoltInventoryNotFoundError` from `../../../plugins/native/bolt/backend/types` |
| `backend/src/routes/inventory.v1.ts` | `Node` type from `../../../plugins/native/bolt/backend/types` |
| `backend/src/routes/facts.v1.ts` | `Facts` type from `../../../plugins/native/bolt/backend/types` |
| `backend/src/routes/tasks.ts` | `BoltTaskNotFoundError`, `BoltTaskParameterError` from `../../../plugins/native/bolt/backend/types` |
| `backend/src/routes/packages.ts` | `BoltService` type from `../../../plugins/native/bolt/backend/services/BoltService` |
| `backend/src/routes/puppet.ts` | `BoltService`, `BoltInventoryNotFoundError` from `../../../plugins/native/bolt/backend/` |
| `backend/src/routes/commands.ts` | `BoltInventoryNotFoundError` from `../../../plugins/native/bolt/backend/types` |
| `backend/src/routes/inventory.ts` | `BoltService`, `BoltInventoryNotFoundError`, `BoltParseError`, `Node` from `../../../plugins/native/bolt/backend/` |
| `backend/src/integrations/NodeLinkingService.ts` | `Node` type from `../../../plugins/native/bolt/backend/types` |
| `backend/src/integrations/IntegrationManager.ts` | `Node`, `ExecutionResult` from `../../../plugins/native/bolt/backend/types` |
| `backend/src/integrations/bolt/index.ts` | Re-exports from `../../../../plugins/native/bolt/backend/index.js` |

## Files with Hardcoded Plugin Names/References

### Services with Hardcoded Plugin Names

| File | Hardcoded References |
|------|---------------------|
| `backend/src/services/IntegrationColorService.ts` | Hardcoded `bolt`, `puppetdb`, `puppetserver`, `hiera` color definitions |
| `backend/src/services/ExpertModeService.ts` | Comments reference `bolt, puppetdb, puppetserver, hiera` |
| `backend/src/services/LoggerService.ts` | Comments reference `bolt, puppetdb, puppetserver, hiera` |

### Routes with Hardcoded Plugin Names

| File | Hardcoded References |
|------|---------------------|
| `backend/src/routes/plugins.ts` | Hardcoded color/icon maps for `bolt`, `puppetdb`, `puppetserver`, `hiera` |
| `backend/src/routes/v1/plugins.ts` | Hardcoded color/icon maps for `bolt`, `puppetdb`, `puppetserver`, `hiera` |
| `backend/src/routes/v1/index.ts` | Hardcoded mount for `/integrations/hiera` |
| `backend/src/routes/inventory.v1.ts` | Hardcoded capability names `bolt.inventory.list`, `puppetdb.nodes` |
| `backend/src/routes/facts.v1.ts` | Hardcoded capability names `bolt.facts.query`, `puppetdb.facts` |
| `backend/src/routes/integrations/status.ts` | Hardcoded check for `hiera` integration |
| `backend/src/routes/integrations/colors.ts` | Comments reference `bolt, puppetdb, puppetserver, hiera` |

### Other Files with Hardcoded References

| File | Hardcoded References |
|------|---------------------|
| `backend/src/server.ts` | Hardcoded mount for `/api/integrations/hiera` |
| `backend/src/errors/ErrorHandlingService.ts` | Hardcoded error messages for `Puppetserver`, `Bolt` |
| `backend/src/integrations/NodeLinkingService.ts` | Hardcoded checks for `puppetserver` source |
| `backend/src/validation/BoltValidator.ts` | Bolt-specific validation (entire file is plugin-specific) |

## Plugin-Specific Route Files (Should be Deleted)

These route files are plugin-specific and should be moved to their respective plugin directories:

| File | Plugin |
|------|--------|
| `backend/src/routes/hiera.ts` | Hiera |
| `backend/src/routes/hiera.v1.ts` | Hiera |
| `backend/src/routes/integrations/puppetdb.ts` | PuppetDB |
| `backend/src/routes/integrations/puppetserver.ts` | Puppetserver |
| `backend/src/routes/puppetHistory.ts` | PuppetDB |

## Legacy Integration Directories (Should be Deleted)

These directories contain plugin-specific code that should only exist in `plugins/native/`:

| Directory | Status |
|-----------|--------|
| `backend/src/integrations/bolt/` | Contains re-exports, should be deleted |
| `backend/src/integrations/puppetdb/` | Contains plugin code, should be deleted |
| `backend/src/integrations/puppetserver/` | Contains plugin code, should be deleted |
| `backend/src/integrations/hiera/` | Contains plugin code, should be deleted |

## Files to Keep (Generic Infrastructure)

These files in `backend/src/integrations/` should be kept as they provide generic plugin infrastructure:

- `BasePlugin.ts`
- `CapabilityRegistry.ts`
- `IntegrationManager.ts`
- `PluginLoader.ts`
- `PluginManifestSchema.ts`
- `NodeLinkingService.ts` (needs modification to remove hardcoded references)
- `types.ts` (needs modification to remove plugin-specific types)

## Total Files Requiring Modification

| Category | Count |
|----------|-------|
| Files with direct plugin imports | 18 |
| Files with hardcoded plugin names | 12 |
| Plugin-specific route files to delete | 5 |
| Legacy integration directories to delete | 4 |
| **Total unique files to modify** | ~30 |

## Recommended Action Order

1. **Phase 1**: Remove direct imports from `plugins/native/` in core files
2. **Phase 2**: Remove imports from `integrations/{plugin}/` directories
3. **Phase 3**: Remove hardcoded plugin names from services and routes
4. **Phase 4**: Delete plugin-specific route files
5. **Phase 5**: Delete legacy integration directories
