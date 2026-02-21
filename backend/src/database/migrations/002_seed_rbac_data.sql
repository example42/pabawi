-- Migration: 002_seed_rbac_data
-- Description: Seed built-in roles, permissions, and default admin user
-- Date: 2024-01-15

-- ============================================================================
-- PERMISSIONS: Create permissions for all integrations
-- ============================================================================

-- Ansible permissions
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('ansible-read-001', 'ansible', 'read', 'View Ansible inventory and playbooks', datetime('now')),
  ('ansible-exec-001', 'ansible', 'execute', 'Execute Ansible playbooks', datetime('now')),
  ('ansible-write-001', 'ansible', 'write', 'Modify Ansible configuration', datetime('now')),
  ('ansible-admin-001', 'ansible', 'admin', 'Manage Ansible resources', datetime('now'));

-- Bolt permissions
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('bolt-read-001', 'bolt', 'read', 'View Bolt tasks and plans', datetime('now')),
  ('bolt-exec-001', 'bolt', 'execute', 'Execute Bolt tasks and plans', datetime('now')),
  ('bolt-write-001', 'bolt', 'write', 'Modify Bolt configuration', datetime('now')),
  ('bolt-admin-001', 'bolt', 'admin', 'Manage Bolt resources', datetime('now'));

-- PuppetDB permissions
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('puppetdb-read-001', 'puppetdb', 'read', 'Query PuppetDB data', datetime('now')),
  ('puppetdb-write-001', 'puppetdb', 'write', 'Modify PuppetDB data', datetime('now')),
  ('puppetdb-admin-001', 'puppetdb', 'admin', 'Manage PuppetDB configuration', datetime('now'));

-- User management permissions (for admin interface)
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('users-read-001', 'users', 'read', 'View user accounts', datetime('now')),
  ('users-write-001', 'users', 'write', 'Create and modify user accounts', datetime('now')),
  ('users-admin-001', 'users', 'admin', 'Full user management including deletion', datetime('now'));

-- Group management permissions
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('groups-read-001', 'groups', 'read', 'View groups', datetime('now')),
  ('groups-write-001', 'groups', 'write', 'Create and modify groups', datetime('now')),
  ('groups-admin-001', 'groups', 'admin', 'Full group management including deletion', datetime('now'));

-- Role management permissions
INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
  ('roles-read-001', 'roles', 'read', 'View roles and permissions', datetime('now')),
  ('roles-write-001', 'roles', 'write', 'Create and modify roles', datetime('now')),
  ('roles-admin-001', 'roles', 'admin', 'Full role management including deletion', datetime('now'));

-- ============================================================================
-- ROLES: Create built-in roles
-- ============================================================================

-- Viewer role: Read-only access to all integrations
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-viewer-001', 'Viewer', 'Read-only access to all integrations', 1, datetime('now'), datetime('now'));

-- Operator role: Read and execute access to all integrations
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-operator-001', 'Operator', 'Read and execute access to all integrations', 1, datetime('now'), datetime('now'));

-- Administrator role: Full access to all integrations and admin functions
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-admin-001', 'Administrator', 'Full access to all integrations and admin functions', 1, datetime('now'), datetime('now'));

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Assign permissions to built-in roles
-- ============================================================================

-- Viewer role: Read permissions for all integrations
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'ansible-read-001', datetime('now')),
  ('role-viewer-001', 'bolt-read-001', datetime('now')),
  ('role-viewer-001', 'puppetdb-read-001', datetime('now'));

-- Operator role: Read and execute permissions for all integrations
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'ansible-read-001', datetime('now')),
  ('role-operator-001', 'ansible-exec-001', datetime('now')),
  ('role-operator-001', 'bolt-read-001', datetime('now')),
  ('role-operator-001', 'bolt-exec-001', datetime('now')),
  ('role-operator-001', 'puppetdb-read-001', datetime('now'));

-- Administrator role: All permissions for all integrations and admin functions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  -- Ansible permissions
  ('role-admin-001', 'ansible-read-001', datetime('now')),
  ('role-admin-001', 'ansible-exec-001', datetime('now')),
  ('role-admin-001', 'ansible-write-001', datetime('now')),
  ('role-admin-001', 'ansible-admin-001', datetime('now')),
  -- Bolt permissions
  ('role-admin-001', 'bolt-read-001', datetime('now')),
  ('role-admin-001', 'bolt-exec-001', datetime('now')),
  ('role-admin-001', 'bolt-write-001', datetime('now')),
  ('role-admin-001', 'bolt-admin-001', datetime('now')),
  -- PuppetDB permissions
  ('role-admin-001', 'puppetdb-read-001', datetime('now')),
  ('role-admin-001', 'puppetdb-write-001', datetime('now')),
  ('role-admin-001', 'puppetdb-admin-001', datetime('now')),
  -- User management permissions
  ('role-admin-001', 'users-read-001', datetime('now')),
  ('role-admin-001', 'users-write-001', datetime('now')),
  ('role-admin-001', 'users-admin-001', datetime('now')),
  -- Group management permissions
  ('role-admin-001', 'groups-read-001', datetime('now')),
  ('role-admin-001', 'groups-write-001', datetime('now')),
  ('role-admin-001', 'groups-admin-001', datetime('now')),
  -- Role management permissions
  ('role-admin-001', 'roles-read-001', datetime('now')),
  ('role-admin-001', 'roles-write-001', datetime('now')),
  ('role-admin-001', 'roles-admin-001', datetime('now'));

-- ============================================================================
-- DEFAULT ADMIN USER: Create default administrator account
-- ============================================================================
-- Note: Password is 'Admin123!' (bcrypt hash with cost factor 10)
-- This should be changed immediately after first login in production

INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt, lastLoginAt) VALUES
  (
    'user-admin-001',
    'admin',
    'admin@pabawi.local',
    '$2b$10$UzDhEYO54zk0.vEqM9C9qO4Ydcs8CrVfCm.6kZNMjtmQjJrIWc5sy',
    'System',
    'Administrator',
    1,
    1,
    datetime('now'),
    datetime('now'),
    NULL
  );

-- Assign Administrator role to default admin user
INSERT INTO user_roles (userId, roleId, assignedAt) VALUES
  ('user-admin-001', 'role-admin-001', datetime('now'));
