# Expert Mode Manual Testing - Quick Reference

## Quick Start

### 1. Start the Backend Server

```bash
cd backend
npm run dev
```

### 2. Run the Automated Test Script

```bash
cd .kiro/specs/pabawi-v0.5.0-release
./manual-test-expert-mode.sh
```

The script will:

- Test all 58 routes with expert mode enabled and disabled
- Verify `_debug` field presence/absence
- Check for required debug info fields
- Generate a detailed results file: `expert-mode-test-results.txt`

### 3. Review Results

```bash
cat expert-mode-test-results.txt
```

Or open in your editor to review detailed test results.

## Manual Testing (Individual Routes)

If you need to test specific routes manually:

### Test with Expert Mode Enabled

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: manual-test-001" \
  | jq '._debug'
```

### Test with Expert Mode Disabled

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  | jq '._debug'
```

Expected: `null` (no debug field)

## What to Look For

### ✓ Correct Behavior

When expert mode is **enabled**, error responses should include:

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
      ...
    }
  }
}
```

When expert mode is **disabled**, error responses should be:

```json
{
  "error": "Error message"
}
```

### ✗ Incorrect Behavior

**Problem 1**: Missing `_debug` field when expert mode enabled

- **Cause**: Route not using ExpertModeService properly
- **Fix**: Update route to follow reference implementation

**Problem 2**: `_debug` field present when expert mode disabled

- **Cause**: Not checking expert mode flag before attaching debug info
- **Fix**: Use `expertModeService.shouldIncludeDebug(req)` check

**Problem 3**: Empty `errors` array in error response

- **Cause**: Not calling `expertModeService.addError()` in catch blocks
- **Fix**: Add error capture in all catch blocks

**Problem 4**: Missing external API error details

- **Cause**: Not capturing integration errors
- **Fix**: Wrap external API calls in try-catch and capture errors

## Reference Implementation

The **correct pattern** is demonstrated in:

- `backend/src/routes/inventory.ts` - All 3 routes
- `backend/src/routes/integrations/puppetdb.ts` - Line 800-900 (reports/summary route)

### Key Pattern Elements

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

## Common Issues and Solutions

### Issue 1: Server Not Running

**Error**: `Connection error - server may not be running`

**Solution**:

```bash
cd backend
npm run dev
```

### Issue 2: Invalid JSON Response

**Error**: `Invalid JSON response`

**Possible Causes**:

- Server crashed
- Route returning HTML error page
- CORS issues

**Solution**: Check server logs for errors

### Issue 3: Missing Required Fields

**Error**: `Debug info missing required fields`

**Solution**: Ensure `createDebugInfo()` is called with all required parameters:

```typescript
expertModeService.createDebugInfo(
  'operationName',  // operation
  req.id,           // requestId
  Date.now()        // startTime
);
```

### Issue 4: External API Errors Not Captured

**Error**: Error response has `_debug` but `errors` array is empty

**Solution**: Add try-catch around external API calls:

```typescript
try {
  const result = await puppetDBService.getNodes();
} catch (error) {
  if (debugInfo) {
    expertModeService.addError(debugInfo, {
      message: `PuppetDB error: ${error.message}`,
      stack: error.stack,
      level: 'error'
    });
  }
  throw error;
}
```

## Testing Checklist

Use this checklist to track testing progress:

### Inventory Routes (3/3)

- [ ] GET /api/inventory
- [ ] GET /api/inventory/sources
- [ ] GET /api/inventory/:id

### PuppetDB Routes (11/11)

- [ ] GET /api/integrations/puppetdb/nodes
- [ ] GET /api/integrations/puppetdb/nodes/:certname
- [ ] GET /api/integrations/puppetdb/nodes/:certname/facts
- [ ] GET /api/integrations/puppetdb/nodes/:certname/resources
- [ ] GET /api/integrations/puppetdb/nodes/:certname/reports
- [ ] GET /api/integrations/puppetdb/reports/:hash
- [ ] GET /api/integrations/puppetdb/reports/summary ⭐ (REFERENCE)
- [ ] GET /api/integrations/puppetdb/nodes/:certname/catalog
- [ ] GET /api/integrations/puppetdb/events
- [ ] GET /api/integrations/puppetdb/admin/summary-stats
- [ ] GET /api/integrations/puppetdb/metrics

### Puppetserver Routes (14/14)

- [ ] GET /api/integrations/puppetserver/environments
- [ ] GET /api/integrations/puppetserver/environments/:environment/classes
- [ ] GET /api/integrations/puppetserver/environments/:environment/modules
- [ ] POST /api/integrations/puppetserver/catalog/compile
- [ ] GET /api/integrations/puppetserver/nodes
- [ ] GET /api/integrations/puppetserver/nodes/:certname
- [ ] GET /api/integrations/puppetserver/nodes/:certname/catalog
- [ ] POST /api/integrations/puppetserver/catalog/compare
- [ ] GET /api/integrations/puppetserver/certificate-requests
- [ ] POST /api/integrations/puppetserver/certificate-requests/:certname/sign
- [ ] DELETE /api/integrations/puppetserver/certificate-requests/:certname
- [ ] GET /api/integrations/puppetserver/certificates/:certname
- [ ] DELETE /api/integrations/puppetserver/certificates/:certname
- [ ] GET /api/integrations/puppetserver/status

### Hiera Routes (13/13)

- [ ] GET /api/integrations/hiera/scan
- [ ] POST /api/integrations/hiera/lookup
- [ ] GET /api/integrations/hiera/keys
- [ ] GET /api/integrations/hiera/files
- [ ] POST /api/integrations/hiera/resolve
- [ ] GET /api/integrations/hiera/hierarchy
- [ ] POST /api/integrations/hiera/analyze
- [ ] GET /api/integrations/hiera/modules
- [ ] GET /api/integrations/hiera/forge/search
- [ ] GET /api/integrations/hiera/forge/module/:name
- [ ] POST /api/integrations/hiera/catalog/compile
- [ ] POST /api/integrations/hiera/code/analyze
- [ ] GET /api/integrations/hiera/puppetfile

### Execution Routes (6/6)

- [ ] GET /api/executions
- [ ] GET /api/executions/:id
- [ ] POST /api/executions/:id/re-execute
- [ ] DELETE /api/executions/:id
- [ ] GET /api/executions/stats
- [ ] POST /api/executions/cleanup

### Task Routes (3/3)

- [ ] POST /api/nodes/:id/task
- [ ] GET /api/tasks
- [ ] GET /api/tasks/:name

### Command Routes (1/1)

- [ ] POST /api/nodes/:id/command

### Package Routes (2/2)

- [ ] POST /api/nodes/:id/packages/install
- [ ] POST /api/nodes/:id/packages/uninstall

### Facts Routes (1/1)

- [ ] POST /api/nodes/:id/facts

### Puppet Routes (1/1)

- [ ] POST /api/nodes/:id/puppet-run

### Streaming Routes (2/2)

- [ ] GET /api/streaming/executions/:id
- [ ] POST /api/streaming/executions/:id/cancel

### Status Routes (1/1)

- [ ] GET /api/integrations/

**Total: 58 routes**

## Next Steps

After completing manual testing:

1. Review `expert-mode-test-results.txt` for any failures
2. Document issues in the main testing guide
3. Create GitHub issues for bugs discovered
4. Update tasks.md to mark task as complete
5. Proceed to next verification task

## Additional Resources

- **Full Testing Guide**: `manual-testing-guide.md`
- **Design Document**: `design.md` (Section: Expert Mode Architecture)
- **Requirements**: `requirements.md` (Requirement 3: Expert Mode)
- **Reference Implementation**: `backend/src/routes/inventory.ts`
