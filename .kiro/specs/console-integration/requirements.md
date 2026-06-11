# Requirements Document

## Introduction

This document specifies a generic console integration framework for Pabawi. The framework introduces a new `ConsolePlugin` interface that any integration can implement to provide remote console/terminal access to VMs, containers, or cloud instances. The initial implementation targets Proxmox (VNC/noVNC), with AWS (Systems Manager Session Manager) and Azure (Serial Console/Bastion) as future consumers.

The console framework covers session lifecycle management, transport abstraction (WebSocket proxy for VNC, HTTP/SSE for terminal-based sessions), frontend UI embedding, RBAC-gated access, and discovery of console availability per node.

## Glossary

- **Console_Plugin**: A plugin interface extending the Pabawi integration system that provides remote console/terminal access to infrastructure nodes
- **Console_Session**: A server-side object representing an active console connection, tracking state, ownership, and timeout
- **Transport_Type**: The mechanism used to relay console data between the frontend and the target node (e.g., `websocket-vnc`, `websocket-terminal`, `sse-terminal`)
- **Session_Token**: A short-lived, cryptographically random token that authorizes a specific WebSocket or SSE connection to an established console session
- **Console_Provider**: A registered integration (e.g., Proxmox, AWS, Azure) that implements the Console_Plugin interface for its managed nodes
- **Integration_Manager**: The central Pabawi service that registers plugins and routes requests to the correct provider
- **Node**: A managed infrastructure entity (VM, container, or cloud instance) identified by a canonical node ID
- **RBAC_System**: The existing role-based access control system that gates feature access via resource+action permission checks
- **Heartbeat**: A periodic signal from the frontend to the backend indicating the console session is still actively used
- **Session_Timeout**: The maximum duration a console session can remain idle (no heartbeat) before automatic termination
- **noVNC**: A browser-based VNC client that communicates over WebSocket

## Requirements

### Requirement 1: ConsolePlugin Interface Definition

**User Story:** As a plugin developer, I want a well-defined ConsolePlugin interface, so that I can implement console access for any infrastructure integration.

#### Acceptance Criteria

1. THE Console_Plugin interface SHALL extend IntegrationPlugin and define methods for `getConsoleCapabilities(nodeId: string)` returning an array of `ConsoleCapability`, `createSession(nodeId: string, userId: string)` returning a `ConsoleSession` object containing at minimum a session identifier and connection details, `terminateSession(sessionId: string)` returning a boolean indicating success, and `getSessionStatus(sessionId: string)` returning a `ConsoleSessionStatus` object containing the current session state
2. THE Console_Plugin interface SHALL define a `ConsoleCapability` type containing a `transport` field constrained to a string union of supported protocols (e.g., `websocket-vnc`, `websocket-terminal`), a `displayName` field of at most 100 characters, and a `connectionSchema` field represented as a record describing the required connection parameters for that transport
3. THE Console_Plugin interface SHALL define a `ConsoleSessionStatus` type containing a `state` field constrained to one of `creating`, `active`, `terminated`, or `failed`, a `startedAt` timestamp, and an optional `error` field present when state is `failed`
4. WHEN a plugin implements Console_Plugin, THE Integration_Manager SHALL store the plugin in a dedicated console providers map (analogous to the existing `executionTools` and `informationSources` maps) during registration
5. THE Console_Plugin interface SHALL define a `getSupportedTransports()` method that returns an array of strings representing the transport protocols the provider supports, containing at least 1 and at most 10 entries
6. IF `createSession` is called with a `nodeId` for which the plugin has no console capability, THEN THE Console_Plugin SHALL reject with a typed error indicating the node does not support console access via that provider
7. IF `terminateSession` is called with a `sessionId` that does not exist or has already been terminated, THEN THE Console_Plugin SHALL return false without throwing

### Requirement 2: Console Session Lifecycle

**User Story:** As a user, I want console sessions to be properly managed from creation to termination, so that resources are not leaked and connections are reliable.

#### Acceptance Criteria

