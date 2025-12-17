# Pabawi API Documentation

Version: 0.3.0

## Overview

The Pabawi API provides a RESTful interface for managing infrastructure automation through multiple integrations. This API enables you to:

- View and manage node inventory from multiple sources (Bolt, PuppetDB, Puppetserver)
- Gather system facts from nodes
- Execute commands on remote nodes
- Run Bolt tasks with parameters
- Trigger Puppet runs with configuration options
- Install packages on nodes
- View execution history and results
- Stream real-time execution output
- Manage Puppetserver certificates
- Query PuppetDB for reports, catalogs, and events
- Compare catalogs across environments

## Integration Support

Pabawi supports multiple infrastructure management integrations:

- **Bolt**: Execution tool for running commands, tasks, and plans
- **PuppetDB**: Information source for node data, reports, catalogs, and events
- **Puppetserver**: Information source for certificates, node status, facts, and catalog compilation

For detailed integration-specific API documentation, see:

- [Integrations API Documentation](./integrations-api.md) - Complete reference for PuppetDB and Puppetserver endpoints
- [PuppetDB API Documentation](./puppetdb-api.md) - Detailed PuppetDB integration guide

## Base URL

```text
http://localhost:3000/api
```

## Authentication

Pabawi supports multiple authentication methods depending on the integration:

- **Bolt**: No API-level authentication (authentication handled by Bolt for node connections)
- **PuppetDB**: Token-based authentication using RBAC tokens (Puppet Enterprise only) or certificate-based authentication
- **Puppetserver**: Token-based authentication (Puppet Enterprise only) or certificate-based authentication for CA operations

For detailed authentication setup and troubleshooting, see:

- [Authentication Guide](./authentication.md) - Complete authentication reference
- [Error Codes Reference](./error-codes.md) - Authentication error codes and solutions

## Expert Mode

Many endpoints support an "expert mode" that provides additional diagnostic information when errors occur.
To enable expert mode:

1. Include the `X-Expert-Mode: true` header in your request, OR
2. Set `expertMode: true` in the request body (where supported)

When expert mode is enabled, error responses include:

- Full stack traces
- Request IDs for correlation
- Execution context (endpoint, method, timestamp)
- Raw Bolt CLI output and the full command executed
- Additional diagnostic information

**Example with header:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -H "X-Expert-Mode: true" \
  -d '{"command": "ls -la"}'
```

**Example with body:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la", "expertMode": true}'
```

## Streaming Execution Output

For long-running operations, you can subscribe to real-time execution output via Server-Sent Events (SSE).
After starting an execution, connect to the streaming endpoint to receive stdout, stderr, and status updates
as they occur.

**Workflow:**

1. Start an execution (command, task, Puppet run, or package installation)
2. Receive an execution ID in the response
3. Connect to `/api/executions/{id}/stream` to receive real-time updates
4. Process SSE events as they arrive

**Event Types:**

- `start`: Execution started
- `command`: Bolt CLI command being executed
- `stdout`: Standard output chunk
- `stderr`: Standard error chunk
- `status`: Status update
- `complete`: Execution completed with results
- `error`: Execution error

## Error Handling

All error responses follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context (optional)"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `COMMAND_NOT_ALLOWED` | 403 | Command not in whitelist |
| `INVALID_NODE_ID` | 404 | Node not found in inventory |
| `INVALID_TASK_NAME` | 404 | Task does not exist |
| `EXECUTION_NOT_FOUND` | 404 | Execution not found |
| `BOLT_CONFIG_MISSING` | 404 | Bolt configuration files not found |
| `NODE_UNREACHABLE` | 503 | Cannot connect to node |
| `BOLT_EXECUTION_FAILED` | 500 | Bolt CLI returned error |
| `BOLT_TIMEOUT` | 500 | Execution exceeded timeout |
| `BOLT_PARSE_ERROR` | 500 | Cannot parse Bolt output |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### Expert Mode Error Response

When expert mode is enabled, errors include additional fields:

```json
{
  "error": {
    "code": "BOLT_EXECUTION_FAILED",
    "message": "Bolt command failed",
    "details": "Connection timeout",
    "stackTrace": "Error: Bolt command failed\n    at BoltService.runCommand...",
    "requestId": "req-abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "rawResponse": "Error: Connection timeout after 30s",
    "executionContext": {
      "endpoint": "/api/nodes/node1/command",
      "method": "POST",
      "requestId": "req-abc123"
    }
  }
}
```

## Endpoints

### System

#### Health Check

Check if the API server is running and properly configured.

**Request:**

```http
GET /api/health
```

