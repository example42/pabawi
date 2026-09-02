-- Migration 016: Entra ID federated authentication support
-- Adds tables for federated identity linking, OAuth state management,
-- and single-use authorization codes for the frontend token exchange flow.
-- Requirements: 4.1, 4.2, 6.2, 9.6

-- Federated identity links: maps external IdP subjects to Pabawi users
CREATE TABLE IF NOT EXISTS federated_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,           -- 'entra-id'
  subject TEXT NOT NULL,            -- Entra ID 'sub' claim (unique per tenant+user)
  issuer TEXT NOT NULL,             -- Token issuer URL
  email TEXT,                       -- Email from IdP (informational, not authoritative)
  id_token TEXT,                    -- Last ID token (for logout id_token_hint)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_federated_identities_user ON federated_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_federated_identities_lookup ON federated_identities(provider, subject);

-- OAuth state store: PKCE + state + nonce for in-flight authorization requests
CREATE TABLE IF NOT EXISTS oauth_state_store (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state_store(expires_at);

-- Single-use authorization codes for frontend token delivery
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  user_id TEXT NOT NULL,
  id_token TEXT,
  auth_method TEXT NOT NULL DEFAULT 'entra-id',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  exchanged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at);
