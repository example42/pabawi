# Remaining Hardcoded API Endpoints

**Status:** Task P3.1 Complete - 5 priority files fixed
**Date:** 2025-01-XX
**Related Task:** P3.1 Fix frontend components - Remove hardcoded endpoints

## ✅ Completed (Task P3.1)

The following 5 files have been successfully migrated to v1 capability endpoints:

1. ✅ `CatalogComparison.svelte` - Now uses `/api/v1/capabilities/puppetserver.catalog.compare/execute`
2. ✅ `EnvironmentSelector.svelte` - Now uses `/api/v1/capabilities/puppetserver.environments/execute` and `puppetserver.environment.cache.flush/execute`
3. ✅ `PuppetserverStatus.svelte` - Now uses `/api/v1/capabilities/puppetserver.status/execute`, `puppetserver.status.services/execute`, and `puppetserver.metrics/execute`
4. ✅ `PuppetReportsListView.svelte` - Now uses `/api/v1/capabilities/puppetdb.reports/execute` and `puppetdb.reports.all/execute`
5. ✅ `NodeHieraTab.svelte` - Now uses `/api/v1/capabilities/hiera.node/execute`

## 🔴 Remaining Files (Lower Priority)

The following files still contain hardcoded `/api/integrations/` endpoints and should be migrated in future tasks:

### Hiera Components

**CodeAnalysisTab.svelte:**

- `/api/integrations/hiera/analysis/statistics` → Need to map to capability
- `/api/integrations/hiera/analysis/unused` → Need to map to capability
- `/api/integrations/hiera/analysis/lint` → Need to map to capability
- `/api/integrations/hiera/analysis/modules` → Need to map to capability
- **Note:** These may map to `hiera.analysis` capability with different parameters

**GlobalHieraTab.svelte:**

- `/api/integrations/hiera/keys/search` → Likely maps to `hiera.keys` capability
- `/api/integrations/hiera/keys/:keyName/nodes` → Likely maps to `hiera.key` capability

**HieraSetupGuide.svelte:**

- `/api/integrations/hiera/status` → Health check endpoint (may need special handling)
- Contains example curl commands in documentation (informational only)

### PuppetDB Components

**GlobalFactsTab.svelte:**

- `/api/integrations/puppetdb/nodes/:certname/facts` → Maps to `puppetdb.facts` capability

**PuppetDBAdmin.svelte:**

- `/api/integrations/puppetdb/admin/summary-stats` → Maps to `puppetdb.stats` capability

**PuppetdbSetupGuide.svelte:**

- Contains example curl commands in documentation (informational only)

### Puppetserver Components

**PuppetserverSetupGuide.svelte:**

- Contains example curl commands in documentation (informational only)

## Migration Strategy

For the remaining files:

1. **Identify the capability:** Check the plugin's capability definitions to find the matching capability name
2. **Update the API call:** Change from `get('/api/integrations/...')` to `post('/api/v1/capabilities/[capability.name]/execute', { params })`
3. **Update imports:** Change from `get` to `post` in the import statement
4. **Update parameters:** Move query parameters to the request body
5. **Test the component:** Verify the component still works with the new endpoint

## Notes

- Setup guide components contain example curl commands for documentation purposes - these are informational and don't need to be changed
- Health check endpoints may need special handling as they might not map directly to capabilities
- All capability executions use POST method with parameters in the request body
