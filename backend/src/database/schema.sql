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
  stderr TEXT  -- Complete stderr output (stored when expert mode enabled)
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

-- ============================================================================
-- Authentication & Authorization Tables (v1.0.0 RBAC System)
-- ============================================================================

-- Users table for storing user accounts
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  active INTEGER DEFAULT 1,  -- Boolean flag (0 or 1)
  created_at TEXT NOT NULL,  -- ISO 8601 timestamp
  updated_at TEXT,  -- ISO 8601 timestamp
  last_login_at TEXT  -- ISO 8601 timestamp
);

-- Groups table for organizing users
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,  -- ISO 8601 timestamp
  updated_at TEXT  -- ISO 8601 timestamp
);

-- Roles table for permission bundling
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,  -- Higher priority wins in conflict resolution
  is_system INTEGER DEFAULT 0,  -- Boolean flag for built-in roles
  created_at TEXT NOT NULL,  -- ISO 8601 timestamp
  updated_at TEXT  -- ISO 8601 timestamp
);

-- Permissions table for capability-based access control
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  capability TEXT NOT NULL,  -- Capability pattern (e.g., 'command.execute', 'inventory.*', '*')
  action TEXT NOT NULL CHECK(action IN ('allow', 'deny')),
  conditions TEXT,  -- JSON object for conditional permissions
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- User-Group junction table (many-to-many)
CREATE TABLE IF NOT EXISTS user_groups (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- User-Role junction table (direct role assignments)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Group-Role junction table (roles assigned to groups)
CREATE TABLE IF NOT EXISTS group_roles (
  group_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (group_id, role_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Group indexes
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at DESC);

-- Role indexes
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_priority ON roles(priority DESC);
CREATE INDEX IF NOT EXISTS idx_roles_is_system ON roles(is_system);

-- Permission indexes
CREATE INDEX IF NOT EXISTS idx_permissions_role_id ON permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_capability ON permissions(capability);

-- Junction table indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_group_roles_group_id ON group_roles(group_id);
CREATE INDEX IF NOT EXISTS idx_group_roles_role_id ON group_roles(role_id);
