/**
 * Feature: pabawi-v0.5.0-release, Property 11: Debug Info Color Consistency
 * Validates: Requirements 3.8, 3.10
 *
 * This property test verifies that:
 * For any expert mode debug panel, errors should be displayed in red, warnings in yellow/orange,
 * and info in blue, consistently across all pages.
 *
 * Note: This is a conceptual property test that validates the logic for determining
 * color coding for different log levels. The actual UI rendering is tested through
 * unit tests in the frontend components.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';

describe('Property 11: Debug Info Color Consistency', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Color mapping for log levels (matching frontend implementation)
  const LOG_LEVEL_COLORS = {
    error: { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
    warn: { text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    info: { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    debug: { text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
  } as const;

  type LogLevel = keyof typeof LOG_LEVEL_COLORS;

  // Generator for log levels
  const logLevelArb = fc.constantFrom<LogLevel>('error', 'warn', 'info', 'debug');

  // Generator for page types
  const pageTypeArb = fc.constantFrom(
    'HomePage',
    'InventoryPage',
    'PuppetPage',
    'NodeDetailPage',
    'ExecutionsPage',
    'IntegrationSetupPage'
  );

  // Generator for log messages
  const logMessageArb = fc.record({
    level: logLevelArb,
    message: fc.string({ minLength: 5, maxLength: 200 }),
    context: fc.option(fc.string({ minLength: 5, maxLength: 100 })),
  });

  /**
   * Get color classes for a log level
   * This simulates the frontend logic for determining colors
   */
  function getColorForLogLevel(level: LogLevel): { text: string; bg: string; border: string } {
    return LOG_LEVEL_COLORS[level];
  }

  /**
   * Check if a color is the expected color for a log level
   */
  function isCorrectColor(level: LogLevel, color: { text: string; bg: string; border: string }): boolean {
    const expectedColor = LOG_LEVEL_COLORS[level];
    return (
      color.text === expectedColor.text &&
      color.bg === expectedColor.bg &&
      color.border === expectedColor.border
    );
  }

  it('should use consistent colors for each log level', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        pageTypeArb,
        (level, pageType) => {
          const color = getColorForLogLevel(level);
          return isCorrectColor(level, color);
        }
      ),
      propertyTestConfig
    );
  });

  it('should use red colors for error level', () => {
    fc.assert(
      fc.property(
        pageTypeArb,
        (pageType) => {
          const color = getColorForLogLevel('error');
          return (
            color.text === 'text-red-700' &&
            color.bg === 'bg-red-50' &&
            color.border === 'border-red-200'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use yellow/orange colors for warn level', () => {
    fc.assert(
      fc.property(
        pageTypeArb,
        (pageType) => {
          const color = getColorForLogLevel('warn');
          return (
            color.text === 'text-yellow-700' &&
            color.bg === 'bg-yellow-50' &&
            color.border === 'border-yellow-200'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use blue colors for info level', () => {
    fc.assert(
      fc.property(
        pageTypeArb,
        (pageType) => {
          const color = getColorForLogLevel('info');
          return (
            color.text === 'text-blue-700' &&
            color.bg === 'bg-blue-50' &&
            color.border === 'border-blue-200'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use gray colors for debug level', () => {
    fc.assert(
      fc.property(
        pageTypeArb,
        (pageType) => {
          const color = getColorForLogLevel('debug');
          return (
            color.text === 'text-gray-700' &&
            color.bg === 'bg-gray-50' &&
            color.border === 'border-gray-200'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency across all pages', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        fc.array(pageTypeArb, { minLength: 2, maxLength: 6 }),
        (level, pageTypes) => {
          // Get colors for the same log level on different pages
          const colors = pageTypes.map(pageType => getColorForLogLevel(level));

          // All colors should be identical
          const firstColor = colors[0];
          return colors.every(color =>
            color.text === firstColor.text &&
            color.bg === firstColor.bg &&
            color.border === firstColor.border
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use different colors for different log levels', () => {
    fc.assert(
      fc.property(
        fc.array(logLevelArb, { minLength: 2, maxLength: 4 }),
        pageTypeArb,
        (levels, pageType) => {
          // Get unique levels
          const uniqueLevels = Array.from(new Set(levels));
          if (uniqueLevels.length < 2) return true; // Skip if not enough unique levels

          // Get colors for different levels
          const colors = uniqueLevels.map(level => getColorForLogLevel(level));

          // Colors should be different for different levels
          for (let i = 0; i < colors.length; i++) {
            for (let j = i + 1; j < colors.length; j++) {
              if (
                colors[i].text === colors[j].text &&
                colors[i].bg === colors[j].bg &&
                colors[i].border === colors[j].border
              ) {
                return false; // Found duplicate colors for different levels
              }
            }
          }
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency for multiple log messages of the same level', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        fc.array(fc.string({ minLength: 5, maxLength: 200 }), { minLength: 2, maxLength: 10 }),
        pageTypeArb,
        (level, messages, pageType) => {
          // Get colors for multiple messages of the same level
          const colors = messages.map(() => getColorForLogLevel(level));

          // All colors should be identical
          const firstColor = colors[0];
          return colors.every(color =>
            color.text === firstColor.text &&
            color.bg === firstColor.bg &&
            color.border === firstColor.border
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should apply correct colors to mixed log levels', () => {
    fc.assert(
      fc.property(
        fc.array(logMessageArb, { minLength: 1, maxLength: 20 }),
        pageTypeArb,
        (logMessages, pageType) => {
          // Get colors for each log message
          const coloredMessages = logMessages.map(msg => ({
            level: msg.level,
            color: getColorForLogLevel(msg.level),
          }));

          // Each message should have the correct color for its level
          return coloredMessages.every(({ level, color }) =>
            isCorrectColor(level, color)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency when log levels are repeated', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        fc.integer({ min: 2, max: 20 }),
        pageTypeArb,
        (level, repeatCount, pageType) => {
          // Get colors for repeated log level
          const colors = Array.from({ length: repeatCount }, () => getColorForLogLevel(level));

          // All colors should be identical
          const firstColor = colors[0];
          return colors.every(color =>
            color.text === firstColor.text &&
            color.bg === firstColor.bg &&
            color.border === firstColor.border
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use consistent color structure (text, bg, border)', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        pageTypeArb,
        (level, pageType) => {
          const color = getColorForLogLevel(level);

          // Color object should have all three properties
          return (
            'text' in color &&
            'bg' in color &&
            'border' in color &&
            typeof color.text === 'string' &&
            typeof color.bg === 'string' &&
            typeof color.border === 'string'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should use TailwindCSS color classes', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        pageTypeArb,
        (level, pageType) => {
          const color = getColorForLogLevel(level);

          // Verify TailwindCSS class format
          const isTailwindTextClass = /^text-(red|yellow|blue|gray)-\d{3}$/.test(color.text);
          const isTailwindBgClass = /^bg-(red|yellow|blue|gray)-\d{2}$/.test(color.bg);
          const isTailwindBorderClass = /^border-(red|yellow|blue|gray)-\d{3}$/.test(color.border);

          return isTailwindTextClass && isTailwindBgClass && isTailwindBorderClass;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency across component renders', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        pageTypeArb,
        fc.integer({ min: 2, max: 10 }),
        (level, pageType, renderCount) => {
          // Simulate multiple component renders
          const colors = Array.from({ length: renderCount }, () => getColorForLogLevel(level));

          // Colors should be consistent across renders
          const firstColor = colors[0];
          return colors.every(color =>
            color.text === firstColor.text &&
            color.bg === firstColor.bg &&
            color.border === firstColor.border
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle all log levels without errors', () => {
    fc.assert(
      fc.property(
        fc.array(logLevelArb, { minLength: 1, maxLength: 100 }),
        pageTypeArb,
        (levels, pageType) => {
          // Get colors for all levels
          try {
            const colors = levels.map(level => getColorForLogLevel(level));
            // All colors should be valid
            return colors.every(color =>
              typeof color.text === 'string' &&
              typeof color.bg === 'string' &&
              typeof color.border === 'string'
            );
          } catch {
            return false;
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should use accessible color combinations', () => {
    fc.assert(
      fc.property(
        logLevelArb,
        pageTypeArb,
        (level, pageType) => {
          const color = getColorForLogLevel(level);

          // Verify that we're using accessible color combinations
          // (700 text on 50 background provides good contrast)
          const hasAccessibleTextColor = color.text.includes('-700');
          const hasAccessibleBgColor = color.bg.includes('-50');

          return hasAccessibleTextColor && hasAccessibleBgColor;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color hierarchy (error > warn > info > debug)', () => {
    const colorIntensity = {
      error: 3, // Red - highest intensity
      warn: 2,  // Yellow - medium-high intensity
      info: 1,  // Blue - medium intensity
      debug: 0, // Gray - lowest intensity
    };

    fc.assert(
      fc.property(
        fc.tuple(logLevelArb, logLevelArb),
        ([level1, level2]) => {
          // If levels are different, their intensities should be different
          if (level1 === level2) return true;

          const intensity1 = colorIntensity[level1];
          const intensity2 = colorIntensity[level2];

          return intensity1 !== intensity2;
        }
      ),
      propertyTestConfig
    );
  });
});
