# Changelog

## [Unreleased] - security remediation

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

- **PostgreSQL backend support.** Set `DB_TYPE=postgres` and `DATABASE_URL`
  to run on PostgreSQL instead of SQLite; both share one schema and code path
  (application SQL uses `?` placeholders, rewritten to `$n` for PostgreSQL).
  `docker-compose.yml` gains a profile-gated `postgres` service. See
  [docs/configuration.md](docs/configuration.md#database).
- `POST /api/users/:id/admin-status` — gated by `users:admin`, refuses
  self-modification.
- `POST /api/users/:id/unlock` — clears temporary lockout + cumulative
  counter, audit-logged.
- `BoltCommandWhitelistService` (renamed; old `CommandWhitelistService`
  remains as a deprecated alias).
- Regression test suite at
  `backend/test/security/jazzy-launching-wombat-regressions.test.ts` pinning
  the contracts for A2, B1, B2, B4, C3, C7, C8.

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
