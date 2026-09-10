-- Entitlement administration is deliberate full delegation authority.
-- Do not infer this grant from existing profile or role editing permissions.
INSERT INTO permissions (id, resource, "action", description, created_at)
VALUES ('rbac-admin-001', 'rbac', 'admin', 'Manage all roles, permissions, memberships and administrator status', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, assigned_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM roles r CROSS JOIN permissions p
WHERE r.id = 'role-admin-001' AND p.resource = 'rbac' AND p."action" = 'admin'
ON CONFLICT DO NOTHING;