**Response:**

```json
{
  "status": "ok",
  "message": "Backend API is running",
  "config": {
    "boltProjectPath": "/path/to/bolt-project",
    "commandWhitelistEnabled": true,
    "databaseInitialized": true
  }
}
```

#### Get Configuration

Retrieve system configuration (excluding sensitive values).

**Request:**

```http
GET /api/config
```

**Response:**

```json
{
  "commandWhitelist": {
    "allowAll": false,
    "whitelist": ["ls", "pwd", "whoami"],
    "matchMode": "exact"
  },
  "executionTimeout": 300000
}
```

### Inventory

#### List All Nodes

Retrieve all nodes from the Bolt inventory.

**Request:**

```http
GET /api/inventory
```

**Response:**

```json
{
  "nodes": [
    {
      "id": "node1",
      "name": "node1",
      "uri": "ssh://node1.example.com",
      "transport": "ssh",
      "config": {
        "user": "admin",
        "port": 22
      }
    }
  ]
}
```

**Error Responses:**

- `404 BOLT_CONFIG_MISSING`: Bolt inventory file not found
- `500 BOLT_EXECUTION_FAILED`: Failed to read inventory
- `500 BOLT_PARSE_ERROR`: Cannot parse inventory file

#### Get Node Details

Retrieve detailed information about a specific node.

**Request:**

```http
GET /api/nodes/{id}
```

**Path Parameters:**

- `id` (string, required): Node identifier (name or ID)

**Response:**

```json
{
  "node": {
    "id": "node1",
    "name": "node1",
    "uri": "ssh://node1.example.com",
    "transport": "ssh",
    "config": {
      "user": "admin",
      "port": 22
    }
  }
}
```

**Error Responses:**

- `404 INVALID_NODE_ID`: Node not found in inventory

### Facts

#### Gather Facts from Node

Trigger facts gathering for a specific node.

**Request:**

```http
POST /api/nodes/{id}/facts
```

**Path Parameters:**

- `id` (string, required): Node identifier

**Headers:**

- `X-Expert-Mode` (boolean, optional): Enable expert mode

**Response:**

```json
{
  "facts": {
    "nodeId": "node1",
    "gatheredAt": "2024-01-01T00:00:00.000Z",
    "facts": {
      "os": {
        "family": "RedHat",
        "name": "CentOS",
        "release": {
          "full": "7.9.2009",
          "major": "7"
        }
      },
      "processors": {
        "count": 4,
        "models": ["Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"]
      },
      "memory": {
        "system": {
          "total": "16.00 GiB",
          "available": "12.34 GiB"
        }
      },
      "networking": {
        "hostname": "node1.example.com",
        "interfaces": {
          "eth0": {
            "ip": "192.168.1.100"
          }
        }
      }
    },
    "command": "bolt task run facts --targets node1 --format json"
  }
}
```

**Error Responses:**

- `404 INVALID_NODE_ID`: Node not found
- `503 NODE_UNREACHABLE`: Cannot connect to node

### Commands

#### Execute Command on Node

Execute an arbitrary command on a target node. Commands are validated against a configurable whitelist
unless allow-all mode is enabled.

Returns immediately with an execution ID. Use the executions endpoint to retrieve results, or subscribe to
the streaming endpoint for real-time output.

**Request:**

```http
POST /api/nodes/{id}/command
```

**Path Parameters:**

- `id` (string, required): Node identifier

**Headers:**

- `X-Expert-Mode` (boolean, optional): Enable expert mode

**Request Body:**

```json
{
  "command": "ls -la /tmp",
  "expertMode": false
}
```

**Response:**

```json
{
  "executionId": "abc123def456",  # pragma: allowlist secret
  "status": "running",
  "message": "Command execution started"
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid request body
- `403 COMMAND_NOT_ALLOWED`: Command not in whitelist
- `404 INVALID_NODE_ID`: Node not found

**Example:**

```bash
# Start command execution
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la /tmp", "expertMode": true}'

# Response
{
  "executionId": "abc123",
  "status": "running",
  "message": "Command execution started"
}

# Get execution results
curl http://localhost:3000/api/executions/abc123

