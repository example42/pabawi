# Test Failures Analysis - March 4, 2026

## Summary

Started with 91 failing tests, now down to 47 failures.

## Fixed Issues ✅

### 1. Auth Tests - Self-Registration Disabled (FIXED - 44 tests)

**Problem**: Tests expected registration to work, but `setupService.isSelfRegistrationAllowed()` returned false by default.

**Solution**: Updated all auth test files to:

- Use proper DatabaseService initialization
- Enable self-registration in test setup
- Remove broken helper functions (initializeSchema, closeDatabase, etc.)

**Files Fixed**:

- `test/routes/auth.test.ts` - All 5 test suites
- `test/unit/error-handling.test.ts`
- `test/integration/auth-flow.test.ts`

## Remaining Issues 🔧

### 1. User Roles Tests - Extra Viewer Role (~17 failures)

**Problem**: Users are getting an extra "viewer" role assigned automatically, causing count mismatches.

**Affected Tests**:

- `test/routes/users.test.ts` - All role assignment/removal tests
- Tests expect specific role counts but get +1 due to auto-assigned viewer role

**Root Cause**: `defaultNewUserRole` in SetupService defaults to `'role-viewer-001'`

**Fix Needed**: Either:

- Set `defaultNewUserRole: null` in users.test.ts setup
- Or adjust test expectations to account for the viewer role

### 2. RBAC Middleware Logging Tests (2 failures)

**Problem**: Log format doesn't match expected pattern.

**Expected**: `[RBAC] Authorization denied`
**Actual**: `[rbacMiddleware] [checkPermission] Authorization denied`

**Expected**: `[RBAC] Error checking permissions`
**Actual**: Full error stack trace

**Fix Needed**: Update test expectations in `test/middleware/rbacMiddleware.test.ts` to match actual log format.

### 3. SSH Plugin Test - Node Not Found (1 failure)

**Problem**: `getNodeFacts` test tries to get facts for 'ssh:test-node' but node doesn't exist in inventory.

**Fix Needed**: Add the node to inventory before calling getNodeFacts in `src/integrations/ssh/__tests__/SSHPlugin.test.ts`.

### 4. Property Test - **proto** Obfuscation (1 failure)

**Problem**: Obfuscation function returns `undefined` for `__proto__` field instead of `null`.

**Fix Needed**: Handle special JavaScript properties like `__proto__` correctly in obfuscation logic in `test/properties/logging/property-7.test.ts`.

### 5. Brute Force Test - SQL Syntax Error (1 failure)

**Problem**: `SQLITE_ERROR: near "/": syntax error`

**Fix Needed**: Review and fix the SQL query generation in `test/services/AuthenticationService.bruteforce.test.ts`.

### 6. Batch Execution Tests (2-3 failures)

**Problem**: Test logic issues with batch status and cancellation.

**Fix Needed**: Review test expectations in `test/integration/batch-execution.test.ts`.

## Progress Summary

- **Started**: 91 failures
- **Current**: 47 failures  
- **Fixed**: 44 tests (48% reduction)
- **Remaining**: 47 tests across 9 test files

## Next Steps

1. Fix users.test.ts role assignment (highest impact - ~17 tests)
2. Update RBAC logging test expectations (2 tests)
3. Fix remaining edge cases (SSH, property, brute force, batch execution)
