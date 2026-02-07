# Helper Services

Optional helper services for the Generic Execution Framework. Plugins can opt-in to use these services for common patterns like caching, logging, and error handling.

## Overview

These helper services provide reusable infrastructure that plugins can leverage:

- **InventoryCache**: In-memory caching for inventory data with TTL and auto-refresh
- **FactsCache**: Per-node fact caching with configurable TTL and LRU eviction
- **ExecutionLogger**: Structured logging with execution history and metrics
- **ErrorHandler**: Error categorization, retry logic, and structured error responses

## Services

### InventoryCache

Provides in-memory caching for inventory data with automatic expiration and optional refresh.

**Features:**

- Configurable TTL (default: 5 minutes)
- Automatic expiration checking
- Cache invalidation
- Optional auto-refresh on expiry
- Group-based node organization
- Cache statistics and monitoring

**Usage:**

```typescript
import { InventoryCache } from './services/helpers/index.js';

// Create cache with auto-refresh
const cache = new InventoryCache({
  ttl: 300000, // 5 minutes
  autoRefresh: true,
  refreshCallback: async () => {
    // Fetch fresh inventory data
    return await fetchInventoryFromSource();
  },
  debug: true
});

// Get nodes (returns cached data if valid)
const nodes = await cache.getNodes();

// Force refresh
const freshNodes = await cache.getNodes({ refresh: true });

// Get nodes by group
const webServers = await cache.getNodesByGroup('web-servers');

// Invalidate cache
cache.invalidate();

// Get statistics
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate * 100}%`);
```

### FactsCache

Provides per-node fact caching with LRU eviction and configurable TTL.

**Features:**

- Configurable TTL (default: 10 minutes)
- Per-node caching
- Force refresh support
- LRU eviction when max entries exceeded
- Automatic expiration
- Cache statistics

**Usage:**

```typescript
import { FactsCache } from './services/helpers/index.js';

// Create cache
const cache = new FactsCache({
  ttl: 600000, // 10 minutes
  maxEntries: 1000,
  debug: true
});

// Get facts (returns cached if valid)
const facts = cache.get('node-123');

// Force refresh (bypasses cache)
const freshFacts = cache.get('node-123', { refresh: true });

// Set facts
cache.set('node-123', {
  os: 'Ubuntu 22.04',
  memory: '16GB',
  cpu: 'Intel Xeon'
});

// Delete specific node
cache.delete('node-123');

// Clear all
cache.clear();

// Evict expired entries
const evicted = cache.evictExpired();

// Get statistics
const stats = cache.getStats();
console.log(`Cache size: ${stats.size}, Hit rate: ${stats.hitRate * 100}%`);
```

### ExecutionLogger

Provides structured logging for executions with history storage and metrics.

**Features:**

- Structured execution logging
- Integration with LoggerService
- Execution history storage via ExecutionRepository
- Performance metrics collection
- Query interface for history
- Debug mode support

**Usage:**

```typescript
import { ExecutionLogger } from './services/helpers/index.js';
import { DatabaseService } from '../database/DatabaseService.js';

// Create logger
const db = DatabaseService.getInstance().getDatabase();
const logger = new ExecutionLogger(db, { debug: true });

// Log execution start
const executionId = await logger.logExecutionStart({
  type: 'command',
  user: 'admin',
  targets: ['node-1', 'node-2'],
  action: 'uptime',
  parameters: { timeout: 30000 },
  startedAt: new Date().toISOString()
});

// Log execution completion
await logger.logExecutionComplete(executionId, {
  status: 'success',
  completedAt: new Date().toISOString(),
  results: [
    { nodeId: 'node-1', status: 'success', output: { stdout: 'up 5 days' }, duration: 1200 },
    { nodeId: 'node-2', status: 'success', output: { stdout: 'up 3 days' }, duration: 1100 }
  ]
});

// Log execution error
await logger.logExecutionError(executionId, new Error('Connection timeout'));

// Query execution history
const history = await logger.getExecutionHistory({
  timeRange: { start: '2024-01-01', end: '2024-12-31' },
  user: 'admin',
  status: 'success',
  limit: 50
});

// Get metrics
const metrics = await logger.getExecutionMetrics({
  start: '2024-01-01',
  end: '2024-12-31'
});
console.log(`Success rate: ${metrics.successRate * 100}%`);
console.log(`Average duration: ${metrics.averageDuration}ms`);
```

### ErrorHandler

Provides error categorization, retry logic, and structured error responses.

**Features:**

- Error categorization (Validation, Authorization, Timeout, Connection, etc.)
- Structured error responses with context
- Retry logic with linear and exponential backoff
- Retryability determination
- Error logging integration
- Execute with retry wrapper

**Usage:**

```typescript
import { ErrorHandler, ErrorCategory } from './services/helpers/index.js';

