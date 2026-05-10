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

All infrastructure integrations (Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH, AWS, Azure, Proxmox) are plugins registered in `backend/src/integrations/`. Every plugin:

- Extends `BasePlugin` (`integrations/BasePlugin.ts`) and implements `isEnabled()`, `initialize()`, `healthCheck()`
- Optionally implements `ExecutionToolPlugin` (can run commands) or `InformationSourcePlugin` (provides inventory/facts)
- Is registered with `IntegrationManager` (`integrations/IntegrationManager.ts`), which handles lifecycle, health aggregation, and routes data requests to the correct plugin

`IntegrationManager` is the central registry. When inventory or facts are requested, it fans out to all enabled `InformationSourcePlugin`s and merges results using a priority system (SSH: 50, Bolt/PuppetDB: 10, Puppetserver: 20, Ansible: 8, Hiera: 6). When executing commands, it dispatches to the correct `ExecutionToolPlugin`. AWS (`AWSPlugin` + `AWSService`), Azure (`AzurePlugin` + `AzureService`), and Proxmox (`ProxmoxService`) follow the same plugin pattern and add integration-specific routes under `routes/integrations/`.

### Backend (`backend/src/`)

- **`server.ts`** — Express app init, plugin registration, middleware wiring, route mounting
- **`config/`** — `ConfigService` wraps all env vars with Zod validation; always use this, never `process.env` directly
- **`integrations/<name>/`** — One directory per integration: `<Name>Plugin.ts` (lifecycle + routing) and `<Name>Service.ts` (business logic, CLI spawning, API calls)
- **`mcp/`** — MCP (Model Context Protocol) server: read-only infrastructure query interface for LLM clients. `McpServer.ts` (factory + RBAC gates), `McpToolHandlers.ts` (8 tools: `inventory_list`, `facts_get`, `reports_query`, `catalogs_get`, `hiera_lookup`, `executions_list`, `integrations_list`, `journal_query`), `McpOutputSummariser.ts` (strips verbose fields for LLM-friendly output), `McpServiceUser.ts` (idempotent provisioning of the `mcp-service` user). Enabled via `MCP_ENABLED=true`; session-based HTTP transport at `POST/GET/DELETE /mcp`.
- **`services/`** — Cross-cutting services: `ExecutionQueue` (concurrent limiting, FIFO), `StreamingExecutionManager` (SSE real-time output), `CommandWhitelistService` (security), `DatabaseService`, `AuthenticationService`, `BatchExecutionService`, `JournalService` (audit trail of infrastructure events), `AuditLoggingService` (user-action audit log), `PuppetRunHistoryService` (persists Puppet run history), `NodeLinkingService` (correlates the same node across integration sources), `ExpertModeService` (debug/verbose UI toggle), and RBAC services (`UserService`, `RoleService`, `PermissionService`, `GroupService`)
- **`routes/`** — Express route handlers. All async handlers must be wrapped with `asyncHandler()` from `utils/`
- **`middleware/`** — Auth (JWT), RBAC, error handler, rate limiting, security headers, `deduplication.ts` (request deduplication)
- **`database/`** — `DatabaseService.ts` (migration-first approach), `ExecutionRepository.ts` (CRUD for execution history). All schema in `migrations/*.sql`. Multi-database support via adapter pattern: `DatabaseAdapter.ts` (interface), `SQLiteAdapter.ts` (default), `PostgresAdapter.ts` (optional), `AdapterFactory.ts` (selects adapter from config) — use `DatabaseService`, never instantiate adapters directly.
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
  - `api.ts` — Centralized HTTP client with error handling
  - `executionStream.svelte.ts` — SSE client for real-time command output
  - `expertMode.svelte.ts` — Debug info toggle
  - `integrationColors.svelte.ts` — Per-integration color constants
  - `toast.svelte.ts` — Notification system

The frontend uses **Svelte 5 runes** throughout (`$state()`, `$effect()`, `$derived()`). State that needs to persist across components lives in the `lib/*.svelte.ts` files as module-level rune state.

### Configuration

All configuration is via `backend/.env`. Run `scripts/setup.sh` for interactive setup. Key variable groups: `PORT/HOST/LOG_LEVEL`, `JWT_SECRET/AUTH_ENABLED`, `BOLT_*`, `PUPPETDB_*`, `PUPPETSERVER_*`, `HIERA_*`, `ANSIBLE_*`, `SSH_*`, `AWS_*`, `AZURE_*`, `PROXMOX_*`, `COMMAND_WHITELIST*`, `CACHE_*`, `CONCURRENT_EXECUTION_LIMIT`, `MCP_ENABLED`.

See `docs/configuration.md` for the full reference. Other useful docs: `docs/mcp.md` (MCP setup and tools), `docs/permissions-rbac.md` (RBAC model), `docs/architecture.md` (system overview), `docs/api.md` (REST API reference), `docs/integrations/` (per-integration guides).

### Testing conventions

- Backend tests live in `backend/test/` (unit, integration, security, middleware, properties with fast-check)
- Frontend tests co-located with source in `frontend/src/**/*.test.ts`
- E2E tests in `e2e/` using Playwright
- Database tests use in-memory SQLite
- Use `supertest` for HTTP route testing in backend

### Logging

Use `LoggerService` everywhere — never `console.log`. Pass structured metadata: `{ component, integration, operation }`.
