-- Migration: Add command and expert_mode columns to executions table
-- These columns were added to support command execution tracking and expert mode flag

-- Add command column if it doesn't exist
ALTER TABLE executions ADD COLUMN command TEXT;

-- Add expert_mode column if it doesn't exist
ALTER TABLE executions ADD COLUMN expert_mode INTEGER DEFAULT 0;
