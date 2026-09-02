# Changelog

## [1.5.0] - 


## [1.4.0] - 2026-06-05

### Added

- **Checkmk monitoring integration.** Connects to the Checkmk REST API v1 to provide live monitoring data: host inventory discovery, service status, and state-change events. All data is fetched live (no caching).
- **Dedicated Monitor page** (`/monitor`) showing unhandled service problems across all hosts with severity grouping, host state summary, and acknowledged-problem tracking.
- **Home page monitoring dashboard** displaying unhandled problems count and recent state-change events from Checkmk.
- **Monitor tab** on the node detail page displaying live service status from Checkmk, grouped by state (CRIT → WARN → UNKNOWN → OK) with colored badges, plugin output, and relative timestamps. Supports "Sort by: Last Change" toggle for chronological view.
- **Checkmk monitoring summary on node overview tab** showing per-host service state counts (OK/WARN/CRIT/UNKNOWN) at a glance.
- **Auto-refresh and manual refresh controls** on the Monitor page with configurable interval.
- **Ansible playbook browser.** `GET /api/playbooks` discovers YAML playbook files in `ANSIBLE_PROJECT_PATH`; `GET /api/playbooks/details?path=...` returns playbook structure (plays, hosts, roles, task count) and auto-extracted parameters from `vars_prompt` and top-level `vars`.
- **PlaybookParameterForm component** rendering dynamic inputs for playbook variables with type-aware editors (String, Boolean, Integer, Array, Hash) and validation.
- **ExecutePlaybookForm rewrite** with directory tree browser, search, content viewer, and auto-detected parameters replacing the previous manual-path textarea.
- **Journal integration** for Checkmk state-change events — monitoring events appear in the node journal timeline alongside events from other sources.
- `GET /api/nodes/:nodeId/services` endpoint returning live service monitoring data.
- `GET /api/nodes/:nodeId/monitoring-events` endpoint returning state-change events with configurable limit.
- `GET /api/nodes/:nodeId/monitoring-summary` endpoint returning per-host service state counts.
- `CHECKMK_ENABLED`, `CHECKMK_SERVER_URL`, `CHECKMK_SITE`, `CHECKMK_USERNAME`, `CHECKMK_PASSWORD`, `CHECKMK_SSL_VERIFY` environment variables for configuration.
- `PABAWI_CRASH_DUMP_DIR` configurable via `ConfigService` (previously env-only in the crash handler).
- Checkmk integration documentation at `docs/integrations/checkmk.md`.
- `monitoring:read` RBAC permission for monitoring endpoints.
- Checkmk integration color (purple) in the integration color palette.
- Checkmk `lastStateChange` field exposed in service status for chronological sorting.
- Acknowledged flag on Checkmk service problems for distinguishing handled vs unhandled issues.

### Changed

- Bolt health check switched from raw `spawn` to `exec()` with shell resolution, fixing detection failures behind rbenv/asdf shims.
- Bolt and Ansible command execution now pass `--run-as root` / `--become` when sudo is requested by the action.
- Integration health checks run one synchronous round at startup before accepting requests, eliminating the brief "unavailable" flash on cold start.
- Proxmox API functions (`createProxmoxVM`, `createProxmoxLXC`) unwrap the nested `{ result: { ... } }` response to return a clean `ProvisioningResult`.

### Fixed

- Ansible parallel-execution package action format handled correctly (was passing malformed arguments).

## [1.3.1] - 2026-06-01

### Added

- **Crash forensics.** Ring-buffer request recorder captures the last N
  requests on fatal exit. Synchronous crash dumps written to disk include
  memory stats, event-loop lag, and in-flight request metadata. Dump
  directory configurable via `PABAWI_CRASH_DUMP_DIR` environment variable.
- **Enhanced `/api/health` endpoint.** Now checks database connectivity and
  returns per-component status. Returns HTTP 503 when the database is
  unreachable, enabling container orchestrators to detect unhealthy pods.
