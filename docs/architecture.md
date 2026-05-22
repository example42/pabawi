# Pabawi Architecture

Pabawi is a web UI and REST API that wraps multiple infrastructure tools behind a single, consistent interface. The frontend is a Svelte 5 SPA. The backend is a Node.js/Express server with a plugin system that manages integrations, executes commands, aggregates data, and streams output in real time.

## Plugin System

Every integration is a plugin. Plugins are registered with `IntegrationManager` at startup and fall into three roles:

| Role | Interface | Examples |
|---|---|---|
| Execution tool | `ExecutionToolPlugin` | Bolt, Ansible, SSH |
| Information source | `InformationSourcePlugin` | PuppetDB, Puppetserver, Hiera |
| Both | Both interfaces | Bolt |
| Provisioning tool | `ProvisioningToolPlugin` | Proxmox, AWS |

All plugins extend `BasePlugin`, which handles initialization state, health checks, logging, and config validation. Concrete plugins implement two abstract methods: `performInitialization()` and `performHealthCheck()`.

```
IntegrationPlugin (interface)
├── ExecutionToolPlugin      → executeAction(), listCapabilities()
├── InformationSourcePlugin  → getInventory(), getNodeFacts(), getNodeData()
└── ProvisioningToolPlugin   → provision(), deprovision()

BasePlugin (abstract class, implements IntegrationPlugin)
├── BoltPlugin           (execution + information, priority: 10)
├── PuppetDBService      (information, priority: 10)
├── PuppetserverService  (information, priority: 20)
├── HieraService         (information, priority: 6)
├── AnsibleService       (execution, priority: 8)
├── SSHService           (execution, priority: 50)
├── ProxmoxService       (provisioning, priority: 10)
└── AWSService           (provisioning, priority: 10)
```

## Configuration Flow

All configuration comes from environment variables. There are no database-stored config overrides.

```
backend/.env → ConfigService (Zod validation) → DIContainer → Route factories / Plugins
```

`ConfigService` is the only place `process.env` is read. Every other file resolves it from the DI container or receives it as a constructor argument. Secrets (`JWT_SECRET` required, `PABAWI_LIFECYCLE_TOKEN` optional) are accessed via `configService.getJwtSecret()` and `configService.getLifecycleToken()`.

## Startup Sequence

```
server.ts
  │
  ├── ConfigService.load()           parse + validate all env vars
  ├── DIContainer.register()         config, logger, expertMode
  ├── DatabaseService.initialize()   run migrations (SQLite)
  │
  ├── pluginRegistry loop            iterate plugins/registry.ts entries
  │     ├── entry.resolveConfig()    skip if not configured
  │     └── entry.create()           instantiate + register with IntegrationManager
  │
  ├── IntegrationManager.initializePlugins()   parallel init, errors logged
  ├── IntegrationManager.startHealthCheckScheduler()   runs every 60s
  │
  ├── MCP server (if MCP_ENABLED)    provision service user, register tools, mount /mcp
  │
  └── Route factories mounted        createXxxRouter(container) for each domain
```

Plugin init failures don't crash the server. The failed plugin is marked unhealthy and other integrations continue working.

## Data Flows

### Inventory request

```
GET /api/inventory
  │
  ├── IntegrationManager.getLinkedInventory()
  │     │
  │     ├── query all InformationSourcePlugins in parallel
  │     │     ├── bolt.getInventory()
  │     │     ├── puppetdb.getInventory()
  │     │     └── puppetserver.getInventory()
  │     │
  │     ├── deduplicate by node ID (higher priority source wins)
  │     └── NodeLinkingService.linkNodes()
  │           match on certname → hostname → IP
  │           build LinkedNode with sources[] array
  │
  └── JSON response: linked nodes with source metadata
```

### Command execution

```
POST /api/executions
  │
  ├── CommandWhitelistService.validate()    reject if not whitelisted
  ├── ExecutionQueue.enqueue()              enforce concurrency limit
  │
  ├── IntegrationManager.executeAction(toolName, action)
  │     └── tool.executeAction(action)     Bolt/Ansible/SSH
  │
  ├── StreamingExecutionManager            SSE real-time output
  ├── ExecutionRepository.create()         persist result to SQLite
  │
  └── JSON response: execution result
```

### Facts request

```
GET /api/inventory/:nodeId/facts
  │
  ├── query all InformationSourcePlugins in parallel
  │     ├── bolt.getNodeFacts(nodeId)
  │     ├── puppetdb.getNodeFacts(nodeId)
  │     └── puppetserver.getNodeFacts(nodeId)
  │
  └── JSON response: { bolt: {...}, puppetdb: {...}, puppetserver: {...} }
```

### Health check

```
Scheduler (every 60s)
  └── plugin.healthCheck() for each plugin → cached 5 min

GET /api/integrations/status
  └── return cached results (or fresh if cache expired)
```

