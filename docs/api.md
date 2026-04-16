# API Reference

All endpoints return JSON. Base URL: `http://<host>:<port>` (default `http://localhost:3000`).

## Authentication

When `AUTH_ENABLED=true`, most endpoints require a JWT token in the `Authorization: Bearer <token>` header. PuppetDB endpoints additionally accept a PuppetDB token via `X-Authentication-Token`.

## Common Headers

| Header | Description |
|---|---|
| `Authorization: Bearer <token>` | JWT auth (required when auth enabled) |
| `X-Expert-Mode: true` | Add diagnostics to all responses (stack traces, raw output, request IDs) |
| `X-Authentication-Token` | PuppetDB auth token (PuppetDB endpoints) |
| `Content-Type: application/json` | Required for POST requests with a body |

## Error Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": "Additional context"
  }
}
```

Common error codes: `COMMAND_NOT_WHITELISTED`, `INTEGRATION_NOT_AVAILABLE`, `NODE_NOT_FOUND`, `VALIDATION_ERROR`, `DESTRUCTIVE_ACTION_DISABLED`, `UNAUTHORIZED`.

## Common Query Parameters

| Parameter | Description | Applies to |
|---|---|---|
| `limit` | Max items to return | List endpoints |
| `offset` | Pagination offset | List endpoints |
| `page` | Page number | Execution history, Hiera |
| `pageSize` | Items per page | Execution history, Hiera |
| `status` | Filter by status | Executions, reports, events |
| `type` | Filter by type | Executions |
| `sources` | Comma-separated source names | Inventory |
| `sortBy` / `sortOrder` | Sort field and direction (`asc`/`desc`) | Inventory |
| `days` | Days to look back (1–365, default 7) | Puppet run history |
| `refresh` | `true` to bypass cache | Integration status |

---

## System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Application configuration |
| `GET` | `/api/config/ui` | UI-specific configuration |

---

## Integrations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/status` | Health status of all plugins |
| `GET` | `/api/integrations/colors` | Integration color palette |
| `GET` | `/api/integrations/provisioning` | List provisioning integrations and capabilities |

---

## Inventory

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/inventory` | All nodes from all enabled sources, linked |
| `GET` | `/api/inventory/sources` | Available inventory sources |
| `GET` | `/api/nodes/:id` | Node details |

**`GET /api/inventory` query params:**

| Param | Description |
|---|---|
| `sources` | Filter by source name (comma-separated) |
| `pql` | PuppetDB PQL query for filtering |
| `sortBy` | Sort field |
| `sortOrder` | `asc` or `desc` |

---

## Facts

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/nodes/:id/facts` | Gather facts for node from all enabled sources |

Response includes facts keyed by source name:

```json
{
  "bolt": { "os": { "family": "Debian" } },
  "puppetdb": { "os": { "family": "Debian", "name": "Ubuntu" } }
}
```

---

## Commands

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/nodes/:id/command` | Execute shell command on node |

**Request body:**

```json
{
  "command": "uptime",
  "tool": "bolt"
}
```

`tool` is optional when only one execution tool is available.

---

## Tasks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List available Bolt tasks |
| `GET` | `/api/tasks/by-module` | Tasks grouped by module |
| `POST` | `/api/nodes/:id/task` | Execute Bolt task on node |

**Request body (`POST /api/nodes/:id/task`):**

```json
{
  "task": "psick::puppet_agent",
  "parameters": { "noop": true, "tags": "web" }
}
```

---

## Puppet

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/nodes/:id/puppet-run` | Run `puppet agent` on node |

**Request body:**

```json
{
  "tags": "web,ssl",
  "environment": "production",
  "noop": true,
  "noNoop": false,
  "debug": false
}
```

All fields are optional.

---

## Puppet Run History

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/puppet/nodes/:id/history` | Run history for a node |
| `GET` | `/api/puppet/history` | Aggregated run history for all nodes |

Query param: `days` (default 7, max 365).

**Response (`/api/puppet/nodes/:id/history`):**

```json
{
  "nodeId": "web-01.example.com",
  "history": [
    { "date": "2026-04-16", "success": 3, "failed": 0, "changed": 2, "unchanged": 1 }
  ],
  "summary": {
    "totalRuns": 21,
    "successRate": 95.24,
    "avgDuration": 45.3,
    "lastRun": "2026-04-16T10:00:00.000Z"
  }
}
```

---

## Packages

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/package-tasks` | List configured package tasks |
| `POST` | `/api/nodes/:id/install-package` | Install package on node |

**Request body:**

```json
{
  "taskName": "package",
  "packageName": "nginx",
  "version": "",
  "ensure": "present",
  "settings": {}
}
```

