/**
 * Feature: pabawi-v0.5.0-release, Property 9: Expert Mode Debug Info Attachment
 * Validates: Requirements 3.1, 3.4, 3.13
 *
 * This property test verifies that:
 * For any API response, debug information should be attached to ALL responses
 * (success AND error) when expert mode is enabled.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { DebugInfo } from '../../../src/services/ExpertModeService';

describe('Property 9: Expert Mode Debug Info Attachment', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for success response data
  const successResponseArb = fc.oneof(
    fc.record({
      data: fc.array(fc.anything()),
      count: fc.integer({ min: 0, max: 1000 }),
      status: fc.constant('success'),
    }),
    fc.record({
      nodes: fc.array(fc.record({ id: fc.string(), name: fc.string() })),
      total: fc.integer({ min: 0, max: 100 }),
    }),
    fc.record({
      reports: fc.array(fc.anything()),
      summary: fc.record({
        total: fc.integer(),
        success: fc.integer(),
        failed: fc.integer(),
      }),
    })
  );

  // Generator for error response data
  const errorResponseArb = fc.record({
    error: fc.string({ minLength: 5, maxLength: 200 }),
    statusCode: fc.constantFrom(400, 401, 403, 404, 500, 502, 503),
    message: fc.string({ minLength: 10, maxLength: 100 }),
  });

  // Generator for debug info
  const debugInfoArb: fc.Arbitrary<DebugInfo> = fc.record({
    timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
    requestId: fc.string({ minLength: 10, maxLength: 30 }),
    operation: fc.string({ minLength: 5, maxLength: 50 }),
    duration: fc.integer({ min: 0, max: 10000 }),
    integration: fc.option(fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera')),
    errors: fc.option(
      fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          stack: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
          level: fc.constant('error' as const),
        }),
        { minLength: 0, maxLength: 5 }
      )
    ),
    warnings: fc.option(
      fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          context: fc.option(fc.string()),
          level: fc.constant('warn' as const),
        }),
        { minLength: 0, maxLength: 5 }
      )
    ),
    info: fc.option(
      fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          context: fc.option(fc.string()),
          level: fc.constant('info' as const),
        }),
        { minLength: 0, maxLength: 5 }
      )
    ),
  });

  it('should attach debug info to success responses when expert mode is enabled', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        successResponseArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          // Simulate expert mode enabled
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should be attached
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.timestamp === debugInfo.timestamp &&
            result._debug.requestId === debugInfo.requestId &&
            result._debug.operation === debugInfo.operation
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info to error responses when expert mode is enabled', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        errorResponseArb,
        debugInfoArb,
        (errorResponse, debugInfo) => {
          // Simulate expert mode enabled - attach debug info to error response
          const result = service.attachDebugInfo(errorResponse, debugInfo);

          // Debug info should be attached to error response
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.timestamp === debugInfo.timestamp &&
            result._debug.requestId === debugInfo.requestId &&
            result._debug.operation === debugInfo.operation &&
            // Original error fields should be preserved
            result.error === errorResponse.error &&
            result.statusCode === errorResponse.statusCode
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info with error details to error responses', () => {
    const service = new ExpertModeService();

    // Generator for debug info with errors
    const debugInfoWithErrorsArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      errors: fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          stack: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
          code: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
          level: fc.constant('error' as const),
        }),
        { minLength: 1, maxLength: 5 }
      ),
    });

    fc.assert(
      fc.property(
        errorResponseArb,
        debugInfoWithErrorsArb,
        (errorResponse, debugInfo) => {
          const result = service.attachDebugInfo(errorResponse, debugInfo);

          // Debug info should include error details
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            Array.isArray(result._debug.errors) &&
            result._debug.errors.length > 0 &&
            result._debug.errors.every(err =>
              typeof err.message === 'string' &&
              err.message.length > 0 &&
              err.level === 'error'
            )
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve all response fields when attaching debug info', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.oneof(successResponseArb, errorResponseArb),
        debugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // All original fields should be preserved
          const originalKeys = Object.keys(responseData);
          return originalKeys.every(key => key in result && result[key] === responseData[key]);
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info to responses with various status codes', () => {
    const service = new ExpertModeService();

    // Generator for responses with different status codes
    const responseWithStatusArb = fc.record({
      statusCode: fc.constantFrom(200, 201, 204, 400, 401, 403, 404, 500, 502, 503),
      data: fc.option(fc.anything()),
      error: fc.option(fc.string()),
      message: fc.string(),
    });

    fc.assert(
      fc.property(
        responseWithStatusArb,
        debugInfoArb,
        (response, debugInfo) => {
          const result = service.attachDebugInfo(response, debugInfo);

          // Debug info should be attached regardless of status code
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result.statusCode === response.statusCode
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info with all log levels (error, warn, info, debug)', () => {
    const service = new ExpertModeService();

    // Generator for debug info with all log levels
    const completeDebugInfoArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      errors: fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          level: fc.constant('error' as const),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      warnings: fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          level: fc.constant('warn' as const),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      info: fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          level: fc.constant('info' as const),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      debug: fc.array(
        fc.record({
          message: fc.string({ minLength: 5, maxLength: 100 }),
          level: fc.constant('debug' as const),
        }),
        { minLength: 1, maxLength: 3 }
      ),
    });

    fc.assert(
      fc.property(
        successResponseArb,
        completeDebugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should include all log levels
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            Array.isArray(result._debug.errors) &&
            result._debug.errors.length > 0 &&
            Array.isArray(result._debug.warnings) &&
            result._debug.warnings.length > 0 &&
            Array.isArray(result._debug.info) &&
            result._debug.info.length > 0 &&
            Array.isArray(result._debug.debug) &&
            result._debug.debug.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info consistently across multiple response types', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.array(fc.oneof(successResponseArb, errorResponseArb), { minLength: 2, maxLength: 10 }),
        debugInfoArb,
        (responses, debugInfo) => {
          // Attach debug info to all responses
          const results = responses.map(response => service.attachDebugInfo(response, debugInfo));

          // All results should have debug info attached
          return results.every(result =>
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.requestId === debugInfo.requestId
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info with performance metrics when provided', () => {
    const service = new ExpertModeService();

    // Generator for debug info with performance metrics
    const debugInfoWithPerformanceArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      performance: fc.record({
        memoryUsage: fc.integer({ min: 0, max: 1024 * 1024 * 1024 }),
        cpuUsage: fc.float({ min: 0, max: 100 }),
        activeConnections: fc.integer({ min: 0, max: 1000 }),
        cacheStats: fc.record({
          hits: fc.integer({ min: 0, max: 10000 }),
          misses: fc.integer({ min: 0, max: 10000 }),
          size: fc.integer({ min: 0, max: 1000 }),
          hitRate: fc.float({ min: 0, max: 1 }),
        }),
        requestStats: fc.record({
          total: fc.integer({ min: 0, max: 100000 }),
          avgDuration: fc.float({ min: 0, max: 5000 }),
          p95Duration: fc.float({ min: 0, max: 10000 }),
          p99Duration: fc.float({ min: 0, max: 20000 }),
        }),
      }),
    });

    fc.assert(
      fc.property(
        successResponseArb,
        debugInfoWithPerformanceArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should include performance metrics
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.performance !== undefined &&
            typeof result._debug.performance.memoryUsage === 'number' &&
            typeof result._debug.performance.cpuUsage === 'number'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info with API call information when provided', () => {
    const service = new ExpertModeService();

    // Generator for debug info with API calls
    const debugInfoWithApiCallsArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      apiCalls: fc.array(
        fc.record({
          endpoint: fc.webUrl(),
          method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
          duration: fc.integer({ min: 0, max: 5000 }),
          status: fc.constantFrom(200, 201, 400, 404, 500),
          cached: fc.boolean(),
        }),
        { minLength: 1, maxLength: 10 }
      ),
    });

    fc.assert(
      fc.property(
        successResponseArb,
        debugInfoWithApiCallsArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should include API call information
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            Array.isArray(result._debug.apiCalls) &&
            result._debug.apiCalls.length > 0 &&
            result._debug.apiCalls.every(call =>
              typeof call.endpoint === 'string' &&
              typeof call.method === 'string' &&
              typeof call.duration === 'number' &&
              typeof call.status === 'number' &&
              typeof call.cached === 'boolean'
            )
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain debug info structure after attachment', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.oneof(successResponseArb, errorResponseArb),
        debugInfoArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info structure should be maintained
          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.timestamp === 'string' &&
            typeof debug.requestId === 'string' &&
            typeof debug.operation === 'string' &&
            typeof debug.duration === 'number' &&
            debug.duration >= 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info without modifying the original debug info object', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        successResponseArb,
        debugInfoArb,
        (responseData, debugInfo) => {
          // Create a deep copy of the original debug info
          const originalDebugInfo = JSON.parse(JSON.stringify(debugInfo));

          // Attach debug info
          service.attachDebugInfo(responseData, debugInfo);

          // Original debug info should not be modified
          return JSON.stringify(debugInfo) === JSON.stringify(originalDebugInfo);
        }
      ),
      propertyTestConfig
    );
  });

  it('should attach debug info with integration name when provided', () => {
    const service = new ExpertModeService();

    // Generator for debug info with integration
    const debugInfoWithIntegrationArb = fc.record({
      timestamp: fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ms => new Date(ms).toISOString()),
      requestId: fc.string({ minLength: 10, maxLength: 30 }),
      operation: fc.string({ minLength: 5, maxLength: 50 }),
      duration: fc.integer({ min: 0, max: 10000 }),
      integration: fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera'),
    });

    fc.assert(
      fc.property(
        successResponseArb,
        debugInfoWithIntegrationArb,
        (responseData, debugInfo) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should include integration name
          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.integration === debugInfo.integration
          );
        }
      ),
      propertyTestConfig
    );
  });
});
