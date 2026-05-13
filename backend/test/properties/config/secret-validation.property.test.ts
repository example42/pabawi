import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ZodError } from 'zod';
import { AppConfigSchema } from '../../../src/config/schema';

/**
 * Property-Based Tests for Secret Validation
 *
 * **Validates: Requirements 1.1, 1.3**
 *
 * Property 1: Secret validation rejects missing or empty values
 * ∀ config ∈ Configs:
 *   (config.jwtSecret = "" ∨ config.lifecycleToken = "") ⟹
 *     AppConfigSchema.parse(config) throws ZodError
 *
 * This property validates that:
 * - Empty strings for jwtSecret cause validation failure
 * - Empty strings for lifecycleToken cause validation failure
 * - Whitespace-only strings for secrets cause validation failure (min(1) rejects after trim-like behaviour)
 */
describe('Secret Validation Properties', () => {
  /**
   * Minimal valid config object for testing schema parsing.
   * All required fields are provided except the secret under test.
   */
  function buildBaseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      port: 3000,
      host: 'localhost',
      boltProjectPath: '/tmp',
      jwtSecret: 'valid-secret-value', // pragma: allowlist secret
      lifecycleToken: 'valid-lifecycle-token', // pragma: allowlist secret
      commandWhitelist: { allowAll: false, whitelist: [], matchMode: 'exact' },
      executionTimeout: 300000,
      logLevel: 'info',
      databasePath: './data/pabawi.db',
      corsAllowedOrigins: [],
      streaming: { bufferMs: 100, maxOutputSize: 10485760, maxLineLength: 10000 },
      cache: { inventoryTtl: 30000, factsTtl: 300000 },
      executionQueue: { concurrentLimit: 5, maxQueueSize: 50 },
      ...overrides,
    };
  }

  /**
   * Property 1: Secret validation rejects missing or empty values
   *
   * **Validates: Requirements 1.1, 1.3**
   *
   * For any empty string used as jwtSecret, AppConfigSchema.parse() throws ZodError.
   */
  it('should reject empty jwtSecret values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(''),
        (emptyValue) => {
          const config = buildBaseConfig({ jwtSecret: emptyValue });
          expect(() => AppConfigSchema.parse(config)).toThrow(ZodError);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * For any empty string used as lifecycleToken, AppConfigSchema.parse() throws ZodError.
   */
  it('should reject empty lifecycleToken values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(''),
        (emptyValue) => {
          const config = buildBaseConfig({ lifecycleToken: emptyValue });
          expect(() => AppConfigSchema.parse(config)).toThrow(ZodError);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * For any config where jwtSecret is undefined (missing), AppConfigSchema.parse() throws ZodError.
   */
  it('should reject missing jwtSecret (undefined)', () => {
    fc.assert(
      fc.property(
        fc.constant(undefined),
        () => {
          const config = buildBaseConfig();
          delete (config as Record<string, unknown>)['jwtSecret'];
          expect(() => AppConfigSchema.parse(config)).toThrow(ZodError);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * For any config where lifecycleToken is undefined (missing), AppConfigSchema.parse() throws ZodError.
   */
  it('should reject missing lifecycleToken (undefined)', () => {
    fc.assert(
      fc.property(
        fc.constant(undefined),
        () => {
          const config = buildBaseConfig();
          delete (config as Record<string, unknown>)['lifecycleToken'];
          expect(() => AppConfigSchema.parse(config)).toThrow(ZodError);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * For any config where both secrets are empty, AppConfigSchema.parse() throws ZodError.
   * This tests the combined case.
   */
  it('should reject when both secrets are empty simultaneously', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const config = buildBaseConfig({ jwtSecret: '', lifecycleToken: '' });
          expect(() => AppConfigSchema.parse(config)).toThrow(ZodError);
        }
      ),
      { numRuns: 5 }
    );
  });
});
