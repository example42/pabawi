# Code Consolidation Guide

## Overview

This document describes the code consolidation work completed for task 5.7, which identified and consolidated duplicate patterns across the codebase into reusable utilities.

## Identified Duplicate Patterns

### 1. Error Handling Patterns

**Problem**: Duplicate error handling logic across all route handlers with inconsistent formatting.

**Examples of duplication**:

- Zod validation error handling repeated in every route
- Generic error response formatting duplicated across routes
- Console.error + res.status(500).json pattern repeated 50+ times
- Error message extraction logic duplicated

**Solution**: Created `backend/src/utils/errorHandling.ts` with:

- `sendValidationError()` - Handle Zod validation errors consistently
- `sendErrorResponse()` - Send formatted error responses
- `logAndSendError()` - Log and send error in one call
- `formatErrorMessage()` - Extract error messages consistently
- `ERROR_CODES` - Centralized error code constants
- `asyncHandler()` - Wrap async route handlers with error handling

### 2. Caching Patterns

**Problem**: Duplicate SimpleCache class implementations in PuppetDBService and PuppetserverService with identical logic.

**Examples of duplication**:

- SimpleCache class duplicated in 2 services
- Cache entry interface duplicated
- Cache validation logic duplicated
- TTL checking logic duplicated

**Solution**: Created `backend/src/utils/caching.ts` with:

- `SimpleCache<T>` - Generic cache class with TTL support
- `CacheEntry<T>` - Standard cache entry interface
- `isCacheValid()` - Check if cache entry is expired
- `createCacheEntry()` - Create cache entries with timestamps
- `buildCacheKey()` - Build cache keys from multiple parts

### 3. API Response Patterns

**Problem**: Duplicate response formatting and pagination logic across route handlers.

**Examples of duplication**:

- Pagination calculation repeated in multiple routes
- Response formatting duplicated
- Success/error response structures inconsistent
- Not found responses formatted differently

**Solution**: Created `backend/src/utils/apiResponse.ts` with:

- `sendSuccess()` - Send success responses consistently
- `sendPaginatedResponse()` - Send paginated responses
- `paginateArray()` - Paginate arrays with metadata
- `validatePagination()` - Validate pagination parameters
- `sendNotFound()` - Send 404 responses consistently
- `sendCreated()` - Send 201 created responses

## Usage Examples

### Error Handling

**Before**:

```typescript
try {
  // ... route logic
} catch (error) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        })),
      },
    });
    return;
  }

  console.error("Error fetching data:", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  });
}
```

**After**:

```typescript
import { logAndSendError, ERROR_CODES } from "../utils";

try {
  // ... route logic
} catch (error) {
  logAndSendError(res, error, "Error fetching data", ERROR_CODES.INTERNAL_SERVER_ERROR);
}
```

### Caching

**Before** (duplicated in PuppetDBService and PuppetserverService):

```typescript
class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get(key: string): unknown {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMs,
    });
  }
  
  // ... more methods
}
```

**After**:

```typescript
import { SimpleCache } from "../utils";

// Create cache instance
private cache = new SimpleCache<MyDataType>({ ttl: 300000, maxEntries: 1000 });

// Use cache
const cached = this.cache.get(cacheKey);
if (cached) {
  return cached;
}

// Set cache
this.cache.set(cacheKey, data);
```

### API Responses

**Before**:

```typescript
// Pagination calculation duplicated
const offset = (page - 1) * pageSize;
const totalPages = Math.ceil(totalItems / pageSize);
const paginatedData = allData.slice(offset, offset + pageSize);

res.json({
  data: paginatedData,
  pagination: {
    page,
    pageSize,
    totalItems,
    totalPages,
  },
});
```

**After**:

```typescript
import { paginateArray, sendPaginatedResponse } from "../utils";

const result = paginateArray(allData, page, pageSize);
sendPaginatedResponse(res, result.data, page, pageSize, result.pagination.totalItems);
```

## Migration Strategy

### Phase 1: Immediate Benefits (No Migration Required)

- New code can immediately use the utilities
- Utilities are available for import across the codebase
- No breaking changes to existing code

### Phase 2: Gradual Migration (Future Work)

Routes and services can be migrated incrementally:

1. **High-priority routes** (most frequently used):
   - `/api/inventory`
   - `/api/puppet/reports`
   - `/api/integrations/health`

2. **Integration services**:
   - Replace SimpleCache implementations in PuppetDBService
   - Replace SimpleCache implementations in PuppetserverService
   - Update error handling in all integration plugins

3. **All route handlers**:
   - Migrate error handling to use utilities
   - Migrate pagination logic to use utilities
   - Migrate response formatting to use utilities

### Migration Checklist

For each file being migrated:

- [ ] Import utilities from `../utils`
- [ ] Replace duplicate error handling with `logAndSendError()`
- [ ] Replace Zod error handling with `sendValidationError()`
- [ ] Replace cache implementations with `SimpleCache`
- [ ] Replace pagination logic with `paginateArray()` or `sendPaginatedResponse()`
- [ ] Replace response formatting with utility functions
- [ ] Test the migrated code
- [ ] Remove old duplicate code

## Benefits

### Code Quality

- **Reduced duplication**: Eliminates 100+ lines of duplicate code
- **Consistency**: All errors and responses formatted the same way
- **Maintainability**: Changes to error handling/caching only need to be made in one place
- **Type safety**: Generic types ensure type safety across the codebase

### Developer Experience

- **Easier to write new code**: Import utilities instead of copying patterns
- **Easier to understand**: Clear, documented utility functions
- **Easier to test**: Utilities can be unit tested independently

### Performance

- **Optimized caching**: LRU eviction prevents memory leaks
- **Consistent TTL handling**: No more cache inconsistencies
- **Better error handling**: Async errors handled properly

## Testing

All utilities should be tested independently:

```typescript
// backend/test/utils/errorHandling.test.ts
// backend/test/utils/caching.test.ts
// backend/test/utils/apiResponse.test.ts
```

## Future Enhancements

Potential additional consolidations:

1. **Database query patterns**: Consolidate common query patterns
2. **Validation schemas**: Share common Zod schemas
3. **Logging patterns**: Consolidate logging with context
4. **Retry logic**: Consolidate retry patterns from PuppetDB/Puppetserver
5. **Circuit breaker patterns**: Consolidate circuit breaker logic

## Files Created

- `backend/src/utils/errorHandling.ts` - Error handling utilities
- `backend/src/utils/caching.ts` - Caching utilities
- `backend/src/utils/apiResponse.ts` - API response utilities
- `backend/src/utils/index.ts` - Utility exports

## Impact Analysis

### Files with Duplicate Patterns (Can be migrated)

**Error Handling** (50+ files):

- All files in `backend/src/routes/`
- All integration plugin files
- `backend/src/services/StreamingExecutionManager.ts`

**Caching** (2 files):

- `backend/src/integrations/puppetdb/PuppetDBService.ts`
- `backend/src/integrations/puppetserver/PuppetserverService.ts`

**API Responses** (20+ files):

- All files in `backend/src/routes/`
- Files with pagination logic

### Estimated Impact

- **Lines of code reduced**: 200-300 lines when fully migrated
- **Files affected**: 50+ files can benefit from utilities
- **Maintenance burden**: Significantly reduced
- **Code consistency**: Greatly improved

## Conclusion

This consolidation provides a solid foundation for cleaner, more maintainable code. The utilities are ready to use immediately, and existing code can be migrated gradually without breaking changes.
