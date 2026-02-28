-- Migration: 001_initial_rbac
-- Description: Create RBAC tables for users, groups, roles, and permissions
-- Date: 2024-01-15

-- Users table: Core user accounts with authentication credentials
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,  -- UUID
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,  -- bcrypt hash
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,  -- Boolean: 1 = active, 0 = inactive
  isAdmin INTEGER NOT NULL DEFAULT 0,  -- Boolean: 1 = admin, 0 = regular user
  createdAt TEXT NOT NULL,  -- ISO 8601 timestamp
  updatedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  lastLoginAt TEXT  -- ISO 8601 timestamp, NULL if never logged in
);

-- Groups table: Collections of users for permission management
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,  -- UUID
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  createdAt TEXT NOT NULL,  -- ISO 8601 timestamp
  updatedAt TEXT NOT NULL  -- ISO 8601 timestamp
);

-- Roles table: Named sets of permissions
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,  -- UUID
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  isBuiltIn INTEGER NOT NULL DEFAULT 0,  -- Boolean: 1 = system role (protected), 0 = custom role
  createdAt TEXT NOT NULL,  -- ISO 8601 timestamp
  updatedAt TEXT NOT NULL  -- ISO 8601 timestamp
);

-- Permissions table: Specific resource-action authorizations
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,  -- UUID
  resource TEXT NOT NULL,  -- Resource identifier (e.g., 'ansible', 'bolt', 'puppetdb')
  action TEXT NOT NULL,  -- Action identifier (e.g., 'read', 'write', 'execute', 'admin')
  description TEXT NOT NULL,
  createdAt TEXT NOT NULL,  -- ISO 8601 timestamp
  UNIQUE(resource, action)  -- Each resource-action combination must be unique
);

-- User-Group junction table: Many-to-many relationship between users and groups
CREATE TABLE IF NOT EXISTS user_groups (
  userId TEXT NOT NULL,
  groupId TEXT NOT NULL,
  assignedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  PRIMARY KEY (userId, groupId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
);

-- User-Role junction table: Direct role assignments to users
CREATE TABLE IF NOT EXISTS user_roles (
  userId TEXT NOT NULL,
  roleId TEXT NOT NULL,
  assignedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  PRIMARY KEY (userId, roleId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
);

-- Group-Role junction table: Role assignments to groups
CREATE TABLE IF NOT EXISTS group_roles (
  groupId TEXT NOT NULL,
  roleId TEXT NOT NULL,
  assignedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  PRIMARY KEY (groupId, roleId),
  FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
);

-- Role-Permission junction table: Permission assignments to roles
CREATE TABLE IF NOT EXISTS role_permissions (
  roleId TEXT NOT NULL,
  permissionId TEXT NOT NULL,
  assignedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  PRIMARY KEY (roleId, permissionId),
  FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Revoked tokens table: JWT token revocation list for logout and security
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token TEXT PRIMARY KEY,  -- Hashed JWT token
  userId TEXT NOT NULL,
  revokedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  expiresAt TEXT NOT NULL,  -- ISO 8601 timestamp (token expiration)
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Performance Indexes
-- User lookups by username and email (authentication)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(isActive);

-- Permission check optimization: Direct user-role path
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(userId);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(roleId);

-- Permission check optimization: User-group-role path
CREATE INDEX IF NOT EXISTS idx_user_groups_user ON user_groups(userId);
CREATE INDEX IF NOT EXISTS idx_user_groups_group ON user_groups(groupId);
CREATE INDEX IF NOT EXISTS idx_group_roles_group ON group_roles(groupId);
CREATE INDEX IF NOT EXISTS idx_group_roles_role ON group_roles(roleId);

-- Permission check optimization: Role-permission lookup
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(roleId);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permissionId);

-- Permission lookups by resource and action
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- Token revocation checks
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_token ON revoked_tokens(token);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expiresAt);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(userId);
