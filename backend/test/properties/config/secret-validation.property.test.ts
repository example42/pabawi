import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ZodError } from 'zod';
import { AppConfigSchema } from '../../../src/config/schema';

/**
 * Property-Based Tests for Secret Validation
 *
 * **Validates: Requirements 1.1, 1.3**
 *
 * Property 1: Secret validation rejects missing or empty jwtSecret
 * ∀ config ∈ Configs:
 *   (config.jwtSecret = "") ⟹ AppConfigSchema.parse(config) throws ZodError
 *
 * lifecycleToken is optional (defaults to empty string) — validated at runtime by
 * createLifecycleAuth which returns 500 when unconfigured.
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
      jwtSecret: 'valid-secret-value-with-enough-entropy', // pragma: allowlist secret (>= 32 chars per C8 hardening)
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
   * lifecycleToken is optional (defaults to empty string).
   * Empty string is accepted — the runtime handles the empty case gracefully.
   */
  it('should accept empty lifecycleToken values (optional field)', () => {
    const config = buildBaseConfig({ lifecycleToken: '' });
    expect(() => AppConfigSchema.parse(config)).not.toThrow();
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
   * lifecycleToken is optional — missing (undefined) uses default empty string.
   */
  it('should accept missing lifecycleToken (undefined) using default', () => {
    const config = buildBaseConfig();
    delete (config as Record<string, unknown>)['lifecycleToken'];
    expect(() => AppConfigSchema.parse(config)).not.toThrow();
  });

  /**
   * When jwtSecret is empty, validation fails regardless of lifecycleToken value.
   * lifecycleToken alone being empty does NOT cause failure (it's optional).
   */
  it('should reject when jwtSecret is empty (lifecycleToken empty is allowed)', () => {
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
