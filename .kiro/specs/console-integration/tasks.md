# Implementation Plan: Console Integration

## Overview

This plan implements the console integration framework for Pabawi — a plugin-based system that enables remote console/terminal access (VNC, terminal) to managed infrastructure nodes. The initial implementation targets Proxmox VNC consoles. The work is broken into phases: core types and configuration, session management, WebSocket proxy, Proxmox provider, REST routes, and frontend UI.

## Tasks

- [ ] 1. Core types, configuration, and database schema
  - [ ] 1.1 Define ConsolePlugin interface and related types
    - Create `backend/src/integrations/console/types.ts` with `ConsoleTransport`, `ConsoleCapability`, `ConsoleSessionState`, `ConsoleSessionStatus`, `ConsoleSession`, and `ConsolePlugin` interface extending `IntegrationPlugin`
    - Export all types for use by providers, session manager, and routes
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

  - [ ] 1.2 Add console configuration to ConfigService and schema
    - Add `ConsoleConfigSchema` to `backend/src/config/schema.ts` with `sessionTimeoutMs`, `maxSessionDuration`, `maxConcurrentSessions`, `heartbeatIntervalMs`
    - Add console config parsing in `ConfigService` from `CONSOLE_*` env vars with validation (positive int, min 1 for concurrent sessions, heartbeat < timeout cross-check)
    - Log warnings for invalid values and fall back to defaults
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 1.3 Write property test for configuration parsing (Property 14)
    - **Property 14: Configuration parsing with defaults**
    - Generate random env var values (non-numeric, negative, zero, floats, valid) and verify defaults are applied for invalid values, heartbeat >= timeout triggers both defaults
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**

  - [ ] 1.4 Create database migration 018_console_sessions.sql
    - Create `backend/src/database/migrations/018_console_sessions.sql` with `console_sessions` table (snake_case columns), indexes on `user_id`, `state`, `token`
    - Include CHECK constraints for `state` and `transport` columns
    - _Requirements: 2.7_

  - [ ] 1.5 Create database migration 019_console_permissions.sql
    - Create `backend/src/database/migrations/019_console_permissions.sql` inserting `console:access` and `console:admin` permissions
    - Grant `console:access` to operator and admin roles, `console:admin` to admin only
    - _Requirements: 6.1, 6.7_

- [ ] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. ConsoleSessionManager service
  - [ ] 3.1 Implement ConsoleSessionManager
    - Create `backend/src/services/ConsoleSessionManager.ts` with token generation (crypto.randomBytes 32+), session CRUD, token validation (exists, <60s, not consumed, owner match), heartbeat recording, concurrent session counting, provider-level bulk termination, expired session cleanup
    - Use `DatabaseAdapter` for all DB operations with snake_case columns and camelCase aliases in SELECTs
    - Integrate `AuditLoggingService` for session create/terminate events
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 8.1, 8.2, 8.4, 8.6, 8.7_

  - [ ]* 3.2 Write property test for session token validation (Property 2)
    - **Property 2: Session token validation correctness**
    - Generate random tokens, timestamps, user IDs. Token accepted iff: exists in DB, created <60s ago, not consumed, connecting user matches owner. All others rejected.
    - **Validates: Requirements 4.2, 4.3, 5.2, 5.3, 8.1, 8.2**

  - [ ]* 3.3 Write property test for concurrent session limit (Property 7)
    - **Property 7: Concurrent session limit enforcement**
    - Generate random session counts and verify that when active count >= maxConcurrentSessions, new creation is rejected with 429 semantics.
    - **Validates: Requirements 8.6**

  - [ ]* 3.4 Write property test for session record completeness (Property 8)
    - **Property 8: Session record completeness**
    - Generate random session inputs and verify stored record always has non-null sessionId, userId, nodeId, provider, createdAt, lastHeartbeatAt.
    - **Validates: Requirements 2.7**

  - [ ]* 3.5 Write property test for audit log completeness (Property 9)
    - **Property 9: Audit log completeness for session events**
    - Generate random session create/terminate events. Verify audit entry always contains userId, nodeId, provider, action, ISO 8601 timestamp.
    - **Validates: Requirements 8.4**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. IntegrationManager extension and console availability
  - [ ] 5.1 Extend IntegrationManager with console provider support
    - Add `consoleProviders` map, `isConsolePlugin` type guard, registration logic in `registerPlugin`, and public methods `getConsoleProvider`, `getAllConsoleProviders`, `getConsoleAvailability`
    - Console availability queries all providers in parallel with 3s timeout, excludes timed-out providers, sorts results by provider name ascending
    - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 10.1_

  - [ ]* 5.2 Write property test for availability response ordering (Property 10)
    - **Property 10: Availability response structure and ordering**
    - Generate random provider name arrays. Verify response entries contain provider name, transport, display label; entries sorted alphabetically by provider name.
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 5.3 Write property test for unsupported node empty response (Property 11)
    - **Property 11: Unsupported node returns empty availability**
    - Generate random node IDs not supported by any registered provider. Verify availability returns empty array.
    - **Validates: Requirements 3.2**

  - [ ]* 5.4 Write property test for unhealthy provider exclusion (Property 15)
    - **Property 15: Unhealthy provider exclusion**
    - Generate random provider health states. Verify unavailable/unhealthy providers are excluded from availability while healthy providers are included.
    - **Validates: Requirements 10.1**

