# Requirements Document

## Introduction

This spec covers three related areas that strengthen Pabawi's access control and extensibility: (1) fixing gaps in default RBAC role permissions and adding permissions for newer integrations (Azure, Hiera, SSH), (2) fixing frontend bugs in the role management UI (204 No Content JSON parse error, stub Create Role button), and (3) implementing an embedded MCP (Model Context Protocol) server that exposes read-only infrastructure tools gated by the existing RBAC permission system.

## Glossary

- **RBAC_System**: The role-based access control subsystem comprising permissions, roles, role-permission assignments, and the PermissionService that evaluates access.
- **Permission**: A resource-action pair (e.g., `aws`/`read`) stored in the `permissions` table and checked by PermissionService.hasPermission.
- **Role**: A named collection of permissions. Built-in roles (Viewer, Operator, Administrator, Provisioner) are seeded by migrations and protected from deletion.
- **Migration_Runner**: The MigrationRunner service that executes sequential SQL migration files from `backend/src/database/migrations/`.
- **API_Client**: The frontend `fetchWithRetry` function and its `get`/`post`/`put`/`del` wrappers in `frontend/src/lib/api.ts`.
- **Role_Management_Page**: The Svelte page at `frontend/src/pages/RoleManagementPage.svelte` that lists roles and provides CRUD operations.
- **Role_Detail_Dialog**: The Svelte dialog at `frontend/src/components/RoleDetailDialog.svelte` that displays role details and manages permission assignments.
- **Create_Role_Dialog**: A new Svelte dialog component for creating custom roles via POST /api/roles.
- **MCP_Server**: An embedded Model Context Protocol server running inside the Pabawi backend process, exposing read-only infrastructure tools over Streamable HTTP transport.
- **MCP_Service_User**: A dedicated system user (`mcp-service`) auto-provisioned at startup with an `MCP Service` role, used to authorize MCP tool calls.
- **MCP_Tool**: A callable function registered with the MCP server that retrieves data from Pabawi services (inventory, facts, reports, catalogs, hiera, executions, integrations, journal).
- **Integration_Manager**: The central service that manages all integration plugins and provides aggregated inventory, facts, and health data.
- **Permission_Service**: The service that checks whether a user has a specific resource-action permission, with caching.
- **Config_Service**: The configuration service backed by Zod schema validation and `.env` environment variables.
- **Streamable_HTTP**: The modern MCP transport protocol using a single HTTP POST endpoint.

## Requirements

### Requirement 1: New Permissions for Azure, Hiera, and SSH Integrations

**User Story:** As an administrator, I want permissions defined for Azure, Hiera, and SSH integrations, so that access to these integrations can be controlled through RBAC.

#### Acceptance Criteria

1. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL create Azure permissions: `azure-read`, `azure-lifecycle`, `azure-provision`, `azure-destroy`, and `azure-admin` with appropriate descriptions.
2. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL create Hiera permissions: `hiera-read` and `hiera-admin` with appropriate descriptions.
3. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL create SSH permissions: `ssh-read`, `ssh-execute`, and `ssh-admin` with appropriate descriptions.
4. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL use `INSERT OR IGNORE` (SQLite) or `ON CONFLICT DO NOTHING` (Postgres) to ensure idempotent execution if permissions already exist.

### Requirement 2: Fix Viewer Role Default Permissions

**User Story:** As a viewer user, I want read access to all integrations by default, so that the Viewer role matches its description of "read-only access to all integrations."

#### Acceptance Criteria

1. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `proxmox-read-001`, `aws-read-001`, `journal-read-001`, and `integration_config-read-001` to role `role-viewer-001`.
2. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign the new `azure-read`, `hiera-read`, and `ssh-read` permissions to role `role-viewer-001`.
3. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL use conflict-safe INSERT to avoid errors if assignments already exist.

### Requirement 3: Fix Operator Role Default Permissions

