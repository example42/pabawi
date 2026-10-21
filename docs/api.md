# API Reference

Most endpoints return JSON; streaming endpoints return SSE and SSO navigation returns redirects. Base URL: `http://<host>:<port>` (default `http://localhost:3000`).

## Authentication

Infrastructure endpoints require a JWT in `Authorization: Bearer <token>` and
the relevant RBAC permissions. `AUTH_ENABLED` does not disable these checks.
Upstream PuppetDB credentials are configured on the server; they do not
substitute for caller authentication.

`GET /api/auth/permissions` requires caller authentication and returns that
caller's current effective grants as `{"permissions":[{"resource":"aws","action":"read"}]}`.
The response is not cached. It does not accept a target user ID.
See [permissions and RBAC](permissions-rbac.md) for route policies.

Public REST exceptions are `GET /api/health`, `GET /api/setup/status`,
`GET /api/auth/providers`, and the login, registration and refresh exchanges.
Registration is conditional on the stored self-registration setting. Initial
setup requires `X-Pabawi-Bootstrap-Token`. Entra login/callback/token exchanges use
browser-bound OAuth state and single-use codes; enrollment requires an access
JWT plus `rbac:admin` and `users:admin`. Refresh tokens work only at the refresh
exchange. Generic inventory lifecycle requests also accept the scoped machine
credential described below. `/mcp` has its own [authentication policy](mcp.md).

Access and refresh JWTs carry signed `authContext`: `{ "provider": "local", "identityId": null }`
or `{ "provider": "entra-id", "identityId": "<federated-identity-id>" }`, or
`{ "provider": "ldap", "identityId": "<federated-identity-id>", "directoryId": "<configured-directory>" }`. The server checks local
authentication scope or exact identity ownership on issuance, verification and rotation.
Refresh preserves the authenticating identity even for an account enrolled in multiple providers.
Migration 032 intentionally invalidates existing account sessions, console credentials and pending
OAuth state/code exchanges once. Users must sign in again; legacy tokens without context are rejected.
LDAP sessions require current directory eligibility and at least one explicit role. Successful directory reads
remain usable for at most `LDAP_REVALIDATION_INTERVAL_SECONDS` from their start; every refresh forces a new
check, coalescing only overlapping work. REST, execution/journal SSE, MCP and console websockets use the same
eligibility boundary. Transient failures preserve grants and tokens but block stale access; recovery permits
valid tokens to resume. Confirmed ineligibility or loss of every role revokes existing LDAP sessions permanently.
Migration 034 preserves console rows and adds their exact authentication context. Legacy console rows lacking
that context cannot upgrade. Local and Entra sessions do not depend on directory availability.

The [OpenAPI contract](openapi.yaml) describes the REST subset tracked by
[contract coverage](api-contract-coverage.md), including intentional omissions.

## Common Headers

| Header | Description |
|---|---|
| `Authorization: Bearer <token>` | JWT caller authentication |
| `X-Expert-Mode: true` | Add diagnostics to all responses (stack traces, raw output, request IDs) |
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
| `days` | Days to look back (1-365, default 7) | Puppet run history |
| `refresh` | `true` to bypass cache | Integration status |

---

## System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Application configuration |
| `GET` | `/api/config/ui` | UI-specific configuration |

`GET /api/config` returns the command-whitelist policy (`allowAll`, `matchMode`,
`whitelist`) only to callers holding `bolt:execute`; other authenticated users
receive `executionTimeout` only.

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
| `GET` | `/api/inventory/:id` | Node details |

**`GET /api/inventory` query params:**

| Param | Description |
|---|---|
| `sources` | Filter by source name (comma-separated) |
| `pql` | PuppetDB PQL query for filtering |
| `sortBy` | Sort field |
| `sortOrder` | `asc` or `desc` |

### Generic lifecycle

