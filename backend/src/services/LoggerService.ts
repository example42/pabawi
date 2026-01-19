/**
 * Logger Service
 *
 * Centralized logging service providing consistent log formatting and
 * log level hierarchy enforcement across all backend components.
 */

/**
 * Log level type definition
 * Hierarchy: error > warn > info > debug
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Context information for log messages
 */
export interface LogContext {
  /** Component or module name generating the log */
  component: string;
  /** Integration name (bolt, puppetdb, puppetserver, hiera) */
  integration?: string;
  /** Operation or method name */
  operation?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Centralized logging service with consistent formatting and level hierarchy
 *
 * Features:
 * - Log level hierarchy enforcement (error > warn > info > debug)
 * - Consistent message formatting with timestamp, level, component, and context
 * - Environment variable configuration (LOG_LEVEL)
 * - Structured logging with context support
 */
export class LoggerService {
  private readonly level: LogLevel;
  private readonly levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  /**
   * Create a new LoggerService instance
   *
   * @param level - Log level to use (defaults to LOG_LEVEL env var or 'info')
   */
  constructor(level?: LogLevel) {
    // Read from environment variable or use provided level or default to 'info'
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.level = level ?? this.validateLogLevel(envLevel) ?? 'info';
  }

  /**
   * Validate and normalize log level
   *
   * @param level - Log level string to validate
   * @returns Valid log level or undefined if invalid
   */
  private validateLogLevel(level: string | undefined): LogLevel | undefined {
    if (!level) {
      return undefined;
    }

    const normalized = level.toLowerCase();
    if (this.isValidLogLevel(normalized)) {
      return normalized as LogLevel;
    }

    // Log warning about invalid level (using console directly to avoid recursion)
    console.warn(
      `[LoggerService] Invalid LOG_LEVEL "${level}", defaulting to "info". Valid levels: error, warn, info, debug`
    );
    return undefined;
  }

  /**
   * Check if a string is a valid log level
   *
   * @param level - String to check
   * @returns true if valid log level
   */
  private isValidLogLevel(level: string): boolean {
    return ['error', 'warn', 'info', 'debug'].includes(level);
  }

  /**
   * Check if a message at the given level should be logged
   *
   * @param level - Log level to check
   * @returns true if message should be logged
   */
  public shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] <= this.levelPriority[this.level];
  }

  /**
   * Format a log message with timestamp, level, component, and context
   *
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context information
   * @returns Formatted log message
   */
  public formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);

    let formattedMessage = `[${timestamp}] ${levelStr}`;

    if (context) {
      // Add component
      if (context.component) {
        formattedMessage += ` [${context.component}]`;
      }

      // Add integration if present
      if (context.integration) {
        formattedMessage += ` [${context.integration}]`;
      }

      // Add operation if present
      if (context.operation) {
        formattedMessage += ` [${context.operation}]`;
      }
    }

    formattedMessage += ` ${message}`;

    // Add metadata if present
    if (context?.metadata && Object.keys(context.metadata).length > 0) {
      formattedMessage += ` ${JSON.stringify(context.metadata)}`;
    }

    return formattedMessage;
  }

  /**
   * Log an error message
   *
   * @param message - Error message
   * @param context - Optional context information
   * @param error - Optional error object
   */
  public error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog('error')) {
      return;
    }

    const formattedMessage = this.formatMessage('error', message, context);
    console.error(formattedMessage);

    // Log error stack trace if provided
    if (error?.stack) {
      console.error(error.stack);
    }
  }

  /**
   * Log a warning message
   *
   * @param message - Warning message
   * @param context - Optional context information
   */
  public warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) {
      return;
    }

    const formattedMessage = this.formatMessage('warn', message, context);
    console.warn(formattedMessage);
  }

  /**
   * Log an informational message
   *
   * @param message - Info message
   * @param context - Optional context information
   */
  public info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const formattedMessage = this.formatMessage('info', message, context);
    // eslint-disable-next-line no-console
    console.log(formattedMessage);
  }

  /**
   * Log a debug message
   *
   * @param message - Debug message
   * @param context - Optional context information
   */
  public debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) {
      return;
    }

    const formattedMessage = this.formatMessage('debug', message, context);
    // eslint-disable-next-line no-console
    console.log(formattedMessage);
  }

  /**
   * Get the current log level
   *
   * @returns Current log level
   */
  public getLevel(): LogLevel {
    return this.level;
  }
}
