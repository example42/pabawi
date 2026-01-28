# Pabawi Backend - Refactoring Opportunities

**Generated:** January 28, 2026  
**Purpose:** Identify consolidation opportunities and unused code to reduce complexity and improve maintainability

---

## 1. Code Consolidation Opportunities

### 🔴 High Priority - Significant Duplication

#### 1.1 SimpleCache Class Duplication

**Issue:** Identical `SimpleCache` class implemented in multiple files  
**Locations:**

- `integrations/puppetdb/PuppetDBService.ts` (lines ~80-120)
- `integrations/puppetserver/PuppetserverService.ts` (lines ~40-80)

**Current Code:**

```typescript
class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  get(key: string): unknown { /* ... */ }
  set(key: string, value: unknown, ttlMs: number): void { /* ... */ }
  clear(): void { /* ... */ }
  clearExpired(): void { /* ... */ }
}
```

**Recommendation:**

- Move to `utils/caching.ts` as exported class
- Replace both usages with import from utils
- **Estimated Savings:** ~100 lines of duplicated code

---

#### 1.2 HTTP Client Duplication

**Issue:** Similar HTTP client logic in PuppetDB and Puppetserver  
**Locations:**

- `integrations/puppetdb/PuppetDBClient.ts` (451 lines)
- `integrations/puppetserver/PuppetserverClient.ts` (1,685 lines)

**Common Patterns:**

- SSL certificate handling
- Request timeout management
- Response parsing
- Error handling
- Authentication headers

**Recommendation:**

- Create `BaseHttpClient` class in `integrations/BaseHttpClient.ts`
- Extract common functionality: SSL, timeout, error handling, response parsing
- Extend for PuppetDB/Puppetserver-specific features
- **Estimated Savings:** ~400-600 lines of duplicated logic

---

#### 1.3 Retry Logic Limited to PuppetDB

**Issue:** Retry logic only in PuppetDB, but Puppetserver could benefit  
**Locations:**

- `integrations/puppetdb/RetryLogic.ts` (278 lines) - Only used by PuppetDB
- Puppetserver has no retry mechanism

**Recommendation:**

- Move `RetryLogic.ts` to `utils/retryLogic.ts`
- Make it generic for any integration
- Apply to Puppetserver and HieraPlugin (Forge API calls)
- **Estimated Savings:** More robust error handling, ~0 lines saved but better code reuse

---

#### 1.4 Circuit Breaker Limited to PuppetDB

**Issue:** Circuit breaker pattern only in PuppetDB  
**Locations:**

- `integrations/puppetdb/CircuitBreaker.ts` (379 lines) - Only used by PuppetDB

**Recommendation:**

- Move to `utils/circuitBreaker.ts`
- Apply to Puppetserver API calls
- Apply to Hiera Forge API calls
- **Estimated Savings:** Better resilience across integrations

---

### 🟡 Medium Priority - Moderate Duplication

#### 1.5 LoggerService Instantiation Pattern

**Issue:** LoggerService created multiple times instead of shared instance  
**Pattern:**

```typescript
// Found in almost every file
private logger: LoggerService;
constructor() {
  this.logger = new LoggerService();
}
```

**Locations:** ~50+ files create their own LoggerService instance

**Recommendation:**

- Create singleton LoggerService or use dependency injection container
- Pass shared instance through constructors (already started in some plugins)
- **Estimated Savings:** Reduced memory usage, more consistent logging

---

#### 1.6 Error Code Mapping Duplication

**Issue:** Similar error type to HTTP status mapping in multiple places  
**Locations:**

- `middleware/errorHandler.ts` - `getStatusCode()` function
- `errors/ErrorHandlingService.ts` - `extractErrorCode()` method
- Individual route handlers have ad-hoc error mapping

**Recommendation:**

- Consolidate into single error mapping registry
- Use decorator pattern or error metadata
- **Estimated Savings:** ~150 lines of duplicated switch statements

---

#### 1.7 Cache Entry Type Duplication

**Issue:** `CacheEntry<T>` interface duplicated across files  
**Locations:**

- `bolt/BoltService.ts`
- `integrations/puppetdb/PuppetDBService.ts`
- `integrations/puppetserver/PuppetserverService.ts`

**Recommendation:**

- Define once in `utils/caching.ts`
- Export and reuse
- **Estimated Savings:** ~30 lines

---

#### 1.8 Request Validation Pattern Duplication

