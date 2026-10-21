-- Retain ordering even when a positive revocation clears successful freshness.
ALTER TABLE ldap_validation_state ADD COLUMN decision_started_at BIGINT CHECK (decision_started_at IS NULL OR decision_started_at >= 0);
ALTER TABLE ldap_validation_state ADD COLUMN decision_sequence BIGINT NOT NULL DEFAULT 0 CHECK (decision_sequence >= 0);
ALTER TABLE ldap_directory_state ADD COLUMN validation_sequence BIGINT NOT NULL DEFAULT 0 CHECK (validation_sequence >= 0);