Provider-agnostic lifecycle endpoints. The provider is resolved from the node
ID prefix (`proxmox:`, `aws:`, `azure:`); any other prefix is rejected with
`UNSUPPORTED_PROVIDER`.

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/inventory/:id/lifecycle-actions` | Actions the node's provider advertises | `<provider>:read` |
| `POST` | `/api/inventory/:id/action` | Execute a lifecycle action | `<provider>:read` plus the action's class |
| `DELETE` | `/api/inventory/:id` | Destroy the node | `<provider>:read` + `<provider>:destroy` |

The permission an action requires follows its class, the same classification
the discovery endpoint uses to mark an action destructive:

| Class | Actions | Permission |
|---|---|---|
| State transition | `start`, `stop`, `shutdown`, `reboot`, `restart`, `suspend`, `resume`, `deallocate`, `snapshot` | `<provider>:lifecycle` |
| Creation | `provision`, `create_vm`, `create_lxc`, `create_instance` | `<provider>:provision` |
| Removal | `destroy`, `destroy_vm`, `destroy_lxc`, `terminate`, `terminate_instance` | `<provider>:destroy` |

An action the provider does not advertise is rejected with `UNSUPPORTED_ACTION`
(400), and `DELETE` on a provider with no destroy capability (Azure) returns
`DESTROY_NOT_SUPPORTED` (501). Destructive actions are rejected with
`DESTRUCTIVE_ACTION_DISABLED` (403) when `ALLOW_DESTRUCTIVE_PROVISIONING=false`.

**Request body (`POST /api/inventory/:id/action`):**

```json
{
  "action": "stop",
  "parameters": {}
}
```

**Credentials.** Either a user JWT, or: when `PABAWI_LIFECYCLE_TOKEN` is
configured: that token, in the same `Authorization: Bearer` header:

```bash
curl -X POST https://pabawi.example.com/api/inventory/aws:eu-west-1:i-0abc/action \
  -H "Authorization: Bearer $PABAWI_LIFECYCLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"stop"}'
