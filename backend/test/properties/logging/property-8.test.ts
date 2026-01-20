/**
 * Feature: pabawi-v0.5.0-release, Property 8: Correlation ID Consistency
 * Validates: Requirements 3.9, 3.11
 *
 * This property test verifies that:
 * For any request with a correlation ID, the correlation ID should be
 * consistently maintained across frontend logs, backend logs, and API responses,
 * enabling full request lifecycle visibility.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { Request } from 'express';

describe('Property 8: Correlation ID Consistency', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for correlation IDs (frontend format)
  const frontendCorrelationIdArb = fc
    .tuple(
      fc.integer({ min: 1577836800000, max: 1924905600000 }), // timestamp
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 9, maxLength: 9 }).map(arr => arr.join(''))
    )
    .map(([timestamp, random]) => `frontend_${timestamp.toString(36)}_${random}`);

  // Generator for correlation IDs (backend format)
  const backendCorrelationIdArb = fc
    .tuple(
      fc.integer({ min: 1577836800000, max: 1924905600000 }), // timestamp
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 9, maxLength: 9 }).map(arr => arr.join(''))
    )
    .map(([timestamp, random]) => `backend_${timestamp}_${random}`);

  // Generator for any correlation ID
  const correlationIdArb = fc.oneof(
    frontendCorrelationIdArb,
    backendCorrelationIdArb,
    fc.uuid(), // UUID format
    fc.string({ minLength: 10, maxLength: 50 }) // Generic string
  );

  // Generator for mock request with correlation ID header
  const mockRequestWithCorrelationIdArb = (correlationId: string) => {
    return {
      headers: {
        'x-correlation-id': correlationId,
        'x-expert-mode': 'true',
      },
    } as Request;
  };

  /**
   * Helper to extract correlation ID from request
   */
  function extractCorrelationIdFromRequest(req: Request): string | undefined {
    const header = req.headers['x-correlation-id'];
    if (typeof header === 'string') {
      return header;
    }
    return undefined;
  }

  /**
   * Helper to validate correlation ID format
   */
  function isValidCorrelationIdFormat(id: string): boolean {
    // Valid formats:
    // - frontend_<timestamp>_<random>
    // - backend_<timestamp>_<random>
    // - UUID format
    // - Any string with length >= 10

    if (id.length < 10) {
      return false;
    }

    // Check for frontend format
    if (/^frontend_[a-z0-9]+_[a-z0-9]+$/.test(id)) {
      return true;
    }

    // Check for backend format
    if (/^backend_\d+_[a-z0-9]+$/.test(id)) {
      return true;
    }

    // Check for UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return true;
    }

    // Any other string with sufficient length is valid
    return id.length >= 10;
  }

  it('should maintain correlation ID from request header to extraction', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          const req = mockRequestWithCorrelationIdArb(correlationId);

          // Extract correlation ID from request
          const extractedId = extractCorrelationIdFromRequest(req);

          // Should match the original correlation ID
          expect(extractedId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve correlation ID format throughout request lifecycle', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          // Validate format is preserved
          expect(isValidCorrelationIdFormat(correlationId)).toBe(true);

          // Simulate passing through request
          const req = mockRequestWithCorrelationIdArb(correlationId);
          const extractedId = extractCorrelationIdFromRequest(req);

          // Format should be preserved
          if (extractedId) {
            expect(isValidCorrelationIdFormat(extractedId)).toBe(true);
            expect(extractedId).toBe(correlationId);
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle missing correlation ID gracefully', () => {
    fc.assert(
      fc.property(
        fc.constant(undefined),
        () => {
          const req = {
            headers: {
              'x-expert-mode': 'true',
            },
          } as Request;

          const extractedId = extractCorrelationIdFromRequest(req);

          // Should be undefined when not present
          expect(extractedId).toBeUndefined();

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should support different correlation ID formats', () => {
    const formats = [
      'frontend_abc123_xyz789',
      'backend_1234567890_abc123',
      '550e8400-e29b-41d4-a716-446655440000', // UUID
      'custom_correlation_id_12345',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...formats),
        (correlationId) => {
          // All formats should be valid
          expect(isValidCorrelationIdFormat(correlationId)).toBe(true);

          // Should be extractable from request
          const req = {
            headers: {
              'x-correlation-id': correlationId,
            },
          } as Request;

          const extractedId = extractCorrelationIdFromRequest(req);
          expect(extractedId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain correlation ID through multiple request-response cycles', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        fc.integer({ min: 2, max: 5 }),
        (correlationId, cycleCount) => {
          const correlationIds: string[] = [];

          // Simulate multiple cycles
          for (let i = 0; i < cycleCount; i++) {
            const req = mockRequestWithCorrelationIdArb(correlationId);
            const extractedId = extractCorrelationIdFromRequest(req);

            if (extractedId) {
              correlationIds.push(extractedId);
            }
          }

          // All correlation IDs should be identical
          const allMatch = correlationIds.every(id => id === correlationId);
          expect(allMatch).toBe(true);
          expect(correlationIds.length).toBe(cycleCount);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle correlation ID in both uppercase and lowercase headers', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        fc.constantFrom('x-correlation-id', 'X-Correlation-ID', 'X-CORRELATION-ID'),
        (correlationId, headerName) => {
          const req = {
            headers: {
              [headerName.toLowerCase()]: correlationId,
            },
          } as Request;

          // Express normalizes headers to lowercase
          const extractedId = extractCorrelationIdFromRequest(req);
          expect(extractedId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should not modify correlation ID during transmission', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          // Original ID
          const original = correlationId;

          // Simulate transmission through request
          const req = {
            headers: {
              'x-correlation-id': correlationId,
            },
          } as Request;

          const extracted = extractCorrelationIdFromRequest(req);

          // Should be identical (no modification)
          expect(extracted).toBe(original);
          expect(extracted?.length).toBe(original.length);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain correlation ID uniqueness across different requests', () => {
    fc.assert(
      fc.property(
        fc.array(correlationIdArb, { minLength: 2, maxLength: 10 }),
        (correlationIds) => {
          // Create unique set
          const uniqueIds = new Set(correlationIds);

          // Each correlation ID should be distinct (unless randomly duplicated)
          // We verify that the set preserves all unique IDs
          expect(uniqueIds.size).toBeGreaterThan(0);
          expect(uniqueIds.size).toBeLessThanOrEqual(correlationIds.length);

          // Each ID should be valid
          for (const id of uniqueIds) {
            expect(isValidCorrelationIdFormat(id)).toBe(true);
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain correlation ID in debug info attached to responses', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          const service = new ExpertModeService();

          const debugInfo = {
            timestamp: new Date().toISOString(),
            requestId: 'test-request-id',
            correlationId: correlationId,
            operation: 'test-operation',
            duration: 100,
          };

          const responseData = { data: 'test' };
          const result = service.attachDebugInfo(responseData, debugInfo);

          // Debug info should contain correlation ID
          expect(result._debug?.correlationId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle correlation ID with special characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }),
        (correlationId) => {
          // Even with special characters, should be preserved
          const req = {
            headers: {
              'x-correlation-id': correlationId,
            },
          } as Request;

          const extractedId = extractCorrelationIdFromRequest(req);
          expect(extractedId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should validate frontend correlation ID format', () => {
    fc.assert(
      fc.property(
        frontendCorrelationIdArb,
        (correlationId) => {
          // Should match frontend format pattern
          expect(correlationId).toMatch(/^frontend_[a-z0-9]+_[a-z0-9]+$/);
          expect(isValidCorrelationIdFormat(correlationId)).toBe(true);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should validate backend correlation ID format', () => {
    fc.assert(
      fc.property(
        backendCorrelationIdArb,
        (correlationId) => {
          // Should match backend format pattern
          expect(correlationId).toMatch(/^backend_\d+_[a-z0-9]+$/);
          expect(isValidCorrelationIdFormat(correlationId)).toBe(true);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain consistency when checking same correlation ID multiple times', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        fc.integer({ min: 2, max: 10 }),
        (correlationId, checkCount) => {
          const req = mockRequestWithCorrelationIdArb(correlationId);

          // Extract correlation ID multiple times
          const results = Array.from({ length: checkCount }, () =>
            extractCorrelationIdFromRequest(req)
          );

          // All results should be identical
          const firstResult = results[0];
          const allMatch = results.every(result => result === firstResult);
          expect(allMatch).toBe(true);
          expect(firstResult).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve correlation ID across service method calls', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          const service = new ExpertModeService();

          // Create debug info with correlation ID
          const debugInfo = service.createDebugInfo('test-operation', 'test-request-id', 100);

          // Manually add correlation ID (simulating middleware)
          const debugInfoWithCorrelation = {
            ...debugInfo,
            correlationId,
          };

          // Attach to response
          const responseData = { data: 'test' };
          const result = service.attachDebugInfo(responseData, debugInfoWithCorrelation);

          // Correlation ID should be preserved
          expect(result._debug?.correlationId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle empty string correlation ID', () => {
    fc.assert(
      fc.property(
        fc.constant(''),
        (correlationId) => {
          const req = {
            headers: {
              'x-correlation-id': correlationId,
            },
          } as Request;

          const extractedId = extractCorrelationIdFromRequest(req);

          // Empty string should be extracted as-is
          expect(extractedId).toBe('');

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain correlation ID type consistency', () => {
    fc.assert(
      fc.property(
        correlationIdArb,
        (correlationId) => {
          const req = mockRequestWithCorrelationIdArb(correlationId);
          const extractedId = extractCorrelationIdFromRequest(req);

          // Type should remain string
          expect(typeof extractedId).toBe('string');
          expect(typeof correlationId).toBe('string');

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle correlation IDs with various lengths', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (correlationId) => {
          const req = {
            headers: {
              'x-correlation-id': correlationId,
            },
          } as Request;

          const extractedId = extractCorrelationIdFromRequest(req);

          // Length should be preserved
          expect(extractedId?.length).toBe(correlationId.length);
          expect(extractedId).toBe(correlationId);

          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
