# Expert Mode Testing Tools - README

## Overview

This directory contains comprehensive testing tools and documentation for verifying that all backend routes properly attach debug information to error responses when expert mode is enabled.

## Quick Start

### 1. Prerequisites

Ensure you have:

- Backend server running (`cd backend && npm run dev`)
- `curl` installed (for HTTP requests)
- `jq` installed (for JSON parsing)
- `bash` shell

### 2. Run Automated Tests

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./manual-test-expert-mode.sh
```

This will test all 58 routes and generate a results file.

### 3. Review Results

```bash
cat expert-mode-test-results.txt
```

## Available Tools

### 1. Automated Testing Script

**File**: `manual-test-expert-mode.sh`

Tests all 58 routes automatically with expert mode enabled and disabled.

**Features**:

- Colored console output (green = pass, red = fail)
- Validates `_debug` field presence/absence
- Checks required debug info fields
- Generates detailed results file
- Returns exit code for CI/CD integration

**Usage**:

```bash
./manual-test-expert-mode.sh
```

**Output**: `expert-mode-test-results.txt`

---

### 2. Interactive Single Route Tester

**File**: `test-single-route.sh`

Interactive tool for testing individual routes.

**Features**:

- Prompts for route details
- Tests with expert mode enabled and disabled
- Pretty-prints JSON responses
- Shows debug info summary
- Highlights errors, warnings, and info

**Usage**:

```bash
./test-single-route.sh
```

Then follow the prompts:

```
Method (GET/POST/DELETE): GET
Path (e.g., /api/inventory): /api/inventory
Correlation ID (optional): test-001
Request body JSON (optional, for POST): 
```

---

### 3. Comprehensive Testing Guide

**File**: `manual-testing-guide.md`

Detailed manual testing documentation.

**Contents**:

- Testing objectives and prerequisites
- Test environment setup
- Detailed test cases for all 58 routes
- Expected responses
- Verification checklists
- Summary checklist

**Use When**: You need detailed testing procedures or want to understand what each test verifies.

---

### 4. Quick Reference Guide

**File**: `manual-testing-quick-reference.md`

Concise reference for quick lookups.

**Contents**:

- Quick start instructions
- Manual testing examples
- Correct vs incorrect behavior
- Reference implementation patterns
- Common issues and solutions
- Complete testing checklist

**Use When**: You need quick answers or examples for manual testing.

---

### 5. Implementation Summary

**File**: `manual-testing-implementation-summary.md`

Overview of the testing implementation.

**Contents**:

- Deliverables summary
- Testing methodology
- Route coverage breakdown
- Expected debug info structure
- Common issues
- Maintenance guidelines

**Use When**: You need to understand the overall testing approach or maintain the tests.

---

## Testing Workflow

### For Quick Verification

```bash
# 1. Start backend server
cd backend
npm run dev

# 2. In another terminal, run automated tests
cd .kiro/specs/pabawi-v0.5.0-release
./manual-test-expert-mode.sh

# 3. Review results
cat expert-mode-test-results.txt
```

### For Detailed Investigation

```bash
# 1. Start backend server
cd backend
npm run dev

# 2. Test specific route interactively
cd .kiro/specs/pabawi-v0.5.0-release
./test-single-route.sh

# 3. Follow prompts and review output
```

### For Manual Testing

```bash
# 1. Start backend server
cd backend
npm run dev

# 2. Open manual testing guide
open manual-testing-guide.md

# 3. Follow test cases for specific routes
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-001" \
  | jq '._debug'
```

## Understanding Test Results

### Automated Script Output

**Green ✓**: Test passed

- `_debug` field present when expert mode enabled
- `_debug` field absent when expert mode disabled
- Required fields present in debug info

**Red ✗**: Test failed

- Missing `_debug` field when expert mode enabled
- `_debug` field present when expert mode disabled
- Missing required fields
- Invalid JSON response
- Connection error

### What to Look For

#### Correct Behavior (Expert Mode Enabled)

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
        "message": "Detailed error",
        "level": "error",
        "stack": "..."
      }
    ],
    "warnings": [],
    "info": [],
    "performance": { ... }
  }
}
```

#### Correct Behavior (Expert Mode Disabled)

```json
{
  "error": "Error message"
}
```

Note: No `_debug` field.

## Common Issues

### Issue 1: Server Not Running

