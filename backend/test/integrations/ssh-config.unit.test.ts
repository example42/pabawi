/**
 * Unit tests for SSH configuration management
 *
 * These tests validate specific examples and edge cases for SSH configuration
 * parsing and validation.
 */

import { describe, test, expect } from 'vitest';
import { parseSSHConfig, validateSSHConfig, loadSSHConfig, ConfigurationError } from '../../src/integrations/ssh/config';

describe('SSH Configuration Unit Tests', () => {
  describe('parseSSHConfig - Missing Required Values', () => {
    test('should throw error when SSH_DEFAULT_USER is missing and SSH is enabled', () => {
      const env = {
        SSH_ENABLED: 'true',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_DEFAULT_USER is required when SSH_ENABLED is true');
    });

    test('should not require SSH_DEFAULT_USER when SSH is disabled', () => {
      const env = {
        SSH_ENABLED: 'false',
      };

      const config = parseSSHConfig(env);
      expect(config.enabled).toBe(false);
      expect(config.defaultUser).toBe('root'); // Default value
    });

    test('should not require SSH_DEFAULT_USER when SSH_ENABLED is not set', () => {
      const env = {};

      const config = parseSSHConfig(env);
      expect(config.enabled).toBe(false);
    });
  });

  describe('parseSSHConfig - Invalid Timeout Ranges', () => {
    test('should throw error for connection timeout below minimum (5 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONNECTION_TIMEOUT: '4',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_CONNECTION_TIMEOUT must be between 5 and 300');
    });

    test('should throw error for connection timeout above maximum (300 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONNECTION_TIMEOUT: '301',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_CONNECTION_TIMEOUT must be between 5 and 300');
    });

    test('should accept connection timeout at minimum boundary (5 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONNECTION_TIMEOUT: '5',
      };

      const config = parseSSHConfig(env);
      expect(config.connectionTimeout).toBe(5);
    });

    test('should accept connection timeout at maximum boundary (300 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONNECTION_TIMEOUT: '300',
      };

      const config = parseSSHConfig(env);
      expect(config.connectionTimeout).toBe(300);
    });

    test('should throw error for command timeout below minimum (10 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_COMMAND_TIMEOUT: '9',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_COMMAND_TIMEOUT must be between 10 and 3600');
    });

    test('should throw error for command timeout above maximum (3600 seconds)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_COMMAND_TIMEOUT: '3601',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_COMMAND_TIMEOUT must be between 10 and 3600');
    });

    test('should accept command timeout at boundaries', () => {
      const env1 = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_COMMAND_TIMEOUT: '10',
      };

      const config1 = parseSSHConfig(env1);
      expect(config1.commandTimeout).toBe(10);

      const env2 = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_COMMAND_TIMEOUT: '3600',
      };

      const config2 = parseSSHConfig(env2);
      expect(config2.commandTimeout).toBe(3600);
    });

    test('should throw error for invalid timeout format (non-numeric)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONNECTION_TIMEOUT: 'invalid',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_CONNECTION_TIMEOUT must be a valid integer');
    });
  });

  describe('parseSSHConfig - Default Value Application', () => {
    test('should apply default port (22) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.defaultPort).toBe(22);
    });

    test('should apply default connection timeout (30) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.connectionTimeout).toBe(30);
    });

    test('should apply default command timeout (300) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.commandTimeout).toBe(300);
    });

    test('should apply default max connections (50) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.maxConnections).toBe(50);
    });

    test('should apply default max connections per host (5) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.maxConnectionsPerHost).toBe(5);
    });

    test('should apply default idle timeout (300) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.idleTimeout).toBe(300);
    });

    test('should apply default concurrency limit (10) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.concurrencyLimit).toBe(10);
    });

    test('should apply default priority (50) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.priority).toBe(50);
    });

    test('should apply default host key check (true) when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(true);
    });

    test('should apply default sudo configuration when not specified', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.sudo.enabled).toBe(false);
      expect(config.sudo.command).toBe('sudo');
      expect(config.sudo.passwordless).toBe(true);
      expect(config.sudo.runAsUser).toBe('root');
    });
  });

  describe('parseSSHConfig - Boolean Parsing', () => {
    test('should parse "true" as true', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: 'true',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(true);
    });

    test('should parse "1" as true', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: '1',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(true);
    });

    test('should parse "yes" as true', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: 'yes',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(true);
    });

    test('should parse "false" as false', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: 'false',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(false);
    });

    test('should parse "0" as false', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: '0',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(false);
    });

    test('should parse "no" as false', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: 'no',
      };

      const config = parseSSHConfig(env);
      expect(config.hostKeyCheck).toBe(false);
    });

    test('should be case-insensitive for boolean values', () => {
      const env = {
        SSH_ENABLED: 'TRUE',
        SSH_DEFAULT_USER: 'testuser',
        SSH_HOST_KEY_CHECK: 'YES',
      };

      const config = parseSSHConfig(env);
      expect(config.enabled).toBe(true);
      expect(config.hostKeyCheck).toBe(true);
    });
  });

  describe('validateSSHConfig - Consistency Checks', () => {
    test('should throw error when maxConnectionsPerHost exceeds maxConnections', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_MAX_CONNECTIONS: '10',
        SSH_MAX_CONNECTIONS_PER_HOST: '20',
      });

      expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSSHConfig(config)).toThrow(/SSH_MAX_CONNECTIONS_PER_HOST.*cannot exceed.*SSH_MAX_CONNECTIONS/);
    });

    test('should not throw when maxConnectionsPerHost equals maxConnections', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_MAX_CONNECTIONS: '10',
        SSH_MAX_CONNECTIONS_PER_HOST: '10',
      });

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    test('should not throw when maxConnectionsPerHost is less than maxConnections', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_MAX_CONNECTIONS: '50',
        SSH_MAX_CONNECTIONS_PER_HOST: '5',
      });

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    test('should throw error when sudo is enabled, not passwordless, but no password provided', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_SUDO_ENABLED: 'true',
        SSH_SUDO_PASSWORDLESS: 'false',
      });

      expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSSHConfig(config)).toThrow(/SSH_SUDO_PASSWORD is required/);
    });

    test('should not throw when sudo is enabled, not passwordless, and password is provided', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_SUDO_ENABLED: 'true',
        SSH_SUDO_PASSWORDLESS: 'false',
        SSH_SUDO_PASSWORD: 'secret',
      });

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    test('should not throw when sudo is enabled and passwordless', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_SUDO_ENABLED: 'true',
        SSH_SUDO_PASSWORDLESS: 'true',
      });

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    test('should not validate disabled configuration', () => {
      const config = parseSSHConfig({
        SSH_ENABLED: 'false',
      });

      // Should not throw even though it doesn't have required fields
      expect(() => validateSSHConfig(config)).not.toThrow();
    });
  });

  describe('loadSSHConfig - Combined Parsing and Validation', () => {
    test('should successfully load valid configuration', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_DEFAULT_PORT: '2222',
        SSH_CONNECTION_TIMEOUT: '60',
      };

      const config = loadSSHConfig(env);
      expect(config.enabled).toBe(true);
      expect(config.defaultUser).toBe('testuser');
      expect(config.defaultPort).toBe(2222);
      expect(config.connectionTimeout).toBe(60);
    });

    test('should throw error for invalid configuration during load', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_MAX_CONNECTIONS: '10',
        SSH_MAX_CONNECTIONS_PER_HOST: '20',
      };

      expect(() => loadSSHConfig(env)).toThrow(ConfigurationError);
    });

    test('should throw error for missing required fields during load', () => {
      const env = {
        SSH_ENABLED: 'true',
      };

      expect(() => loadSSHConfig(env)).toThrow(ConfigurationError);
    });
  });

  describe('parseSSHConfig - Optional Fields', () => {
    test('should handle optional SSH_CONFIG_PATH', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_CONFIG_PATH: '/path/to/ssh/config',
      };

      const config = parseSSHConfig(env);
      expect(config.configPath).toBe('/path/to/ssh/config');
    });

    test('should handle missing SSH_CONFIG_PATH', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.configPath).toBeUndefined();
    });

    test('should handle optional SSH_DEFAULT_KEY', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_DEFAULT_KEY: '/path/to/key',
      };

      const config = parseSSHConfig(env);
      expect(config.defaultKeyPath).toBe('/path/to/key');
    });

    test('should handle missing SSH_DEFAULT_KEY', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
      };

      const config = parseSSHConfig(env);
      expect(config.defaultKeyPath).toBeUndefined();
    });

    test('should handle optional SSH_SUDO_USER', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_SUDO_ENABLED: 'true',
        SSH_SUDO_USER: 'admin',
      };

      const config = parseSSHConfig(env);
      expect(config.sudo.runAsUser).toBe('admin');
    });

    test('should default SSH_SUDO_USER to "root"', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'testuser',
        SSH_SUDO_ENABLED: 'true',
      };

      const config = parseSSHConfig(env);
      expect(config.sudo.runAsUser).toBe('root');
    });
  });
});
