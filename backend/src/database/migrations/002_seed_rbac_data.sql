-- Migration: 002_seed_rbac_data
-- Description: Seed built-in roles, permissions, and default admin user
-- Date: 2024-01-15

-- ============================================================================
-- PERMISSIONS: Create permissions for all integrations
-- ============================================================================

-- Ansible permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('ansible-read-001', 'ansible', 'read', 'View Ansible inventory and playbooks', CURRENT_TIMESTAMP),
  ('ansible-exec-001', 'ansible', 'execute', 'Execute Ansible playbooks', CURRENT_TIMESTAMP),
  ('ansible-write-001', 'ansible', 'write', 'Modify Ansible configuration', CURRENT_TIMESTAMP),
  ('ansible-admin-001', 'ansible', 'admin', 'Manage Ansible resources', CURRENT_TIMESTAMP);

-- Bolt permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('bolt-read-001', 'bolt', 'read', 'View Bolt tasks and plans', CURRENT_TIMESTAMP),
  ('bolt-exec-001', 'bolt', 'execute', 'Execute Bolt tasks and plans', CURRENT_TIMESTAMP),
  ('bolt-write-001', 'bolt', 'write', 'Modify Bolt configuration', CURRENT_TIMESTAMP),
  ('bolt-admin-001', 'bolt', 'admin', 'Manage Bolt resources', CURRENT_TIMESTAMP);

-- PuppetDB permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('puppetdb-read-001', 'puppetdb', 'read', 'Query PuppetDB data', CURRENT_TIMESTAMP),
  ('puppetdb-write-001', 'puppetdb', 'write', 'Modify PuppetDB data', CURRENT_TIMESTAMP),
  ('puppetdb-admin-001', 'puppetdb', 'admin', 'Manage PuppetDB configuration', CURRENT_TIMESTAMP);

-- User management permissions (for admin interface)
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('users-read-001', 'users', 'read', 'View user accounts', CURRENT_TIMESTAMP),
  ('users-write-001', 'users', 'write', 'Create and modify user accounts', CURRENT_TIMESTAMP),
  ('users-admin-001', 'users', 'admin', 'Full user management including deletion', CURRENT_TIMESTAMP);

-- Group management permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('groups-read-001', 'groups', 'read', 'View groups', CURRENT_TIMESTAMP),
  ('groups-write-001', 'groups', 'write', 'Create and modify groups', CURRENT_TIMESTAMP),
  ('groups-admin-001', 'groups', 'admin', 'Full group management including deletion', CURRENT_TIMESTAMP);

-- Role management permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('roles-read-001', 'roles', 'read', 'View roles and permissions', CURRENT_TIMESTAMP),
  ('roles-write-001', 'roles', 'write', 'Create and modify roles', CURRENT_TIMESTAMP),
  ('roles-admin-001', 'roles', 'admin', 'Full role management including deletion', CURRENT_TIMESTAMP);

-- ============================================================================
-- ROLES: Create built-in roles
-- ============================================================================

-- Viewer role: Read-only access to all integrations
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-viewer-001', 'Viewer', 'Read-only access to all integrations', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Operator role: Read and execute access to all integrations
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-operator-001', 'Operator', 'Read and execute access to all integrations', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Administrator role: Full access to all integrations and admin functions
INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-admin-001', 'Administrator', 'Full access to all integrations and admin functions', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Assign permissions to built-in roles
-- ============================================================================

-- Viewer role: Read permissions for all integrations
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'ansible-read-001', CURRENT_TIMESTAMP),
  ('role-viewer-001', 'bolt-read-001', CURRENT_TIMESTAMP),
  ('role-viewer-001', 'puppetdb-read-001', CURRENT_TIMESTAMP);

-- Operator role: Read and execute permissions for all integrations
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'ansible-read-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'ansible-exec-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'bolt-read-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'bolt-exec-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'puppetdb-read-001', CURRENT_TIMESTAMP);

-- Administrator role: All permissions for all integrations and admin functions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  -- Ansible permissions
  ('role-admin-001', 'ansible-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'ansible-exec-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'ansible-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'ansible-admin-001', CURRENT_TIMESTAMP),
  -- Bolt permissions
  ('role-admin-001', 'bolt-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'bolt-exec-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'bolt-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'bolt-admin-001', CURRENT_TIMESTAMP),
  -- PuppetDB permissions
  ('role-admin-001', 'puppetdb-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'puppetdb-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'puppetdb-admin-001', CURRENT_TIMESTAMP),
  -- User management permissions
  ('role-admin-001', 'users-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'users-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'users-admin-001', CURRENT_TIMESTAMP),
  -- Group management permissions
  ('role-admin-001', 'groups-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'groups-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'groups-admin-001', CURRENT_TIMESTAMP),
  -- Role management permissions
  ('role-admin-001', 'roles-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'roles-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'roles-admin-001', CURRENT_TIMESTAMP);

-- ============================================================================
-- DEFAULT CONFIGURATION: Setup default application configuration
-- ============================================================================
-- Note: Initial setup wizard will guide admin through first-time configuration
-- These are default values that can be changed during setup

INSERT INTO config (key, value, updatedAt) VALUES
  ('allow_self_registration', 'false', CURRENT_TIMESTAMP),
  ('default_new_user_role', 'role-viewer-001', CURRENT_TIMESTAMP);