---

## Executions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/executions` | Execution history |
| `GET` | `/api/executions/:id` | Execution details |
| `GET` | `/api/executions/:id/output` | Full execution output |
| `GET` | `/api/executions/:id/stream` | Stream execution output (SSE) |
| `POST` | `/api/executions/:id/re-execute` | Re-run an execution |
| `GET` | `/api/executions/:id/original` | Get the original execution for a re-run |
| `GET` | `/api/executions/:id/re-executions` | All re-runs of an execution |
| `POST` | `/api/executions/:id/cancel` | Cancel a running execution |
| `GET` | `/api/executions/queue/status` | Execution queue status |
| `GET` | `/api/streaming/stats` | Streaming server stats |

**`GET /api/executions` query params:**

| Param | Description |
|---|---|
| `status` | `success` / `failed` / `running` / `partial` |
| `type` | `command` / `task` / `puppet-run` / `package` / `facts` |
| `targetNode` | Filter by node name |
| `page` | Page number |
| `pageSize` | Items per page |

**SSE stream (`GET /api/executions/:id/stream`):** Returns `text/event-stream`. Events have `type` (`output` / `status` / `complete` / `error`) and JSON data.

---

## Playbooks (Ansible)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/playbooks` | List available Ansible playbooks |
| `POST` | `/api/nodes/:id/playbook` | Run an Ansible playbook on node |

---

## Hiera

All Hiera endpoints require `HIERA_ENABLED=true`.

### Status

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/hiera/status` | Integration status |
| `POST` | `/api/integrations/hiera/reload` | Reload control repository |

### Key Discovery

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/hiera/keys` | All discovered keys |
| `GET` | `/api/integrations/hiera/keys/search` | Search keys (query param: `q`) |
| `GET` | `/api/integrations/hiera/keys/:key` | Details for a specific key |
| `GET` | `/api/integrations/hiera/keys/:key/nodes` | Key values across all nodes |

### Node Data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/hiera/nodes/:nodeId/data` | All Hiera data for a node |
| `GET` | `/api/integrations/hiera/nodes/:nodeId/keys` | All keys for a node |
| `GET` | `/api/integrations/hiera/nodes/:nodeId/keys/:key` | Resolve a key for a node |

Query param for node data: `filter` (`used` / `unused` / `all`).

### Code Analysis

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/hiera/analysis` | Full code analysis results |
| `GET` | `/api/integrations/hiera/analysis/unused` | Unused code report |
| `GET` | `/api/integrations/hiera/analysis/lint` | Lint issues |
| `GET` | `/api/integrations/hiera/analysis/modules` | Module update info |
| `GET` | `/api/integrations/hiera/analysis/statistics` | Usage statistics |

Lint params: `severity` (comma-separated), `types` (comma-separated).

---

## PuppetDB

All PuppetDB endpoints require `PUPPETDB_ENABLED=true`. Pass `X-Authentication-Token` for PE environments.

### Nodes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetdb/nodes` | List nodes |
| `GET` | `/api/integrations/puppetdb/nodes/:certname` | Node details |
| `GET` | `/api/integrations/puppetdb/nodes/:certname/facts` | Node facts |

Query param: `query` (PQL expression).

### Reports

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetdb/reports` | All reports |
| `GET` | `/api/integrations/puppetdb/reports/summary` | Reports summary |
| `GET` | `/api/integrations/puppetdb/nodes/:certname/reports` | Reports for a node |
| `GET` | `/api/integrations/puppetdb/nodes/:certname/reports/:hash` | Report details |

Node report query params: `status`, `days`, `environment`, `minDuration`, `minCompileTime`, `minTotalResources`.

### Catalogs and Resources

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetdb/nodes/:certname/catalog` | Node catalog |
| `GET` | `/api/integrations/puppetdb/nodes/:certname/resources` | Node resources |
| `GET` | `/api/integrations/puppetdb/nodes/:certname/events` | Node events |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetdb/admin/summary-stats` | Summary statistics |

---

## Puppetserver

All Puppetserver endpoints require `PUPPETSERVER_ENABLED=true`. Auth uses client certificates configured via `PUPPETSERVER_SSL_*` env vars.

### Nodes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetserver/nodes` | List nodes |
| `GET` | `/api/integrations/puppetserver/nodes/:certname` | Node details |
| `GET` | `/api/integrations/puppetserver/nodes/:certname/status` | Node check-in status |
| `GET` | `/api/integrations/puppetserver/nodes/:certname/facts` | Node facts |

