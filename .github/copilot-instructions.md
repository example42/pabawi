# Pabawi AI Coding Guidelines

**Version:** 0.5.0
**Last Updated:** January 2026

Pabawi is a unified web interface for infrastructure management, executing commands and tasks via Bolt, PuppetDB, Puppetserver, and Hiera. This document guides AI agents through the architecture, conventions, and workflows essential for productive contributions.

## Architecture Overview

### Monorepo Structure

```
pabawi/
├── frontend/          # Svelte 5 + Vite SPA (port 5173 dev, served by backend in prod)
│   └── src/           # Components, pages, stores (router.svelte.ts, api.ts)
├── backend/           # Node.js + Express + TypeScript API (port 3000)
│   ├── integrations/  # Plugin architecture: Bolt, PuppetDB, Puppetserver, Hiera
│   ├── routes/        # REST API endpoints (inventory, commands, tasks, facts, etc.)
│   ├── bolt/          # Bolt CLI execution service with caching and streaming
│   ├── database/      # SQLite execution history repository
│   └── services/      # ExecutionQueue, StreamingExecutionManager, etc.
└── docs/              # Configuration, API reference, architecture details
```

### Plugin Architecture (Critical)

**All backend integrations follow a consistent plugin pattern** (`backend/src/integrations/`):