- **Helm chart for Kubernetes deployment** (`charts/pabawi/`). Includes
  templates for Deployment, Service, Ingress, HPA, NetworkPolicy, PDB,
  PVC, ConfigMap, Secret, ServiceAccount, and a database migration Job.
  Supports both SQLite (single-replica, default) and external or bundled
  PostgreSQL with multi-replica scaling. Schema validation via
  `values.schema.json`.
- Version update script (`scripts/update-version.js`) for managing release
  versions across package files.
- Kubernetes deployment documentation expanded with Helm installation
  instructions (`docs/deployment/kubernetes.md`).

### Changed

- Docker health check `start-period` increased from 5s to 30s across all
  Dockerfiles to accommodate slower cold starts under resource-constrained
  environments.

## [1.3.0] - 2026-05-25

### Security — breaking for operators

**Action required before upgrade:**

- **`JWT_SECRET` must be ≥ 32 characters and not a placeholder.** The schema
  now rejects strings shorter than 32 chars and matches the documented
  placeholders (`your-secure-random-secret-here`, `change-me`, etc.). Servers
  with an invalid secret refuse to boot. Rotate with
  `JWT_SECRET=$(openssl rand -base64 32)` if you are still on a placeholder.
- **`DELETE /api/inventory/:id` now requires the lifecycle bearer token.**
  Any non-Pabawi client (custom scripts, cron jobs) calling the destroy
  endpoint must pass `Authorization: Bearer <PABAWI_LIFECYCLE_TOKEN>`.
- **SSE `?token=` URL fallback removed.** Any non-Pabawi SSE client (custom
  dashboards, scripts) must obtain a single-use ticket via
  `POST /api/executions/:id/stream-ticket` and pass it as `?ticket=…` instead.
  The full JWT in the URL was the leak: it landed in access logs, browser
  history, and proxy caches.
