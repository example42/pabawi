-- pabawi:sqlite-foreign-keys-off
-- Preserve account IDs, session versions, and all referencing rows during rebuilds.
DROP VIEW effective_user_roles;
-- pabawi:statement-breakpoint
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT,
  local_auth_enabled INTEGER NOT NULL DEFAULT 1 CHECK (local_auth_enabled IN (0, 1)),
  display_name TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  session_version TEXT NOT NULL DEFAULT '0',
  CHECK (local_auth_enabled = 0 OR (email IS NOT NULL AND length(trim(email)) > 0)),
  CHECK (local_auth_enabled = 1 OR password_hash IS NULL)
);
-- pabawi:statement-breakpoint
INSERT INTO users_new (id, username, email, password_hash, local_auth_enabled, first_name, last_name,
  is_active, is_admin, created_at, updated_at, last_login_at, session_version)
SELECT id, username, email, password_hash, CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END,
  first_name, last_name, is_active, is_admin, created_at, updated_at, last_login_at, session_version FROM users;
-- pabawi:statement-breakpoint
DROP TABLE users;
-- pabawi:statement-breakpoint
ALTER TABLE users_new RENAME TO users;
-- pabawi:statement-breakpoint
CREATE INDEX idx_users_username ON users(username);
-- pabawi:statement-breakpoint
CREATE INDEX idx_users_email ON users(email);
-- pabawi:statement-breakpoint
CREATE INDEX idx_users_active ON users(is_active);
-- pabawi:statement-breakpoint
CREATE TABLE federated_identities_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  issuer TEXT NOT NULL,
  email TEXT,
  id_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, issuer, subject),
  UNIQUE(id, user_id),
  UNIQUE(id, provider, issuer)
);
-- pabawi:statement-breakpoint
INSERT INTO federated_identities_new SELECT * FROM federated_identities;
-- pabawi:statement-breakpoint
DROP TABLE federated_identities;
-- pabawi:statement-breakpoint
ALTER TABLE federated_identities_new RENAME TO federated_identities;
-- pabawi:statement-breakpoint
CREATE INDEX idx_federated_identities_user ON federated_identities(user_id);
-- pabawi:statement-breakpoint
CREATE INDEX idx_federated_identities_lookup ON federated_identities(provider, issuer, subject);
-- pabawi:statement-breakpoint
CREATE UNIQUE INDEX idx_users_local_email ON users(email) WHERE local_auth_enabled = 1;
-- pabawi:statement-breakpoint
CREATE TABLE ldap_directory_state (
  directory_id TEXT PRIMARY KEY,
  mapping_revision BIGINT NOT NULL DEFAULT 0 CHECK (mapping_revision >= 0),
  config_revision TEXT NOT NULL DEFAULT ''
);
-- pabawi:statement-breakpoint
CREATE TABLE ldap_identity_metadata (
  identity_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'ldap' CHECK (provider = 'ldap'),
  directory_id TEXT NOT NULL REFERENCES ldap_directory_state(directory_id),
  login_name TEXT NOT NULL,
  dn TEXT NOT NULL,
  FOREIGN KEY (identity_id, provider, directory_id)
    REFERENCES federated_identities(id, provider, issuer) ON DELETE CASCADE
);
-- pabawi:statement-breakpoint
CREATE INDEX idx_ldap_identity_directory ON ldap_identity_metadata(directory_id);
-- pabawi:statement-breakpoint
CREATE UNIQUE INDEX idx_ldap_identity_scope ON ldap_identity_metadata(identity_id, directory_id);
-- pabawi:statement-breakpoint
CREATE TABLE external_group_mappings (
  id TEXT PRIMARY KEY,
  directory_id TEXT NOT NULL REFERENCES ldap_directory_state(directory_id),
  group_subject TEXT NOT NULL,
  group_dn TEXT NOT NULL,
  group_name TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(directory_id, group_subject, role_id),
  UNIQUE(id, role_id, directory_id)
);
-- pabawi:statement-breakpoint
CREATE TABLE federated_user_roles_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  identity_id TEXT NOT NULL,
  source_key TEXT NOT NULL CHECK (length(source_key) > 0),
  mapping_id TEXT,
  directory_id TEXT,
  PRIMARY KEY (identity_id, role_id, source_key),
  FOREIGN KEY (identity_id, user_id) REFERENCES federated_identities(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (identity_id, directory_id) REFERENCES ldap_identity_metadata(identity_id, directory_id) ON DELETE CASCADE,
  FOREIGN KEY (mapping_id, role_id, directory_id) REFERENCES external_group_mappings(id, role_id, directory_id) ON DELETE CASCADE,
  CHECK ((mapping_id IS NULL AND directory_id IS NULL) OR (mapping_id IS NOT NULL AND directory_id IS NOT NULL))
);
-- pabawi:statement-breakpoint
-- Detached historical grants have no provable identity owner. Preserve access.
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT f.user_id, f.role_id, CAST(CURRENT_TIMESTAMP AS TEXT) FROM federated_user_roles f
WHERE NOT EXISTS (SELECT 1 FROM federated_identities i WHERE i.user_id = f.user_id AND i.provider = 'entra-id')
ON CONFLICT(user_id, role_id) DO NOTHING;
-- pabawi:statement-breakpoint
INSERT INTO federated_user_roles_new (user_id, role_id, identity_id, source_key)
SELECT f.user_id, f.role_id, i.id, 'legacy'
FROM federated_user_roles f JOIN federated_identities i ON i.user_id = f.user_id AND i.provider = 'entra-id';
-- pabawi:statement-breakpoint
DROP TABLE federated_user_roles;
-- pabawi:statement-breakpoint
ALTER TABLE federated_user_roles_new RENAME TO federated_user_roles;
-- pabawi:statement-breakpoint
CREATE INDEX idx_federated_roles_user ON federated_user_roles(user_id, role_id);
-- pabawi:statement-breakpoint
CREATE INDEX idx_federated_roles_mapping ON federated_user_roles(mapping_id);
-- pabawi:statement-breakpoint
CREATE UNIQUE INDEX idx_federated_roles_mapping_identity ON federated_user_roles(identity_id, mapping_id) WHERE mapping_id IS NOT NULL;
-- pabawi:statement-breakpoint
CREATE VIEW effective_user_roles AS
SELECT user_id, role_id FROM user_roles
UNION SELECT user_id, role_id FROM federated_user_roles;
-- pabawi:statement-breakpoint
CREATE TABLE ldap_validation_state (
  identity_id TEXT PRIMARY KEY REFERENCES ldap_identity_metadata(identity_id) ON DELETE CASCADE,
  last_validated_at BIGINT,
  validation_generation BIGINT NOT NULL DEFAULT 0 CHECK (validation_generation >= 0),
  mapping_revision BIGINT NOT NULL DEFAULT 0 CHECK (mapping_revision >= 0),
  config_revision TEXT NOT NULL,
  CHECK (last_validated_at IS NULL OR last_validated_at >= 0)
);
-- pabawi:statement-breakpoint
CREATE TABLE ldap_validation_leases (
  identity_id TEXT PRIMARY KEY REFERENCES ldap_identity_metadata(identity_id) ON DELETE CASCADE,
  lease_owner TEXT,
  lease_expires_at BIGINT,
  fencing_generation BIGINT NOT NULL DEFAULT 0 CHECK (fencing_generation >= 0),
  CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);
