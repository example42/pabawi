/**
 * Error Handler Service
 *
 * Provides error categorization, structured error responses, and retry logic
 * with configurable backoff strategies. Plugins can opt-in to use this service
 * for consistent error handling across the execution framework.
 */

import { LoggerService } from './LoggerService.js';

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'ValidationError',
  AUTHORIZATION = 'AuthorizationError',
  TIMEOUT = 'TimeoutError',
  CONNECTION = 'ConnectionError',
  EXECUTION = 'ExecutionError',
  PLUGIN = 'PluginError',
  QUEUE_FULL = 'QueueFullError',
  CIRCUIT_BREAKER = 'CircuitBreakerError',
  UNKNOWN = 'UnknownError',
}

/**
 * Error context for tracking
 */
export interface ErrorContext {
  executionId?: string;
  nodeId?: string;
  plugin?: string;
  capability?: string;
  timestamp: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structured error response
 */
export interface StructuredError {
  code: string;
  message: string;
  category: ErrorCategory;
  context: ErrorContext;
  details?: Record<string, unknown>;
  stack?: string;
  retryable: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  strategy: 'linear' | 'exponential';
  retryableCategories: ErrorCategory[];
}

/**
 * Backoff strategy type
 */
export type BackoffStrategy = 'linear' | 'exponential';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  strategy: 'exponential',
  retryableCategories: [
    ErrorCategory.CONNECTION,
    ErrorCategory.TIMEOUT,
    ErrorCategory.QUEUE_FULL,
  ],
};

/**
 * Error Handler Service
 *
 * Provides:
 * - Error categorization and classification
 * - Structured error responses with context
 * - Retry logic with linear and exponential backoff
 * - Retryability determination
 * - Error logging integration
 */
export class ErrorHandler {
  private readonly logger: LoggerService;
  private readonly retryConfig: RetryConfig;
  private readonly debug: boolean;

  /**
   * Create a new ErrorHandler instance
   *
   * @param config - Retry configuration (optional)
   * @param options - Additional options
   */
  constructor(
    config: Partial<RetryConfig> = {},
    options: { debug?: boolean } = {}
  ) {
    this.logger = new LoggerService();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.debug = options.debug ?? false;

    if (this.debug) {
      this.logger.debug('ErrorHandler initialized', {
        component: 'ErrorHandler',
        metadata: { retryConfig: this.retryConfig },
      });
    }
  }

  /**
   * Handle an error and convert to structured format
   *
   * @param error - Error object or message
   * @param context - Error context
   * @returns Structured error
   */
  public handleError(
    error: Error | string,
    context: Partial<ErrorContext> = {}
  ): StructuredError {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const category = this.categorizeError(errorObj);
    const retryable = this.shouldRetry({ category } as StructuredError);

    const fullContext: ErrorContext = {
      timestamp: new Date().toISOString(),
      ...context,
    };

    const structuredError: StructuredError = {
      code: this.generateErrorCode(category),
      message: errorObj.message,
      category,
      context: fullContext,
      stack: errorObj.stack,
      retryable,
    };

    // Log the error
    this.recordError(structuredError);

    return structuredError;
  }

