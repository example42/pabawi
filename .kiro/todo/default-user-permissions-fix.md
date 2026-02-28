# Default User Permissions Fix

## Issue

Newly registered users were getting "Insufficient permissions to perform this action" errors when trying to access `/api/integrations/status` endpoint, even though they were successfully authenticated.

## Root Cause

When users registered via the `/api/auth/register` endpoint, they were created in the database but **no default role was assigned**. This meant:

- Users had an empty `roles: []` array in their JWT token
- They had zero permissions in the RBAC system
- Any endpoint requiring authentication would work, but any permission check would fail

## Solution

Modified `UserService.createUser()` to automatically assign the **Viewer** role to all newly registered users (unless they're being created as admin users). The Viewer role provides read-only access to all integrations:

- `ansible:read`
- `bolt:read`
- `puppetdb:read`

## Changes Made

- **File**: `pabawi/backend/src/services/UserService.ts`
- **Method**: `createUser()`
- **Change**: Added automatic role assignment after user creation

```typescript
// Assign default Viewer role to new users (unless they're admin)
// This ensures all users have read permissions by default
if (!data.isAdmin) {
  await this.runQuery(
    `INSERT INTO user_roles (userId, roleId, assignedAt)
     SELECT ?, id, ?
     FROM roles
     WHERE name = 'Viewer' AND isBuiltIn = 1
     LIMIT 1`,
    [userId, now]
  );
}
```

## Testing Required

1. Register a new user via `/api/auth/register`
2. Login with the new user credentials
3. Verify the JWT token includes `roles: ["Viewer"]`
4. Access `/api/integrations/status` - should work without permission errors
5. Verify read-only access to other endpoints

## Related Files

- `pabawi/backend/src/database/migrations/002_seed_rbac_data.sql` - Defines the Viewer role
- `pabawi/backend/src/routes/auth.ts` - Registration endpoint
- `pabawi/backend/src/middleware/authMiddleware.ts` - JWT verification
- `pabawi/backend/src/server.ts` - Route middleware configuration
