# Requirements Document

## Introduction

Checkmk monitoring integration for Pabawi v1.4.0. Adds live monitoring data from Checkmk into Pabawi's unified infrastructure view: host inventory discovery, service monitoring status, and service **state-change events**. All data is fetched live (no caching) and displayed in a dedicated "Monitor" tab on the node detail page and in the node journal timeline.

State-change events are sourced from the Checkmk **Livestatus** `log` table when a Livestatus endpoint is configured and reachable (full history), and otherwise fall back to the latest transition per service derived from the REST API service-status response. See [ADR 0001](../../../docs/adr/0001-checkmk-events-source.md).

## Glossary

- **Checkmk_Plugin**: The Pabawi integration plugin that communicates with the Checkmk REST API (and optionally Livestatus) to retrieve monitoring data
- **REST_Source**: The Checkmk REST API v1 at `{proto}://{host}/{site}/check_mk/api/1.0/` (the literal version segment is `1.0`; `v1` is the conceptual alias). Authenticated with a Bearer automation user over HTTPS. Source of host inventory and live service status.
- **Livestatus_Source**: The Checkmk Livestatus `log` table reached over raw TCP (default port 6557, optional TLS). Source of full service state-change history. Optional and secondary to the REST_Source.
- **Service**: A monitored service on a Checkmk host with a state (OK=0, WARN=1, CRIT=2, UNKNOWN=3, PEND=pending)
- **Service_State**: The numeric monitoring state of a service: 0 (OK), 1 (WARN), 2 (CRIT), 3 (UNKNOWN)
- **State_Change_Event**: A transition of a Service from one Service_State to another at a point in time. This is **not** a Checkmk Event Console event — the integration does not use the Event Console. Sourced from Livestatus `log` (class=1 alerts) or, in fallback, from the REST `last_state`→`state` columns.
- **Monitor_Tab**: The frontend tab on the node detail page displaying live service monitoring status
- **Node_Journal**: The unified timeline of events for a node, aggregating entries from all integration sources
- **IntegrationManager**: Pabawi's central plugin registry that handles lifecycle, health aggregation, and data routing
- **ConfigService**: Pabawi's configuration service backed by environment variables with Zod validation
- **Node_Linking**: The process of matching a Checkmk host to an existing Pabawi node by hostname

## Requirements

### Requirement 1: Plugin Configuration

**User Story:** As an infrastructure operator, I want to configure the Checkmk integration via environment variables, so that I can connect Pabawi to my Checkmk instance without modifying code.

#### Acceptance Criteria

1. THE ConfigService SHALL accept the following environment variables for Checkmk configuration: CHECKMK_ENABLED, CHECKMK_SERVER_URL, CHECKMK_SITE, CHECKMK_USERNAME, CHECKMK_PASSWORD, CHECKMK_SSL_VERIFY, CHECKMK_LIVESTATUS_HOST, CHECKMK_LIVESTATUS_PORT, CHECKMK_LIVESTATUS_TLS, CHECKMK_LIVESTATUS_TIMEOUT_MS, CHECKMK_HEALTHCHECK_INTERVAL_MS
2. WHEN CHECKMK_ENABLED is set to exactly "true" (case-sensitive) and CHECKMK_SERVER_URL and CHECKMK_SITE and CHECKMK_USERNAME and CHECKMK_PASSWORD are all provided as non-empty strings, THE Checkmk_Plugin SHALL be registered with the IntegrationManager
3. WHEN CHECKMK_ENABLED is not set, is empty, or is set to any value other than "true", THE Checkmk_Plugin SHALL not be registered with the IntegrationManager
4. IF CHECKMK_ENABLED is "true" and any of CHECKMK_SERVER_URL, CHECKMK_SITE, CHECKMK_USERNAME, or CHECKMK_PASSWORD is missing or empty, THEN THE Checkmk_Plugin SHALL log a warning-level configuration error indicating which variables are missing and shall not register with the IntegrationManager
5. THE ConfigService SHALL validate that CHECKMK_SERVER_URL begins with "http://" or "https://", contains a valid hostname, and does not exceed 2048 characters in length
6. THE ConfigService SHALL default CHECKMK_SSL_VERIFY to true when the variable is not set or is empty
7. IF CHECKMK_SSL_VERIFY is set to "false" (case-sensitive), THEN THE ConfigService SHALL configure the plugin to skip TLS certificate verification; any other non-empty value SHALL be treated as true