  /**
   * Categorize an error based on its type and message
   *
   * @param error - Error object
   * @returns Error category
   */
  public categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Check error name first
    if (name.includes('validation')) {
      return ErrorCategory.VALIDATION;
    }
    if (name.includes('authorization') || name.includes('permission')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (name.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }

    // Check error message
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('permission')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorCategory.TIMEOUT;
    }
    if (
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('unreachable')
    ) {
      return ErrorCategory.CONNECTION;
    }
    if (message.includes('queue full') || message.includes('capacity')) {
      return ErrorCategory.QUEUE_FULL;
    }
    if (message.includes('circuit') || message.includes('breaker')) {
      return ErrorCategory.CIRCUIT_BREAKER;
    }
    if (message.includes('plugin')) {
      return ErrorCategory.PLUGIN;
    }
    if (message.includes('execution') || message.includes('command') || message.includes('task')) {
      return ErrorCategory.EXECUTION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine if an error should be retried
   *
   * @param error - Structured error
   * @returns true if error should be retried
   */
  public shouldRetry(error: StructuredError): boolean {
    return this.retryConfig.retryableCategories.includes(error.category);
  }

  /**
   * Get retry delay for a given attempt number
   *
   * @param attemptNumber - Current attempt number (1-based)
   * @param strategy - Backoff strategy (optional, uses config default)
   * @returns Delay in milliseconds
   */
  public getRetryDelay(
    attemptNumber: number,
    strategy?: BackoffStrategy
  ): number {
    const backoffStrategy = strategy ?? this.retryConfig.strategy;
    const baseDelay = this.retryConfig.baseDelay;

    if (backoffStrategy === 'linear') {
      return baseDelay * attemptNumber;
    } else {
      // Exponential: baseDelay * (2 ^ attemptNumber)
      return baseDelay * Math.pow(2, attemptNumber - 1);
    }
  }

  /**
   * Execute a function with retry logic
   *
   * @param fn - Function to execute
   * @param context - Error context for logging
   * @param config - Optional retry configuration override
   * @returns Result of the function
   */
  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: Partial<ErrorContext> = {},
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = { ...this.retryConfig, ...config };
    let lastError: StructuredError | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        if (this.debug && attempt > 1) {
          this.logger.debug(
            `Retry attempt ${attempt - 1} of ${retryConfig.maxRetries}`,
            {
              component: 'ErrorHandler',
              operation: 'executeWithRetry',
              metadata: { ...context, attempt },
            }
          );
        }

        return await fn();
      } catch (error) {
        const structuredError = this.handleError(error as Error, context);
        lastError = structuredError;

        // Check if we should retry
        if (!this.shouldRetry(structuredError)) {
          if (this.debug) {
            this.logger.debug(
              `Error not retryable: ${structuredError.category}`,
              {
                component: 'ErrorHandler',
                operation: 'executeWithRetry',
                metadata: context,
              }
            );
          }
          throw error;
        }

        // Check if we've exhausted retries
        if (attempt > retryConfig.maxRetries) {
          this.logger.warn(
            `Max retries (${retryConfig.maxRetries}) exceeded`,
            {
              component: 'ErrorHandler',
              operation: 'executeWithRetry',
              metadata: { ...context, attempts: attempt },
            }
          );
          throw error;
        }

        // Calculate delay and wait
        const delay = this.getRetryDelay(attempt, retryConfig.strategy);
        this.logger.info(
          `Retrying after ${delay}ms (attempt ${attempt}/${retryConfig.maxRetries})`,
          {
            component: 'ErrorHandler',
            operation: 'executeWithRetry',
            metadata: { ...context, delay, attempt },
          }
        );

        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unexpected error in retry logic');
  }

  /**
   * Record an error for logging and monitoring
   *
   * @param error - Structured error
   */
  public recordError(error: StructuredError): void {
    const logLevel = this.getLogLevel(error.category);

    this.logger[logLevel](
      `${error.category}: ${error.message}`,
      {
        component: 'ErrorHandler',
        operation: 'recordError',
        metadata: {
          code: error.code,
          category: error.category,
          retryable: error.retryable,
          ...error.context,
          details: error.details,
        },
      }
    );

    if (this.debug && error.stack) {
      this.logger.debug(
        `Stack trace: ${error.stack}`,
        {
          component: 'ErrorHandler',
          operation: 'recordError',
          metadata: { code: error.code },
        }
      );
    }
  }

  /**
   * Create a structured error from scratch
   *
   * @param category - Error category
   * @param message - Error message
   * @param context - Error context
   * @param details - Additional details
   * @returns Structured error
   */
  public createError(
    category: ErrorCategory,
    message: string,
    context: Partial<ErrorContext> = {},
    details?: Record<string, unknown>
  ): StructuredError {
    const fullContext: ErrorContext = {
      timestamp: new Date().toISOString(),
      ...context,
    };

    return {
      code: this.generateErrorCode(category),
      message,
      category,
      context: fullContext,
      details,
      retryable: this.retryConfig.retryableCategories.includes(category),
    };
  }

  /**
   * Generate error code from category
   * @private
   */
  private generateErrorCode(category: ErrorCategory): string {
    const prefix = 'ERR';
    const categoryCode = category.toUpperCase().replace('ERROR', '');
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${prefix}_${categoryCode}_${timestamp}`;
  }

  /**
   * Get appropriate log level for error category
   * @private
   */
  private getLogLevel(category: ErrorCategory): 'error' | 'warn' | 'info' {
    switch (category) {
      case ErrorCategory.VALIDATION:
      case ErrorCategory.AUTHORIZATION:
        return 'warn';
      case ErrorCategory.CONNECTION:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.QUEUE_FULL:
        return 'warn';
      case ErrorCategory.EXECUTION:
      case ErrorCategory.PLUGIN:
      case ErrorCategory.CIRCUIT_BREAKER:
      case ErrorCategory.UNKNOWN:
      default:
        return 'error';
    }
  }

  /**
   * Sleep for a specified duration
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current retry configuration
   *
   * @returns Retry configuration
   */
  public getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
