import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { BoltService } from '../../../src/integrations/bolt/BoltService';

/**
 * Property-Based Tests for Bolt Error Categorisation
 *
 * Property 6: Bolt JSON error categorisation is deterministic
 * **Validates: Requirements 8.1, 8.2, 8.5**
 *
 * ∀ kind ∈ ERROR_KIND_MAP.keys(), ∀ msg ∈ Strings:
 *   categoriseError(JSON.stringify({ _error: { kind, msg } })).category === ERROR_KIND_MAP[kind]
 *
 * Property 7: Bolt error fallback for non-JSON input
 * **Validates: Requirements 8.3**
 *
 * ∀ s ∈ Strings where JSON.parse(s) throws:
 *   categoriseError(s) does not throw
 */
describe('Bolt Error Categorisation Properties', () => {
  let service: BoltService;
  let errorKindMap: Record<string, string>;

  beforeEach(() => {
    service = new BoltService('/tmp/bolt-test', 30000);
    errorKindMap = BoltService.getErrorKindMap();
  });

  /**
   * Property 6: Bolt JSON error categorisation is deterministic
   *
   * **Validates: Requirements 8.1, 8.2, 8.5**
   *
   * For any valid JSON string containing `_error.kind` with a value present in the
   * error kind mapping, `categoriseError()` returns the mapped category — never
   * falling through to substring matching.
   */
  it('should return the mapped category for any known _error.kind value', () => {
    const knownKinds = Object.keys(errorKindMap);

    fc.assert(
      fc.property(
        fc.constantFrom(...knownKinds),
        fc.string({ minLength: 1 }),
        fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined }),
        (kind, msg, details) => {
          const boltError = {
            _error: {
              kind,
              msg,
              ...(details !== undefined ? { details } : {}),
            },
          };
          const stderr = JSON.stringify(boltError);
          const result = service.categoriseError(stderr);

          expect(result.category).toBe(errorKindMap[kind]);
          expect(result.message).toBe(msg);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Determinism sub-property: calling categoriseError twice with the same input
   * yields the same result.
   */
  it('should produce identical results for repeated calls with same input', () => {
    const knownKinds = Object.keys(errorKindMap);

    fc.assert(
      fc.property(
        fc.constantFrom(...knownKinds),
        fc.string({ minLength: 1 }),
        (kind, msg) => {
          const stderr = JSON.stringify({ _error: { kind, msg } });
          const result1 = service.categoriseError(stderr);
          const result2 = service.categoriseError(stderr);

          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Bolt error fallback for non-JSON input
   *
   * **Validates: Requirements 8.3**
   *
   * For any string that is not valid JSON, `categoriseError()` uses the
   * substring-matching fallback and never throws.
   */
  it('should never throw for non-JSON input strings', () => {
    const nonJsonString = fc.string().filter((s) => {
      try {
        JSON.parse(s);
        return false;
      } catch {
        return true;
      }
    });

    fc.assert(
      fc.property(nonJsonString, (stderr) => {
        expect(() => service.categoriseError(stderr)).not.toThrow();
        const result = service.categoriseError(stderr);
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('message');
        expect(typeof result.category).toBe('string');
        expect(typeof result.message).toBe('string');
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Non-JSON input always returns the original stderr as the message
   * (substring fallback preserves the input).
   */
  it('should return the original string as message for non-JSON input', () => {
    const nonJsonString = fc.string({ minLength: 1 }).filter((s) => {
      try {
        JSON.parse(s);
        return false;
      } catch {
        return true;
      }
    });

    fc.assert(
      fc.property(nonJsonString, (stderr) => {
        const result = service.categoriseError(stderr);
        expect(result.message).toBe(stderr);
      }),
      { numRuns: 100 }
    );
  });
});
