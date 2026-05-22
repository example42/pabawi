-- Migration: 013_azure_hiera_ssh_permissions
-- Description: Add permissions for Azure, Hiera, and SSH integrations.
--              Backfill role-permission assignments for Viewer, Operator,
--              Administrator, and Provisioner roles.
-- Date: 2025-06-01
-- Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4,
--               4.1, 4.2, 4.3, 5.1, 5.2

-- ============================================================================
-- PERMISSIONS: Azure integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('azure-read-001', 'azure', 'read', 'View Azure resources', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('azure-lifecycle-001', 'azure', 'lifecycle', 'Start/stop/reboot Azure VMs', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('azure-provision-001', 'azure', 'provision', 'Create new Azure resources', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('azure-destroy-001', 'azure', 'destroy', 'Terminate Azure resources', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('azure-admin-001', 'azure', 'admin', 'Full Azure management', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- PERMISSIONS: Hiera integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('hiera-read-001', 'hiera', 'read', 'View Hiera data', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('hiera-admin-001', 'hiera', 'admin', 'Manage Hiera configuration', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- PERMISSIONS: SSH integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('ssh-read-001', 'ssh', 'read', 'View SSH connections', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('ssh-execute-001', 'ssh', 'execute', 'Execute SSH commands', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, resource, "action", description, createdAt) VALUES
  ('ssh-admin-001', 'ssh', 'admin', 'Full SSH management', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Viewer role — backfill missing read permissions
-- ============================================================================

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'proxmox-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'aws-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'journal-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'integration_config-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'azure-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'hiera-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-viewer-001', 'ssh-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Operator role — read + execute + lifecycle
-- ============================================================================

-- Backfill existing read permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'proxmox-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'aws-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'journal-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'integration_config-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- New read permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'azure-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'hiera-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'ssh-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Lifecycle permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'proxmox-lifecycle-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'aws-lifecycle-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'azure-lifecycle-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Execute permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-operator-001', 'ssh-execute-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role — all new permissions
-- ============================================================================

-- Azure permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'azure-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'azure-lifecycle-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'azure-provision-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'azure-destroy-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'azure-admin-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Hiera permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'hiera-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'hiera-admin-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- SSH permissions
INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'ssh-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'ssh-execute-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-admin-001', 'ssh-admin-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Provisioner role — Azure provisioning + Hiera read
-- ============================================================================

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'azure-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'azure-lifecycle-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'azure-provision-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'azure-destroy-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
  ('role-provisioner-001', 'hiera-read-001', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
