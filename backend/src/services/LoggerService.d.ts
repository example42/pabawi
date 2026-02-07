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
export declare class LoggerService {
    private readonly level;
    private readonly levelPriority;
    /**
     * Create a new LoggerService instance
     *
     * @param level - Log level to use (defaults to LOG_LEVEL env var or 'info')
     */
    constructor(level?: LogLevel);
    /**
     * Validate and normalize log level
     *
     * @param level - Log level string to validate
     * @returns Valid log level or undefined if invalid
     */
    private validateLogLevel;
    /**
     * Check if a string is a valid log level
     *
     * @param level - String to check
     * @returns true if valid log level
     */
    private isValidLogLevel;
    /**
     * Check if a message at the given level should be logged
     *
     * @param level - Log level to check
     * @returns true if message should be logged
     */
    shouldLog(level: LogLevel): boolean;
    /**
     * Format a log message with timestamp, level, component, and context
     *
     * @param level - Log level
     * @param message - Log message
     * @param context - Optional context information
     * @returns Formatted log message
     */
    formatMessage(level: LogLevel, message: string, context?: LogContext): string;
    /**
     * Log an error message
     *
     * @param message - Error message
     * @param context - Optional context information
     * @param error - Optional error object
     */
    error(message: string, context?: LogContext, error?: Error): void;
    /**
     * Log a warning message
     *
     * @param message - Warning message
     * @param context - Optional context information
     */
    warn(message: string, context?: LogContext): void;
    /**
     * Log an informational message
     *
     * @param message - Info message
     * @param context - Optional context information
     */
    info(message: string, context?: LogContext): void;
    /**
     * Log a debug message
     *
     * @param message - Debug message
     * @param context - Optional context information
     */
    debug(message: string, context?: LogContext): void;
    /**
     * Get the current log level
     *
     * @returns Current log level
     */
    getLevel(): LogLevel;
}
//# sourceMappingURL=LoggerService.d.ts.map