- **Refresh-token rotation is now enforced.** Every successful
  `POST /api/auth/refresh` invalidates the inbound refresh token and returns
  a new one. Presenting a previously-used refresh token triggers family
  revocation (all the user's tokens are killed) — clients must always store
  and use the latest `refreshToken` from the most recent response.
- **Permanent account lockout removed.** Only the temporary 15-min lockout
  remains. The previous "permanent after 10 attempts" path was a trivial
  self-service DoS against any legitimate user. The `users:admin` permission
  can unlock a temporarily-locked account via the new
  `POST /api/users/:id/unlock` endpoint.

### Security — non-breaking

- `isAdmin` removed from the `POST /api/users` and `PUT /api/users/:id` body
  schemas. Elevation now goes through the dedicated
  `PUT /api/users/:id/admin-status` endpoint, gated by `users:admin`; admins
  cannot change their own admin status.
- `users:write` (without `users:admin`) is now restricted to `email`/`isActive`
  changes on non-admin targets. Password and name changes on another user
  require `users:admin`.
- Strict task-name and command-shape validation on Bolt-targeted argv
  (`POST /api/tasks`, `POST /api/nodes/:id/command`). Leading `-` and unsafe
  identifiers are rejected upstream and again at the spawn boundary.
- PuppetDB/Puppetserver routes now validate `certname` (NODE_ID pattern) and
  `hash` (40–128 hex chars). PQL is composed via `JSON.stringify`; URL paths
  are wrapped in `encodeURIComponent`.
- Bearer-token equality checks switched to constant-time comparisons (MCP +
  lifecycle).
- Dedup middleware cache key now includes `userId` to prevent cross-user
  cache leakage on shared GET routes.
- Password fields (`password`, `currentPassword`, `newPassword`,
  `confirmPassword`) bypass the central input sanitizer — trimming/truncating
  them silently produced auth failures.
- `/change-password`'s `currentPassword` mis-match feeds the brute-force
  pipeline (5 wrong attempts → temporary lockout) so it can't be used as an
  un-rate-limited oracle.
- JWT tokens now carry `iss=pabawi` / `aud=pabawi` and verification refuses
  tokens missing those claims.
- Hiera path resolution rejects fact-driven `..` escapes outside the control
  repo root.
- Search filters (UserService, RoleService, GroupService) escape LIKE
  wildcards in user input.
- `POST /api/setup/initialize` is rate-limited (10 req / 15min / IP) and now
  detects post-creation duplicate admins from a concurrent race.
- Error responses redact raw `error.message` for non-expert callers (paths,
  env values, external stderr no longer leak).
- `crypto.randomUUID()` for expert-mode correlation IDs.

### Added

- **Per-source on-demand facts on the node detail page.** The Facts tab now
  loads nothing automatically. Each information source (Bolt, SSH, Ansible,
  PuppetDB, Puppetserver, Hiera, Proxmox, AWS, Azure) gets its own card with
  a "Load facts" button, plus per-card Refresh and Retry. A repurposed
  "Load all" button covers the previous bulk Gather Facts use case. Page
  load no longer establishes any SSH connection or queries any external
  integration. Errors land per-source and the rest of the page keeps
  rendering.
- **`?source=<name>` query parameter on `GET /api/nodes/:id/facts`.** Scopes
  the request to a single information source and bypasses the active-source
  filter so the per-card Load buttons work for Bolt/SSH/Ansible. Returns
  404 `UNKNOWN_SOURCE` when the source is not registered. Backend tests at
  `backend/test/routes/facts-source-filter.test.ts` pin the contract.
- **All-source view on the Facts tab.** Third toggle option ("Per Source ·
  All · Merged") enumerates every fact key reported by any loaded source.
  Sources reporting the same value collapse into one row with a badge per
  contributing source; divergent values render as separate rows under the
  same key. Equality uses a stable, key-sorted JSON serialisation so
  property order on objects does not split groups.
- **PostgreSQL backend support.** Set `DB_TYPE=postgres` and `DATABASE_URL`
  to run on PostgreSQL instead of SQLite; both share one schema and code path
  (application SQL uses `?` placeholders, rewritten to `$n` for PostgreSQL).
  `docker-compose.yml` gains a profile-gated `postgres` service. See
  [docs/configuration.md](docs/configuration.md#database).
- `PUT /api/users/:id/admin-status` — gated by `users:admin`, refuses
  self-modification.
- `POST /api/users/:id/unlock` — clears temporary lockout + cumulative
  counter, audit-logged.
- `BoltCommandWhitelistService` (renamed; old `CommandWhitelistService`
  remains as a deprecated alias).
- E2E coverage for the on-demand facts flow at
  `e2e/inventory-to-facts.spec.ts` (idle cards, per-source Load, "Load all",
  All view, terminal Refresh/Retry affordances).
- Backend tests at `backend/test/routes/facts-source-filter.test.ts` and
  three new cases in
  `backend/src/integrations/proxmox/__tests__/ProxmoxIntegration.test.ts`
  covering hostname resolution to canonical Proxmox IDs and the
  not-found error path.
- Regression test suite at
  `backend/test/security/jazzy-launching-wombat-regressions.test.ts` pinning
  the contracts for A2, B1, B2, B4, C3, C7, C8.
- PostgreSQL test harness under `scripts/`: `docker-postgres-test.sh`
  (start / stop / destroy / status / logs subcommands) plus a dedicated
  `docker-postgres-test.compose.yml` and `docker-postgres-test.env`. Builds
  the app from local source into an isolated Compose project
  (`pabawi-postgres-test`) on host ports 3001 / 5433 so it does not collide
  with the main stack. Useful while the published `:latest` image lags
  behind PostgreSQL support.

### Fixed

- **Source cards on the Facts tab now switch the active view when clicked.**
  After loading a second source, clicking its card focuses it (previously
  only the inner title row was the click target, and the active highlight
  stayed on the first-loaded source). The whole card is now a `role="button"`
  target with keyboard support, and a per-source load auto-focuses the new
  source unless a bulk Load-all is in flight.
- **Proxmox facts fetch crashed on cross-source node identifiers.**
  `ProxmoxIntegration.getNodeFacts()` now matches the AWS/Azure plugin
  pattern: canonical `proxmox:{node}:{vmid}` IDs forward unchanged, while
  hostname or linked-node names are resolved against Proxmox's own
  inventory by `id` or `name` and the matching guest's canonical ID is
  used. Unknown identifiers throw a clean `Proxmox node not found: <id>`
  that surfaces under `errors.proxmox` on the facts response instead of
  the previous parse-error.
- `scripts/docker-entrypoint.sh` no longer creates the SQLite data file when
  `DB_TYPE=postgres`. The previous unconditional `touch "$DATABASE_PATH"`
  caused the container to exit with `cannot touch: No such file or
  directory` whenever a non-existent path was set under the postgres
  backend. SQLite-mode behaviour is unchanged (default when `DB_TYPE` is
  unset).

### Deferred (separate PRs)

- Refresh-token move to `HttpOnly` cookie + CSRF (H4).
- `sqlite3 → better-sqlite3` migration or `tar` override (M10).
- Operator action: rotate AWS access key, Proxmox token, `JWT_SECRET`, and
  `MCP_AUTH_TOKEN` that were transmitted during the review.

## [1.2.0] - 2026-05-17

### Added

- Embedded MCP (Model Context Protocol) server with 8 read-only infrastructure tools over Streamable HTTP transport
- MCP tools: `inventory_list`, `facts_get`, `reports_query`, `catalogs_get`, `hiera_lookup`, `executions_list`, `integrations_list`, `journal_query`
- MCP service user (`mcp-service`) auto-provisioned at startup with read-only permissions
- `MCP_ENABLED` environment variable to control MCP server activation (default: `false`)
- `/mcp` POST endpoint for MCP Streamable HTTP protocol
- RBAC permission enforcement on all MCP tool calls via existing PermissionService
- Azure permissions: `azure/read`, `azure/lifecycle`, `azure/provision`, `azure/destroy`, `azure/admin`
- Hiera permissions: `hiera/read`, `hiera/admin`
- SSH permissions: `ssh/read`, `ssh/execute`, `ssh/admin`
- Database migration 013 backfilling missing role-permission assignments for Viewer, Operator, Administrator, and Provisioner roles
- CreateRoleDialog component for creating custom roles from the Role Management page
- Frontend permission types for `azure`, `hiera`, and `ssh` resources with category grouping
- Property-based tests for MCP tool permission enforcement, inventory search filtering, API client 204 handling, and form validation
- DI container (`backend/src/container/DIContainer.ts`) with typed `ServiceRegistry` for LoggerService, ConfigService, ExpertModeService
- Declarative plugin registry (`backend/src/plugins/registry.ts`) replacing per-plugin init blocks in server.ts
- Shared Puppet execution helper (`runPuppetOn`) eliminating duplicated execution logic between single-node and multi-node handlers
- MCP SDK type declaration (`backend/src/types/mcp-sdk.d.ts`) removing type suppressions from MCP integration
- Bolt structured JSON error parsing with `categoriseError()` method and `ERROR_KIND_MAP`
- Frontend API module split: `proxmoxApi.ts`, `awsApi.ts`, `azureApi.ts` extracted from monolithic `api.ts`
- Property-based tests for DI container singleton guarantee, plugin registry behaviour, Bolt error categorisation, and SSE event handling

### Changed

- All route files converted to factory functions (`createXxxRouter(container)`) resolving services from DI container
- JWT secret and lifecycle token centralised in ConfigService — no direct `process.env` access for secrets
- `PABAWI_LIFECYCLE_TOKEN` changed from required to optional (defaults to empty string; endpoint returns 500 when unconfigured)
- Plugin initialisation in server.ts replaced with single `for...of` loop over plugin registry
- Execution streaming refactored to SSE-first with single-fetch fallback (polling removed)
- Duplicate router mounts removed (`/api/nodes` alias for inventory, duplicate packages mount)
- Type suppressions reduced across backend (typed Express request augmentation, typed Bolt JSON output, typed MCP session entries)

### Fixed

- `fetchWithRetry` now handles HTTP 204 No Content responses without JSON parse errors
- Viewer role missing read permissions for Proxmox, AWS, Journal, and Integration Config
- Operator role missing lifecycle and execute permissions for Proxmox, AWS, Azure, and SSH
- Create Role button on Role Management page now opens a functional dialog instead of a stub
- Global auth middleware now receives JWT secret from ConfigService (was using ephemeral random secret, causing "Invalid token signature" after login)
- Config route (`/api/config/ui`, `/api/config/provisioning`) converted from module-level `new ConfigService()` to DI container factory (was crashing on startup when `PABAWI_LIFECYCLE_TOKEN` was unset)

## [1.1.0] - 2026-04-28

### Added

- Azure integration with VM inventory, provisioning, lifecycle management (start/stop/restart/deallocate), and health checks
- Azure API routes for inventory, provisioning, lifecycle actions, VM sizes, locations, resource groups, and images
- Azure setup guide component with `.env` snippet generation and sensitive value masking
- Azure configuration schema (tenant ID, client ID, client secret, subscription ID) via ConfigService
- Azure journal collector for VM state change tracking
- Azure color coding in integration color service
- Global Journal page with cross-node timeline aggregation, filtering by node, group, event type, source, and date range
- Journal collectors for Proxmox tasks, AWS EC2 state changes, PuppetDB reports, and execution history
- Collapsible target selector in Global Journal with node/group search and source filtering
- Grouping of consecutive similar journal entries in the timeline for cleaner display
- Clickable node IDs in global journal entries linking to node detail pages
- Node name resolution in journal views — Proxmox/AWS raw IDs resolve to hostnames
- Input sanitization middleware with null byte removal, prototype pollution prevention, and deep nesting protection
- Cumulative login attempt counters (migration 011) for permanent lockout decisions that persist across successful logins
- Request deduplication middleware with LRU cache for identical GET requests
- Integration color service with consistent color coding across all integrations
- Multi-source filtering support in journal timeline API
- Zod-based input validation schemas for RBAC and common request types

### Changed

- Journal timeline component supports both per-node and global modes
- Streaming route refined for journal event collection
- AWS state persistence uses batched `Promise.all` mapping
- Security hardened across integrations with secure defaults and stricter input validation
- Version bumped to 1.1.0 across all package.json files

### Fixed

- Journal timeline stuck loading state resolved
- Proxmox and AWS URIs correctly resolve to hostnames in journal views
- Journal stream guard logic refined to prevent edge-case rendering issues

## [1.0.0] - 2026-04-12

### Added

- Read-only Integration Status Dashboard showing enabled integrations and connection health
- "Test Connection" buttons for Proxmox and AWS on the Status Dashboard
- Setup guide `.env` snippet wizards with copy-to-clipboard and sensitive value masking
- Database migration 010 to drop `integration_configs` table
- Comprehensive property-based test coverage using fast-check (ConfigService, IntegrationManager, Status Dashboard, Setup Wizards)
- Unit tests for ConfigService env parsing and Zod schema validation
- Unit tests for IntegrationManager plugin lifecycle and graceful degradation
- Frontend component tests for Integration Status Dashboard and Env Snippet Wizards

### Changed

- Configuration system refactored: `.env` is now the single source of truth for all integration settings
- IntegrationConfigPage converted from CRUD UI to read-only Integration Status Dashboard
- Setup guide components converted from database-saving wizards to `.env` snippet generators
- Test connection endpoints refactored to read config from ConfigService (no request body)
- Proxmox and AWS plugins receive config directly from ConfigService without database merges
- All documentation updated to reflect `.env`-only configuration model
- Docker configurations updated with consistent ENV defaults and migration support
- Version bumped to 1.0.0 across all package.json files, Docker labels, and steering docs

### Removed

- `IntegrationConfigService` and `IntegrationConfigService.types.ts`
- `IntegrationConfigRouter` and `/api/config/integrations` CRUD endpoints
- `integration_configs` database table (dropped via migration 010)
- Frontend API functions: `saveIntegrationConfig`, `getIntegrationConfig`, `getIntegrationConfigs`, `deleteIntegrationConfig`, `saveProxmoxConfig`, `saveAWSConfig`
- `IntegrationConfigRecord` frontend type
- Dead code and unused dependencies related to database-stored config overrides

## [0.8.0] - 2026-03-05

### Added

- SSH integration with direct command execution capabilities
- Parallel execution UI with batch processing for multiple nodes
- Initial setup wizard for first-time configuration
- User and group creation dialogs with RBAC support
- Self-registration controls for user management
- JWT support for performance metrics monitoring
- Security hardening across integrations

### Changed

- Improved inventory management with SSH integration
- Enhanced type safety in performance metrics
- Updated secrets baseline with comprehensive test coverage

## [0.7.0] - 2026-02-23

### Added

- Ansible integration with playbook execution
- Ansible inventory and facts gathering capabilities
- Ansible setup guide and documentation
- Hiera class resource tracking
- Integration architecture reorganization

### Changed

- Moved Bolt files to integrations directory for better organization
- Improved type safety in Ansible facts parsing
- Converted Ansible module args from JSON to key=value format

### Fixed

- Puppet run history date range calculation to include today
- RealtimeOutputViewer rendering with invalid execution IDs
- Unit tests and linting issues
- Package lock file updates

## [0.6.0] - 2026-02-03

### Added

- Documentation reorganization and improvements
- Version 1.0 planning documentation

### Changed

- Code refactoring and consolidation
- Updated screenshots and README documentation
- Removed sample Bolt project, enhanced Docker documentation
- Updated .env.docker configuration

### Fixed

- Removed unnecessary type arguments
- Documentation consistency and table of contents

## [0.5.0] - 2026-01-25

### Added

- Pages titles
- Pagination and execution list unification
- Comprehensive expert mode testing suite
- Logo and screenshots

### Changed

- Unified logging and route refactoring
- Improved Bolt error handling
- Documentation updates and formatting

### Fixed

- Interface improvements
- Multiple lint fixes

## [0.4.0] - 2026-01-12

### Added

- Hiera integration and local Puppet codebase integration

### Changed

- Removed certificate management functionality
- Enhanced Puppetserver integration
- Streamlined integrations and enhanced Hiera capabilities

### Fixed

- Tests and lints
- CI fixes

## [0.3.0] - 2025-12-18

### Added

- Puppetserver integration with complete service and API client
- PuppetDB integration completion
- Theme system and integration setup guides
- Phase 5 UI restructuring with Puppet page
- Enhanced error handling
- Puppet API documentation
- Windows Docker compatibility

### Changed

- Version bump and Dockerfile updates

### Fixed

- Tests
- Type comparison issues
- Multiple lint fixes

## [0.2.0] - 2025-12-03

### Added

- PuppetDB integration foundation and plugin architecture
- Circuit breaker and retry logic for integrations
- Bolt plugin integration
- Performance improvements (caching, database indexes, execution queue)
- Real-time execution streaming via SSE
- Expert mode with Bolt command visibility
- Task organization by module with dynamic parameter forms
- Database migration support
- Package installation interface
- Comprehensive API documentation
- E2E test suite
- Docker multi-arch support
- Pre-commit hooks
- HOST binding configuration
- Network configuration guide

### Changed

- Improved TypeScript type safety and ESLint compliance
- Simplified executions table and version display
- Ubuntu-based Dockerfile
- Updated dependencies

### Fixed

- XSS vulnerability in CommandOutput component
- Tuple format handling in task list output
- Markdown linting rules
- CI/CD workflows and publish scripts
- Multiple lint and test fixes

## [0.1.0] - 2025-11-23

### Added

- Initial project structure
- BoltService CLI integration
- Express API endpoints (inventory, commands, tasks, facts, executions)
- Frontend routing system with Svelte
- Inventory, node detail, and executions pages
- Execution repository with CRUD operations
- Command whitelist service
- Task listing and execution
- Facts gathering
- Error handling and toast notifications
- Database schema and migrations
- GitHub Actions CI/CD workflows
- Devcontainer support

### Changed

- Initial architecture and dependencies setup

### Fixed

- Docker schema.sql copying
- Various initialization and configuration issues
