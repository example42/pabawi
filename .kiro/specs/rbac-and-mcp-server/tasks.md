# Implementation Plan: RBAC Enhancements and MCP Server

## Overview

Three workstreams implemented in dependency order: (1) database migration for missing RBAC permissions, (2) frontend bug fixes and new components, (3) embedded MCP server with read-only tools. Each task builds on the previous — migration seeds the permissions that the frontend displays and the MCP server enforces.

## Tasks

- [x] 1. Create migration 012 for Azure, Hiera, and SSH permissions
  - [x] 1.1 Create `backend/src/database/migrations/012_azure_hiera_ssh_permissions.sql`
    - Add Azure permissions: `azure-read-001`, `azure-lifecycle-001`, `azure-provision-001`, `azure-destroy-001`, `azure-admin-001`
    - Add Hiera permissions: `hiera-read-001`, `hiera-admin-001`
    - Add SSH permissions: `ssh-read-001`, `ssh-execute-001`, `ssh-admin-001`
    - Use `INSERT OR IGNORE` for idempotent execution
    - Assign missing read permissions to Viewer role (`proxmox-read-001`, `aws-read-001`, `journal-read-001`, `integration_config-read-001`, plus new azure/hiera/ssh read)
    - Assign read + execute + lifecycle permissions to Operator role (including existing `proxmox-lifecycle-001`, `aws-lifecycle-001`, and new `azure-lifecycle-001`, `ssh-execute-001`)
    - Assign all 10 new permissions to Administrator role
    - Assign Azure provisioning + Hiera read to Provisioner role
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2_

  - [x] 1.2 Write unit test for migration 012 idempotency
    - Run migration against in-memory SQLite, verify all permissions and role-permission assignments exist
    - Run migration twice to verify idempotency (no errors on second run)
    - _Requirements: 1.4, 2.3_

- [x] 2. Fix frontend API client and permissions types
  - [x] 2.1 Fix `fetchWithRetry` to handle HTTP 204 No Content
    - In `frontend/src/lib/api.ts`, add a guard after `response.ok` check: if `response.status === 204`, return `undefined as T` without calling `response.json()`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 2.2 Write property test for fetchWithRetry JSON round-trip (Property 1)
    - **Property 1: JSON round-trip for successful API responses**
    - Generate random JSON objects, mock fetch to return them as 200, verify `fetchWithRetry` returns equivalent object; generate 204 responses, verify `undefined` returned
    - **Validates: Requirements 6.1, 6.2**

  - [x] 2.3 Update `frontend/src/lib/permissions.ts` with new resource types
    - Add `'azure'`, `'hiera'`, `'ssh'` to `PermissionResource` union type
    - Add `azure` to `infrastructure` category in `RESOURCE_CATEGORIES`
    - Add `hiera` to `configuration` category in `RESOURCE_CATEGORIES`
    - Add `ssh` to `system` category in `RESOURCE_CATEGORIES`
    - Add labels to `RESOURCE_LABELS`: `azure: 'Azure'`, `hiera: 'Hiera'`, `ssh: 'SSH'`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 2.4 Write unit tests for permissions.ts updates
    - Verify `RESOURCE_CATEGORIES` contains azure in infrastructure, hiera in configuration, ssh in system
    - Verify `RESOURCE_LABELS` has correct labels for all new resources
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 3. Implement CreateRoleDialog component
  - [x] 3.1 Create `frontend/src/components/CreateRoleDialog.svelte`
    - Svelte 5 component with runes for state management
    - Props: `isOpen` (bindable), `onClose`, `onCreated` callbacks
    - Form fields: role name (3-100 chars), description (0-500 chars)
    - Client-side validation before submission
    - POST to `/api/roles` with `{ name, description }`
    - Handle 201 (close + success toast + call onCreated), 409 (inline duplicate name error), other errors (inline error, dialog stays open)
    - Accessible: use `<dialog>` element, focus trap, ESC to close
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 3.2 Integrate CreateRoleDialog into RoleManagementPage
    - Import `CreateRoleDialog` in `frontend/src/pages/RoleManagementPage.svelte`
    - Add `isCreateDialogOpen` state variable
    - Replace `handleCreateRole()` stub with `isCreateDialogOpen = true`
    - Wire `onCreated` callback to `loadRoles()`
    - Add `<CreateRoleDialog>` to the template
    - _Requirements: 7.1, 7.6_

  - [x] 3.3 Write property test for CreateRoleDialog form validation (Property 2)
    - **Property 2: CreateRoleDialog form validation**
    - Generate random strings for name (0-200 chars) and description (0-600 chars), verify validation accepts iff `name.length >= 3 && name.length <= 100 && description.length <= 500`
    - **Validates: Requirements 7.3, 7.4**

  - [x] 3.4 Write unit tests for CreateRoleDialog
    - Render with `isOpen=true`, verify form fields exist
    - Submit with valid data, mock 201 response, verify dialog closes and `onCreated` called
    - Mock 409 response, verify duplicate name error shown
    - Mock 500 response, verify error shown and dialog stays open
    - _Requirements: 7.2, 7.6, 7.7, 7.8_

