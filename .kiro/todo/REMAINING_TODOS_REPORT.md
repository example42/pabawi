# Pabawi Remaining TODOs - Prioritized Report

Generated: March 11, 2026

## Completed Items (Moved to done/)

- ✅ Node Linking Redesign - Backend implementation complete
- ✅ Database Schema Cleanup - Migration-first approach implemented
- ✅ Provisioning Endpoint Fix - Backend endpoint created and working
- ✅ Default User Permissions Fix - Viewer role auto-assignment implemented
- ✅ Proxmox SSL Fix - Environment variable configuration working
- ✅ Batch Execution Missing Action - executeAction method added
- ✅ Docker Missing Schema Files - Dockerfile updated to copy database directory

---

## HIGH PRIORITY

### 1. Test Failures Analysis (47 remaining failures)

**File**: `test-failures-analysis.md`
**Impact**: Blocking CI/CD, test suite reliability
**Effort**: Medium (2-3 hours)

**Remaining Issues**:

- User Roles Tests: Extra viewer role causing count mismatches (~17 failures)
- RBAC Middleware Logging: Log format doesn't match expectations (2 failures)
- SSH Plugin Test: Node not found in inventory (1 failure)
- Property Test: `__proto__` obfuscation returns undefined (1 failure)
- Brute Force Test: SQL syntax error (1 failure)
- Batch Execution Tests: Logic issues (2-3 failures)

**Next Steps**:

1. Fix users.test.ts role assignment expectations (highest impact)
2. Update RBAC logging test expectations
3. Fix remaining edge cases

---

### 2. RBAC Test Failures (115 failures - Error Format Mismatch)

**File**: `rbac-test-failures.md`
**Impact**: Test suite reliability, API consistency
**Effort**: Low (1-2 hours)

**Issue**: Tests expect simple string errors but implementation returns structured error objects.

**Recommended Fix**: Update test assertions to match structured error format:

```javascript
// Change from:
expect(response.body.error).toBe('Unauthorized');
// To:
expect(response.body.code).toBe('UNAUTHORIZED');
expect(response.body.message).toBeDefined();
```

**Affected Files**:

- `test/routes/groups.test.ts` (10 failures)
- `test/routes/roles-permissions.test.ts` (2 failures)
- `test/routes/users.test.ts` (33 failures)
- Integration tests (6 failures - unrelated ansible integration)

---

### 3. Auth Test Database Lifecycle (67 failures)

**File**: `auth-test-database-lifecycle.md`
**Impact**: Test infrastructure, not blocking production
**Effort**: Medium (2-3 hours)

**Issue**: `SQLITE_MISUSE: Database is closed` errors due to async operations running after database closes.

**Recommended Solution**: Use single database per test suite instead of per-test:

```typescript
beforeAll(async () => {
  db = new Database(':memory:');
  await initializeSchema(db);
});

afterAll(async () => {
  await closeDatabase(db);
});

beforeEach(async () => {
  await clearTestData(db);
});
```

---

## MEDIUM PRIORITY

### 4. Environment Configuration Issues

**File**: `env-configuration-issues.md`
**Impact**: Configuration clarity, potential confusion
**Effort**: Low (30 minutes)

**Issues**:

- `STREAMING_BUFFER_SIZE=1024` should be `STREAMING_BUFFER_MS=100`
- Unused priority variables: `BOLT_PRIORITY`, `PUPPETDB_PRIORITY`
- Missing documentation in `.env.example`

**Actions**:

1. Fix variable name in `.env`
2. Remove or implement priority variables
3. Update `.env.example`

---

### 5. Inventory Multiple Source Tags Bug

**File**: `inventory-multiple-source-tags-bug.md`
**Impact**: User experience, visibility of multi-source nodes
**Effort**: Medium (2-3 hours)

**Issue**: `puppet.office.lab42` only shows "PuppetDB" tag but should also show "Bolt" tag.

**Investigation Needed**:

1. Check identifier extraction for this node from both sources
2. Verify both sources return this node
3. Debug node linking process
4. Test `/api/inventory` endpoint

---

### 6. Expert Mode Prototype Pollution

**File**: `expert-mode-prototype-pollution.md`
**Impact**: Security vulnerability (not actively exploited)
**Effort**: Low (1 hour)