```

The token authenticates as the built-in `lifecycle-service` account and is then
authorized like any other caller. It is accepted on `/api/inventory` only, and
its "Lifecycle Service" role holds `read`, `lifecycle` and `destroy` on
`proxmox`, `aws` and `azure`; grant or revoke permissions on that role to
change its scope. It stops working as soon as the account is deactivated.

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
| `POST` | `/api/puppet-run` | Run `puppet agent` across several nodes |

The multi-node route takes the same options plus a required `targetNodeIds`
array, answers HTTP 202 with one `executionIds` entry per node, and accepts
`Idempotency-Key` (see [request idempotency](#request-idempotency)). Its records
are persisted together before any provider work starts.

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
| `GET` | `/api/packages/package-tasks` | List configured package tasks |
| `POST` | `/api/packages/:id/install-package` | Install package on node |

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
| `POST` | `/api/executions/batch` | Run an action across multiple nodes / groups |
| `GET` | `/api/executions/batch/:batchId` | Batch execution status |
| `POST` | `/api/executions/batch/:batchId/cancel` | Cancel a batch execution |
| `GET` | `/api/executions/queue/status` | Execution queue status |
| `GET` | `/api/streaming/stats` | Streaming server stats |
| `POST` | `/api/executions/:id/stream-ticket` | Single-use ticket for the SSE stream |

**Authorization:** the command-executing / mutating routes
(`/batch`, `/:id/re-execute`, `/:id/cancel`, `/batch/:batchId/cancel`) require
the `bolt:execute` permission. Command-type requests are validated against the
[command whitelist](configuration.md#command-whitelist): shell metacharacters
are always rejected. The read-only `GET` routes require authentication only.

### Streaming execution output

`GET /api/executions/:id/stream` is a Server-Sent Events endpoint. An
`EventSource` cannot set headers, so authenticate it with a single-use ticket:
`POST /api/executions/:id/stream-ticket` returns `{ "ticket": "..." }`, valid
for 30 seconds, bound to that one execution and to the stream route, and spent
by the first request that redeems it. The ticket is resolved into an
`Authorization` header before any `/api/executions` chain authenticates.

Event types are `start`, `command`, `stdout`, `stderr`, `status`, `complete` and
`error`. Output is coalesced and flushed within `STREAMING_BUFFER_MS` of the
first buffered chunk, so continuously producing runs stream while they run
rather than at the end.

A `complete` event carries the run's own terminal status
(`success` / `failed` / `partial` / `cancelled` / `interrupted`) in its payload:
a completed stream is not a successful run, and a client must display the
reported status rather than assume success. Subscribing to an execution that has
already reached any of those statuses replays its `complete` event at once. An
`error` event means the stream itself failed, not that the run did.

`GET /api/streaming/stats` reports `activeExecutions` (executions with at least
one subscriber), `retainedState` (executions still holding output buffers or
counters) and `trackedConnections` (connections counted against the per-client
limit). All three fall back to zero as executions finish; either of the latter
two climbing indicates streams whose state or connection slot is not being
released.

**`GET /api/executions` query params:**

| Param | Description |
|---|---|
| `status` | `queued` / `running` / `success` / `failed` / `partial` / `cancelled` / `interrupted` |
| `type` | `command` / `task` / `puppet-run` / `package` / `facts` |
| `targetNode` | Filter by node name |
| `page` | Page number |
| `pageSize` | Items per page |

**SSE stream (`GET /api/executions/:id/stream`):** Returns `text/event-stream`. Events have `type` (`output` / `status` / `complete` / `error`) and JSON data.

**Batch lifecycle:** `POST /api/executions/batch` reserves capacity for the entire
batch and atomically persists the parent and all children before dispatching any
provider action. HTTP 201 returns stable IDs without waiting for execution slots
or provider completion. An oversized batch receives HTTP 429 without creating
records or contacting providers. Children record the submitting user and tool.
`createdAt` records admission; `startedAt` is absent until dispatch. History sorts
and date filters use creation time, including work cancelled before dispatch.

Batch cancellation, including `POST /api/executions/:id/cancel` for a batch child,
returns `cancelledCount` for queued work and `runningCount` for dispatched work.
Queued targets are removed from dispatch. Current execution plugins do not expose
an abort contract, so running targets continue and retain their real outcomes.
`cancellationRequestedAt` remains present after completion. Poll until the batch
is terminal; a cancellation response does not mean running work has stopped.
The status filter limits returned children, while batch counts and progress still
cover every target. Terminal progress includes cancelled and interrupted targets.

Direct commands, tasks, playbooks, packages and Puppet runs share the batch queue.
They return HTTP 202 with `status: "queued"`; exhausted capacity returns HTTP 503
without durable work. All multi-node Puppet records commit together. Direct
cancellation has the same `cancelledCount`, `runningCount` and
`cancellationRequestedAt` contract as batch cancellation. `POST
/api/executions/:id/re-execute` now admits and dispatches work through the same
owner, preserves provider-specific parameters and records the current caller.
It accepts one target; use batch admission for multiple targets. Provider exceptions
produce `interrupted`, since transport failure cannot establish the remote outcome.

Recovery supports one application process. Shutdown stops admission; shutdown and
startup reconciliation mark undispatched batch work `cancelled` and dispatched
work with an unknown outcome `interrupted`. Neither is automatically replayed.
Graceful shutdown drains direct and batch workers before closing storage and
preserves provider results that settle. Verify provider state before retrying
interrupted work. Multi-process ownership is separately scoped.

### Request idempotency

`POST /api/executions/batch` and `POST /api/puppet-run` accept an optional
`Idempotency-Key` request header, so a client that loses an admission response
can resend the submission instead of guessing whether the work started.

| Aspect | Behaviour |
|---|---|
| Header | `Idempotency-Key`: printable ASCII, no whitespace, 1-255 characters |
| Scope | Per user and per route. One caller's key can never reach another's submission |
| Replay | The same key with the same request returns the original response and identifiers, and starts no further work |
| Conflict | The same key with a different request or route returns HTTP 409 `IDEMPOTENCY_KEY_CONFLICT` and admits nothing |
| Bad key | An unusable value returns HTTP 400 `INVALID_IDEMPOTENCY_KEY` and admits nothing |
| Retention | Startup purges keys older than 24 hours. A key stays replayable until such a purge, so a long-running process keeps its keys until the next restart |

The key and the work it admits are written in one transaction, so a failed
admission releases the key and the submission can be retried. A submission with
no key is single-shot: resending it admits a second batch or a second set of
Puppet runs. Request bodies are compared by content, so property order does not
matter, but any difference in values is a conflict rather than a replay.

Generate one key per user-initiated submission before the first attempt and reuse
it for every retry of that submission; a key regenerated per attempt provides no
protection. A fresh submission is a fresh intent and needs a fresh key. The web
UI does this for parallel command and Puppet run submissions. Other mutating
routes have no durable key, so their clients must not retry them: the built-in
API client applies no transport retry to `POST`, `PUT`, `PATCH` or `DELETE`
unless the request carries a key.

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

All PuppetDB endpoints require `PUPPETDB_ENABLED=true`. Configure `PUPPETDB_TOKEN` on the backend for PE environments; the backend sends it upstream as `X-Authentication`. Callers still send a Pabawi access JWT.

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

## Provisioning (Proxmox, AWS, and Azure)

Require `PROXMOX_ENABLED=true`, `AWS_ENABLED=true`, or `AZURE_ENABLED=true`. Destructive actions (destroy/terminate/deallocate) additionally require `ALLOW_DESTRUCTIVE_PROVISIONING=true` or return `403 DESTRUCTIVE_ACTION_DISABLED`.

### Proxmox

All routes require `proxmox:read`; mutations additionally require `provision`,
`lifecycle` or `destroy` on that resource.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/proxmox/nodes` | Cluster nodes |
| `GET` | `/api/integrations/proxmox/nextid` | Next guest ID |
| `POST` | `/api/integrations/proxmox/provision/vm` | Create VM; body includes vmid, name, node |
| `POST` | `/api/integrations/proxmox/provision/lxc` | Create LXC; body includes vmid, hostname, node, ostemplate |
| `POST` | `/api/integrations/proxmox/action` | Body contains nodeId and action |
| `DELETE` | `/api/integrations/proxmox/provision/:vmid` | Destroy guest; query requires node; dispatches destroy_vm |

