/**
 * Database Module Barrel Export
 *
 * Part of v1.0.0 Modular Plugin Architecture (Step 1.5)
 *
 * Exports all database-related interfaces, adapters, and services.
 */

// Core interfaces
export type {
  DatabaseAdapter,
  DatabaseConfig,
  DatabaseDialect,
  DatabaseHealthCheckResult,
  ExecuteResult,
  Migration,
  DatabaseAdapterFactory,
  DatabaseAdapterConstructor,
} from "./interfaces/DatabaseInterface.js";

// Adapters
export { SQLiteAdapter } from "./adapters/SQLiteAdapter.js";

// Factory
export { DatabaseFactory } from "./DatabaseFactory.js";

// Main service
export { DatabaseService } from "./DatabaseService.js";

// Repository (existing)
export {
  ExecutionRepository,
  type ExecutionRecord,
  type ExecutionFilters,
  type ExecutionStatus,
  type ExecutionType,
  type NodeResult,
  type Pagination,
  type StatusCounts,
} from "./ExecutionRepository.js";
