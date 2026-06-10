-- Migration 017: Make password_hash nullable for federated (SSO) users
--
-- Federated users authenticated via Entra ID (or other OIDC providers)
-- have no local password. The design stores NULL in password_hash for
-- these accounts. SQLite does not support ALTER COLUMN, so we recreate
-- the users table with password_hash TEXT (nullable).

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

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes (username and email have UNIQUE in the CREATE TABLE)
-- The federated_identities FK ON DELETE CASCADE still references users(id)
-- which is the same PRIMARY KEY.
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