**User Story:** As an operator user, I want read and execute access to all integrations by default, so that the Operator role matches its description of "read and execute access to all integrations."

#### Acceptance Criteria

1. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `proxmox-read-001`, `aws-read-001`, `journal-read-001`, and `integration_config-read-001` to role `role-operator-001`.
2. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign the new `azure-read`, `hiera-read`, `ssh-read`, and `ssh-execute` permissions to role `role-operator-001`.
3. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `proxmox-lifecycle-001` and `aws-lifecycle-001` to role `role-operator-001` for lifecycle operations.
4. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `azure-lifecycle` to role `role-operator-001`.

### Requirement 4: Complete Administrator Role Permissions

**User Story:** As an administrator, I want the Administrator role to include all permissions for all integrations, so that administrators have full access.

#### Acceptance Criteria

1. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign all new Azure permissions (`azure-read`, `azure-lifecycle`, `azure-provision`, `azure-destroy`, `azure-admin`) to role `role-admin-001`.
2. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign all new Hiera permissions (`hiera-read`, `hiera-admin`) to role `role-admin-001`.
3. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign all new SSH permissions (`ssh-read`, `ssh-execute`, `ssh-admin`) to role `role-admin-001`.

### Requirement 5: Update Provisioner Role Permissions

**User Story:** As a provisioner user, I want access to Azure provisioning and Hiera read access, so that the Provisioner role covers all infrastructure provisioning integrations.

#### Acceptance Criteria

1. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `azure-read`, `azure-lifecycle`, `azure-provision`, and `azure-destroy` to role `role-provisioner-001`.
2. WHEN the Migration_Runner executes migration 012, THE RBAC_System SHALL assign `hiera-read` to role `role-provisioner-001`.

### Requirement 6: Fix API Client 204 No Content Handling

**User Story:** As a frontend user managing role permissions, I want permission assignment and removal to succeed without errors, so that the role management UI works correctly.

#### Acceptance Criteria

1. WHEN the API_Client receives an HTTP response with status 204, THE API_Client SHALL return without attempting to parse the response body as JSON.
2. WHEN the API_Client receives an HTTP response with status 200 or 201, THE API_Client SHALL parse the response body as JSON and return the parsed data.
3. THE `post` function in the API_Client SHALL handle 204 No Content responses from POST /api/roles/:id/permissions/:permissionId without throwing a JSON parse error.
4. THE `del` function in the API_Client SHALL handle 204 No Content responses from DELETE /api/roles/:id/permissions/:permissionId without throwing a JSON parse error.

### Requirement 7: Implement Create Role Dialog

**User Story:** As an administrator, I want to create custom roles from the Role Management page, so that I can define new roles with specific permission sets.

#### Acceptance Criteria

1. WHEN the administrator clicks the "Create Role" button on the Role_Management_Page, THE Role_Management_Page SHALL open the Create_Role_Dialog.
2. THE Create_Role_Dialog SHALL provide input fields for role name (3-100 characters) and description (0-500 characters).
3. THE Create_Role_Dialog SHALL validate that the role name is between 3 and 100 characters before submission.
4. THE Create_Role_Dialog SHALL validate that the description does not exceed 500 characters before submission.
5. WHEN the administrator submits a valid role, THE Create_Role_Dialog SHALL send a POST request to /api/roles with the name and description.
6. WHEN the backend returns a 201 response, THE Create_Role_Dialog SHALL close, display a success notification, and refresh the roles list.
7. WHEN the backend returns a 409 Conflict response, THE Create_Role_Dialog SHALL display an error indicating the role name already exists.
8. IF the backend returns an error response, THEN THE Create_Role_Dialog SHALL display the error message without closing the dialog.

### Requirement 8: MCP Server Configuration

**User Story:** As a system administrator, I want to enable or disable the MCP server via configuration, so that I can control whether the MCP endpoint is exposed.

#### Acceptance Criteria

