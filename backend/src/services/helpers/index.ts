/**
 * Helper Services Index
 *
 * Exports all optional helper services that plugins can opt-in to use
 * for common patterns in the Generic Execution Framework.
 */

export { InventoryCache, type Node, type InventoryCacheConfig, type InventoryCacheStats } from '../InventoryCache.js';
export { FactsCache, type Facts, type FactsCacheConfig, type CacheStats } from '../FactsCache.js';
export { ExecutionLogger, type ExecutionLog, type ExecutionMetrics, type ExecutionHistoryQuery } from '../ExecutionLogger.js';
export { ErrorHandler, ErrorCategory, type StructuredError, type ErrorContext, type RetryConfig, type BackoffStrategy } from '../ErrorHandler.js';