1. **Plugin Types:** All plugins implement either `ExecutionToolPlugin`, `InformationSourcePlugin`, or both
2. **Base Class:** Extend `BasePlugin` for lifecycle management (initialize, healthCheck, isEnabled)
3. **Registration:** Plugins register with `IntegrationManager` at startup (see [backend/src/server.ts](backend/src/server.ts#L34-L120))
4. **Priority-Based Data Aggregation:** When multiple sources provide the same data, higher priority wins
   - Puppetserver: 20 (highest)
   - Bolt/PuppetDB: 10
   - Hiera: 6

**Key Pattern:** Plugin implements standard interfaces → manager handles registration/initialization → endpoints use manager to query all sources → data aggregation by priority.

### Critical Data Flows

**Multi-Source Inventory:** Request aggregates from Bolt (priority 10) + PuppetDB (priority 10) + Puppetserver (priority 20). Duplicate nodes resolved by priority.

**Command Execution:** Request → Route (`routes/commands.ts`) → ExecutionQueue → BoltService.executeCommand() → StreamingExecutionManager streams output → DatabaseService stores in SQLite.

**Real-time Streaming:** Execution spawns subprocess, pipes stdout/stderr, client WebSocket receives chunks via `/api/stream/:executionId`.

## Development Workflows

### Setup & Running

```bash
# Install all dependencies (frontend + backend)
npm run install:all

# Development: Run both servers separately
npm run dev:backend      # Port 3000, watches src/
npm run dev:frontend     # Port 5173, Vite HMR

# Production-like: Build frontend, serve via backend
npm run build:frontend && npm run copy:frontend && npm run dev:backend
# Access at http://localhost:3000
```

### Testing

- **Backend Unit Tests:** `npm test --workspace=backend` (Vitest, see [backend/vitest.config.ts](backend/vitest.config.ts))
- **Frontend Tests:** `npm test --workspace=frontend`
- **E2E Tests:** `npm run test:e2e` (Playwright, [e2e/](e2e/))
- **Linting:** `npm run lint` (ESLint with `@eslint/js`, TypeScript strict mode)
- **Type Checking:** `npx tsc --noEmit` in both directories

### Build & CI/CD

- **GitHub Actions** (`[.github/workflows/ci.yml](.github/workflows/ci.yml)`): Lint, type-check, test, build on every PR/push
- **Docker:** Multi-arch builds via `scripts/docker-build-multiarch.sh`
- **Versioning:** Update via `scripts/update-version.js` (affects package.json, package-lock.json)

## Code Patterns & Conventions

### Backend (Express + TypeScript)

**Error Handling:**
- Define domain-specific errors in `backend/src/errors/` (e.g., `BoltExecutionError`, `CommandNotAllowedError`)
- Errors extend base class with statusCode property
- Global error middleware (`errorHandler.ts`) catches all errors, formats response based on error type
- Use `asyncHandler()` wrapper in routes to handle Promise rejections
- **Bolt Task Errors:** Extract both `_output` and `_error` fields from failed tasks—combine for comprehensive error messages

**Configuration & Validation:**
- Use `ConfigService` to load/validate environment variables with Zod schemas (`backend/src/config/schema.ts`)
- All integrations read config via `ConfigService.getConfig()`
- Sensitive values (tokens, certs) load from env, never hardcoded

**Services Architecture:**
- `BoltService`: Spawns Bolt CLI, parses JSON output, implements streaming callbacks and caching (30s inventory, 5m facts TTL)
- `DatabaseService`: SQLite schema management, migrations
- `ExecutionRepository`: CRUD operations for execution history with composite indexes
- `IntegrationManager`: Registry and lifecycle management for all plugins
- `CommandWhitelistService`: Validates commands against whitelist (security-critical)
- `ExecutionQueue`: FIFO queue limiting concurrent executions (default: 5 concurrent, 50 max queue)
- `LoggerService`: Structured logging with component, integration, operation metadata
- `ExpertModeService`: Debug info attachment with correlation IDs linking frontend/backend logs

### Frontend (Svelte 5 + Vite)

**Stores & State:**
- Reactive stores in `src/lib/` (e.g., `router.svelte.ts`, `expertMode.svelte.ts`, `theme.svelte.ts`)
- Use SvelteKit-like patterns for state management (Svelte 5 runes: `$state()`, `$effect()`)
- Expert mode state persisted to localStorage, triggers enhanced API responses with debug info

**API Integration:**
- All HTTP calls via `src/lib/api.ts` (centralizes fetch, error handling, type safety)
- Routes in `src/pages/`, components in `src/components/` organized by feature
- Real-time streaming via SSE (`executionStream.svelte.ts`): auto-reconnect, exponential backoff, correlation IDs
- Use `useExecutionStream()` utility for live command/task output with reactive state management

**UI Patterns:**
- Tailwind CSS for styling (see `tailwind.config.js`)
- Integration color coding: Bolt (orange #FFAE1A), PuppetDB (violet #9063CD), Puppetserver (blue #2E3A87), Hiera (red #C1272D)
- Error boundary component handles graceful error display (`ErrorBoundary.svelte`)
- Toast notifications for feedback (`toast.svelte.ts`)
- ANSI to HTML conversion for terminal output (`ansiToHtml.ts`)
- `RealtimeOutputViewer`: Auto-scrolling, copy-to-clipboard, separate stdout/stderr sections

### Database Schema

SQLite schema defined in `backend/src/database/schema.sql`, migrations in `migrations.sql`. Key tables:
- `executions`: Stores all command/task execution history with results
- Auto-create on first run via `DatabaseService`

## Configuration & Environment

### Required Settings (`backend/.env`)

```env
BOLT_PROJECT_PATH=.              # Path to Bolt project (inventory.yaml, modules/)
PORT=3000                        # Server port
LOG_LEVEL=info                   # error | warn | info | debug
DATABASE_PATH=./data/executions.db
BOLT_EXECUTION_TIMEOUT=300000    # 5 minutes default
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","pwd"]  # CSV in env, JSON in code

# Performance & Caching (v0.4+)
CACHE_INVENTORY_TTL=30000        # 30 seconds
CACHE_FACTS_TTL=300000           # 5 minutes
CONCURRENT_EXECUTION_LIMIT=5     # Max parallel executions
MAX_QUEUE_SIZE=50                # Max queued executions
```

### Integration Config (Optional)

PuppetDB, Puppetserver, Hiera enabled via `INTEGRATION_PUPPETDB_ENABLED`, `INTEGRATION_PUPPETSERVER_ENABLED`, etc. Each integration has server URL, token, SSL settings (see [docs/configuration.md](docs/configuration.md) for full reference).

**Note:** Certificate management features were removed in v0.4—no longer managed via Puppetserver integration.

## Security Considerations

- **No Authentication:** Pabawi designed for localhost/workstation use only
- **Command Whitelist:** All Bolt commands validated against whitelist in `CommandWhitelistService` (enabled by default, must explicitly allow commands)
- **Network Exposure:** If exposing to network, deploy behind reverse proxy with authentication
- **Privileged Ops:** Pabawi can execute arbitrary commands on infrastructure—restrict access accordingly, task error extraction |
| [backend/src/routes/inventory.ts](backend/src/routes/inventory.ts) | Multi-source inventory aggregation example |
| [backend/src/database/ExecutionRepository.ts](backend/src/database/ExecutionRepository.ts) | Execution history CRUD with composite indexes |
| [backend/src/services/ExecutionQueue.ts](backend/src/services/ExecutionQueue.ts) | FIFO queue for concurrent execution limiting |
| [backend/src/services/LoggerService.ts](backend/src/services/LoggerService.ts) | Structured logging with integration/component context |
| [backend/src/services/ExpertModeService.ts](backend/src/services/ExpertModeService.ts) | Debug info attachment, correlation ID management |
| [frontend/src/lib/api.ts](frontend/src/lib/api.ts) | HTTP client, centralized request/response handling |
| [frontend/src/lib/executionStream.svelte.ts](frontend/src/lib/executionStream.svelte.ts) | SSE client for real-time execution output |
| [frontend/src/components/RealtimeOutputViewer.svelte](frontend/src/components/RealtimeOutputViewer.svelte) | Streaming output display with auto-scroll, copy |
| [frontend/src/pages/InventoryPage.svelte](frontend/src/pages/InventoryPage.svelte) | Frontend integration example |
| [docs/architecture.md](docs/architecture.md) | Full architectural reference |
| [.kiro/](https://github.com/kiro-ai/kiro-editor) | Kiro AI editor project specs, summaries, debugging notes
| [backend/src/server.ts](backend/src/server.ts) | Express app init, plugin registration, route mounting |
| [backend/src/integrations/IntegrationManager.ts](backend/src/integrations/IntegrationManager.ts) | Plugin registry, lifecycle, health checks |
| [backend/src/bolt/BoltService.ts](backend/src/bolt/BoltService.ts) | Bolt CLI execution, streaming, caching, timeout |
| [backend/src/routes/inventory.ts](backend/src/routes/inventory.ts) | Multi-source inventory aggregation example |
| [backend/src/database/ExecutionRepository.ts](backend/src/database/ExecutionRepository.ts) | Execution history CRUD |
| [frontend/src/lib/api.ts](frontend/src/lib/api.ts) | HTTP client, centralized request/response handling |
| [frontend/src/pages/InventoryPage.svelte](frontend/src/pages/InventoryPage.svelte) | Frontend integration example |
| [docs/architecture.md](docs/architecture.md) | Full architectural reference |

## Common Tasks for AI Agents

### nitialize `LoggerService`, `ExpertModeService` in router factory
4. Implement business logic, calling services (BoltService, IntegrationManager, repos)
5. **Add structured logging** at request start, before/after operations, and errors:
   ```typescript
   logger.info("Processing request", { component: "RouterName", integration: "bolt", operation: "executeCommand", metadata: {...} });
   ```
6. Use `integrationManager.getInventory()`, `.getNodeData()`, etc. for multi-source data
7. **Support expert mode**: Check `req.expertMode`, attach debug info with `ExpertModeService.attachDebugInfo()`
8. Mount in `server.ts` with appropriate path prefix
9. Return consistent response format with `source` field identifying integratio
3. Implement business logic, calling services (BoltService, IntegrationManager, repos)
4. Use `integrationManager.getInventory()`, `.getNodeData()`, etc. for multi-source data
5. Mount in `server.ts` with appropriate path prefix
6. Wrap response/errors using error handler pattern

### Adding a New Plugin Integration

1. Create folder in `backend/src/integrations/{name}/`
2. Define plugin class extending `BasePlugin`, implement `IntegrationPlugin` interface
3. Implement `initialize()`, `healthCheck()`, and operation methods (executeAction, getInventory, etc.)
4. Add TypeScript types in `types.ts`
5. Register in `server.ts` with priority, configuration
6. Update route endpoints to query new plugin via IntegrationManager

### Debugging Execution Issues

- Check `LOG_LEVEL=debug` for verbose logs with structured metadata
- **Enable expert mode** in UI (persisted to localStorage)—see full Bolt commands, correlation IDs, backend logs, performance metrics
- Use correlation IDs to trace frontend actions → backend processing → responses
- Inspect `backend/src/errors/ErrorHandlingService.ts` for error context details
- Check `ExpertModeDebugPanel` component for timeline view of frontend + backend logs
- Verify execution results in SQLite database (`data/executions.db`)—check composite indexes for query performance
- Test Bolt commands manually: `bolt command run 'whoami' --targets inventory.yaml`
- Check `ExecutionQueue` status via `GET /api/executions/queue/status`—verify queue isn't full
- For task failures, check both `_output` (command output) and `_error.msg` (error details)

### Testing Changes

- **Unit:** Write test in `backend/test/unit/` or `frontend/src/**/*.test.ts`
- **Run:** `npm test -- --watch` to run in watch mode
- **E2E:** `npm run test:e2e:headed` to debug Playwright tests in browser
- **Linting:** `npm run lint:fix` auto-fixes style issues
: 30s inventory, 5m facts)
- Use error types for domain-specific failures
- Gracefully degrade when integrations are unavailable
- **Add structured logging** with component/integration/operation context
- **Support expert mode** in new endpoints—attach debug info, correlation IDs, performance metrics
- Extract both `_output` and `_error` from failed Bolt tasks for complete error context
- Use `ExecutionQueue` for limiting concurrent operations
- Document complex flows with comments referencing architecture.md
- Use integration color coding in UI (see `INTEGRATION_COLORS` mapping)

❌ **DON'T:**
- Hardcode paths, timeouts, or configuration—use ConfigService
- Execute shell commands directly—use BoltService or spawn with proper error handling
- Skip error handling or use generic `Error` type
- Assume a single source of truth—always account for multi-source data aggregation
- Expose internal error details to frontend without sanitization (except in expert mode)
- Ignore `_output` field in Bolt task failures—users need to see actual command output
- Use console.log—use LoggerService with proper context
- Create unbounded queues—use ExecutionQueue with configurable limits
❌ **DON'T:**
- Hardcode paths, timeouts, or configuration—use ConfigService
- Execute shell commands directly—use BoltService or spawn with proper error handling
- Skip error handling or use generic `Error` type
- Assume a single source of truth—always account for multi-source data aggregation
- Expose internal error details to frontend without sanitization
