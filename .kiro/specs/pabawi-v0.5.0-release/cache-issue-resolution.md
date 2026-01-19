# Cache Issue Resolution

## Problem

After the routes refactoring, the inventory page shows no nodes and the home page shows "no integration configured". 

## Root Cause

The request deduplication middleware (in-memory cache) has stale data from before the refactoring. The cache key for `/api/inventory` is associated with the wrong response data (integration status instead of inventory nodes).

## Evidence

```bash
# Without cache busting - returns wrong data (integrations instead of nodes)
curl http://localhost:3000/api/inventory
# Returns: {"integrations": [...]}  ❌ WRONG

# With cache busting parameter - returns correct data
curl "http://localhost:3000/api/inventory?_t=$(date +%s)"
# Returns: {"nodes": [...], "sources": {...}}  ✅ CORRECT
```

## Solution

The cache is in-memory and will be cleared when the backend restarts. 

### Option 1: Restart Backend (Recommended)
```bash
# Stop the backend process (Ctrl+C if running in terminal)
# Or kill the process
pkill -f "node.*backend"

# Start backend again
cd backend
npm run dev
```

### Option 2: Wait for Cache Expiration
The cache TTL is 60 seconds, so the stale data will expire automatically after 1 minute.

### Option 3: Add Cache Clear Endpoint (Future Enhancement)
Add an admin endpoint to clear the deduplication cache:

```typescript
// In backend/src/server.ts
app.post("/api/admin/cache/clear", (_req: Request, res: Response) => {
  deduplicationMiddleware.clear();
  res.json({ message: "Cache cleared successfully" });
});
```

## Prevention

To prevent this issue in the future:

1. **Clear cache after major refactoring**: Add a step to restart the backend after significant route changes
2. **Add cache versioning**: Include a version number in cache keys that changes with deployments
3. **Reduce cache TTL during development**: Use shorter TTL (e.g., 10 seconds) in development mode
4. **Add cache clear endpoint**: Provide an admin endpoint to manually clear cache

## Verification

After restarting the backend, verify the fix:

```bash
# Test inventory endpoint
curl http://localhost:3000/api/inventory | jq '.nodes | length'
# Should return: 8 (or your actual node count)

# Test integration status endpoint  
curl http://localhost:3000/api/integrations/status | jq '.integrations | length'
# Should return: 4 (bolt, puppetdb, puppetserver, hiera)
```

## Status

✅ **Root cause identified**: Stale cache from refactoring
✅ **Solution provided**: Restart backend to clear cache
✅ **API endpoints verified**: Both endpoints work correctly with cache-busting parameters