1. WHEN a user requests a console session, THE Console_Session SHALL transition through states: `creating` → `active` → `terminated`, where the `creating` state SHALL NOT exceed 30 seconds before the session transitions to either `active` or `failed`
2. WHEN a Console_Session enters the `active` state, THE Console_Plugin SHALL return a Session_Token and connection parameters (URL, transport type, protocol-specific metadata)
3. WHILE a Console_Session is in the `active` state, THE Console_Plugin SHALL accept heartbeat signals to reset the idle timeout
4. IF a Console_Session does not receive a Heartbeat within the configured Session_Timeout, THEN THE Console_Plugin SHALL terminate the session, close any upstream provider connection, and update the session record state to `terminated`
5. WHEN a user explicitly disconnects, THE Console_Plugin SHALL terminate the session, close any upstream provider connection, and update the session record state to `terminated` within 5 seconds
6. IF the backend process restarts, THEN THE Console_Plugin SHALL mark all pre-existing sessions for the provider as `terminated` before accepting new session creation requests
7. THE Console_Session SHALL record the creating user ID, creation timestamp, last heartbeat timestamp, and provider name
8. IF session creation fails due to provider unavailability or upstream error, THEN THE Console_Plugin SHALL transition the session to a `failed` state and return an error message indicating the provider-specific failure reason

### Requirement 3: Console Availability Discovery

**User Story:** As a user, I want to know which nodes support console access and through which provider, so that I can open a console from the node detail page.

#### Acceptance Criteria

1. WHEN the frontend requests console availability for a node, THE Integration_Manager SHALL query all registered Console_Plugin providers in parallel and return an array of available console capabilities within 2 seconds
2. IF no Console_Plugin provider supports console access for a given node, THEN THE Integration_Manager SHALL return an empty capabilities array
3. WHEN the Integration_Manager constructs a console availability response, THE Integration_Manager SHALL include the provider name, transport type, and display label for each available console option
4. WHEN multiple Console_Plugin providers offer console access for the same node, THE Integration_Manager SHALL return all options sorted by provider name in ascending alphabetical order
5. IF a Console_Plugin provider does not respond within 3 seconds during capability discovery, THEN THE Integration_Manager SHALL exclude that provider from the response and include the remaining results

### Requirement 4: WebSocket Transport for VNC

**User Story:** As a user, I want to access VNC consoles through a WebSocket proxy, so that I can interact with graphical VM consoles in my browser.

#### Acceptance Criteria

1. WHEN a Console_Session uses the `websocket-vnc` transport type, THE backend SHALL establish a WebSocket endpoint that proxies traffic between the frontend noVNC client and the target VNC server
2. WHEN a client initiates a WebSocket connection to the VNC proxy endpoint, THE WebSocket proxy SHALL extract the Session_Token from the `token` query parameter and validate that the token exists, has not expired, and maps to a Console_Session owned by the connecting user before relaying any data
3. IF the Session_Token is invalid or expired, THEN THE WebSocket proxy SHALL reject the connection with a 4401 close code and an error reason
4. WHILE the WebSocket proxy is relaying data, THE proxy SHALL forward binary frames bidirectionally without modification
5. IF the upstream VNC connection drops, THEN THE WebSocket proxy SHALL close the client WebSocket with a 4502 close code indicating upstream failure
6. IF the client WebSocket closes (intentionally or unexpectedly), THEN THE WebSocket proxy SHALL close the upstream VNC connection and release associated resources within 5 seconds
7. IF the upstream VNC connection cannot be established within 10 seconds of session creation, THEN THE WebSocket proxy SHALL close the client WebSocket with a 4504 close code indicating connection timeout
8. WHEN the maximum session duration (configured via `console.maxSessionDuration`, default 8 hours) is reached, THE WebSocket proxy SHALL close the client WebSocket with a 4408 close code indicating session duration exceeded

### Requirement 5: Terminal-Based Transport

**User Story:** As a user, I want to access text-based consoles (SSH, serial console, SSM) through a WebSocket terminal stream, so that I can interact with CLI-based sessions in my browser.

#### Acceptance Criteria

1. WHEN a Console_Session uses the `websocket-terminal` transport type, THE backend SHALL establish a WebSocket endpoint that relays terminal I/O between the frontend terminal emulator and the provider's session
2. THE WebSocket terminal endpoint SHALL validate the Session_Token on the initial connection handshake before relaying data
3. IF the Session_Token is invalid or expired, THEN THE WebSocket terminal endpoint SHALL reject the connection with a 4401 close code and an error reason indicating whether the token was invalid or expired
4. THE WebSocket terminal endpoint SHALL support UTF-8 text frames for terminal I/O and binary frames for control messages (resize events)
5. WHEN the frontend sends a resize control message with valid dimensions (columns between 1 and 500, rows between 1 and 200), THE Console_Plugin SHALL propagate the new terminal dimensions to the remote session
6. IF the upstream provider connection drops while the terminal session is active, THEN THE WebSocket terminal endpoint SHALL close the client WebSocket with a 4502 close code indicating upstream failure and terminate the Console_Session
7. THE WebSocket terminal endpoint SHALL enforce the configured `console.maxSessionDuration` limit, closing the connection with a 4408 close code when the maximum duration is reached
8. IF the WebSocket terminal endpoint receives a binary control message with an unrecognized message type byte or a frame shorter than the expected payload length for the declared type, THEN THE endpoint SHALL discard the frame and continue relaying without terminating the session

