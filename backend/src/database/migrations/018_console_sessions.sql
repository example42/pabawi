-- Migration 018: Console sessions
-- Adds console_sessions table for tracking interactive browser-based
-- console connections (VNC, terminal) to infrastructure nodes.
-- Requirements: 2.7

CREATE TABLE IF NOT EXISTS console_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  transport TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'creating',
  token TEXT,
  token_created_at TEXT,
  token_consumed INTEGER NOT NULL DEFAULT 0,
  upstream_url TEXT,
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT,
  terminated_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT chk_state CHECK (state IN ('creating', 'active', 'terminated', 'failed')),
  CONSTRAINT chk_transport CHECK (transport IN ('websocket-vnc', 'websocket-terminal'))
);

CREATE INDEX IF NOT EXISTS idx_console_sessions_user_id ON console_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_console_sessions_state ON console_sessions(state);
CREATE INDEX IF NOT EXISTS idx_console_sessions_token ON console_sessions(token);
