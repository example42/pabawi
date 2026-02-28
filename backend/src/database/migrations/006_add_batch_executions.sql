-- Migration: Add batch execution support for parallel execution UI
-- Creates batch_executions table and extends executions table with batch tracking

-- Step 1: Create batch_executions table
CREATE TABLE IF NOT EXISTS batch_executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'plan')),
  action TEXT NOT NULL,
  parameters TEXT,  -- JSON object
  target_nodes TEXT NOT NULL,  -- JSON array of node IDs
  target_groups TEXT NOT NULL,  -- JSON array of group IDs
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial', 'cancelled')),
  created_at TEXT NOT NULL,  -- ISO 8601 timestamp
  started_at TEXT,  -- ISO 8601 timestamp
  completed_at TEXT,  -- ISO 8601 timestamp
  user_id TEXT NOT NULL,
  execution_ids TEXT NOT NULL,  -- JSON array of execution IDs
  stats_total INTEGER NOT NULL,
  stats_queued INTEGER NOT NULL,
  stats_running INTEGER NOT NULL,
  stats_success INTEGER NOT NULL,
  stats_failed INTEGER NOT NULL
);

-- Step 2: Create indexes for batch_executions
CREATE INDEX IF NOT EXISTS idx_batch_executions_created ON batch_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_executions_status ON batch_executions(status);
CREATE INDEX IF NOT EXISTS idx_batch_executions_user ON batch_executions(user_id);

-- Step 3: Add batch tracking columns to executions table
-- SQLite doesn't support ALTER TABLE ADD COLUMN with constraints in older versions,
-- so we need to recreate the table

CREATE TABLE executions_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'facts', 'puppet', 'package')),
  target_nodes TEXT NOT NULL,
  action TEXT NOT NULL,
  parameters TEXT,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial')),
  started_at TEXT NOT NULL,
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

-- Step 4: Copy data from old table to new table
INSERT INTO executions_new
SELECT
  id,
  type,
  target_nodes,
  action,
  parameters,
  status,
  started_at,
  completed_at,
  results,
  error,
  command,
  expert_mode,
  original_execution_id,
  re_execution_count,
  stdout,
  stderr,
  execution_tool,
  NULL as batch_id,
  NULL as batch_position
FROM executions;

-- Step 5: Drop old table
DROP TABLE executions;

-- Step 6: Rename new table to original name
ALTER TABLE executions_new RENAME TO executions;

-- Step 7: Recreate existing indexes
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);
CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_type_started ON executions(type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_original_id ON executions(original_execution_id);

-- Step 8: Create new index for batch queries
CREATE INDEX IF NOT EXISTS idx_executions_batch ON executions(batch_id);
