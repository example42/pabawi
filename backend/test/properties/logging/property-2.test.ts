/**
 * Feature: pabawi-v0.5.0-release, Property 2: Log Level Hierarchy
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 *
 * This property test verifies that:
 * For any log level setting (error, warn, info, debug), the system should output
 * only messages at that level and higher priority levels, following the hierarchy:
 * error > warn > info > debug
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { LoggerService, LogLevel } from '../../../src/services/LoggerService';

describe('Property 2: Log Level Hierarchy', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid log levels
  const logLevelArb = fc.constantFrom<LogLevel>('error', 'warn', 'info', 'debug');

  // Log level hierarchy mapping (lower number = higher priority)
  const levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  it('should only log messages at or above the configured level', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        logLevelArb,
        (configuredLevel, messageLevel) => {
          const logger = new LoggerService(configuredLevel);

          // Check if the message should be logged based on hierarchy
          const shouldLog = levelPriority[messageLevel] <= levelPriority[configuredLevel];

          // Verify shouldLog method returns correct result
          return logger.shouldLog(messageLevel) === shouldLog;
        }
      ),
      propertyTestConfig
    );
  });

  it('should respect hierarchy: error level logs only errors', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (messageLevel) => {
          const logger = new LoggerService('error');

          // Only error messages should be logged
          const expectedResult = messageLevel === 'error';  // pragma: allowlist secret

          return logger.shouldLog(messageLevel) === expectedResult;
        }
      ),
      propertyTestConfig
    );
  });

  it('should respect hierarchy: warn level logs warn and error', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (messageLevel) => {
          const logger = new LoggerService('warn');

          // Only error and warn messages should be logged
          const expectedResult = messageLevel === 'error' || messageLevel === 'warn';  // pragma: allowlist secret

          return logger.shouldLog(messageLevel) === expectedResult;
        }
      ),
      propertyTestConfig
    );
  });

  it('should respect hierarchy: info level logs info, warn, and error', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (messageLevel) => {
          const logger = new LoggerService('info');

          // Error, warn, and info messages should be logged
          const expectedResult = messageLevel !== 'debug';  // pragma: allowlist secret

          return logger.shouldLog(messageLevel) === expectedResult;
        }
      ),
      propertyTestConfig
    );
  });

  it('should respect hierarchy: debug level logs all messages', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (messageLevel) => {
          const logger = new LoggerService('debug');

          // All messages should be logged at debug level
          return logger.shouldLog(messageLevel) === true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain consistent hierarchy across multiple logger instances', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        fc.array(logLevelArb, { minLength: 1, maxLength: 10 }),
        (configuredLevel, messageLevels) => {
          const logger = new LoggerService(configuredLevel);
          const configuredPriority = levelPriority[configuredLevel];

          // Check that all message levels follow the hierarchy consistently
          return messageLevels.every(messageLevel => {
            const shouldLog = levelPriority[messageLevel] <= configuredPriority;
            return logger.shouldLog(messageLevel) === shouldLog;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should enforce transitive hierarchy property', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (configuredLevel) => {
          const logger = new LoggerService(configuredLevel);
          const configuredPriority = levelPriority[configuredLevel];

          // If a level is logged, all higher priority levels should also be logged
          const allLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

          return allLevels.every((level, index) => {
            const levelPrio = levelPriority[level];
            const shouldLog = logger.shouldLog(level);

            if (shouldLog) {
              // All higher priority levels (lower priority numbers) should also be logged
              const higherPriorityLevels = allLevels.filter(
                l => levelPriority[l] < levelPrio
              );
              return higherPriorityLevels.every(higherLevel =>
                logger.shouldLog(higherLevel)
              );
            }

            return true;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain hierarchy consistency when checking same level multiple times', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        logLevelArb,
        fc.integer({ min: 2, max: 10 }),
        (configuredLevel, messageLevel, checkCount) => {
          const logger = new LoggerService(configuredLevel);

          // Check the same level multiple times
          const results = Array.from({ length: checkCount }, () =>
            logger.shouldLog(messageLevel)
          );

          // All results should be identical
          const firstResult = results[0];
          return results.every(result => result === firstResult);
        }
      ),
      propertyTestConfig
    );
  });

  it('should correctly order all log levels by priority', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (configuredLevel) => {
          const logger = new LoggerService(configuredLevel);
          const configuredPriority = levelPriority[configuredLevel];

          // Verify that the hierarchy is strictly ordered
          const allLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

          // Count how many levels should be logged
          const shouldLogCount = allLevels.filter(level =>
            logger.shouldLog(level)
          ).length;

          // The count should match the configured priority + 1
          // (priority 0 = 1 level, priority 1 = 2 levels, etc.)
          return shouldLogCount === configuredPriority + 1;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle environment variable LOG_LEVEL correctly', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        (level) => {
          // Set environment variable
          const originalLogLevel = process.env.LOG_LEVEL;
          process.env.LOG_LEVEL = level;

          try {
            // Create logger without explicit level (should read from env)
            const logger = new LoggerService();

            // Verify it uses the environment variable
            return logger.getLevel() === level;
          } finally {
            // Restore original environment variable
            if (originalLogLevel !== undefined) {
              process.env.LOG_LEVEL = originalLogLevel;
            } else {
              delete process.env.LOG_LEVEL;
            }
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should default to info level when LOG_LEVEL is invalid', () => {
    // Generator for invalid log level strings
    const invalidLogLevelArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !['error', 'warn', 'info', 'debug'].includes(s.toLowerCase()));

    fc.assert(
      fc.property(
        invalidLogLevelArb,
        (invalidLevel) => {
          // Set invalid environment variable
          const originalLogLevel = process.env.LOG_LEVEL;
          process.env.LOG_LEVEL = invalidLevel;

          try {
            // Create logger without explicit level
            const logger = new LoggerService();

            // Should default to 'info'
            return logger.getLevel() === 'info';  // pragma: allowlist secret
          } finally {
            // Restore original environment variable
            if (originalLogLevel !== undefined) {
              process.env.LOG_LEVEL = originalLogLevel;
            } else {
              delete process.env.LOG_LEVEL;
            }
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle case-insensitive log level configuration', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        fc.constantFrom('lower', 'upper', 'mixed'),
        (level, caseType) => {
          let envValue: string;
          switch (caseType) {
            case 'lower':
              envValue = level.toLowerCase();
              break;
            case 'upper':
              envValue = level.toUpperCase();
              break;
            case 'mixed':
              envValue = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
              break;
          }

          // Set environment variable with different case
          const originalLogLevel = process.env.LOG_LEVEL;
          process.env.LOG_LEVEL = envValue;

          try {
            // Create logger
            const logger = new LoggerService();

            // Should normalize to lowercase
            return logger.getLevel() === level.toLowerCase();
          } finally {
            // Restore original environment variable
            if (originalLogLevel !== undefined) {
              process.env.LOG_LEVEL = originalLogLevel;
            } else {
              delete process.env.LOG_LEVEL;
            }
          }
        }
      ),
      propertyTestConfig
    );
  });
});
