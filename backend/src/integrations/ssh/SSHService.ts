/**
 * SSH Service for SSH Integration
 *
 * Handles SSH connection establishment, authentication, command execution,
 * and package management operations. Integrates with ConnectionPool for
 * connection reuse and efficiency.
 */

import { Client, ConnectConfig } from 'ssh2';
import { readFileSync, statSync } from 'fs';
import { ConnectionPool } from './ConnectionPool';
import { PackageManagerDetector } from './PackageManagerDetector';
import {
  SSHConfig,
  SSHHost,
  ExecutionOptions,
  CommandResult,
  SudoOptions,
  SSHErrorType,
  PoolConfig,
} from './types';
import { LoggerService } from '../../services/LoggerService';

/**
 * SSH Service for managing SSH connections and command execution
 *
 * Features:
 * - Connection establishment with multiple authentication methods
 * - Connection pooling for performance
 * - Command execution with timeout support
 * - Package management operations
 * - Privilege escalation (sudo) support
 * - Host key verification
 */
export class SSHService {
  private connectionPool: ConnectionPool;
  private packageDetector: PackageManagerDetector;
  private config: SSHConfig;
  private logger: LoggerService;

  constructor(config: SSHConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;

    // Initialize connection pool
    const poolConfig: PoolConfig = {
      maxConnections: config.maxConnections,
      maxConnectionsPerHost: config.maxConnectionsPerHost,
      idleTimeout: config.idleTimeout * 1000, // Convert to milliseconds
      cleanupInterval: 60000, // 60 seconds
    };

    this.connectionPool = new ConnectionPool(poolConfig, logger);
    this.packageDetector = new PackageManagerDetector(logger);

    // Start connection pool
    this.connectionPool.start();

    this.logger.info('SSHService initialized', {
      component: 'SSHService',
      integration: 'ssh',
      operation: 'constructor',
      metadata: {
        maxConnections: config.maxConnections,
        maxConnectionsPerHost: config.maxConnectionsPerHost,
        idleTimeout: config.idleTimeout,
      },
    });
  }

