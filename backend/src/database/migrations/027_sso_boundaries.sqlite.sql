ALTER TABLE oauth_state_store ADD COLUMN browser_binding TEXT;
-- pabawi:statement-breakpoint
ALTER TABLE oauth_auth_codes ADD COLUMN browser_binding TEXT;
-- pabawi:statement-breakpoint

CREATE TABLE federated_user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
-- pabawi:statement-breakpoint
CREATE VIEW effective_user_roles AS
SELECT user_id, role_id FROM user_roles
UNION SELECT user_id, role_id FROM federated_user_roles;
-- pabawi:statement-breakpoint

-- Old grants lack provenance. Preserve them until the first reconciliation,
-- then require administrators to regrant any intended manual assignments.
CREATE TABLE legacy_federated_user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id, role_id) REFERENCES user_roles(user_id, role_id) ON DELETE CASCADE
);
-- pabawi:statement-breakpoint
INSERT INTO legacy_federated_user_roles (user_id, role_id)
SELECT user_id, role_id FROM user_roles
WHERE user_id IN (SELECT user_id FROM federated_identities WHERE provider = 'entra-id');
-- pabawi:statement-breakpoint

-- pabawi:statement-breakpoint
CREATE TRIGGER authz_federated_roles_insert AFTER INSERT ON federated_user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;

-- pabawi:statement-breakpoint
CREATE TRIGGER authz_federated_roles_update AFTER UPDATE ON federated_user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;

-- pabawi:statement-breakpoint
CREATE TRIGGER authz_federated_roles_delete AFTER DELETE ON federated_user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
