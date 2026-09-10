-- Migration: 020_route_authorization_permissions
-- Description: Add the permissions required to close finding S01 (infrastructure
--              routes mounted without authorization). Introduces the missing
--              `puppetserver`, `executions` and `provisioning` resources and
--              backfills role assignments for the built-in roles.
-- Date: 2026-09-09
-- Notes:
--   * `provisioning:read` was already referenced by routes/integrations.ts but
--     never existed as a permission row, so the route was reachable only by
--     `is_admin` users. This migration makes the reference resolvable.
--   * `puppetserver:write` / `puppetserver:admin` are granted to Administrator
--     only. Environment deployment and cache flush are code-deployment
--     operations; Operators must be granted them explicitly.

-- ============================================================================
-- PERMISSIONS: Puppetserver integration
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('puppetserver-read-001', 'puppetserver', 'read', 'View Puppetserver nodes, catalogs, environments and status', CURRENT_TIMESTAMP),
  ('puppetserver-write-001', 'puppetserver', 'write', 'Deploy Puppet environments', CURRENT_TIMESTAMP),
  ('puppetserver-admin-001', 'puppetserver', 'admin', 'Administer Puppetserver (environment cache flush)', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- PERMISSIONS: Execution history and streamed output
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('executions-read-001', 'executions', 'read', 'View execution history, results and streamed output', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- PERMISSIONS: Provisioning integration discovery
-- ============================================================================

INSERT INTO permissions (id, resource, "action", description, created_at) VALUES
  ('provisioning-read-001', 'provisioning', 'read', 'List provisioning integrations and their capabilities', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Viewer: read only
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-viewer-001', 'puppetserver-read-001', CURRENT_TIMESTAMP),
  ('role-viewer-001', 'executions-read-001', CURRENT_TIMESTAMP),
  ('role-viewer-001', 'provisioning-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Operator: read only for the new resources
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-operator-001', 'puppetserver-read-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'executions-read-001', CURRENT_TIMESTAMP),
  ('role-operator-001', 'provisioning-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Provisioner: read only for the new resources
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-provisioner-001', 'puppetserver-read-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'executions-read-001', CURRENT_TIMESTAMP),
  ('role-provisioner-001', 'provisioning-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE-PERMISSION ASSIGNMENTS: Administrator: all new permissions
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES
  ('role-admin-001', 'puppetserver-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'puppetserver-write-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'puppetserver-admin-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'executions-read-001', CURRENT_TIMESTAMP),
  ('role-admin-001', 'provisioning-read-001', CURRENT_TIMESTAMP)
  ON CONFLICT DO NOTHING;
