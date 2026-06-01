-- Migration: 015_checkmk_permissions
-- Description: Add checkmk:read permission and backfill role_permissions
--              for Viewer, Operator, Administrator, and Provisioner roles.
--              Without this, rbacMiddleware('checkmk','read') rejects all users with 403.
-- Date: 2025-07-01
-- Requirements: 11.6

-- ============================================================================
-- PERMISSIONS: Checkmk integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('checkmk-read-001', 'checkmk', 'read', 'View Checkmk monitoring data', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Viewer role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-viewer-001', 'checkmk-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Operator role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-operator-001', 'checkmk-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-admin-001', 'checkmk-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Provisioner role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-provisioner-001', 'checkmk-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;
