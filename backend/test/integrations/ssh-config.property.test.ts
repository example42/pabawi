/**
 * Property-based tests for SSH configuration management
 *
 * These tests validate universal properties that should hold true
 * across all valid SSH configurations.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { parseSSHConfig, validateSSHConfig, loadSSHConfig, ConfigurationError } from '../../src/integrations/ssh/config';
import { SSHConfig } from '../../src/integrations/ssh/types';

/**
 * Custom generator for valid SSH configuration environment variables
 */
function sshConfigEnvGenerator() {
  return fc.record({
    SSH_ENABLED: fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'),
    SSH_CONFIG_PATH: fc.option(fc.string(), { nil: undefined }),
    SSH_DEFAULT_USER: fc.option(fc.string().filter(s => s.length > 0), { nil: undefined }),
    SSH_DEFAULT_PORT: fc.option(fc.integer({ min: 1, max: 65535 }).map(String), { nil: undefined }),
    SSH_DEFAULT_KEY: fc.option(fc.string(), { nil: undefined }),
    SSH_HOST_KEY_CHECK: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_CONNECTION_TIMEOUT: fc.option(fc.integer({ min: 5, max: 300 }).map(String), { nil: undefined }),
    SSH_COMMAND_TIMEOUT: fc.option(fc.integer({ min: 10, max: 3600 }).map(String), { nil: undefined }),
    SSH_MAX_CONNECTIONS: fc.option(fc.integer({ min: 1, max: 1000 }).map(String), { nil: undefined }),
    SSH_MAX_CONNECTIONS_PER_HOST: fc.option(fc.integer({ min: 1, max: 100 }).map(String), { nil: undefined }),
    SSH_IDLE_TIMEOUT: fc.option(fc.integer({ min: 10, max: 3600 }).map(String), { nil: undefined }),
    SSH_CONCURRENCY_LIMIT: fc.option(fc.integer({ min: 1, max: 100 }).map(String), { nil: undefined }),
    SSH_SUDO_ENABLED: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_SUDO_COMMAND: fc.option(fc.string().filter(s => s.length > 0), { nil: undefined }),
    SSH_SUDO_PASSWORDLESS: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_SUDO_PASSWORD: fc.option(fc.string(), { nil: undefined }),
    SSH_SUDO_USER: fc.option(fc.string().filter(s => s.length > 0), { nil: undefined }),
    SSH_PRIORITY: fc.option(fc.integer({ min: 0, max: 100 }).map(String), { nil: undefined }),
  });
}

/**
 * Generator for enabled SSH configuration with required fields
 */
function enabledSSHConfigEnvGenerator() {
  return fc.record({
    SSH_ENABLED: fc.constant('true'),
    SSH_CONFIG_PATH: fc.option(fc.string(), { nil: undefined }),
    SSH_DEFAULT_USER: fc.string().filter(s => s.length > 0),
    SSH_DEFAULT_PORT: fc.option(fc.integer({ min: 1, max: 65535 }).map(String), { nil: undefined }),
    SSH_DEFAULT_KEY: fc.option(fc.string(), { nil: undefined }),
    SSH_HOST_KEY_CHECK: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_CONNECTION_TIMEOUT: fc.option(fc.integer({ min: 5, max: 300 }).map(String), { nil: undefined }),
    SSH_COMMAND_TIMEOUT: fc.option(fc.integer({ min: 10, max: 3600 }).map(String), { nil: undefined }),
    SSH_MAX_CONNECTIONS: fc.option(fc.integer({ min: 1, max: 1000 }).map(String), { nil: undefined }),
    SSH_MAX_CONNECTIONS_PER_HOST: fc.option(fc.integer({ min: 1, max: 100 }).map(String), { nil: undefined }),
    SSH_IDLE_TIMEOUT: fc.option(fc.integer({ min: 10, max: 3600 }).map(String), { nil: undefined }),
    SSH_CONCURRENCY_LIMIT: fc.option(fc.integer({ min: 1, max: 100 }).map(String), { nil: undefined }),
    SSH_SUDO_ENABLED: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_SUDO_COMMAND: fc.option(fc.string().filter(s => s.length > 0), { nil: undefined }),
    SSH_SUDO_PASSWORDLESS: fc.option(fc.constantFrom('true', 'false', '1', '0', 'yes', 'no'), { nil: undefined }),
    SSH_SUDO_PASSWORD: fc.option(fc.string(), { nil: undefined }),
    SSH_SUDO_USER: fc.option(fc.string().filter(s => s.length > 0), { nil: undefined }),
    SSH_PRIORITY: fc.option(fc.integer({ min: 0, max: 100 }).map(String), { nil: undefined }),
  });
}

