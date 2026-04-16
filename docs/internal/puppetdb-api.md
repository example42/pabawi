# PuppetDB Integration API Documentation

Version: 0.5.0

## Overview

This document describes the API endpoints for PuppetDB integration, re-execution capabilities, and expert mode enhancements. These endpoints extend the base Pabawi API to support multi-source infrastructure management.

## Table of Contents

- [Integration Status](#integration-status)
- [PuppetDB Inventory](#puppetdb-inventory)
- [PuppetDB Facts](#puppetdb-facts)
- [PuppetDB Reports](#puppetdb-reports)
- [PuppetDB Catalogs](#puppetdb-catalogs)
- [PuppetDB Events](#puppetdb-events)
- [Re-execution](#re-execution)
- [Enhanced Inventory](#enhanced-inventory)
- [Expert Mode](#expert-mode)

## Integration Status

### Get Integration Status

Retrieve connection status for all configured integrations.

**Request:**

```http
GET /api/integrations/status
```

**Response:**

```json
{
  "integrations": {
    "bolt": {
      "name": "Bolt",
      "type": "both",
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "puppetdb": {
      "name": "PuppetDB",
      "type": "information",
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Status Values:**

- `connected`: Integration is healthy and responding
- `disconnected`: Integration is configured but not responding
- `error`: Integration encountered an error

**Error Response:**

```json
{
  "integrations": {
    "puppetdb": {
      "name": "PuppetDB",
      "type": "information",
      "status": "error",
      "lastCheck": "2024-01-15T10:30:00.000Z",
      "error": "Connection timeout"
    }
  }
}
```

## PuppetDB Inventory

### List All Nodes from PuppetDB

Retrieve all nodes from PuppetDB inventory.

**Request:**

```http
GET /api/integrations/puppetdb/nodes
```

**Query Parameters:**

- `query` (string, optional): PQL query to filter nodes
- `limit` (integer, optional): Maximum number of nodes to return (default: 1000)
- `offset` (integer, optional): Number of nodes to skip for pagination (default: 0)

**Response:**

```json
{
  "nodes": [
    {
      "id": "web-01.example.com",
      "name": "web-01.example.com",
      "certname": "web-01.example.com",
      "uri": "ssh://web-01.example.com",
      "transport": "ssh",
      "source": "puppetdb",
      "deactivated": null,
      "expired": null,
      "catalog_timestamp": "2024-01-15T10:00:00.000Z",
      "facts_timestamp": "2024-01-15T10:00:00.000Z",
      "report_timestamp": "2024-01-15T10:00:00.000Z"
    }
  ],
  "total": 42,
  "source": "puppetdb"
}
```

**Example with PQL Query:**

```http
GET /api/integrations/puppetdb/nodes?query=nodes { certname ~ "web" }
```

**Error Responses:**

- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed
- `400 INVALID_REQUEST`: Invalid PQL query syntax

### Get Node Details from PuppetDB

Retrieve detailed information about a specific node.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname
```

**Path Parameters:**

- `certname` (string, required): Node certname (e.g., "web-01.example.com")

**Response:**

```json
{
  "node": {
    "certname": "web-01.example.com",
    "deactivated": null,
    "expired": null,
    "catalog_timestamp": "2024-01-15T10:00:00.000Z",
    "facts_timestamp": "2024-01-15T10:00:00.000Z",
    "report_timestamp": "2024-01-15T10:00:00.000Z",
    "catalog_environment": "production",
    "report_environment": "production",
    "latest_report_status": "changed",
    "latest_report_noop": false,
    "latest_report_hash": "abc123def456",  // pragma: allowlist secret
    "cached_catalog_status": "on_disk"
  }
}
```

**Error Responses:**

- `404 NOT_FOUND`: Node not found in PuppetDB
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

## PuppetDB Facts

### Get Node Facts from PuppetDB

Retrieve facts for a specific node from PuppetDB.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/facts
```

**Path Parameters:**

- `certname` (string, required): Node certname

**Response:**

```json
{
  "certname": "web-01.example.com",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "source": "puppetdb",
  "facts": {
    "os": {
      "family": "RedHat",
      "name": "CentOS",
      "release": {
        "full": "7.9.2009",
        "major": "7",
        "minor": "9"
      },
      "architecture": "x86_64"
    },
    "processors": {
      "count": 4,
      "models": ["Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"],
      "physicalcount": 2
    },
    "memory": {
      "system": {
        "total": "16.00 GiB",
        "total_bytes": 17179869184,
        "available": "12.34 GiB",
        "available_bytes": 13250000000,
        "used": "3.66 GiB",
        "used_bytes": 3929869184
      }
    },
    "networking": {
      "hostname": "web-01",
      "fqdn": "web-01.example.com",
      "domain": "example.com",
      "interfaces": {
        "eth0": {
          "ip": "192.168.1.100",
          "netmask": "255.255.255.0",
          "mac": "00:50:56:00:00:01"
        }
      },
      "primary": "eth0"
    }
  },
  "categories": {
    "system": ["os", "kernel", "virtual"],
    "hardware": ["processors", "memory", "blockdevices"],
    "network": ["networking", "interfaces"],
    "custom": []
  }
}
```

**Error Responses:**

- `404 NOT_FOUND`: Node not found or no facts available
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

## PuppetDB Reports

### Get Node Reports from PuppetDB

Retrieve Puppet run reports for a specific node.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/reports
```

**Path Parameters:**

- `certname` (string, required): Node certname

**Query Parameters:**

- `limit` (integer, optional): Maximum number of reports to return (default: 10)
- `offset` (integer, optional): Number of reports to skip (default: 0)

**Response:**

```json
{
  "certname": "web-01.example.com",
  "reports": [
    {
      "hash": "abc123def456",  # pragma: allowlist secret
      "certname": "web-01.example.com",
      "puppet_version": "7.12.0",
      "report_format": 12,
      "configuration_version": "1642248000",
      "start_time": "2024-01-15T10:00:00.000Z",
      "end_time": "2024-01-15T10:01:30.000Z",
      "producer_timestamp": "2024-01-15T10:01:30.000Z",
      "receive_time": "2024-01-15T10:01:31.000Z",
      "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "environment": "production",
      "status": "changed",
      "noop": false,
      "noop_pending": false,
      "metrics": {
        "resources": {
          "total": 47,
          "skipped": 0,
          "failed": 0,
          "failed_to_restart": 0,
          "restarted": 1,
          "changed": 5,
          "out_of_sync": 5,
          "scheduled": 0
        },
        "time": {
          "total": 45.3,
          "config_retrieval": 2.1,
          "catalog_application": 43.2
        },
        "changes": {
          "total": 5
        },
        "events": {
          "success": 5,
          "failure": 0,
          "total": 5
        }
      }
    }
  ],
  "total": 150
}
```

**Status Values:**

- `unchanged`: No resources changed
- `changed`: Resources were changed
- `failed`: One or more resources failed

**Error Responses:**

- `404 NOT_FOUND`: Node not found or no reports available
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

### Get Report Details

Retrieve detailed information for a specific report.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/reports/:hash
```

**Path Parameters:**

- `certname` (string, required): Node certname
- `hash` (string, required): Report hash

**Response:**

```json
{
  "hash": "abc123def456",  # pragma: allowlist secret
  "certname": "web-01.example.com",
  "puppet_version": "7.12.0",
  "report_format": 12,
  "configuration_version": "1642248000",
  "start_time": "2024-01-15T10:00:00.000Z",
  "end_time": "2024-01-15T10:01:30.000Z",
  "environment": "production",
  "status": "changed",
  "noop": false,
  "metrics": {
    "resources": {
      "total": 47,
      "changed": 5,
      "failed": 0
    }
  },
  "logs": [
    {
      "level": "notice",
      "message": "Applied catalog in 43.2 seconds",
      "source": "Puppet",
      "time": "2024-01-15T10:01:30.000Z"
    }
  ],
  "resource_events": [
    {
      "resource_type": "File",
      "resource_title": "/etc/nginx/nginx.conf",
      "property": "content",
      "timestamp": "2024-01-15T10:01:15.000Z",
      "status": "success",
      "old_value": "{md5}abc123",
      "new_value": "{md5}def456",
      "message": "content changed '{md5}abc123' to '{md5}def456'",
      "file": "/etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp",
      "line": 42
    }
  ]
}
```

**Error Responses:**

- `404 NOT_FOUND`: Report not found
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

## PuppetDB Catalogs

### Get Node Catalog from PuppetDB

Retrieve the compiled catalog for a specific node.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/catalog
```

**Path Parameters:**

- `certname` (string, required): Node certname

**Response:**

```json
{
  "certname": "web-01.example.com",
  "version": "1642248000",
  "transaction_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "environment": "production",
  "producer_timestamp": "2024-01-15T10:00:00.000Z",
  "hash": "catalog123hash456",
  "resources": [
    {
      "type": "File",
      "title": "/etc/nginx/nginx.conf",
      "tags": ["file", "nginx", "class", "nginx::config"],
      "exported": false,
      "file": "/etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp",
      "line": 42,
      "parameters": {
        "ensure": "file",
        "owner": "root",
        "group": "root",
        "mode": "0644",
        "content": "# Nginx configuration..."
      }
    },
    {
      "type": "Service",
      "title": "nginx",
      "tags": ["service", "nginx", "class", "nginx::service"],
      "exported": false,
      "parameters": {
        "ensure": "running",
        "enable": true
      }
    }
  ],
  "edges": [
    {
      "source": {
        "type": "File",
        "title": "/etc/nginx/nginx.conf"
      },
      "target": {
        "type": "Service",
        "title": "nginx"
      },
      "relationship": "notify"
    }
  ],
  "resourcesByType": {
    "File": 15,
    "Service": 3,
    "Package": 5,
    "User": 2
  }
}
```

**Error Responses:**

- `404 NOT_FOUND`: Node not found or no catalog available
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

## PuppetDB Events

### Get Node Events from PuppetDB

Retrieve resource events for a specific node.

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/events
```

**Path Parameters:**

- `certname` (string, required): Node certname

**Query Parameters:**

- `status` (string, optional): Filter by event status (success, failure, noop, skipped)
- `resource_type` (string, optional): Filter by resource type (e.g., "File", "Service")
- `start_time` (string, optional): Filter events after this timestamp (ISO 8601)
- `end_time` (string, optional): Filter events before this timestamp (ISO 8601)
- `limit` (integer, optional): Maximum number of events to return (default: 100)
- `offset` (integer, optional): Number of events to skip (default: 0)

**Response:**

```json
{
  "certname": "web-01.example.com",
  "events": [
    {
      "certname": "web-01.example.com",
      "timestamp": "2024-01-15T10:01:15.000Z",
      "report": "abc123def456",  # pragma: allowlist secret
      "resource_type": "File",
      "resource_title": "/etc/nginx/nginx.conf",
      "property": "content",
      "status": "success",
      "old_value": "{md5}abc123",
      "new_value": "{md5}def456",
      "message": "content changed '{md5}abc123' to '{md5}def456'",
      "file": "/etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp",
      "line": 42
    },
    {
      "certname": "web-01.example.com",
      "timestamp": "2024-01-15T10:01:20.000Z",
      "report": "abc123def456",  # pragma: allowlist secret
      "resource_type": "Service",
      "resource_title": "nginx",
      "property": "ensure",
      "status": "success",
      "old_value": "stopped",
      "new_value": "running",
      "message": "ensure changed 'stopped' to 'running'"
    }
  ],
  "total": 250,
  "filters": {
    "status": null,
    "resource_type": null,
    "start_time": null,
    "end_time": null
  }
}
```

**Event Status Values:**

- `success`: Event completed successfully
- `failure`: Event failed
- `noop`: Event would have changed but noop mode was enabled
- `skipped`: Event was skipped

**Example with Filters:**

```http
GET /api/integrations/puppetdb/nodes/web-01.example.com/events?status=failure&resource_type=Service
```

**Error Responses:**

- `404 NOT_FOUND`: Node not found or no events available
- `400 INVALID_REQUEST`: Invalid filter parameters
- `503 SERVICE_UNAVAILABLE`: PuppetDB connection failed

## Re-execution

### Get Original Execution

Retrieve the original execution for a re-execution.

**Request:**

```http
GET /api/executions/:id/original
```

**Path Parameters:**

- `id` (string, required): Execution ID

**Response:**

```json
{
  "execution": {
    "id": "original-exec-123",
    "type": "command",
    "targetNodes": ["web-01"],
    "action": "systemctl status nginx",
    "status": "success",
    "startedAt": "2024-01-15T10:00:00.000Z",
    "completedAt": "2024-01-15T10:00:05.000Z",
    "results": [
      {
        "nodeId": "web-01",
        "status": "success",
        "output": {
          "stdout": "● nginx.service - nginx\n   Active: active (running)",
          "stderr": "",
          "exitCode": 0
        }
      }
    ],
    "command": "bolt command run 'systemctl status nginx' --targets web-01 --format json"
  }
}
```

**Error Responses:**

- `404 NOT_FOUND`: Execution not found or is not a re-execution
- `404 NOT_FOUND`: Original execution not found

### Get Re-executions

Retrieve all re-executions of an execution.

**Request:**

```http
GET /api/executions/:id/re-executions
```

**Path Parameters:**

- `id` (string, required): Original execution ID

**Response:**

```json
{
  "originalExecutionId": "original-exec-123",
  "reExecutions": [
    {
      "id": "re-exec-456",
      "type": "command",
      "targetNodes": ["web-01"],
      "action": "systemctl status nginx",
      "status": "success",
      "startedAt": "2024-01-15T11:00:00.000Z",
      "completedAt": "2024-01-15T11:00:05.000Z",
      "originalExecutionId": "original-exec-123",
      "reExecutionCount": 1
    },
    {
      "id": "re-exec-789",
      "type": "command",
      "targetNodes": ["web-01"],
      "action": "systemctl status nginx",
      "status": "success",
      "startedAt": "2024-01-15T12:00:00.000Z",
      "completedAt": "2024-01-15T12:00:05.000Z",
      "originalExecutionId": "original-exec-123",
      "reExecutionCount": 2
    }
  ],
  "total": 2
}
```

**Error Responses:**

- `404 NOT_FOUND`: Execution not found

### Trigger Re-execution

Trigger a re-execution of a previous execution with optional parameter modifications.

**Request:**

```http
POST /api/executions/:id/re-execute
```

**Path Parameters:**

- `id` (string, required): Original execution ID

**Request Body:**

```json
{
  "targetNodes": ["web-01", "web-02"],
  "parameters": {
    "noop": true
  },
  "expertMode": true
}
```

**Request Body Fields:**

- `targetNodes` (array, optional): Override target nodes
- `parameters` (object, optional): Override execution parameters
- `expertMode` (boolean, optional): Enable expert mode for this execution

**Response:**

```json
{
  "executionId": "re-exec-456",
  "status": "running",
  "message": "Re-execution started",
  "originalExecutionId": "original-exec-123",
  "reExecutionCount": 1
}
```

**Error Responses:**

- `404 NOT_FOUND`: Original execution not found
- `400 INVALID_REQUEST`: Invalid request body

**Example - Re-execute with Same Parameters:**

```bash
curl -X POST http://localhost:3000/api/executions/original-exec-123/re-execute \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Example - Re-execute with Modified Parameters:**

```bash
curl -X POST http://localhost:3000/api/executions/original-exec-123/re-execute \
  -H "Content-Type: application/json" \
  -d '{
    "targetNodes": ["web-01", "web-02", "web-03"],
    "parameters": {
      "noop": true,
      "tags": "webserver,security"
    }
  }'
```

## Enhanced Inventory

### Get Multi-Source Inventory

Retrieve inventory from multiple sources with source attribution.

**Request:**

```http
GET /api/inventory?sources=bolt,puppetdb
```

**Query Parameters:**

- `sources` (string, optional): Comma-separated list of sources (default: all)
- `search` (string, optional): Search nodes by name
- `transport` (string, optional): Filter by transport type

**Response:**

```json
{
  "nodes": [
    {
      "id": "web-01",
      "name": "web-01",
      "uri": "ssh://web-01.example.com",
      "transport": "ssh",
      "source": "bolt",
      "config": {
        "user": "admin",
        "port": 22
      }
    },
    {
      "id": "web-02.example.com",
      "name": "web-02.example.com",
      "certname": "web-02.example.com",
      "uri": "ssh://web-02.example.com",
      "transport": "ssh",
      "source": "puppetdb",
      "catalog_timestamp": "2024-01-15T10:00:00.000Z",
      "facts_timestamp": "2024-01-15T10:00:00.000Z",
      "report_timestamp": "2024-01-15T10:00:00.000Z"
    }
  ],
  "sources": {
    "bolt": {
      "nodeCount": 25,
      "lastSync": "2024-01-15T10:30:00.000Z",
      "status": "healthy"
    },
    "puppetdb": {
      "nodeCount": 42,
      "lastSync": "2024-01-15T10:30:00.000Z",
      "status": "healthy"
    }
  },
  "total": 67
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid source name

### Get Available Inventory Sources

Retrieve list of available inventory sources and their status.

**Request:**

```http
GET /api/inventory/sources
```

**Response:**

```json
{
  "sources": [
    {
      "name": "bolt",
      "type": "both",
      "enabled": true,
      "status": "connected",
      "nodeCount": 25,
      "lastSync": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "puppetdb",
      "type": "information",
      "enabled": true,
      "status": "connected",
      "nodeCount": 42,
      "lastSync": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## Expert Mode

### Get Complete Execution Output

Retrieve complete stdout and stderr for an execution (expert mode).

**Request:**

```http
GET /api/executions/:id/output
```

**Path Parameters:**

- `id` (string, required): Execution ID

**Headers:**

- `X-Expert-Mode: true` (optional): Enable expert mode response

**Response:**

```json
{
  "executionId": "exec-123",
  "command": "bolt command run 'systemctl status nginx' --targets web-01 --format json",
  "stdout": "● nginx.service - nginx - high performance web server\n   Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; vendor preset: disabled)\n   Active: active (running) since Mon 2024-01-15 10:00:00 UTC; 2h 30min ago\n     Docs: http://nginx.org/en/docs/\n Main PID: 1234 (nginx)\n   CGroup: /system.slice/nginx.service\n           ├─1234 nginx: master process /usr/sbin/nginx\n           └─1235 nginx: worker process\n\nJan 15 10:00:00 web-01 systemd[1]: Starting nginx - high performance web server...\nJan 15 10:00:00 web-01 systemd[1]: Started nginx - high performance web server.",
  "stderr": "",
  "exitCode": 0,
  "expertMode": true
}
```

**Response (Non-Expert Mode):**

```json
{
  "executionId": "exec-123",
  "stdout": "● nginx.service - nginx\n   Active: active (running)",
  "stderr": "",
  "exitCode": 0,
  "expertMode": false
}
```

**Error Responses:**

- `404 NOT_FOUND`: Execution not found

### Get Execution Command Line

Retrieve the full command line executed (expert mode).

**Request:**

```http
GET /api/executions/:id/command
```

**Path Parameters:**

- `id` (string, required): Execution ID

**Response:**

```json
{
  "executionId": "exec-123",
  "command": "bolt command run 'systemctl status nginx' --targets web-01 --format json --no-color",
  "type": "command",
  "action": "systemctl status nginx",
  "targetNodes": ["web-01"],
  "expertMode": true
}
```

**Error Responses:**

- `404 NOT_FOUND`: Execution not found

## Common Workflows

### Workflow 1: View Node Information from PuppetDB

```bash
# 1. Get node list
curl http://localhost:3000/api/integrations/puppetdb/nodes

# 2. Get node details
curl http://localhost:3000/api/integrations/puppetdb/nodes/web-01.example.com

# 3. Get node facts
curl http://localhost:3000/api/integrations/puppetdb/nodes/web-01.example.com/facts

# 4. Get recent reports
curl http://localhost:3000/api/integrations/puppetdb/nodes/web-01.example.com/reports?limit=5

# 5. Get catalog
curl http://localhost:3000/api/integrations/puppetdb/nodes/web-01.example.com/catalog

# 6. Get recent events
curl http://localhost:3000/api/integrations/puppetdb/nodes/web-01.example.com/events?limit=10
```

### Workflow 2: Re-execute a Command

```bash
# 1. Execute initial command
curl -X POST http://localhost:3000/api/nodes/web-01/command \
  -H "Content-Type: application/json" \
  -d '{"command": "uptime"}'

# Response: {"executionId": "exec-123", "status": "running"}

# 2. Wait for completion and view results
curl http://localhost:3000/api/executions/exec-123

# 3. Re-execute the same command
curl -X POST http://localhost:3000/api/executions/exec-123/re-execute \
  -H "Content-Type: application/json" \
  -d '{}'

# Response: {"executionId": "re-exec-456", "originalExecutionId": "exec-123"}

# 4. View all re-executions
curl http://localhost:3000/api/executions/exec-123/re-executions
```

### Workflow 3: Multi-Source Inventory Management

```bash
# 1. Check integration status
curl http://localhost:3000/api/integrations/status

# 2. Get available sources
curl http://localhost:3000/api/inventory/sources

# 3. Get inventory from all sources
curl http://localhost:3000/api/inventory

# 4. Get inventory from specific source
curl http://localhost:3000/api/inventory?sources=puppetdb

# 5. Search across all sources
curl http://localhost:3000/api/inventory?search=web
```

### Workflow 4: Expert Mode Debugging

```bash
# 1. Execute command with expert mode
curl -X POST http://localhost:3000/api/nodes/web-01/command \
  -H "Content-Type: application/json" \
  -H "X-Expert-Mode: true" \
  -d '{"command": "systemctl status nginx", "expertMode": true}'

# Response includes full command line

# 2. Get complete output
curl -H "X-Expert-Mode: true" \
  http://localhost:3000/api/executions/exec-123/output

# 3. Get command line
curl http://localhost:3000/api/executions/exec-123/command

# 4. View execution with full details
curl -H "X-Expert-Mode: true" \
  http://localhost:3000/api/executions/exec-123
```

## Error Handling

All endpoints follow the standard Pabawi error response format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context"
  }
}
```

### PuppetDB-Specific Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `PUPPETDB_CONNECTION_ERROR` | 503 | Cannot connect to PuppetDB |
| `PUPPETDB_QUERY_ERROR` | 400 | Invalid PQL query syntax |
| `PUPPETDB_AUTH_ERROR` | 401 | Authentication failed |
| `PUPPETDB_TIMEOUT` | 504 | PuppetDB request timeout |
| `PUPPETDB_NOT_CONFIGURED` | 503 | PuppetDB not configured |

### Expert Mode Error Response

When expert mode is enabled, error responses include additional diagnostic information:

```json
{
  "error": {
    "code": "PUPPETDB_CONNECTION_ERROR",
    "message": "Failed to connect to PuppetDB",
    "details": "Connection timeout after 30s",
    "stackTrace": "Error: Connection timeout\n    at PuppetDBClient.query...",
    "requestId": "req-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "executionContext": {
      "endpoint": "/api/integrations/puppetdb/nodes",
      "method": "GET",
      "puppetdbUrl": "https://puppetdb.example.com:8081"
    }
  }
}
```

## Rate Limiting

PuppetDB endpoints respect the following rate limits:

- **Query endpoints**: 100 requests per minute per client
- **Node endpoints**: 200 requests per minute per client
- **Integration status**: 10 requests per minute per client

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248060
```

## Caching

PuppetDB data is cached to improve performance:

- **Inventory**: 5 minutes (configurable via `PUPPETDB_CACHE_TTL`)
- **Facts**: 5 minutes
- **Reports**: 1 minute
- **Catalogs**: 5 minutes
- **Events**: 1 minute

Cache headers are included in responses:

```
X-Cache: HIT
X-Cache-Age: 120
X-Cache-TTL: 300
```

To bypass cache, include header:

```
X-Cache-Control: no-cache
```

## Pagination

List endpoints support pagination:

**Query Parameters:**

- `limit`: Number of items per page (default: varies by endpoint)
- `offset`: Number of items to skip

**Response includes pagination metadata:**

```json
{
  "items": [...],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 250,
    "hasMore": true
  }
}
```

## Additional Resources

- [Integrations API Documentation](./integrations-api.md) - Complete API reference for all integrations
- [Authentication Guide](./authentication.md) - Authentication setup and troubleshooting
- [Error Codes Reference](./error-codes.md) - Complete error code reference
- [PuppetDB Integration Setup Guide](./integrations/puppetdb.md)
- [Pabawi Configuration Guide](./configuration.md)
- [Pabawi User Guide](./user-guide.md)
- [PuppetDB API Documentation](https://puppet.com/docs/puppetdb/latest/api/index.html)
