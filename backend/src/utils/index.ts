/**
 * Utility Functions Index
 *
 * Exports all utility functions for easy importing across the codebase.
 */

// Error handling utilities
export {
  formatErrorMessage,
  isZodError,
  formatZodErrors,
  sendValidationError,
  sendErrorResponse,
  logAndSendError,
  asyncHandler,
  createErrorResponse,
  ERROR_CODES,
  type ErrorResponse,
} from "./errorHandling";

// Caching utilities
export {
  SimpleCache,
  isCacheValid,
  createCacheEntry,
  buildCacheKey,
  type CacheEntry,
  type CacheConfig,
  type TimestampedCacheEntry,
} from "./caching";

// API response utilities
export {
  sendSuccess,
  sendSuccessMessage,
  sendPaginatedResponse,
  calculatePagination,
  paginateArray,
  validatePagination,
  createResponse,
  sendNotFound,
  sendCreated,
  sendNoContent,
  type SuccessResponse,
  type PaginationMeta,
  type PaginatedResponse,
} from "./apiResponse";
