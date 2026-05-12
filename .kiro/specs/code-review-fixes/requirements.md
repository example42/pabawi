# Requirements Document

## Introduction

Structural refactoring of the Pabawi codebase to address issues identified in code review. Covers secret management centralisation, server startup decomposition, duplicate route elimination, execution logic extraction, frontend API module splitting, dependency injection introduction, MCP SDK typing, Bolt error parsing, SSE transport promotion, type suppression elimination, and broken test restoration.

## Glossary

- **ConfigService**: The singleton configuration service (`backend/src/config/ConfigService.ts`) that loads, validates (via Zod), and exposes application settings from environment variables.
- **AppConfigSchema**: The Zod schema defining the shape and constraints of all application configuration.
- **PluginRegistry**: The data structure (array of plugin constructor references with metadata) used to declaratively register integration plugins at startup.
- **IntegrationManager**: The service (`backend/src/integrations/IntegrationManager.ts`) that manages plugin lifecycle, registration, and dispatch.
- **BasePlugin**: The abstract class all integration plugins extend.
- **PuppetRouter**: The Express router module (`backend/src/routes/puppet.ts`) handling puppet run endpoints.
- **FrontendApiClient**: The HTTP client module (`frontend/src/lib/api.ts`) providing retry logic, auth header injection, and error parsing.
- **DIContainer**: A lightweight dependency injection container that holds shared service instances and provides them to consumers.
- **LoggerService**: The structured logging service instantiated throughout the backend.
- **ExpertModeService**: The service providing debug/expert-mode metadata attachment.
- **BoltService**: The integration service (`backend/src/integrations/bolt/BoltService.ts`) wrapping Puppet Bolt CLI interactions.
- **SSEClient**: The frontend SSE streaming client (`frontend/src/lib/executionStream.svelte.ts`) providing typed event streams for execution results.
- **StreamingExecutionManager**: The backend service managing SSE event emission for execution progress.
- **MCP_SDK**: The `@modelcontextprotocol/sdk` package used for the embedded MCP server transport.
- **TestSuite**: The full set of Vitest tests across both workspaces executed via `npm test`.

## Requirements

### Requirement 1: Centralise JWT and Lifecycle Secrets in ConfigService

**User Story:** As a developer, I want all secrets accessed through ConfigService so that missing or malformed secrets fail fast at startup and rotation logic applies uniformly.

#### Acceptance Criteria

1. THE AppConfigSchema SHALL include `jwtSecret` and `lifecycleToken` fields validated as non-empty strings.
2. WHEN ConfigService loads configuration, THE ConfigService SHALL read `JWT_SECRET` and `PABAWI_LIFECYCLE_TOKEN` from environment variables and expose them via typed accessor methods.
3. IF `JWT_SECRET` is missing or empty at startup, THEN THE ConfigService SHALL throw a validation error preventing server start.
4. WHEN a route handler requires the JWT secret, THE route handler SHALL obtain the value from ConfigService rather than from `process.env` directly.
5. THE codebase SHALL contain zero occurrences of `process.env.JWT_SECRET` or `process.env.PABAWI_LIFECYCLE_TOKEN` outside of ConfigService.

### Requirement 2: Replace Copy-Pasted Plugin Initialisation with Plugin Registry Loop

**User Story:** As a developer, I want plugin initialisation driven by a declarative registry so that adding a new integration requires only a registry entry, not a copy-pasted block.

#### Acceptance Criteria

1. THE server startup module SHALL define a PluginRegistry array where each entry specifies the plugin constructor, configuration resolver, and integration name.
2. WHEN the server starts, THE server startup module SHALL iterate the PluginRegistry and for each entry: resolve configuration, instantiate the plugin, register the plugin with IntegrationManager, and log the outcome.
3. IF a plugin fails to initialise, THEN THE server startup module SHALL log a warning with the integration name and error message and continue to the next registry entry.
4. THE server startup module SHALL contain no more than one try/catch block for plugin initialisation logic (the loop body), replacing the nine previously duplicated blocks.
5. THE server startup module SHALL produce identical runtime behaviour (same plugins registered in same priority order) as the previous implementation.

### Requirement 3: Remove Duplicate Router Mounts