**Error**: `Connection error - server may not be running`

**Solution**:

```bash
cd backend
npm run dev
```

### Issue 2: Missing `_debug` Field

**Error**: `Expert mode enabled: _debug field MISSING`

**Cause**: Route not using ExpertModeService properly

**Solution**: Update route to follow reference implementation in `backend/src/routes/inventory.ts`

### Issue 3: Debug Info Leaking

**Error**: `Expert mode disabled: _debug field present (should be absent)`

**Cause**: Not checking expert mode flag

**Solution**: Use `expertModeService.shouldIncludeDebug(req)` check

### Issue 4: Empty Errors Array

**Error**: Error response has `_debug` but `errors` array is empty

**Cause**: Not calling `expertModeService.addError()` in catch blocks

**Solution**: Add error capture in all catch blocks

## Reference Implementation

The correct pattern is demonstrated in:

- `backend/src/routes/inventory.ts` - All 3 routes
- `backend/src/routes/integrations/puppetdb.ts` - Line 800-900 (reports/summary)

### Key Pattern

```typescript
const debugInfo = req.expertMode 
  ? expertModeService.createDebugInfo('operation', req.id, Date.now())
  : undefined;

try {
  // Add info during processing
  if (debugInfo) {
    expertModeService.addInfo(debugInfo, {
      message: 'Processing...',
      level: 'info'
    });
  }
  
  const result = await operation();
  
  // Attach to success response
  if (debugInfo) {
    debugInfo.duration = Date.now() - startTime;
    return res.json(expertModeService.attachDebugInfo(result, debugInfo));
  }
  
  return res.json(result);
  
} catch (error) {
  // Add error to debug info
  if (debugInfo) {
    expertModeService.addError(debugInfo, {
      message: error.message,
      stack: error.stack,
      level: 'error'
    });
    debugInfo.duration = Date.now() - startTime;
  }
  
  // Attach to error response
  const errorResponse = { error: 'Failed' };
  if (debugInfo) {
    return res.status(500).json(
      expertModeService.attachDebugInfo(errorResponse, debugInfo)
    );
  }
  
  return res.status(500).json(errorResponse);
}
```

## Route Coverage

**Total Routes**: 58

| Category | Count |
|----------|-------|
| Inventory | 3 |
| PuppetDB | 11 |
| Puppetserver | 14 |
| Hiera | 13 |
| Executions | 6 |
| Tasks | 3 |
| Commands | 1 |
| Packages | 2 |
| Facts | 1 |
| Puppet | 1 |
| Streaming | 2 |
| Status | 1 |

See `manual-testing-quick-reference.md` for complete checklist.

## Next Steps

After running tests:

1. **Review Results**: Check `expert-mode-test-results.txt`
2. **Fix Issues**: Update routes that failed tests
3. **Re-test**: Run automated script again
4. **Document**: Add findings to testing guide
5. **Update Tasks**: Mark task as complete in `tasks.md`

## Getting Help

- **Detailed procedures**: See `manual-testing-guide.md`
- **Quick examples**: See `manual-testing-quick-reference.md`
- **Implementation details**: See `manual-testing-implementation-summary.md`
- **Reference code**: See `backend/src/routes/inventory.ts`

## Maintenance

### Adding New Routes

1. Add test case to `manual-testing-guide.md`
2. Add route to `manual-test-expert-mode.sh`
3. Update route count in documentation
4. Update checklist in `manual-testing-quick-reference.md`

### Modifying Tests

1. Update test functions in `manual-test-expert-mode.sh`
2. Update expected responses in guides
3. Update verification checklists
4. Re-run tests to verify changes

## Files in This Directory

```
.kiro/specs/pabawi-v0.5.0-release/
├── TESTING_README.md                          # This file
├── manual-testing-guide.md                    # Comprehensive testing guide
├── manual-test-expert-mode.sh                 # Automated testing script
├── manual-testing-quick-reference.md          # Quick reference guide
├── test-single-route.sh                       # Interactive single route tester
├── manual-testing-implementation-summary.md   # Implementation overview
└── expert-mode-test-results.txt              # Generated results (after running tests)
```

## Support

For issues or questions:

1. Check the guides in this directory
2. Review reference implementation
3. Check common issues section
4. Consult the design document (`design.md`)
5. Review requirements (`requirements.md`)
