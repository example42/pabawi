/**
 * Authentication & Authorization Types
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 6)
 *
 * This module defines the core types for the RBAC (Role-Based Access Control)
 * system, including users, groups, roles, and permissions.
 */

/**
 * User account representation
 */
export interface User {
  /** Unique user identifier (UUID) */
  id: string;
  /** Unique username for login */
  username: string;
  /** User's email address */
  email: string;
  /** Bcrypt-hashed password */
  passwordHash: string;
  /** Display name (optional) */
  displayName?: string;
  /** Group IDs the user belongs to */
  groups: string[];
  /** Direct role IDs assigned to the user */
  roles: string[];
  /** Whether the account is active */
  active: boolean;
  /** Account creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt?: Date;
  /** Last login timestamp */
  lastLoginAt?: Date;
}

/**
 * User creation input (without system-generated fields)
 */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  groups?: string[];
  roles?: string[];
  active?: boolean;
}

/**
 * User update input (all fields optional)
 */
export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  displayName?: string;
  groups?: string[];
  roles?: string[];
  active?: boolean;
}

/**
 * User data for API responses (excludes sensitive fields)
 */
export interface UserPublic {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  groups: string[];
  roles: string[];
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

/**
 * Group representation for organizing users
 */
export interface Group {
  /** Unique group identifier (UUID) */
  id: string;
  /** Unique group name */
  name: string;
  /** Group description */
  description: string;
  /** Role IDs assigned to this group */
  roles: string[];
  /** User IDs who are members of this group */
  members: string[];
  /** Group creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt?: Date;
}

/**
 * Group creation input
 */
export interface CreateGroupInput {
  name: string;
  description?: string;
  roles?: string[];
  members?: string[];
}

/**
 * Group update input
 */
export interface UpdateGroupInput {
  name?: string;
  description?: string;
  roles?: string[];
  members?: string[];
}

/**
 * Role representation for permission bundling
 */
export interface Role {
  /** Unique role identifier (UUID) */
  id: string;
  /** Unique role name (e.g., 'admin', 'operator', 'viewer') */
  name: string;
  /** Role description */
  description: string;
  /** Permissions granted by this role */
  permissions: Permission[];
  /** Priority for conflict resolution (higher wins) */
  priority: number;
  /** Whether this is a system-defined role */
  isSystem: boolean;
  /** Role creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt?: Date;
}

/**
 * Role creation input
 */
export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions?: Permission[];
  priority?: number;
}

/**
 * Role update input
 */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: Permission[];
  priority?: number;
}

/**
 * Permission definition for capability access control
 */
export interface Permission {
  /** Capability name pattern (e.g., 'command.execute', 'inventory.*', '*') */
  capability: string;
  /** Permission action */
  action: PermissionAction;
  /** Optional conditions that must be met */
  conditions?: PermissionCondition;
}

/**
 * Permission action type
 */
export type PermissionAction = "allow" | "deny";

/**
 * Conditional permission restrictions
 */
export interface PermissionCondition {
  /** Node filter expression (e.g., 'environment=dev', 'role=webserver') */
  nodeFilter?: string;
  /** Time window restriction (e.g., 'weekdays:09:00-17:00') */
  timeWindow?: string;
  /** IP address restrictions */
  ipRestriction?: string[];
  /** Maximum number of concurrent operations */
  maxConcurrent?: number;
  /** Require approval from another user */
  requireApproval?: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Matching permission (if any) */
  matchedPermission?: Permission;
  /** Matching role (if any) */
  matchedRole?: Role;
}

/**
 * Effective permissions for a user (computed from roles and groups)
 */
export interface EffectivePermissions {
  /** User ID */
  userId: string;
  /** All permissions (from direct roles and group roles) */
  permissions: Permission[];
  /** Capability names explicitly allowed */
  allowedCapabilities: string[];
  /** Capability names explicitly denied */
  deniedCapabilities: string[];
  /** Source roles contributing to these permissions */
  sourceRoles: string[];
}

/**
 * Database row types (for internal use)
 */
export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  active: number;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_system: number;
  created_at: string;
  updated_at: string | null;
}

export interface PermissionRow {
  id: string;
  role_id: string;
  capability: string;
  action: string;
  conditions: string | null;
}

export interface UserGroupRow {
  user_id: string;
  group_id: string;
}

export interface UserRoleRow {
  user_id: string;
  role_id: string;
}

export interface GroupRoleRow {
  group_id: string;
  role_id: string;
}

/**
 * Built-in role names
 */
export const BuiltInRoles = {
  ADMIN: "admin",
  OPERATOR: "operator",
  VIEWER: "viewer",
  ANONYMOUS: "anonymous",
} as const;

export type BuiltInRoleName = (typeof BuiltInRoles)[keyof typeof BuiltInRoles];

/**
 * Default permissions for built-in roles
 */
export const DefaultRolePermissions: Record<BuiltInRoleName, Permission[]> = {
  admin: [{ capability: "*", action: "allow" }],
  operator: [
    { capability: "command.execute", action: "allow" },
    { capability: "task.execute", action: "allow" },
    { capability: "inventory.*", action: "allow" },
    { capability: "facts.*", action: "allow" },
    { capability: "config.*", action: "allow" },
    { capability: "user.*", action: "deny" },
    { capability: "role.*", action: "deny" },
  ],
  viewer: [
    { capability: "inventory.list", action: "allow" },
    { capability: "inventory.get", action: "allow" },
    { capability: "facts.list", action: "allow" },
    { capability: "facts.get", action: "allow" },
    { capability: "execution.list", action: "allow" },
    { capability: "execution.get", action: "allow" },
  ],
  anonymous: [{ capability: "health.check", action: "allow" }],
};

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
  /** Number of items per page (default: 50) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: "asc" | "desc";
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  /** Items in this page */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page limit */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether there are more items */
  hasMore: boolean;
}
