-- Migration 014: Rename camelCase columns to snake_case
--
-- Why: PostgreSQL folds unquoted identifiers to lowercase at CREATE time,
-- which silently breaks code paths that read columns via camelCase keys
-- (most notably user.passwordHash returning undefined and bcrypt.compare
-- throwing "data and hash arguments required"). SQLite preserves case,
-- which let the bug hide for years.
--
-- All schema is now snake_case. SELECTs in TypeScript alias to camelCase
-- where the row hydrates a typed interface. See
-- .kiro/steering/database-conventions.md.
--
-- Compatibility:
-- - SQLite is case-insensitive on identifier resolution, so the source
--   column references below resolve regardless of the original casing.
-- - PostgreSQL lowercased every camelCase column at CREATE time, so the
--   source references match the actual lowercase storage names.
-- - This migration is therefore safe and identical on both dialects.
--
-- Atomicity: the runner wraps each migration in a transaction. A partial
-- failure rolls back so the migration is retried on next start.

-- ============================================================================
-- users
-- ============================================================================
ALTER TABLE users RENAME COLUMN passwordHash TO password_hash;
ALTER TABLE users RENAME COLUMN firstName TO first_name;
ALTER TABLE users RENAME COLUMN lastName TO last_name;
ALTER TABLE users RENAME COLUMN isActive TO is_active;
ALTER TABLE users RENAME COLUMN isAdmin TO is_admin;
ALTER TABLE users RENAME COLUMN createdAt TO created_at;
ALTER TABLE users RENAME COLUMN updatedAt TO updated_at;
ALTER TABLE users RENAME COLUMN lastLoginAt TO last_login_at;

-- ============================================================================
-- groups
-- ============================================================================
ALTER TABLE groups RENAME COLUMN createdAt TO created_at;
ALTER TABLE groups RENAME COLUMN updatedAt TO updated_at;

-- ============================================================================
-- roles
-- ============================================================================
ALTER TABLE roles RENAME COLUMN isBuiltIn TO is_built_in;
ALTER TABLE roles RENAME COLUMN createdAt TO created_at;
ALTER TABLE roles RENAME COLUMN updatedAt TO updated_at;

-- ============================================================================
-- permissions
-- ============================================================================
ALTER TABLE permissions RENAME COLUMN createdAt TO created_at;

-- ============================================================================
-- user_groups
-- ============================================================================
ALTER TABLE user_groups RENAME COLUMN userId TO user_id;
ALTER TABLE user_groups RENAME COLUMN groupId TO group_id;
ALTER TABLE user_groups RENAME COLUMN assignedAt TO assigned_at;

-- ============================================================================
-- user_roles
-- ============================================================================
ALTER TABLE user_roles RENAME COLUMN userId TO user_id;
ALTER TABLE user_roles RENAME COLUMN roleId TO role_id;
ALTER TABLE user_roles RENAME COLUMN assignedAt TO assigned_at;

-- ============================================================================
-- group_roles
-- ============================================================================
ALTER TABLE group_roles RENAME COLUMN groupId TO group_id;
ALTER TABLE group_roles RENAME COLUMN roleId TO role_id;
ALTER TABLE group_roles RENAME COLUMN assignedAt TO assigned_at;

-- ============================================================================
-- role_permissions
-- ============================================================================
ALTER TABLE role_permissions RENAME COLUMN roleId TO role_id;
ALTER TABLE role_permissions RENAME COLUMN permissionId TO permission_id;
ALTER TABLE role_permissions RENAME COLUMN assignedAt TO assigned_at;

-- ============================================================================
-- revoked_tokens
-- ============================================================================
ALTER TABLE revoked_tokens RENAME COLUMN userId TO user_id;
ALTER TABLE revoked_tokens RENAME COLUMN revokedAt TO revoked_at;
ALTER TABLE revoked_tokens RENAME COLUMN expiresAt TO expires_at;

-- ============================================================================
-- config (column "key" stays, only updatedAt changes)
-- ============================================================================
ALTER TABLE config RENAME COLUMN updatedAt TO updated_at;

-- ============================================================================
-- failed_login_attempts
-- ============================================================================
ALTER TABLE failed_login_attempts RENAME COLUMN attemptedAt TO attempted_at;
ALTER TABLE failed_login_attempts RENAME COLUMN ipAddress TO ip_address;

-- ============================================================================
-- account_lockouts
-- ============================================================================
ALTER TABLE account_lockouts RENAME COLUMN lockoutType TO lockout_type;
ALTER TABLE account_lockouts RENAME COLUMN lockedAt TO locked_at;
ALTER TABLE account_lockouts RENAME COLUMN lockedUntil TO locked_until;
ALTER TABLE account_lockouts RENAME COLUMN failedAttempts TO failed_attempts;
ALTER TABLE account_lockouts RENAME COLUMN lastAttemptAt TO last_attempt_at;

-- ============================================================================
-- audit_logs
-- ============================================================================
ALTER TABLE audit_logs RENAME COLUMN eventType TO event_type;
ALTER TABLE audit_logs RENAME COLUMN userId TO user_id;
ALTER TABLE audit_logs RENAME COLUMN targetUserId TO target_user_id;
ALTER TABLE audit_logs RENAME COLUMN targetResourceType TO target_resource_type;
ALTER TABLE audit_logs RENAME COLUMN targetResourceId TO target_resource_id;
ALTER TABLE audit_logs RENAME COLUMN ipAddress TO ip_address;
ALTER TABLE audit_logs RENAME COLUMN userAgent TO user_agent;

-- ============================================================================
-- journal_entries
-- ============================================================================
ALTER TABLE journal_entries RENAME COLUMN nodeId TO node_id;
ALTER TABLE journal_entries RENAME COLUMN nodeUri TO node_uri;
ALTER TABLE journal_entries RENAME COLUMN eventType TO event_type;
ALTER TABLE journal_entries RENAME COLUMN userId TO user_id;

-- ============================================================================
-- login_attempt_counters
-- ============================================================================
ALTER TABLE login_attempt_counters RENAME COLUMN cumulativeFailedAttempts TO cumulative_failed_attempts;
ALTER TABLE login_attempt_counters RENAME COLUMN lastFailedAt TO last_failed_at;
