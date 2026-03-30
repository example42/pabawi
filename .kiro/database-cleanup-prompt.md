# Database Schema Cleanup - New Conversation Prompt

## Task Overview

Review and clean up the Pabawi database schema structure to eliminate duplicates, remove orphaned files, and establish a clear, maintainable approach for database schema management.

## Background

The project uses SQLite with a hybrid approach: base schema files + migration system. This has led to duplicate definitions and orphaned files that need cleanup.

## Current File Structure

```
backend/src/database/
├── DatabaseService.ts      # Runs only MigrationRunner (migration-first approach)
├── MigrationRunner.ts      # Runs numbered migrations from migrations/
└── migrations/
    ├── 000_initial_schema.sql         # Initial schema: executions + revoked_tokens tables
    ├── 001_initial_rbac.sql           # Creates RBAC tables
    ├── 002_seed_rbac_data.sql         # Seeds roles, permissions, config
    ├── 003_failed_login_attempts.sql  # Adds security tables
    ├── 004_audit_logging.sql          # Adds audit_logs table
    ├── 005_add_ssh_execution_tool.sql # Updates executions table
    └── 006_add_batch_executions.sql   # Adds batch support
```

## Key Files to Examine

Please read these files to understand the current state:

1. **Initialization Logic:**
   - `backend/src/database/DatabaseService.ts` - How schemas are loaded
   - `backend/src/database/MigrationRunner.ts` - How migrations run

2. **Base Schemas:**
   - `backend/src/database/schema.sql` - Executions table
   - `backend/src/database/rbac-schema.sql` - RBAC tables

3. **Orphaned Files (candidates for deletion):**
   - `backend/src/database/audit-schema.sql` - Never loaded, duplicates migration 004
   - `backend/src/database/migrations.sql` - Never loaded, superseded by schema.sql

4. **All Migrations:**
   - `backend/src/database/migrations/001_initial_rbac.sql` through `006_add_batch_executions.sql`

## Problems to Address

### 1. Duplicate Definitions

- `rbac-schema.sql` has identical content to `001_initial_rbac.sql`
- `audit-schema.sql` has identical content to `004_audit_logging.sql`
- Both use `CREATE TABLE IF NOT EXISTS` so they don't conflict, but it's confusing

### 2. Orphaned Files

- `audit-schema.sql` exists but is never loaded by DatabaseService.ts
- `migrations.sql` exists but is never loaded by DatabaseService.ts
- These should probably be deleted

### 3. Unclear Pattern

- Some tables created via base schemas (executions, RBAC)
- Other tables created via migrations (audit_logs, failed_login_attempts, batch_executions)
- No documented reason for the difference

## Current Initialization Flow

For a **new database**:

1. DatabaseService loads `schema.sql` → creates executions table
2. DatabaseService loads `rbac-schema.sql` → creates RBAC tables
3. MigrationRunner runs pending migrations:
   - 001: Tries to create RBAC tables (already exist, skipped due to IF NOT EXISTS)
   - 002: Seeds default data
   - 003: Creates failed_login_attempts tables
   - 004: Tries to create audit_logs (doesn't exist yet, gets created)
   - 005: Updates executions table
   - 006: Creates batch_executions, updates executions

For an **existing database**:

1. Base schemas already applied (no-op due to IF NOT EXISTS)
2. MigrationRunner runs only new migrations since last run

## Decision Points

### Option A: Migration-First Approach (Clean, Standard)

- Move ALL schema definitions to migrations
- Delete base schema files (schema.sql, rbac-schema.sql)
- Update DatabaseService to only run MigrationRunner
- Create migration 000 for initial executions table

**Pros:** Single source of truth, standard approach, clear history
**Cons:** Requires more refactoring, slower initial setup

### Option B: Keep Hybrid Approach (Current, Less Work)

- Keep schema.sql and rbac-schema.sql for initial setup
- Accept that migrations 001 and 004 duplicate base schemas
- Delete only the orphaned files (audit-schema.sql, migrations.sql)
- Document the approach clearly

**Pros:** Less refactoring, faster new DB setup
**Cons:** Duplicate definitions remain, less standard

## Recommended Actions

### Immediate (Safe, Low Risk)

1. Delete `backend/src/database/audit-schema.sql` - never loaded, duplicates migration 004
2. Delete `backend/src/database/migrations.sql` - never loaded, superseded
3. Add comments to DatabaseService.ts explaining the hybrid approach
4. Add comments to schema files noting their relationship to migrations

### Optional (Requires Decision)

1. Choose between Option A (migration-first) or Option B (hybrid)
2. If Option A: Refactor to pure migration approach
3. If Option B: Document and accept the hybrid approach
4. Update developer documentation with schema change policy

## Testing Requirements

After any changes:

- ✅ Test fresh database initialization (no existing pabawi.db)
- ✅ Test migration from previous versions
- ✅ Verify all tables created correctly
- ✅ Run existing database tests
- ✅ Test Docker deployment with clean database
- ✅ Verify setup wizard works

## Questions to Answer

1. **Which approach should we use going forward?** Migration-first
2. **Are the orphaned files safe to delete?** Check for any hidden reference YES
3. **Should we keep duplicate migrations?** (001 and 004 duplicate base schemas) NO
4. **What's the policy for future changes?** Always use migrations? YES

## Success Criteria

- ✅ No orphaned files in the database directory
- ✅ Clear documentation of the schema management approach
- ✅ All tests pass
- ✅ Docker deployment works correctly
