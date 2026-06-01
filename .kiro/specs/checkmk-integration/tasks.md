# Implementation Plan: Checkmk Integration

## Overview

Implement the Checkmk monitoring integration as an `InformationSourcePlugin` following Pabawi's established plugin architecture. The implementation proceeds bottom-up: types and configuration first, then the HTTP client layer, plugin class, registry wiring, API routes, journal integration, and finally the frontend Monitor tab. Each task builds on the previous, ending with full wiring and test coverage.

## Tasks

- [x] 1. Types, configuration schema, and ConfigService parsing
  - [x] 1.1 Create Checkmk types module (`backend/src/integrations/checkmk/types.ts`)
    - Define `CheckmkConfig`, `CheckmkHost`, `CheckmkServiceStatus`, `CheckmkEvent`, and `SERVICE_STATE_NAMES` as specified in the design
    - _Requirements: 1.1, 7.2, 8.2_

  - [x] 1.2 Add Checkmk Zod schema and integrations config parsing (`backend/src/config/schema.ts` and `backend/src/config/ConfigService.ts`)
    - Add `CheckmkConfigSchema` to `schema.ts` with URL validation (http/https prefix, max 2048 chars), required fields when enabled, and the optional `livestatus` sub-object (host required-within, port default 6557, tls default false, timeoutMs default 5000)
    - Add `checkmk` key to the integrations config type
    - Add `parseCheckmkConfig()` logic in `ConfigService.parseIntegrationsConfig()` reading `CHECKMK_ENABLED`, `CHECKMK_SERVER_URL`, `CHECKMK_SITE`, `CHECKMK_USERNAME`, `CHECKMK_PASSWORD`, `CHECKMK_SSL_VERIFY`, `CHECKMK_LIVESTATUS_HOST`, `CHECKMK_LIVESTATUS_PORT`, `CHECKMK_LIVESTATUS_TLS`, `CHECKMK_LIVESTATUS_TIMEOUT_MS`, `CHECKMK_HEALTHCHECK_INTERVAL_MS` (default 300000); build `livestatus` only when `CHECKMK_LIVESTATUS_HOST` is non-empty
    - Log warning when enabled but required vars are missing; log warning when Livestatus enabled without TLS
    - Add `getCheckmkConfig()` accessor method to ConfigService
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.1, 13.2, 13.5_

  - [x] 1.4 Add migration `014` seeding the `checkmk:read` permission (`backend/src/database/migrations/`)
    - Create `014_checkmk_permissions.sql` (+ postgres variant) following the `013` pattern: INSERT permission resource=`checkmk` action=`read`, then backfill `role_permissions` for Viewer, Operator, Administrator, Provisioner
    - Without this, the mount-level `rbacMiddleware('checkmk','read')` rejects every user with 403
    - _Requirements: 11.6_

  - [x] 1.3 Write property tests for configuration parsing
    - **Property 1: Plugin registration correctness** — for any combination of env vars, plugin registers iff CHECKMK_ENABLED="true" AND all required vars non-empty
    - **Property 2: Server URL validation** — accepts only http:// or https:// URLs ≤2048 chars with valid hostname
    - **Property 3: SSL verify parsing** — sslVerify is false iff value is exactly "false"; all other values yield true
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.7**