Use `/api/inventory?sources=proxmox` for guest inventory. Actions are `start`,
`stop`, `shutdown`, `reboot`, `suspend`, `resume`, `snapshot`.

### AWS

All routes require `aws:read`; provision requires `aws:provision`, ordinary
lifecycle requires `aws:lifecycle`, and terminate requires `aws:destroy`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/aws/inventory` | Inventory response under inventory |
| `POST` | `/api/integrations/aws/provision` | Launch instance; body requires imageId, optional instanceType/region/name/network settings |
| `POST` | `/api/integrations/aws/lifecycle` | Body contains instanceId, action, optional region |

Actions are `start`, `stop`, `reboot`, `terminate`. Provision/lifecycle responses
wrap the provider execution under `result`.

### Azure

Requires `AZURE_ENABLED=true`. `deallocate` additionally requires `ALLOW_DESTRUCTIVE_PROVISIONING=true`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/integrations/azure/inventory` | List Azure VMs |
| `POST` | `/api/integrations/azure/provision` | Provision a new Azure VM |
| `POST` | `/api/integrations/azure/lifecycle` | VM lifecycle action |
| `POST` | `/api/integrations/azure/test` | Test Azure connection |
| `GET` | `/api/integrations/azure/locations` | List available Azure locations |
| `GET` | `/api/integrations/azure/vm-sizes` | List VM sizes for a location |
| `GET` | `/api/integrations/azure/images` | List marketplace images |
| `GET` | `/api/integrations/azure/resource-groups` | List resource groups |

**Request body (`POST /api/integrations/azure/lifecycle`):**

```json
{
  "vmName": "my-vm",
  "resourceGroup": "my-rg",
  "action": "start"
}
```

Lifecycle actions: `start`, `stop`, `restart`, `deallocate`.

**Request body (`POST /api/integrations/azure/provision`):**

```json
{
  "resourceGroup": "my-rg",
  "vmName": "my-vm",
  "location": "eastus",
  "vmSize": "Standard_B1s",
  "imageReference": {
    "publisher": "Canonical",
    "offer": "UbuntuServer",
    "sku": "18.04-LTS",
    "version": "latest"
  },
  "adminUsername": "azureuser",
  "sshPublicKey": "ssh-rsa AAAA...",
  "networkInterfaceId": "/subscriptions/.../networkInterfaces/my-nic"
}
```

**Query params (`GET /api/integrations/azure/vm-sizes`):** `location` (required).

**Query params (`GET /api/integrations/azure/images`):** `location`, `publisher`, `offer`, `sku` (all optional).

---

## Checkmk Monitoring