## Backend Directory Layout

```
backend/src/
├── server.ts                      Express app, route factory wiring, plugin registry loop
├── container/                     DIContainer — typed service registry (logger, config, expertMode)
├── plugins/                       Declarative plugin registry (PluginRegistryEntry[])
├── config/                        ConfigService — Zod schemas for all env vars
├── integrations/
│   ├── BasePlugin.ts
│   ├── IntegrationManager.ts
│   ├── NodeLinkingService.ts
│   ├── types.ts
│   ├── bolt/
│   ├── puppetdb/
│   ├── puppetserver/
│   ├── hiera/
│   ├── ansible/
│   ├── ssh/
│   ├── proxmox/
│   ├── aws/
│   └── azure/
├── services/
│   ├── ExecutionQueue.ts           concurrency limit, FIFO
│   ├── StreamingExecutionManager.ts  SSE real-time output
│   ├── CommandWhitelistService.ts  security: allowed commands
│   ├── DatabaseService.ts          SQLite, migrations
│   ├── AuthenticationService.ts    JWT auth
│   ├── BatchExecutionService.ts    multi-node execution
│   ├── UserService.ts
│   ├── RoleService.ts
│   ├── PermissionService.ts
│   └── GroupService.ts
├── routes/                         Express route factories (all wrapped in asyncHandler)
├── middleware/                     JWT auth, RBAC, error handler, rate limit, security headers
├── database/
│   ├── DatabaseService.ts
│   ├── ExecutionRepository.ts
│   └── migrations/*.sql            schema-first, sequential migration files
├── types/                          Shared type declarations (express.d.ts, mcp-sdk.d.ts)
├── errors/                         typed error classes
└── validation/                     Zod schemas for request bodies
```

## Frontend Directory Layout

```
frontend/src/
├── App.svelte                      router init, auth guard, setup check
├── pages/                          one component per route
├── components/                     shared UI components
└── lib/
    ├── router.svelte.ts            client-side router (Svelte 5 runes)
    ├── auth.svelte.ts              JWT auth state
    ├── api.ts                      HTTP infrastructure (get, post, put, del, error handling)
    ├── proxmoxApi.ts               Proxmox provisioning API functions
    ├── awsApi.ts                   AWS EC2 API functions
    ├── azureApi.ts                 Azure VM API functions
    ├── executionStream.svelte.ts   SSE client for real-time output
    ├── expertMode.svelte.ts        debug info toggle
    ├── integrationColors.svelte.ts per-integration color constants
    └── toast.svelte.ts             notification system
```

The frontend uses Svelte 5 runes (`$state()`, `$effect()`, `$derived()`) throughout. Module-level rune state in `lib/*.svelte.ts` persists across component mounts.

## Database

SQLite by default, with PostgreSQL as an alternative backend (`DB_TYPE`/`DATABASE_URL` — see [configuration.md](configuration.md#database)). Both are reached through a single `DatabaseAdapter` interface (`SQLiteAdapter` / `PostgresAdapter`, selected by `AdapterFactory`); `DatabaseService` is a shared singleton — never create connections in individual files. Application SQL is written with `?` placeholders; `PostgresAdapter` rewrites them to `$n` at query time, so services are dialect-agnostic. Genuine dialect differences (e.g. `LIKE` vs `ILIKE`) branch on `adapter.getDialect()`.

Schema is managed by sequential migration files in `database/migrations/`. A migration is shared (`NNN_name.sql`) or dialect-specific (`NNN_name.sqlite.sql` / `NNN_name.postgres.sql`); when both exist for an ID, the dialect-specific file wins.

| Migration | Content |
|---|---|
| 000_initial.sql | Execution history, base schema |
| 001_rbac.sql | Users, roles, permissions, groups |

## Security Model

- **Command whitelisting** — `CommandWhitelistService` validates every command before execution. Set `COMMAND_WHITELIST_ALLOW_ALL=false` in production.
- **JWT authentication** — all API routes behind auth middleware when `AUTH_ENABLED=true`.
- **RBAC** — role-based access control via `UserService`, `RoleService`, `PermissionService`. See [permissions-rbac.md](./permissions-rbac.md).
- **Rate limiting** — applied at middleware level.
- **Security headers** — helmet middleware.
- **Secret obfuscation** — expert mode logs redact sensitive values.

## Caching

| Data | TTL | Location |
|---|---|---|
| Inventory | 30 s | Per-plugin service |
| Node facts | 5 min | Per-plugin service |
| Health checks | 5 min | IntegrationManager |

## Related Docs

- [configuration.md](./configuration.md) — all env vars
- [api.md](./api.md) — REST API reference
- [permissions-rbac.md](./permissions-rbac.md) — RBAC model
- [integrations/](./integrations/) — per-plugin setup guides
