/**
 * Authentication & Authorization Module - Barrel Exports
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Steps 6-9)
 *
 * This module provides the complete authentication and authorization system:
 * - User accounts with bcrypt password hashing
 * - Groups for organizing users
 * - Roles with capability-based permissions
 * - JWT-based authentication
 * - RBAC (Role-Based Access Control) with permission checking
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

// AuthService types
export type {
  AuthTokens,
  JWTAccessPayload,
  JWTRefreshPayload,
  ValidatedToken,
  AuthServiceConfig,
} from "./AuthService.js";

// AuthorizationService types
export type {
  ExecutionContext,
  WidgetAccessResult,
  AuthorizationServiceConfig,
} from "./AuthorizationService.js";

// Constants
export { BuiltInRoles, DefaultRolePermissions } from "./types.js";

// Services
export { UserService } from "./UserService.js";
export { GroupService } from "./GroupService.js";
export { RoleService } from "./RoleService.js";
export { AuthService, AuthenticationError } from "./AuthService.js";
export { AuthorizationService, AuthorizationError } from "./AuthorizationService.js";
