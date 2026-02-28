/**
 * Type definitions for SSH Integration
 *
 * This module defines all TypeScript interfaces and types used throughout
 * the SSH integration plugin for Pabawi.
 */

import { Client } from 'ssh2';

/**
 * SSH plugin configuration loaded from environment variables
 */
export interface SSHConfig {
  /** Whether the SSH plugin is enabled */
  enabled: boolean;

  /** Path to SSH config file */
  configPath?: string;

  /** Default SSH username */
  defaultUser: string;

  /** Default SSH port */
  defaultPort: number;

  /** Default private key path */
  defaultKeyPath?: string;

  /** Whether to verify SSH host keys */
  hostKeyCheck: boolean;

  /** Connection timeout in seconds (5-300) */
  connectionTimeout: number;

  /** Command execution timeout in seconds (10-3600) */
  commandTimeout: number;

  /** Maximum total connections in pool */
  maxConnections: number;

  /** Maximum connections per host */
  maxConnectionsPerHost: number;

  /** Idle connection timeout in seconds */
  idleTimeout: number;

  /** Maximum concurrent command executions */
  concurrencyLimit: number;

  /** Sudo configuration */
  sudo: {
    /** Whether sudo is enabled */
    enabled: boolean;

    /** Sudo command prefix (default: "sudo") */
    command: string;

    /** Whether sudo is passwordless */
    passwordless: boolean;

    /** Sudo password (if not passwordless) */
    password?: string;

    /** User to run commands as (default: "root") */
    runAsUser?: string;
  };

  /** Plugin priority for inventory deduplication */
  priority: number;
}

/**
 * SSH target host configuration
 */
export interface SSHHost {
  /** Unique host name */
  name: string;

  /** SSH URI (e.g., ssh://192.168.1.10) */
  uri: string;

  /** Optional host alias */
  alias?: string;

  /** SSH username (overrides default) */
  user?: string;

  /** SSH port (overrides default) */
  port?: number;

  /** Private key path (overrides default) */
  privateKeyPath?: string;

  /** Password for authentication (if not using keys) */
  password?: string;

  /** Host groups for organization */
  groups?: string[];
}

/**
 * Options for command execution
 */
export interface ExecutionOptions {
  /** Command timeout in seconds */
  timeout?: number;

  /** Whether to use sudo */
  sudo?: boolean;

  /** User to run command as (with sudo) */
  sudoUser?: string;

  /** Environment variables for command */
  env?: Record<string, string>;

  /** Working directory for command */
  cwd?: string;
}

/**
 * Result from command execution
 */
export interface CommandResult {
  /** Standard output from command */
  stdout: string;

  /** Standard error from command */
  stderr: string;

  /** Command exit code */
  exitCode: number;

  /** Execution duration in milliseconds */
  duration: number;

  /** Target host name */
  host: string;

  /** Executed command */
  command: string;

  /** Execution timestamp (ISO 8601) */
  timestamp: string;

  /** Whether execution was successful */
  success?: boolean;

  /** Error details if execution failed */
  error?: {
    type: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Pooled SSH connection with metadata
 */
export interface PooledConnection {
  /** SSH2 client instance */
  client: Client;

  /** Host configuration */
  host: SSHHost;

  /** Last used timestamp (milliseconds since epoch) */
  lastUsed: number;

  /** Whether connection is currently in use */
  inUse: boolean;
}

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  /** Maximum total connections */
  maxConnections: number;

  /** Maximum connections per host */
  maxConnectionsPerHost: number;

  /** Idle timeout in milliseconds */
  idleTimeout: number;

  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
}

/**
 * Supported Linux package managers
 */
export type PackageManager = 'apt' | 'yum' | 'dnf' | 'zypper' | 'pacman' | 'unknown';

/**
 * Package operation types
 */
export type PackageOperation = 'install' | 'remove' | 'update';

/**
 * Sudo execution options
 */
export interface SudoOptions {
  /** Whether sudo is enabled */
  enabled: boolean;

  /** Sudo command prefix */
  command: string;

  /** User to run as */
  runAsUser?: string;

  /** Sudo password */
  password?: string;
}

/**
 * SSH connection error types
 */
export enum SSHErrorType {
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  HOST_KEY_VERIFICATION_FAILED = 'HOST_KEY_VERIFICATION_FAILED',
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  COMMAND_FAILED = 'COMMAND_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  POOL_EXHAUSTED = 'POOL_EXHAUSTED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * SSH error with detailed information
 */
export interface SSHError extends Error {
  /** Error type */
  type: SSHErrorType;

  /** Host where error occurred */
  host?: string;

  /** Additional error details */
  details?: unknown;
}
