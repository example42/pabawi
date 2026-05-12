# Implementation Plan: Code Review Fixes

## Overview

Structural refactoring addressing 11 code review findings. Implementation follows dependency order: DI Container → Secret Centralisation → Plugin Registry → independent changes → Type Suppression Elimination → Test Restoration. All changes preserve existing runtime behaviour.

## Tasks

- [x] 1. Introduce Dependency Injection Container
  - [x] 1.1 Create DIContainer class and ServiceRegistry interface
    - Create `backend/src/container/DIContainer.ts` with typed `register()` and `resolve()` methods
    - Define `ServiceRegistry` interface mapping keys to service types (logger, expertMode, config)
    - Export container type for use by consumers
    - _Requirements: 6.1_

  - [x]* 1.2 Write property tests for DI container singleton guarantee
    - **Property 5: DI container singleton guarantee**
    - **Validates: Requirements 6.1**
    - Use fast-check to verify `resolve(key)` returns same reference across multiple calls
    - Verify `resolve()` throws for unregistered keys

  - [x] 1.3 Wire DIContainer into server startup and route factories
    - Instantiate container in `server.ts` before plugin registration
    - Register ConfigService, LoggerService, ExpertModeService in container
    - Pass container to route factory functions (update signatures)
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 1.4 Migrate route handlers to consume services from container
    - Replace `new LoggerService()` calls in route files with `container.resolve("logger")`
    - Replace `new ExpertModeService()` calls with `container.resolve("expertMode")`
    - Target: zero `new LoggerService()` / `new ExpertModeService()` outside container init and test setup
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

- [x] 2. Checkpoint - Verify DI container integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Centralise JWT and Lifecycle Secrets in ConfigService
  - [x] 3.1 Add secret fields to AppConfigSchema and ConfigService accessors
    - Add `jwtSecret` (z.string().min(1)) and `lifecycleToken` (z.string().min(1)) to schema
    - Add `getJwtSecret()` and `getLifecycleToken()` accessor methods to ConfigService
    - Update `loadConfiguration()` to read `JWT_SECRET` and `PABAWI_LIFECYCLE_TOKEN` from env
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 3.2 Write property tests for secret validation
    - **Property 1: Secret validation rejects missing or empty values**
    - **Validates: Requirements 1.1, 1.3**
    - Use fast-check to generate empty/whitespace strings and verify ZodError is thrown

  - [ ]* 3.3 Write property test for secret round-trip
    - **Property 2: Secret round-trip through ConfigService**
    - **Validates: Requirements 1.2**
    - Use fast-check to generate arbitrary non-empty strings and verify getJwtSecret() returns exact value

  - [x] 3.4 Migrate route handlers from process.env to ConfigService
    - Update `auth.ts`, `users.ts`, `groups.ts`, `roles.ts`, `setup.ts`, `permissions.ts`, `inventory.ts` to use `configService.getJwtSecret()`
    - Update lifecycle token consumers to use `configService.getLifecycleToken()`
    - Verify zero occurrences of `process.env.JWT_SECRET` / `process.env.PABAWI_LIFECYCLE_TOKEN` outside ConfigService
    - _Requirements: 1.4, 1.5_

- [x] 4. Replace Plugin Initialisation with Registry Loop
  - [x] 4.1 Create plugin registry module
    - Create `backend/src/plugins/registry.ts` with `PluginRegistryEntry` interface and `PluginDeps` type
    - Define `pluginRegistry` array with entries for all 9 integrations (bolt, ansible, puppetdb, puppetserver, hiera, ssh, proxmox, aws, azure)
    - Preserve priority order matching current implementation
    - _Requirements: 2.1, 2.5_

  - [x] 4.2 Replace nine copy-pasted blocks with registry loop in server.ts
    - Remove the nine try/catch plugin init blocks from `server.ts`
    - Add single `for...of` loop iterating `pluginRegistry` with one try/catch
    - Log skip/success/failure per entry
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 4.3 Write property tests for plugin registry behaviour
    - **Property 3: Plugin registry produces correct registrations**
    - **Validates: Requirements 2.2, 2.5**
    - **Property 4: Failed plugin does not prevent subsequent registrations**
    - **Validates: Requirements 2.3**
    - Use fast-check to generate subsets of enabled plugins and verify registration count matches

- [x] 5. Checkpoint - Verify core infrastructure changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Remove Duplicate Router Mounts
  - [x] 6.1 Remove duplicate mounts from server.ts and update frontend paths
    - Remove `/api/nodes` mount for inventory router (keep `/api/inventory`)
    - Remove duplicate packages router mount (keep `/api/packages`)
    - Update frontend components referencing `/api/nodes` to use canonical paths
    - Update any test files referencing removed paths
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Extract Shared Puppet Execution Helper
  - [x] 7.1 Define PuppetExecutionContext interface and runPuppetOn helper
    - Create `PuppetExecutionContext` interface in `puppet.ts`
    - Implement `runPuppetOn` async function handling: execution, record update, journal entry, streaming emission
    - Implement error path: failed status update, failed journal entry, error streaming event
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 7.2 Refactor single-node and multi-node handlers to use runPuppetOn
    - Replace duplicated execution logic in single-node handler with `runPuppetOn` call
    - Replace duplicated execution logic in multi-node handler with `runPuppetOn` loop
    - Verify no duplicated execution logic remains between handlers
    - _Requirements: 4.2, 4.3, 4.6_

