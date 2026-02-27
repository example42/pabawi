/**
 * Configuration parser for SSH Integration
 *
 * This module handles parsing and validation of SSH configuration from
 * environment variables. It applies default values and validates required
 * configuration according to the SSH integration requirements.
 */

import { SSHConfig, SSHErrorType } from './types';
import { homedir } from 'os';

/**
 * Configuration validation error
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Expand tilde (~) in file paths to user's home directory
 */
function expandTilde(filepath: string | undefined): string | undefined {
  if (!filepath) {
    return filepath;
  }

  if (filepath.startsWith('~/')) {
    return filepath.replace('~', homedir());
  }

  return filepath;
}

/**
 * Parse an integer from environment variable with bounds checking
 */
function parseIntWithBounds(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  name: string
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `${name} must be a valid integer, got: ${value}`
    );
  }

  if (parsed < min || parsed > max) {
    throw new ConfigurationError(
      `${name} must be between ${min} and ${max}, got: ${parsed}`
    );
  }

  return parsed;
}

/**
 * Parse a boolean from environment variable
 */
function parseBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (!value) {
    return defaultValue;
  }

  const lower = value.toLowerCase();

  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }

  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }

  return defaultValue;
}

/**
 * Parse SSH configuration from environment variables
 *
 * Reads all SSH_* environment variables and constructs a validated
 * SSHConfig object. Applies default values for optional configuration
 * and validates required values and ranges.
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Parsed and validated SSH configuration
 * @throws ConfigurationError if required configuration is missing or invalid
 *
 * @example
 * ```typescript
 * const config = parseSSHConfig();
 * console.log(config.defaultPort); // 22
 * ```
 */
export function parseSSHConfig(env: NodeJS.ProcessEnv = process.env): SSHConfig {
  // Parse SSH_ENABLED (required)
  const enabled = parseBoolean(env.SSH_ENABLED, false);

  // If SSH is not enabled, return minimal config
  if (!enabled) {
    return {
      enabled: false,
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
        enabled: false,
        command: 'sudo',
        passwordless: true,
      },
      priority: 50,
    };
  }

  // Parse optional SSH config file path
  const configPath = expandTilde(env.SSH_CONFIG_PATH);

  // Parse default user (required when enabled)
  const defaultUser = env.SSH_DEFAULT_USER;
  if (!defaultUser) {
    throw new ConfigurationError(
      'SSH_DEFAULT_USER is required when SSH_ENABLED is true'
    );
  }

  // Parse default port with validation
  const defaultPort = parseIntWithBounds(
    env.SSH_DEFAULT_PORT,
    22,
    1,
    65535,
    'SSH_DEFAULT_PORT'
  );

  // Parse optional default key path
  const defaultKeyPath = expandTilde(env.SSH_DEFAULT_KEY);

  // Parse host key check
  const hostKeyCheck = parseBoolean(env.SSH_HOST_KEY_CHECK, true);

  // Parse connection timeout (5-300 seconds)
  const connectionTimeout = parseIntWithBounds(
    env.SSH_CONNECTION_TIMEOUT,
    30,
    5,
    300,
    'SSH_CONNECTION_TIMEOUT'
  );

  // Parse command timeout (10-3600 seconds)
  const commandTimeout = parseIntWithBounds(
    env.SSH_COMMAND_TIMEOUT,
    300,
    10,
    3600,
    'SSH_COMMAND_TIMEOUT'
  );

  // Parse max connections
  const maxConnections = parseIntWithBounds(
    env.SSH_MAX_CONNECTIONS,
    50,
    1,
    1000,
    'SSH_MAX_CONNECTIONS'
  );

  // Parse max connections per host
  const maxConnectionsPerHost = parseIntWithBounds(
    env.SSH_MAX_CONNECTIONS_PER_HOST,
    5,
    1,
    100,
    'SSH_MAX_CONNECTIONS_PER_HOST'
  );

  // Parse idle timeout
  const idleTimeout = parseIntWithBounds(
    env.SSH_IDLE_TIMEOUT,
    300,
    10,
    3600,
    'SSH_IDLE_TIMEOUT'
  );

  // Parse concurrency limit (1-100)
  const concurrencyLimit = parseIntWithBounds(
    env.SSH_CONCURRENCY_LIMIT,
    10,
    1,
    100,
    'SSH_CONCURRENCY_LIMIT'
  );

  // Parse sudo configuration
  const sudoEnabled = parseBoolean(env.SSH_SUDO_ENABLED, false);
  const sudoCommand = env.SSH_SUDO_COMMAND || 'sudo';
  const sudoPasswordless = parseBoolean(env.SSH_SUDO_PASSWORDLESS, true);
  const sudoPassword = env.SSH_SUDO_PASSWORD;
  const sudoUser = env.SSH_SUDO_USER || 'root';

  // Parse priority
  const priority = parseIntWithBounds(
    env.SSH_PRIORITY,
    50,
    0,
    100,
    'SSH_PRIORITY'
  );

  return {
    enabled,
    configPath,
    defaultUser,
    defaultPort,
    defaultKeyPath,
    hostKeyCheck,
    connectionTimeout,
    commandTimeout,
    maxConnections,
    maxConnectionsPerHost,
    idleTimeout,
    concurrencyLimit,
    sudo: {
      enabled: sudoEnabled,
      command: sudoCommand,
      passwordless: sudoPasswordless,
      password: sudoPassword,
      runAsUser: sudoUser,
    },
    priority,
  };
}

/**
 * Validate SSH configuration
 *
 * Performs additional validation checks on the parsed configuration
 * to ensure it's internally consistent and usable.
 *
 * @param config - Parsed SSH configuration
 * @throws ConfigurationError if configuration is invalid
 */
export function validateSSHConfig(config: SSHConfig): void {
  if (!config.enabled) {
    return; // No validation needed for disabled plugin
  }

  // Validate that maxConnectionsPerHost doesn't exceed maxConnections
  if (config.maxConnectionsPerHost > config.maxConnections) {
    throw new ConfigurationError(
      `SSH_MAX_CONNECTIONS_PER_HOST (${config.maxConnectionsPerHost}) cannot exceed SSH_MAX_CONNECTIONS (${config.maxConnections})`
    );
  }

  // Validate sudo configuration
  if (config.sudo.enabled && !config.sudo.passwordless && !config.sudo.password) {
    throw new ConfigurationError(
      'SSH_SUDO_PASSWORD is required when SSH_SUDO_ENABLED is true and SSH_SUDO_PASSWORDLESS is false'
    );
  }
}

/**
 * Parse and validate SSH configuration from environment variables
 *
 * Convenience function that combines parsing and validation.
 *
 * @param env - Environment variables object (defaults to process.env)
 * @returns Parsed and validated SSH configuration
 * @throws ConfigurationError if configuration is invalid
 */
export function loadSSHConfig(env: NodeJS.ProcessEnv = process.env): SSHConfig {
  const config = parseSSHConfig(env);
  validateSSHConfig(config);
  return config;
}
