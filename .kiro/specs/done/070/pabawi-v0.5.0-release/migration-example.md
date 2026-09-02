# Migration Example: Using Consolidated Utilities

This document provides a concrete example of migrating existing code to use the new consolidated utilities.

## Example: Migrating a Route Handler

### Before Migration

```typescript
// backend/src/routes/example.ts
import { Router, Request, Response } from "express";
import { z } from "zod";

const router = Router();

// Duplicate cache implementation
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

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

  clear(): void {
    this.cache.clear();
  }
}

const cache = new SimpleCache();
const CACHE_TTL = 300000; // 5 minutes

// Request schema
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  filter: z.string().optional(),
});

// GET /api/example/items
router.get("/items", async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const query = querySchema.parse(req.query);

    // Check cache
    const cacheKey = `items:${query.page}:${query.pageSize}:${query.filter ?? "all"}`;
    const cached = cache.get(cacheKey);
    if (Array.isArray(cached)) {
      console.log("Returning cached items");
      
      // Duplicate pagination logic
      const totalItems = cached.length;
      const totalPages = Math.ceil(totalItems / query.pageSize);
      const offset = (query.page - 1) * query.pageSize;
      const paginatedData = cached.slice(offset, offset + query.pageSize);

      res.json({
        data: paginatedData,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages,
        },
      });
      return;
    }

    // Fetch data (simulated)
    const allItems = await fetchItems(query.filter);

    // Cache the result
    cache.set(cacheKey, allItems, CACHE_TTL);

    // Duplicate pagination logic again
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;
    const paginatedData = allItems.slice(offset, offset + query.pageSize);

    res.json({
      data: paginatedData,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
    });
  } catch (error) {
    // Duplicate error handling
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

    console.error("Error fetching items:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

// Simulated data fetch
async function fetchItems(filter?: string): Promise<string[]> {
  // Simulate API call
  return ["item1", "item2", "item3"];
}

export default router;
```

### After Migration

```typescript
// backend/src/routes/example.ts
import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  SimpleCache,
  buildCacheKey,
  paginateArray,
  sendPaginatedResponse,
  logAndSendError,
  ERROR_CODES,
} from "../utils";

const router = Router();

// Use consolidated cache
const cache = new SimpleCache<string[]>({
  ttl: 300000, // 5 minutes
  maxEntries: 1000,
});

// Request schema
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  filter: z.string().optional(),
});

// GET /api/example/items
router.get("/items", async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const query = querySchema.parse(req.query);

    // Check cache using utility
    const cacheKey = buildCacheKey("items", query.page, query.pageSize, query.filter ?? "all");
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log("Returning cached items");
      
      // Use pagination utility
      const result = paginateArray(cached, query.page, query.pageSize);
      sendPaginatedResponse(
        res,
        result.data,
        query.page,
        query.pageSize,
        result.pagination.totalItems
      );
      return;
    }

    // Fetch data (simulated)
    const allItems = await fetchItems(query.filter);

    // Cache the result
    cache.set(cacheKey, allItems);

    // Use pagination utility
    const result = paginateArray(allItems, query.page, query.pageSize);
    sendPaginatedResponse(
      res,
      result.data,
      query.page,
      query.pageSize,
      result.pagination.totalItems
    );
  } catch (error) {
    // Use consolidated error handling
    logAndSendError(res, error, "Error fetching items", ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
});

// Simulated data fetch
async function fetchItems(filter?: string): Promise<string[]> {
  // Simulate API call
  return ["item1", "item2", "item3"];
}

export default router;
```

## Benefits of Migration

### Lines of Code Reduction

- **Before**: ~120 lines
- **After**: ~60 lines
- **Reduction**: 50% fewer lines

### Improvements

1. **No duplicate cache implementation** - Uses shared `SimpleCache`
2. **No duplicate pagination logic** - Uses `paginateArray()` and `sendPaginatedResponse()`
3. **No duplicate error handling** - Uses `logAndSendError()`
4. **Better type safety** - Generic cache with type parameter
5. **Consistent formatting** - All responses formatted the same way
6. **Easier to maintain** - Changes to utilities affect all routes

### Testing Benefits

- Utilities are tested independently
- Route tests can focus on business logic
- Mock utilities for isolated testing

## Step-by-Step Migration Guide

### 1. Import Utilities

```typescript
import {
  SimpleCache,
  buildCacheKey,
  paginateArray,
  sendPaginatedResponse,
  logAndSendError,
  ERROR_CODES,
} from "../utils";
```

### 2. Replace Cache Implementation

```typescript
// Before
class SimpleCache { /* ... */ }
const cache = new SimpleCache();

// After
const cache = new SimpleCache<YourDataType>({
  ttl: 300000,
  maxEntries: 1000,
});
```

### 3. Replace Pagination Logic

```typescript
// Before
const offset = (page - 1) * pageSize;
const totalPages = Math.ceil(totalItems / pageSize);
const paginatedData = allData.slice(offset, offset + pageSize);
res.json({
  data: paginatedData,
  pagination: { page, pageSize, totalItems, totalPages },
});

// After
const result = paginateArray(allData, page, pageSize);
sendPaginatedResponse(res, result.data, page, pageSize, result.pagination.totalItems);
```

### 4. Replace Error Handling

```typescript
// Before
catch (error) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ /* ... */ });
    return;
  }
  console.error("Error:", error);
  res.status(500).json({ /* ... */ });
}

// After
catch (error) {
  logAndSendError(res, error, "Error context", ERROR_CODES.INTERNAL_SERVER_ERROR);
}
```

### 5. Test the Migration

```bash
npm test -- --run --silent
```

## Common Patterns

### Pattern 1: Cache + Pagination

```typescript
const cacheKey = buildCacheKey("resource", id, page, pageSize);
const cached = cache.get(cacheKey);

if (cached) {
  const result = paginateArray(cached, page, pageSize);
  return sendPaginatedResponse(res, result.data, page, pageSize, result.pagination.totalItems);
}

const data = await fetchData();
cache.set(cacheKey, data);

const result = paginateArray(data, page, pageSize);
sendPaginatedResponse(res, result.data, page, pageSize, result.pagination.totalItems);
```

### Pattern 2: Error Handling with Custom Codes

```typescript
try {
  // ... route logic
} catch (error) {
  if (error instanceof CustomError) {
    logAndSendError(res, error, "Custom error context", ERROR_CODES.CUSTOM_ERROR, 400);
  } else {
    logAndSendError(res, error, "Generic error context");
  }
}
```

### Pattern 3: Success Responses

```typescript
import { sendSuccess, sendCreated, sendNotFound } from "../utils";

// Success
sendSuccess(res, { data: result });

// Created
sendCreated(res, newResource, "Resource created successfully");

// Not found
sendNotFound(res, "Resource", resourceId);
```

## Conclusion

The migration to consolidated utilities:

- Reduces code duplication by 50%
- Improves consistency across the codebase
- Makes maintenance easier
- Provides better type safety
- Enables independent testing of utilities

Start with high-traffic routes and gradually migrate the rest of the codebase.