- [x] 4. Checkpoint — Frontend and migration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add MCP configuration to ConfigService
  - [x] 5.1 Update `backend/src/config/schema.ts` with `mcpEnabled` field
    - Add `mcpEnabled: z.boolean().default(false)` to `AppConfigSchema`
    - _Requirements: 8.1_

  - [x] 5.2 Update `ConfigService` to parse `MCP_ENABLED` env var and expose `isMcpEnabled()`
    - Add `mcpEnabled: process.env.MCP_ENABLED === 'true'` to `loadConfiguration()` raw config
    - Add `public isMcpEnabled(): boolean` method returning `this.config.mcpEnabled`
    - Update `backend/.env.example` with `MCP_ENABLED=false`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 5.3 Write unit tests for MCP config
    - Verify `isMcpEnabled()` returns `false` by default
    - Verify `isMcpEnabled()` returns `true` when `MCP_ENABLED=true`
    - _Requirements: 8.1_

- [x] 6. Implement MCP service user provisioning
  - [x] 6.1 Create `backend/src/mcp/McpServiceUser.ts`
    - Export `provisionMcpServiceUser(userService, roleService, permissionService, logger)` returning `{ userId, roleId }`
    - Check if `mcp-service` user exists; if so, look up existing role and return IDs
    - If not: create user with `crypto.randomUUID()` password, `isActive: true`, `isAdmin: false`
    - Create `MCP Service` role with `isBuiltIn: true`
    - Query all permissions with action `read`, assign each to the role
    - Assign role to user
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 6.2 Write unit tests for MCP service user provisioning
    - Mock UserService/RoleService/PermissionService, verify user+role+permissions created on first run
    - Verify idempotency — second run reuses existing user without modification
    - _Requirements: 9.1, 9.2, 9.6_

- [x] 7. Implement MCP server and tool registration
  - [x] 7.1 Install `@modelcontextprotocol/sdk` dependency
    - Run `npm install @modelcontextprotocol/sdk` in `backend/`
    - _Requirements: 10.2_

  - [x] 7.2 Create `backend/src/mcp/McpServer.ts` with server setup and tool registration
    - Export `createMcpServer(deps: McpDependencies): McpServer`
    - Server name `pabawi`, version from `package.json`
    - Register all 8 tools: `inventory_list`, `facts_get`, `reports_query`, `catalogs_get`, `hiera_lookup`, `executions_list`, `integrations_list`, `journal_query`
    - Each tool: check permission via `permissionService.hasPermission(mcpUserId, resource, action)`, return error if denied, call service directly if granted
    - All tools annotated with `readOnlyHint: true`
    - Use Zod for input schemas as required by MCP SDK
    - _Requirements: 10.3, 10.4, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 14.1, 14.2, 14.3, 15.1, 15.2, 15.3, 16.1, 16.2, 16.3, 17.1, 17.2, 18.1, 18.2, 18.3, 19.1, 19.2, 19.3, 19.4_

  - [x] 7.3 Write property test for inventory_list search filtering (Property 3)
    - **Property 3: inventory_list search filtering**
    - Generate random node lists and search strings, verify filtering returns only nodes where name or certname contains the search string (case-insensitive); when search is omitted, all nodes returned
    - **Validates: Requirements 11.2**

  - [x] 7.4 Write property test for universal MCP tool permission enforcement (Property 4)
    - **Property 4: Universal MCP tool permission enforcement**
    - For each tool × {true, false} permission state, verify: when permission denied, error response returned and service not called; when granted, service called and data returned
    - **Validates: Requirements 19.1, 19.2**

  - [x] 7.5 Write unit tests for MCP tool handlers
    - For each tool: mock permission denied, verify error response and service not called
    - For each tool: mock permission granted, mock service response, verify correct data returned
    - For `inventory_list`: test search filtering with specific examples
    - _Requirements: 11.1, 11.2, 12.1, 13.1, 14.1, 15.1, 16.1, 17.1, 18.1, 19.1, 19.2_

- [ ] 8. Wire MCP server into Express app
  - [-] 8.1 Update `backend/src/server.ts` to conditionally initialize MCP
    - After existing service initialization, check `configService.isMcpEnabled()`
    - If enabled: call `provisionMcpServiceUser()`, create MCP server, create `StreamableHTTPServerTransport` with `enableJsonResponse: true`
    - Connect server to transport, register `app.post("/mcp", ...)` handler
    - If disabled: skip MCP initialization entirely
    - _Requirements: 8.2, 8.3, 10.1, 10.3_

  - [~] 8.2 Write integration test for MCP endpoint
    - Start server with `MCP_ENABLED=true`, send MCP `initialize` request to `POST /mcp`, verify valid response with server name `pabawi`
    - Send `tools/list`, verify all 8 tools registered
    - _Requirements: 10.1, 10.3, 10.4_

- [ ] 9. Final checkpoint — All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirement acceptance criteria for traceability
- Property tests use `fast-check` and run minimum 100 iterations each
- Migration 012 must run before frontend permission types are meaningful in the UI
- The MCP server depends on the migration (for permission IDs) and ConfigService update (for `MCP_ENABLED`)
