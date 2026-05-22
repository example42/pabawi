import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { ConfigService } from "../../../src/config/ConfigService";

/**
 * Property-Based Tests for Secret Round-Trip
 *
 * **Validates: Requirements 1.2**
 *
 * Property 2: Secret round-trip through ConfigService
 * ∀ s ∈ NonEmptyStrings:
 *   setEnv("JWT_SECRET", s) → ConfigService.getJwtSecret() === s
 *   setEnv("PABAWI_LIFECYCLE_TOKEN", s) → ConfigService.getLifecycleToken() === s
 *
 * This property validates that ConfigService faithfully preserves
 * secret values without mutation, trimming, or encoding changes.
 */
describe("Property 2: Secret round-trip through ConfigService", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.JWT_SECRET = process.env.JWT_SECRET;
    originalEnv.PABAWI_LIFECYCLE_TOKEN = process.env.PABAWI_LIFECYCLE_TOKEN;
    originalEnv.NODE_ENV = process.env.NODE_ENV;
    // Prevent dotenv from loading .env file during tests
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.PABAWI_LIFECYCLE_TOKEN = originalEnv.PABAWI_LIFECYCLE_TOKEN;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
  });

  /**
   * Property 2a: JWT secret round-trip
   *
   * **Validates: Requirements 1.2**
   *
   * For any non-empty string set as JWT_SECRET, getJwtSecret() returns
   * that exact string unchanged.
   */
  it("getJwtSecret() returns the exact value set in JWT_SECRET env var", () => {
    fc.assert(
      fc.property(
        // JWT_SECRET must be ≥ 32 chars and not match the placeholder regexes (per C8 hardening).
        fc
          .string({ minLength: 32 })
          .filter((s) => s.trim().length >= 32)
          .filter((s) => !/your-secure-random-secret-here/i.test(s) && !/change[-_ ]?me/i.test(s)),
        (secret) => {
          process.env.JWT_SECRET = secret;
          process.env.PABAWI_LIFECYCLE_TOKEN = "placeholder-token";

          const configService = new ConfigService();
          expect(configService.getJwtSecret()).toBe(secret);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2b: Lifecycle token round-trip
   *
   * **Validates: Requirements 1.2**
   *
   * For any non-empty string set as PABAWI_LIFECYCLE_TOKEN,
   * getLifecycleToken() returns that exact string unchanged.
   */
  it("getLifecycleToken() returns the exact value set in PABAWI_LIFECYCLE_TOKEN env var", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (token) => {
          process.env.JWT_SECRET = "placeholder-secret-padded-for-tests-32"; // pragma: allowlist secret (>= 32 chars per C8 hardening)
          process.env.PABAWI_LIFECYCLE_TOKEN = token;

          const configService = new ConfigService();
          expect(configService.getLifecycleToken()).toBe(token);
        },
      ),
      { numRuns: 100 },
    );
  });
});
