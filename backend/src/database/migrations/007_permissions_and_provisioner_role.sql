-- Migration: 007_new_permissions_and_provisioner_role
-- Description: Seed new fine-grained permissions for proxmox, aws, journal, and
--              integration_config resources. Create the Provisioner built-in role
--              and assign all new permissions to the Administrator role.
-- Date: 2025-01-20
-- Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 28.1, 28.2, 28.3, 28.4, 28.5, 29.2, 29.3, 29.4

-- ============================================================================
-- PERMISSIONS: New fine-grained permissions for 1.0.0 features
-- ============================================================================

-- Proxmox permissions (enhanced granularity for single plugin)
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('proxmox-read-001', 'proxmox', 'read', 'View Proxmox VMs and containers', CURRENT_TIMESTAMP),
  ('proxmox-lifecycle-001', 'proxmox', 'lifecycle', 'Start/stop/reboot VMs and containers', CURRENT_TIMESTAMP),
  ('proxmox-provision-001', 'proxmox', 'provision', 'Create new VMs and containers', CURRENT_TIMESTAMP),
  ('proxmox-destroy-001', 'proxmox', 'destroy', 'Destroy/decommission VMs and containers', CURRENT_TIMESTAMP),
  ('proxmox-admin-001', 'proxmox', 'admin', 'Full Proxmox management', CURRENT_TIMESTAMP);

-- AWS permissions (single plugin, EC2 initially)
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('aws-read-001', 'aws', 'read', 'View AWS resources', CURRENT_TIMESTAMP),
  ('aws-lifecycle-001', 'aws', 'lifecycle', 'Start/stop/reboot AWS instances', CURRENT_TIMESTAMP),
  ('aws-provision-001', 'aws', 'provision', 'Launch new AWS resources', CURRENT_TIMESTAMP),
  ('aws-destroy-001', 'aws', 'destroy', 'Terminate AWS resources', CURRENT_TIMESTAMP),
  ('aws-admin-001', 'aws', 'admin', 'Full AWS management', CURRENT_TIMESTAMP);

-- Journal permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('journal-read-001', 'journal', 'read', 'View journal entries', CURRENT_TIMESTAMP),
  ('journal-note-001', 'journal', 'note', 'Add manual notes', CURRENT_TIMESTAMP),
  ('journal-admin-001', 'journal', 'admin', 'Manage journal entries', CURRENT_TIMESTAMP);

-- Integration config permissions
INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('integration_config-read-001', 'integration_config', 'read', 'View integration configs', CURRENT_TIMESTAMP),
  ('integration_config-configure-001', 'integration_config', 'configure', 'Modify integration configs', CURRENT_TIMESTAMP),
  ('integration_config-admin-001', 'integration_config', 'admin', 'Full config management', CURRENT_TIMESTAMP);

-- ============================================================================
-- ROLES: Create Provisioner built-in role
-- ============================================================================

INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
  ('role-provisioner-001', 'Provisioner', 'Provision and manage infrastructure resources', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Provisioner role
-- ============================================================================

-- Provisioner: read, provision, destroy, lifecycle for proxmox
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'proxmox-read-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'proxmox-provision-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'proxmox-destroy-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'proxmox-lifecycle-001', CURRENT_TIMESTAMP);

-- Provisioner: read, provision, destroy, lifecycle for aws
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'aws-read-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'aws-provision-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'aws-destroy-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'aws-lifecycle-001', CURRENT_TIMESTAMP);

-- Provisioner: read, note for journal
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'journal-read-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'journal-note-001', CURRENT_TIMESTAMP);

-- Provisioner: read for integration_config
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'integration_config-read-001', CURRENT_TIMESTAMP);

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role — all new permissions
-- ============================================================================

-- Administrator: all proxmox permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'proxmox-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'proxmox-lifecycle-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'proxmox-provision-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'proxmox-destroy-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'proxmox-admin-001', CURRENT_TIMESTAMP);

-- Administrator: all aws permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'aws-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'aws-lifecycle-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'aws-provision-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'aws-destroy-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'aws-admin-001', CURRENT_TIMESTAMP);

-- Administrator: all journal permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'journal-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'journal-note-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'journal-admin-001', CURRENT_TIMESTAMP);

-- Administrator: all integration_config permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'integration_config-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'integration_config-configure-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'integration_config-admin-001', CURRENT_TIMESTAMP);
