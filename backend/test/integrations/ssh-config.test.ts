/**
 * Unit tests for SSH configuration parser
 */

import { parseSSHConfig, validateSSHConfig, loadSSHConfig, ConfigurationError } from '../../src/integrations/ssh/config';
import { SSHConfig } from '../../src/integrations/ssh/types';

describe('SSH Configuration Parser', () => {
  describe('parseSSHConfig', () => {
    it('should return disabled config when SSH_ENABLED is not set', () => {
      const config = parseSSHConfig({});

      expect(config.enabled).toBe(false);
      expect(config.defaultPort).toBe(22);
      expect(config.connectionTimeout).toBe(30);
    });

    it('should return disabled config when SSH_ENABLED is false', () => {
      const config = parseSSHConfig({ SSH_ENABLED: 'false' });

      expect(config.enabled).toBe(false);
    });

    it('should parse all environment variables correctly', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_CONFIG_PATH: '/path/to/ssh_config',
        SSH_DEFAULT_USER: 'deploy',
        SSH_DEFAULT_PORT: '2222',
        SSH_DEFAULT_KEY: '/path/to/key',
        SSH_HOST_KEY_CHECK: 'false',
        SSH_CONNECTION_TIMEOUT: '60',
        SSH_COMMAND_TIMEOUT: '600',
        SSH_MAX_CONNECTIONS: '100',
        SSH_MAX_CONNECTIONS_PER_HOST: '10',
        SSH_IDLE_TIMEOUT: '600',
        SSH_CONCURRENCY_LIMIT: '20',
        SSH_SUDO_ENABLED: 'true',
        SSH_SUDO_COMMAND: 'doas',
        SSH_SUDO_PASSWORDLESS: 'false',
        SSH_SUDO_PASSWORD: 'secret',
        SSH_SUDO_USER: 'admin',
        SSH_PRIORITY: '75',
      };

      const config = parseSSHConfig(env);

      expect(config.enabled).toBe(true);
      expect(config.configPath).toBe('/path/to/ssh_config');
      expect(config.defaultUser).toBe('deploy');
      expect(config.defaultPort).toBe(2222);
      expect(config.defaultKeyPath).toBe('/path/to/key');
      expect(config.hostKeyCheck).toBe(false);
      expect(config.connectionTimeout).toBe(60);
      expect(config.commandTimeout).toBe(600);
      expect(config.maxConnections).toBe(100);
      expect(config.maxConnectionsPerHost).toBe(10);
      expect(config.idleTimeout).toBe(600);
      expect(config.concurrencyLimit).toBe(20);
      expect(config.sudo.enabled).toBe(true);
      expect(config.sudo.command).toBe('doas');
      expect(config.sudo.passwordless).toBe(false);
      expect(config.sudo.password).toBe('secret');
      expect(config.sudo.runAsUser).toBe('admin');
      expect(config.priority).toBe(75);
    });

    it('should apply default values for optional configuration', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
      };

      const config = parseSSHConfig(env);

      expect(config.defaultPort).toBe(22);
      expect(config.hostKeyCheck).toBe(true);
      expect(config.connectionTimeout).toBe(30);
      expect(config.commandTimeout).toBe(300);
      expect(config.maxConnections).toBe(50);
      expect(config.maxConnectionsPerHost).toBe(5);
      expect(config.idleTimeout).toBe(300);
      expect(config.concurrencyLimit).toBe(10);
      expect(config.sudo.enabled).toBe(false);
      expect(config.sudo.command).toBe('sudo');
      expect(config.sudo.passwordless).toBe(true);
      expect(config.sudo.runAsUser).toBe('root');
      expect(config.priority).toBe(50);
    });

    it('should throw error when SSH_DEFAULT_USER is missing and enabled', () => {
      const env = {
        SSH_ENABLED: 'true',
      };

      expect(() => parseSSHConfig(env)).toThrow(ConfigurationError);
      expect(() => parseSSHConfig(env)).toThrow('SSH_DEFAULT_USER is required');
    });

    it('should parse boolean values correctly', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'TRUE', expected: true },
        { value: '1', expected: true },
        { value: 'yes', expected: true },
        { value: 'false', expected: false },
        { value: 'FALSE', expected: false },
        { value: '0', expected: false },
        { value: 'no', expected: false },
      ];

      testCases.forEach(({ value, expected }) => {
        const config = parseSSHConfig({
          SSH_ENABLED: value,
          SSH_DEFAULT_USER: 'root',
        });
        expect(config.enabled).toBe(expected);
      });
    });

    it('should validate connection timeout bounds (5-300)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
      };

      // Valid values
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: '5' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: '150' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: '300' })).not.toThrow();

      // Invalid values
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: '4' })).toThrow(ConfigurationError);
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: '301' })).toThrow(ConfigurationError);
      expect(() => parseSSHConfig({ ...env, SSH_CONNECTION_TIMEOUT: 'invalid' })).toThrow(ConfigurationError);
    });

    it('should validate command timeout bounds (10-3600)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
      };

      // Valid values
      expect(() => parseSSHConfig({ ...env, SSH_COMMAND_TIMEOUT: '10' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_COMMAND_TIMEOUT: '1800' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_COMMAND_TIMEOUT: '3600' })).not.toThrow();

      // Invalid values
      expect(() => parseSSHConfig({ ...env, SSH_COMMAND_TIMEOUT: '9' })).toThrow(ConfigurationError);
      expect(() => parseSSHConfig({ ...env, SSH_COMMAND_TIMEOUT: '3601' })).toThrow(ConfigurationError);
    });

    it('should validate concurrency limit bounds (1-100)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
      };

      // Valid values
      expect(() => parseSSHConfig({ ...env, SSH_CONCURRENCY_LIMIT: '1' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_CONCURRENCY_LIMIT: '50' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_CONCURRENCY_LIMIT: '100' })).not.toThrow();

      // Invalid values
      expect(() => parseSSHConfig({ ...env, SSH_CONCURRENCY_LIMIT: '0' })).toThrow(ConfigurationError);
      expect(() => parseSSHConfig({ ...env, SSH_CONCURRENCY_LIMIT: '101' })).toThrow(ConfigurationError);
    });

    it('should validate port bounds (1-65535)', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
      };

      // Valid values
      expect(() => parseSSHConfig({ ...env, SSH_DEFAULT_PORT: '1' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_DEFAULT_PORT: '22' })).not.toThrow();
      expect(() => parseSSHConfig({ ...env, SSH_DEFAULT_PORT: '65535' })).not.toThrow();

      // Invalid values
      expect(() => parseSSHConfig({ ...env, SSH_DEFAULT_PORT: '0' })).toThrow(ConfigurationError);
      expect(() => parseSSHConfig({ ...env, SSH_DEFAULT_PORT: '65536' })).toThrow(ConfigurationError);
    });
  });

  describe('validateSSHConfig', () => {
    it('should not validate disabled config', () => {
      const config: SSHConfig = {
        enabled: false,
        defaultUser: '',
        defaultPort: 22,
        hostKeyCheck: true,
        connectionTimeout: 30,
        commandTimeout: 300,
        maxConnections: 50,
        maxConnectionsPerHost: 5,
        idleTimeout: 300,
        concurrencyLimit: 10,
        sudo: {
          enabled: false,
          command: 'sudo',
          passwordless: true,
        },
        priority: 50,
      };

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    it('should throw error when maxConnectionsPerHost exceeds maxConnections', () => {
      const config: SSHConfig = {
        enabled: true,
        defaultUser: 'root',
        defaultPort: 22,
        hostKeyCheck: true,
        connectionTimeout: 30,
        commandTimeout: 300,
        maxConnections: 10,
        maxConnectionsPerHost: 20,
        idleTimeout: 300,
        concurrencyLimit: 10,
        sudo: {
          enabled: false,
          command: 'sudo',
          passwordless: true,
        },
        priority: 50,
      };

      expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSSHConfig(config)).toThrow('cannot exceed');
    });

    it('should throw error when sudo requires password but none provided', () => {
      const config: SSHConfig = {
        enabled: true,
        defaultUser: 'root',
        defaultPort: 22,
        hostKeyCheck: true,
        connectionTimeout: 30,
        commandTimeout: 300,
        maxConnections: 50,
        maxConnectionsPerHost: 5,
        idleTimeout: 300,
        concurrencyLimit: 10,
        sudo: {
          enabled: true,
          command: 'sudo',
          passwordless: false,
          // password is missing
        },
        priority: 50,
      };

      expect(() => validateSSHConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSSHConfig(config)).toThrow('SSH_SUDO_PASSWORD is required');
    });

    it('should not throw error when sudo is passwordless', () => {
      const config: SSHConfig = {
        enabled: true,
        defaultUser: 'root',
        defaultPort: 22,
        hostKeyCheck: true,
        connectionTimeout: 30,
        commandTimeout: 300,
        maxConnections: 50,
        maxConnectionsPerHost: 5,
        idleTimeout: 300,
        concurrencyLimit: 10,
        sudo: {
          enabled: true,
          command: 'sudo',
          passwordless: true,
        },
        priority: 50,
      };

      expect(() => validateSSHConfig(config)).not.toThrow();
    });

    it('should not throw error when sudo has password', () => {
      const config: SSHConfig = {
        enabled: true,
        defaultUser: 'root',
        defaultPort: 22,
        hostKeyCheck: true,
        connectionTimeout: 30,
        commandTimeout: 300,
        maxConnections: 50,
        maxConnectionsPerHost: 5,
        idleTimeout: 300,
        concurrencyLimit: 10,
        sudo: {
          enabled: true,
          command: 'sudo',
          passwordless: false,
          password: 'secret',
        },
        priority: 50,
      };

      expect(() => validateSSHConfig(config)).not.toThrow();
    });
  });

  describe('loadSSHConfig', () => {
    it('should parse and validate config successfully', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'deploy',
      };

      const config = loadSSHConfig(env);

      expect(config.enabled).toBe(true);
      expect(config.defaultUser).toBe('deploy');
    });

    it('should throw error for invalid config', () => {
      const env = {
        SSH_ENABLED: 'true',
        SSH_DEFAULT_USER: 'root',
        SSH_MAX_CONNECTIONS: '10',
        SSH_MAX_CONNECTIONS_PER_HOST: '20',
      };

      expect(() => loadSSHConfig(env)).toThrow(ConfigurationError);
    });
  });
});
