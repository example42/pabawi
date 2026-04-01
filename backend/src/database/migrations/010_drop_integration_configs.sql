-- Migration 010: Drop integration_configs table
-- Removes per-user integration config storage (v1.0.0 uses .env as single source of truth)
DROP TABLE IF EXISTS integration_configs;
