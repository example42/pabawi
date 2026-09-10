-- Existing console credentials require a new authenticated session.
ALTER TABLE console_sessions ADD COLUMN session_version TEXT NOT NULL DEFAULT '-1';
