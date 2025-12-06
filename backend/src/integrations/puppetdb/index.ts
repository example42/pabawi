/**
 * PuppetDB Integration
 *
 * Exports all PuppetDB integration components.
 */

export { PuppetDBClient, createPuppetDBClient } from "./PuppetDBClient";
export {
  PuppetDBError,
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
} from "./PuppetDBClient";

export { PuppetDBService } from "./PuppetDBService";

export {
  CircuitBreaker,
  createPuppetDBCircuitBreaker,
  CircuitBreakerOpenError,
} from "./CircuitBreaker";
export type {
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
} from "./CircuitBreaker";

export {
  withRetry,
  createRetryWrapper,
  calculateBackoffDelay,
  isRetryableError,
  createPuppetDBRetryConfig,
  createPuppetserverRetryConfig,
  createIntegrationRetryConfig,
} from "./RetryLogic";
export type { RetryConfig } from "./RetryLogic";

export type {
  Report,
  ReportMetrics,
  ResourceEvent,
  LogEntry,
  Catalog,
  Resource,
  Edge,
  ResourceRef,
  Event,
  EventFilters,
} from "./types";
