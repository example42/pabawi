/**
 * Authentication & Authorization Module - Barrel Exports
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 6)
 *
 * This module provides the user management system including:
 * - User accounts with bcrypt password hashing
 * - Groups for organizing users
 * - Roles with capability-based permissions
 * - RBAC (Role-Based Access Control) primitives
 */

// Types
export type {
  // User types
  User,
  UserPublic,
  CreateUserInput,
  UpdateUserInput,
  UserRow,
  // Group types
  Group,
  CreateGroupInput,
  UpdateGroupInput,
  GroupRow,
  // Role types
  Role,
  CreateRoleInput,
  UpdateRoleInput,
  RoleRow,
  // Permission types
  Permission,
  PermissionAction,
  PermissionCondition,
  PermissionCheckResult,
  EffectivePermissions,
  PermissionRow,
  // Junction table types
  UserGroupRow,
  UserRoleRow,
  GroupRoleRow,
  // Pagination types
  PaginationOptions,
  PaginatedResult,
  // Built-in role types
  BuiltInRoleName,
} from "./types.js";

// Constants
export { BuiltInRoles, DefaultRolePermissions } from "./types.js";

// Services
export { UserService } from "./UserService.js";
export { GroupService } from "./GroupService.js";
export { RoleService } from "./RoleService.js";