Requires `CHECKMK_ENABLED=true`. All endpoints require JWT auth and the `checkmk:read` RBAC permission.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/nodes/:nodeId/services` | Live service monitoring status from Checkmk |
| `GET` | `/api/nodes/:nodeId/monitoring-events` | State-change events from Checkmk |

**Query params (`GET /api/nodes/:nodeId/monitoring-events`):**

| Param | Default | Description |
|---|---|---|
| `limit` | `200` | Max events to return (1-1000) |

Normal responses are arrays. Service state is numeric (0 OK, 1 WARN, 2 CRIT,
3 UNKNOWN); stateType is 0 soft or 1 hard. lastCheck and lastStateChange are
Unix timestamps in seconds. Expert mode wraps the array in `services` or `events`
and adds `_debug`. Empty arrays do not establish whether the host exists.

History uses Livestatus when available, otherwise reduced-fidelity REST data.
See [Checkmk transport and fallback](integrations/checkmk.md#state-change-events-journal).
The overview is `GET /api/monitoring/overview`. Acknowledge and downtime use
`POST /api/monitoring/acknowledge` and `POST /api/monitoring/downtime`; the production
mount requires both `checkmk:read` and `checkmk:write`. Bodies and response shapes
are in [OpenAPI](openapi.yaml). Missing configuration returns 503
`CHECKMK_NOT_CONFIGURED`; upstream errors return 502 `UPSTREAM_ERROR`.

---

## Console (VNC / Terminal)

Browser-based interactive console sessions. Requires the `console:access`
permission; acting on another user's session additionally requires
`console:admin`. Configured through the `CONSOLE_*` settings in
[configuration](configuration.md#console-vnc--terminal).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/console/availability/:nodeId` | Console options a node offers |
| `POST` | `/api/console/sessions` | Open a console session |
| `GET` | `/api/console/sessions/:sessionId` | Session status |
| `POST` | `/api/console/sessions/:sessionId/heartbeat` | Keep a session alive |
| `DELETE` | `/api/console/sessions/:sessionId` | Terminate a session |
| `GET` | `/ws/console/vnc?token=...` | WebSocket relay (VNC transport) |
| `GET` | `/ws/console/terminal?token=...` | WebSocket relay (terminal transport) |

### Session lifecycle

`POST /api/console/sessions` takes `{ "nodeId": "...", "provider": "..." }` and
reserves capacity before the provider is asked for anything, so a provider
resource is never created for a session the concurrent limit did not count. The
reservation holds a slot while the provider works; a provider failure releases it
immediately rather than waiting for the idle timeout. Exceeding
`CONSOLE_MAX_CONCURRENT_SESSIONS` returns HTTP 429 `TOO_MANY_SESSIONS` without
contacting the provider. Concurrent requests for the last slot admit exactly one.

A successful response is HTTP 201 with the session, including a single-use
`token` and the relative `wsUrl` to upgrade against. The token is valid for 60
seconds and is consumed by the first upgrade that claims it: concurrent upgrades
admit exactly one, and a replay is refused without opening a second upstream
connection. A terminated or expired session never upgrades.

Connection material for the upstream is held in memory by the connection broker
and handed to the relay once. It is never written to the database and never
logged, because a provider's console URL embeds a live credential. The
`console_sessions.upstream_url` column is retired and always null.

### Termination

Terminating a session does three things, not only the last: it closes both ends
of a live relay, releases the provider-side session, and records the terminal
state. Owner termination, administrator termination, heartbeat expiry, account
deactivation, restart cleanup and process shutdown all do all three. A
termination that lands while the relay is still dialling its upstream closes that
upstream as soon as it opens. The heartbeat route returns HTTP 409
`SESSION_NOT_LIVE` for a session that is no longer live, and HTTP 403 for a
session belonging to another user without `console:admin`.

Console sessions are process-local: the relay, its connection material and its
sockets live in the process that accepted the upgrade. The supported baseline
remains a single backend process.

> **Not yet validated against a real provider.** The session lifecycle, ticket
> claim and termination behaviour are tested against a local fake upstream. The
> Proxmox endpoint, port and authentication have not been exercised against a
> live Proxmox VE instance, so the console should not be treated as production
> ready until that check is done.

---

## Journal