**Issue:** Similar Zod validation patterns in every route file  
**Pattern:**

```typescript
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});
// Duplicated across 8+ route files
```

**Recommendation:**

- Create `validation/commonSchemas.ts` with reusable schemas
- Export: NodeIdSchema, PaginationSchema, FilterSchema, etc.
- **Estimated Savings:** ~200 lines of duplicated validation schemas

---

#### 1.9 API Response Formatting Inconsistency

**Issue:** `utils/apiResponse.ts` exists but not used consistently  
**Observation:**

- Some routes use `apiResponse.successResponse()`
- Others manually construct `{ data: ..., metadata: ... }`
- Inconsistent pagination response format

**Recommendation:**

- Enforce usage of `apiResponse.ts` helpers in all routes
- Add ESLint rule or code review checklist
- **Estimated Savings:** More consistent API, ~0 lines saved but better maintainability

---

#### 1.10 Streaming Callback Pattern Duplication

**Issue:** Similar streaming callback setup in multiple routes  
**Locations:**

- `routes/commands.ts`
- `routes/tasks.ts`
- `routes/packages.ts`
- `routes/facts.ts`

**Pattern:**

```typescript
const streamingCallback = expertMode && streamingManager
  ? {
      onCommand: (cmd: string): void => { /* ... */ },
      onStdout: (chunk: string): void => { /* ... */ },
      onStderr: (chunk: string): void => { /* ... */ },
    }
  : undefined;
```

**Recommendation:**

- Create factory function in `services/StreamingExecutionManager.ts`:

  ```typescript
  createStreamingCallback(executionId: string, expertMode: boolean)
  ```

- **Estimated Savings:** ~100 lines across routes

---

### 🟢 Low Priority - Minor Improvements

#### 1.11 Node Transformation Logic

**Issue:** Similar node transformation logic in multiple integrations  
**Locations:**

- `bolt/BoltService.ts` - `transformInventoryToNodes()`
- `integrations/puppetdb/PuppetDBService.ts` - Node transformation
- `integrations/puppetserver/PuppetserverService.ts` - Node transformation

**Recommendation:**

- Create `utils/nodeTransformers.ts` with common transformation utilities
- **Estimated Savings:** ~50 lines

---

#### 1.12 Health Check Response Format

**Issue:** Similar health check structure across all plugins  
**Pattern:**

```typescript
return {
  healthy: boolean,
  message: string,
  lastCheck: string,
  details?: object
};
```

**Recommendation:**

- Already using `HealthStatus` interface from `integrations/types.ts`
- Ensure all plugins use it consistently (already done well)
- **No action needed** - Good pattern already established

---

## 2. Unused or Potentially Dead Code

### 🔴 High Confidence - Likely Unused

#### 2.1 Index Files with Limited Exports

**Files:**

- `bolt/index.ts` (23 lines) - Only exports types, not used by most imports
- `config/index.ts` (7 lines) - Most files import directly from ConfigService
- `database/index.ts` (11 lines) - Similar, direct imports preferred
- `errors/index.ts` (6 lines) - Direct imports more common
- `middleware/index.ts` (7 lines) - Direct imports in server.ts
- `validation/index.ts` (5 lines) - Not used, direct imports only

**Recommendation:**

- Review import patterns across codebase
- Remove unused index files or enforce their usage
- **Estimated Savings:** ~60 lines, but minimal impact

---

#### 2.2 Potentially Unused Integration Routes

**Files:**

- `routes/integrations/colors.ts` (121 lines) - Integration color mapping
- `routes/integrations/utils.ts` (225 lines) - Helper functions
- `routes/integrations/status.ts` (291 lines) - Health status endpoints

**Investigation Needed:**

- Check if frontend actually uses these endpoints
- If not used, consider removing or documenting as API-only features

---

#### 2.3 Deprecated Methods (Need Verification)

**BoltService Methods (Potential):**

- `listPlans()` - Plans not mentioned in routes, only tasks used
- `getBoltProjectPath()` - Only used in constructor, could be private

**IntegrationManager Methods (Potential):**

- `getExecutionTool()` / `getInformationSource()` - Routes use `executeAction()` and aggregated methods instead
- May be for future extensibility

**Recommendation:**

- Add deprecation warnings if confirmed unused
- Document if kept for API compatibility

---

### 🟡 Medium Confidence - Investigate

#### 2.4 Expert Mode Features Partially Implemented