**User Story:** As a developer, I want each API resource served at exactly one canonical URL path so that security fixes and behaviour changes apply uniformly without dual-mount drift.

#### Acceptance Criteria

1. THE server startup module SHALL mount each router at exactly one URL path with no duplicate mounts for the same router instance.
2. WHEN the duplicate `/api/nodes` mount for the inventory router is removed, THE server startup module SHALL retain only the `/api/inventory` mount as the canonical path.
3. WHEN the duplicate `/api/nodes` mount for the packages router is removed, THE server startup module SHALL retain only the `/api/packages` mount (or equivalent single canonical path).
4. WHEN a frontend component references a removed duplicate path, THE frontend component SHALL be updated to use the canonical path.
5. THE TestSuite SHALL pass with no test referencing removed duplicate paths.

### Requirement 4: Extract Shared Puppet Execution Helper

**User Story:** As a developer, I want a single `runPuppetOn` helper encapsulating the execution-record-update-journal-stream cycle so that bug fixes and audit field additions apply once.

#### Acceptance Criteria

1. THE PuppetRouter module SHALL export or internally define a `runPuppetOn` helper function that accepts target node identifiers, puppet run configuration, execution context (user ID, streaming manager, journal service), and returns a promise resolving when the async execution completes.
2. WHEN a single-node puppet run is requested, THE PuppetRouter SHALL delegate async execution to `runPuppetOn` with a single-element target array.
3. WHEN a multi-node puppet run is requested, THE PuppetRouter SHALL delegate async execution to `runPuppetOn` for each target node.
4. THE `runPuppetOn` helper SHALL perform: execution via IntegrationManager, execution record update, journal entry recording, and streaming event emission — in that order.
5. IF execution fails, THEN THE `runPuppetOn` helper SHALL update the execution record with failed status, record a failed journal entry, and emit an error streaming event.
6. THE PuppetRouter module SHALL contain no duplicated execution logic between the single-node and multi-node handlers.

### Requirement 5: Split Frontend API Module

**User Story:** As a developer, I want the frontend API client split into focused modules so that domain-specific API functions are independently testable and tree-shakeable.

#### Acceptance Criteria

1. THE frontend SHALL organise API functions into separate modules: `api.ts` (HTTP client infrastructure, retry logic, error parsing, auth header injection), `proxmoxApi.ts` (Proxmox-specific API functions), and `awsApi.ts` (AWS-specific API functions).
2. WHEN a consumer imports a Proxmox API function, THE consumer SHALL import from `proxmoxApi.ts` (or a barrel re-export), not from `api.ts` directly.
3. WHEN a consumer imports an AWS API function, THE consumer SHALL import from `awsApi.ts` (or a barrel re-export), not from `api.ts` directly.
4. THE `api.ts` module SHALL export only HTTP client infrastructure (fetchWithRetry, get, post, put, del, error utilities, and shared types).
5. THE frontend SHALL compile with zero TypeScript errors after the split.
6. THE TestSuite SHALL pass with all existing frontend tests updated to reference new import paths.

### Requirement 6: Introduce Dependency Injection Container

**User Story:** As a developer, I want shared services (LoggerService, ExpertModeService) provided via DI so that tests can inject mocks and runtime configuration changes propagate centrally.

#### Acceptance Criteria

1. THE backend SHALL define a DIContainer that holds singleton instances of LoggerService and ExpertModeService.
2. WHEN the server starts, THE server startup module SHALL create the DIContainer, instantiate shared services, and register them in the container before passing the container to route factories and service constructors.
3. WHEN a route handler or service requires LoggerService, THE route handler or service SHALL obtain the instance from the DIContainer rather than calling `new LoggerService()`.
4. WHEN a route handler or service requires ExpertModeService, THE route handler or service SHALL obtain the instance from the DIContainer rather than calling `new ExpertModeService()`.
5. THE codebase SHALL contain zero occurrences of `new LoggerService()` outside of the DIContainer initialisation and test setup.
6. THE codebase SHALL contain zero occurrences of `new ExpertModeService()` outside of the DIContainer initialisation and test setup.

### Requirement 7: Add Type Declaration for MCP SDK

**User Story:** As a developer, I want proper TypeScript types for the MCP SDK require() call so that the type suppression is removed without changing module resolution.

#### Acceptance Criteria

