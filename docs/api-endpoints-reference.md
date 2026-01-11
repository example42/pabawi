# Pabawi API Endpoints Reference

Version: 0.4.0

## Quick Reference

This document provides a quick reference table of all Pabawi API endpoints based on the actual implementation.

## System Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/health` | Health check | No |
| GET | `/api/config` | Get configuration | No |

## Integration Status

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/status` | Get all integration status | No |

## Inventory Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/inventory` | List all nodes from all sources | No |
| GET | `/api/inventory/sources` | Get available inventory sources | No |
| GET | `/api/nodes/:id` | Get node details | No |

## Execution Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/executions` | List execution history | No |
| GET | `/api/executions/:id` | Get execution details | No |
| GET | `/api/executions/:id/output` | Get complete execution output | No |
| GET | `/api/executions/:id/original` | Get original execution for re-execution | No |
| GET | `/api/executions/:id/re-executions` | Get all re-executions | No |
| POST | `/api/executions/:id/re-execute` | Trigger re-execution | No |
| GET | `/api/executions/queue/status` | Get execution queue status | No |

## Streaming Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/executions/:id/stream` | Stream execution output (SSE) | No |
| GET | `/api/streaming/stats` | Get streaming statistics | No |

## Command Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/nodes/:id/command` | Execute command on node | No |

## Task Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/tasks` | List available tasks | No |
| GET | `/api/tasks/by-module` | List tasks grouped by module | No |
| POST | `/api/nodes/:id/task` | Execute task on node | No |

## Puppet Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/nodes/:id/puppet-run` | Execute Puppet run on node | No |

## Package Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/package-tasks` | Get available package tasks | No |
| POST | `/api/nodes/:id/install-package` | Install package on node | No |

## Facts Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/nodes/:id/facts` | Gather facts from node | No |

## Hiera Endpoints

### Hiera Status and Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/hiera/status` | Get Hiera integration status | No |
| POST | `/api/integrations/hiera/reload` | Reload control repository data | No |

### Hiera Key Discovery

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/hiera/keys` | List all discovered Hiera keys | No |
| GET | `/api/integrations/hiera/keys/search` | Search for Hiera keys by partial name | No |
| GET | `/api/integrations/hiera/keys/:key` | Get details for a specific Hiera key | No |

### Hiera Node-Specific Data

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/hiera/nodes/:nodeId/data` | Get all Hiera data for a specific node | No |
| GET | `/api/integrations/hiera/nodes/:nodeId/keys` | Get all Hiera keys for a specific node | No |
| GET | `/api/integrations/hiera/nodes/:nodeId/keys/:key` | Resolve a specific Hiera key for a node | No |

### Hiera Global Key Analysis

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/hiera/keys/:key/nodes` | Get key values across all nodes | No |

### Hiera Code Analysis

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/hiera/analysis` | Get complete code analysis results | No |
| GET | `/api/integrations/hiera/analysis/unused` | Get unused code report | No |
| GET | `/api/integrations/hiera/analysis/lint` | Get lint issues with optional filtering | No |
| GET | `/api/integrations/hiera/analysis/modules` | Get module update information | No |
| GET | `/api/integrations/hiera/analysis/statistics` | Get usage statistics | No |

## PuppetDB Endpoints

### PuppetDB Inventory

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/nodes` | List all nodes from PuppetDB | Token |
| GET | `/api/integrations/puppetdb/nodes/:certname` | Get node details from PuppetDB | Token |

### PuppetDB Facts

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/nodes/:certname/facts` | Get node facts from PuppetDB | Token |

### PuppetDB Reports

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/reports/summary` | Get reports summary | Token |
| GET | `/api/integrations/puppetdb/reports` | Get all reports | Token |
| GET | `/api/integrations/puppetdb/nodes/:certname/reports` | Get node reports | Token |
| GET | `/api/integrations/puppetdb/nodes/:certname/reports/:hash` | Get report details | Token |

### PuppetDB Catalogs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/nodes/:certname/catalog` | Get node catalog | Token |
| GET | `/api/integrations/puppetdb/nodes/:certname/resources` | Get node resources | Token |

### PuppetDB Events

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/nodes/:certname/events` | Get node events | Token |

### PuppetDB Admin

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetdb/admin/archive` | Get archive info | Token |
| GET | `/api/integrations/puppetdb/admin/summary-stats` | Get summary statistics | Token |

