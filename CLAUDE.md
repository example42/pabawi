<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/systeminit/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search local types with `swamp model type search <query>`, (b) search community extensions with `swamp extension search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) only create a custom extension model in `extensions/models/` if nothing exists. Use the `swamp-extension` skill for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp-report` skill for guidance.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp-getting-started` - Interactive onboarding for new swamp users
- `swamp-model` - Work with swamp models (creating, editing, validating)
- `swamp-workflow` - Work with workflows (creating, editing, running)
- `swamp-vault` - Manage secrets and credentials
- `swamp-data` - Manage model data lifecycle and query with CEL
- `swamp-report` - Run and configure reports for models and workflows
- `swamp-repo` - Repository management
- `swamp-extension` - Create custom extensions (models, vaults, drivers, datastores, reports)
- `swamp-extension-publish` - Publish extensions to the registry
- `swamp-issue` - Submit bug reports and feature requests
- `swamp-troubleshooting` - Diagnose swamp problems and verify swamp's health

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately invoke the `swamp-getting-started` skill before doing anything else.
This walks new users through an interactive onboarding tutorial.

If models already exist, start by using the `swamp-model` skill to work with
swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (root + workspaces, rebuilds native modules)
npm run install:all

# Development
npm run dev:backend        # Backend on port 3000 (tsx watch)
npm run dev:frontend       # Frontend dev server on port 5173
npm run dev:fullstack      # Build frontend + serve everything from backend

# Build
npm run build              # Build both frontend and backend

# Testing
npm run test               # Run all tests (backend + frontend, no-watch)
npm run test --workspace=backend   # Backend tests only
npm run test --workspace=frontend  # Frontend tests only
npm run test:watch --workspace=backend  # Backend watch mode
npm run test:e2e           # Playwright E2E tests
npm run test:e2e:ui        # Playwright with UI mode
npm run test:e2e:headed    # Playwright in headed (visible) browser
npm run test:e2e:debug     # Playwright debug mode

# Pre-commit hooks
npm run setup:hooks        # Install pre-commit hooks
npm run precommit          # Run pre-commit checks manually

# Run a single test file
cd backend && npx vitest run test/unit/SomeService.test.ts

# Linting
npm run lint               # Lint both workspaces (0 warnings allowed)
npm run lint:fix           # Auto-fix lint issues
```

Backend uses `tsx watch` for hot-reload during development. The frontend dev server proxies API calls to the backend.

## Architecture Overview

Pabawi is an infrastructure management web UI — a monorepo with a **Node.js/Express/TypeScript backend** and a **Svelte 5 SPA frontend**.

### Plugin-based integration system

All infrastructure integrations (Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH, AWS, Azure, Proxmox) are plugins declared in `backend/src/plugins/registry.ts`. Every plugin:

- Extends `BasePlugin` (`integrations/BasePlugin.ts`) and implements `isEnabled()`, `initialize()`, `healthCheck()`
- Optionally implements `ExecutionToolPlugin` (can run commands) or `InformationSourcePlugin` (provides inventory/facts)
- Is registered with `IntegrationManager` (`integrations/IntegrationManager.ts`), which handles lifecycle, health aggregation, and routes data requests to the correct plugin

The plugin registry (`plugins/registry.ts`) is a declarative array of `PluginRegistryEntry` objects. `server.ts` iterates this array in a single loop — no per-plugin init blocks. Each entry has `resolveConfig()` (returns null to skip) and `create()` (factory).

`IntegrationManager` is the central registry. When inventory or facts are requested, it fans out to all enabled `InformationSourcePlugin`s and merges results using a priority system (SSH: 50, Bolt: 5, PuppetDB: 10, Puppetserver: 8, Ansible: 5, Hiera: 6, Proxmox/AWS/Azure: 7). When executing commands, it dispatches to the correct `ExecutionToolPlugin`.

### Backend (`backend/src/`)

