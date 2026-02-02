# Architecture Comparison: Branch 060 (Legacy 0.5.x) vs Branch 100 (v1.0.0)

This document analyzes the architectural differences between the legacy 0.5.x codebase (branch 060) and the new modular plugin architecture in v1.0.0 (branch 100).

## Key Architectural Differences

| Aspect | Branch 060 (Legacy 0.5.x) | Branch 100 (v1.0.0) |
|--------|---------------------------|---------------------|
| Plugin System | Type-based (`ExecutionToolPlugin`, `InformationSourcePlugin`) | Capability-based (`BasePluginInterface`, `PluginCapability`) |
| Routing | Direct service calls | CapabilityRegistry with priority-based routing |
| Authentication | None | JWT-based with RBAC |
| Authorization | None | Permission-based via `requireCapability()` middleware |
| Database | Direct SQLite | Database abstraction layer with adapters |
| Configuration | Environment variables only | YAML + env vars with schema validation |

---

## Backend API Endpoints

### Legacy Routes (Branch 060) - Maintained for Backward Compatibility

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/inventory` | `routes/inventory.ts` | List nodes (direct BoltService/IntegrationManager) |
| `GET /api/inventory/sources` | `routes/inventory.ts` | List inventory sources |
| `GET /api/nodes/:id` | `routes/inventory.ts` | Get node details |
| `GET /api/nodes/:id/facts` | `routes/facts.ts` | Get node facts |
| `POST /api/nodes/:id/command` | `routes/commands.ts` | Execute command |
| `POST /api/nodes/:id/task` | `routes/tasks.ts` | Execute task |
| `GET /api/tasks` | `routes/tasks.ts` | List Bolt tasks |
| `GET /api/executions` | `routes/executions.ts` | List executions |
| `GET /api/executions/:id` | `routes/executions.ts` | Get execution details |
| `POST /api/nodes/:id/puppet/run` | `routes/puppet.ts` | Run Puppet agent |
| `GET /api/integrations/status` | `routes/integrations.ts` | Integration health |
| `GET /api/integrations/hiera/*` | `routes/hiera.ts` | Hiera operations |
| `GET /api/config` | `routes/config.ts` | Get configuration |
| `GET /api/health` | `server.ts` | Health check |

### New v1.0.0 Routes (Branch 100 Only)

#### Authentication

| Endpoint | File | Description |
|----------|------|-------------|
| `POST /api/auth/login` | `routes/auth.ts` | Login → JWT tokens |
| `POST /api/auth/refresh` | `routes/auth.ts` | Refresh token |
| `POST /api/auth/logout` | `routes/auth.ts` | Revoke tokens |
| `GET /api/auth/me` | `routes/auth.ts` | Current user + permissions |
| `GET /api/auth/sessions` | `routes/auth.ts` | Active session count |
| `POST /api/auth/check` | `routes/auth.ts` | Check capability permission |

#### User Management (Admin Only)

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/users` | `routes/users.ts` | List users |
| `POST /api/users` | `routes/users.ts` | Create user |
| `GET /api/users/:id` | `routes/users.ts` | Get user |
| `PUT /api/users/:id` | `routes/users.ts` | Update user |
| `DELETE /api/users/:id` | `routes/users.ts` | Delete user |
| `GET /api/users/:id/groups` | `routes/users.ts` | Get user's groups |
| `GET /api/users/:id/roles` | `routes/users.ts` | Get user's effective roles |

#### Role Management (Admin Only)

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/roles` | `routes/roles.ts` | List roles |
| `POST /api/roles` | `routes/roles.ts` | Create role |
| `PUT /api/roles/:id` | `routes/roles.ts` | Update role |
| `DELETE /api/roles/:id` | `routes/roles.ts` | Delete role |
| `POST /api/roles/:id/permissions` | `routes/roles.ts` | Add permission |
| `DELETE /api/roles/:id/permissions/:capability` | `routes/roles.ts` | Remove permission |
| `POST /api/roles/initialize` | `routes/roles.ts` | Initialize system roles |

#### Group Management (Admin Only)

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/groups` | `routes/groups.ts` | List groups |
| `POST /api/groups` | `routes/groups.ts` | Create group |
| `GET /api/groups/:id` | `routes/groups.ts` | Get group |
| `PUT /api/groups/:id` | `routes/groups.ts` | Update group |
| `DELETE /api/groups/:id` | `routes/groups.ts` | Delete group |
| `POST /api/groups/:id/members/:userId` | `routes/groups.ts` | Add member |
| `DELETE /api/groups/:id/members/:userId` | `routes/groups.ts` | Remove member |
| `POST /api/groups/:id/roles/:roleId` | `routes/groups.ts` | Add role to group |

#### Setup

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/setup/status` | `routes/setup.ts` | Check if setup needed |
| `POST /api/setup/admin` | `routes/setup.ts` | Create initial admin |

#### Plugins

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/plugins` | `routes/plugins.ts` | List plugins |
| `GET /api/plugins/:name` | `routes/plugins.ts` | Get plugin details |
| `GET /api/plugins/:name/capabilities` | `routes/plugins.ts` | Plugin capabilities |

### New v1.0.0 Capability-Based Routes

These routes use the CapabilityRegistry for RBAC-aware execution:

| Endpoint | File | Capability Used |
|----------|------|-----------------|
| `GET /api/inventory` (v1) | `routes/inventory.v1.ts` | `inventory.read`, `bolt.inventory.list` |
| `GET /api/inventory/:id` (v1) | `routes/inventory.v1.ts` | `inventory.read` |
| `POST /api/nodes/:id/command` (v1) | `routes/commands.v1.ts` | `bolt.command.execute` |
| `GET /api/tasks` (v1) | `routes/tasks.v1.ts` | `bolt.task.list` |
| `GET /api/tasks/:taskName` (v1) | `routes/tasks.v1.ts` | `bolt.task.list`, `bolt.task.details` |
| `POST /api/nodes/:id/task` (v1) | `routes/tasks.v1.ts` | `bolt.task.execute` |
| `GET /api/nodes/:id/facts` (v1) | `routes/facts.v1.ts` | `bolt.facts.query` |
| `GET /api/hiera/*` (v1) | `routes/hiera.v1.ts` | `hiera.*` capabilities |
| `GET /api/puppet/*` (v1) | `routes/puppet.v1.ts` | `puppetdb.*` capabilities |

---

## Supporting Code

### Legacy Code (Branch 060)

| File | Purpose |
|------|---------|
| `integrations/bolt/BoltPlugin.ts` | Type-based plugin implementing `ExecutionToolPlugin` + `InformationSourcePlugin` |
| `integrations/IntegrationManager.ts` | Direct plugin registration via `executionTools`/`informationSources` Maps |
| `integrations/types.ts` | `ExecutionToolPlugin`, `InformationSourcePlugin` interfaces |
| `database/DatabaseService.ts` | Direct SQLite with `better-sqlite3` |

### New v1.0.0 Code (Branch 100)

#### Core Plugin Infrastructure

| File | Purpose |
|------|---------|
| `integrations/CapabilityRegistry.ts` | Central capability registration and execution |
| `integrations/PluginLoader.ts` | Dynamic plugin discovery and loading |
| `integrations/types.ts` | `BasePluginInterface`, `PluginCapability`, `PluginWidget`, `PluginCLICommand` |
| `integrations/bolt/BoltPlugin.ts` | Capability-based plugin with `BasePluginInterface` |

#### Authentication & Authorization

| File | Purpose |
|------|---------|
| `auth/AuthService.ts` | JWT token generation, validation, refresh |
| `auth/AuthorizationService.ts` | RBAC permission checking with caching |
| `auth/UserService.ts` | User CRUD with bcrypt password hashing |
| `auth/RoleService.ts` | Role and permission management |
| `auth/GroupService.ts` | Group management |
| `auth/types.ts` | Type definitions for auth system |
| `middleware/auth.ts` | JWT validation middleware |
| `middleware/rbac.ts` | `requireCapability()`, `requireAdmin()` middleware |

#### Database Abstraction

| File | Purpose |
|------|---------|
| `database/DatabaseFactory.ts` | Database adapter factory |
| `database/adapters/SQLiteAdapter.ts` | SQLite implementation of `DatabaseAdapter` |
| `database/interfaces/DatabaseInterface.ts` | Abstract database interface |

#### Configuration

| File | Purpose |
|------|---------|
| `config/YamlConfigLoader.ts` | YAML config with env var interpolation |
| `config/SchemaRegistry.ts` | Zod schema validation |
| `config/YamlConfigSchemas.ts` | Schema definitions for YAML configs |

#### Route Helpers

| File | Purpose |
|------|---------|
| `routes/capabilityRouter.ts` | Helper functions for capability-based routes |

---

## Plugin Capability Definitions (v1.0.0)

The new BoltPlugin registers these capabilities:

| Capability Name | Category | Risk Level | Required Permissions |
|-----------------|----------|------------|---------------------|
| `bolt.command.execute` | command | execute | `bolt.command.execute`, `command.execute` |
| `bolt.task.execute` | task | execute | `bolt.task.execute`, `task.execute` |
| `bolt.inventory.list` | inventory | read | `bolt.inventory.list`, `inventory.read` |
| `bolt.facts.query` | info | read | `bolt.facts.query`, `facts.read` |
| `bolt.task.list` | info | read | `bolt.task.list` |
| `bolt.task.details` | info | read | `bolt.task.details` |

### Default Role Permissions

| Capability | admin | operator | viewer |
|------------|-------|----------|--------|
| `bolt.command.execute` | ✓ | ✓ | ✗ |
| `bolt.task.execute` | ✓ | ✓ | ✗ |
| `bolt.inventory.list` | ✓ | ✓ | ✓ |
| `bolt.facts.query` | ✓ | ✓ | ✓ |
| `bolt.task.list` | ✓ | ✓ | ✓ |
| `bolt.task.details` | ✓ | ✓ | ✓ |

---

## Frontend Widget Definitions (v1.0.0)

The BoltPlugin defines these widgets for dynamic UI composition:

| Widget ID | Name | Slots | Size |
|-----------|------|-------|------|
| `bolt:command-executor` | Command Executor | dashboard, node-detail, standalone-page | medium |
| `bolt:task-runner` | Task Runner | dashboard, node-detail, standalone-page | large |
| `bolt:inventory-viewer` | Inventory Viewer | dashboard, inventory-panel, sidebar | medium |
| `bolt:task-browser` | Task Browser | dashboard, sidebar | small |

---

## Migration Notes

### Deprecated Methods (v1.0.0)

The following IntegrationManager methods are deprecated and will be removed in v2.0.0:

| Deprecated Method | Replacement |
|-------------------|-------------|
| `getExecutionTool()` | `executeCapability('command.execute', ...)` |
| `getInformationSource()` | `executeCapability('inventory.list', ...)` |
| `getAllExecutionTools()` | `getCapabilitiesByCategory('command')` |
| `getAllInformationSources()` | `getCapabilitiesByCategory('inventory')` |

### Database Schema Changes

New tables added in v1.0.0:

- `users` - User accounts
- `groups` - User groups
- `roles` - Permission roles
- `permissions` - Capability permissions
- `user_groups` - User-group membership
- `user_roles` - User-role assignment
- `group_roles` - Group-role assignment
- `refresh_tokens` - JWT refresh tokens
- `token_revocations` - Revoked token tracking

---

## Summary

Branch 100 introduces a complete architectural overhaul:

1. **Capability-based plugin system** - Replaces type-based plugins with capability handlers
2. **Full authentication/authorization** - JWT tokens + RBAC with role/group/permission management
3. **Database abstraction layer** - Supports future PostgreSQL/MySQL adapters
4. **YAML configuration** - Declarative config with environment variable interpolation
5. **New v1 API routes** - Capability routing with permission checks
6. **Legacy compatibility** - Old routes maintained but marked deprecated