Requires an access JWT and the `journal:read` permission. Events are streamed via SSE.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/journal/global/stream` | Stream journal events across all nodes (SSE) |
| `GET` | `/api/journal/:nodeId/stream` | Stream journal events for a specific node (SSE) |
| `GET` | `/api/journal/:nodeId` | Get journal entries for a node |
| `GET` | `/api/journal/search` | Search journal entries |
| `POST` | `/api/journal/:nodeId/notes` | Add a manual note to a node's journal |

**Query params (`GET /api/journal/global/stream`):**

| Param | Description |
|---|---|
| `nodeIds` | Comma-separated node IDs to filter |
| `groupId` | Inventory group ID to filter |
| `startDate` | ISO 8601 datetime (inclusive) |
| `endDate` | ISO 8601 datetime (inclusive) |
| `eventType` | Comma-separated event types |
| `source` | Comma-separated source names |

The per-node stream (`/api/journal/:nodeId/stream`) accepts the same `startDate`, `endDate`, `eventType`, and `source` params.

Both stream endpoints return `text/event-stream`. Each event has `type` (`entry` / `complete` / `error`) and JSON data.

---

## RBAC

All endpoints require access JWT authentication and appropriate RBAC permissions.

### Users

User DTOs from authentication and user administration include nullable `email`
and `displayName` fields. Group member DTOs also allow a null `email`. External
contact email can be absent or shared across accounts; it never identifies an
account for linking. Local account creation still requires a unique local email
and username. The `ldap:` username prefix is reserved for directory accounts.
Password hashes are excluded from responses. Entra enrollment continues to
require explicit administrative authority and rejects implicit email linking.
LDAP-owned profile fields (email, given name, surname) and local password writes
are rejected with HTTP 403 and code `DIRECTORY_ACCOUNT_READ_ONLY` through
`PUT /api/users/:id` and `POST /api/auth/change-password`, including for
administrators. Directory password changes must be performed at the directory.
Local suspension, administrative status and manual role assignments remain
managed in Pabawi. LDAP login is available when configured.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users` | Create user |
| `GET` | `/api/users` | List users |
| `GET` | `/api/users/:id` | Get user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |
| `POST` | `/api/users/:id/roles/:roleId` | Assign role to user |
| `DELETE` | `/api/users/:id/roles/:roleId` | Remove role from user |

User list and detail responses include `authentication` administration metadata:

```json
{
  "authentication": {
    "profileReadOnly": true,
    "sources": [{
      "provider": "ldap",
      "name": "Corporate directory",
      "directoryId": "corporate",
      "loginName": "alice"
    }]
  }
}
```

Local and Entra sources use `provider: "local"` and `"entra-id"`.
LDAP names use the current directory display label, otherwise `LDAP`.
These fields appear only on existing `users:read` routes, not public discovery
or authentication user DTOs. No passwords, tokens, user DNs or immutable subjects appear.

User details also include `roleSources`: an array of `{ roleId, source }` where
source is `manual`, `ldap` or `entra-id`. LDAP entries may include
`directoryId` and authoritative `groupName`. Multiple sources can refer to
one role; `roles` remains the effective union. Removing an assignment through
the user-role endpoint removes only its manual source.
See the [LDAP operator guide](integrations/ldap.md).

