# Pabawi API Endpoints Reference

Version: 0.3.0

## Quick Reference

This document provides a quick reference table of all Pabawi API endpoints.

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
| GET | `/api/executions/:id/command` | Get execution command line | No |
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

### Puppetserver Certificates

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/integrations/puppetserver/certificates` | List all certificates | Certificate |
| GET | `/api/integrations/puppetserver/certificates/:certname` | Get certificate details | Certificate |
| POST | `/api/integrations/puppetserver/certificates/:certname/sign` | Sign certificate | Certificate |
| DELETE | `/api/integrations/puppetserver/certificates/:certname` | Revoke certificate | Certificate |
| POST | `/api/integrations/puppetserver/certificates/bulk-sign` | Bulk sign certificates | Certificate |
| POST | `/api/integrations/puppetserver/certificates/bulk-revoke` | Bulk revoke certificates | Certificate |

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
- **PuppetDB**: 12 endpoints (nodes, facts, reports, catalogs, events, admin)
- **Puppetserver**: 18 endpoints (certificates, nodes, catalogs, environments, status)

### By HTTP Method

- **GET**: 40 endpoints (read operations)
- **POST**: 10 endpoints (write operations, executions)
- **DELETE**: 1 endpoint (certificate revocation)

### By Authentication

- **No Auth**: 25 endpoints (Bolt operations, system endpoints)
- **Token Auth**: 12 endpoints (PuppetDB operations)
- **Certificate Auth**: 18 endpoints (Puppetserver operations)

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
| `page` | integer | Page number | Execution history |
| `pageSize` | integer | Items per page | Execution history |
| `status` | string | Filter by status | Executions, events |
| `type` | string | Filter by type | Executions |
| `query` | string | PQL query | PuppetDB nodes |
| `refresh` | boolean | Force fresh data | Integration status |
| `resourceType` | string | Filter by resource type | Catalogs, resources |

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
| PuppetDB | 100 req/min | Per client |
| Puppetserver | 50 req/min | Per client |

## Related Documentation

- [API Documentation](./api.md) - Complete API guide
- [Integrations API Documentation](./integrations-api.md) - Integration-specific details
- [Authentication Guide](./authentication.md) - Authentication setup
- [Error Codes Reference](./error-codes.md) - Error code reference