- [x] 8. Split Frontend API Module
  - [x] 8.1 Extract Proxmox API functions into proxmoxApi.ts
    - Create `frontend/src/lib/proxmoxApi.ts`
    - Move all `getProxmox*`, `createProxmox*`, `destroyNode`, `executeNodeAction`, `fetchLifecycleActions`, `testProxmoxConnection` from `api.ts`
    - Import `{ get, post, put, del }` from `./api`
    - Update all consumer imports
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 8.2 Extract AWS and Azure API functions into separate modules
    - Create `frontend/src/lib/awsApi.ts` with all AWS-specific functions
    - Create `frontend/src/lib/azureApi.ts` with all Azure-specific functions
    - Update all consumer imports to reference new modules
    - Verify `api.ts` retains only HTTP infrastructure
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

- [ ] 9. Add MCP SDK Type Declaration
  - [~] 9.1 Create type declaration and update import site
    - Create `backend/src/types/mcp-sdk.d.ts` declaring `StreamableHTTPServerTransport` class and options interface
    - Update `require()` site in `server.ts` to use declared types without `as any` / `as unknown`
    - Remove `@typescript-eslint/no-unsafe-assignment` and `@typescript-eslint/no-explicit-any` suppressions from MCP block
    - Verify `tsconfig.json` remains at `moduleResolution: "node"`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Parse Bolt Structured JSON Errors
  - [~] 10.1 Add BoltJsonError interface and error kind mapping
    - Create/extend `backend/src/integrations/bolt/types.ts` with `BoltJsonError` interface
    - Add `ERROR_KIND_MAP` static mapping in BoltService
    - Implement `isBoltJsonError` type guard
    - _Requirements: 8.4, 8.1_

  - [~] 10.2 Implement categoriseError method with JSON-first strategy
    - Add `categoriseError(stderr: string)` method attempting JSON parse first
    - Extract `_error.kind` and map to application error category
    - Fall back to existing substring matching only when JSON parse fails or `_error.kind` absent
    - Replace existing inline substring checks with calls to `categoriseError`
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 10.3 Write property tests for Bolt error categorisation
    - **Property 6: Bolt JSON error categorisation is deterministic**
    - **Validates: Requirements 8.1, 8.2, 8.5**
    - **Property 7: Bolt error fallback for non-JSON input**
    - **Validates: Requirements 8.3**
    - Use fast-check to generate valid BoltJsonError JSON and verify mapped category returned
    - Use fast-check to generate arbitrary non-JSON strings and verify no throw

- [ ] 11. Promote SSE as Default Execution Transport
  - [~] 11.1 Refactor PuppetRunInterface to use SSE-first with single-fetch fallback
    - Replace `pollExecutionResult` with `useExecutionStream` subscription for all execution modes
    - Add single `GET /api/executions/:id` fallback on SSE connection failure (not a polling loop)
    - Remove `pollExecutionResult` function and all `setInterval`/`setTimeout` polling patterns
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [~] 11.2 Ensure SSEClient handles all event types with typed interfaces
    - Verify/add typed event interfaces for: start, stdout, stderr, status, complete, error, command
    - Ensure `handleEvent` processes all event types without throwing
    - Update tests to reflect SSE-first behaviour
    - _Requirements: 9.4, 9.6_

  - [ ]* 11.3 Write property test for SSE event handling
    - **Property 8: SSE client handles all event types without error**
    - **Validates: Requirements 9.4**
    - Use fast-check to generate arbitrary valid StreamingEvent types and verify no throw

- [~] 12. Checkpoint - Verify independent changes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Eliminate Type Suppressions at Integration Boundaries
  - [~] 13.1 Define typed interfaces for Bolt JSON output and Express request extensions
    - Create/extend `backend/src/integrations/bolt/types.ts` with `BoltJsonOutput` interface
    - Create/extend `backend/src/types/express.d.ts` with proper `Express.Request` augmentation (user, expertMode)
    - Type `McpSessionEntry` transport field in `server.ts`
    - _Requirements: 10.1_

  - [~] 13.2 Replace type suppressions with proper types across backend
    - Replace `as any` / `as unknown as` casts at Bolt JSON parse sites with typed assertions
    - Replace `(req as unknown as { user? })` patterns with typed `req.user`
    - Remove corresponding `eslint-disable` comments
    - Target: ≤28 remaining suppressions (down from 108 baseline)
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [ ] 14. Fix All Currently Broken Tests
  - [~] 14.1 Run test suite and fix structural failures
    - Execute `npm test` and categorise all failures
    - Fix failures caused by moved imports, renamed functions, changed signatures from this feature
    - Fix pre-existing bugs by correcting test or code under test
    - No tests skipped or deleted
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [~] 15. Final checkpoint - Full test suite green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each dependency group
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The dependency order ensures no task references code that hasn't been created yet
- Each task touches ≤5 files as per project constraints

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["3.1", "4.1", "6.1", "7.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "4.2", "7.2", "8.1", "10.1"] },
    { "id": 5, "tasks": ["4.3", "8.2", "10.2", "11.1"] },
    { "id": 6, "tasks": ["10.3", "11.2"] },
    { "id": 7, "tasks": ["11.3", "13.1"] },
    { "id": 8, "tasks": ["13.2"] },
    { "id": 9, "tasks": ["14.1"] }
  ]
}
```