# Or stream real-time output
curl http://localhost:3000/api/executions/abc123/stream
```

### Tasks

#### List Available Tasks

Retrieve all available Bolt tasks from the modules directory.

**Request:**

```http
GET /api/tasks
```

**Response:**

```json
{
  "tasks": [
    {
      "name": "psick::puppet_agent",
      "module": "psick",
      "description": "Run Puppet agent",
      "parameters": [
        {
          "name": "noop",
          "type": "Boolean",
          "description": "Enable noop mode",
          "required": false,
          "default": false
        }
      ],
      "modulePath": "/path/to/modules/psick"
    }
  ]
}
```

#### List Tasks Grouped by Module

Retrieve all available Bolt tasks organized by module name.

**Request:**

```http
GET /api/tasks/by-module
```

**Response:**

```json
{
  "tasksByModule": {
    "psick": [
      {
        "name": "psick::puppet_agent",
        "module": "psick",
        "description": "Run Puppet agent",
        "parameters": [],
        "modulePath": "/path/to/modules/psick"
      }
    ],
    "tp": [
      {
        "name": "tp::install",
        "module": "tp",
        "description": "Install package via Tiny Puppet",
        "parameters": [],
        "modulePath": "/path/to/modules/tp"
      }
    ]
  }
}
```

#### Execute Task on Node

Execute a Bolt task on a target node with optional parameters.

Returns immediately with an execution ID. Use the executions endpoint to retrieve results, or subscribe to
the streaming endpoint for real-time output.

**Request:**

```http
POST /api/nodes/{id}/task
```

**Path Parameters:**

- `id` (string, required): Node identifier

**Headers:**

- `X-Expert-Mode` (boolean, optional): Enable expert mode

**Request Body:**

```json
{
  "taskName": "psick::puppet_agent",
  "parameters": {
    "noop": true,
    "tags": "webserver,database"
  },
  "expertMode": false
}
```

**Response:**

```json
{
  "executionId": "def456ghi789",
  "status": "running",
  "message": "Task execution started"
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid request body
- `404 INVALID_NODE_ID`: Node not found
- `404 INVALID_TASK_NAME`: Task not found

### Puppet

#### Execute Puppet Run on Node

Trigger a Puppet agent run on a target node with configurable options. This executes the
`psick::puppet_agent` task with the specified configuration.

Returns immediately with an execution ID. Use the executions endpoint to retrieve results, or subscribe to
the streaming endpoint for real-time output.

**Request:**

```http
POST /api/nodes/{id}/puppet-run
```

**Path Parameters:**

- `id` (string, required): Node identifier

**Headers:**

- `X-Expert-Mode` (boolean, optional): Enable expert mode

**Request Body:**

```json
{
  "tags": ["webserver", "database"],
  "environment": "production",
  "noop": false,
  "noNoop": false,
  "debug": false,
  "expertMode": false
}
```

**Response:**

```json
{
  "executionId": "ghi789jkl012",
  "status": "running",
  "message": "Puppet run started"
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid request body
- `404 INVALID_NODE_ID`: Node not found

**Example:**

```bash
# Trigger Puppet run with noop mode
curl -X POST http://localhost:3000/api/nodes/node1/puppet-run \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["webserver"],
    "environment": "production",
    "noop": true,
    "expertMode": true
  }'