  /**
   * Connect to an SSH host
   *
   * Establishes an SSH connection using the configured authentication method.
   * Supports key-based and password authentication, with host key verification.
   *
   * @param host - SSH host configuration
   * @returns SSH client instance
   * @throws Error if connection fails
   */
  async connect(host: SSHHost): Promise<Client> {
    const startTime = Date.now();

    this.logger.debug('Attempting SSH connection', {
      component: 'SSHService',
      integration: 'ssh',
      operation: 'connect',
      metadata: {
        host: host.name,
        uri: host.uri,
        user: host.user || this.config.defaultUser,
      },
    });

    try {
      const client = await this.connectionPool.acquire(
        host,
        (h) => this.createConnection(h)
      );

      const duration = Date.now() - startTime;

      this.logger.info('SSH connection established', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'connect',
        metadata: {
          host: host.name,
          duration,
        },
      });

      return client;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('SSH connection failed', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'connect',
        metadata: {
          host: host.name,
          duration,
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      throw error;
    }
  }

  /**
   * Disconnect from an SSH host
   *
   * Releases the connection back to the pool or removes it if requested.
   *
   * @param host - SSH host configuration
   */
  async disconnect(host: SSHHost): Promise<void> {
    const hostKey = this.getHostKey(host);

    this.logger.debug('Disconnecting from SSH host', {
      component: 'SSHService',
      integration: 'ssh',
      operation: 'disconnect',
      metadata: {
        host: host.name,
      },
    });

    await this.connectionPool.release(hostKey);
  }

  /**
   * Test SSH connection to a host
   *
   * Attempts to establish a connection and execute a simple command
   * to verify connectivity and authentication.
   *
   * @param host - SSH host configuration
   * @returns true if connection successful, false otherwise
   */
  async testConnection(host: SSHHost): Promise<boolean> {
    try {
      const client = await this.connect(host);

      // Execute a simple test command
      const result = await this.executeCommandOnClient(
        client,
        'echo test',
        { timeout: 5 }
      );

      await this.disconnect(host);

      return result.exitCode === 0 && result.stdout.trim() === 'test';
    } catch (error) {
      this.logger.warn('Connection test failed', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'testConnection',
        metadata: {
          host: host.name,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return false;
    }
  }

  /**
   * Execute a command on a remote host
   *
   * @param host - SSH host configuration
   * @param command - Command to execute
   * @param options - Execution options
   * @returns Command execution result
   */
  async executeCommand(
    host: SSHHost,
    command: string,
    options?: ExecutionOptions
  ): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      const client = await this.connect(host);

      // Wrap command with sudo if requested
      let finalCommand = command;
      if (options?.sudo || this.config.sudo.enabled) {
        finalCommand = this.wrapWithSudo(command, {
          enabled: true,
          command: this.config.sudo.command,
          runAsUser: options?.sudoUser || this.config.sudo.runAsUser,
          password: this.config.sudo.password,
        });
      }

      const result = await this.executeCommandOnClient(
        client,
        finalCommand,
        options
      );

      await this.disconnect(host);

      const duration = Date.now() - startTime;

      this.logger.info('Command executed', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'executeCommand',
        metadata: {
          host: host.name,
          command: this.obfuscateSensitiveData(command),
          exitCode: result.exitCode,
          duration,
        },
      });

      return {
        ...result,
        host: host.name,
        command: this.obfuscateSensitiveData(command),
        timestamp: new Date().toISOString(),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Command execution failed', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'executeCommand',
        metadata: {
          host: host.name,
          command: this.obfuscateSensitiveData(command),
          duration,
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        duration,
        host: host.name,
        command: this.obfuscateSensitiveData(command),
        timestamp: new Date().toISOString(),
        success: false,
        error: {
          type: this.getErrorType(error),
          message: error instanceof Error ? error.message : String(error),
          details: error,
        },
      };
    }
  }

  /**
   * Execute a command on multiple hosts in parallel
   *
   * @param hosts - Array of SSH host configurations
   * @param command - Command to execute
   * @param options - Execution options
   * @returns Map of host names to command results
   */
  async executeOnMultipleHosts(
    hosts: SSHHost[],
    command: string,
    options?: ExecutionOptions
  ): Promise<Map<string, CommandResult>> {
    const results = new Map<string, CommandResult>();

    // Execute commands in parallel with concurrency limit
    const limit = this.config.concurrencyLimit;
    const batches: SSHHost[][] = [];

    for (let i = 0; i < hosts.length; i += limit) {
      batches.push(hosts.slice(i, i + limit));
    }

    for (const batch of batches) {
      const promises = batch.map(async (host) => {
        const result = await this.executeCommand(host, command, options);
        results.set(host.name, result);
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Install a package on a remote host
   *
   * @param host - SSH host configuration
   * @param packageName - Name of package to install
   * @returns Command execution result
   */
  async installPackage(host: SSHHost, packageName: string): Promise<CommandResult> {
    const client = await this.connect(host);
    const hostKey = this.getHostKey(host);
    const packageManager = await this.packageDetector.detect(client, hostKey);

    if (packageManager === 'unknown') {
      await this.disconnect(host);

      return {
        stdout: '',
        stderr: 'No supported package manager detected on host',
        exitCode: -1,
        duration: 0,
        host: host.name,
        command: `install ${packageName}`,
        timestamp: new Date().toISOString(),
        success: false,
        error: {
          type: SSHErrorType.COMMAND_FAILED,
          message: 'No supported package manager detected',
        },
      };
    }

    const command = this.packageDetector.getInstallCommand(packageManager, packageName);
    await this.disconnect(host);

    return this.executeCommand(host, command, { sudo: true });
  }

  /**
   * Remove a package from a remote host
   *
   * @param host - SSH host configuration
   * @param packageName - Name of package to remove
   * @returns Command execution result
   */
  async removePackage(host: SSHHost, packageName: string): Promise<CommandResult> {
    const client = await this.connect(host);
    const hostKey = this.getHostKey(host);
    const packageManager = await this.packageDetector.detect(client, hostKey);

    if (packageManager === 'unknown') {
      await this.disconnect(host);

      return {
        stdout: '',
        stderr: 'No supported package manager detected on host',
        exitCode: -1,
        duration: 0,
        host: host.name,
        command: `remove ${packageName}`,
        timestamp: new Date().toISOString(),
        success: false,
        error: {
          type: SSHErrorType.COMMAND_FAILED,
          message: 'No supported package manager detected',
        },
      };
    }

    const command = this.packageDetector.getRemoveCommand(packageManager, packageName);
    await this.disconnect(host);

    return this.executeCommand(host, command, { sudo: true });
  }

  /**
   * Update a package on a remote host
   *
   * @param host - SSH host configuration
   * @param packageName - Name of package to update
   * @returns Command execution result
   */
  async updatePackage(host: SSHHost, packageName: string): Promise<CommandResult> {
    const client = await this.connect(host);
    const hostKey = this.getHostKey(host);
    const packageManager = await this.packageDetector.detect(client, hostKey);

    if (packageManager === 'unknown') {
      await this.disconnect(host);

      return {
        stdout: '',
        stderr: 'No supported package manager detected on host',
        exitCode: -1,
        duration: 0,
        host: host.name,
        command: `update ${packageName}`,
        timestamp: new Date().toISOString(),
        success: false,
        error: {
          type: SSHErrorType.COMMAND_FAILED,
          message: 'No supported package manager detected',
        },
      };
    }

    const command = this.packageDetector.getUpdateCommand(packageManager, packageName);
    await this.disconnect(host);

    return this.executeCommand(host, command, { sudo: true });
  }

  /**
   * Cleanup and close all connections
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up SSH service', {
      component: 'SSHService',
      integration: 'ssh',
      operation: 'cleanup',
    });

    await this.connectionPool.closeAll();
  }

  /**
   * Create a new SSH connection
   *
   * @param host - SSH host configuration
   * @returns Connected SSH client
   */
  private async createConnection(host: SSHHost): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      // Parse host URI
      const hostname = this.parseHostname(host.uri);
      const user = host.user || this.config.defaultUser;
      const port = host.port || this.config.defaultPort;

      // Build connection config
      const connectConfig: ConnectConfig = {
        host: hostname,
        port,
        username: user,
        readyTimeout: this.config.connectionTimeout * 1000,
      };

      // Configure authentication
      if (host.password) {
        connectConfig.password = host.password;
      } else {
        const keyPath = host.privateKeyPath || this.config.defaultKeyPath;

        if (keyPath) {
          try {
            // Check key file permissions
            this.checkKeyPermissions(keyPath);

            connectConfig.privateKey = readFileSync(keyPath);
          } catch (error) {
            reject(new Error(`Failed to read private key: ${error instanceof Error ? error.message : String(error)}`));
            return;
          }
        } else {
          // Try SSH agent
          connectConfig.agent = process.env.SSH_AUTH_SOCK;
        }
      }

      // Configure host key verification
      if (!this.config.hostKeyCheck) {
        connectConfig.hostVerifier = () => true;
      }

      // Set up event handlers
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error(`Connection timeout after ${this.config.connectionTimeout} seconds`));
      }, this.config.connectionTimeout * 1000);

      client.on('ready', () => {
        clearTimeout(timeout);
        resolve(client);
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Connect
      client.connect(connectConfig);
    });
  }

  /**
   * Execute a command on an SSH client
   *
   * @param client - SSH client instance
   * @param command - Command to execute
   * @param options - Execution options
   * @returns Command result
   */
  private async executeCommandOnClient(
    client: Client,
    command: string,
    options?: ExecutionOptions
  ): Promise<Omit<CommandResult, 'host' | 'timestamp' | 'duration'>> {
    return new Promise((resolve, reject) => {
      const timeout = options?.timeout || this.config.commandTimeout;
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeout} seconds`));
      }, timeout * 1000);

      client.exec(command, { env: options?.env }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number) => {
          clearTimeout(timer);

          resolve({
            stdout,
            stderr,
            exitCode: code,
            command,
            success: code === 0,
          });
        });

        stream.on('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    });
  }

  /**
   * Wrap a command with sudo
   *
   * @param command - Original command
   * @param options - Sudo options
   * @returns Command wrapped with sudo
   */
  private wrapWithSudo(command: string, options: SudoOptions): string {
    if (!options.enabled) {
      return command;
    }

    let sudoCmd = options.command;

    if (options.runAsUser && options.runAsUser !== 'root') {
      // Validate username to prevent shell injection
      const usernamePattern = /^[a-z_][a-z0-9_-]{0,31}$/;
      if (!usernamePattern.test(options.runAsUser)) {
        throw new Error(
          `Invalid sudo runAsUser '${options.runAsUser}': must be a valid Unix username`,
        );
      }
      sudoCmd += ` -u ${options.runAsUser}`;
    }

    return `${sudoCmd} ${command}`;
  }

  /**
   * Parse hostname from SSH URI
   *
   * @param uri - SSH URI (e.g., ssh://192.168.1.10 or 192.168.1.10)
   * @returns Hostname
   */
  private parseHostname(uri: string): string {
    let hostname = uri;

    if (hostname.startsWith('ssh://')) {
      hostname = hostname.substring(6);
    }

    // Remove port if present
    const colonIndex = hostname.indexOf(':');
    if (colonIndex !== -1) {
      hostname = hostname.substring(0, colonIndex);
    }

    return hostname;
  }

  /**
   * Generate a unique key for a host
   *
   * @param host - SSH host configuration
   * @returns Host key
   */
  private getHostKey(host: SSHHost): string {
    const user = host.user || this.config.defaultUser;
    const port = host.port || this.config.defaultPort;
    const hostname = this.parseHostname(host.uri);

    return `${user}@${hostname}:${port}`;
  }

  /**
   * Check private key file permissions
   *
   * @param keyPath - Path to private key file
   */
  private checkKeyPermissions(keyPath: string): void {
    try {
      const stats = statSync(keyPath);
      const mode = stats.mode & 0o777;

      // Warn if permissions are more permissive than 0600
      if (mode > 0o600) {
        this.logger.warn('Private key has insecure permissions', {
          component: 'SSHService',
          integration: 'ssh',
          operation: 'checkKeyPermissions',
          metadata: {
            keyPath,
            permissions: mode.toString(8),
            recommended: '0600',
          },
        });
      }
    } catch (error) {
      // If we can't check permissions, log but don't fail
      this.logger.debug('Could not check key permissions', {
        component: 'SSHService',
        integration: 'ssh',
        operation: 'checkKeyPermissions',
        metadata: {
          keyPath,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Obfuscate sensitive data in commands and logs
   *
   * @param text - Text to obfuscate
   * @returns Obfuscated text
   */
  private obfuscateSensitiveData(text: string): string {
    let result = text;

    // Obfuscate password patterns (with = or : separator)
    result = result.replace(/password[=:]\s*['"]?[^'"\s]+['"]?/gi, 'password=[REDACTED]');
    result = result.replace(/passwd[=:]\s*['"]?[^'"\s]+['"]?/gi, 'passwd=[REDACTED]');

    // Obfuscate password after -p flag (common in mysql, etc.)
    result = result.replace(/-p\s+(\S+)/g, '-p [REDACTED]');

    // Obfuscate key patterns
    result = result.replace(/-----BEGIN [A-Z\s]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+ PRIVATE KEY-----/g, '[PRIVATE_KEY]');

    return result;
  }

  /**
   * Determine error type from error object
   *
   * @param error - Error object
   * @returns SSH error type
   */
  private getErrorType(error: unknown): string {
    if (!(error instanceof Error)) {
      return SSHErrorType.UNKNOWN_ERROR;
    }

    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return message.includes('connection')
        ? SSHErrorType.CONNECTION_TIMEOUT
        : SSHErrorType.COMMAND_TIMEOUT;
    }

    if (message.includes('refused') || message.includes('econnrefused')) {
      return SSHErrorType.CONNECTION_REFUSED;
    }

    if (message.includes('authentication') || message.includes('auth')) {
      return SSHErrorType.AUTHENTICATION_FAILED;
    }

    if (message.includes('host key')) {
      return SSHErrorType.HOST_KEY_VERIFICATION_FAILED;
    }

    if (message.includes('permission denied')) {
      return SSHErrorType.PERMISSION_DENIED;
    }

    if (message.includes('command not found') || message.includes('not found')) {
      return SSHErrorType.COMMAND_NOT_FOUND;
    }

    if (message.includes('network') || message.includes('unreachable')) {
      return SSHErrorType.NETWORK_ERROR;
    }

    return SSHErrorType.UNKNOWN_ERROR;
  }
}