## Puppetserver Endpoints

### Puppetserver Nodes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetserver/nodes` | List all nodes from Puppetserver | Certificate |
| GET | `/api/integrations/puppetserver/nodes/:certname` | Get node details | Certificate |
| GET | `/api/integrations/puppetserver/nodes/:certname/status` | Get node status | Certificate |
| GET | `/api/integrations/puppetserver/nodes/:certname/facts` | Get node facts | Certificate |

### Puppetserver Catalogs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetserver/catalog/:certname/:environment` | Compile catalog | Certificate |
| POST | `/api/integrations/puppetserver/catalog/compare` | Compare catalogs | Certificate |

### Puppetserver Environments

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetserver/environments` | List environments | Certificate |
| GET | `/api/integrations/puppetserver/environments/:name` | Get environment details | Certificate |
| POST | `/api/integrations/puppetserver/environments/:name/deploy` | Deploy environment | Certificate |

### Puppetserver Status & Metrics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetserver/status/services` | Get services status | Certificate |
| GET | `/api/integrations/puppetserver/status/simple` | Get simple status | Certificate |
| GET | `/api/integrations/puppetserver/admin-api` | Get admin API info | Certificate |
| GET | `/api/integrations/puppetserver/metrics` | Get metrics | Certificate |

## Endpoint Categories

### By Integration

- **Bolt**: 15 endpoints (inventory, commands, tasks, puppet, packages, facts)
- **Hiera**: 15 endpoints (status, keys, node data, analysis, statistics)
- **PuppetDB**: 12 endpoints (nodes, facts, reports, catalogs, events, admin)
- **Puppetserver**: 15 endpoints (nodes, catalogs, environments, status)

### By HTTP Method

- **GET**: 54 endpoints (read operations)
- **POST**: 7 endpoints (write operations, executions)

### By Authentication

- **No Auth**: 37 endpoints (Bolt operations, Hiera operations, system endpoints)
- **Token Auth**: 12 endpoints (PuppetDB operations)
- **Certificate Auth**: 15 endpoints (Puppetserver operations)

## Response Formats

All endpoints return JSON responses with the following structure:

### Success Response

```json
{
  "data": { ... },
  "metadata": { ... }
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": "Additional context"
  }
}
```

## Common Query Parameters

| Parameter | Type | Description | Applicable Endpoints |
|-----------|------|-------------|---------------------|
| `limit` | integer | Maximum items to return | List endpoints |
| `offset` | integer | Pagination offset | List endpoints |
| `page` | integer | Page number | Execution history, Hiera endpoints |
| `pageSize` | integer | Items per page | Execution history, Hiera endpoints |
| `status` | string | Filter by status | Executions, events |
| `type` | string | Filter by type | Executions |
| `query` | string | PQL query or search term | PuppetDB nodes, Hiera search |
| `refresh` | boolean | Force fresh data | Integration status |
| `resourceType` | string | Filter by resource type | Catalogs, resources |
| `filter` | string | Filter keys (used/unused/all) | Hiera node data |
| `severity` | string | Filter by severity (comma-separated) | Hiera lint issues |
| `types` | string | Filter by types (comma-separated) | Hiera lint issues |
| `sources` | string | Comma-separated list of sources | Inventory |
| `pql` | string | PuppetDB PQL query | Inventory |
| `sortBy` | string | Sort field | Inventory |
| `sortOrder` | string | Sort direction (asc/desc) | Inventory |

## Common Headers

| Header | Description | Applicable Endpoints |
|--------|-------------|---------------------|
| `X-Expert-Mode` | Enable expert mode | All endpoints |
| `X-Authentication-Token` | PuppetDB token (PE only) | PuppetDB endpoints |
| `X-Cache-Control` | Cache control | All endpoints |
| `Content-Type` | Request content type | POST/PUT endpoints |
| `Accept` | Response content type | All endpoints |

## Rate Limits

| Integration | Limit | Window |
|-------------|-------|--------|
| Bolt | None | - |
| Hiera | None | - |
| PuppetDB | 100 req/min | Per client |
| Puppetserver | 50 req/min | Per client |

## Related Documentation

- [API Documentation](./api.md) - Complete API guide
- [Integrations API Documentation](./integrations-api.md) - Integration-specific details
- [Authentication Guide](./authentication.md) - Authentication setup
- [Error Codes Reference](./error-codes.md) - Error code reference
