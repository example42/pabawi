# PuppetDB and Puppet Server API Endpoints Analysis

This document provides a comprehensive list of all PuppetDB and Puppet Server API endpoints used in the Pabawi codebase, including where they are used and their purpose.

## PuppetDB API Endpoints

### Core Query Endpoints

#### `/pdb/query/v4/nodes`

- **Used in**: `PuppetDBService.getInventory()`
- **Purpose**: Retrieve list of all nodes known to PuppetDB
- **Method**: GET with PQL query parameter
- **Query Example**: `["=", "certname", "node1.example.com"]`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:271`

#### `/pdb/query/v4/facts`

- **Used in**: `PuppetDBService.getNodeFacts()`
- **Purpose**: Retrieve facts for a specific node
- **Method**: GET with PQL query parameter
- **Query Example**: `["=", "certname", "node1.example.com"]`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:334`

#### `/pdb/query/v4/reports`

- **Used in**: `PuppetDBService.getNodeReports()`, `PuppetDBService.getReport()`
- **Purpose**: Retrieve Puppet run reports for nodes
- **Method**: GET with PQL query and order_by parameters
- **Query Example**: `["=", "certname", "node1.example.com"]`
- **Parameters**: `limit`, `order_by: '[{"field": "producer_timestamp", "order": "desc"}]'`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:456`

#### `/pdb/query/v4/reports/{hash}/metrics`

- **Used in**: `PuppetDBService.getNodeReports()` (via href references)
- **Purpose**: Retrieve detailed metrics for a specific report
- **Method**: GET
- **Note**: Called when reports contain metrics href references instead of embedded data
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:502`

#### `/pdb/query/v4/catalogs`

- **Used in**: `PuppetDBService.getNodeCatalog()`
- **Purpose**: Retrieve compiled catalog for a node
- **Method**: GET with PQL query parameter
- **Query Example**: `["=", "certname", "node1.example.com"]`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:612`

#### `/pdb/query/v4/resources`

- **Used in**: `PuppetDBService.getCatalogResources()`, Integration routes
- **Purpose**: Retrieve managed resources for a node
- **Method**: GET with PQL query parameter
- **Query Example**: `["=", "certname", "node1.example.com"]`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:695`

#### `/pdb/query/v4/events`

- **Used in**: `PuppetDBService.getNodeEvents()`
- **Purpose**: Retrieve events (resource changes) for a node
- **Method**: GET with PQL query and filtering parameters
- **Query Example**: `["and", ["=", "certname", "node1.example.com"], ["=", "status", "success"]]`
- **Parameters**: `limit`, `order_by: '[{"field": "timestamp", "order": "desc"}]'`
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:750`

### Status and Admin Endpoints

#### `/status/v1/services/puppetdb-status`

- **Used in**: `PuppetDBService.performHealthCheck()`
- **Purpose**: Health check to verify PuppetDB connectivity
- **Method**: GET
- **Location**: `backend/src/integrations/puppetdb/PuppetDBService.ts:189`

#### `/pdb/admin/v1/archive`

- **Used in**: Integration routes, Frontend PuppetDBAdmin component
- **Purpose**: Retrieve PuppetDB archive information
- **Method**: GET
- **Frontend**: `frontend/src/components/PuppetDBAdmin.svelte:32`
- **Backend**: `backend/src/routes/integrations.ts:1311`

#### `/pdb/admin/v1/summary-stats`

- **Used in**: Integration routes, Frontend PuppetDBAdmin component
- **Purpose**: Retrieve PuppetDB summary statistics (resource-intensive)
- **Method**: GET
- **Warning**: Can be resource-intensive on PuppetDB
- **Frontend**: `frontend/src/components/PuppetDBAdmin.svelte:67`
- **Backend**: `backend/src/routes/integrations.ts:1383`

## Puppet Server API Endpoints

### Node Information Endpoints

#### `/puppet/v3/status/{certname}`

- **Used in**: `PuppetserverClient.getStatus()`, `PuppetserverService.getNodeStatus()`
- **Purpose**: Retrieve node status information (last check-in, environment, etc.)
- **Method**: GET
- **Note**: Returns null if node hasn't checked in yet
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:260`

#### `/puppet/v3/facts/{certname}`

- **Used in**: `PuppetserverClient.getFacts()`, `PuppetserverService.getNodeFacts()`
- **Purpose**: Retrieve facts for a specific node
- **Method**: GET
- **Note**: Returns null if node hasn't submitted facts yet
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:380`

#### `/puppet/v3/catalog/{certname}`

- **Used in**: `PuppetserverClient.compileCatalog()`, `PuppetserverService.compileCatalog()`
- **Purpose**: Compile a catalog for a node in a specific environment
- **Method**: POST
- **Parameters**: `environment` (query parameter)
- **Body**: Optional facts data for compilation
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:330`

### Environment Management Endpoints

#### `/puppet/v3/environments`

- **Used in**: `PuppetserverClient.getEnvironments()`, `PuppetserverService.listEnvironments()`
- **Purpose**: Retrieve list of available environments
- **Method**: GET
- **Note**: May return array or object format depending on Puppet Server version
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:430`

#### `/puppet/v3/environment/{name}`

- **Used in**: `PuppetserverClient.getEnvironment()`, `PuppetserverService.getEnvironment()`
- **Purpose**: Retrieve details for a specific environment
- **Method**: GET
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:480`

#### `/puppet-admin-api/v1/environment-cache`

