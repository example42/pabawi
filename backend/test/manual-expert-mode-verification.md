# Manual Expert Mode Verification Guide

## Purpose
This guide helps verify that external API errors (PuppetDB, Puppetserver, Bolt) are visible in expert mode debug info.

## Test Scenarios

### Scenario 1: PuppetDB Connection Error

**Steps:**
1. Enable expert mode in the frontend (toggle in UI)
2. Ensure PuppetDB is NOT running or configured incorrectly
3. Navigate to Inventory page or try to fetch nodes
4. Open browser DevTools > Network tab
5. Find the API request to `/api/integrations/puppetdb/nodes`
6. Check the response body

**Expected Result:**
```json
{
  "error": {
    "code": "PUPPETDB_CONNECTION_ERROR",
    "message": "Cannot connect to PuppetDB..."
  },
  "_debug": {
    "timestamp": "...",
    "requestId": "...",
    "integration": "puppetdb",
    "operation": "GET /api/integrations/puppetdb/nodes",
    "duration": 123,
    "errors": [
      {
        "message": "PuppetDB connection error: Cannot connect to PuppetDB...",
        "stack": "Error: ...",
        "level": "error"
      }
    ],
    "warnings": [],
    "info": [...],
    "performance": {...},
    "context": {...}
  }
}
```

**Verification:**
- ✅ `_debug` object is present
- ✅ `_debug.errors` array contains the connection error
- ✅ Error message includes "PuppetDB connection error"
- ✅ Stack trace is present
- ✅ `level` is "error"

### Scenario 2: Puppetserver Authentication Error

**Steps:**
1. Enable expert mode
2. Configure Puppetserver with invalid credentials
3. Try to fetch environments or catalogs
4. Check API response in DevTools

**Expected Result:**
```json
{
  "error": {
    "code": "PUPPETSERVER_AUTH_ERROR",
    "message": "Authentication failed..."
  },
  "_debug": {
    "errors": [
      {
        "message": "Puppetserver authentication error: Authentication failed...",
        "stack": "...",
        "level": "error"
      }
    ]
  }
}
```

### Scenario 3: Bolt Execution Error

**Steps:**
1. Enable expert mode
2. Try to execute a task on an unreachable node
3. Check API response

**Expected Result:**
```json
{
  "error": {
    "code": "BOLT_EXECUTION_ERROR",
    "message": "..."
  },
  "_debug": {
    "integration": "bolt",
    "errors": [
      {
        "message": "Bolt execution failed: ...",
        "stack": "...",
        "level": "error"
      }
    ]
  }
}
```

## Frontend Display Verification

### Check ExpertModeDebugPanel Component

**Steps:**
1. Enable expert mode
2. Trigger an API error (any of the above scenarios)
3. Look for the ExpertModeDebugPanel component on the page
4. Verify it displays:
   - Error count badge (red)
   - Warning count badge (yellow) if any
   - Info count badge (blue) if any
   - Expandable error messages in red text

**Expected Display:**
- Compact mode: Shows error/warning/info counts and first 2 messages
- Full mode: Shows all errors, warnings, info with proper color coding
  - Errors: Red background, red text
  - Warnings: Yellow background, yellow text
  - Info: Blue background, blue text

### Check Timeline View

**Steps:**
1. Enable expert mode
2. Trigger an API error
3. Open the ExpertModeDebugPanel
4. Click on "Timeline View"
5. Verify errors appear in the timeline with:
   - Red "ERROR" badge
   - "backend" source badge
   - Error message
   - Stack trace (expandable)

## Common Issues

### Issue: Errors not showing in UI

**Possible Causes:**
1. Expert mode not enabled
2. Debug info not being attached to response
3. Frontend component not rendering errors
4. Errors array is empty

**Debug Steps:**
1. Check browser DevTools > Network > Response body
2. Verify `_debug.errors` array exists and has items
3. Check browser Console for React/Svelte errors
4. Verify ExpertModeDebugPanel component is mounted

### Issue: Only info/debug showing, not errors/warnings

**Possible Causes:**
1. Routes not calling `expertModeService.addError()` or `expertModeService.addWarning()`
2. Error handling catching errors but not adding to debug info
3. Frontend filtering errors incorrectly

**Debug Steps:**
1. Check route implementation - verify error catch blocks call `addError()`
2. Check response body - verify errors array is populated
3. Check frontend component - verify it's not filtering out errors

## Verification Checklist

- [ ] PuppetDB connection errors appear in `_debug.errors`
- [ ] PuppetDB authentication errors appear in `_debug.errors`
- [ ] PuppetDB query errors appear in `_debug.errors`
- [ ] Puppetserver connection errors appear in `_debug.errors`
- [ ] Puppetserver authentication errors appear in `_debug.errors`
- [ ] Bolt execution errors appear in `_debug.errors`
- [ ] Bolt timeout errors appear in `_debug.errors`
- [ ] Bolt node unreachable errors appear in `_debug.errors`
- [ ] All errors include stack traces
- [ ] All errors have `level: "error"`
- [ ] Frontend displays errors in red
- [ ] Frontend displays warnings in yellow
- [ ] Frontend displays info in blue
- [ ] Timeline view shows all log levels
- [ ] Copy button includes all error details

## Conclusion

Based on the integration tests and code review:

✅ **Backend IS capturing external API errors correctly**
- All routes properly catch external API errors
- Errors are added to debug info with `expertModeService.addError()`
- Stack traces are included
- Error messages are descriptive

✅ **Frontend IS displaying errors correctly**
- ExpertModeDebugPanel shows errors in red
- Warnings shown in yellow
- Info shown in blue
- Timeline view includes all log levels

**If errors/warnings are not showing:**
1. Verify expert mode is enabled (X-Expert-Mode header sent)
2. Check browser DevTools Network tab for `_debug.errors` in response
3. Check browser Console for component errors
4. Verify the specific route is implementing expert mode correctly