### Catalogs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetserver/catalog/:certname/:environment` | Compile catalog |
| `POST` | `/api/integrations/puppetserver/catalog/compare` | Compare catalogs across environments |

### Environments

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetserver/environments` | List environments |
| `GET` | `/api/integrations/puppetserver/environments/:name` | Environment details |
| `POST` | `/api/integrations/puppetserver/environments/:name/deploy` | Deploy environment |
| `DELETE` | `/api/integrations/puppetserver/environments/:name/cache` | Flush environment cache |

### Status and Metrics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/puppetserver/status/services` | Service status |
| `GET` | `/api/integrations/puppetserver/status/simple` | Simple status |
| `GET` | `/api/integrations/puppetserver/metrics` | JVM and service metrics |

---

## Provisioning (Proxmox and AWS)

Require `PROXMOX_ENABLED=true` or `AWS_ENABLED=true`. Destructive actions (destroy/terminate) additionally require `ALLOW_DESTRUCTIVE_PROVISIONING=true` or return `403 DESTRUCTIVE_ACTION_DISABLED`.

### Proxmox

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/proxmox/nodes` | List Proxmox nodes |
| `GET` | `/api/integrations/proxmox/vms` | List VMs |
| `GET` | `/api/integrations/proxmox/containers` | List LXC containers |
| `POST` | `/api/integrations/proxmox/vms` | Create VM |
| `POST` | `/api/integrations/proxmox/containers` | Create LXC container |
| `POST` | `/api/integrations/proxmox/vms/:id/action` | VM lifecycle action |
| `POST` | `/api/integrations/proxmox/containers/:id/action` | Container lifecycle action |
| `DELETE` | `/api/integrations/proxmox/vms/:id` | Destroy VM *(destructive)* |
| `DELETE` | `/api/integrations/proxmox/containers/:id` | Destroy container *(destructive)* |

Lifecycle actions: `start`, `stop`, `shutdown`, `reboot`.

### AWS

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/aws/instances` | List EC2 instances across regions |
| `POST` | `/api/integrations/aws/instances` | Launch new instance |
| `POST` | `/api/integrations/aws/instances/:id/action` | Instance lifecycle action |
| `DELETE` | `/api/integrations/aws/instances/:id` | Terminate instance *(destructive)* |

Lifecycle actions: `start`, `stop`, `reboot`.

---

## RBAC

Require `AUTH_ENABLED=true`. All endpoints require JWT auth and appropriate RBAC permissions.

### Users

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users` | Create user |
| `GET` | `/api/users` | List users |
| `GET` | `/api/users/:id` | Get user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |
| `POST` | `/api/users/:id/roles` | Assign role to user |
| `DELETE` | `/api/users/:id/roles/:roleId` | Remove role from user |
| `POST` | `/api/users/login` | Authenticate and get JWT |
| `DELETE` | `/api/users/:id/sessions` | Revoke user sessions |

### Roles

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/roles` | Create role |
| `GET` | `/api/roles` | List roles |
| `GET` | `/api/roles/:id` | Get role |
| `PUT` | `/api/roles/:id` | Update role |
| `DELETE` | `/api/roles/:id` | Delete role |
| `POST` | `/api/roles/:id/permissions` | Assign permission to role |
| `DELETE` | `/api/roles/:id/permissions/:permId` | Remove permission from role |

### Permissions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/permissions` | Create permission |
| `GET` | `/api/permissions` | List permissions |

### Groups

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/groups` | Create group |
| `GET` | `/api/groups` | List groups |
| `GET` | `/api/groups/:id` | Get group |
| `PUT` | `/api/groups/:id` | Update group |
| `DELETE` | `/api/groups/:id` | Delete group |
| `POST` | `/api/groups/:id/users` | Add user to group |
| `DELETE` | `/api/groups/:id/users/:userId` | Remove user from group |

---

## Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Current user info |

---

## Debug

Used internally by the frontend for expert mode log collection.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/debug/frontend-logs` | Submit frontend log batch |
| `GET` | `/api/debug/frontend-logs` | List stored correlation IDs |
| `GET` | `/api/debug/frontend-logs/:correlationId` | Get logs by correlation ID |
| `DELETE` | `/api/debug/frontend-logs/:correlationId` | Clear logs for correlation ID |
| `DELETE` | `/api/debug/frontend-logs` | Clear all frontend logs |

---

## Setup

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/setup/status` | Setup completion status |
| `POST` | `/api/setup/complete` | Mark setup as complete |

---

## Monitoring

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/monitoring/metrics` | Performance metrics (memory, CPU, uptime) |
| `GET` | `/api/monitoring/journal` | System journal entries |