```

### Packages

#### Get Available Package Installation Tasks

Retrieve configured package installation tasks.

**Request:**

```http
GET /api/package-tasks
```

**Response:**

```json
{
  "tasks": [
    {
      "name": "tp::install",
      "label": "Tiny Puppet",
      "parameterMapping": {
        "packageName": "app",
        "ensure": "ensure",
        "version": "version",
        "settings": "settings"
      }
    }
  ]
}
```

#### Install Package on Node

Install a package on a target node using a configured package installation task.

Returns immediately with an execution ID. Use the executions endpoint to retrieve results, or subscribe to
the streaming endpoint for real-time output.

**Request:**

```http
POST /api/nodes/{id}/install-package
```

**Path Parameters:**

- `id` (string, required): Node identifier

**Headers:**

- `X-Expert-Mode` (boolean, optional): Enable expert mode

**Request Body:**

```json
{
  "taskName": "tp::install",
  "packageName": "nginx",
  "ensure": "present",
  "version": "1.18.0",
  "settings": {
    "repo": "epel"
  },
  "expertMode": false
}
```

**Response:**

```json
{
  "executionId": "jkl012mno345",
  "status": "running",
  "message": "Package installation started"
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid request body
- `400 INVALID_TASK`: Task not configured
- `404 INVALID_NODE_ID`: Node not found

**Example:**

```bash
# Install nginx package
curl -X POST http://localhost:3000/api/nodes/node1/install-package \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "tp::install",
    "packageName": "nginx",
    "ensure": "latest"
  }'
```

### Executions

#### List Execution History

Retrieve paginated list of executions with optional filtering. Includes summary statistics by status.

**Request:**

```http
GET /api/executions?type=command&status=success&page=1&pageSize=50
```

**Query Parameters:**

- `type` (string, optional): Filter by execution type (`command`, `task`, `facts`)
- `status` (string, optional): Filter by status (`running`, `success`, `failed`, `partial`)
- `targetNode` (string, optional): Filter by target node ID
- `startDate` (string, optional): Filter by start date (ISO 8601)
- `endDate` (string, optional): Filter by end date (ISO 8601)
- `page` (integer, optional): Page number (default: 1)
- `pageSize` (integer, optional): Items per page (default: 50, max: 100)

**Response:**

```json
{
  "executions": [
    {
      "id": "abc123",
      "type": "command",
      "targetNodes": ["node1"],
      "action": "ls -la /tmp",
      "status": "success",
      "startedAt": "2024-01-01T00:00:00.000Z",
      "completedAt": "2024-01-01T00:00:05.000Z",
      "results": [
        {
          "nodeId": "node1",
          "status": "success",
          "output": {
            "stdout": "total 48\ndrwxr-xr-x...",
            "stderr": "",
            "exitCode": 0
          },
          "duration": 1234
        }
      ],
      "command": "bolt command run 'ls -la /tmp' --targets node1 --format json",
      "expertMode": true
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "hasMore": false
  },
  "summary": {
    "running": 2,
    "success": 145,
    "failed": 8,
    "partial": 1
  }
}
```

**Error Responses:**

- `400 INVALID_REQUEST`: Invalid query parameters

#### Get Execution Details

Retrieve detailed results for a specific execution.

**Request:**

```http
GET /api/executions/{id}
```

**Path Parameters:**

- `id` (string, required): Execution ID

**Response:**

```json
{
  "execution": {
    "id": "abc123",
    "type": "command",
    "targetNodes": ["node1"],
    "action": "ls -la /tmp",
    "status": "success",
    "startedAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:00:05.000Z",
    "results": [
      {
        "nodeId": "node1",
        "status": "success",
        "output": {
          "stdout": "total 48\ndrwxr-xr-x...",
          "stderr": "",
          "exitCode": 0
        },
        "duration": 1234
      }
    ],
    "command": "bolt command run 'ls -la /tmp' --targets node1 --format json"
  }
}
```

**Error Responses:**

- `404 EXECUTION_NOT_FOUND`: Execution not found

### Streaming

#### Stream Execution Output

Subscribe to real-time execution output via Server-Sent Events (SSE).

This endpoint establishes a persistent connection and streams execution events as they occur. The connection
remains open until the execution completes or the client disconnects.

**Request:**

```http
GET /api/executions/{id}/stream
```

**Path Parameters:**

- `id` (string, required): Execution ID

**Response:**

The response is a Server-Sent Events (SSE) stream with the following event types:

##### Event: start

```text
event: start
data: {"executionId":"abc123","timestamp":"2024-01-01T00:00:00.000Z"}
```

##### Event: command

```text
event: command
data: {"command":"bolt command run 'ls -la' --targets node1 --format json"}
```

##### Event: stdout

```text
event: stdout
data: {"chunk":"total 48\ndrwxr-xr-x  12 user  staff   384 Jan  1 00:00 .\n"}
```

##### Event: stderr

```text
event: stderr
data: {"chunk":"Warning: some warning message\n"}
```

##### Event: status

```text
event: status
data: {"status":"running"}
```

##### Event: complete

```text
event: complete
data: {"status":"success","results":[{"nodeId":"node1","status":"success","duration":1234}]}
```

##### Event: error

```text
event: error
data: {"error":"Connection timeout"}
```

**Error Responses:**

- `404 EXECUTION_NOT_FOUND`: Execution not found

**Example (JavaScript):**

```javascript
const eventSource = new EventSource('/api/executions/abc123/stream');

eventSource.addEventListener('command', (event) => {
  const data = JSON.parse(event.data);
  console.log('Command:', data.command);
});

eventSource.addEventListener('stdout', (event) => {
  const data = JSON.parse(event.data);
  console.log('Output:', data.chunk);
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('Completed:', data.status);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
  eventSource.close();
});
```

**Example (curl):**

```bash
curl -N http://localhost:3000/api/executions/abc123/stream
```

#### Get Streaming Statistics

Retrieve statistics about active streaming connections.

**Request:**

```http
GET /api/streaming/stats
```

**Response:**

```json
{
  "activeExecutions": 3
}
```

## Common Workflows

### Execute a Command

1. **Start command execution:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -d '{"command": "uptime", "expertMode": true}'
```

Response:

```json
{
  "executionId": "abc123",
  "status": "running",
  "message": "Command execution started"
}
```

1. **Stream real-time output (optional):**

```bash
curl -N http://localhost:3000/api/executions/abc123/stream
```

1. **Get execution results:**

```bash
curl http://localhost:3000/api/executions/abc123
```

### Execute a Task

1. **List available tasks:**

```bash
curl http://localhost:3000/api/tasks/by-module
```

1. **Start task execution:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/task \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "psick::puppet_agent",
    "parameters": {
      "noop": true,
      "tags": "webserver"
    },
    "expertMode": true
  }'
```

1. **Monitor execution:**

```bash
curl http://localhost:3000/api/executions/def456
```

### Run Puppet

1. **Trigger Puppet run:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/puppet-run \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["webserver", "database"],
    "environment": "production",
    "noop": false,
    "debug": true,
    "expertMode": true
  }'
