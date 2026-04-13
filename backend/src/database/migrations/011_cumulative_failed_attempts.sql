-- Cumulative Login Attempt Counters
-- Tracks total failed login attempts per user across all sessions.
-- Unlike failed_login_attempts (which is cleared on successful login),
-- this counter only increments and is used for permanent lockout decisions.

CREATE TABLE IF NOT EXISTS login_attempt_counters (
  username TEXT PRIMARY KEY,
  cumulativeFailedAttempts INTEGER NOT NULL DEFAULT 0,
  lastFailedAt TEXT  -- ISO 8601 timestamp of most recent failed attempt
);
