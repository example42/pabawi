-- Migration: 016_checkmk_write_permissions (PostgreSQL variant)
-- Description: Add checkmk:write permission for acknowledging problems and
--              scheduling downtimes via the Checkmk REST API. Granted to the
--              Operator and Administrator roles only (not Viewer/Provisioner),
--              since these are mutating monitoring actions.
--              rbacMiddleware('checkmk','write') gates the POST action routes.
-- Date: 2025-08-01

-- ============================================================================
-- PERMISSIONS: Checkmk write actions
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('checkmk-write-001', 'checkmk', 'write', 'Acknowledge problems and schedule downtimes in Checkmk', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Operator role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-operator-001', 'checkmk-write-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-admin-001', 'checkmk-write-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;