**Issue**: Property-based test reveals metadata handling doesn't sanitize dangerous property names like `__proto__`, `constructor`, `prototype`.

**Fix**:

```typescript
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

addMetadata(debugInfo: DebugInfo, key: string, value: unknown): void {
  if (DANGEROUS_KEYS.includes(key)) {
    return; // or sanitize
  }
  debugInfo.metadata[key] = value;
}
```

---

### 7. Proxmox Restart Required

**File**: `proxmox-restart-required.md`
**Impact**: Deployment issue (one-time fix)
**Effort**: Minimal (restart server)

**Issue**: Server running cached code with old undici import.

**Solution**: Restart backend server to pick up updated code.

---

## LOW PRIORITY

### 8. Docker Improvements

**File**: `docker-improvements.md`
**Impact**: Build optimization, security hardening
**Effort**: Medium (3-4 hours)

**High Priority Items**:

- Generate package-lock.json files for deterministic builds
- Add image metadata (LABEL instructions)
- Install only production dependencies in final stage

**Medium Priority**:

- Optimize image size (currently 440MB)
- Enhance .dockerignore

**Low Priority**:

- Build optimization with BuildKit cache
- Multi-platform support
- Security scanning automation

---

### 9. Hiera Classification Mode Toggle

**File**: `hiera-classification-mode-toggle.md`
**Impact**: Enhancement feature
**Effort**: Medium (2-3 hours)

**Status**: Frontend UI implemented, backend needs work.

**Backend Changes Needed**:

1. Add `classificationMode` query parameter to API
2. Update `HieraService.classifyKeyUsage()` with mode parameter
3. Implement both classification strategies (found vs class-matched)

**Dependencies**: Requires fixing class detection first.

---

### 10. Proxmox Not Initialized Issue

**File**: `proxmox-not-initialized-issue.md`
**Status**: Empty file - likely resolved or duplicate

**Action**: Review and delete if no longer relevant.

---

## Summary Statistics

**Total TODOs Reviewed**: 17
**Completed**: 7 (41%)
**Remaining**: 10 (59%)

**By Priority**:

- High: 3 items (test failures, RBAC tests, auth lifecycle)
- Medium: 5 items (env config, inventory bug, security, proxmox restart, docker)
- Low: 2 items (docker improvements, hiera toggle)

**Estimated Total Effort**: 15-20 hours

---

## Recommended Action Plan

**Week 1 - Critical Path**:

1. Fix test failures (users.test.ts role assignments) - 2 hours
2. Update RBAC test assertions - 1 hour
3. Fix remaining test edge cases - 2 hours
4. Fix auth test database lifecycle - 3 hours

**Week 2 - Quality & Security**:
5. Fix environment configuration issues - 30 min
6. Fix expert mode prototype pollution - 1 hour
7. Investigate inventory multiple source tags - 2 hours
8. Restart Proxmox (if still needed) - 5 min

**Week 3 - Enhancements**:
9. Docker improvements (package-lock, metadata) - 2 hours
10. Hiera classification mode (if needed) - 3 hours

---

## Prompt for Next Session

```
Review and fix the remaining test failures in the Pabawi project:

1. HIGH PRIORITY - Fix users.test.ts role assignment tests (~17 failures)
   - Issue: Tests expect specific role counts but users get auto-assigned viewer role
   - Solution: Either set defaultNewUserRole: null in test setup or adjust expectations
   - File: test/routes/users.test.ts

2. Update RBAC test assertions to match structured error format (115 failures)
   - Change from: expect(response.body.error).toBe('Unauthorized')
   - Change to: expect(response.body.code).toBe('UNAUTHORIZED')
   - Files: test/routes/groups.test.ts, test/routes/roles-permissions.test.ts, test/routes/users.test.ts

3. Fix auth test database lifecycle issues (67 failures)
   - Issue: SQLITE_MISUSE errors due to async operations after database closes
   - Solution: Use single database per test suite with data cleanup between tests
   - File: test/routes/auth.test.ts

4. Fix remaining edge cases:
   - RBAC middleware logging format (2 failures)
   - SSH plugin node not found (1 failure)
   - Property test __proto__ obfuscation (1 failure)
   - Brute force SQL syntax error (1 failure)
   - Batch execution logic (2-3 failures)

Start with #1 as it has the highest impact (17 tests).
```
