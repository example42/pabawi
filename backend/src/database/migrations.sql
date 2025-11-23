-- Migration: Add command and expert_mode columns to executions table
-- These columns were added to support command execution tracking and expert mode flag

-- Add command column if it doesn't exist
ALTER TABLE executions ADD COLUMN command TEXT;

-- Add expert_mode column if it doesn't exist
ALTER TABLE executions ADD COLUMN expert_mode INTEGER DEFAULT 0;

-- Migration: Update execution type constraint to include 'puppet' and 'package' types
-- This migration recreates the executions table with the updated type constraint

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS executions_new (
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
  expert_mode INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table to new table
INSERT INTO executions_new SELECT * FROM executions;

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
