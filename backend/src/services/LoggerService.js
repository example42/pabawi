"use strict";
/**
 * Logger Service
 *
 * Centralized logging service providing consistent log formatting and
 * log level hierarchy enforcement across all backend components.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerService = void 0;
/**
 * Centralized logging service with consistent formatting and level hierarchy
 *
 * Features:
 * - Log level hierarchy enforcement (error > warn > info > debug)
 * - Consistent message formatting with timestamp, level, component, and context
 * - Environment variable configuration (LOG_LEVEL)
 * - Structured logging with context support
 */
class LoggerService {
    level;
    levelPriority = {
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
    constructor(level) {
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
    validateLogLevel(level) {
        if (!level) {
            return undefined;
        }
        const normalized = level.toLowerCase();
        if (this.isValidLogLevel(normalized)) {
            return normalized;
        }
        // Log warning about invalid level (using console directly to avoid recursion)
        console.warn(`[LoggerService] Invalid LOG_LEVEL "${level}", defaulting to "info". Valid levels: error, warn, info, debug`);
        return undefined;
    }
    /**
     * Check if a string is a valid log level
     *
     * @param level - String to check
     * @returns true if valid log level
     */
    isValidLogLevel(level) {
        return ['error', 'warn', 'info', 'debug'].includes(level);
    }
    /**
     * Check if a message at the given level should be logged
     *
     * @param level - Log level to check
     * @returns true if message should be logged
     */
    shouldLog(level) {
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
    formatMessage(level, message, context) {
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
    error(message, context, error) {
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
    warn(message, context) {
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
    info(message, context) {
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
    debug(message, context) {
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
    getLevel() {
        return this.level;
    }
}
exports.LoggerService = LoggerService;
//# sourceMappingURL=LoggerService.js.map
