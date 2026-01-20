# Expert Mode Test Issues

## Fixed Issues ✅

1. **Missing `_debug` in error responses** - Fixed 3 routes:
   - `/api/inventory/:id` - Node not found error now includes debug info
   - `/api/executions/:id` - Execution not found error now includes debug info
   - `/api/nodes/:id/puppet-run` - Node not found error now includes debug info

## Routes That Don't Exist (Test Script Issues)

The test script is testing routes that were never implemented. These are NOT bugs in the code, but rather the test script testing non-existent endpoints:

### PuppetDB Routes

- `/api/integrations/puppetdb/reports/:hash` - Should use `/api/integrations/puppetdb/nodes/:certname/reports/:hash`
- `/api/integrations/puppetdb/events` - Should use `/api/integrations/puppetdb/nodes/:certname/events`
- `/api/integrations/puppetdb/metrics` - Not implemented (not in requirements)

### Puppetserver Routes

- `/api/integrations/puppetserver/environments/:env/classes` - Not implemented
- `/api/integrations/puppetserver/environments/:env/modules` - Not implemented
- `/api/integrations/puppetserver/catalog/compile` - Not implemented (use `/api/integrations/puppetserver/catalog/:certname/:environment`)
- `/api/integrations/puppetserver/nodes/:certname/catalog` - Should use `/api/integrations/puppetserver/catalog/:certname/:environment`

### Hiera Routes

- `/api/integrations/hiera/scan` - Not implemented
- `/api/integrations/hiera/lookup` - Not implemented

### Package Routes

- `/api/nodes/:id/packages/install` - Should use `/api/nodes/:id/install-package`
- `/api/nodes/:id/packages/uninstall` - Not implemented (only install exists)

### Task Routes

- `/api/tasks/:taskname` - Not implemented (tasks are retrieved via `/api/tasks` list only)

### Streaming Routes

- `/api/streaming/executions/:id` - Should use `/api/streaming/:id/stream`
- `/api/streaming/executions/:id/cancel` - Not implemented

### Status Routes

- `/api/integrations/` - Should use `/api/integrations/status/`

## Missing `errors` Array Issues

Some error responses don't include an `errors` array in the `_debug` object. This is expected behavior - the `errors` array is only populated when actual errors/warnings are logged during request processing. For simple validation errors or not-found errors, there may be no errors array.

The test script incorrectly expects ALL error responses (4xx/5xx) to have an `errors` array, but this is only present when errors are explicitly logged via `expertModeService.addError()` or `expertModeService.addWarning()`.

## Recommendations

1. **Update test script** to test actual implemented routes with correct paths
2. **Remove tests** for unimplemented features
3. **Fix test expectations** - Don't require `errors` array for all error responses
4. **Document actual API** endpoints in OpenAPI spec

## Actual Routes to Test

### Inventory

- ✅ `GET /api/inventory`
- ✅ `GET /api/inventory/sources`
- ✅ `GET /api/inventory/:id`

### PuppetDB

- ✅ `GET /api/integrations/puppetdb/nodes`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/facts`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/resources`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/reports`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/reports/:hash`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/events`
- ✅ `GET /api/integrations/puppetdb/reports/summary`
- ✅ `GET /api/integrations/puppetdb/nodes/:certname/catalog`
- ✅ `GET /api/integrations/puppetdb/admin/summary-stats`

### Puppetserver

- ✅ `GET /api/integrations/puppetserver/environments`
- ✅ `GET /api/integrations/puppetserver/environments/:name`
- ✅ `GET /api/integrations/puppetserver/nodes`
- ✅ `GET /api/integrations/puppetserver/nodes/:certname`
- ✅ `GET /api/integrations/puppetserver/nodes/:certname/status`
- ✅ `GET /api/integrations/puppetserver/nodes/:certname/facts`
- ✅ `GET /api/integrations/puppetserver/catalog/:certname/:environment`
- ✅ `POST /api/integrations/puppetserver/catalog/compare`

### Executions

- ✅ `GET /api/executions`
- ✅ `GET /api/executions/:id`
- ✅ `GET /api/executions/:id/original`
- ✅ `GET /api/executions/:id/re-executions`
- ✅ `POST /api/executions/:id/re-execute`
- ✅ `GET /api/executions/queue/status`
- ✅ `GET /api/executions/:id/output`
- ✅ `POST /api/executions/:id/cancel`

### Tasks

- ✅ `GET /api/tasks`
- ✅ `GET /api/tasks/by-module`
- ✅ `POST /api/nodes/:id/task`

### Commands

- ✅ `POST /api/nodes/:id/command`

### Packages

- ✅ `GET /api/nodes/package-tasks`
- ✅ `POST /api/nodes/:id/install-package`

### Facts

- ✅ `POST /api/nodes/:id/facts`

### Puppet

- ✅ `POST /api/nodes/:id/puppet-run`

### Streaming

- ✅ `GET /api/streaming/:id/stream`
- ✅ `GET /api/streaming/stats`

### Status

- ✅ `GET /api/integrations/status/`

### History

- ✅ `GET /api/puppet/nodes/:id/history`
- ✅ `GET /api/puppet/history`
