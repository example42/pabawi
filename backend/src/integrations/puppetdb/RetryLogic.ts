/**
 * Retry Logic with Exponential Backoff
 *
 * Provides retry functionality for operations that may fail transiently.
 * Implements exponential backoff to avoid overwhelming failing services.
 */

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (0 = no retries) */
  maxAttempts: number;

  /** Initial delay in milliseconds before first retry */
  initialDelay: number;

  /** Maximum delay in milliseconds between retries */
  maxDelay?: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;

  /** Whether to add random jitter to delays (default: true) */
  jitter?: boolean;

  /** Function to determine if an error should trigger a retry */
  shouldRetry?: (error: unknown) => boolean;

  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, "onRetry">> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: () => true,
};

/**
 * Calculate exponential backoff delay
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const multiplier = config.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier;
  const maxDelay = config.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay;

  // Calculate exponential delay: initialDelay * (multiplier ^ attempt)
  let delay = config.initialDelay * Math.pow(multiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, maxDelay);

  // Add jitter if enabled (random value between 0 and delay)
  if (config.jitter ?? DEFAULT_RETRY_CONFIG.jitter) {
    delay = Math.random() * delay;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with retry logic and exponential backoff
 *
 * @param operation - Async operation to execute
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
): Promise<T> {
  const maxAttempts = config.maxAttempts;
  const shouldRetry = config.shouldRetry ?? DEFAULT_RETRY_CONFIG.shouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      // Execute the operation
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(attempt, config);

      // Invoke retry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, delay, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retry wrapper function
 *
 * Returns a function that wraps any async operation with retry logic.
 *
 * @param config - Retry configuration
 * @returns Wrapper function
 */
export function createRetryWrapper(config: RetryConfig) {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    return withRetry(operation, config);
  };
}

/**
 * Check if an error is retryable (network/timeout errors)
 *
 * @param error - Error to check
 * @returns true if error should trigger retry
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("socket")
  ) {
    return true;
  }

  // HTTP 5xx errors (server errors)
  if (message.includes("http_5")) {
    return true;
  }

  // HTTP 429 (rate limit)
  if (message.includes("http_429")) {
    return true;
  }

  return false;
}

/**
 * Create a retry configuration for PuppetDB operations
 *
 * @param maxAttempts - Maximum retry attempts
 * @param initialDelay - Initial delay in milliseconds
 * @returns Retry configuration
 */
export function createPuppetDBRetryConfig(
  maxAttempts: number = 3,
  initialDelay: number = 1000,
): RetryConfig {
  return {
    maxAttempts,
    initialDelay,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    shouldRetry: isRetryableError,
    onRetry: (attempt, delay, error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[PuppetDB] Retry attempt ${String(attempt)} after ${String(delay)}ms due to: ${errorMessage}`,
      );
    },
  };
}