1. THE Config_Service SHALL support an `MCP_ENABLED` environment variable with a default value of `false`.
2. WHILE `MCP_ENABLED` is `false`, THE MCP_Server SHALL not be initialized and the `/mcp` endpoint SHALL not be registered.
3. WHILE `MCP_ENABLED` is `true`, THE MCP_Server SHALL be initialized and the `/mcp` endpoint SHALL accept POST requests.

### Requirement 9: MCP Service User Auto-Provisioning

**User Story:** As a system administrator, I want an MCP service user to be automatically created at startup, so that MCP tool calls have a dedicated identity for permission checks.

#### Acceptance Criteria

1. WHEN the server starts with `MCP_ENABLED` set to `true`, THE MCP_Server SHALL check if a user with username `mcp-service` exists.
2. IF the `mcp-service` user does not exist, THEN THE MCP_Server SHALL create the user with a random secure password, active status, and non-admin flag.
3. WHEN the `mcp-service` user is created, THE MCP_Server SHALL create an `MCP Service` role with `isBuiltIn` set to `true`.
4. WHEN the `MCP Service` role is created, THE MCP_Server SHALL assign all permissions with action `read` to the role.
5. WHEN the `MCP Service` role is created, THE MCP_Server SHALL assign the role to the `mcp-service` user.
6. IF the `mcp-service` user already exists, THEN THE MCP_Server SHALL reuse the existing user and role without modification.
7. THE `mcp-service` user SHALL be visible in the Users management page like any other user.

### Requirement 10: MCP Server Transport and Endpoint

**User Story:** As an MCP client, I want to connect to Pabawi's MCP server via Streamable HTTP, so that I can invoke tools using the standard MCP protocol.

#### Acceptance Criteria

1. WHILE `MCP_ENABLED` is `true`, THE MCP_Server SHALL expose a POST endpoint at `/mcp` that accepts MCP Streamable HTTP requests.
2. THE MCP_Server SHALL use the `@modelcontextprotocol/sdk` TypeScript package for protocol handling.
3. THE MCP_Server SHALL identify itself with server name `pabawi` and the current application version.
4. THE MCP_Server SHALL handle MCP `initialize`, `tools/list`, and `tools/call` methods.

### Requirement 11: MCP Tool — Inventory

**User Story:** As an MCP client, I want to list and search infrastructure nodes, so that I can discover managed resources across all integrations.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `inventory_list` that returns aggregated node inventory from all active integrations.
2. THE `inventory_list` tool SHALL accept an optional `search` string parameter to filter nodes by name or certname.
3. WHEN `inventory_list` is called, THE MCP_Server SHALL check that the MCP_Service_User has the required read permissions via Permission_Service.hasPermission before returning data.
4. IF the MCP_Service_User lacks the required permission, THEN THE MCP_Server SHALL return an error indicating insufficient permissions.

### Requirement 12: MCP Tool — Facts

**User Story:** As an MCP client, I want to retrieve node facts, so that I can inspect system properties of managed nodes.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `facts_get` that returns facts for a specified node.
2. THE `facts_get` tool SHALL require a `certname` string parameter identifying the target node.
3. WHEN `facts_get` is called, THE MCP_Server SHALL verify the MCP_Service_User has `puppetdb`/`read` permission before returning data.

### Requirement 13: MCP Tool — Puppet Reports

**User Story:** As an MCP client, I want to query Puppet reports and run history, so that I can analyze configuration management activity.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `reports_query` that returns Puppet reports with optional filtering.
2. THE `reports_query` tool SHALL accept optional parameters: `certname`, `limit`, and `status` filter.
3. WHEN `reports_query` is called, THE MCP_Server SHALL verify the MCP_Service_User has `puppetdb`/`read` permission before returning data.

### Requirement 14: MCP Tool — Puppet Catalogs