**Issue:** Some expert mode features exist but may not be fully utilized  
**Examples:**

- `services/ExpertModeService.ts` has `collectPerformanceMetrics()` but not all routes use it
- `ApiLogger.ts` (498 lines) for API call logging - unclear if actively used

**Recommendation:**

- Audit expert mode feature usage across routes
- Either fully implement or remove partial features
- Document which routes support expert mode fully vs. partially

---

#### 2.5 Unused Type Definitions

**Pattern:** Type definitions that may not be used  
**Locations:**

- `bolt/types.ts` - All types used? (Need import analysis)
- `integrations/puppetdb/types.ts` - Complex types, all used?
- `integrations/hiera/types.ts` - Many types, full coverage?

**Recommendation:**

- Run unused export detection tool (e.g., `ts-prune`)
- Remove unused types
- **Estimated Savings:** Potentially 50-100 lines of type definitions

---

#### 2.6 Duplicate Catalog/Report/Event Handling

**Issue:** Similar catalog/report/event handling in both PuppetDB and Puppetserver  
**Observation:**

- Both services have catalog retrieval methods
- Report handling duplicated
- Event processing similar

**Recommendation:**

- Investigate if both are actually needed
- Consider making one the primary source, other as fallback
- Or clearly document when to use which integration

---

### 🟢 Low Confidence - Further Analysis Required

#### 2.7 Middleware Files

**Files:**

- `middleware/deduplication.ts` (235 lines) - Is this enabled? Check server.ts mounting
- `middleware/expertMode.ts` (51 lines) - Mounted but functionality may be duplicated in routes

**Recommendation:**

- Verify all middleware is actually mounted in `server.ts`
- Document purpose and configuration of each middleware

---

#### 2.8 Utility Functions

**File:** `utils/errorHandling.ts` (168 lines)  
**Issue:** Similar functionality to `errors/ErrorHandlingService.ts`

**Recommendation:**

- Consolidate error handling utilities
- Choose one location for error utilities
- **Estimated Savings:** ~100 lines if consolidated

---

## 3. Architecture Simplification Opportunities

### 3.1 Flatten Integration Directory Structure

**Current:**

```
integrations/
  bolt/
    BoltPlugin.ts
    index.ts (5 lines, just exports)
  puppetdb/
    PuppetDBService.ts
    PuppetDBClient.ts
    CircuitBreaker.ts
    RetryLogic.ts
    types.ts
    index.ts (50 lines)
  puppetserver/
    PuppetserverService.ts
    PuppetserverClient.ts
    types.ts
    errors.ts
    index.ts (10 lines)
  hiera/
    HieraPlugin.ts
    HieraService.ts
    HieraParser.ts
    HieraResolver.ts
    HieraScanner.ts
    CodeAnalyzer.ts
    ... 9 files total
    index.ts (60 lines)
```

**Recommendation:**

- Remove index.ts files, use direct imports
- Move shared utilities (CircuitBreaker, RetryLogic) to `utils/`
- **Estimated Savings:** ~125 lines of index files

---

### 3.2 Route File Size Reduction

**Issue:** Several route files exceed 1,000 lines  
**Files:**

- `routes/executions.ts` (1,548 lines)
- `routes/hiera.ts` (2,274 lines)
- `routes/integrations/puppetdb.ts` (3,616 lines)
- `routes/integrations/puppetserver.ts` (3,543 lines)
- `routes/inventory.ts` (1,068 lines)

**Recommendation:**

- Split large route files into logical sub-routers:
  - `routes/executions/` → history.ts, reexecution.ts, status.ts
  - `routes/hiera/` → lookup.ts, keys.ts, analyze.ts
  - `routes/integrations/puppetdb/` → facts.ts, reports.ts, events.ts, catalogs.ts
- **Estimated Savings:** Better maintainability, same LOC but better organized

---

### 3.3 Service Responsibilities

**Issue:** Some services have grown to handle multiple concerns

**HieraService (1,164 lines):**

- Key resolution
- Variable interpolation
- Data file loading
- Scope management

**Recommendation:**

- Already well-separated with HieraResolver, HieraParser, etc.
- Consider extracting "ScopeBuilder" if scope logic grows

**PuppetDBService (3,063 lines):**

- Inventory management
- Facts retrieval
- Report querying
- Catalog management
- Event tracking
- PQL parsing

**Recommendation:**

