-- Failed Login Attempts Table for Brute Force Protection
-- Tracks failed authentication attempts per username for security monitoring

CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  attemptedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  ipAddress TEXT,  -- Optional: IP address of the attempt
  reason TEXT  -- Reason for failure (e.g., 'Invalid password', 'User not found')
);

-- Index for efficient lookups by username and time
CREATE INDEX IF NOT EXISTS idx_failed_login_username ON failed_login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted_at ON failed_login_attempts(attemptedAt);

-- Account Lockout Table
-- Tracks temporary and permanent account lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
  username TEXT PRIMARY KEY,
  lockoutType TEXT NOT NULL,  -- 'temporary' or 'permanent'
  lockedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  lockedUntil TEXT,  -- ISO 8601 timestamp (NULL for permanent lockouts)
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lastAttemptAt TEXT  -- ISO 8601 timestamp of last failed attempt
);

-- Index for efficient lockout checks
CREATE INDEX IF NOT EXISTS idx_account_lockouts_locked_until ON account_lockouts(lockedUntil);
