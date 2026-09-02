# Manual Testing Implementation Summary

## Overview

This document summarizes the implementation of manual testing tools and documentation for verifying that all backend routes properly attach debug information to error responses when expert mode is enabled.

## Deliverables

### 1. Comprehensive Testing Guide

**File**: `manual-testing-guide.md`

A detailed manual testing guide that includes:

- Testing objectives and prerequisites
- Test environment setup instructions
- Detailed test cases for all 58 routes organized by category:
  - Inventory Routes (3 routes)
  - PuppetDB Routes (11 routes)
  - Puppetserver Routes (14 routes)
  - Hiera Routes (13 routes)
  - Execution Routes (6 routes)
  - Task Routes (3 routes)
  - Command Routes (1 route)
  - Package Routes (2 routes)
  - Facts Routes (1 route)
  - Puppet Routes (1 route)
  - Streaming Routes (2 routes)
  - Status Routes (1 route)
- Expected responses for both expert mode enabled and disabled
- Verification checklists for each route
- Summary checklist for overall testing progress

### 2. Automated Testing Script

**File**: `manual-test-expert-mode.sh`

A fully automated bash script that:

- Tests all 58 routes with expert mode enabled and disabled
- Verifies presence/absence of `_debug` field
- Checks for required debug info fields (timestamp, operation, duration)
- Validates error arrays in error responses
- Generates colored console output for easy reading
- Creates a detailed results file (`expert-mode-test-results.txt`)
- Provides pass/fail summary statistics
- Returns appropriate exit codes for CI/CD integration

**Usage**:

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./manual-test-expert-mode.sh
```

### 3. Quick Reference Guide

**File**: `manual-testing-quick-reference.md`

A concise reference document that includes:

- Quick start instructions
- Manual testing examples for individual routes
- What to look for (correct vs incorrect behavior)
- Reference implementation patterns
- Common issues and solutions
- Complete testing checklist (58 routes)
- Next steps after testing

### 4. Interactive Single Route Tester

**File**: `test-single-route.sh`

An interactive tool for spot-checking individual routes:

- Prompts for route details (method, path, body)
- Tests with expert mode enabled and disabled
- Pretty-prints JSON responses
- Shows debug info summary
- Highlights errors, warnings, and info messages
- Validates required fields
- Provides colored output for easy reading

**Usage**:

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./test-single-route.sh
```

## Testing Methodology

### Automated Testing Approach

The automated script follows this methodology for each route:

1. **Expert Mode Enabled Test**:
   - Send request with `X-Expert-Mode: true` header
   - Send request with `X-Correlation-ID` header
   - Verify response is valid JSON
   - Verify `_debug` field is present
   - Verify required fields exist (timestamp, operation, duration)
   - For error responses (HTTP 4xx/5xx), verify `errors` array exists
   - Count errors found

2. **Expert Mode Disabled Test**:
   - Send request without expert mode header
   - Verify response is valid JSON
   - Verify `_debug` field is absent
   - Count errors found

3. **Results Reporting**:
   - Generate detailed results file
   - Provide pass/fail statistics
   - Exit with appropriate code (0 = all passed, 1 = failures)

### Manual Testing Approach

For manual testing, the guide provides:

1. **Curl commands** for each route with expert mode enabled
2. **Expected response structure** showing what debug info should look like
3. **Verification checklists** to ensure all aspects are tested
4. **Curl commands** for each route with expert mode disabled
5. **Expected behavior** (no debug field)

## Route Coverage

### Total Routes: 58

| Category | Count | Routes |
|----------|-------|--------|
| Inventory | 3 | GET /api/inventory, GET /api/inventory/sources, GET /api/inventory/:id |
| PuppetDB | 11 | nodes, facts, resources, reports, catalog, events, admin, metrics |
| Puppetserver | 14 | environments, classes, modules, catalog, nodes, certificates |
| Hiera | 13 | scan, lookup, keys, files, resolve, hierarchy, analyze, modules, forge, catalog, code, puppetfile |
| Executions | 6 | list, get, re-execute, delete, stats, cleanup |
| Tasks | 3 | execute, list, get |
| Commands | 1 | execute |
| Packages | 2 | install, uninstall |
| Facts | 1 | collect |
| Puppet | 1 | run |
| Streaming | 2 | get stream, cancel |
| Status | 1 | integration status |

## Reference Implementation

The testing documentation identifies two reference implementations:

### Primary Reference: Inventory Routes

**File**: `backend/src/routes/inventory.ts`

All 3 inventory routes demonstrate the correct pattern:

- GET /api/inventory
- GET /api/inventory/sources
- GET /api/inventory/:id

### Secondary Reference: PuppetDB Reports Summary

**File**: `backend/src/routes/integrations/puppetdb.ts` (lines 800-900)

The reports summary route demonstrates the complete pattern with all log levels.

## Key Pattern Elements

The correct implementation pattern includes:

```typescript
// 1. Create debug info at start (if expert mode enabled)
const debugInfo = req.expertMode 
  ? expertModeService.createDebugInfo('operationName', req.id, Date.now())
  : undefined;

try {
  // 2. Add info/debug messages during processing
  if (debugInfo) {
    expertModeService.addInfo(debugInfo, {
      message: 'Processing step completed',
      level: 'info'
    });
  }
  
  // 3. Perform operation
  const result = await someOperation();
  
  // 4. Attach debug info to success response
  if (debugInfo) {
    debugInfo.duration = Date.now() - startTime;
    return res.json(expertModeService.attachDebugInfo(result, debugInfo));
  }
  
  return res.json(result);
  
} catch (error) {
  // 5. Add error to debug info
  if (debugInfo) {
    expertModeService.addError(debugInfo, {
      message: error.message,
      stack: error.stack,
      level: 'error'
    });
    debugInfo.duration = Date.now() - startTime;
  }
  
  // 6. Attach debug info to error response
  const errorResponse = { error: 'Operation failed' };
  if (debugInfo) {
    return res.status(500).json(
      expertModeService.attachDebugInfo(errorResponse, debugInfo)
    );
  }
  
  return res.status(500).json(errorResponse);
}
```

