-- Migration 004: Audit Logging
-- Add comprehensive audit logging for security monitoring and compliance
-- Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7

-- Audit logs table: Records all security-relevant events
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,  -- UUID
  timestamp TEXT NOT NULL,  -- ISO 8601 timestamp
  eventType TEXT NOT NULL,  -- Event category: 'auth', 'authz', 'admin', 'user', 'role', 'permission'
  action TEXT NOT NULL,  -- Specific action: 'login_success', 'login_failure', 'permission_denied', etc.
  userId TEXT,  -- User who performed the action (NULL for failed login attempts)
  targetUserId TEXT,  -- User affected by the action (for admin operations)
  targetResourceType TEXT,  -- Type of resource affected: 'user', 'role', 'group', 'permission'
  targetResourceId TEXT,  -- ID of the affected resource
  ipAddress TEXT,  -- Source IP address
  userAgent TEXT,  -- User agent string
  details TEXT,  -- JSON string with additional context
  result TEXT NOT NULL,  -- Result: 'success', 'failure', 'denied'
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (targetUserId) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(eventType);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(userId);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(targetUserId);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_result ON audit_logs(result);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ipAddress);

-- Composite index for common queries (user activity over time)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(userId, timestamp);