1. THE backend SHALL include a TypeScript declaration file (`.d.ts`) that declares module types for `@modelcontextprotocol/sdk/server/streamableHttp.js`.
2. WHEN the MCP SDK is imported via `require()`, THE import site SHALL use the declared types without `as any` or `as unknown` casts.
3. THE backend `tsconfig.json` SHALL remain at `moduleResolution: "node"` — no migration to `node16` or `bundler`.
4. THE declaration file SHALL type at minimum the `StreamableHTTPServerTransport` class constructor and its public methods used in the codebase.
5. THE backend SHALL compile with zero TypeScript errors related to the MCP SDK import.

### Requirement 8: Parse Bolt Structured JSON Errors

**User Story:** As a developer, I want BoltService to parse Bolt's structured JSON error format so that error categorisation is deterministic and locale-independent.

#### Acceptance Criteria

1. WHEN BoltService receives error output from a Bolt execution, THE BoltService SHALL attempt to parse the output as JSON and extract the `_error.kind` field.
2. WHEN `_error.kind` is present and recognised, THE BoltService SHALL categorise the error based on the `_error.kind` value (e.g., `puppetlabs.tasks/connect-error` → connection, `puppetlabs.tasks/task-error` → execution).
3. IF JSON parsing fails or `_error.kind` is absent, THEN THE BoltService SHALL fall back to the existing substring-matching categorisation logic.
4. THE BoltService SHALL define a mapping from known `_error.kind` values to the application's error category enum.
5. THE BoltService SHALL not use `stderr.toLowerCase().includes()` as the primary error categorisation mechanism for any error that contains valid JSON with `_error.kind`.

### Requirement 9: Promote SSE as Default Execution Result Transport

**User Story:** As a developer, I want the frontend to use SSE as the default transport for execution results so that real-time updates are delivered without polling and the duplicate fetch-based polling code is removed.

#### Acceptance Criteria

1. WHEN an execution is started from the frontend, THE frontend component SHALL subscribe to the SSE stream for that execution's results as the primary delivery mechanism.
2. THE frontend SHALL not use raw `fetch()` polling loops (`setInterval` or recursive `setTimeout` with fetch) for execution result retrieval.
3. WHEN the SSE connection fails or is unavailable, THE frontend component SHALL fall back to a single fetch of the final execution result after a timeout.
4. THE SSEClient module SHALL handle all execution result event types (progress, complete, error) with typed event interfaces.
5. THE frontend SHALL remove the `pollExecutionResult` function and all call sites that previously used it.
6. THE TestSuite SHALL pass with updated tests reflecting SSE-first behaviour.

### Requirement 10: Eliminate Type Suppressions at Integration Boundaries

**User Story:** As a developer, I want typed interfaces at integration boundaries so that the TypeScript compiler catches contract violations instead of `as any` hiding them.

#### Acceptance Criteria

1. THE backend SHALL define typed interfaces for: Bolt JSON execution results, Bolt JSON error responses, Express request extensions (auth user, expert mode), and MCP SDK transport types.
2. WHEN code at an integration boundary receives external data, THE code SHALL validate or assert the data against the typed interface rather than casting to `any` or `unknown`.
3. THE codebase SHALL reduce `as any`, `as unknown as`, and `eslint-disable.*@typescript-eslint` occurrences by a minimum of 80 from the current 108 baseline (target: 28 or fewer remaining).
4. THE remaining type suppressions SHALL exist only in test files for test-specific mocking patterns, not in production source code.
5. THE backend and frontend SHALL compile with zero TypeScript errors after the type suppression removal.

### Requirement 11: Fix All Currently Broken Tests

**User Story:** As a developer, I want all tests passing so that the CI pipeline is green and regressions are detectable.

#### Acceptance Criteria

1. WHEN `npm test` is executed at the workspace root, THE TestSuite SHALL exit with code 0 (all tests pass).
2. THE test fixes SHALL not disable, skip, or delete previously passing test cases to achieve a green run.
3. IF a test failure is caused by a structural change in this feature (e.g., moved imports, renamed functions), THEN THE test SHALL be updated to reflect the new structure.
4. IF a test failure is caused by a pre-existing bug unrelated to this feature, THEN THE test SHALL be fixed to correctly test the intended behaviour.
