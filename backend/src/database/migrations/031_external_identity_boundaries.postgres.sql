ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN local_auth_enabled INTEGER NOT NULL DEFAULT 1 CHECK (local_auth_enabled IN (0, 1));
ALTER TABLE users ADD COLUMN display_name TEXT;
UPDATE users SET local_auth_enabled = 0 WHERE password_hash IS NULL;
ALTER TABLE users ADD CONSTRAINT users_local_email_required CHECK (local_auth_enabled = 0 OR (email IS NOT NULL AND length(trim(email)) > 0));
ALTER TABLE users ADD CONSTRAINT users_local_password_scope CHECK (local_auth_enabled = 1 OR password_hash IS NULL);
ALTER TABLE federated_identities DROP CONSTRAINT federated_identities_provider_subject_key;
ALTER TABLE federated_identities ADD CONSTRAINT federated_identity_scope UNIQUE(provider, issuer, subject);
ALTER TABLE federated_identities ADD CONSTRAINT federated_identity_owner UNIQUE(id, user_id);
ALTER TABLE federated_identities ADD CONSTRAINT federated_identity_directory UNIQUE(id, provider, issuer);
DROP INDEX idx_federated_identities_lookup;
CREATE INDEX idx_federated_identities_lookup ON federated_identities(provider, issuer, subject);
DROP VIEW effective_user_roles;

CREATE UNIQUE INDEX idx_users_local_email ON users(email) WHERE local_auth_enabled = 1;

CREATE TABLE ldap_directory_state (
  directory_id TEXT PRIMARY KEY,
  mapping_revision BIGINT NOT NULL DEFAULT 0 CHECK (mapping_revision >= 0),
  config_revision TEXT NOT NULL DEFAULT ''
);

CREATE TABLE ldap_identity_metadata (
  identity_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'ldap' CHECK (provider = 'ldap'),
  directory_id TEXT NOT NULL REFERENCES ldap_directory_state(directory_id),
  login_name TEXT NOT NULL,
  dn TEXT NOT NULL,
  FOREIGN KEY (identity_id, provider, directory_id)
    REFERENCES federated_identities(id, provider, issuer) ON DELETE CASCADE
);

CREATE INDEX idx_ldap_identity_directory ON ldap_identity_metadata(directory_id);

CREATE UNIQUE INDEX idx_ldap_identity_scope ON ldap_identity_metadata(identity_id, directory_id);

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

-- Detached historical grants have no provable identity owner. Preserve access.
INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT f.user_id, f.role_id, CAST(CURRENT_TIMESTAMP AS TEXT) FROM federated_user_roles f
WHERE NOT EXISTS (SELECT 1 FROM federated_identities i WHERE i.user_id = f.user_id AND i.provider = 'entra-id')
ON CONFLICT(user_id, role_id) DO NOTHING;

INSERT INTO federated_user_roles_new (user_id, role_id, identity_id, source_key)
SELECT f.user_id, f.role_id, i.id, 'legacy'
FROM federated_user_roles f JOIN federated_identities i ON i.user_id = f.user_id AND i.provider = 'entra-id';

DROP TABLE federated_user_roles;

ALTER TABLE federated_user_roles_new RENAME TO federated_user_roles;

CREATE INDEX idx_federated_roles_user ON federated_user_roles(user_id, role_id);

CREATE INDEX idx_federated_roles_mapping ON federated_user_roles(mapping_id);

CREATE UNIQUE INDEX idx_federated_roles_mapping_identity ON federated_user_roles(identity_id, mapping_id) WHERE mapping_id IS NOT NULL;

CREATE VIEW effective_user_roles AS
SELECT user_id, role_id FROM user_roles
UNION SELECT user_id, role_id FROM federated_user_roles;

CREATE TABLE ldap_validation_state (
  identity_id TEXT PRIMARY KEY REFERENCES ldap_identity_metadata(identity_id) ON DELETE CASCADE,
  last_validated_at BIGINT,
  validation_generation BIGINT NOT NULL DEFAULT 0 CHECK (validation_generation >= 0),
  mapping_revision BIGINT NOT NULL DEFAULT 0 CHECK (mapping_revision >= 0),
  config_revision TEXT NOT NULL,
  CHECK (last_validated_at IS NULL OR last_validated_at >= 0)
);

CREATE TABLE ldap_validation_leases (
  identity_id TEXT PRIMARY KEY REFERENCES ldap_identity_metadata(identity_id) ON DELETE CASCADE,
  lease_owner TEXT,
  lease_expires_at BIGINT,
  fencing_generation BIGINT NOT NULL DEFAULT 0 CHECK (fencing_generation >= 0),
  CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE INDEX idx_ldap_lease_expiry ON ldap_validation_leases(lease_expires_at);

CREATE TRIGGER authz_federated_roles AFTER INSERT OR UPDATE OR DELETE ON federated_user_roles
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE FUNCTION pabawi_revoke_local_scope_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.local_auth_enabled IS DISTINCT FROM OLD.local_auth_enabled THEN
    NEW.session_version := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER revoke_local_scope_sessions BEFORE UPDATE OF local_auth_enabled ON users
FOR EACH ROW EXECUTE FUNCTION pabawi_revoke_local_scope_sessions();


CREATE FUNCTION pabawi_ldap_mapping_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT NEW.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT NEW.directory_id));
  UPDATE authorization_state SET revision = replace(gen_random_uuid()::text, '-', '') WHERE id = 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ldap_mapping_insert AFTER INSERT ON external_group_mappings
FOR EACH ROW EXECUTE FUNCTION pabawi_ldap_mapping_insert();

CREATE FUNCTION pabawi_ldap_mapping_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT OLD.directory_id UNION SELECT NEW.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT OLD.directory_id UNION SELECT NEW.directory_id));
  UPDATE authorization_state SET revision = replace(gen_random_uuid()::text, '-', '') WHERE id = 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ldap_mapping_update AFTER UPDATE ON external_group_mappings
FOR EACH ROW EXECUTE FUNCTION pabawi_ldap_mapping_update();

-- PostgreSQL checks composite foreign keys before AFTER UPDATE withdrawal.
CREATE FUNCTION pabawi_ldap_mapping_withdraw() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM federated_user_roles WHERE mapping_id = OLD.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ldap_mapping_withdraw BEFORE UPDATE ON external_group_mappings
FOR EACH ROW EXECUTE FUNCTION pabawi_ldap_mapping_withdraw();

CREATE FUNCTION pabawi_ldap_mapping_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ldap_directory_state SET mapping_revision = mapping_revision + 1
    WHERE directory_id IN (SELECT OLD.directory_id);
  UPDATE ldap_validation_state SET last_validated_at = NULL
    WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id IN (SELECT OLD.directory_id));
  UPDATE authorization_state SET revision = replace(gen_random_uuid()::text, '-', '') WHERE id = 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ldap_mapping_delete AFTER DELETE ON external_group_mappings
FOR EACH ROW EXECUTE FUNCTION pabawi_ldap_mapping_delete();
