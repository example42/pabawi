# Bug: Docker Image Missing Database Schema Files

## Issue

On clean Docker setup using 0.8.0 image, the application fails to start with database errors:

```
ERROR [SetupService] [isSetupComplete] Failed to check setup status
Error: SQLITE_ERROR: no such table: users
```

Users see login page with 500 backend errors.

## Root Cause

The Dockerfile was only copying `schema.sql` but not the other required database files:

- `rbac-schema.sql` (contains users, roles, permissions tables)
- `audit-schema.sql` (contains audit logging tables)
- `migrations/` directory (contains database migrations)

TypeScript compiler only copies `.ts` files to `dist/`, so SQL files and migrations must be explicitly copied.

## Fix Applied

Updated Dockerfile to copy the entire database directory structure:

```dockerfile
# Copy database directory with all SQL files and migrations (not copied by TypeScript compiler)
# This ensures schema files, migrations, and any future database-related files are included
COPY --from=backend-builder --chown=pabawi:pabawi /app/backend/src/database/ ./dist/database/
```

This approach is future-proof - any new schema files or migrations added to `src/database/` will automatically be included in the Docker image.

## Testing Required

1. Rebuild Docker image with the fix: `docker build -t pabawi:0.8.0-fixed .`
2. Test clean deployment (no existing database)
3. Verify setup page loads correctly
4. Verify admin user creation works
5. Verify login functionality
6. Check that all migrations run successfully

## Related Files

- `pabawi/Dockerfile`
- `pabawi/backend/src/database/DatabaseService.ts`
- `pabawi/backend/src/database/` (entire directory now copied)
