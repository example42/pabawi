-- Migration 009: Integration Configs
-- Add integration_configs table for storing per-user integration configurations
-- with encrypted sensitive fields and unique constraint per user/integration.
-- Requirements: 32.1, 32.2, 32.3, 32.4

-- Integration configs table: Stores per-user integration settings
CREATE TABLE IF NOT EXISTS integration_configs (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  integrationName TEXT NOT NULL,
  config TEXT NOT NULL,          -- JSON, sensitive fields encrypted
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(userId, integrationName)
);

-- Performance indexes for integration config queries
CREATE INDEX IF NOT EXISTS idx_integration_configs_user ON integration_configs(userId);
CREATE INDEX IF NOT EXISTS idx_integration_configs_name ON integration_configs(integrationName);
CREATE INDEX IF NOT EXISTS idx_integration_configs_active ON integration_configs(isActive);