- [x] 2. CheckmkService — HTTP client layer
  - [x] 2.1 Implement CheckmkService (`backend/src/integrations/checkmk/CheckmkService.ts`)
    - Constructor accepts `CheckmkConfig` and `LoggerService`
    - Build base URL: `{serverUrl}/{site}/check_mk/api/1.0`
    - Attach `Authorization: Bearer {username} {password}` header on every request
    - Configure HTTPS agent with `rejectUnauthorized` based on `sslVerify` (skip for http:// URLs)
    - Log warning if sslVerify is false during construction
    - Enforce 15-second request timeout on all requests
    - Implement `testConnection()`: GET `/version` endpoint with 10s timeout
    - Implement `getHosts()`: GET `/domain-types/host_config/collections/all`
    - Implement `getServices(hostname)`: GET `/objects/host/{hostname}/collections/services` with mandatory repeated `columns=` (description, state, state_type, plugin_output, last_check, **last_state, last_state_change**)
    - (No `getEvents` here — `/domain-types/historical_event/...` does not exist; events come from Livestatus or REST `last_state` derivation, see tasks 2.3 and 3.1)
    - Never log password value; log serverUrl for debugging
    - Return empty arrays on error, log with structured metadata
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.4, 7.1, 7.2, 7.3, 12.1, 12.2_

  - [x] 2.2 Write property tests for CheckmkService
    - **Property 4: Authorization header correctness** — every request includes `Bearer {username} {password}` header
    - **Property 5: Password non-exposure** — password never appears in log output, error messages, or API responses
    - **Validates: Requirements 3.1, 3.3**

  - [x] 2.3 Implement CheckmkLivestatusClient (`backend/src/integrations/checkmk/CheckmkLivestatusClient.ts`)
    - Hand-rolled raw client over `node:net` (or `node:tls` when `tls` true; `rejectUnauthorized` from shared `sslVerify`); **no third-party Livestatus dependency**
    - `isEnabled()`: true iff `livestatus.host` configured
    - `ping()`: `GET status` (1 row) for the periodic probe
    - `getEvents(hostname, options?)`: LQL `GET log` with `Columns: time host_name service_description state state_type plugin_output`, `Filter: class = 1`, `Filter: host_name = {hostname}`, `Filter: time >= {now-7d}`, `Limit: 500`, `OutputFormat: json`; map rows to `CheckmkEvent`
    - Apply `timeoutMs` (default 5000); throw on connect/timeout/parse error so the plugin can fall back; never log secrets
    - _Requirements: 8.1, 13.3, 13.4, 13.6, 13.8_

  - [x] 2.4 Write unit tests for CheckmkLivestatusClient
    - LQL `log` query construction (class=1 / host_name / time≥now-7d / limit 500); row→`CheckmkEvent` mapping
    - TLS vs plaintext socket selection; `rejectUnauthorized` derived from `sslVerify`
    - Timeout aborts and throws (enables plugin fallback); secrets never appear in error output
    - **Validates: Requirements 8.1, 13.3, 13.4, 13.6, 13.8**

- [x] 3. CheckmkPlugin — BasePlugin extension
  - [x] 3.1 Implement CheckmkPlugin (`backend/src/integrations/checkmk/CheckmkPlugin.ts`)
    - Extend `BasePlugin` with `name = "checkmk"`, `type = "information"`, priority 8
    - Implement `InformationSourcePlugin` interface
    - `performInitialization()`: instantiate CheckmkService (and CheckmkLivestatusClient if configured) from config; validate config (throw only on config errors); call `testConnection()` with 10s timeout; on connectivity failure log a warning, mark unhealthy, and **complete init (set initialized=true) without throwing** — required for auto-recovery (the framework never retries `initialize()`)
    - `performHealthCheck()`: **throttled** — cache last `testConnection()` result + timestamp; if re-invoked within `healthCheckIntervalMs` (default 5 min) return cached status without hitting the API (bounds external probes to ≤1 `/version` + ≤1 Livestatus per interval, immune to the scheduler's 60s retry storm). On a real probe: REST `testConnection()` (10s) for overall health; when Livestatus enabled-but-down, probe it too (same throttle) and log down↔up transitions without affecting overall health
    - `getInventory()`: call `service.getHosts()`, map each to Pabawi `Node` (id=hostname, name=hostname, transport="ssh", uri=ipaddress||hostname, source="checkmk", config=attributes)
    - `getGroups()`: return empty array
    - `getNodeFacts(nodeId)`: return empty object
    - `getNodeData(nodeId, dataType)`: route "services" → mapped service array; "events" → try `livestatus.getEvents()` when enabled+reachable, else derive latest-transition-per-service from `getServices` (`previousState=last_state`, `currentState=state`, `timestamp=last_state_change`); normalise both to journal entries; else empty array
    - Map services: filter out entries missing description/state, truncate pluginOutput to 4000 chars with ellipsis
    - Map events: convert timestamps to ISO 8601, truncate output to 4096 chars, sort descending by timestamp, format as journal entries with source="checkmk", eventType="state_change", summary="{service}: {prev} → {current}", isLive=true
    - All upstream errors return empty arrays, logged with structured metadata; Livestatus errors fall back to REST silently
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.4, 7.2, 7.4, 7.5, 7.6, 8.2, 8.3, 8.5, 8.6, 8.7, 10.1, 10.2, 10.4, 12.1, 12.4, 12.5, 12.6, 13.6, 13.7_

  - [x] 3.2 Write property tests for CheckmkPlugin mappings
    - **Property 6: Host-to-Node mapping** — any valid CheckmkHost maps to correct Node fields
    - **Property 7: Service mapping and filtering** — only services with description+state are returned; pluginOutput truncated to 4000 chars
    - **Property 8: Event mapping and ordering** — events sorted descending by timestamp, output truncated to 4096 chars (both sources)
    - **Property 10: Journal entry mapping** — each event produces correct journal entry shape with source, eventType, summary format, isLive=true
    - **Property 11: Graceful degradation** — any fetch failure returns empty array without throwing
    - **Validates: Requirements 5.2, 5.3, 6.1, 7.2, 7.6, 8.3, 8.5, 10.2, 12.1**

  - [x] 3.3 Write unit tests for CheckmkPlugin init & event fallback behavior
    - Init with REST unreachable → `initialized === true`, unhealthy, no throw; subsequent successful health check flips healthy without re-init (Req 2.3 / 12.6)
    - Init with invalid config → throws
    - events: Livestatus reachable → Livestatus events; Livestatus unreachable/timeout → REST-derived events; Livestatus failure never flips overall health
    - REST derivation omits services where `last_state === state` (no synthetic OK→OK)
    - **Validates: Requirements 2.3, 8.2, 8.6, 12.6, 13.6, 13.7**

- [x] 4. Plugin registry and wiring
  - [x] 4.1 Add CheckmkPlugin to the plugin registry (`backend/src/plugins/registry.ts`)
    - Add import for `CheckmkPlugin`
    - Add registry entry: name="checkmk", type="information", priority=8
    - `resolveConfig`: return null if `checkmkConfig?.serverUrl` is falsy
    - `create`: instantiate `CheckmkPlugin(deps.logger, deps.performanceMonitor)`
    - _Requirements: 2.6, 1.2, 1.3_

  - [x] 4.2 Register CheckmkPlugin as a LiveSource in JournalService (`backend/src/services/journal/`)
    - Add CheckmkPlugin to the `liveSources` map under key `"checkmk"` in the JournalService constructor or server.ts wiring
    - Ensure failed fetches are silently skipped per existing `fetchLiveEntries` error handling
    - _Requirements: 10.1, 10.3, 10.4_

- [x] 5. Checkpoint — Verify backend plugin compiles and passes existing tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend API routes
  - [x] 6.1 Create monitoring router (`backend/src/routes/integrations/monitoring.ts`)
    - Export `createMonitoringRouter(container)` factory function
    - RBAC `checkmk:read` is applied at the **mount** in server.ts (task 6.2), not inside the router
    - `GET /api/nodes/:nodeId/services`: return 503 if plugin not configured, 404 if node unknown, 502 on upstream failure (30s timeout), 200 with service array on success
    - `GET /api/nodes/:nodeId/monitoring-events`: accept optional `limit` query param (1-1000, default 200), same error responses (retained for API completeness; no frontend consumer in v1.4.0)
    - Use `asyncHandler` wrapper, structured error responses with error codes (`CHECKMK_NOT_CONFIGURED`, `NODE_NOT_FOUND`)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 6.2 Mount monitoring router in server.ts
    - Mount unconditionally under `/api/nodes` with the standard wrapper chain: `authMiddleware, rateLimitMiddleware, rbacMiddleware('checkmk','read'), createMonitoringRouter(container)` — matching the existing `/api/nodes` routers (mount-level RBAC). Verify route ordering doesn't shadow `:nodeId/services` / `:nodeId/monitoring-events`
    - _Requirements: 11.1, 11.2, 11.5, 11.6_

  - [x] 6.3 Write unit tests for monitoring routes (`backend/test/unit/monitoring.routes.test.ts`)
    - Test 503 when plugin not configured
    - Test 404 for unknown node
    - Test 502 on upstream failure
    - Test 401 without JWT
    - Test 403 without `checkmk:read` permission
    - Test successful responses with correct shape
    - _Requirements: 11.1–11.7_

  - [x] 6.4 Add Checkmk MCP tools (`backend/src/mcp/`)
    - Add `monitoring_services_get: { resource: 'checkmk', action: 'read' }` and `monitoring_events_get: { resource: 'checkmk', action: 'read' }` to `TOOL_PERMISSIONS` in `McpServer.ts`
    - Register `monitoring_services_get(nodeId)` and `monitoring_events_get(nodeId, limit?)` in `McpToolHandlers.registerAllTools`, calling `getNodeData(nodeId, "services"|"events")`
    - Add `summariseService` to `McpOutputSummariser`; reuse `summariseJournalEntry` for events
    - Return MCP error result (not throw) when plugin disabled / node unknown; update the "8 tools" → "10 tools" count and `docs/mcp.md`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 6.5 Write unit tests for the Checkmk MCP tools
    - Permission denial without `checkmk:read`; error result when plugin disabled / node unknown; summarised shape for services and events
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

- [x] 7. Checkpoint — Verify backend compiles, routes respond correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend API layer and Monitor tab
  - [x] 8.1 Create frontend API module (`frontend/src/lib/checkmkApi.ts`)
    - Export `getNodeServices(nodeId)` → `GET /api/nodes/:nodeId/services`
    - Export `getNodeMonitoringEvents(nodeId, limit?)` → `GET /api/nodes/:nodeId/monitoring-events`
    - Define `ServiceStatus` and `MonitoringEvent` interfaces
    - Use existing `get()` from `api.ts` for HTTP calls
    - _Requirements: 9.2, 11.1, 11.2_

  - [x] 8.2 Extract shared `formatRelativeTime` helper (`frontend/src/lib/`)
    - Move the duplicated `formatRelativeTime` from `NodeStatus.svelte` and `EventsViewer.svelte` into a shared lib helper; update both call sites to import it
    - _Requirements: 9.4_

  - [x] 8.3 Create MonitorTab component (`frontend/src/components/MonitorTab.svelte`)
    - Optional `folder?: string` / `labels?: Record<string,string>` props → small host header (folder path + labels), omitted when absent
    - Fetch services in `onMount` via `getNodeServices` (component remounts each tab switch → inherently live, no caching)
    - Group services by state in order: CRIT → WARN → UNKNOWN → OK; heading per group with state name and count
    - Per service: description, state badge with **semantic colors** (CRIT=red, WARN=amber, UNKNOWN=grey, OK=green — not the integration purple), plugin output truncated to 200 chars with expand toggle, last check via shared `formatRelativeTime`
    - Loading spinner during fetch
    - **Four post-loading states by HTTP status**: `200`+services → grouped list; `200`+`[]` → "No monitored services for this node" (not an error); `502` → upstream-error message + Retry button; `503`/unhealthy → "Monitoring unavailable" with the list hidden (no Retry)
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 12.3_

  - [x] 8.4 Wire Monitor tab into NodeDetailPage (`frontend/src/pages/NodeDetailPage.svelte`)
    - Add `'monitor'` to the `TabId` union and both valid-tab-param arrays
    - Render nav button only under `{#if (nodeWithMeta.sources ?? []).includes('checkmk')}`
    - Render content under `{#if activeTab === 'monitor'} <MonitorTab {nodeId} folder={...} labels={...} /> {/if}`, passing `folder`/`labels` from `(node as LinkedNode).sourceData?.checkmk?.config` (add the `sourceData` field to the page's `Node` type)
    - In `switchTab`, do **not** add `'monitor'` to `loadedTabs` and never write `dataCache['monitor']` (preserves live, uncached fetch)
    - _Requirements: 9.1, 9.2, 9.9_

  - [x] 8.5 Write property test for service grouping logic
    - **Property 9: Service grouping order** — for any array of services with mixed states, grouping produces CRIT first, then WARN, then UNKNOWN, then OK with correct counts
    - **Validates: Requirements 9.3**

- [x] 9. Frontend integration colors and journal display
  - [x] 9.1 Register the checkmk color in all three places
    - Backend (source of truth): add `checkmk` to `IntegrationColorService.getDefaultColors()` (served by `GET /api/integrations/colors`)
    - Frontend: add `checkmk: IntegrationColorConfig` to the `IntegrationColors` interface (else TypeScript fails) AND the `checkmk: { primary: '#8B5CF6', light: '#F5F3FF', dark: '#7C3AED' }` entry to the frontend default palette
    - _Requirements: 10.5, 16.1, 16.2, 16.3_

  - [x] 9.2 Ensure journal timeline displays Checkmk events with correct icon and color
    - Verify existing JournalTimeline component handles `source: "checkmk"` entries with `isLive: true`
    - Add a Checkmk activity/heartbeat source icon; use the `#8B5CF6` purple for source attribution (dot/icon) only — state semantics live in the Monitor tab badges, not here
    - _Requirements: 10.5_

  - [x] 9.3 Create CheckmkSetupGuide (`frontend/src/components/CheckmkSetupGuide.svelte`)
    - Follow the existing `*SetupGuide` pattern (reactive `config` state + `generateEnvSnippet()` + copy-to-clipboard); export from the `components` barrel
    - Render in `IntegrationSetupPage` under `{:else if integration === 'checkmk'}`
    - Core fields: `CHECKMK_ENABLED`, `CHECKMK_SERVER_URL`, `CHECKMK_SITE`, `CHECKMK_USERNAME`, `CHECKMK_PASSWORD`, `CHECKMK_SSL_VERIFY`
    - `showAdvanced` toggle for the Livestatus group (`CHECKMK_LIVESTATUS_HOST/PORT/TLS/TIMEOUT_MS`) with a note re: full event history and plaintext-6557 being unencrypted
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 10. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation uses TypeScript
- All property-based tests use `fast-check` with minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 8, "tasks": ["6.5", "8.1", "8.2", "9.1", "9.3"] },
    { "id": 9, "tasks": ["8.3", "9.2"] },
    { "id": 10, "tasks": ["8.4", "8.5"] }
  ]
}
```
