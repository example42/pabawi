-- pabawi:sqlite-foreign-keys-off
--
-- Migration 017 (SQLite): make password_hash nullable for federated (SSO) users
--
-- Federated users authenticated via Entra ID (or another OIDC provider) have no
-- local password, so password_hash stores NULL for those accounts. SQLite has no
-- ALTER COLUMN, so the table has to be rebuilt.
--
-- The `pabawi:sqlite-foreign-keys-off` directive on the first line is required.
-- With foreign keys enabled, DROP TABLE users performs an implicit DELETE that
-- fires ON DELETE CASCADE on user_roles, user_groups, revoked_tokens and
-- federated_identities, and ON DELETE SET NULL on audit_logs and
-- journal_entries. The user rows are copied across, but every authorization
-- relationship and federation link is destroyed. `PRAGMA foreign_keys` is a
-- no-op inside a transaction, so the runner brackets the transaction with it
-- and runs `PRAGMA foreign_key_check` before committing.

-- Step 1: Create new table without NOT NULL on password_hash
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,            -- NULL for federation-only accounts
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

-- Step 2: Copy all existing data
INSERT INTO users_new (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at, last_login_at)
SELECT id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at, last_login_at
FROM users;

-- Step 3: Drop old table. Safe only because enforcement is suspended.
DROP TABLE users;

-- Step 4: Rename new table. Referencing tables still name `users` in their
-- REFERENCES clauses, so they resolve to this table again.
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes (username and email have UNIQUE in the CREATE TABLE)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