## Expected Debug Info Structure

When expert mode is enabled, error responses should include:

```json
{
  "error": "Error message",
  "_debug": {
    "timestamp": "2026-01-19T...",
    "requestId": "...",
    "correlationId": "...",
    "operation": "operationName",
    "duration": 123,
    "errors": [
      {
        "message": "Detailed error message",
        "level": "error",
        "stack": "..."
      }
    ],
    "warnings": [],
    "info": [],
    "performance": {
      "memoryUsage": 123456,
      "cpuUsage": 0.5,
      "activeConnections": 10,
      "cacheStats": {
        "hits": 100,
        "misses": 20,
        "size": 50,
        "hitRate": 0.83
      }
    }
  }
}
```

## Common Issues to Watch For

### Issue 1: Missing `_debug` Field

**Symptom**: Error response doesn't include `_debug` when expert mode enabled
**Cause**: Route not using ExpertModeService properly
**Fix**: Update route to follow reference implementation

### Issue 2: Debug Info Leaking

**Symptom**: `_debug` field present when expert mode disabled
**Cause**: Not checking expert mode flag before attaching debug info
**Fix**: Use `expertModeService.shouldIncludeDebug(req)` check

### Issue 3: Empty Errors Array

**Symptom**: `_debug.errors` array is empty in error response
**Cause**: Not calling `expertModeService.addError()` in catch blocks
**Fix**: Add error capture in all catch blocks

### Issue 4: Missing External API Errors

**Symptom**: External integration errors not visible in debug info
**Cause**: Not capturing integration errors
**Fix**: Wrap external API calls in try-catch and capture errors

## Testing Prerequisites

### Environment Setup

1. **Backend Server Running**:

   ```bash
   cd backend
   npm run dev
   ```

2. **Dependencies Installed**:
   - curl (for HTTP requests)
   - jq (for JSON parsing)
   - bash (for running scripts)

3. **Optional: Misconfigured Integrations**:
   To trigger errors for testing, temporarily misconfigure integrations:

   ```bash
   # Edit backend/.env
   PUPPETDB_URL=http://invalid-puppetdb:8080
   PUPPETSERVER_URL=http://invalid-puppetserver:8140
   BOLT_PROJECT_DIR=/invalid/path
   ```

## Running the Tests

### Option 1: Automated Testing (Recommended)

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./manual-test-expert-mode.sh
```

This will:

- Test all 58 routes
- Generate `expert-mode-test-results.txt`
- Display colored output with pass/fail status
- Exit with code 0 (success) or 1 (failures)

### Option 2: Interactive Single Route Testing

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./test-single-route.sh
```

Follow the prompts to test individual routes.

### Option 3: Manual Testing with Curl

Follow the examples in `manual-testing-guide.md` or `manual-testing-quick-reference.md`.

## Results Interpretation

### Automated Script Output

The script provides:

- **Green ✓**: Test passed
- **Red ✗**: Test failed
- **Yellow**: Test in progress or informational message

### Results File

The `expert-mode-test-results.txt` file contains:

- Timestamp and configuration
- Detailed results for each route
- Pass/fail indicators
- Summary statistics

### Success Criteria

All tests pass when:

- All routes include `_debug` field when expert mode enabled
- All routes exclude `_debug` field when expert mode disabled
- All `_debug` objects have required fields (timestamp, operation, duration)
- Error responses include populated `errors` array
- External API errors are captured in debug info

## Next Steps

After completing manual testing:

1. **Review Results**:
   - Check `expert-mode-test-results.txt` for failures
   - Identify routes that need fixes

2. **Document Issues**:
   - Add findings to `manual-testing-guide.md`
   - Create GitHub issues for bugs

3. **Fix Issues**:
   - Update routes to follow reference implementation
   - Re-run tests to verify fixes

4. **Update Tasks**:
   - Mark task as complete in `tasks.md`
   - Update verification checklist

5. **Proceed to Next Task**:
   - "Verify external API errors are visible in debug info"
   - "Test expert mode across all frontend pages"

## Files Created

1. `manual-testing-guide.md` - Comprehensive testing documentation
2. `manual-test-expert-mode.sh` - Automated testing script
3. `manual-testing-quick-reference.md` - Quick reference guide
4. `test-single-route.sh` - Interactive single route tester
5. `manual-testing-implementation-summary.md` - This document

## Maintenance

### Updating Tests

When adding new routes:

1. Add test case to `manual-testing-guide.md`
2. Add route to automated script `manual-test-expert-mode.sh`
3. Update route count in documentation
4. Update testing checklist

### Modifying Test Logic

When changing test requirements:

1. Update test functions in automated script
2. Update expected responses in guide
3. Update verification checklists
4. Re-run tests to verify changes

## Conclusion

This implementation provides comprehensive manual testing tools and documentation for verifying expert mode debug info attachment across all 58 backend routes. The combination of automated testing, interactive tools, and detailed documentation ensures thorough verification of the expert mode implementation.

The automated script enables quick regression testing, while the manual testing guide provides detailed verification procedures for thorough analysis. The interactive tool allows for spot-checking specific routes during development.

All tools are designed to be maintainable and extensible as the application evolves.
