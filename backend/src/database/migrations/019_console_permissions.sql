-- Migration: 019_console_permissions
-- Description: Add console:access and console:admin permissions for the
--              console integration. Grant console:access to Operator and
--              Administrator roles; grant console:admin to Administrator only.
-- Date: 2025-07-14
-- Requirements: 6.1, 6.7

-- ============================================================================
-- PERMISSIONS: Console integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('console-access-001', 'console', 'access', 'Access console sessions for nodes', CURRENT_TIMESTAMP),
  ('console-admin-001', 'console', 'admin', 'Manage other users console sessions', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Operator role — console:access
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-operator-001', 'console-access-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role — console:access + console:admin
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-admin-001', 'console-access-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'console-admin-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;
