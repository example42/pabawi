import { z } from "zod";

/**
 * RBAC Validation Schemas
 *
 * Centralized Zod validation schemas for RBAC entities.
 * These schemas enforce data validation rules for user registration,
 * password validation, group/role creation, and permission creation.
 *
 * Requirements: 14.7
 */

// ============================================================================
// Password Validation Schema
// ============================================================================

/**
 * Password validation schema
 *
 * Requirements:
 * - Minimum 8 characters (Requirement 2.4)
 * - At least one uppercase letter (Requirement 2.5)
 * - At least one lowercase letter (Requirement 2.5)
 * - At least one number (Requirement 2.5)
 * - At least one special character (Requirement 2.5)
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
    "Password must contain at least one special character"
  );

// ============================================================================
// User Validation Schemas
// ============================================================================

/**
 * Username validation schema
 *
 * Requirements:
 * - 3-50 characters
 * - Alphanumeric and underscore only
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters long")
  .max(50, "Username must not exceed 50 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username must contain only alphanumeric characters and underscores"
  );

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email must not exceed 255 characters");

/**
 * Name validation schema (for firstName and lastName)
 *
 * Requirements:
 * - 1-100 characters
 */
export const nameSchema = z
  .string()
  .min(1, "Name must be at least 1 character long")
  .max(100, "Name must not exceed 100 characters")
  .trim();

/**
 * User registration schema
 *
 * Validates data for creating a new user account.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  isAdmin: z.boolean().optional().default(false),
});

/**
 * User update schema
 *
 * Validates data for updating an existing user account.
 * All fields are optional.
 * Requirements: 2.6
 */
export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  password: passwordSchema.optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

/**
 * Change password schema
 *
 * Validates password change requests.
 * Requirements: 20.1, 20.2
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

// ============================================================================
// Group Validation Schemas
// ============================================================================

/**
 * Group name validation schema
 *
 * Requirements:
 * - 3-100 characters
 * - Unique (enforced at database level)
 */
export const groupNameSchema = z
  .string()
  .min(3, "Group name must be at least 3 characters long")
  .max(100, "Group name must not exceed 100 characters")
  .trim();

/**
 * Description validation schema
 *
 * Requirements:
 * - 0-500 characters
 */
export const descriptionSchema = z
  .string()
  .max(500, "Description must not exceed 500 characters")
  .trim()
  .default("");

/**
 * Group creation schema
 *
 * Validates data for creating a new group.
 * Requirements: 3.1
 */
export const createGroupSchema = z.object({
  name: groupNameSchema,
  description: descriptionSchema,
});

/**
 * Group update schema
 *
 * Validates data for updating an existing group.
 * All fields are optional.
 */
export const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
  description: descriptionSchema.optional(),
});

// ============================================================================
// Role Validation Schemas
// ============================================================================

/**
 * Role name validation schema
 *
 * Requirements:
 * - 3-100 characters
 * - Unique (enforced at database level)
 */
export const roleNameSchema = z
  .string()
  .min(3, "Role name must be at least 3 characters long")
  .max(100, "Role name must not exceed 100 characters")
  .trim();

/**
 * Role creation schema
 *
 * Validates data for creating a new role.
 * Requirements: 4.1
 */
export const createRoleSchema = z.object({
  name: roleNameSchema,
  description: descriptionSchema,
});

/**
 * Role update schema
 *
 * Validates data for updating an existing role.
 * All fields are optional.
 */
export const updateRoleSchema = z.object({
  name: roleNameSchema.optional(),
  description: descriptionSchema.optional(),
});

// ============================================================================
// Permission Validation Schemas
// ============================================================================

/**
 * Resource validation schema
 *
 * Requirements:
 * - 3-100 characters
 * - Lowercase alphanumeric and underscore only
 */
export const resourceSchema = z
  .string()
  .min(3, "Resource must be at least 3 characters long")
  .max(100, "Resource must not exceed 100 characters")
  .regex(
    /^[a-z0-9_]+$/,
    "Resource must contain only lowercase alphanumeric characters and underscores"
  )
  .trim();

/**
 * Action validation schema
 *
 * Requirements:
 * - 3-50 characters
 * - Lowercase alphanumeric and underscore only
 */
export const actionSchema = z
  .string()
  .min(3, "Action must be at least 3 characters long")
  .max(50, "Action must not exceed 50 characters")
  .regex(
    /^[a-z0-9_]+$/,
    "Action must contain only lowercase alphanumeric characters and underscores"
  )
  .trim();

/**
 * Permission creation schema
 *
 * Validates data for creating a new permission.
 * Requirements: 4.4, 14.5
 */
export const createPermissionSchema = z.object({
  resource: resourceSchema,
  action: actionSchema,
  description: descriptionSchema,
});

// ============================================================================
// Authentication Validation Schemas
// ============================================================================

/**
 * Login schema
 *
 * Validates user login credentials.
 * Requirements: 1.1
 */
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Token refresh schema
 *
 * Validates token refresh requests.
 * Requirements: 6.3
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ============================================================================
// ID Parameter Validation Schemas
// ============================================================================

/**
 * UUID validation schema
 *
 * Validates UUID format for entity IDs.
 */
export const uuidSchema = z
  .string()
  .uuid("Invalid ID format");

/**
 * User ID parameter schema
 */
export const userIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * Group ID parameter schema
 */
export const groupIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * Role ID parameter schema
 */
export const roleIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * Permission ID parameter schema
 */
export const permissionIdParamSchema = z.object({
  id: uuidSchema,
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Infer TypeScript types from Zod schemas
 */
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
