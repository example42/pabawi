import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { CheckmkConfigSchema } from "../../src/config/schema";
import { ConfigService } from "../../src/config/ConfigService";

/**
 * Property-Based Tests for Checkmk Configuration Parsing
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.7**
 *
 * Tests the three correctness properties from the design document:
 * - Property 1: Plugin registration correctness
 * - Property 2: Server URL validation
 * - Property 3: SSL verify parsing
 */

/**
 * Base env vars required for ConfigService to construct without throwing
 * on unrelated validation (JWT secret, bolt path, etc.).
 */
const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  JWT_SECRET: "test-secret-value-with-enough-entropy-for-validation", // pragma: allowlist secret
  BOLT_PROJECT_PATH: "/tmp",
  LOG_LEVEL: "info",
  DATABASE_PATH: "./data/test.db",
};

/**
 * Checkmk env vars that form a valid complete configuration.
 */
const VALID_CHECKMK_ENV: Record<string, string> = {
  CHECKMK_ENABLED: "true",
  CHECKMK_SERVER_URL: "https://monitoring.example.com",
  CHECKMK_SITE: "mysite",
  CHECKMK_USERNAME: "automation",
  CHECKMK_PASSWORD: "secret123", // pragma: allowlist secret
};

/**
 * All CHECKMK_* env var keys that might be set during tests.
 */
const CHECKMK_ENV_KEYS = [
  "CHECKMK_ENABLED",
  "CHECKMK_SERVER_URL",
  "CHECKMK_SITE",
  "CHECKMK_USERNAME",
  "CHECKMK_PASSWORD",
  "CHECKMK_SSL_VERIFY",
  "CHECKMK_LIVESTATUS_HOST",
  "CHECKMK_LIVESTATUS_PORT",
  "CHECKMK_LIVESTATUS_TLS",
  "CHECKMK_LIVESTATUS_TIMEOUT_MS",
  "CHECKMK_HEALTHCHECK_INTERVAL_MS",
];

/**
 * Helper: set env vars, construct ConfigService, return checkmk config.
 * Cleans up all CHECKMK_* vars before setting the provided ones.
 */
function parseCheckmkConfig(
  envOverrides: Record<string, string | undefined>,
): { enabled: boolean; serverUrl: string; site?: string; username: string; password: string; sslVerify: boolean } | null { // pragma: allowlist secret
  // Clear all checkmk env vars
  for (const key of CHECKMK_ENV_KEYS) {
    delete process.env[key];
  }

  // Set base env
  for (const [key, value] of Object.entries(BASE_ENV)) {
    process.env[key] = value;
  }

  // Set overrides (undefined means unset)
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const configService = new ConfigService();
  return configService.getCheckmkConfig();
}

