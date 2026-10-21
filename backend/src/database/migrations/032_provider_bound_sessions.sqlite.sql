-- Provider ownership cannot be inferred for legacy sessions. Require a fresh login once.
UPDATE users SET session_version = lower(hex(randomblob(16)));
UPDATE oauth_state_store SET expires_at = '1970-01-01T00:00:00.000Z';
UPDATE oauth_auth_codes SET expires_at = '1970-01-01T00:00:00.000Z';
