-- Batch lifecycle states distinguish admission, dispatch and unknown outcomes.
-- Neither table has inbound foreign keys; preserve every existing record.

CREATE TABLE executions_lifecycle (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'facts', 'puppet', 'package', 'plan')),
  target_nodes TEXT NOT NULL,
  "action" TEXT NOT NULL,
  parameters TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'success', 'failed', 'partial', 'cancelled', 'interrupted')),
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancellation_requested_at TEXT,
  user_id TEXT,
  completed_at TEXT,
  results TEXT NOT NULL,
  error TEXT,
  command TEXT,
  expert_mode INTEGER DEFAULT 0,
  original_execution_id TEXT,
  re_execution_count INTEGER DEFAULT 0,
  stdout TEXT,
  stderr TEXT,
  execution_tool TEXT DEFAULT 'bolt' CHECK(execution_tool IN ('bolt', 'ansible', 'ssh')),
  batch_id TEXT,
  batch_position INTEGER
);

INSERT INTO executions_lifecycle (id, type, target_nodes, "action", parameters, status, started_at, completed_at, results, error, command, expert_mode, original_execution_id, re_execution_count, stdout, stderr, execution_tool, batch_id, batch_position, created_at, user_id)
SELECT id, type, target_nodes, "action", parameters, status, started_at, completed_at, results, error, command, expert_mode, original_execution_id, re_execution_count, stdout, stderr, execution_tool, batch_id, batch_position, started_at, (SELECT user_id FROM batch_executions WHERE id = executions.batch_id) FROM executions;
DROP TABLE executions;
ALTER TABLE executions_lifecycle RENAME TO executions;

CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);
CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_type_started ON executions(type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_original_id ON executions(original_execution_id);

-- Step 8: Create new index for batch queries
CREATE INDEX IF NOT EXISTS idx_executions_batch ON executions(batch_id);
CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created_at DESC);

CREATE TABLE batch_executions_lifecycle (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'plan')),
  "action" TEXT NOT NULL,
  parameters TEXT,  -- JSON object
  target_nodes TEXT NOT NULL,  -- JSON array of node IDs
  target_groups TEXT NOT NULL,  -- JSON array of group IDs
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'success', 'failed', 'partial', 'cancelled', 'interrupted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- ISO 8601 timestamp
  started_at TEXT,  -- ISO 8601 timestamp
  completed_at TEXT,  -- ISO 8601 timestamp
  user_id TEXT NOT NULL,
  execution_ids TEXT NOT NULL,  -- JSON array of execution IDs
  stats_total INTEGER NOT NULL,
  stats_queued INTEGER NOT NULL,
  stats_running INTEGER NOT NULL,
  stats_success INTEGER NOT NULL,
  stats_failed INTEGER NOT NULL,
  cancellation_requested_at TEXT,
  stats_cancelled INTEGER NOT NULL DEFAULT 0,
  stats_interrupted INTEGER NOT NULL DEFAULT 0
);

INSERT INTO batch_executions_lifecycle (id, type, "action", parameters, target_nodes, target_groups, status, created_at, started_at, completed_at, user_id, execution_ids, stats_total, stats_queued, stats_running, stats_success, stats_failed)
SELECT id, type, "action", parameters, target_nodes, target_groups, status, created_at, started_at, completed_at, user_id, execution_ids, stats_total, stats_queued, stats_running, stats_success, stats_failed FROM batch_executions;
DROP TABLE batch_executions;
ALTER TABLE batch_executions_lifecycle RENAME TO batch_executions;

CREATE INDEX IF NOT EXISTS idx_batch_executions_created ON batch_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_executions_status ON batch_executions(status);
CREATE INDEX IF NOT EXISTS idx_batch_executions_user ON batch_executions(user_id);