```

1. **Stream Puppet output:**

```bash
curl -N http://localhost:3000/api/executions/ghi789/stream
```

1. **View results:**

```bash
curl http://localhost:3000/api/executions/ghi789
```

### Install a Package

1. **Get available package tasks:**

```bash
curl http://localhost:3000/api/package-tasks
```

1. **Install package:**

```bash
curl -X POST http://localhost:3000/api/nodes/node1/install-package \
  -H "Content-Type: application/json" \
  -d '{
    "taskName": "tp::install",
    "packageName": "nginx",
    "ensure": "latest",
    "expertMode": true
  }'
```

1. **Monitor installation:**

```bash
curl http://localhost:3000/api/executions/jkl012
```

### View Execution History

1. **List recent executions:**

```bash
curl "http://localhost:3000/api/executions?page=1&pageSize=20"
```

1. **Filter by status:**

```bash
curl "http://localhost:3000/api/executions?status=failed&page=1"
```

1. **Filter by node:**

```bash
curl "http://localhost:3000/api/executions?targetNode=node1"
```

1. **Filter by date range:**

```bash
curl "http://localhost:3000/api/executions?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z"
```

## Rate Limiting

Version 0.1.0 does not implement rate limiting. This will be added in future versions.

## Pagination

Endpoints that return lists support pagination via query parameters:

- `page`: Page number (1-indexed, default: 1)
- `pageSize`: Number of items per page (default: 50, max: 100)

Paginated responses include a `pagination` object:

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "hasMore": true
  }
}
```

## Timeouts

All Bolt executions are subject to a configurable timeout (default: 5 minutes). If an execution exceeds
the timeout, it will be terminated and marked as failed with a `BOLT_TIMEOUT` error.

## WebSocket Support

Version 0.1.0 uses Server-Sent Events (SSE) for real-time streaming. WebSocket support may be added in
future versions.

## Versioning

The API version is included in the response headers:

```text
X-API-Version: 0.1.0
```

Future versions will maintain backward compatibility or provide versioned endpoints.

## Integration Endpoints

Version 0.3.0 adds comprehensive integration support. For complete documentation of integration-specific endpoints, see:

### PuppetDB Integration

- **Inventory**: `/api/integrations/puppetdb/nodes`
- **Facts**: `/api/integrations/puppetdb/nodes/:certname/facts`
- **Reports**: `/api/integrations/puppetdb/nodes/:certname/reports`
- **Catalogs**: `/api/integrations/puppetdb/nodes/:certname/catalog`
- **Events**: `/api/integrations/puppetdb/nodes/:certname/events`
- **Resources**: `/api/integrations/puppetdb/nodes/:certname/resources`
- **Admin**: `/api/integrations/puppetdb/admin/*`

See [Integrations API Documentation](./integrations-api.md#puppetdb-integration) for details.

### Puppetserver Integration

- **Certificates**: `/api/integrations/puppetserver/certificates`
- **Nodes**: `/api/integrations/puppetserver/nodes`
- **Status**: `/api/integrations/puppetserver/nodes/:certname/status`
- **Facts**: `/api/integrations/puppetserver/nodes/:certname/facts`
- **Catalogs**: `/api/integrations/puppetserver/catalog/:certname/:environment`
- **Environments**: `/api/integrations/puppetserver/environments`
- **Status & Metrics**: `/api/integrations/puppetserver/status/*`

See [Integrations API Documentation](./integrations-api.md#puppetserver-integration) for details.

### Integration Status

Check the health and connectivity of all integrations:

```http
GET /api/integrations/status
```

Returns status for Bolt, PuppetDB, and Puppetserver integrations.

## Support

For issues, questions, or feature requests, please refer to the project documentation or contact the development team.