### Roles

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/roles` | Create role |
| `GET` | `/api/roles` | List roles |
| `GET` | `/api/roles/:id` | Get role |
| `PUT` | `/api/roles/:id` | Update role |
| `DELETE` | `/api/roles/:id` | Delete role |
| `POST` | `/api/roles/:id/permissions/:permId` | Assign permission to role |
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
| `POST` | `/api/users/:id/groups/:groupId` | Add user to group |
| `DELETE` | `/api/users/:id/groups/:groupId` | Remove user from group |

---

## Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login, returns token, refreshToken and user |
| `POST` | `/api/auth/ldap/login` | Explicit LDAP password login; same successful DTO as local login |
| `POST` | `/api/auth/refresh` | Rotate token pair using refreshToken in the body |
| `POST` | `/api/auth/register` | Register when self-registration is enabled |
| `POST` | `/api/auth/logout` | Logout (includes `entraIdLogoutUrl` for SSO sessions) |
| `GET` | `/api/auth/providers` | Available auth methods (public, no auth required) |

LDAP login is available when `LDAP_ENABLED=true`; otherwise it returns 404. Submit
`{ "username": "<directory login>", "password": "<directory password>" }`.
Both fields must be nonempty, with UTF-8 limits of 1024 and 4096 bytes respectively.
The submitted case, login whitespace and password are preserved. Requests never fall through
to another provider. A failed or ambiguous credential check returns generic 401; a proven account
without access returns 403. Capacity or throttling returns 429, and unavailable/incomplete directory
validation returns 503 with safe error codes. Refresh and protected REST checks use the same temporary
unavailability semantics. Failed refresh validation leaves the inbound refresh token available for retry.

The existing IP authentication limit includes LDAP. Failed credential counters use a separate
`ldap:` namespace with SHA-256 over the structured tuple `["ldap", directoryId, submittedLogin]`.
Five failed credentials in fifteen minutes temporarily lock that key for fifteen minutes.
Local usernames and other directories use independent account counters. Credential failures never
replay a user bind against another endpoint. Proven accounts receive no automatic role; an account
with no grants remains visible for manual role assignment and receives no tokens.
Rejected lookup-account credentials return temporary unavailability and do not increment user credential counters.

### Azure Entra ID SSO

Available when `ENTRA_ID_ENABLED=true`. Returns 404 otherwise. Callback and token
redemption require the HttpOnly cookie set by login in the initiating browser.
State and final codes are single-use. Enrollment requires both `rbac:admin` and
`users:admin`; see [identity linking](integrations/entra-id.md).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/entra-id/login` | Redirects (302) to Microsoft login |
| `GET` | `/api/auth/entra-id/callback` | OAuth callback: exchanges code, redirects to frontend |
| `POST` | `/api/auth/entra-id/token` | Exchange single-use auth code for JWT pair |

**`GET /api/auth/providers` response:**

```json
{
  "local": true,
  "entraId": { "enabled": true, "name": "Microsoft Entra ID" },
  "ldap": { "enabled": true, "name": "Corporate directory", "loginHelpUrl": "" }
}
```

Optional provider entries appear only when configured. LDAP remains advertised during directory outages;
discovery contains no directory ID, endpoints, search settings or credentials.

**`POST /api/auth/entra-id/token` request:**

```json
{ "code": "<authorization-code>" }
```

**`POST /api/auth/entra-id/token` response:**

```json
{
  "token": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": { "id": "...", "username": "...", "email": "..." }
}
```

---

## LDAP administration

