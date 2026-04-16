-- Migration 008: Journal Entries
-- Add journal_entries table for tracking provisioning events, lifecycle actions,
-- execution results, and manual notes per inventory node.
-- Requirements: 25.1, 25.2, 25.3, 26.1, 26.2, 26.3, 26.4

-- Journal entries table: Records all node-related events
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  nodeId TEXT NOT NULL,
  nodeUri TEXT NOT NULL,
  eventType TEXT NOT NULL CHECK (eventType IN (
    'provision', 'destroy', 'start', 'stop', 'reboot', 'suspend', 'resume',
    'command_execution', 'task_execution', 'puppet_run', 'package_install',
    'config_change', 'note', 'unknown'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'proxmox', 'aws', 'bolt', 'ansible', 'ssh', 'puppetdb', 'user', 'system'
  )),
  "action" TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,                  -- JSON
  userId TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance indexes for journal queries
CREATE INDEX IF NOT EXISTS idx_journal_node ON journal_entries(nodeId);
CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_journal_type ON journal_entries(eventType);
CREATE INDEX IF NOT EXISTS idx_journal_source ON journal_entries(source);

-- Composite index for node timeline queries (nodeId + timestamp descending)
CREATE INDEX IF NOT EXISTS idx_journal_node_time ON journal_entries(nodeId, timestamp DESC);
