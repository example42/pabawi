-- Legacy reservations have no provable provider context and fail closed on upgrade.
ALTER TABLE console_sessions ADD COLUMN auth_context TEXT;
