# Expert Mode Testing - Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: Server Not Running

**Symptoms**:

- `Connection error - server may not be running`
- `curl: (7) Failed to connect to localhost port 3000`
- All tests fail immediately

**Diagnosis**:

```bash
curl -s http://localhost:3000/api/integrations/ > /dev/null
echo $?  # Should return 0 if server is running
```

**Solutions**:

1. **Start the backend server**:

   ```bash
   cd backend
   npm run dev
   ```

2. **Check if port 3000 is in use**:

   ```bash
   lsof -i :3000
   ```

3. **Check server logs for errors**:

   ```bash
   cd backend
   npm run dev 2>&1 | tee server.log
   ```

4. **Verify environment variables**:

   ```bash
   cd backend
   cat .env
   ```

---

### Issue 2: Missing `_debug` Field (Expert Mode Enabled)

**Symptoms**:

- Test fails with: `Expert mode enabled: _debug field MISSING`
- Response is valid JSON but lacks `_debug` field
- Error occurs when expert mode header is sent

**Diagnosis**:

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-001" \
  | jq 'has("_debug")'
# Should return: true
```

**Root Causes**:

1. **Route not using ExpertModeService**
2. **Debug info created but not attached to response**
3. **Expert mode middleware not applied**
4. **Using broken utility functions**

**Solutions**:

1. **Check if route uses ExpertModeService**:

   ```typescript
   // WRONG - Not using ExpertModeService
   router.get('/api/route', async (req, res) => {
     try {
       const result = await operation();
       res.json(result);
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   
   // CORRECT - Using ExpertModeService
   router.get('/api/route', async (req, res) => {
     const startTime = Date.now();
     const debugInfo = req.expertMode 
       ? expertModeService.createDebugInfo('operation', req.id, startTime)
       : undefined;
     
     try {
       const result = await operation();
       
       if (debugInfo) {
         debugInfo.duration = Date.now() - startTime;
         return res.json(expertModeService.attachDebugInfo(result, debugInfo));
       }
       
       res.json(result);
     } catch (error) {
       if (debugInfo) {
         expertModeService.addError(debugInfo, {
           message: error.message,
           stack: error.stack,
           level: 'error'
         });
         debugInfo.duration = Date.now() - startTime;
       }
       
       const errorResponse = { error: error.message };
       if (debugInfo) {
         return res.status(500).json(
           expertModeService.attachDebugInfo(errorResponse, debugInfo)
         );
       }
       
       res.status(500).json(errorResponse);
     }
   });
   ```

2. **Verify expert mode middleware is applied**:

   ```typescript
   // In server.ts or route file
   import { expertModeMiddleware } from './middleware/expertMode';
   
   app.use(expertModeMiddleware);
   ```

3. **Check reference implementation**:
   - See `backend/src/routes/inventory.ts` for correct pattern
   - See `backend/src/routes/integrations/puppetdb.ts` (reports/summary route)

---

### Issue 3: `_debug` Field Present (Expert Mode Disabled)

**Symptoms**:

- Test fails with: `Expert mode disabled: _debug field present (should be absent)`
- Debug info leaking when it shouldn't
- Security concern - exposing internal details

**Diagnosis**:

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  | jq 'has("_debug")'
# Should return: false
```

**Root Causes**:

1. **Not checking expert mode flag before attaching debug info**
2. **Always creating debug info regardless of flag**
3. **Middleware not setting expert mode flag correctly**

**Solutions**:

1. **Always check expert mode flag**:

   ```typescript
   // WRONG - Always attaching debug info
   const debugInfo = expertModeService.createDebugInfo(...);
   return res.json(expertModeService.attachDebugInfo(result, debugInfo));
   
   // CORRECT - Conditional attachment
   const debugInfo = req.expertMode 
     ? expertModeService.createDebugInfo(...)
     : undefined;
   
   if (debugInfo) {
     return res.json(expertModeService.attachDebugInfo(result, debugInfo));
   }
   
   return res.json(result);
   ```

2. **Use shouldIncludeDebug helper**:

   ```typescript
   if (expertModeService.shouldIncludeDebug(req)) {
     // Attach debug info
   }
   ```

3. **Verify middleware is working**:

   ```typescript
   // Add logging to check flag
   console.log('Expert mode:', req.expertMode);
   ```

---

### Issue 4: Empty Errors Array in Error Response

**Symptoms**:

- Test shows: `Error response missing errors array`
- `_debug.errors` is empty `[]` even though error occurred
- Error details not captured

**Diagnosis**:

```bash
curl -X GET "http://localhost:3000/api/inventory/invalid" \
  -H "X-Expert-Mode: true" \
  | jq '._debug.errors | length'
# Should return: > 0 for error responses
```

**Root Causes**:

1. **Not calling `addError()` in catch blocks**
2. **Errors thrown but not captured**
3. **Using broken utility functions**

**Solutions**:

1. **Always capture errors in catch blocks**:

   ```typescript
   // WRONG - Not capturing error
   try {
     const result = await operation();
   } catch (error) {
     return res.status(500).json({ error: error.message });
   }
   
   // CORRECT - Capturing error
   try {
     const result = await operation();
   } catch (error) {
     if (debugInfo) {
       expertModeService.addError(debugInfo, {
         message: error.message,
         stack: error.stack,
         level: 'error'
       });
     }
     
     const errorResponse = { error: error.message };
     if (debugInfo) {
       return res.status(500).json(
         expertModeService.attachDebugInfo(errorResponse, debugInfo)
       );
     }
     
     return res.status(500).json(errorResponse);
   }
   ```

2. **Capture external API errors**:

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

---

### Issue 5: Missing Required Fields in Debug Info

**Symptoms**:

- Test shows: `Debug info missing required fields`
- `timestamp`, `operation`, or `duration` is missing
- Debug info structure incomplete

**Diagnosis**:

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  | jq '._debug | {timestamp, operation, duration}'
# All fields should be present
```

**Root Causes**:

1. **Not calling `createDebugInfo()` with all parameters**
2. **Not setting duration before attaching**
3. **Incorrect parameter order**

**Solutions**:

1. **Always provide all parameters to createDebugInfo**:

   ```typescript
   // WRONG - Missing parameters
   const debugInfo = expertModeService.createDebugInfo('operation');
   
   // CORRECT - All parameters
   const startTime = Date.now();
   const debugInfo = expertModeService.createDebugInfo(
     'operationName',  // operation
     req.id,           // requestId
     startTime         // startTime
   );
   ```

2. **Always set duration before attaching**:

   ```typescript
   if (debugInfo) {
     debugInfo.duration = Date.now() - startTime;
     return res.json(expertModeService.attachDebugInfo(result, debugInfo));
   }
   ```

3. **Check ExpertModeService implementation**:

   ```typescript
   // In ExpertModeService
   createDebugInfo(operation: string, requestId: string, startTime: number): DebugInfo {
     return {
       timestamp: new Date().toISOString(),
       requestId,
       operation,
       duration: 0,  // Will be set later
       errors: [],
       warnings: [],
       info: []
     };
   }
   ```

---

### Issue 6: Invalid JSON Response

**Symptoms**:

- Test shows: `Invalid JSON response`
- Response cannot be parsed by `jq`
- Server returning HTML error page

**Diagnosis**:

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true"
# Check if response is valid JSON
```

**Root Causes**:

1. **Server crashed or threw unhandled exception**
2. **Middleware error**
3. **CORS issues**
4. **Wrong content-type header**

**Solutions**:

1. **Check server logs**:

   ```bash
   cd backend
   npm run dev
   # Look for error messages
   ```

2. **Verify route is registered**:

   ```typescript
   // In server.ts
   app.use('/api', routes);
   ```

3. **Check for syntax errors**:

   ```bash
   cd backend
   npm run build
   # Look for TypeScript errors
   ```

4. **Test route directly in browser**:

   ```
   http://localhost:3000/api/inventory
   ```

---

### Issue 7: External API Errors Not Captured

**Symptoms**:

- PuppetDB/Puppetserver/Bolt errors not visible in debug info
- `_debug.errors` is empty even though external API failed
- Generic error message without details

**Diagnosis**:

```bash
# Temporarily misconfigure integration
PUPPETDB_URL=http://invalid:8080 npm run dev

# Test route
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes" \
  -H "X-Expert-Mode: true" \
  | jq '._debug.errors'
# Should contain PuppetDB connection error
```

**Root Causes**:

1. **External API calls not wrapped in try-catch**
2. **Errors thrown but not captured in debug info**
3. **Generic error handling losing details**

**Solutions**:

1. **Wrap external API calls in try-catch**:

   ```typescript
   // WRONG - Not capturing external error
   const nodes = await puppetDBService.getNodes();
   
   // CORRECT - Capturing external error
   try {
     const nodes = await puppetDBService.getNodes();
   } catch (error) {
     if (debugInfo) {
       expertModeService.addError(debugInfo, {
         message: `PuppetDB connection failed: ${error.message}`,
         stack: error.stack,
         level: 'error'
       });
     }
     throw error;
   }
   ```

2. **Preserve error details**:

   ```typescript
   catch (error) {
     if (debugInfo) {
       expertModeService.addError(debugInfo, {
         message: error.message,
         stack: error.stack,
         level: 'error',
         // Add context
         context: {
           integration: 'PuppetDB',
           endpoint: puppetDBUrl,
           operation: 'getNodes'
         }
       });
     }
     throw error;
   }
   ```

---

### Issue 8: Tests Timing Out

**Symptoms**:

- Tests hang indefinitely
- No response from server
- Script appears frozen

**Diagnosis**:

```bash
# Test with timeout
curl -X GET "http://localhost:3000/api/inventory" \
  --max-time 5 \
  -H "X-Expert-Mode: true"
```

**Root Causes**:

1. **Route has infinite loop**
2. **Async operation not awaited**
3. **Response not sent**
4. **External API timeout**

**Solutions**:

1. **Add timeouts to external API calls**:

   ```typescript
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 5000);
   
   try {
     const response = await fetch(url, { signal: controller.signal });
   } finally {
     clearTimeout(timeout);
   }
   ```

2. **Ensure response is always sent**:

   ```typescript
   try {
     const result = await operation();
     return res.json(result);  // Always return
   } catch (error) {
     return res.status(500).json({ error: error.message });  // Always return
   }
   ```

3. **Check for missing await**:

   ```typescript
   // WRONG - Not awaiting
   const result = operation();  // Missing await
   
   // CORRECT - Awaiting
   const result = await operation();
   ```

---

### Issue 9: Permission Denied on Scripts

**Symptoms**:

- `Permission denied` when running scripts
- `./manual-test-expert-mode.sh: Permission denied`

**Diagnosis**:

```bash
ls -la *.sh
# Check if scripts have execute permission
```

**Solutions**:

1. **Make scripts executable**:

   ```bash
   chmod +x manual-test-expert-mode.sh
   chmod +x test-single-route.sh
   ```

2. **Or run with bash**:

   ```bash
   bash manual-test-expert-mode.sh
   ```

---

### Issue 10: jq Not Found

**Symptoms**:

- `jq: command not found`
- Scripts fail with jq errors

**Solutions**:

1. **Install jq**:

   ```bash
   # macOS
   brew install jq
   
   # Ubuntu/Debian
   sudo apt-get install jq
   
   # CentOS/RHEL
   sudo yum install jq
   ```

2. **Verify installation**:

   ```bash
   jq --version
   ```

---

## Debugging Workflow

### Step 1: Identify the Issue

1. Run automated tests to identify failing routes
2. Note the specific error message
3. Check if issue is consistent or intermittent

### Step 2: Isolate the Problem

1. Use interactive tester to test specific route
2. Check server logs for errors
3. Test with curl directly

### Step 3: Diagnose Root Cause

1. Review route implementation
2. Compare with reference implementation
3. Check for common patterns in this guide

### Step 4: Apply Fix

1. Update route code
2. Restart server
3. Re-run tests

### Step 5: Verify Fix

1. Run automated tests again
2. Verify specific route passes
3. Check for regressions

---

## Quick Diagnostic Commands

### Check Server Status

```bash
curl -s http://localhost:3000/api/integrations/ > /dev/null && echo "Server running" || echo "Server not running"
```

### Test Expert Mode Header

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  | jq 'has("_debug")'
```

### Check Debug Info Structure

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  | jq '._debug | keys'
```

### Count Errors in Debug Info

```bash
curl -X GET "http://localhost:3000/api/inventory/invalid" \
  -H "X-Expert-Mode: true" \
  | jq '._debug.errors | length'
```

### Test Without Expert Mode

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  | jq 'has("_debug")'
# Should return: false
```

---

## Getting Help

If you're still stuck:

1. **Review Documentation**:
   - `TESTING_README.md` - Usage instructions
   - `manual-testing-guide.md` - Detailed procedures
   - `manual-testing-quick-reference.md` - Quick examples

2. **Check Reference Implementation**:
   - `backend/src/routes/inventory.ts` - Primary reference
   - `backend/src/routes/integrations/puppetdb.ts` - Secondary reference

3. **Review Design Document**:
   - `.kiro/specs/pabawi-v0.5.0-release/design.md`
   - Section: Expert Mode Architecture

4. **Check Requirements**:
   - `.kiro/specs/pabawi-v0.5.0-release/requirements.md`
   - Requirement 3: Expert Mode Debugging Enhancements

---

## Prevention Tips

### Before Writing Code

1. Review reference implementation
2. Understand the pattern
3. Plan error handling

### While Writing Code

1. Follow the pattern exactly
2. Add error capture in all catch blocks
3. Test as you go

### After Writing Code

1. Run automated tests
2. Test with interactive tester
3. Verify error responses
4. Check external API error capture

---

## Common Mistakes to Avoid

1. ❌ Not checking expert mode flag before attaching debug info
2. ❌ Creating debug info but not attaching to response
3. ❌ Not capturing errors in catch blocks
4. ❌ Not wrapping external API calls in try-catch
5. ❌ Not setting duration before attaching debug info
6. ❌ Using broken utility functions instead of ExpertModeService
7. ❌ Not testing both expert mode enabled and disabled
8. ❌ Assuming success responses don't need debug info

---

## Success Checklist

Before considering a route complete:

- [ ] Route uses ExpertModeService
- [ ] Debug info created conditionally (only if expert mode enabled)
- [ ] Debug info attached to both success and error responses
- [ ] All catch blocks capture errors in debug info
- [ ] External API calls wrapped in try-catch
- [ ] Duration set before attaching debug info
- [ ] Tested with expert mode enabled (has `_debug`)
- [ ] Tested with expert mode disabled (no `_debug`)
- [ ] Error responses include populated `errors` array
- [ ] External API errors visible in debug info
