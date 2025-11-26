-- Migration: Add command and expert_mode columns to executions table
-- These columns were added to support command execution tracking and expert mode flag

-- Add command column if it doesn't exist
ALTER TABLE executions ADD COLUMN command TEXT;

-- Add expert_mode column if it doesn't exist
ALTER TABLE executions ADD COLUMN expert_mode INTEGER DEFAULT 0;

-- Migration: Add re-execution tracking fields
-- These columns support linking re-executed actions to their original executions

-- Add original_execution_id column if it doesn't exist
ALTER TABLE executions ADD COLUMN original_execution_id TEXT;

-- Add re_execution_count column if it doesn't exist
ALTER TABLE executions ADD COLUMN re_execution_count INTEGER DEFAULT 0;

-- Create index for finding re-executions by original execution ID
CREATE INDEX IF NOT EXISTS idx_executions_original_id ON executions(original_execution_id);

-- Migration: Add stdout and stderr columns for expert mode complete output capture
-- These columns store the full command output when expert mode is enabled

-- Add stdout column if it doesn't exist
ALTER TABLE executions ADD COLUMN stdout TEXT;

-- Add stderr column if it doesn't exist
ALTER TABLE executions ADD COLUMN stderr TEXT;