-- pabawi:statement-breakpoint
CREATE INDEX idx_ldap_lease_expiry ON ldap_validation_leases(lease_expires_at);
-- pabawi:statement-breakpoint
-- Explicit statement boundaries keep SQLite trigger bodies intact.
CREATE TRIGGER revoke_user_sessions AFTER UPDATE OF password_hash, is_active, is_admin ON users
WHEN NEW.password_hash IS NOT OLD.password_hash OR NEW.is_active IS NOT OLD.is_active OR NEW.is_admin IS NOT OLD.is_admin
BEGIN
  UPDATE users SET session_version = lower(hex(randomblob(16))) WHERE id = NEW.id;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_insert AFTER INSERT ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_update AFTER UPDATE OF is_active, is_admin ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_delete AFTER DELETE ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
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
-- pabawi:statement-breakpoint
CREATE TRIGGER revoke_local_scope_sessions AFTER UPDATE OF local_auth_enabled ON users
WHEN NEW.local_auth_enabled IS NOT OLD.local_auth_enabled
BEGIN
  UPDATE users SET session_version = lower(hex(randomblob(16))) WHERE id = NEW.id;
END;

-- pabawi:statement-breakpoint
CREATE TRIGGER ldap_mapping_insert AFTER INSERT ON external_group_mappings
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT NEW.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT NEW.directory_id));
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER ldap_mapping_update AFTER UPDATE ON external_group_mappings
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT OLD.directory_id UNION SELECT NEW.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT OLD.directory_id UNION SELECT NEW.directory_id));
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
-- Withdraw before a role/scope edit changes the referenced composite key.
CREATE TRIGGER ldap_mapping_withdraw BEFORE UPDATE ON external_group_mappings
BEGIN
  DELETE FROM federated_user_roles WHERE mapping_id = OLD.id;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER ldap_mapping_delete AFTER DELETE ON external_group_mappings
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT OLD.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT OLD.directory_id));
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
