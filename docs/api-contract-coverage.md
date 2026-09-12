# API contract coverage

The OpenAPI document is a REST subset. The check
`node --test scripts/documentation/contracts.test.mjs` follows literal mounts
and imported route factories from `server.ts` and `mountInfrastructureRoutes.ts`,
including nested and conditional routers. Every discovered REST method/path must
be specified or listed below; stale entries in either list fail. Parameter names
are normalized for comparison. This inventories declarations, not runtime
authorization or payload conformance. The assembled HTTP security and protocol
suites provide behavioral checks. A dynamic route/mount declaration requires
extending the inventory reader before relying on its coverage.

MCP at `/mcp`, console WebSocket upgrades at `/ws/console/*`, and static/SPA
responses are outside this REST inventory. See [MCP](mcp.md) and
[console lifecycle](api.md#console-vnc--terminal). JWT/SSO, Checkmk and execution
stream credential flows are specified in OpenAPI. Remaining schemas are explicit
backlog, not a claim of complete client-generation support.

## Intentional OpenAPI omissions

| Method | Path | Reason |
|---|---|---|
| `POST` | `/api/auth/change-password` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `GET` | `/api/config/provisioning` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `GET` | `/api/console/availability/:nodeId` | Console REST lifecycle is documented in api.md; provider compatibility remains unverified. |
| `POST` | `/api/console/sessions` | Console REST lifecycle is documented in api.md; provider compatibility remains unverified. |
| `DELETE` | `/api/console/sessions/:sessionId` | Console REST lifecycle is documented in api.md; provider compatibility remains unverified. |
| `GET` | `/api/console/sessions/:sessionId` | Console REST lifecycle is documented in api.md; provider compatibility remains unverified. |
| `POST` | `/api/console/sessions/:sessionId/heartbeat` | Console REST lifecycle is documented in api.md; provider compatibility remains unverified. |
| `GET` | `/api/crash-dumps` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `DELETE` | `/api/crash-dumps/:filename` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `GET` | `/api/crash-dumps/:filename` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `GET` | `/api/crash-dumps/:filename/download` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `POST` | `/api/executions/batch` | Durable admission/cancellation contract is documented in api.md; OpenAPI payload coverage pending. |
| `GET` | `/api/executions/batch/:batchId` | Durable admission/cancellation contract is documented in api.md; OpenAPI payload coverage pending. |
| `POST` | `/api/executions/batch/:batchId/cancel` | Durable admission/cancellation contract is documented in api.md; OpenAPI payload coverage pending. |
| `GET` | `/api/executions/stats` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `DELETE` | `/api/groups/:id/roles/:roleId` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `POST` | `/api/groups/:id/roles/:roleId` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `GET` | `/api/integrations/aws/amis` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/instance-types` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/inventory` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/key-pairs` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/aws/lifecycle` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/aws/provision` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/regions` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/security-groups` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/subnets` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/aws/test` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/aws/vpcs` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/hiera/analysis` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/analysis/lint` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/analysis/modules` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/analysis/statistics` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/analysis/unused` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/keys/:key` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/keys/:key/nodes` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/keys/search` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/nodes/:nodeId/data` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `GET` | `/api/integrations/hiera/nodes/:nodeId/keys` | Hiera analysis/query schema backlog; implementation route recorded here. |
| `POST` | `/api/integrations/proxmox/action` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/proxmox/nextid` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/proxmox/nodes/:node/isos` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/proxmox/nodes/:node/networks` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/proxmox/nodes/:node/storages` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/proxmox/nodes/:node/templates` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `DELETE` | `/api/integrations/proxmox/provision/:vmid` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/proxmox/provision/lxc` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/proxmox/provision/vm` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `POST` | `/api/integrations/proxmox/test` | Provider discovery/provisioning schema backlog; current paths are recorded here and flows in api.md. |
| `GET` | `/api/integrations/puppetdb/facts/bulk` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `DELETE` | `/api/logs` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `GET` | `/api/logs` | Administrator diagnostics; payload and export schemas are not yet specified. |
| `POST` | `/api/monitoring/metrics/reset` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `GET` | `/api/nodes` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `POST` | `/api/nodes` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `GET` | `/api/nodes/by-module` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `GET` | `/api/playbooks/details` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `POST` | `/api/puppet-run` | Durable admission/cancellation contract is documented in api.md; OpenAPI payload coverage pending. |
| `POST` | `/api/puppet-run/:id/puppet-run` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `GET` | `/api/streaming/:id/stream` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `POST` | `/api/streaming/:id/stream-ticket` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `POST` | `/api/tasks/:id/task` | Alias introduced by a shared router mount; use the canonical route in api.md. |
| `PUT` | `/api/users/:id/admin-status` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `DELETE` | `/api/users/:id/groups/:groupId` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `POST` | `/api/users/:id/groups/:groupId` | Additional REST schema backlog; explicit route retained here for drift checking. |
| `POST` | `/api/users/:id/unlock` | Additional REST schema backlog; explicit route retained here for drift checking. |