### Requirement 6: RBAC and Authorization

**User Story:** As an administrator, I want console access to be gated by RBAC permissions, so that only authorized users can open console sessions.

#### Acceptance Criteria

1. THE RBAC_System SHALL define a `console` resource with `access` and `admin` actions
2. WHEN a user requests to create a Console_Session, THE backend SHALL verify the user holds the `console:access` permission before proceeding
3. IF a user does not hold the `console:access` permission, THEN THE backend SHALL reject the Console_Session creation request with a 403 response indicating the `console:access` permission is required
4. WHEN a user requests to terminate a Console_Session owned by a different user, THE backend SHALL verify the requesting user holds the `console:admin` permission before proceeding
5. IF a user requests to terminate a Console_Session owned by a different user and does not hold the `console:admin` permission, THEN THE backend SHALL reject the request with a 403 response indicating the `console:admin` permission is required
6. WHEN a user requests to terminate their own Console_Session, THE backend SHALL allow the operation if the user holds the `console:access` permission without requiring `console:admin`
7. THE RBAC_System SHALL use the unscoped `console:access` and `console:admin` permissions without per-integration scoping

### Requirement 7: Frontend Console UI

**User Story:** As a user, I want an embedded console viewer on the node detail page, so that I can interact with remote consoles without leaving Pabawi.

#### Acceptance Criteria

1. WHEN a user opens a console session from the node detail page, THE frontend SHALL render an embedded console component appropriate to the transport type (noVNC viewer for `websocket-vnc`, xterm.js terminal for `websocket-terminal`)
2. THE frontend console component SHALL display a connection status indicator showing `connecting`, `connected`, or `disconnected` states
3. WHILE the console session is in the `active` state, THE frontend SHALL send Heartbeat signals to the backend every 30 seconds and SHALL stop sending heartbeats when the connection status transitions to `disconnected`
4. WHEN the user closes the console component or navigates away, THE frontend SHALL send a terminate request to the backend using a best-effort delivery mechanism (e.g., `navigator.sendBeacon` or fire-and-forget fetch) to maximize delivery during page unload
5. IF the WebSocket connection closes with code 4401 (invalid or expired token), THEN THE frontend SHALL display an error message indicating the session authorization failed and offer an option to create a new session
6. IF the WebSocket connection closes with code 4502 (upstream target failure), THEN THE frontend SHALL display an error message indicating the remote host connection was lost and offer an option to create a new session
7. IF the WebSocket connection drops unexpectedly (close codes other than 4401, 4502, or normal closure initiated by the frontend), THEN THE frontend SHALL display a reconnection prompt with an option to create a new session
8. WHEN establishing the WebSocket connection, THE frontend SHALL pass the Session_Token received from session creation as a query parameter on the WebSocket handshake URL
9. THE frontend console component SHALL provide a full-screen toggle for the console viewport

### Requirement 8: Security and Session Isolation

**User Story:** As an administrator, I want console sessions to be isolated and auditable, so that the system maintains security boundaries.

#### Acceptance Criteria

1. THE Session_Token SHALL be a cryptographically random string of at least 32 bytes, generated using a secure random source
2. IF a Session_Token is not used to establish a WebSocket connection within 60 seconds of creation, THEN THE backend SHALL invalidate the token and reject any subsequent connection attempt using that token with an error indicating the token has expired
3. IF a user without `console:admin` permission attempts to access a Console_Session they did not create, THEN THE backend SHALL reject the request with a 403 status and an error indicating insufficient permissions
4. WHEN a Console_Session is created or terminated, THE backend SHALL record an audit log entry containing the user ID, node ID, provider, action, and timestamp
5. IF a WebSocket connection request presents an Origin header that does not match the configured allowed origins, THEN THE WebSocket proxy SHALL reject the connection before the upgrade completes
6. IF a user has more than 3 concurrent active Console_Sessions, THEN THE backend SHALL reject new session creation with a 429 status and an error indicating the concurrent session limit
7. WHEN a Console_Session is terminated or its Session_Token is invalidated, THE backend SHALL close the associated WebSocket connection within 5 seconds

