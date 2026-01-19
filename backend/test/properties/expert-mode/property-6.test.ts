/**
 * Feature: pabawi-v0.5.0-release, Property 6: Debug Info Completeness
 * Validates: Requirements 3.4
 *
 * This property test verifies that:
 * For any debug information object when expert mode is enabled, it should include
 * all required fields: timestamp, requestId, operation, duration, and any relevant
 * apiCalls or errors.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { DebugInfo, ApiCallInfo, ErrorInfo } from '../../../src/services/ExpertModeService';

describe('Property 6: Debug Info Completeness', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid timestamps
  const timestampArb = fc
    .integer({ min: 1577836800000, max: 1924905600000 })
    .map(ms => new Date(ms).toISOString());

  // Generator for request IDs
  const requestIdArb = fc.string({ minLength: 10, maxLength: 50 });

  // Generator for operation names
  const operationArb = fc.string({ minLength: 5, maxLength: 100 });

  // Generator for durations (in milliseconds)
  const durationArb = fc.integer({ min: 0, max: 60000 });

  // Generator for API call info
  const apiCallInfoArb: fc.Arbitrary<ApiCallInfo> = fc.record({
    endpoint: fc.webUrl(),
    method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
    duration: fc.integer({ min: 0, max: 10000 }),
    status: fc.constantFrom(200, 201, 204, 400, 401, 403, 404, 500, 502, 503),
    cached: fc.boolean(),
  });

  // Generator for error info
  const errorInfoArb: fc.Arbitrary<ErrorInfo> = fc.record({
    message: fc.string({ minLength: 5, maxLength: 200 }),
    stack: fc.option(fc.string({ minLength: 10, maxLength: 500 })),
    code: fc.option(fc.string({ minLength: 3, maxLength: 30 })),
  });

  // Generator for complete debug info with all required fields
  const completeDebugInfoArb: fc.Arbitrary<DebugInfo> = fc.record({
    timestamp: timestampArb,
    requestId: requestIdArb,
    operation: operationArb,
    duration: durationArb,
    integration: fc.option(fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera')),
    cacheHit: fc.option(fc.boolean()),
    apiCalls: fc.option(fc.array(apiCallInfoArb, { minLength: 0, maxLength: 20 })),
    errors: fc.option(fc.array(errorInfoArb, { minLength: 0, maxLength: 10 })),
    metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
  });

  it('should always include all required fields in debug info', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Verify all required fields are present
          const debug = result._debug;
          if (!debug) return false;

          const hasTimestamp = typeof debug.timestamp === 'string' && debug.timestamp.length > 0;
          const hasRequestId = typeof debug.requestId === 'string' && debug.requestId.length > 0;
          const hasOperation = typeof debug.operation === 'string' && debug.operation.length > 0;
          const hasDuration = typeof debug.duration === 'number' && debug.duration >= 0;

          return hasTimestamp && hasRequestId && hasOperation && hasDuration;
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve timestamp format as ISO 8601 string', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // Verify timestamp is a valid ISO 8601 string
          const timestamp = debug.timestamp;
          const parsedDate = new Date(timestamp);

          return (
            typeof timestamp === 'string' &&
            !isNaN(parsedDate.getTime()) &&
            timestamp === parsedDate.toISOString()
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve requestId as non-empty string', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.requestId === 'string' &&
            debug.requestId.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve operation as non-empty string', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.operation === 'string' &&
            debug.operation.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve duration as non-negative number', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          return (
            typeof debug.duration === 'number' &&
            debug.duration >= 0 &&
            Number.isFinite(debug.duration)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve apiCalls array when present', () => {
    const service = new ExpertModeService();

    // Generator for debug info with apiCalls
    const debugInfoWithApiCallsArb = fc.record({
      timestamp: timestampArb,
      requestId: requestIdArb,
      operation: operationArb,
      duration: durationArb,
      apiCalls: fc.array(apiCallInfoArb, { minLength: 1, maxLength: 10 }),
    });

    fc.assert(
      fc.property(
        debugInfoWithApiCallsArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // apiCalls should be present and be an array
          return (
            Array.isArray(debug.apiCalls) &&
            debug.apiCalls.length > 0 &&
            debug.apiCalls.every(call =>
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

  it('should preserve errors array when present', () => {
    const service = new ExpertModeService();

    // Generator for debug info with errors
    const debugInfoWithErrorsArb = fc.record({
      timestamp: timestampArb,
      requestId: requestIdArb,
      operation: operationArb,
      duration: durationArb,
      errors: fc.array(errorInfoArb, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(
        debugInfoWithErrorsArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // errors should be present and be an array
          return (
            Array.isArray(debug.errors) &&
            debug.errors.length > 0 &&
            debug.errors.every(error =>
              typeof error.message === 'string' &&
              error.message.length > 0
            )
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve optional fields when present', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        completeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // Check that optional fields are preserved if they were in the input
          let allOptionalFieldsPreserved = true;

          if (debugInfo.integration !== undefined) {
            allOptionalFieldsPreserved = allOptionalFieldsPreserved && debug.integration === debugInfo.integration;
          }

          if (debugInfo.cacheHit !== undefined) {
            allOptionalFieldsPreserved = allOptionalFieldsPreserved && debug.cacheHit === debugInfo.cacheHit;
          }

          if (debugInfo.apiCalls !== undefined) {
            allOptionalFieldsPreserved = allOptionalFieldsPreserved && debug.apiCalls !== undefined;
          }

          if (debugInfo.errors !== undefined) {
            allOptionalFieldsPreserved = allOptionalFieldsPreserved && debug.errors !== undefined;
          }

          if (debugInfo.metadata !== undefined) {
            allOptionalFieldsPreserved = allOptionalFieldsPreserved && debug.metadata !== undefined;
          }

          return allOptionalFieldsPreserved;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness even with minimal debug info', () => {
    const service = new ExpertModeService();

    // Generator for minimal debug info (only required fields)
    const minimalDebugInfoArb = fc.record({
      timestamp: timestampArb,
      requestId: requestIdArb,
      operation: operationArb,
      duration: durationArb,
    });

    fc.assert(
      fc.property(
        minimalDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // Even minimal debug info should have all required fields
          return (
            typeof debug.timestamp === 'string' &&
            typeof debug.requestId === 'string' &&
            typeof debug.operation === 'string' &&
            typeof debug.duration === 'number'
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness after truncation', () => {
    const service = new ExpertModeService();

    // Generator for very large debug info that will be truncated
    const largeDebugInfoArb = fc.record({
      timestamp: timestampArb,
      requestId: requestIdArb,
      operation: operationArb,
      duration: durationArb,
      metadata: fc.constant({
        largeData: 'x'.repeat(2 * 1024 * 1024), // 2MB of data
      }),
    });

    fc.assert(
      fc.property(
        largeDebugInfoArb,
        fc.record({ data: fc.anything() }),
        (debugInfo, responseData) => {
          const result = service.attachDebugInfo(responseData, debugInfo);

          const debug = result._debug;
          if (!debug) return false;

          // Even after truncation, all required fields must be present
          const hasRequiredFields = (
            typeof debug.timestamp === 'string' &&
            typeof debug.requestId === 'string' &&
            typeof debug.operation === 'string' &&
            typeof debug.duration === 'number'
          );

          // If truncated, should have truncation metadata
          if (debug.metadata && '_truncated' in debug.metadata) {
            return (
              hasRequiredFields &&
              debug.metadata._truncated === true &&
              typeof debug.metadata._originalSize === 'number' &&
              typeof debug.metadata._maxSize === 'number'
            );
          }

          return hasRequiredFields;
        }
      ),
      propertyTestConfig
    );
  });

  it('should validate completeness using createDebugInfo helper', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationArb,
        requestIdArb,
        durationArb,
        (operation, requestId, duration) => {
          const debugInfo = service.createDebugInfo(operation, requestId, duration);

          // Created debug info should have all required fields
          return (
            typeof debugInfo.timestamp === 'string' &&
            debugInfo.timestamp.length > 0 &&
            debugInfo.requestId === requestId &&
            debugInfo.operation === operation &&
            debugInfo.duration === duration
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness when adding API calls', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationArb,
        requestIdArb,
        durationArb,
        fc.array(apiCallInfoArb, { minLength: 1, maxLength: 10 }),
        (operation, requestId, duration, apiCalls) => {
          const debugInfo = service.createDebugInfo(operation, requestId, duration);

          // Add API calls
          apiCalls.forEach(call => service.addApiCall(debugInfo, call));

          // Required fields should still be present
          return (
            typeof debugInfo.timestamp === 'string' &&
            debugInfo.requestId === requestId &&
            debugInfo.operation === operation &&
            debugInfo.duration === duration &&
            Array.isArray(debugInfo.apiCalls) &&
            debugInfo.apiCalls.length === apiCalls.length
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness when adding errors', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationArb,
        requestIdArb,
        durationArb,
        fc.array(errorInfoArb, { minLength: 1, maxLength: 5 }),
        (operation, requestId, duration, errors) => {
          const debugInfo = service.createDebugInfo(operation, requestId, duration);

          // Add errors
          errors.forEach(error => service.addError(debugInfo, error));

          // Required fields should still be present
          return (
            typeof debugInfo.timestamp === 'string' &&
            debugInfo.requestId === requestId &&
            debugInfo.operation === operation &&
            debugInfo.duration === duration &&
            Array.isArray(debugInfo.errors) &&
            debugInfo.errors.length === errors.length
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness when adding metadata', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationArb,
        requestIdArb,
        durationArb,
        fc.array(fc.tuple(fc.string(), fc.anything()), { minLength: 1, maxLength: 10 }),
        (operation, requestId, duration, metadataEntries) => {
          const debugInfo = service.createDebugInfo(operation, requestId, duration);

          // Add metadata
          metadataEntries.forEach(([key, value]) => service.addMetadata(debugInfo, key, value));

          // Required fields should still be present
          const hasRequiredFields = (
            typeof debugInfo.timestamp === 'string' &&
            debugInfo.requestId === requestId &&
            debugInfo.operation === operation &&
            debugInfo.duration === duration &&
            debugInfo.metadata !== undefined
          );

          // Count unique keys (since duplicate keys will overwrite)
          const uniqueKeys = new Set(metadataEntries.map(([key]) => key));
          const expectedCount = uniqueKeys.size;

          return (
            hasRequiredFields &&
            Object.keys(debugInfo.metadata).length === expectedCount
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should generate unique request IDs', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        (count) => {
          const requestIds = new Set<string>();

          for (let i = 0; i < count; i++) {
            const requestId = service.generateRequestId();
            requestIds.add(requestId);
          }

          // All generated request IDs should be unique
          return requestIds.size === count;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain completeness across multiple operations', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        operationArb,
        requestIdArb,
        durationArb,
        fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera'),
        fc.boolean(),
        (operation, requestId, duration, integration, cacheHit) => {
          const debugInfo = service.createDebugInfo(operation, requestId, duration);

          // Perform multiple operations
          service.setIntegration(debugInfo, integration);
          service.setCacheHit(debugInfo, cacheHit);

          // All fields should be present
          return (
            typeof debugInfo.timestamp === 'string' &&
            debugInfo.requestId === requestId &&
            debugInfo.operation === operation &&
            debugInfo.duration === duration &&
            debugInfo.integration === integration &&
            debugInfo.cacheHit === cacheHit
          );
        }
      ),
      propertyTestConfig
    );
  });
});