describe("Checkmk Configuration Properties", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save current env state for all keys we might touch
    for (const key of [...Object.keys(BASE_ENV), ...CHECKMK_ENV_KEYS]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env state
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  /**
   * Property 1: Plugin registration correctness
   *
   * **Validates: Requirements 1.2, 1.3, 1.4**
   *
   * For any combination of environment variable values, the Checkmk plugin
   * SHALL be registered with the IntegrationManager if and only if
   * CHECKMK_ENABLED is exactly the string "true" AND CHECKMK_SERVER_URL,
   * CHECKMK_USERNAME, and CHECKMK_PASSWORD are all non-empty
   * strings. CHECKMK_SITE is optional. In all other cases, the plugin
   * SHALL NOT be registered.
   */
  describe("Property 1: Plugin registration correctness", () => {
    /**
     * Arbitrary for CHECKMK_ENABLED values that are NOT exactly "true".
     * Includes undefined, empty string, "True", "TRUE", "false", "1", "yes", etc.
     */
    const nonTrueEnabledArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.constant("false"),
      fc.constant("True"),
      fc.constant("TRUE"),
      fc.constant("1"),
      fc.constant("yes"),
      fc.constant("tru"),
      fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/).filter((s) => s !== "true"),
    );

    /**
     * Arbitrary for non-empty strings suitable as env var values.
     */
    const nonEmptyStringArb = fc.stringMatching(/^[a-zA-Z0-9._\-/]{1,50}$/).filter(
      (s) => s.length > 0,
    );

    /**
     * Arbitrary for empty-or-undefined values (falsy in the `!value` check).
     */
    const emptyOrUndefinedArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
    );

    it("registers when CHECKMK_ENABLED='true' and all required vars are non-empty", () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          (username, password) => { // pragma: allowlist secret
            const config = parseCheckmkConfig({
              CHECKMK_ENABLED: "true",
              CHECKMK_SERVER_URL: "https://monitoring.example.com",
              CHECKMK_USERNAME: username,
              CHECKMK_PASSWORD: password, // pragma: allowlist secret
            });

            expect(config).not.toBeNull();
            expect(config?.enabled).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("does NOT register when CHECKMK_ENABLED is not exactly 'true'", () => {
      fc.assert(
        fc.property(nonTrueEnabledArb, (enabledValue) => {
          const env: Record<string, string | undefined> = {
            ...VALID_CHECKMK_ENV,
            CHECKMK_ENABLED: enabledValue,
          };

          const config = parseCheckmkConfig(env);
          expect(config).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("does NOT register when any required var is missing or empty", () => {
      const requiredVars = [
        "CHECKMK_SERVER_URL",
        "CHECKMK_USERNAME",
        "CHECKMK_PASSWORD",
      ] as const;

      fc.assert(
        fc.property(
          // Pick at least one required var to make empty/undefined
          fc.subarray([...requiredVars], { minLength: 1 }),
          fc.array(emptyOrUndefinedArb, { minLength: 1, maxLength: 4 }),
          (varsToEmpty, emptyValues) => {
            const env: Record<string, string | undefined> = {
              ...VALID_CHECKMK_ENV,
            };

            // Make selected vars empty/undefined
            for (let i = 0; i < varsToEmpty.length; i++) {
              env[varsToEmpty[i]] = emptyValues[i % emptyValues.length];
            }

            const config = parseCheckmkConfig(env);
            expect(config).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Server URL validation
   *
   * **Validates: Requirements 1.5**
   *
   * For any string value of CHECKMK_SERVER_URL, the ConfigService SHALL
   * accept it if and only if it begins with "http://" or "https://",
   * contains a valid hostname, and does not exceed 2048 characters.
   * All other strings SHALL be rejected.
   *
   * Note: The actual implementation validates prefix (http:// or https://)
   * and max length (2048) via the Zod schema. We test the schema directly
   * for URL validation since ConfigService only passes the URL through
   * when the prefix check passes at the env-parsing level.
   */
  describe("Property 2: Server URL validation", () => {
    /**
     * Arbitrary for valid hostnames (simplified: alphanumeric + dots + hyphens).
     */
    const validHostnameArb = fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/),
        fc.stringMatching(/^\.[a-z][a-z0-9-]{0,10}$/),
      )
      .map(([label, domain]) => label + domain);

    /**
     * Arbitrary for valid http/https URLs within 2048 chars.
     */
    const validUrlArb = fc
      .tuple(
        fc.constantFrom("http://", "https://"),
        validHostnameArb,
        fc.constantFrom("", "/path", "/path/to/api", ":8080"),
      )
      .map(([scheme, host, suffix]) => scheme + host + suffix)
      .filter((url) => url.length <= 2048);

    /**
     * Arbitrary for URLs that exceed 2048 characters.
     */
    const tooLongUrlArb = fc
      .stringMatching(/^[a-z]{2040,2100}$/)
      .map((s) => "https://" + s + ".com");

    /**
     * Arbitrary for strings that don't start with http:// or https://.
     */
    const invalidPrefixArb = fc.oneof(
      fc.constant("ftp://example.com"),
      fc.constant("htp://example.com"),
      fc.constant("example.com"),
      fc.constant("//example.com"),
      fc.constant(""),
      fc.stringMatching(/^[a-z]{1,20}:\/\/[a-z.]+$/).filter(
        (s) => !s.startsWith("http://") && !s.startsWith("https://"),
      ),
    );

    it("accepts URLs starting with http:// or https:// within 2048 chars", () => {
      fc.assert(
        fc.property(validUrlArb, (url) => {
          const result = CheckmkConfigSchema.safeParse({
            enabled: true,
            serverUrl: url,
            site: "mysite",
            username: "user",
            password: "pass", // pragma: allowlist secret
            sslVerify: true,
          });

          expect(result.success).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it("rejects URLs not starting with http:// or https://", () => {
      fc.assert(
        fc.property(invalidPrefixArb, (url) => {
          const result = CheckmkConfigSchema.safeParse({
            enabled: true,
            serverUrl: url,
            site: "mysite",
            username: "user",
            password: "pass", // pragma: allowlist secret
            sslVerify: true,
          });

          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it("rejects URLs exceeding 2048 characters", () => {
      fc.assert(
        fc.property(tooLongUrlArb, (url) => {
          expect(url.length).toBeGreaterThan(2048);

          const result = CheckmkConfigSchema.safeParse({
            enabled: true,
            serverUrl: url,
            site: "mysite",
            username: "user",
            password: "pass", // pragma: allowlist secret
            sslVerify: true,
          });

          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 3: SSL verify parsing
   *
   * **Validates: Requirements 1.7**
   *
   * For any string value of CHECKMK_SSL_VERIFY, the resulting sslVerify
   * configuration SHALL be false if and only if the value is exactly the
   * string "false". For any other non-empty value, undefined, or empty
   * string, the result SHALL be true.
   */
  describe("Property 3: SSL verify parsing", () => {
    /**
     * Arbitrary for strings that are NOT exactly "false".
     * Includes empty, undefined, "true", "False", "FALSE", "0", random strings.
     */
    const notExactlyFalseArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.constant("true"),
      fc.constant("True"),
      fc.constant("FALSE"),
      fc.constant("False"),
      fc.constant("0"),
      fc.constant("no"),
      fc.constant("off"),
      fc.constant("fals"),
      fc.constant("falsee"),
      fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/).filter((s) => s !== "false"),
    );

    it("sslVerify is false when CHECKMK_SSL_VERIFY is exactly 'false'", () => {
      const config = parseCheckmkConfig({
        ...VALID_CHECKMK_ENV,
        CHECKMK_SSL_VERIFY: "false",
      });

      expect(config).not.toBeNull();
      expect(config?.sslVerify).toBe(false);
    });

    it("sslVerify is true for any value other than exactly 'false'", () => {
      fc.assert(
        fc.property(notExactlyFalseArb, (sslVerifyValue) => {
          const env: Record<string, string | undefined> = {
            ...VALID_CHECKMK_ENV,
            CHECKMK_SSL_VERIFY: sslVerifyValue,
          };

          const config = parseCheckmkConfig(env);

          expect(config).not.toBeNull();
          expect(config?.sslVerify).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it("sslVerify defaults to true when CHECKMK_SSL_VERIFY is unset", () => {
      const env: Record<string, string | undefined> = {
        ...VALID_CHECKMK_ENV,
        CHECKMK_SSL_VERIFY: undefined,
      };

      const config = parseCheckmkConfig(env);

      expect(config).not.toBeNull();
      expect(config?.sslVerify).toBe(true);
    });
  });
});