**User Story:** As an MCP client, I want to inspect Puppet catalogs, so that I can review the desired state configuration for nodes.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `catalogs_get` that returns the catalog for a specified node.
2. THE `catalogs_get` tool SHALL require a `certname` string parameter.
3. WHEN `catalogs_get` is called, THE MCP_Server SHALL verify the MCP_Service_User has `puppetdb`/`read` permission before returning data.

### Requirement 15: MCP Tool — Hiera

**User Story:** As an MCP client, I want to browse Hiera data and key usage, so that I can inspect configuration data hierarchies.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `hiera_lookup` that returns Hiera data for a specified key and environment.
2. THE `hiera_lookup` tool SHALL accept parameters: `key` (required), `environment` (optional, defaults to `production`).
3. WHEN `hiera_lookup` is called, THE MCP_Server SHALL verify the MCP_Service_User has `hiera`/`read` permission before returning data.

### Requirement 16: MCP Tool — Executions

**User Story:** As an MCP client, I want to query execution history, so that I can review past command and task runs.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `executions_list` that returns execution history with optional filtering.
2. THE `executions_list` tool SHALL accept optional parameters: `limit`, `status`, and `tool` filter.
3. WHEN `executions_list` is called, THE MCP_Server SHALL verify the MCP_Service_User has `bolt`/`read` permission before returning data.

### Requirement 17: MCP Tool — Integrations

**User Story:** As an MCP client, I want to list configured integrations and their health status, so that I can monitor infrastructure connectivity.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `integrations_list` that returns all configured integrations with their health status.
2. WHEN `integrations_list` is called, THE MCP_Server SHALL verify the MCP_Service_User has `integration_config`/`read` permission before returning data.

### Requirement 18: MCP Tool — Journal

**User Story:** As an MCP client, I want to read node journal entries, so that I can review the event timeline for infrastructure nodes.

#### Acceptance Criteria

1. THE MCP_Server SHALL register a tool named `journal_query` that returns journal entries with optional filtering.
2. THE `journal_query` tool SHALL accept optional parameters: `nodeId`, `eventType`, and `limit`.
3. WHEN `journal_query` is called, THE MCP_Server SHALL verify the MCP_Service_User has `journal`/`read` permission before returning data.

### Requirement 19: MCP Tool Permission Enforcement

**User Story:** As a system administrator, I want MCP tool calls to respect RBAC permissions, so that the MCP server cannot access data beyond what its role allows.

#### Acceptance Criteria

1. WHEN any MCP_Tool is called, THE MCP_Server SHALL call Permission_Service.hasPermission with the MCP_Service_User ID, the target resource, and `read` action before executing the tool logic.
2. IF Permission_Service.hasPermission returns `false`, THEN THE MCP_Server SHALL return an MCP error response with a message indicating the required permission.
3. THE MCP_Server SHALL call services directly without HTTP round-trips since the MCP_Server is embedded in the backend process.
4. THE MCP_Server SHALL use the same Permission_Service instance used by the REST API middleware.

### Requirement 20: Update Frontend Permission Types

**User Story:** As a frontend developer, I want the permission types to include Azure, Hiera, and SSH resources, so that the role management UI correctly categorizes all permissions.

#### Acceptance Criteria

1. THE `PermissionResource` type in `frontend/src/lib/permissions.ts` SHALL include `azure`, `hiera`, and `ssh` as valid resource values.
2. THE `RESOURCE_CATEGORIES` mapping SHALL place `azure` in the `infrastructure` category alongside `proxmox` and `aws`.
3. THE `RESOURCE_CATEGORIES` mapping SHALL place `hiera` in a `configuration` category or appropriate existing category.
4. THE `RESOURCE_CATEGORIES` mapping SHALL place `ssh` in the `system` category or appropriate existing category.
5. THE `RESOURCE_LABELS` mapping SHALL include human-readable labels for `azure` ("Azure"), `hiera` ("Hiera"), and `ssh` ("SSH").
