-- Executions table for storing command and task execution history
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'facts', 'puppet', 'package')),
  target_nodes TEXT NOT NULL,  -- JSON array of target node IDs
  action TEXT NOT NULL,
  parameters TEXT,  -- JSON object of parameters
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial')),
  started_at TEXT NOT NULL,  -- ISO 8601 timestamp
  completed_at TEXT,  -- ISO 8601 timestamp
  results TEXT NOT NULL,  -- JSON array of node results
  error TEXT,
  command TEXT,  -- Full Bolt CLI command executed
  expert_mode INTEGER DEFAULT 0,  -- Boolean flag (0 or 1)
  original_execution_id TEXT,  -- Reference to original execution if this is a re-execution
  re_execution_count INTEGER DEFAULT 0,  -- Number of times this execution has been re-executed
  stdout TEXT,  -- Complete stdout output (stored when expert mode enabled)
  stderr TEXT,  -- Complete stderr output (stored when expert mode enabled)
  execution_tool TEXT DEFAULT 'bolt' CHECK(execution_tool IN ('bolt', 'ansible', 'ssh'))
  -- Note: batch_id and batch_position columns are added via migration 006_add_batch_executions.sql
);

-- Index Strategy:
-- 1. Primary access pattern: List recent executions ordered by time
--    - idx_executions_started: Supports ORDER BY started_at DESC
--
-- 2. Filter by status: Show only failed/running/success executions
--    - idx_executions_status: Supports WHERE status = ?
--
-- 3. Filter by type: Show only commands/tasks/facts
--    - idx_executions_type: Supports WHERE type = ?
--
-- 4. Combined filters: Status + time range queries
--    - idx_executions_status_started: Composite index for common filter combinations
--    - Supports: WHERE status = ? ORDER BY started_at DESC
--    - Also helps with: WHERE status = ? AND started_at >= ? AND started_at <= ?
--
-- 5. Type + time queries: Filter by execution type with time ordering
--    - idx_executions_type_started: Composite index for type-based filtering
--    - Supports: WHERE type = ? ORDER BY started_at DESC
--
-- Note: target_nodes is stored as JSON text. LIKE queries on this field
-- (e.g., WHERE target_nodes LIKE '%node1%') cannot be efficiently indexed
-- with standard SQLite indexes. For large datasets, consider extracting
-- target nodes to a separate junction table if node-based filtering becomes
-- a performance bottleneck.

-- Single-column indexes for basic filtering
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(type);

-- Composite indexes for common query patterns
-- Status + time: Most common filter combination (e.g., "show recent failed executions")
CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at DESC);

-- Type + time: Filter by execution type with time ordering
CREATE INDEX IF NOT EXISTS idx_executions_type_started ON executions(type, started_at DESC);

-- Note: batch_executions table, batch-related indexes, and batch_id/batch_position columns
-- are added via migration 006_add_batch_executions.sql for existing databases.
-- For new databases, the migration will be applied automatically during initialization.