### Requirement 2: Plugin Lifecycle

**User Story:** As an infrastructure operator, I want the Checkmk plugin to follow Pabawi's standard plugin lifecycle, so that it integrates seamlessly with the existing plugin architecture.

#### Acceptance Criteria

1. THE Checkmk_Plugin SHALL extend BasePlugin with type "information" and registration priority 8 (used by IntegrationManager inventory dedup only; the Checkmk_Plugin is intentionally absent from `NodeLinkingService.SOURCE_PRIORITY` so it never overrides identity/transport from richer sources)
2. WHEN the Checkmk_Plugin is initialized, THE Checkmk_Plugin SHALL validate connectivity to the REST_Source by performing a test request to the REST version endpoint (`GET /version`) with a timeout of 10 seconds
3. IF the REST_Source is unreachable or returns a non-200 status during initialization, THEN THE Checkmk_Plugin SHALL log a warning with the failure reason, mark itself unhealthy, and COMPLETE initialization (set initialized=true) without throwing; initialization SHALL throw only on configuration errors (invalid/missing config). This allows automatic recovery per Requirement 12.6 without a restart. (Rationale: the framework's `healthCheck()` short-circuits to unhealthy while `initialized` is false and never retries `initialize()`, so a throwing init would permanently disable the plugin until restart — see ADR 0001 context.)
4. WHEN the Checkmk_Plugin performs a health check, THE Checkmk_Plugin SHALL send a request to the REST version endpoint with a timeout of 10 seconds and report healthy if the response status is 200
5. IF the Checkmk_API is unreachable or returns a non-200 status during health check, THEN THE Checkmk_Plugin SHALL report unhealthy with an error message indicating the HTTP status code or network error encountered
6. THE Checkmk_Plugin SHALL be declared in the plugin registry at `backend/src/plugins/registry.ts` as a PluginRegistryEntry with a resolveConfig function that returns null when the Checkmk API URL is not configured
7. THE Checkmk_Plugin SHALL **throttle** its health probes: `performHealthCheck` SHALL cache the last `testConnection` result with a timestamp and, if invoked again within `CHECKMK_HEALTHCHECK_INTERVAL_MS` (parsed by ConfigService, default `300000` = 5 minutes), SHALL return the cached status **without** issuing a new request to the REST_Source. This bounds external API impact to at most one `/version` probe per interval **regardless** of how often the IntegrationManager scheduler invokes the health check (including the global 60-second unhealthy-retry storm). The Livestatus health probe (Requirement 13.7) SHALL reuse the same throttle window rather than adding an independent cadence.
8. AS A CONSEQUENCE of the throttle (2.7), recovery detection (Requirement 12.5/12.6) is bounded by `CHECKMK_HEALTHCHECK_INTERVAL_MS` — the plugin's effective health-check cycle is the throttle interval, not the scheduler interval.

### Requirement 3: Authentication

**User Story:** As an infrastructure operator, I want the Checkmk plugin to authenticate using automation user credentials, so that API access is secure and auditable.

#### Acceptance Criteria

1. THE Checkmk_Plugin SHALL include the HTTP header `Authorization: Bearer {username} {password}` on every request to the Checkmk_API, where username and password are the values of CHECKMK_USERNAME and CHECKMK_PASSWORD
2. IF the Checkmk_API returns a 401 or 403 response, THEN THE Checkmk_Plugin SHALL log the authentication failure with structured metadata including the response status code, return empty results to the caller without throwing an exception, and report unhealthy status to the IntegrationManager
3. THE Checkmk_Plugin SHALL never log or expose the CHECKMK_PASSWORD value in any log output, error message, or API response

### Requirement 4: SSL/TLS Configuration

**User Story:** As an infrastructure operator, I want to configure SSL/TLS verification for the Checkmk connection, so that I can use self-signed certificates in development while enforcing verification in production.

#### Acceptance Criteria

1. IF CHECKMK_SSL_VERIFY is true, THEN THE Checkmk_Plugin SHALL configure the HTTPS agent with certificate verification enabled (rejectUnauthorized=true) for all requests to the Checkmk_API
2. IF CHECKMK_SSL_VERIFY is false, THEN THE Checkmk_Plugin SHALL configure the HTTPS agent with certificate verification disabled (rejectUnauthorized=false) for all requests to the Checkmk_API
3. IF CHECKMK_SSL_VERIFY is false, THEN THE Checkmk_Plugin SHALL log a warning indicating that TLS certificate verification is disabled during plugin initialization
4. IF CHECKMK_SERVER_URL uses the "http://" scheme, THEN THE Checkmk_Plugin SHALL connect without TLS and ignore the CHECKMK_SSL_VERIFY setting

### Requirement 5: Host Inventory Discovery

**User Story:** As an infrastructure operator, I want Pabawi to discover hosts from Checkmk and merge them into the unified inventory, so that I can see all monitored hosts alongside hosts from other sources.

#### Acceptance Criteria

1. WHEN the IntegrationManager requests inventory from the Checkmk_Plugin, THE Checkmk_Plugin SHALL fetch all hosts from `GET /domain-types/host_config/collections/all` on the Checkmk_API
2. THE Checkmk_Plugin SHALL map each Checkmk host to a Pabawi Node with: id set to the hostname, name set to the hostname, transport set to "ssh", uri set to the IP address if available or the hostname otherwise, source set to "checkmk", and config set to an empty object
3. THE Checkmk_Plugin SHALL include Checkmk host attributes (IP address, folder path, labels) in the Node config field as key-value pairs
4. THE Checkmk_Plugin SHALL fetch inventory live on each request without caching the results
5. IF the Checkmk_API returns an error during inventory fetch, THEN THE Checkmk_Plugin SHALL return an empty array and log the error with the Checkmk_API URL and the HTTP status code or network error description

### Requirement 6: Node Linking

**User Story:** As an infrastructure operator, I want Checkmk hosts to be linked to existing Pabawi nodes by hostname, so that monitoring data appears on the correct node regardless of which source discovered it first.

#### Acceptance Criteria

1. THE Checkmk_Plugin SHALL set the Checkmk hostname as both the `name` and `id` fields of each Node object returned by getInventory, so that NodeLinkingService can extract it as the linking identifier
2. WHEN a Checkmk host has the same hostname (compared case-insensitively) as a node from another source, THE NodeLinkingService SHALL merge them into a single LinkedNode with `linked` set to true and both source names present in the `sources` array
3. IF a Checkmk host hostname does not match any node from another source, THEN THE NodeLinkingService SHALL present it as an unlinked node with `linked` set to false and `sources` containing only "checkmk"
4. THE Checkmk_Plugin SHALL implement the getGroups method returning an empty array (Checkmk does not provide group data through this integration)

### Requirement 7: Live Service Monitoring Status

**User Story:** As an infrastructure operator, I want to see the current monitoring status of all services on a node fetched live from Checkmk, so that I have real-time visibility into service health.

#### Acceptance Criteria

1. WHEN service status is requested for a node, THE Checkmk_Plugin SHALL fetch services from `GET /objects/host/{hostname}/collections/services` on the REST_Source, explicitly requesting the Livestatus columns via repeated `columns=` query parameters: `columns=description`, `columns=state`, `columns=state_type`, `columns=plugin_output`, `columns=last_check`, `columns=last_state`, and `columns=last_state_change`. (Without explicit `columns`, Checkmk returns only descriptions and links — none of the fields below.)
2. THE Checkmk_Plugin SHALL return each service with: description (string), state (integer 0-3 mapping to OK, WARN, CRIT, UNKNOWN), state_type (integer 0 for soft, 1 for hard), plugin_output (string, maximum 4000 characters truncated with ellipsis if longer), last_check (integer, unix timestamp in seconds), and — to support the REST event fallback (Requirement 8) — last_state (Service_State 0-3) and last_state_change (integer, unix timestamp in seconds)
3. THE Checkmk_Plugin SHALL fetch service data live on each request without caching
4. IF the Checkmk_API returns an error for a specific host, THEN THE Checkmk_Plugin SHALL return an empty service list and log the error with structured metadata including the hostname, integration name, and operation
5. THE Checkmk_Plugin SHALL expose service data through the getNodeData method with dataType "services"
6. IF a service returned by the Checkmk_API is missing the description or state field, THEN THE Checkmk_Plugin SHALL omit that service from the returned list

### Requirement 8: State Change Events

**User Story:** As an infrastructure operator, I want to see service state-change events for a node from Checkmk, so that I can understand the monitoring history and correlate issues.

> **Note:** The original `GET /domain-types/historical_event/collections/all` endpoint does not exist in the Checkmk REST API v1. State-change events are sourced per [ADR 0001](../../../docs/adr/0001-checkmk-events-source.md): Livestatus when available, REST fallback otherwise.

#### Acceptance Criteria

1. WHEN events are requested for a node AND the Livestatus_Source is configured (`CHECKMK_LIVESTATUS_HOST` set) AND reachable, THE Checkmk_Plugin SHALL fetch state-change events from the Livestatus `log` table filtered by `Filter: class = 1` (alerts), `Filter: host_name = {hostname}`, and `Filter: time >= {now - 7 days}`, requesting columns `time host_name service_description state state_type plugin_output`, limited to a maximum of 500 events
2. WHEN events are requested for a node AND the Livestatus_Source is not configured OR not reachable for that request, THE Checkmk_Plugin SHALL fall back to deriving the single most-recent transition per service from the REST service-status response (Requirement 7), producing one State_Change_Event per service as `last_state → state @ last_state_change`, BUT ONLY for services where `last_state != state` (a real transition occurred). Services whose `last_state` equals `state`, or whose `last_state_change` is unset/zero, SHALL be omitted to avoid emitting synthetic "OK → OK" non-events
3. THE Checkmk_Plugin SHALL return each event with: timestamp, service description, previous state (Service_State 0-3), current state (Service_State 0-3), and output text truncated to 4096 characters
4. THE Checkmk_Plugin SHALL fetch event data live on each request without caching
5. THE Checkmk_Plugin SHALL return events sorted by timestamp in descending order (most recent first)
6. IF the Livestatus_Source errors or times out during event fetch, THEN THE Checkmk_Plugin SHALL fall back to the REST derivation (8.2) for that request without throwing; IF the REST fetch also errors, THEN THE Checkmk_Plugin SHALL return an empty event list and log the error
7. THE Checkmk_Plugin SHALL expose event data through the getNodeData method with dataType "events"

### Requirement 9: Frontend Monitor Tab

**User Story:** As an infrastructure operator, I want a "Monitor" tab on the node detail page that displays live service status from Checkmk, so that I can quickly assess the health of all services on a node.

#### Acceptance Criteria

1. THE Monitor_Tab nav button SHALL appear on the node detail page if and only if the node's `sources` array includes `"checkmk"` (this already implies the plugin is enabled and the host is linked, so no separate enabled-flag check is required client-side)
2. THE Monitor_Tab content SHALL be rendered under `{#if activeTab === 'monitor'}` so it remounts on each tab switch and fetches live service data from `GET /api/nodes/:nodeId/services` in its `onMount`; it SHALL NOT be added to the page's `loadedTabs`/`dataCache`, so results are never cached across switches
3. THE Monitor_Tab SHALL display services grouped by state in the order: CRIT first, then WARN, then UNKNOWN, then OK, with a heading per group indicating the state name and the count of services in that group
4. THE Monitor_Tab SHALL display for each service: the service description, current state as a visually distinct badge using **semantic monitoring colors** (CRIT=red, WARN=amber, UNKNOWN=grey, OK=green — not the checkmk integration color), plugin output text truncated to 200 characters with an option to expand, and last check timestamp in relative time format (via the shared `formatRelativeTime` helper)
5. WHILE service data is loading, THE Monitor_Tab SHALL display a loading indicator
6. IF the backend returns a `502` (upstream Checkmk failure/timeout), THEN THE Monitor_Tab SHALL display an error message indicating the upstream failure and a Retry button that re-fetches service data when activated
7. IF the backend returns `200` with an empty service list, THEN THE Monitor_Tab SHALL display a "No monitored services for this node" message (an empty success is not an error and SHALL NOT show the error/Retry UI)
8. IF the backend returns `503 CHECKMK_NOT_CONFIGURED` or the plugin is otherwise unhealthy, THEN THE Monitor_Tab SHALL display a distinct "Monitoring unavailable" message and hide the service list (no Retry, since configuration does not change at runtime) — see Requirement 12.3

> **Design note:** these four post-loading states (data / empty / upstream-error+retry / unavailable) are mapped directly from the HTTP status of `GET /api/nodes/:nodeId/services`, so an operator can distinguish "host has no checks" from "Checkmk is down" from "Checkmk not configured".

1. THE Monitor_Tab SHALL display a small header showing the linked host's Checkmk **folder path** and **labels**, sourced from the linked node's `sourceData["checkmk"].config` (`folder`, `labels`) passed in as props by NodeDetailPage — not from the `/services` response (whose contract stays a pure service array). The header SHALL be omitted gracefully when folder/labels are absent.

### Requirement 10: Journal Integration

**User Story:** As an infrastructure operator, I want Checkmk state-change events to appear in the node journal timeline, so that I can see monitoring events alongside other infrastructure events in chronological order.

#### Acceptance Criteria

1. THE Checkmk_Plugin SHALL implement the LiveSource interface (getNodeData and isInitialized methods) and be registered in the JournalService live sources map under the key "checkmk"
2. WHEN the JournalService requests events for a node by calling getNodeData with dataType "events", THE Checkmk_Plugin SHALL return an array of journal entry objects where each entry has source "checkmk", eventType "state_change", a summary containing the service name and state transition (e.g., "HTTP OK → CRITICAL"), a timestamp in ISO 8601 format, and a details object containing the full Checkmk event data
3. IF the Checkmk_Plugin fails to return events during timeline aggregation (connection error, timeout, or invalid response), THEN THE JournalService SHALL skip the Checkmk source gracefully and return the timeline without Checkmk events, without surfacing an error to the user
4. WHEN the JournalService aggregates the timeline for a node, THE Checkmk_Plugin events SHALL be merged with database-stored events, sorted by timestamp descending, and marked with isLive set to true
5. THE Node_Journal SHALL display Checkmk events with a source-specific activity/heartbeat icon and the checkmk integration color (`#8B5CF6` purple) for source attribution (dot/icon), consistent with the integrationColors convention and visually distinguishing them from other event sources. (This purple is used only for source attribution — service-state badges use semantic colors per Requirement 9.4.)

### Requirement 11: Backend API Endpoints

**User Story:** As a frontend developer, I want dedicated API endpoints for Checkmk monitoring data, so that the Monitor tab can fetch live service status and events.

#### Acceptance Criteria

1. THE backend SHALL expose `GET /api/nodes/:nodeId/services` that returns service monitoring data for the specified node from the Checkmk_Plugin, including for each service: service name, current state (OK, WARN, CRIT, UNKNOWN), plugin output summary, and last state-change timestamp
2. THE backend SHALL expose `GET /api/nodes/:nodeId/monitoring-events` that returns state-change events for the specified node from the Checkmk_Plugin, limited to the most recent 200 events by default, supporting an optional `limit` query parameter (1 to 1000)
3. IF the Checkmk_Plugin is not enabled, THEN THE backend SHALL return HTTP 503 with error code `CHECKMK_NOT_CONFIGURED` for monitoring-specific endpoints
4. IF the `:nodeId` path parameter does not match a known node in the Checkmk_Plugin, THEN THE backend SHALL return HTTP 404 with error code `NODE_NOT_FOUND`
5. THE backend SHALL require JWT authentication (via the existing auth middleware) for all monitoring endpoints
6. THE backend SHALL enforce RBAC permission `checkmk:read` (resource `checkmk`, action `read` — following the repo's per-integration convention, e.g. `azure:read`, `ssh:read`) on all monitoring endpoints, applied at the router mount in server.ts via `rbacMiddleware('checkmk', 'read')`, consistent with the other `/api/nodes` routers. A new database migration (`014`) SHALL seed this permission and backfill it to the Viewer, Operator, Administrator, and Provisioner roles; without it every user receives 403.

> **Note:** `GET /api/nodes/:nodeId/monitoring-events` (11.2) has no frontend consumer in v1.4.0 — the journal timeline obtains events directly via the LiveSource interface. It is retained deliberately for API completeness / future use.
1. IF the Checkmk_Plugin is enabled but the upstream Checkmk API request fails or times out (within 30 seconds), THEN THE backend SHALL return HTTP 502 with an error response indicating the upstream failure reason

### Requirement 12: Error Handling and Graceful Degradation

**User Story:** As an infrastructure operator, I want the Checkmk integration to degrade gracefully when Checkmk is unreachable, so that the rest of Pabawi continues to function normally.

#### Acceptance Criteria

1. IF the Checkmk_API is unreachable during any data fetch (inventory, services, or events), THEN THE Checkmk_Plugin SHALL log the error using LoggerService with structured metadata (component, integration, operation, hostname where applicable) and return an empty array to the caller without throwing exceptions
2. IF the Checkmk_API does not respond within 15 seconds of a request being sent, THEN THE Checkmk_Plugin SHALL abort the request and return an empty array to the caller
3. WHILE the Checkmk_Plugin is unhealthy or not configured (backend returns `503`), THE Monitor_Tab SHALL display a "Monitoring unavailable" message and SHALL hide the service list (per Requirement 9.8), distinct from the `502` upstream-error+Retry state (Requirement 9.6) and the empty-list state (Requirement 9.7)
4. THE Checkmk_Plugin SHALL not block or delay inventory aggregation from other sources when the Checkmk_API is slow or unreachable
5. IF the Checkmk_Plugin transitions from healthy to unhealthy after a failed health check, THEN THE Checkmk_Plugin SHALL log the state transition and update its health status in the IntegrationManager within 1 health check cycle
6. WHEN the REST_Source becomes reachable again after a period of unavailability, THE Checkmk_Plugin SHALL restore healthy status on the next successful health check without requiring a restart (enabled by the non-fatal initialization of Requirement 2.3)

### Requirement 13: Livestatus Source Configuration and Fallback

**User Story:** As an infrastructure operator, I want to optionally point Pabawi at a Checkmk Livestatus endpoint so that the journal shows full service state-change history, while still working without it.

#### Acceptance Criteria

1. THE ConfigService SHALL parse `CHECKMK_LIVESTATUS_HOST` (string, unset = Livestatus disabled), `CHECKMK_LIVESTATUS_PORT` (integer, default 6557), `CHECKMK_LIVESTATUS_TLS` (boolean, default false; parsed `true` only when exactly `"true"`), and `CHECKMK_LIVESTATUS_TIMEOUT_MS` (integer, default 5000)
2. THE Livestatus_Source SHALL be considered enabled if and only if `CHECKMK_LIVESTATUS_HOST` is a non-empty string
3. WHEN the Livestatus_Source is enabled, THE Checkmk_Plugin SHALL connect using a hand-rolled raw TCP client (Node `net`), or a TLS client (Node `tls`) when `CHECKMK_LIVESTATUS_TLS` is true; no third-party Livestatus library SHALL be introduced
4. WHEN `CHECKMK_LIVESTATUS_TLS` is true, THE Checkmk_Plugin SHALL reuse `CHECKMK_SSL_VERIFY` to decide certificate verification (`rejectUnauthorized`) for the Livestatus TLS connection — a single trust decision governs both channels
5. IF the Livestatus_Source is enabled without TLS, THEN THE Checkmk_Plugin SHALL log a warning at initialization that Livestatus traffic is unencrypted (mirroring the `CHECKMK_SSL_VERIFY=false` warning)
6. THE Checkmk_Plugin SHALL attempt the Livestatus_Source per events request, applying the `CHECKMK_LIVESTATUS_TIMEOUT_MS` timeout, and fall back to the REST derivation on connect/timeout/parse error (per Requirement 8.6) — Livestatus failures SHALL NOT affect the plugin's overall health, which remains REST-driven
7. WHILE the Livestatus_Source is enabled but found unreachable, THE Checkmk_Plugin SHALL run a Livestatus health probe on the same throttled cadence as the REST probe (Requirement 2.7 — at most once per `CHECKMK_HEALTHCHECK_INTERVAL_MS`, not an independent timer) and log down→up / up→down transitions, without flipping the plugin's overall (REST-driven) health status
8. THE Checkmk_Plugin SHALL never log or expose `CHECKMK_PASSWORD` or any Livestatus secret in connection error output

### Requirement 14: MCP Tools

**User Story:** As an LLM client operator, I want to query Checkmk monitoring data through the MCP server, so that an assistant can reason about service health.

#### Acceptance Criteria

1. THE MCP server SHALL register two additional read-only tools: `monitoring_services_get` (input `nodeId`) returning live service status, and `monitoring_events_get` (input `nodeId`, optional `limit` 1-1000 default 200) returning state-change events
2. BOTH tools SHALL be gated by RBAC resource `checkmk`, action `read` via the existing `TOOL_PERMISSIONS` map and `checkPermission` flow; since the mcp-service user is auto-assigned all `*:read` permissions, migration `014` (Requirement 11.6) is sufficient to grant access
3. `monitoring_services_get` SHALL return, per service, a summarised shape (description, state name, plugin output, last check) via `McpOutputSummariser`, omitting verbose fields to remain token-efficient
4. `monitoring_events_get` SHALL return summarised state-change events (timestamp, service, transition, output) — note this overlaps `journal_query`, which also surfaces checkmk events; the dedicated tool provides a checkmk-scoped events query
5. IF the Checkmk_Plugin is not enabled OR the node is unknown, THEN each tool SHALL return an MCP error result (not throw), consistent with existing tool error handling
6. THE MCP documentation (`docs/mcp.md`) and the "N read-only tools" count SHALL be updated to reflect the two new tools (8 → 10)

### Requirement 15: Setup Guide Page

**User Story:** As an infrastructure operator, I want a Checkmk setup guide in the integration setup UI, so that I can generate the correct environment configuration.

#### Acceptance Criteria

1. THE frontend SHALL provide a `CheckmkSetupGuide` component, exported from the `components` barrel and rendered by `IntegrationSetupPage` under `{:else if integration === 'checkmk'}`, following the existing `*SetupGuide` pattern (reactive config state + `generateEnvSnippet()` + copy-to-clipboard)
2. THE CheckmkSetupGuide SHALL generate env snippets for `CHECKMK_ENABLED`, `CHECKMK_SERVER_URL`, `CHECKMK_SITE`, `CHECKMK_USERNAME`, `CHECKMK_PASSWORD`, and `CHECKMK_SSL_VERIFY`
3. THE CheckmkSetupGuide SHALL expose the Livestatus settings (`CHECKMK_LIVESTATUS_HOST`, `CHECKMK_LIVESTATUS_PORT`, `CHECKMK_LIVESTATUS_TLS`, `CHECKMK_LIVESTATUS_TIMEOUT_MS`) under an "Advanced" toggle (mirroring `HieraSetupGuide.showAdvanced`), with inline guidance that Livestatus enables full event history and that plaintext 6557 is unencrypted

### Requirement 16: Integration Color Registration (Backend + Frontend)

**User Story:** As a developer, I want the checkmk color registered consistently, so that the UI renders the source color from the authoritative backend palette.

#### Acceptance Criteria

1. THE backend `IntegrationColorService.getDefaultColors()` SHALL include a `checkmk` entry (`primary: '#8B5CF6'`, light/dark variants) — this is the source of truth served by `GET /api/integrations/colors`
2. THE frontend `IntegrationColors` TypeScript interface SHALL declare a `checkmk: IntegrationColorConfig` key, and the frontend default palette SHALL include the matching `checkmk` entry as a fallback
3. The checkmk color SHALL be used only for source attribution (journal dot/icon), never for service-state badges (Requirement 9.4)
