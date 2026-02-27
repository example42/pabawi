-- Migration: Add SSH as a valid execution tool
-- SQLite doesn't support modifying CHECK constraints, so we need to recreate the table

-- Step 1: Create a new table with the updated constraint
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
  execution_tool TEXT DEFAULT 'bolt' CHECK(execution_tool IN ('bolt', 'ansible', 'ssh'))
);

-- Step 2: Copy data from old table to new table
INSERT INTO executions_new
SELECT * FROM executions;

-- Step 3: Drop old table
DROP TABLE executions;

-- Step 4: Rename new table to original name
ALTER TABLE executions_new RENAME TO executions;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);
CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_type_started ON executions(type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_original_id ON executions(original_execution_id);