// Create error handler
const errorHandler = new ErrorHandler({
  maxRetries: 3,
  baseDelay: 1000,
  strategy: 'exponential',
  retryableCategories: [
    ErrorCategory.CONNECTION,
    ErrorCategory.TIMEOUT,
    ErrorCategory.QUEUE_FULL
  ]
}, { debug: true });

// Handle an error
try {
  throw new Error('Connection refused');
} catch (error) {
  const structuredError = errorHandler.handleError(error as Error, {
    executionId: 'exec-123',
    nodeId: 'node-1',
    plugin: 'bolt'
  });
  
  console.log(`Error category: ${structuredError.category}`);
  console.log(`Retryable: ${structuredError.retryable}`);
}

// Execute with retry
const result = await errorHandler.executeWithRetry(
  async () => {
    // Your operation that might fail
    return await fetchDataFromRemoteNode();
  },
  {
    executionId: 'exec-123',
    nodeId: 'node-1'
  }
);

// Create custom error
const error = errorHandler.createError(
  ErrorCategory.VALIDATION,
  'Invalid node ID format',
  { nodeId: 'invalid-id' },
  { expectedFormat: 'alphanumeric' }
);

// Get retry delay
const delay = errorHandler.getRetryDelay(2, 'exponential'); // 2000ms for attempt 2
```

## Error Categories

The ErrorHandler supports the following error categories:

- **ValidationError**: Invalid input parameters or configuration
- **AuthorizationError**: RBAC permission denied
- **TimeoutError**: Execution exceeded timeout
- **ConnectionError**: Unable to reach target node
- **ExecutionError**: Command/task execution failed
- **PluginError**: Plugin-specific error
- **QueueFullError**: ExecutionQueue at capacity
- **CircuitBreakerError**: Circuit breaker open
- **UnknownError**: Uncategorized error

## Integration Example

Here's how a plugin might use all helper services together:

```typescript
import {
  InventoryCache,
  FactsCache,
  ExecutionLogger,
  ErrorHandler,
  ErrorCategory
} from './services/helpers/index.js';

class MyPlugin extends BasePlugin {
  private inventoryCache: InventoryCache;
  private factsCache: FactsCache;
  private executionLogger: ExecutionLogger;
  private errorHandler: ErrorHandler;

  async initialize() {
    // Initialize helper services
    this.inventoryCache = new InventoryCache({
      ttl: 300000,
      autoRefresh: true,
      refreshCallback: () => this.fetchInventory()
    });

    this.factsCache = new FactsCache({
      ttl: 600000,
      maxEntries: 1000
    });

    const db = DatabaseService.getInstance().getDatabase();
    this.executionLogger = new ExecutionLogger(db);

    this.errorHandler = new ErrorHandler({
      maxRetries: 3,
      strategy: 'exponential'
    });
  }

  async executeCommand(command: string, targets: string[]) {
    // Log execution start
    const executionId = await this.executionLogger.logExecutionStart({
      type: 'command',
      user: 'system',
      targets,
      action: command,
      startedAt: new Date().toISOString()
    });

    try {
      // Execute with retry
      const results = await this.errorHandler.executeWithRetry(
        async () => {
          return await this.runCommand(command, targets);
        },
        { executionId, plugin: this.name }
      );

      // Log completion
      await this.executionLogger.logExecutionComplete(executionId, {
        status: 'success',
        completedAt: new Date().toISOString(),
        results
      });

      return results;
    } catch (error) {
      // Log error
      await this.executionLogger.logExecutionError(executionId, error as Error);
      throw error;
    }
  }

  async getNodeFacts(nodeId: string, refresh = false) {
    // Try cache first
    let facts = this.factsCache.get(nodeId, { refresh });
    
    if (!facts) {
      // Fetch from source
      facts = await this.fetchFactsFromSource(nodeId);
      
      // Cache for next time
      this.factsCache.set(nodeId, facts);
    }
    
    return facts;
  }

  async listNodes() {
    // Try cache first
    let nodes = await this.inventoryCache.getNodes();
    
    if (!nodes) {
      // Fetch from source
      nodes = await this.fetchInventory();
      
      // Cache for next time
      this.inventoryCache.set(nodes);
    }
    
    return nodes;
  }
}
```

## Requirements Validation

These helper services satisfy the following requirements from the Generic Execution Framework specification:

- **InventoryCache**: Requirements 3.5, 3.6 (inventory caching and refresh)
- **FactsCache**: Requirements 4.2, 4.3, 4.4 (fact caching and expiration)
- **ExecutionLogger**: Requirements 5.1, 5.2, 5.3, 5.6, 5.7 (structured logging and metrics)
- **ErrorHandler**: Requirements 1.8, 7.3, 7.4, 7.5, 7.6 (error handling and retry logic)

## Testing

Each helper service should be tested with both unit tests and property-based tests:

- Unit tests for specific behaviors and edge cases
- Property-based tests for universal properties (caching behavior, retry logic, etc.)

See the test files in `tests/unit/services/` and `tests/property/services/` for examples.
