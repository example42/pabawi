/**
 * Feature: pabawi-v0.5.0-release, Property 3: Log Format Consistency
 * Validates: Requirements 2.5, 2.6
 *
 * This property test verifies that:
 * For any log message from any integration module (Bolt, PuppetDB, PuppetServer, Hiera),
 * the message should follow the same format structure including timestamp, log level,
 * component name, and message content.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { LoggerService, LogLevel, LogContext } from '../../../src/services/LoggerService';

describe('Property 3: Log Format Consistency', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid log levels
  const logLevelArb = fc.constantFrom<LogLevel>('error', 'warn', 'info', 'debug');

  // Generator for integration names
  const integrationArb = fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera');

  // Generator for component names
  const componentArb = fc.oneof(
    fc.constant('BoltPlugin'),
    fc.constant('PuppetDBPlugin'),
    fc.constant('PuppetServerPlugin'),
    fc.constant('HieraPlugin'),
    fc.constant('IntegrationManager'),
    fc.constant('BasePlugin'),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('[') && !s.includes(']'))
  );

  // Generator for operation names
  const operationArb = fc.oneof(
    fc.constant('healthCheck'),
    fc.constant('fetchData'),
    fc.constant('initialize'),
    fc.constant('cleanup'),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('[') && !s.includes(']'))
  );

  // Generator for log messages
  const messageArb = fc.string({ minLength: 1, maxLength: 100 });

  // Generator for metadata
  const metadataArb = fc.option(
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      )
    ),
    { nil: undefined }
  );

  // Generator for log context
  const logContextArb = fc.record({
    component: componentArb,
    integration: fc.option(integrationArb, { nil: undefined }),
    operation: fc.option(operationArb, { nil: undefined }),
    metadata: metadataArb,
  });

  /**
   * Parse a formatted log message to extract its components
   * Format: [timestamp] LEVEL [component] [integration?] [operation?] message {metadata?}
   */
  function parseLogMessage(formattedMessage: string): {
    timestamp: string | null;
    level: string | null;
    component: string | null;
    integration: string | null;
    operation: string | null;
    message: string | null;
    metadata: string | null;
  } {
    // Extract timestamp
    const timestampMatch = formattedMessage.match(/^\[([^\]]+)\]/);
    if (!timestampMatch) {
      return { timestamp: null, level: null, component: null, integration: null, operation: null, message: null, metadata: null };
    }

    let remaining = formattedMessage.slice(timestampMatch[0].length).trim();

    // Extract level (uppercase word followed by space)
    const levelMatch = remaining.match(/^(\w+)\s+/);
    if (!levelMatch) {
      return { timestamp: timestampMatch[1], level: null, component: null, integration: null, operation: null, message: null, metadata: null };
    }

    remaining = remaining.slice(levelMatch[0].length);

    // Extract all bracketed sections
    const bracketedSections: string[] = [];
    while (remaining.startsWith('[')) {
      const endBracket = remaining.indexOf(']');
      if (endBracket === -1) break;
      bracketedSections.push(remaining.slice(1, endBracket));
      remaining = remaining.slice(endBracket + 1).trim();
    }

    // Remaining is message + optional metadata
    // Metadata is JSON object at the end
    let message = remaining;
    let metadata = null;

    // Try to find JSON metadata at the end
    // Look for last occurrence of { and check if it's valid JSON
    const lastBraceIndex = remaining.lastIndexOf('{');
    if (lastBraceIndex !== -1) {
      const potentialJson = remaining.slice(lastBraceIndex);
      try {
        JSON.parse(potentialJson);
        // It's valid JSON, so it's metadata
        metadata = potentialJson;
        message = remaining.slice(0, lastBraceIndex).trim();
      } catch {
        // Not valid JSON, it's part of the message
      }
    }

    return {
      timestamp: timestampMatch[1],
      level: levelMatch[1],
      component: bracketedSections[0] || null,
      integration: bracketedSections[1] || null,
      operation: bracketedSections[2] || null,
      message: message || null,
      metadata: metadata,
    };
  }

  /**
   * Validate that a timestamp is in ISO 8601 format
   */
  function isValidISO8601Timestamp(timestamp: string): boolean {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    return iso8601Regex.test(timestamp);
  }

  it('should always include timestamp in ISO 8601 format', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // Timestamp should be present and valid
          return parsed.timestamp !== null && isValidISO8601Timestamp(parsed.timestamp);
        }
      ),
      propertyTestConfig
    );
  });

  it('should always include log level in uppercase', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // Level should be present and uppercase
          return parsed.level !== null && parsed.level === level.toUpperCase();
        }
      ),
      propertyTestConfig
    );
  });

  it('should always include component name when provided in context', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // Component should match what was provided
          if (context.component) {
            return parsed.component === context.component;
          }
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should include integration name when provided in context', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // Integration should match what was provided
          if (context.integration) {
            return parsed.integration === context.integration;
          }
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should include operation name when provided in context', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // Operation should match what was provided
          // Note: operation appears in different positions depending on whether integration is present
          if (context.operation) {
            // Check if operation appears in any of the bracketed sections
            const allBrackets = [parsed.component, parsed.integration, parsed.operation].filter(Boolean);
            return allBrackets.includes(context.operation);
          }
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should always include the message content', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);

          // Message should be present in the formatted output
          return formatted.includes(message);
        }
      ),
      propertyTestConfig
    );
  });

  it('should include metadata as JSON when provided', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);

          // If metadata was provided and non-empty, it should be in the output as JSON
          if (context.metadata && Object.keys(context.metadata).length > 0) {
            const metadataJson = JSON.stringify(context.metadata);
            // Check if the metadata JSON appears in the formatted message
            return formatted.includes(metadataJson);
          }
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain consistent format structure across all integration modules', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        integrationArb,
        componentArb,
        (level, message, integration, component) => {
          const logger = new LoggerService('debug');

          // Create context for different integration modules
          const context: LogContext = {
            component,
            integration,
          };

          const formatted = logger.formatMessage(level, message, context);
          const parsed = parseLogMessage(formatted);

          // All required components should be present
          return (
            parsed.timestamp !== null &&
            isValidISO8601Timestamp(parsed.timestamp) &&
            parsed.level === level.toUpperCase() &&
            parsed.component === component &&
            parsed.integration === integration &&
            formatted.includes(message)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain format consistency regardless of log level', () => {
    fc.assert(
      fc.property(
        messageArb,
        logContextArb,
        (message, context) => {
          const logger = new LoggerService('debug');

          // Format the same message at different levels
          const errorFormatted = logger.formatMessage('error', message, context);
          const warnFormatted = logger.formatMessage('warn', message, context);
          const infoFormatted = logger.formatMessage('info', message, context);
          const debugFormatted = logger.formatMessage('debug', message, context);

          // Parse all formatted messages
          const errorParsed = parseLogMessage(errorFormatted);
          const warnParsed = parseLogMessage(warnFormatted);
          const infoParsed = parseLogMessage(infoFormatted);
          const debugParsed = parseLogMessage(debugFormatted);

          // All should have the same structure (same fields present/absent)
          const hasComponent = errorParsed.component !== null;
          const hasIntegration = errorParsed.integration !== null;
          const hasOperation = errorParsed.operation !== null;

          return (
            (warnParsed.component !== null) === hasComponent &&
            (infoParsed.component !== null) === hasComponent &&
            (debugParsed.component !== null) === hasComponent &&
            (warnParsed.integration !== null) === hasIntegration &&
            (infoParsed.integration !== null) === hasIntegration &&
            (debugParsed.integration !== null) === hasIntegration &&
            (warnParsed.operation !== null) === hasOperation &&
            (infoParsed.operation !== null) === hasOperation &&
            (debugParsed.operation !== null) === hasOperation
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should format messages consistently across multiple logger instances', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          // Create two separate logger instances
          const logger1 = new LoggerService('debug');
          const logger2 = new LoggerService('debug');

          const formatted1 = logger1.formatMessage(level, message, context);
          const formatted2 = logger2.formatMessage(level, message, context);

          const parsed1 = parseLogMessage(formatted1);
          const parsed2 = parseLogMessage(formatted2);

          // Structure should be identical (ignoring timestamp which may differ slightly)
          return (
            parsed1.level === parsed2.level &&
            parsed1.component === parsed2.component &&
            parsed1.integration === parsed2.integration &&
            parsed1.operation === parsed2.operation &&
            parsed1.message === parsed2.message
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle missing context fields gracefully', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        (level, message) => {
          const logger = new LoggerService('debug');

          // Test with no context
          const formatted1 = logger.formatMessage(level, message);

          // Test with partial context
          const formatted2 = logger.formatMessage(level, message, { component: 'TestComponent' });

          // Both should have timestamp, level, and message (even if message is just whitespace)
          const hasTimestamp1 = /^\[[^\]]+\]/.test(formatted1);
          const hasLevel1 = formatted1.includes(level.toUpperCase());
          const hasMessage1 = formatted1.includes(message.trim()) || message.trim().length === 0;

          const hasTimestamp2 = /^\[[^\]]+\]/.test(formatted2);
          const hasLevel2 = formatted2.includes(level.toUpperCase());
          const hasComponent2 = formatted2.includes('[TestComponent]');
          const hasMessage2 = formatted2.includes(message.trim()) || message.trim().length === 0;

          return (
            hasTimestamp1 &&
            hasLevel1 &&
            hasMessage1 &&
            hasTimestamp2 &&
            hasLevel2 &&
            hasComponent2 &&
            hasMessage2
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain field order: timestamp, level, component, integration, operation, message, metadata', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        componentArb,
        integrationArb,
        operationArb,
        (level, message, component, integration, operation) => {
          const logger = new LoggerService('debug');

          const context: LogContext = {
            component,
            integration,
            operation,
            metadata: { key: 'value' },
          };

          const formatted = logger.formatMessage(level, message, context);

          // Find positions of each element using more specific patterns
          const timestampPos = formatted.indexOf('[');
          const levelPos = formatted.indexOf(level.toUpperCase());
          const componentPos = formatted.indexOf(`[${component}]`);
          const integrationPos = formatted.indexOf(`[${integration}]`);
          const operationPos = formatted.indexOf(`[${operation}]`);

          // Find message position - it should be after the last bracket
          const lastBracketPos = formatted.lastIndexOf(']');
          const messageStartPos = lastBracketPos + 1;

          // Verify order - only check positions that were found
          const positions = [
            { name: 'timestamp', pos: timestampPos },
            { name: 'level', pos: levelPos },
            { name: 'component', pos: componentPos },
            { name: 'integration', pos: integrationPos },
            { name: 'operation', pos: operationPos },
            { name: 'message', pos: messageStartPos },
          ].filter(p => p.pos !== -1);

          // Check that positions are in ascending order
          for (let i = 1; i < positions.length; i++) {
            if (positions[i].pos <= positions[i - 1].pos) {
              return false;
            }
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should produce parseable and consistent format for all valid inputs', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        messageArb,
        logContextArb,
        (level, message, context) => {
          const logger = new LoggerService('debug');
          const formatted = logger.formatMessage(level, message, context);

          // All formatted messages should contain at minimum: timestamp, level
          // Message may be empty/whitespace, which is valid
          const hasTimestamp = /^\[[^\]]+\]/.test(formatted);
          const hasLevel = formatted.includes(level.toUpperCase());

          // Verify timestamp is valid ISO 8601
          const timestampMatch = formatted.match(/^\[([^\]]+)\]/);
          const isValidTimestamp = timestampMatch && isValidISO8601Timestamp(timestampMatch[1]);

          return hasTimestamp && hasLevel && isValidTimestamp;
        }
      ),
      propertyTestConfig
    );
  });
});
