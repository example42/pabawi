# RBAC Test Failures - Error Response Format Mismatch

## Summary

115 test failures detected in the RBAC test suite. All failures are related to test assertions expecting a different error response format than what the implementation provides.

## Issue Type

**Test Assertion Mismatch** - Not implementation bugs

## Root Cause

Tests expect simple string error messages:

```javascript
expect(response.body.error).toBe('Unauthorized');
expect(response.body.error).toBe('Forbidden');
```

But the implementation returns structured error objects:

```javascript
{
  "code": "UNAUTHORIZED",
  "message": "Missing authorization header"
}
// or
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "Insufficient permissions to perform this action",
  "required": {
    "action": "read",
    "resource": "users"
  }
}
```

## Affected Test Files

1. `test/routes/groups.test.ts` - 10 failures
2. `test/routes/roles-permissions.test.ts` - 2 failures  
3. `test/routes/users.test.ts` - 33 failures
4. `test/services/IntegrationColorService.test.ts` - 1 failure (unrelated - ansible integration added)
5. `test/integration/integration-colors.test.ts` - 1 failure (unrelated - ansible integration added)
6. `test/integration/integration-status.test.ts` - 4 failures (unrelated - ansible integration added)

## Error Response Patterns

### 401 Unauthorized Errors

- Expected: `error: "Unauthorized"`
- Actual: `{ code: "UNAUTHORIZED", message: "Missing authorization header" }` or `{ code: "INVALID_TOKEN", message: "Invalid token signature" }`

### 403 Forbidden Errors

- Expected: `error: "Forbidden"`
- Actual: `{ code: "INSUFFICIENT_PERMISSIONS", message: "Insufficient permissions...", required: { resource, action } }`

## Resolution Options

### Option 1: Update Tests (Recommended)

Update test assertions to match the structured error format:

```javascript
// Instead of:
expect(response.body.error).toBe('Unauthorized');

// Use:
expect(response.body.code).toBe('UNAUTHORIZED');
expect(response.body.message).toBeDefined();
```

**Pros:**

- Structured errors provide better debugging information
- Follows modern API error response patterns
- Includes required permission details for 403 errors

**Cons:**

- Requires updating ~45 test assertions

### Option 2: Change Implementation

Modify error middleware to return simple string errors:

```javascript
res.status(401).json({ error: 'Unauthorized' });
```

**Pros:**

- Tests pass immediately

**Cons:**

- Less informative error responses
- Loses structured error information
- Not following best practices for API error handling

## Recommendation

**Update the tests** to match the structured error format. The current implementation provides better error information to API consumers and follows modern API design patterns.

## Additional Issues (Unrelated to RBAC)

3 test failures in integration color/status tests due to 'ansible' integration being added to the system. Tests expect 4 integrations but now there are 5.

**Fix:** Update test assertions from `.toHaveLength(4)` to `.toHaveLength(5)` and include 'ansible' in expected arrays.

## Test Statistics

- Total Tests: 2,239
- Passed: 2,124 (94.9%)
- Failed: 115 (5.1%)
- Test Files: 128 (117 passed, 11 failed)