- **Used in**: `PuppetserverClient.deployEnvironment()`, `PuppetserverService.deployEnvironment()`
- **Purpose**: Deploy/refresh an environment
- **Method**: POST
- **Body**: `{"environment": "environment_name"}`
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:487`

### Status and Monitoring Endpoints

#### `/status/v1/services`

- **Used in**: `PuppetserverClient.getServicesStatus()`, `PuppetserverService.getServicesStatus()`
- **Purpose**: Retrieve detailed status of all Puppet Server services
- **Method**: GET
- **Frontend**: `frontend/src/components/PuppetserverStatus.svelte:39`
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:1350`

#### `/status/v1/simple`

- **Used in**: `PuppetserverClient.getSimpleStatus()`, `PuppetserverService.getSimpleStatus()`
- **Purpose**: Lightweight health check (returns "running" or error)
- **Method**: GET
- **Frontend**: `frontend/src/components/PuppetserverStatus.svelte:70`
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:1380`

#### `/puppet-admin-api/v1`

- **Used in**: `PuppetserverClient.getAdminApiInfo()`, `PuppetserverService.getAdminApiInfo()`
- **Purpose**: Retrieve admin API information and available operations
- **Method**: GET
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:1410`

#### `/metrics/v2`

- **Used in**: `PuppetserverClient.getMetrics()`, `PuppetserverService.getMetrics()`
- **Purpose**: Retrieve JMX metrics via Jolokia
- **Method**: GET
- **Parameters**: `mbean` (optional, for specific metrics)
- **Warning**: Resource-intensive endpoint, use sparingly
- **Location**: `backend/src/integrations/puppetserver/PuppetserverClient.ts:1440`

## Application API Endpoints (Frontend to Backend)

### PuppetDB Integration Routes

#### `GET /api/integrations/puppetdb/resources/{certname}`

- **Purpose**: Get managed resources for a node
- **Backend**: `backend/src/routes/integrations.ts:1049`

#### `GET /api/integrations/puppetdb/admin/archive`

- **Purpose**: Get PuppetDB archive information
- **Backend**: `backend/src/routes/integrations.ts:1311`
- **Frontend**: `frontend/src/components/PuppetDBAdmin.svelte:32`

#### `GET /api/integrations/puppetdb/admin/summary-stats`

- **Purpose**: Get PuppetDB summary statistics
- **Backend**: `backend/src/routes/integrations.ts:1383`
- **Frontend**: `frontend/src/components/PuppetDBAdmin.svelte:67`

### Puppet Server Integration Routes

#### `GET /api/integrations/puppetserver/certificates`

- **Purpose**: List all certificates
- **Backend**: `backend/src/routes/integrations.ts` (implied)
- **Frontend**: `frontend/src/components/CertificateManagement.svelte:88`

#### `POST /api/integrations/puppetserver/certificates/{certname}/sign`

- **Purpose**: Sign a certificate
- **Frontend**: `frontend/src/components/CertificateManagement.svelte:147`

#### `DELETE /api/integrations/puppetserver/certificates/{certname}`

- **Purpose**: Revoke a certificate
- **Frontend**: `frontend/src/components/CertificateManagement.svelte:179`

#### `POST /api/integrations/puppetserver/certificates/bulk-sign`

- **Purpose**: Sign multiple certificates
- **Frontend**: `frontend/src/components/CertificateManagement.svelte:207`

#### `POST /api/integrations/puppetserver/certificates/bulk-revoke`

- **Purpose**: Revoke multiple certificates
- **Frontend**: `frontend/src/components/CertificateManagement.svelte:238`

#### `GET /api/integrations/puppetserver/status/services`

- **Purpose**: Get Puppet Server services status
- **Backend**: `backend/src/routes/integrations.ts:2929`
- **Frontend**: `frontend/src/components/PuppetserverStatus.svelte:39`

#### `GET /api/integrations/puppetserver/status/simple`

- **Purpose**: Get simple Puppet Server status
- **Backend**: `backend/src/routes/integrations.ts:3000`
- **Frontend**: `frontend/src/components/PuppetserverStatus.svelte:70`

## Authentication Methods

### PuppetDB

- **Token-based**: `X-Authentication` header
- **SSL/TLS**: Client certificates (cert, key, ca)
- **Configuration**: `backend/.env` - `PUPPETDB_*` variables

### Puppet Server

- **Token-based**: `X-Authentication` header
- **Certificate-based**: Client certificates for mutual TLS
- **SSL/TLS**: Custom CA certificates
- **Configuration**: `backend/.env` - `PUPPETSERVER_*` variables

## Error Handling Patterns

### Common HTTP Status Codes

- **200**: Success
- **401/403**: Authentication/authorization errors
- **404**: Resource not found (handled gracefully)
- **429**: Rate limiting (retryable)
- **5xx**: Server errors (retryable)

### Retry Logic

- **PuppetDB**: Circuit breaker with exponential backoff
- **Puppet Server**: Circuit breaker with exponential backoff
- **Retryable errors**: Connection, timeout, 5xx, 429
- **Non-retryable**: Authentication errors, 4xx client errors

### Caching Strategy

- **Default TTL**: 5 minutes (300,000ms)
- **Status endpoints**: 30 seconds (frequently changing)
- **Metrics**: 5+ minutes (resource-intensive)
- **Empty results**: 1 minute (shorter TTL)

## Performance Considerations

### Resource-Intensive Endpoints

1. **`/pdb/admin/v1/summary-stats`** - Can impact PuppetDB performance
2. **`/metrics/v2`** - Can impact Puppet Server performance
3. **`/pdb/query/v4/events`** - Limited to 100 events by default to prevent hanging

### Optimization Strategies

- Caching with appropriate TTLs
- Circuit breakers to prevent cascading failures
- Pagination for large datasets
- Graceful degradation when endpoints are unavailable
- Detailed logging for debugging and monitoring