### Requirement 9: Proxmox Console Provider (Initial Implementation)

**User Story:** As a user with Proxmox VMs or LXC containers, I want to open VNC consoles to my Proxmox guests, so that I can interact with them graphically.

#### Acceptance Criteria

1. THE Proxmox Console_Provider SHALL implement the Console_Plugin interface and register with the Integration_Manager when the Proxmox integration is enabled
2. WHEN a user requests console access for a Proxmox node, THE Proxmox Console_Provider SHALL request a VNC proxy ticket from the Proxmox API using the endpoint corresponding to the guest type (`qemu` or `lxc`)
3. WHEN the Proxmox API returns a VNC proxy ticket, THE Proxmox Console_Provider SHALL use the ticket to establish a WebSocket connection to the Proxmox VNC WebSocket endpoint
4. WHEN creating a session for a Proxmox guest, THE Proxmox Console_Provider SHALL determine the guest type and use the QEMU vncproxy endpoint for `qemu` guests and the LXC vncproxy endpoint for `lxc` guests
5. IF the Proxmox API returns an authentication error when requesting a VNC ticket, THEN THE Proxmox Console_Provider SHALL return a session creation failure with an error message indicating the authentication failure reason returned by the Proxmox API
6. IF the target guest is not in the `running` state when a VNC session is requested, THEN THE Proxmox Console_Provider SHALL return a session creation failure with an error message indicating that the guest must be running for console access
7. IF the Proxmox API returns a non-authentication error (connection timeout, unreachable host, or resource not found) when requesting a VNC ticket, THEN THE Proxmox Console_Provider SHALL return a session creation failure with an error message indicating the specific failure category
8. THE Proxmox Console_Provider SHALL advertise the `websocket-vnc` transport type in its console capabilities

### Requirement 10: Graceful Degradation

**User Story:** As a user, I want the console feature to degrade gracefully when console access is unavailable, so that the rest of the application remains fully functional.

#### Acceptance Criteria

1. IF a Console_Plugin provider is unavailable or unhealthy, THEN THE Integration_Manager SHALL exclude the provider from console availability responses and return the remaining available providers within the standard API response time, without affecting other application functionality
2. IF console session creation fails, THEN THE frontend SHALL display an error message with the provider-specific reason and offer a retry option that is available up to 3 consecutive attempts before disabling the retry button and displaying a message indicating the provider may be unavailable
3. IF no Console_Plugin providers are registered or all registered Console_Plugin providers are unhealthy, THEN THE frontend SHALL hide all console-related UI elements from the node detail page
4. IF the WebSocket proxy loses connection to the upstream target during an active session, THEN THE backend SHALL terminate the Console_Session and notify the frontend with a WebSocket close frame using close code 4502
5. WHEN the frontend requests console availability for a node, THE frontend SHALL load and render the node detail page independently of the console availability response, treating the console availability check as a non-blocking asynchronous request that populates the console UI section upon completion

### Requirement 11: Configuration

**User Story:** As an administrator, I want to configure console behavior through environment variables, so that I can tune timeouts and limits without code changes.

#### Acceptance Criteria

1. THE ConfigService SHALL expose a `console.sessionTimeoutMs` setting, sourced from the `CONSOLE_SESSION_TIMEOUT_MS` environment variable, validated as a positive integer, with a default value of 300000 milliseconds (5 minutes)
2. THE ConfigService SHALL expose a `console.maxSessionDuration` setting, sourced from the `CONSOLE_MAX_SESSION_DURATION` environment variable, validated as a positive integer, with a default value of 28800000 milliseconds (8 hours)
3. THE ConfigService SHALL expose a `console.maxConcurrentSessions` setting, sourced from the `CONSOLE_MAX_CONCURRENT_SESSIONS` environment variable, validated as a positive integer with a minimum value of 1, with a default value of 3
4. THE ConfigService SHALL expose a `console.heartbeatIntervalMs` setting, sourced from the `CONSOLE_HEARTBEAT_INTERVAL_MS` environment variable, validated as a positive integer, with a default value of 30000 milliseconds (30 seconds)
5. IF any console configuration environment variable contains a value that is non-numeric, not an integer, or less than 1, THEN THE ConfigService SHALL use the default value for that setting and log a warning via LoggerService with component "ConfigService" indicating which variable was invalid and what default was applied
6. WHEN the ConfigService initializes, THE ConfigService SHALL validate that `console.heartbeatIntervalMs` is less than `console.sessionTimeoutMs`, and if not, SHALL use the default values for both settings and log a warning
