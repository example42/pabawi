# API Reference

All endpoints return JSON. Base URL: `http://<host>:<port>` (default `http://localhost:3000`).

## Authentication

Infrastructure endpoints require a JWT in `Authorization: Bearer <token>` and
the relevant RBAC permissions. `AUTH_ENABLED` does not disable these checks.
Upstream PuppetDB credentials are configured on the server; they do not
substitute for caller authentication.

`GET /api/auth/permissions` requires caller authentication and returns that
caller's current effective grants as `{"permissions":[{"resource":"aws","action":"read"}]}`.
The response is not cached. It does not accept a target user ID.
See [permissions and RBAC](permissions-rbac.md) for route policies.

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
| `days` | Days to look back (1–365, default 7) | Puppet run history |
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
| `GET` | `/api/nodes/:id` | Node details |

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

**Credentials.** Either a user JWT, or — when `PABAWI_LIFECYCLE_TOKEN` is
configured — that token, in the same `Authorization: Bearer` header:

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
| `POST` | `/api/executions/batch` | Run an action across multiple nodes / groups |
| `GET` | `/api/executions/batch/:batchId` | Batch execution status |
| `POST` | `/api/executions/batch/:batchId/cancel` | Cancel a batch execution |
| `GET` | `/api/executions/queue/status` | Execution queue status |
| `GET` | `/api/streaming/stats` | Streaming server stats |
| `POST` | `/api/executions/:id/stream-ticket` | Single-use ticket for the SSE stream |

**Authorization:** the command-executing / mutating routes
(`/batch`, `/:id/re-execute`, `/:id/cancel`, `/batch/:batchId/cancel`) require
the `bolt:execute` permission. Command-type requests are validated against the
[command whitelist](configuration.md#command-whitelist) — shell metacharacters
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

Recovery supports one application process. Shutdown stops admission; shutdown and
startup reconciliation mark undispatched batch work `cancelled` and dispatched
work with an unknown outcome `interrupted`. Neither is automatically replayed.
Verify provider state before retrying interrupted work. Multi-process ownership
and global concurrency across direct execution routes are separate work.

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

## Provisioning (Proxmox, AWS, and Azure)

Require `PROXMOX_ENABLED=true`, `AWS_ENABLED=true`, or `AZURE_ENABLED=true`. Destructive actions (destroy/terminate/deallocate) additionally require `ALLOW_DESTRUCTIVE_PROVISIONING=true` or return `403 DESTRUCTIVE_ACTION_DISABLED`.

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

Requires `CHECKMK_ENABLED=true`. All endpoints require JWT auth and the `monitoring:read` RBAC permission.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/nodes/:nodeId/services` | Live service monitoring status from Checkmk |
| `GET` | `/api/nodes/:nodeId/monitoring-events` | State-change events from Checkmk |

**Query params (`GET /api/nodes/:nodeId/monitoring-events`):**

| Param | Default | Description |
|---|---|---|
| `limit` | `200` | Max events to return (1–1000) |

**Response (`GET /api/nodes/:nodeId/services`):**

```json
{
  "services": [
    {
      "description": "CPU load",
      "state": "OK",
      "stateType": "hard",
      "pluginOutput": "OK - 15min load: 0.42",
      "lastCheck": "2026-06-15T10:30:00Z"
    }
  ]
}
```

**Error codes:**

| HTTP | Code | Condition |
|---|---|---|
| 503 | `CHECKMK_NOT_CONFIGURED` | Plugin not enabled |
| 404 | `NODE_NOT_FOUND` | Node not known to Checkmk |
| 502 | *(upstream error)* | Checkmk API failure or timeout |

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

Requires `AUTH_ENABLED=true` and the `journal:read` permission. Events are streamed via SSE.

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
| `POST` | `/api/auth/logout` | Logout (includes `entraIdLogoutUrl` for SSO sessions) |
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/auth/providers` | Available auth methods (public, no auth required) |

### Azure Entra ID SSO

Available when `ENTRA_ID_ENABLED=true`. Returns 404 otherwise.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/entra-id/login` | Redirects (302) to Microsoft login |
| `GET` | `/api/auth/entra-id/callback` | OAuth callback — exchanges code, redirects to frontend |
| `POST` | `/api/auth/entra-id/token` | Exchange single-use auth code for JWT pair |

**`GET /api/auth/providers` response:**

```json
{
  "local": true,
  "entraId": { "enabled": true, "name": "Microsoft Entra ID" }
}
```

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

---

## MCP (Model Context Protocol)

Requires `MCP_ENABLED=true`. The MCP endpoint does not require JWT authentication — it uses a dedicated `mcp-service` system user with read-only RBAC permissions.

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