describe('SSH Configuration Property Tests', () => {
  /**
   * Property 2: Configuration Parsing Completeness
   *
   * For any valid set of SSH environment variables, the parsed configuration
   * should contain all specified values with correct types and defaults applied
   * for missing optional values.
   *
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10**
   */
  test('Property 2: Configuration parsing completeness - all values preserved with correct types', () => {
    fc.assert(
      fc.property(
        enabledSSHConfigEnvGenerator(),
        (env) => {
          const config = parseSSHConfig(env);

          // Verify enabled is parsed correctly
          expect(config.enabled).toBe(true);

          // Verify required fields are present
          expect(config.defaultUser).toBe(env.SSH_DEFAULT_USER);
          expect(typeof config.defaultUser).toBe('string');

          // Verify optional string fields
          if (env.SSH_CONFIG_PATH !== undefined) {
            expect(config.configPath).toBe(env.SSH_CONFIG_PATH);
          }

          if (env.SSH_DEFAULT_KEY !== undefined) {
            expect(config.defaultKeyPath).toBe(env.SSH_DEFAULT_KEY);
          }

          // Verify numeric fields have correct types
          expect(typeof config.defaultPort).toBe('number');
          expect(typeof config.connectionTimeout).toBe('number');
          expect(typeof config.commandTimeout).toBe('number');
          expect(typeof config.maxConnections).toBe('number');
          expect(typeof config.maxConnectionsPerHost).toBe('number');
          expect(typeof config.idleTimeout).toBe('number');
          expect(typeof config.concurrencyLimit).toBe('number');
          expect(typeof config.priority).toBe('number');

          // Verify boolean fields have correct types
          expect(typeof config.hostKeyCheck).toBe('boolean');
          expect(typeof config.sudo.enabled).toBe('boolean');
          expect(typeof config.sudo.passwordless).toBe('boolean');

          // Verify numeric values are within valid ranges
          expect(config.defaultPort).toBeGreaterThanOrEqual(1);
          expect(config.defaultPort).toBeLessThanOrEqual(65535);

          expect(config.connectionTimeout).toBeGreaterThanOrEqual(5);
          expect(config.connectionTimeout).toBeLessThanOrEqual(300);

          expect(config.commandTimeout).toBeGreaterThanOrEqual(10);
          expect(config.commandTimeout).toBeLessThanOrEqual(3600);

          expect(config.maxConnections).toBeGreaterThanOrEqual(1);
          expect(config.maxConnections).toBeLessThanOrEqual(1000);

          expect(config.maxConnectionsPerHost).toBeGreaterThanOrEqual(1);
          expect(config.maxConnectionsPerHost).toBeLessThanOrEqual(100);

          expect(config.idleTimeout).toBeGreaterThanOrEqual(10);
          expect(config.idleTimeout).toBeLessThanOrEqual(3600);

          expect(config.concurrencyLimit).toBeGreaterThanOrEqual(1);
          expect(config.concurrencyLimit).toBeLessThanOrEqual(100);

          expect(config.priority).toBeGreaterThanOrEqual(0);
          expect(config.priority).toBeLessThanOrEqual(100);

          // Verify sudo configuration structure
          expect(config.sudo).toBeDefined();
          expect(typeof config.sudo.command).toBe('string');
          expect(config.sudo.command.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Configuration parsing - defaults applied for missing optional values', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.string().filter(s => s.length > 0),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // Verify defaults are applied
          expect(config.enabled).toBe(true);
          expect(config.defaultPort).toBe(22);
          expect(config.hostKeyCheck).toBe(true);
          expect(config.connectionTimeout).toBe(30);
          expect(config.commandTimeout).toBe(300);
          expect(config.maxConnections).toBe(50);
          expect(config.maxConnectionsPerHost).toBe(5);
          expect(config.idleTimeout).toBe(300);
          expect(config.concurrencyLimit).toBe(10);
          expect(config.priority).toBe(50);

          // Verify sudo defaults
          expect(config.sudo.enabled).toBe(false);
          expect(config.sudo.command).toBe('sudo');
          expect(config.sudo.passwordless).toBe(true);
          expect(config.sudo.runAsUser).toBe('root');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Configuration parsing - disabled config returns minimal valid config', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constantFrom('false', '0', 'no'),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // Verify disabled config is valid and minimal
          expect(config.enabled).toBe(false);
          expect(config.defaultUser).toBe('root');
          expect(config.defaultPort).toBe(22);
          expect(typeof config.connectionTimeout).toBe('number');
          expect(typeof config.commandTimeout).toBe('number');
          expect(config.sudo).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Configuration parsing - numeric values parsed correctly from strings', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_DEFAULT_PORT: fc.integer({ min: 1, max: 65535 }).map(String),
          SSH_CONNECTION_TIMEOUT: fc.integer({ min: 5, max: 300 }).map(String),
          SSH_COMMAND_TIMEOUT: fc.integer({ min: 10, max: 3600 }).map(String),
          SSH_MAX_CONNECTIONS: fc.integer({ min: 1, max: 1000 }).map(String),
          SSH_PRIORITY: fc.integer({ min: 0, max: 100 }).map(String),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // Verify numeric values match the input
          expect(config.defaultPort).toBe(parseInt(env.SSH_DEFAULT_PORT!, 10));
          expect(config.connectionTimeout).toBe(parseInt(env.SSH_CONNECTION_TIMEOUT!, 10));
          expect(config.commandTimeout).toBe(parseInt(env.SSH_COMMAND_TIMEOUT!, 10));
          expect(config.maxConnections).toBe(parseInt(env.SSH_MAX_CONNECTIONS!, 10));
          expect(config.priority).toBe(parseInt(env.SSH_PRIORITY!, 10));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Configuration parsing - boolean values parsed correctly from various formats', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_HOST_KEY_CHECK: fc.constantFrom('true', '1', 'yes', 'false', '0', 'no'),
          SSH_SUDO_ENABLED: fc.constantFrom('true', '1', 'yes', 'false', '0', 'no'),
          SSH_SUDO_PASSWORDLESS: fc.constantFrom('true', '1', 'yes', 'false', '0', 'no'),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // Verify boolean values are parsed correctly
          const expectedHostKeyCheck = ['true', '1', 'yes'].includes(env.SSH_HOST_KEY_CHECK!.toLowerCase());
          const expectedSudoEnabled = ['true', '1', 'yes'].includes(env.SSH_SUDO_ENABLED!.toLowerCase());
          const expectedSudoPasswordless = ['true', '1', 'yes'].includes(env.SSH_SUDO_PASSWORDLESS!.toLowerCase());

          expect(config.hostKeyCheck).toBe(expectedHostKeyCheck);
          expect(config.sudo.enabled).toBe(expectedSudoEnabled);
          expect(config.sudo.passwordless).toBe(expectedSudoPasswordless);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('SSH Configuration Validation Property Tests', () => {
  /**
   * Property 3: Configuration Validation Failure
   *
   * For any configuration missing required values, initialization should fail
   * and set initialized to false.
   *
   * **Validates: Requirements 10.11**
   */
  test('Property 3: Configuration validation fails when required values are missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          // Intentionally omit SSH_DEFAULT_USER to trigger validation failure
        }),
        (env) => {
          // Should throw ConfigurationError when required field is missing
          expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
          expect(() => parseSSHConfig(env)).toThrow('SSH_DEFAULT_USER is required');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation fails for invalid timeout ranges', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_CONNECTION_TIMEOUT: fc.oneof(
            fc.integer({ min: -1000, max: 4 }).map(String),
            fc.integer({ min: 301, max: 1000 }).map(String)
          ),
        }),
        (env) => {
          // Should throw ConfigurationError for out-of-range timeout
          expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
          expect(() => parseSSHConfig(env)).toThrow(/SSH_CONNECTION_TIMEOUT must be between 5 and 300/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation fails for invalid command timeout ranges', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_COMMAND_TIMEOUT: fc.oneof(
            fc.integer({ min: -1000, max: 9 }).map(String),
            fc.integer({ min: 3601, max: 5000 }).map(String)
          ),
        }),
        (env) => {
          // Should throw ConfigurationError for out-of-range timeout
          expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
          expect(() => parseSSHConfig(env)).toThrow(/SSH_COMMAND_TIMEOUT must be between 10 and 3600/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation fails for invalid port ranges', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_DEFAULT_PORT: fc.oneof(
            fc.integer({ min: -1000, max: 0 }).map(String),
            fc.integer({ min: 65536, max: 100000 }).map(String)
          ),
        }),
        (env) => {
          // Should throw ConfigurationError for out-of-range port
          expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
          expect(() => parseSSHConfig(env)).toThrow(/SSH_DEFAULT_PORT must be between 1 and 65535/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation fails when maxConnectionsPerHost exceeds maxConnections', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_MAX_CONNECTIONS: fc.integer({ min: 1, max: 50 }).map(String),
          SSH_MAX_CONNECTIONS_PER_HOST: fc.integer({ min: 51, max: 100 }).map(String),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // validateSSHConfig should throw when maxConnectionsPerHost > maxConnections
          expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
          expect(() => validateSSHConfig(config)).toThrow(/SSH_MAX_CONNECTIONS_PER_HOST.*cannot exceed.*SSH_MAX_CONNECTIONS/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation fails when sudo requires password but none provided', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.constant('testuser'),
          SSH_SUDO_ENABLED: fc.constant('true'),
          SSH_SUDO_PASSWORDLESS: fc.constant('false'),
          // Intentionally omit SSH_SUDO_PASSWORD
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // validateSSHConfig should throw when sudo needs password but none provided
          expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
          expect(() => validateSSHConfig(config)).toThrow(/SSH_SUDO_PASSWORD is required/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: Configuration validation succeeds for valid configurations', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.string().filter(s => s.length > 0),
          SSH_MAX_CONNECTIONS: fc.integer({ min: 10, max: 100 }).map(String),
          SSH_MAX_CONNECTIONS_PER_HOST: fc.integer({ min: 1, max: 9 }).map(String),
        }),
        (env) => {
          const config = parseSSHConfig(env);

          // Should not throw for valid configuration
          expect(() => validateSSHConfig(config)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: loadSSHConfig combines parsing and validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          SSH_ENABLED: fc.constant('true'),
          SSH_DEFAULT_USER: fc.string().filter(s => s.length > 0),
          SSH_MAX_CONNECTIONS: fc.integer({ min: 10, max: 100 }).map(String),
          SSH_MAX_CONNECTIONS_PER_HOST: fc.integer({ min: 1, max: 9 }).map(String),
        }),
        (env) => {
          // loadSSHConfig should successfully parse and validate
          const config = loadSSHConfig(env);

          expect(config.enabled).toBe(true);
          expect(config.defaultUser).toBe(env.SSH_DEFAULT_USER);
          expect(config.maxConnectionsPerHost).toBeLessThanOrEqual(config.maxConnections);
        }
      ),
      { numRuns: 100 }
    );
  });
});