- [ ] 6. WebSocket proxy server
  - [ ] 6.1 Implement ConsoleWebSocketProxy
    - Create `backend/src/services/ConsoleWebSocketProxy.ts` using `ws` library attached to existing HTTP server with `noServer: true`
    - Handle `upgrade` event with path-based routing (`/ws/console/vnc`, `/ws/console/terminal`)
    - Validate origin header against configured allowed origins
    - Extract and validate session token from query params via `ConsoleSessionManager`
    - Implement VNC binary relay (bidirectional, unmodified frames)
    - Implement terminal relay (UTF-8 text frames for I/O, binary frames for control messages)
    - Handle terminal resize control messages: validate columns [1,500] and rows [1,200], discard invalid
    - Discard unrecognized binary control message types or frames shorter than expected payload
    - Enforce `maxSessionDuration` limit (close with 4408)
    - Handle upstream connection timeout (close with 4504 after 10s)
    - Handle upstream drop (close with 4502, terminate session)
    - Handle client disconnect (close upstream within 5s, release resources)
    - Handle invalid/expired token (close with 4401)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.5, 8.7_

  - [ ]* 6.2 Write property test for binary frame relay integrity (Property 3)
    - **Property 3: Binary frame relay integrity**
    - Generate random binary buffers. Verify frames pass through the proxy byte-for-byte identical.
    - **Validates: Requirements 4.4**

  - [ ]* 6.3 Write property test for terminal resize validation (Property 4)
    - **Property 4: Terminal resize dimension validation**
    - Generate random column/row pairs. Verify resize propagated iff columns in [1,500] and rows in [1,200]; otherwise discarded without session termination.
    - **Validates: Requirements 5.5, 5.8**

  - [ ]* 6.4 Write property test for malformed control message resilience (Property 16)
    - **Property 16: Malformed control message resilience**
    - Generate random binary frames with unrecognized type bytes or truncated payloads. Verify discarded without session termination.
    - **Validates: Requirements 5.8**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. ProxmoxConsoleProvider
  - [ ] 8.1 Implement ProxmoxConsoleProvider
    - Create `backend/src/integrations/proxmox/ProxmoxConsoleProvider.ts` implementing `ConsolePlugin`
    - Implement `getConsoleCapabilities`: check guest exists and is running, return `websocket-vnc` capability
    - Implement `createSession`: determine guest type (qemu/lxc), verify running state, call appropriate vncproxy endpoint, build upstream WS URL, generate session token, return ConsoleSession
    - Implement `terminateSession`: return false for non-existent/already-terminated sessions without throwing
    - Implement `getSessionStatus`, `getSupportedTransports`
    - Handle auth errors, non-running guest, connection timeout, resource not found from Proxmox API
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 1.6, 1.7_

  - [ ]* 8.2 Write property test for guest type routing (Property 12)
    - **Property 12: Guest type routing correctness**
    - Generate random guest types (qemu/lxc). Verify QEMU guests use `/qemu/{vmid}/vncproxy` and LXC guests use `/lxc/{vmid}/vncproxy`.
    - **Validates: Requirements 9.4**

  - [ ]* 8.3 Write property test for non-running guest rejection (Property 13)
    - **Property 13: Non-running guest rejection**
    - Generate random guest states (running, stopped, paused, etc.). Verify session creation fails for any state other than "running" with appropriate error message.
    - **Validates: Requirements 9.6**

  - [ ]* 8.4 Write property test for provider registration (Property 1)
    - **Property 1: Console provider registration invariant**
    - Generate random plugin names. After registration with IntegrationManager, verify plugin appears in console providers map and is retrievable by name.
    - **Validates: Requirements 1.4**

