# Pabawi AI Coding Guidelines

**Version:** 1.2.0
**Last Updated:** May 2026

Pabawi is a unified web interface for infrastructure management. It integrates with Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH, Proxmox, AWS, and Azure.

## Architecture Overview

### Monorepo Structure

```
pabawi/
├── frontend/          # Svelte 5 + Vite SPA (port 5173 dev, served by backend in prod)
│   └── src/           # Components, pages, lib/ (api.ts, proxmoxApi.ts, awsApi.ts, azureApi.ts)
├── backend/           # Node.js + Express + TypeScript API (port 3000)
│   ├── container/     # DI container (ServiceRegistry: logger, config, expertMode)
│   ├── plugins/       # Declarative plugin registry (PluginRegistryEntry[])
│   ├── integrations/  # Plugin architecture: Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH, Proxmox, AWS, Azure
│   ├── routes/        # Route factories (createXxxRouter(container))
│   ├── services/      # ExecutionQueue, StreamingExecutionManager, RBAC, etc.
│   ├── database/      # SQLite/Postgres via adapter pattern, migrations
│   ├── mcp/           # Embedded MCP server (8 read-only tools)
│   └── config/        # ConfigService + Zod schema for env validation
├── e2e/               # Playwright E2E tests
└── docs/              # Configuration, API reference, architecture details
```

### Plugin Architecture

All backend integrations are declared in `backend/src/plugins/registry.ts` as a `PluginRegistryEntry[]` array. `server.ts` iterates this array in a single loop.

1. **Plugin Types:** `ExecutionToolPlugin`, `InformationSourcePlugin`, `ProvisioningToolPlugin`, or combinations
2. **Base Class:** Extend `BasePlugin` for lifecycle management (initialize, healthCheck, isEnabled)
3. **Registry:** Each entry has `resolveConfig()` (returns null to skip) and `create()` (factory)
4. **Priority-Based Data Aggregation:** Higher priority wins for duplicate nodes
   - SSH: 50
   - PuppetDB: 10
   - Puppetserver: 8
   - Proxmox/AWS/Azure: 7
   - Hiera: 6
   - Bolt/Ansible: 5

### DI Container

`backend/src/container/DIContainer.ts` provides a typed container with `ServiceRegistry` interface:

- `logger` → `LoggerService`
- `config` → `ConfigService`
- `expertMode` → `ExpertModeService`

Route factories receive the container: `createXxxRouter(container)`. Resolve services via `container.resolve("logger")`.

### Critical Data Flows

**Multi-Source Inventory:** `IntegrationManager.getLinkedInventory()` fans out to all `InformationSourcePlugin`s in parallel, deduplicates by priority, links nodes via `NodeLinkingService`.

**Command Execution:** Route → `CommandWhitelistService.validate()` → `ExecutionQueue.enqueue()` → `IntegrationManager.executeAction()` → `StreamingExecutionManager` (SSE) → `ExecutionRepository.create()`.

**Real-time Streaming:** SSE-first via `useExecutionStream()` subscription. Single-fetch fallback on SSE connection failure.

## Development Workflows

### Setup & Running

```bash
npm run install:all      # Install all dependencies (rebuilds native modules)
npm run dev:backend      # Port 3000, tsx watch
npm run dev:frontend     # Port 5173, Vite HMR
npm run dev:fullstack    # Build frontend + serve from backend
```

### Testing

```bash
npm test                              # All tests (backend + frontend, no-watch)
npm test --workspace=backend          # Backend only
npm test --workspace=frontend         # Frontend only
npm run test:e2e                      # Playwright E2E
```

### Linting & Type Checking

```bash
npm run lint               # ESLint both workspaces (0 warnings)
npm run lint:fix           # Auto-fix
npx tsc --noEmit           # Type check (run in backend/ or frontend/)
```

## Code Patterns & Conventions

### Backend

**DI & Route Factories:**

- Route files export `createXxxRouter(container)` — resolve services from container
- Never instantiate `LoggerService`, `ExpertModeService`, or `ConfigService` directly in route files
- Never read `process.env` directly — use `ConfigService`

**Configuration & Secrets:**

- `ConfigService` validates all env vars with Zod at startup
- `JWT_SECRET` is required; `PABAWI_LIFECYCLE_TOKEN` is optional (defaults to empty)
- Access via `configService.getJwtSecret()` and `configService.getLifecycleToken()`

**Plugin Registration:**

- Add new integrations to `plugins/registry.ts` — never add init blocks to `server.ts`
- Each entry: `name`, `type`, `priority`, `resolveConfig()`, `create()`

**Error Handling:**

- Typed error classes in `backend/src/errors/`
- `asyncHandler()` wrapper for all async route handlers
- Bolt task errors: extract both `_output` and `_error` fields

**Logging:**

- Use `LoggerService` with structured metadata: `{ component, integration, operation }`
- Never use `console.log`

### Frontend (Svelte 5 + Vite)

**State:** Svelte 5 runes (`$state()`, `$effect()`, `$derived()`). Module-level rune state in `lib/*.svelte.ts`.

**API Modules:**

- `api.ts` — HTTP infrastructure only (get, post, put, del, error handling, retry logic)
- `proxmoxApi.ts` — Proxmox provisioning functions
- `awsApi.ts` — AWS EC2 functions
- `azureApi.ts` — Azure VM functions

**Streaming:** `executionStream.svelte.ts` — SSE client with `useExecutionStream()` for live output.

**UI:** TailwindCSS. Integration color coding per `integrationColors.svelte.ts`.

## Key Rules

| Rule | Detail |
|---|---|
| Config | Never `process.env` — use `ConfigService` via DI container |
| Logging | `LoggerService` from container, never `console.log` |
| DB | Shared `DatabaseService` singleton — never create connections per file |
| Async | `Promise.all` for independent awaits |
| Routes | Factory functions with container — `createXxxRouter(container)` |
| Errors | Typed errors from `errors/` — never generic `Error` |
| Plugins | Declare in `plugins/registry.ts` |
| Frontend API | Domain functions in separate modules (`proxmoxApi.ts`, etc.) |
| Svelte | Runes only — no legacy stores |

## Adding a New Integration

1. Create `backend/src/integrations/<name>/` with `<Name>Plugin.ts` + `<Name>Service.ts`
2. Add config schema to `backend/src/config/schema.ts`
3. Parse env vars in `ConfigService.ts`
4. Add `PluginRegistryEntry` to `backend/src/plugins/registry.ts`
5. Add route factory in `backend/src/routes/` (optional)
6. Add tests in `backend/test/`
7. Add doc in `docs/integrations/<name>.md`

## DO / DON'T

**DO:**

- Resolve services from DI container
- Use typed error classes
- Add structured logging with component/integration/operation context
- Use `ExecutionQueue` for concurrent operations
- Extract both `_output` and `_error` from Bolt task failures
- Use SSE for real-time execution output

**DON'T:**

- Hardcode paths, timeouts, or config — use ConfigService
- Execute shell commands directly — use BoltService or spawn with error handling
- Skip error handling or use generic `Error`
- Use `console.log` — use LoggerService
- Create unbounded queues — use ExecutionQueue with configurable limits
- Add plugin init blocks to `server.ts` — use `plugins/registry.ts`
- Put domain API functions in `api.ts` — use separate modules