- **`server.ts`** — Express app init, DI container setup, plugin registry loop, middleware wiring, route factory mounting
- **`container/`** — `DIContainer` class with typed `ServiceRegistry` interface (logger, config, expertMode). Route factories receive the container and resolve services from it
- **`plugins/`** — `registry.ts` declares all integration plugins as a `PluginRegistryEntry[]` array with `resolveConfig()` and `create()` per entry
- **`config/`** — `ConfigService` wraps all env vars with Zod validation; always use this, never `process.env` directly. Secrets: `JWT_SECRET` (required), `PABAWI_LIFECYCLE_TOKEN` (optional, defaults to empty) <!-- pragma: allowlist secret -->
- **`integrations/<name>/`** — One directory per integration: `<Name>Plugin.ts` (lifecycle + routing) and `<Name>Service.ts` (business logic, CLI spawning, API calls)
- **`mcp/`** — MCP (Model Context Protocol) server: read-only infrastructure query interface for LLM clients. `McpServer.ts` (factory + RBAC gates), `McpToolHandlers.ts` (8 tools: `inventory_list`, `facts_get`, `reports_query`, `catalogs_get`, `hiera_lookup`, `executions_list`, `integrations_list`, `journal_query`), `McpOutputSummariser.ts` (strips verbose fields for LLM-friendly output), `McpServiceUser.ts` (idempotent provisioning of the `mcp-service` user). Enabled via `MCP_ENABLED=true`; session-based HTTP transport at `POST/GET/DELETE /mcp`.
- **`services/`** — Cross-cutting services: `ExecutionQueue` (concurrent limiting, FIFO), `StreamingExecutionManager` (SSE real-time output), `CommandWhitelistService` (security), `DatabaseService`, `AuthenticationService`, `BatchExecutionService`, `JournalService` (audit trail of infrastructure events), `AuditLoggingService` (user-action audit log), `PuppetRunHistoryService` (persists Puppet run history), `NodeLinkingService` (correlates the same node across integration sources), `ExpertModeService` (debug/verbose UI toggle), and RBAC services (`UserService`, `RoleService`, `PermissionService`, `GroupService`)
- **`routes/`** — Express route factories. All export `createXxxRouter(container)` functions. All async handlers wrapped with `asyncHandler()` from `utils/`
- **`middleware/`** — Auth (JWT), RBAC, error handler, rate limiting, security headers, `deduplication.ts` (request deduplication)
- **`database/`** — `DatabaseService.ts` (migration-first approach), `ExecutionRepository.ts` (CRUD for execution history). All schema in `migrations/*.sql`. Multi-database support via adapter pattern: `DatabaseAdapter.ts` (interface), `SQLiteAdapter.ts` (default), `PostgresAdapter.ts` (optional), `AdapterFactory.ts` (selects adapter from config) — use `DatabaseService`, never instantiate adapters directly.
- **`types/`** — Shared type declarations (`express.d.ts` for request augmentation, `mcp-sdk.d.ts` for MCP SDK types)
- **`errors/`** — Typed error classes extending base classes; use these instead of generic `Error`
- **`validation/`** — Zod schemas for request body validation

Bolt command output is parsed from JSON; both `_output` and `_error` fields must be extracted from failed task results. Inventory and facts are cached (30 s and 5 min TTL respectively) inside each plugin's service.

### Frontend (`frontend/src/`)

- **`App.svelte`** — Root: initializes router, auth guard, and setup check
- **`pages/`** — One Svelte component per page route
- **`components/`** — Shared UI components
- **`lib/`** — Core utilities and reactive state:
  - `router.svelte.ts` — Client-side router using Svelte 5 runes (`$state`)
  - `auth.svelte.ts` — JWT auth state
  - `api.ts` — HTTP infrastructure (get, post, put, del) with retry logic and error handling
  - `proxmoxApi.ts` — Proxmox provisioning API functions
  - `awsApi.ts` — AWS EC2 API functions
  - `azureApi.ts` — Azure VM API functions
  - `executionStream.svelte.ts` — SSE client for real-time command output (SSE-first, single-fetch fallback)
  - `expertMode.svelte.ts` — Debug info toggle
  - `integrationColors.svelte.ts` — Per-integration color constants
  - `toast.svelte.ts` — Notification system

The frontend uses **Svelte 5 runes** throughout (`$state()`, `$effect()`, `$derived()`). State that needs to persist across components lives in the `lib/*.svelte.ts` files as module-level rune state.

### Configuration

All configuration is via `backend/.env`. Run `scripts/setup.sh` for interactive setup. Key variable groups: `PORT/HOST/LOG_LEVEL`, `JWT_SECRET` (required), `PABAWI_LIFECYCLE_TOKEN` (optional), `BOLT_*`, `PUPPETDB_*`, `PUPPETSERVER_*`, `HIERA_*`, `ANSIBLE_*`, `SSH_*`, `AWS_*`, `AZURE_*`, `PROXMOX_*`, `COMMAND_WHITELIST*`, `CACHE_*`, `CONCURRENT_EXECUTION_LIMIT`, `MCP_ENABLED`.

See `docs/configuration.md` for the full reference. Other useful docs: `docs/mcp.md` (MCP setup and tools), `docs/permissions-rbac.md` (RBAC model), `docs/architecture.md` (system overview), `docs/api.md` (REST API reference), `docs/integrations/` (per-integration guides).

### Testing conventions

- Backend tests live in `backend/test/` (unit, integration, security, middleware, properties with fast-check)
- Frontend tests co-located with source in `frontend/src/**/*.test.ts`
- E2E tests in `e2e/` using Playwright
- Database tests use in-memory SQLite
- Use `supertest` for HTTP route testing in backend

### Logging

Use `LoggerService` everywhere — never `console.log`. Pass structured metadata: `{ component, integration, operation }`.

## KiroGraph

@.kirograph/claude.md
