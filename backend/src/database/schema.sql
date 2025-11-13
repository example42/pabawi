-- Executions table for storing command and task execution history
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'facts')),
  target_nodes TEXT NOT NULL,
  action TEXT NOT NULL,
  parameters TEXT,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  results TEXT NOT NULL,
  error TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);
