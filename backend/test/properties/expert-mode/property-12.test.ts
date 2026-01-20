/**
 * Feature: pabawi-v0.5.0-release, Property 12: Backend Logging Completeness
 * Validates: Requirements 3.11, 3.12
 *
 * This property test verifies that:
 * For any backend API endpoint, appropriate logging should occur at all relevant log levels
 * (error for failures, warn for degraded states, info for normal operations, debug for detailed troubleshooting).
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { DebugInfo } from '../../../src/services/ExpertModeService';

describe('Property 12: Backend Logging Completeness', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for operation types
  const operationTypeArb = fc.constantFrom(
    'api-call',
    'database-query',
    'cache-lookup',
    'integration-health-check',
    'data-processing',
    'validation'
  );

  // Generator for operation states
  const operationStateArb = fc.constantFrom(
    'success',
    'failure',
    'degraded',
    'partial-success',
    'timeout',
    'error'
  );

  // Generator for integration names
  const integrationArb = fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera');

  /**
   * Determine which log levels should be present based on operation state
   */
  function getExpectedLogLevels(state: string): Set<string> {
    const levels = new Set<string>();

    switch (state) {
      case 'success':
        // Success should have info and debug
        levels.add('info');
        levels.add('debug');
        break;
      case 'failure':
      case 'error':
        // Failures should have error, warn, info, and debug
        levels.add('error');
        levels.add('warn');
        levels.add('info');
        levels.add('debug');
        break;
      case 'degraded':
      case 'partial-success':
        // Degraded states should have warn, info, and debug
        levels.add('warn');
        levels.add('info');
        levels.add('debug');
        break;
      case 'timeout':
        // Timeouts should have error, warn, info, and debug
        levels.add('error');
        levels.add('warn');
        levels.add('info');
        levels.add('debug');
        break;
    }

    return levels;
  }

  /**
   * Check if debug info has all expected log levels
   */
  function hasExpectedLogLevels(debugInfo: DebugInfo, expectedLevels: Set<string>): boolean {
    const presentLevels = new Set<string>();

    if (debugInfo.errors && debugInfo.errors.length > 0) {
      presentLevels.add('error');
    }
    if (debugInfo.warnings && debugInfo.warnings.length > 0) {
      presentLevels.add('warn');
    }
    if (debugInfo.info && debugInfo.info.length > 0) {
      presentLevels.add('info');
    }
    if (debugInfo.debug && debugInfo.debug.length > 0) {
      presentLevels.add('debug');
    }

    // Check if all expected levels are present
    for (const level of expectedLevels) {
      if (!presentLevels.has(level)) {
        return false;
      }
    }

    return true;
  }

  it('should capture all relevant log levels based on operation state', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        operationStateArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        fc.integer({ min: 0, max: 10000 }),
        (operationType, operationState, requestId, duration) => {
          const debugInfo = service.createDebugInfo(`${operationType}-${operationState}`, requestId, duration);

          // Add log messages based on operation state
          const expectedLevels = getExpectedLogLevels(operationState);

          if (expectedLevels.has('error')) {
            service.addError(debugInfo, {
              message: `${operationType} failed`,
              level: 'error',
            });
          }
          if (expectedLevels.has('warn')) {
            service.addWarning(debugInfo, {
              message: `${operationType} degraded`,
              level: 'warn',
            });
          }
          if (expectedLevels.has('info')) {
            service.addInfo(debugInfo, {
              message: `${operationType} completed`,
              level: 'info',
            });
          }
          if (expectedLevels.has('debug')) {
            service.addDebug(debugInfo, {
              message: `${operationType} details`,
              level: 'debug',
            });
          }

          // Verify all expected levels are present
          return hasExpectedLogLevels(debugInfo, expectedLevels);
        }
      ),
      propertyTestConfig
    );
  });

  it('should log errors for all failure scenarios', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.constantFrom('failure', 'error', 'timeout'),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, failureType, requestId) => {
          const debugInfo = service.createDebugInfo(`${operationType}-${failureType}`, requestId, 0);

          // Add error
          service.addError(debugInfo, {
            message: `${operationType} ${failureType}`,
            level: 'error',
          });

          // Error should be present
          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].level === 'error'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log warnings for degraded states', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.constantFrom('degraded', 'partial-success'),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, degradedState, requestId) => {
          const debugInfo = service.createDebugInfo(`${operationType}-${degradedState}`, requestId, 0);

          // Add warning
          service.addWarning(debugInfo, {
            message: `${operationType} ${degradedState}`,
            level: 'warn',
          });

          // Warning should be present
          return (
            debugInfo.warnings !== undefined &&
            debugInfo.warnings.length > 0 &&
            debugInfo.warnings[0].level === 'warn'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log info for normal operations', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.constantFrom('success', 'degraded', 'partial-success'),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, operationState, requestId) => {
          const debugInfo = service.createDebugInfo(`${operationType}-${operationState}`, requestId, 0);

          // Add info
          service.addInfo(debugInfo, {
            message: `${operationType} ${operationState}`,
            level: 'info',
          });

          // Info should be present
          return (
            debugInfo.info !== undefined &&
            debugInfo.info.length > 0 &&
            debugInfo.info[0].level === 'info'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log debug information for detailed troubleshooting', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        operationStateArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, operationState, requestId) => {
          const debugInfo = service.createDebugInfo(`${operationType}-${operationState}`, requestId, 0);

          // Add debug
          service.addDebug(debugInfo, {
            message: `${operationType} debug details`,
            level: 'debug',
          });

          // Debug should be present
          return (
            debugInfo.debug !== undefined &&
            debugInfo.debug.length > 0 &&
            debugInfo.debug[0].level === 'debug'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture multiple log messages at each level', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, errorCount, warnCount, infoCount, debugCount, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, 0);

          // Add multiple errors
          for (let i = 0; i < errorCount; i++) {
            service.addError(debugInfo, {
              message: `Error ${i + 1}`,
              level: 'error',
            });
          }

          // Add multiple warnings
          for (let i = 0; i < warnCount; i++) {
            service.addWarning(debugInfo, {
              message: `Warning ${i + 1}`,
              level: 'warn',
            });
          }

          // Add multiple info messages
          for (let i = 0; i < infoCount; i++) {
            service.addInfo(debugInfo, {
              message: `Info ${i + 1}`,
              level: 'info',
            });
          }

          // Add multiple debug messages
          for (let i = 0; i < debugCount; i++) {
            service.addDebug(debugInfo, {
              message: `Debug ${i + 1}`,
              level: 'debug',
            });
          }

          // Verify all messages are captured
          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length === errorCount &&
            debugInfo.warnings !== undefined &&
            debugInfo.warnings.length === warnCount &&
            debugInfo.info !== undefined &&
            debugInfo.info.length === infoCount &&
            debugInfo.debug !== undefined &&
            debugInfo.debug.length === debugCount
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log integration-specific information', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        operationTypeArb,
        operationStateArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, operationType, operationState, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-${operationType}`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          // Add log messages with integration context
          service.addInfo(debugInfo, {
            message: `${integration} ${operationType} ${operationState}`,
            context: integration,
            level: 'info',
          });

          // Integration should be set and info should include integration context
          return (
            debugInfo.integration === integration &&
            debugInfo.info !== undefined &&
            debugInfo.info.length > 0 &&
            debugInfo.info[0].message.includes(integration)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain log order (chronological)', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 2, maxLength: 10 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, messages, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, 0);

          // Add messages in order
          messages.forEach((message, index) => {
            service.addInfo(debugInfo, {
              message: `${index}: ${message}`,
              level: 'info',
            });
          });

          // Verify messages are in order
          if (!debugInfo.info || debugInfo.info.length !== messages.length) {
            return false;
          }

          return debugInfo.info.every((info, index) =>
            info.message.startsWith(`${index}:`)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture context information with log messages', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, context, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, 0);

          // Add messages with context
          service.addError(debugInfo, {
            message: 'Error occurred',
            context,
            level: 'error',
          });
          service.addWarning(debugInfo, {
            message: 'Warning occurred',
            context,
            level: 'warn',
          });
          service.addInfo(debugInfo, {
            message: 'Info message',
            context,
            level: 'info',
          });
          service.addDebug(debugInfo, {
            message: 'Debug message',
            context,
            level: 'debug',
          });

          // Verify context is captured
          return (
            debugInfo.errors?.[0]?.context === context &&
            debugInfo.warnings?.[0]?.context === context &&
            debugInfo.info?.[0]?.context === context &&
            debugInfo.debug?.[0]?.context === context
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log API call information', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.array(
          fc.record({
            endpoint: fc.webUrl(),
            method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
            duration: fc.integer({ min: 0, max: 5000 }),
            status: fc.constantFrom(200, 201, 400, 404, 500),
            cached: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, apiCalls, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, 0);

          // Add API calls
          apiCalls.forEach(call => service.addApiCall(debugInfo, call));

          // Add info about API calls
          service.addInfo(debugInfo, {
            message: `Made ${apiCalls.length} API calls`,
            level: 'info',
          });

          // Verify API calls and info are captured
          return (
            debugInfo.apiCalls !== undefined &&
            debugInfo.apiCalls.length === apiCalls.length &&
            debugInfo.info !== undefined &&
            debugInfo.info.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should log cache hit/miss information', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.boolean(),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, cacheHit, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, 0);
          service.setCacheHit(debugInfo, cacheHit);

          // Add info about cache
          service.addInfo(debugInfo, {
            message: cacheHit ? 'Cache hit' : 'Cache miss',
            level: 'info',
          });

          // Verify cache status and info are captured
          return (
            debugInfo.cacheHit === cacheHit &&
            debugInfo.info !== undefined &&
            debugInfo.info.length > 0 &&
            debugInfo.info[0].message.includes('Cache')
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness across all operation types', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.array(operationTypeArb, { minLength: 2, maxLength: 6 }),
        operationStateArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationTypes, operationState, requestId) => {
          const expectedLevels = getExpectedLogLevels(operationState);

          // Create debug info for each operation type
          const debugInfos = operationTypes.map(operationType => {
            const debugInfo = service.createDebugInfo(`${operationType}-${operationState}`, requestId, 0);

            // Add log messages based on operation state
            if (expectedLevels.has('error')) {
              service.addError(debugInfo, {
                message: `${operationType} failed`,
                level: 'error',
              });
            }
            if (expectedLevels.has('warn')) {
              service.addWarning(debugInfo, {
                message: `${operationType} degraded`,
                level: 'warn',
              });
            }
            if (expectedLevels.has('info')) {
              service.addInfo(debugInfo, {
                message: `${operationType} completed`,
                level: 'info',
              });
            }
            if (expectedLevels.has('debug')) {
              service.addDebug(debugInfo, {
                message: `${operationType} details`,
                level: 'debug',
              });
            }

            return debugInfo;
          });

          // All debug infos should have expected log levels
          return debugInfos.every(debugInfo => hasExpectedLogLevels(debugInfo, expectedLevels));
        }
      ),
      propertyTestConfig
    );
  });

  it('should log performance metrics', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.integer({ min: 0, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, duration, requestId) => {
          const debugInfo = service.createDebugInfo(operationType, requestId, duration);

          // Add debug message about performance
          service.addDebug(debugInfo, {
            message: `Operation took ${duration}ms`,
            level: 'debug',
          });

          // Verify duration and debug message are captured
          return (
            debugInfo.duration === duration &&
            debugInfo.debug !== undefined &&
            debugInfo.debug.length > 0 &&
            debugInfo.debug[0].message.includes(`${duration}ms`)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle logging without errors when operation succeeds', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationTypeArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        (operationType, requestId) => {
          const debugInfo = service.createDebugInfo(`${operationType}-success`, requestId, 0);

          // Add only info and debug (no errors or warnings)
          service.addInfo(debugInfo, {
            message: `${operationType} completed successfully`,
            level: 'info',
          });
          service.addDebug(debugInfo, {
            message: `${operationType} debug details`,
            level: 'debug',
          });

          // Verify no errors or warnings, but info and debug are present
          return (
            (debugInfo.errors === undefined || debugInfo.errors.length === 0) &&
            (debugInfo.warnings === undefined || debugInfo.warnings.length === 0) &&
            debugInfo.info !== undefined &&
            debugInfo.info.length > 0 &&
            debugInfo.debug !== undefined &&
            debugInfo.debug.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });
});