- Extract PQL parser to separate `PuppetDBQueryParser` class
- Consider splitting into `PuppetDBInventoryService`, `PuppetDBReportService`
- **Estimated Savings:** Better separation of concerns

---

## 4. Performance Optimization Opportunities

### 4.1 Caching Strategy Inconsistency

**Issue:** Different TTLs and cache implementations across services  
**Observation:**

- BoltService: 30s inventory, 5min facts
- PuppetDB: 5min default
- Puppetserver: 5min default
- No cache invalidation coordination

**Recommendation:**

- Create `CacheManager` service to coordinate TTLs
- Implement cache invalidation events (e.g., when node changes detected)
- Add cache statistics endpoint
- **Benefit:** More consistent and efficient caching

---

### 4.2 Parallel Data Fetching

**Issue:** Sequential API calls in some routes  
**Locations:**

- Some routes fetch from multiple sources sequentially
- Could parallelize IntegrationManager queries

**Recommendation:**

- Already using `Promise.all()` in IntegrationManager
- Audit routes for sequential fetching that could be parallel
- **Benefit:** Reduced response times

---

## 5. Technical Debt

### 5.1 TypeScript Strict Mode

**Issue:** Some files may not use strict null checks  
**Recommendation:**

- Enable `strictNullChecks` in tsconfig if not already
- Fix any resulting type errors
- **Benefit:** Better type safety

---

### 5.2 Error Handling Coverage

**Issue:** Some async functions may not have proper error handling  
**Pattern:**

```typescript
void (async (): Promise<void> => {
  // No error handling
})();
```

**Recommendation:**

- Add try-catch blocks to all void async calls
- Log errors appropriately
- **Benefit:** Fewer unhandled promise rejections

---

### 5.3 Test Coverage Gaps

**Issue:** Large files may have insufficient test coverage  
**Files needing more tests:**

- `routes/hiera.ts` (2,274 lines)
- `integrations/puppetdb/PuppetDBService.ts` (3,063 lines)
- Complex business logic in route handlers

**Recommendation:**

- Add integration tests for large route files
- Mock external dependencies (Bolt CLI, APIs)
- Aim for >80% coverage on critical paths

---

## 6. Summary & Action Plan

### Quick Wins (Highest ROI)

1. ✅ **Consolidate SimpleCache class** → `utils/caching.ts` (~100 LOC saved)
2. ✅ **Extract common validation schemas** → `validation/commonSchemas.ts` (~200 LOC saved)
3. ✅ **Create streaming callback factory** → Reduces duplication (~100 LOC saved)
4. ✅ **Remove unused index.ts files** → Better import clarity (~60 LOC saved)
5. ✅ **Move RetryLogic/CircuitBreaker to utils** → Enable reuse across integrations

### Medium-Term Improvements

1. 🔨 **Create BaseHttpClient** for API integrations (~400-600 LOC saved)
2. 🔨 **Split large route files** into sub-routers (better organization)
3. 🔨 **Consolidate error handling utilities** (~100 LOC saved)
4. 🔨 **Audit and remove unused types** (50-100 LOC saved)

### Long-Term Refactoring

1. 📅 **Implement LoggerService singleton** pattern
2. 📅 **Create CacheManager** service for coordinated caching
3. 📅 **Split PuppetDBService** into smaller focused services
4. 📅 **Add comprehensive test coverage** for large files

### Total Estimated Savings

- **Immediate Consolidation:** ~460-560 lines
- **Medium-Term Refactoring:** ~700-1,000 lines
- **Long-Term:** Better maintainability, reduced cognitive load

### Current Codebase Metrics

- **Total LOC:** 44,465
- **After Refactoring:** ~43,000-43,300 (3-4% reduction)
- **But more importantly:** 20-30% reduction in cognitive complexity

---

## Appendix: Analysis Methodology

### Tools to Use for Verification

1. **ts-prune** - Find unused exports
2. **ESLint** - Enforce consistent patterns
3. **SonarQube** - Detect code duplication
4. **madge** - Visualize import dependencies
5. **webpack-bundle-analyzer** - Find unnecessary imports

### Manual Review Checklist

- [ ] Search for duplicate class definitions
- [ ] Search for duplicate function implementations
- [ ] Check all index.ts files for actual usage
- [ ] Verify all middleware is mounted
- [ ] Check if all route endpoints are called by frontend
- [ ] Review error handling coverage
- [ ] Audit cache usage patterns
- [ ] Check for unused type definitions