- [ ] 9. Console REST routes
  - [ ] 9.1 Implement console route factory and endpoints
    - Create `backend/src/routes/console.ts` exporting `createConsoleRouter(container, integrationManager, sessionManager, db)`
    - Implement `GET /api/console/availability/:nodeId` — RBAC check `console:access`, query availability via IntegrationManager
    - Implement `POST /api/console/sessions` — RBAC check `console:access`, check concurrent limit (429), create session via provider, store session
    - Implement `DELETE /api/console/sessions/:sessionId` — RBAC check: own session needs `console:access`, other user's session needs `console:admin` (403 otherwise)
    - Implement `GET /api/console/sessions/:sessionId` — RBAC check `console:access`, return session status
    - Implement `POST /api/console/sessions/:sessionId/heartbeat` — RBAC check `console:access`, record heartbeat
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 8.3, 8.6, 10.4_

  - [ ]* 9.2 Write property test for RBAC session creation (Property 5)
    - **Property 5: RBAC enforcement for session creation**
    - Generate random user/permission combinations. Verify session creation allowed iff user holds `console:access`; otherwise 403.
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 9.3 Write property test for RBAC cross-user termination (Property 6)
    - **Property 6: RBAC enforcement for cross-user termination**
    - Generate random user/owner/permission combinations. Verify cross-user termination requires `console:admin`; own session termination needs only `console:access`.
    - **Validates: Requirements 6.4, 6.5, 6.6, 8.3**

- [ ] 10. Wire backend components together
  - [ ] 10.1 Register ProxmoxConsoleProvider and wire routes in server.ts
    - Register `ProxmoxConsoleProvider` with `IntegrationManager` in the plugin registry when Proxmox is enabled
    - Instantiate `ConsoleSessionManager` with DI container services
    - Instantiate `ConsoleWebSocketProxy` attached to the HTTP server
    - Mount console router at `/api/console`
    - On server startup, call `terminateAllForProvider` for each registered console provider (graceful restart handling)
    - Start session cleanup interval
    - _Requirements: 2.6, 9.1_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Frontend ConsoleViewer component
  - [ ] 12.1 Implement ConsoleViewer Svelte 5 component
    - Create `frontend/src/components/ConsoleViewer.svelte` accepting `nodeId` and `capabilities` props
    - Render noVNC canvas for `websocket-vnc` transport, xterm.js terminal for `websocket-terminal`
    - Display connection status indicator (`connecting`, `connected`, `disconnected`)
    - Implement heartbeat timer (30s interval while connected, stop on disconnect)
    - Handle WebSocket close codes: 4401 (auth failed), 4502 (upstream failure), 4408 (duration exceeded), 4504 (timeout) with user-facing messages and "new session" option
    - Handle unexpected close codes with reconnection prompt
    - Implement full-screen toggle for the console viewport
    - Use `navigator.sendBeacon` for terminate request on page unload/navigation away
    - Pass session token as query parameter on WebSocket URL
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ] 12.2 Implement console availability UI on node detail page
    - Add console availability fetch (non-blocking async) to the node detail page
    - Show console options when available, hide all console UI when no providers available
    - Implement retry logic: up to 3 consecutive attempts on failure, then disable retry button with "provider unavailable" message
    - _Requirements: 10.2, 10.3, 10.5_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases
- Database columns use `snake_case` with `camelCase` aliases in SELECT queries per project convention
- The WebSocket proxy uses the `ws` library attached to the shared HTTP server (no second port)
- Frontend uses noVNC for VNC transport and xterm.js for terminal transport
- All code must pass ESLint, `tsc --noEmit`, and `vitest` before proceeding to the next task

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2"] }
  ]
}
```
