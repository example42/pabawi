-- Migration: 021_checkmk_write_permissions
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

-- A deployed Checkmk variant already seeded these grants. Preserve subsequent
-- operator policy changes rather than re-granting deliberately removed access.
INSERT INTO role_permissions (role_id, permission_id, assigned_at)
SELECT 'role-operator-001', 'checkmk-write-001', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM migrations
  WHERE id = '016' AND name IN ('016_checkmk_write_permissions.sql', '016_checkmk_write_permissions.postgres.sql')
)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator role
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at)
SELECT 'role-admin-001', 'checkmk-write-001', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM migrations
  WHERE id = '016' AND name IN ('016_checkmk_write_permissions.sql', '016_checkmk_write_permissions.postgres.sql')
)
  ON CONFLICT DO NOTHING;
