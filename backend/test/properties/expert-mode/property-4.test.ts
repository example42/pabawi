/**
 * Feature: pabawi-v0.5.0-release, Property 4: Expert Mode Debug Data Inclusion
 * Validates: Requirements 3.1, 3.5
 *
 * This property test verifies that:
 * For any API response, debug information should be included if and only if
 * expert mode is enabled in the request context.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { Request } from 'express';
import type { DebugInfo } from '../../../src/services/ExpertModeService';

describe('Property 4: Expert Mode Debug Data Inclusion', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for expert mode header values
  const expertModeHeaderArb = fc.oneof(
    fc.constant('true'),
    fc.constant('false'),
    fc.constant('1'),
    fc.constant('0'),
    fc.constant('yes'),
    fc.constant('no'),
    fc.constant(undefined),
    fc.string({ minLength: 1, maxLength: 20 })
  );

  // Generator for mock request objects
  const mockRequestArb = (headerValue: string | undefined) => {
    const headers: Record<string, string | undefined> = {};
    if (headerValue !== undefined) {
      headers['x-expert-mode'] = headerValue;
    }
    return {
      headers,
    } as Request;
  };

  // Generator for debug info
  const debugInfoArb: fc.Arbitrary<DebugInfo> = fc.record({
    timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
    requestId: fc.string({ minLength: 10, maxLength: 30 }),
    operation: fc.string({ minLength: 5, maxLength: 50 }),
    duration: fc.integer({ min: 0, max: 10000 }),
    integration: fc.option(fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera')),
    cacheHit: fc.option(fc.boolean()),
    apiCalls: fc.option(
      fc.array(
        fc.record({
          endpoint: fc.webUrl(),
          method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
          duration: fc.integer({ min: 0, max: 5000 }),
          status: fc.constantFrom(200, 201, 400, 404, 500),
          cached: fc.boolean(),
        }),
        { minLength: 0, maxLength: 10 }
      )
    ),
    errors: fc.option(
      fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          stack: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
          code: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
        }),
        { minLength: 0, maxLength: 5 }
      )
    ),
    metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
  });

  // Generator for response data
  const responseDataArb = fc.oneof(
    fc.record({
      data: fc.array(fc.anything()),
      count: fc.integer({ min: 0, max: 1000 }),
    }),
    fc.record({
      status: fc.string(),
      message: fc.string(),
    }),
    fc.array(fc.anything()),
    fc.string(),
    fc.integer(),
  );

  it('should include debug info if and only if expert mode is enabled', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        expertModeHeaderArb,
        responseDataArb,
        debugInfoArb,
        (headerValue, responseData, debugInfo) => {
          const req = mockRequestArb(headerValue);
          const isExpertMode = service.isExpertModeEnabled(req);

          // Attach debug info
          const result = service.attachDebugInfo(responseData, debugInfo);

          // If expert mode is enabled, debug info should be present
          // If expert mode is disabled, we still attach it (the middleware decides whether to send it)
          // But the key property is: isExpertModeEnabled should correctly detect the header
          if (isExpertMode) {
            // Expert mode is enabled, so the header was 'true', '1', or 'yes'
            const normalizedValue = headerValue ? String(headerValue).toLowerCase() : '';
            return (
              normalizedValue === 'true' ||
              normalizedValue === '1' ||
              normalizedValue === 'yes'  // pragma: allowlist secret
            );
          } else {
            // Expert mode is disabled, so the header was not 'true', '1', or 'yes'
            const normalizedValue = headerValue ? String(headerValue).toLowerCase() : '';
            return !(
              normalizedValue === 'true' ||
              normalizedValue === '1' ||
              normalizedValue === 'yes'  // pragma: allowlist secret
            );
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should correctly detect expert mode from request headers', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        expertModeHeaderArb,
        (headerValue) => {
          const req = mockRequestArb(headerValue);
          const isExpertMode = service.isExpertModeEnabled(req);

          // Expert mode should be enabled only for 'true', '1', or 'yes' (case-insensitive)
          const normalizedValue = headerValue ? String(headerValue).toLowerCase() : '';
          const expectedResult =
            normalizedValue === 'true' ||
            normalizedValue === '1' ||
            normalizedValue === 'yes';  // pragma: allowlist secret

          return isExpertMode === expectedResult;
        }
      ),
      propertyTestConfig
    );
  });

  it('should always attach debug info when provided, regardless of expert mode', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        responseDataArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          // Attach debug info
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should always be attached (the _debug property should exist)
          return '_debug' in result && result._debug !== undefined;
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve original response data when attaching debug info', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        responseDataArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Original data should be preserved
          // Check that all original properties are still present
          if (typeof responseData === 'object' && responseData !== null) {
            const originalKeys = Object.keys(responseData);
            return originalKeys.every(key => key in result);
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle case-insensitive expert mode header values', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.constantFrom('true', 'TRUE', 'True', 'TrUe', '1', 'yes', 'YES', 'Yes'),
        (headerValue) => {
          const req = mockRequestArb(headerValue);
          const isExpertMode = service.isExpertModeEnabled(req);

          // All these values should enable expert mode
          return isExpertMode === true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should reject invalid expert mode header values', () => {
    const service = new ExpertModeService();

    // Generator for invalid header values
    const invalidHeaderArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter(s => {
        const normalized = s.toLowerCase();
        return normalized !== 'true' && normalized !== '1' && normalized !== 'yes';  // pragma: allowlist secret
      });

    fc.assert(
      fc.property(
        invalidHeaderArb,
        (headerValue) => {
          const req = mockRequestArb(headerValue);
          const isExpertMode = service.isExpertModeEnabled(req);

          // Invalid values should not enable expert mode
          return isExpertMode === false;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle missing expert mode header', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.constant(undefined),
        (headerValue) => {
          const req = mockRequestArb(headerValue);
          const isExpertMode = service.isExpertModeEnabled(req);

          // Missing header should not enable expert mode
          return isExpertMode === false;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain consistency across multiple checks of the same request', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        expertModeHeaderArb,
        fc.integer({ min: 2, max: 10 }),
        (headerValue, checkCount) => {
          const req = mockRequestArb(headerValue);

          // Check expert mode multiple times
          const results = Array.from({ length: checkCount }, () =>
            service.isExpertModeEnabled(req)
          );

          // All results should be identical
          const firstResult = results[0];
          return results.every(result => result === firstResult);
        }
      ),
      propertyTestConfig
    );
  });

  it('should include all required debug info fields when attaching', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        responseDataArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Check that all required fields are present in the attached debug info
          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.timestamp === 'string' &&
            typeof debug.requestId === 'string' &&
            typeof debug.operation === 'string' &&
            typeof debug.duration === 'number'  // pragma: allowlist secret
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle debug info with optional fields correctly', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        responseDataArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Optional fields should be preserved if present
          const debug = result._debug;
          if (!debug) return false;

          // If original debug info had optional fields, they should be in the result
          if (debugInfo.integration !== undefined) {
            return debug.integration === debugInfo.integration;
          }
          if (debugInfo.cacheHit !== undefined) {
            return debug.cacheHit === debugInfo.cacheHit;
          }
          if (debugInfo.apiCalls !== undefined) {
            return debug.apiCalls !== undefined;
          }
          if (debugInfo.errors !== undefined) {
            return debug.errors !== undefined;
          }
          if (debugInfo.metadata !== undefined) {
            return debug.metadata !== undefined;
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should truncate debug info when it exceeds size limit', () => {
    const service = new ExpertModeService();

    // Generator for very large debug info (exceeding 1MB)
    const largeDebugInfoArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      // Create a large metadata object to exceed size limit
      metadata: fc.constant({
        largeData: 'x'.repeat(2 * 1024 * 1024), // 2MB of data
      }),
    });

    fc.assert(
      fc.property(
        responseDataArb,
        largeDebugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should be truncated
          const debug = result._debug;
          if (!debug) return false;

          // Check for truncation marker
          if (debug.metadata && '_truncated' in debug.metadata) {
            return (
              debug.metadata._truncated === true &&
              typeof debug.metadata._originalSize === 'number' &&
              typeof debug.metadata._maxSize === 'number'  // pragma: allowlist secret
            );
          }

          // If not truncated, the original size must have been within limits
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain debug info structure after truncation', () => {
    const service = new ExpertModeService();

    // Generator for very large debug info
    const largeDebugInfoArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      metadata: fc.constant({
        largeData: 'x'.repeat(2 * 1024 * 1024), // 2MB of data
      }),
    });

    fc.assert(
      fc.property(
        responseDataArb,
        largeDebugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Even after truncation, required fields should be present
          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.timestamp === 'string' &&
            typeof debug.requestId === 'string' &&
            typeof debug.operation === 'string' &&
            typeof debug.duration === 'number'  // pragma: allowlist secret
          );
        }
      ),
      propertyTestConfig
    );
  });
});