Available when `LDAP_ENABLED=true`. Every endpoint requires a Pabawi access JWT
and `rbac:admin`, independently of page-level controls. An authorized request gets
404 when LDAP is disabled. Public discovery and password authentication use the
separate exchanges described under [Auth](#auth).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/ldap/groups` | Search configured group scope with required `query`, optional opaque `cursor` |
| `GET` | `/api/auth/ldap/mappings` | List stored mappings for the configured directory, including during outages |
| `POST` | `/api/auth/ldap/mappings` | Create a mapping from `{ "groupSubject": "<immutable UUID>", "roleId": "<role ID>" }` |
| `PUT` | `/api/auth/ldap/mappings/:id` | Change `roleId` and/or boolean `enabled` |
| `DELETE` | `/api/auth/ldap/mappings/:id` | Delete mapping and withdraw only its attributable grants |
| `POST` | `/api/auth/ldap/test` | Diagnose configured TLS/lookup; optionally exact `username` and mapped `groupSubjects` |

Search matches escaped substrings of the configured group lookup or display-name
attribute. `query` is nonempty and at most 1024 UTF-8 bytes. Only `{ subject, dn,
name }` is returned per group. The whole directory search must complete within
`LDAP_GROUP_SEARCH_LIMIT`; truncation returns 503 with `LIMIT_EXCEEDED`, without
partial results. A successful response is `{ items, nextCursor }`, with pages of
up to 50 groups. The cursor is a random opaque reference to the same bounded
snapshot, tied to the administrator, exact query and configured router instance.
It expires after 60 seconds; paging never extends that deadline. Each process
retains at most 64 continuation references. Expiry, eviction, restart or routing
to another process returns 400 `INVALID_CURSOR`; restart the search. All routes
return `Cache-Control: no-store` to authorized callers.

Mapping lists return `{ items }`. Each item contains `id`, `source: "ldap"`,
`directoryId`, `groupSubject`, `groupDn`, `groupName`, `roleId`, `roleName`, boolean
`enabled`, `createdAt` and `updatedAt`. Group locators and names come from the
directory when created or reverified; listing uses stored labels. Submitted
DNs, labels, directory IDs and other undeclared input properties are rejected.
Creation returns 201, update 200 and deletion 204. Multiple roles for a group
use separate mappings. Duplicate group/role mappings return 409 `CONFLICT`.
Absent roles and mappings, including mappings belonging to another directory,
return 404. An unresolvable group subject returns 422 `INVALID_IDENTITY`.

Creation, role changes and enabling require fresh immutable group resolution.
Disabling with only `{ "enabled": false }` and deletion remain available during
outages. Every successful mutation transaction increments the directory mapping
revision, invalidates persisted validation timestamps and withdraws the edited
mapping's grants. Manual roles, local RBAC groups, Entra grants and other mappings
are preserved. New/enabled mappings do not materialize grants until future
successful membership validation. Audit actions are `createLdapMapping`,
`updateLdapMapping` and `deleteLdapMapping`, with actor and directory/mapping/group/
role IDs and enabled state. Audit failure rolls back the entire mutation.
Concurrent mapping changes during directory resolution return 409
`STALE_REVISION`; reload the list and retry.

Diagnostics accept `{}` or `{ "username": "alice" }`. Adding `groupSubjects`
requires `username`, at most 20 immutable UUIDs and only currently enabled mapped
groups. Unknown/disabled selections return 400 `INVALID_GROUP_SELECTION`.
The directory checks selected group existence and direct/nested membership under
the configured policy and bounds. Responses contain `authenticated: false`,
`stages` and, when membership completes, the matching `groupSubjects`. Each stage
has `stage` (`tls`, `lookup`, `identity`, `eligibility`, `groups`), `status`
(`passed` or `failed`), `durationMs`, and a safe failure `code` when failed.
Later stages are omitted after failure. No user bind, user import, grants or token
issuance occurs. Identity lookup is separate from eligibility: a visible inactive
user fails eligibility; absent/ambiguous identity fails identity. AD attributes
that are not readable yield `POLICY_UNREADABLE`. OpenLDAP's configured filter
cannot always distinguish inactive policy from missing policy attributes.

No password, arbitrary filter or endpoint override is accepted. Reports omit
profile fields, raw LDAP messages and connection configuration. Success returns
200; `INVALID_IDENTITY`, `INELIGIBLE` and `IDENTITY_CHANGED` return 422 in this
restricted administration context. `BUSY` returns 429. Other directory failures
(`UNAVAILABLE`, `TIMEOUT`, `POLICY_UNREADABLE`, `INCOMPLETE_RESULT`,
`LIMIT_EXCEEDED`, and lookup credential rejection) return 503. Validation errors
return 400, unauthenticated/unauthorized requests 401/403, and unexpected server
errors a redacted 500. Diagnostics allow 10 requests per minute per administrator;
the router also applies the existing 100 requests/minute authenticated-user
budget. These requests do not consume the local-login attempt budget.

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

---

## Monitoring

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/monitoring/metrics` | Performance metrics (memory, CPU, uptime) |

---

## MCP (Model Context Protocol)

Requires `MCP_ENABLED=true`. The MCP endpoint does not require JWT authentication: it uses a dedicated `mcp-service` system user with read-only RBAC permissions.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/mcp` | MCP Streamable HTTP endpoint |

The endpoint accepts standard MCP JSON-RPC requests (`initialize`, `tools/list`, `tools/call`) and returns JSON responses.

### Available Tools

| Tool | Required Permission | Parameters |
|---|---|---|
| `inventory_list` | `ansible/read` | `search?: string` |
| `facts_get` | `puppetdb/read` | `certname: string` |
| `reports_query` | `puppetdb/read` | `certname?: string`, `limit?: number`, `status?: string` |
| `catalogs_get` | `puppetdb/read` | `certname: string` |
| `hiera_lookup` | `hiera/read` | `key: string`, `environment?: string` |
| `executions_list` | `bolt/read` | `limit?: number`, `status?: string`, `tool?: string` |
| `integrations_list` | `integration_config/read` | *(none)* |
| `journal_query` | `journal/read` | `nodeId?: string`, `eventType?: string`, `limit?: number` |

All tools are read-only. If the `mcp-service` user lacks the required permission, the tool returns an error response.

### MCP Client Configuration

To connect an MCP client to Pabawi:

```json
{
  "mcpServers": {
    "pabawi": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```
