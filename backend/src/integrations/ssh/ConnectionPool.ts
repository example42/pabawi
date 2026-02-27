/**
 * Connection Pool for SSH Integration
 *
 * Manages SSH connection lifecycle with pooling, reuse, and cleanup.
 * Implements LRU eviction and idle connection cleanup.
 */

import { Client } from 'ssh2';
import { SSHHost, PooledConnection, PoolConfig, SSHErrorType } from './types';
import { LoggerService } from '../../services/LoggerService';

/**
 * Connection pool for managing SSH connections
 *
 * Features:
 * - Connection reuse for performance
 * - LRU eviction when pool reaches max size
 * - Periodic idle connection cleanup
 * - Connection health monitoring
 * - Per-host connection limits
 */
export class ConnectionPool {
  private connections: Map<string, PooledConnection>;
  private config: PoolConfig;
  private cleanupInterval?: NodeJS.Timeout;
  private logger?: LoggerService;

  constructor(config: PoolConfig, logger?: LoggerService) {
    this.connections = new Map();
    this.config = config;
    this.logger = logger;

    this.logger?.debug('ConnectionPool initialized', {
      component: 'ConnectionPool',
      integration: 'ssh',
      operation: 'constructor',
      metadata: {
        maxConnections: config.maxConnections,
        maxConnectionsPerHost: config.maxConnectionsPerHost,
        idleTimeout: config.idleTimeout,
        cleanupInterval: config.cleanupInterval,
      },
    });
  }

  /**
   * Start the connection pool and begin cleanup interval
   */
  start(): void {
    if (!this.cleanupInterval) {
      this.startCleanup();
    }
  }

  /**
   * Stop the connection pool and cleanup interval
   */
  stop(): void {
    this.stopCleanup();
  }

  /**
   * Acquire a connection from the pool or create a new one
   *
   * @param host - SSH host configuration
   * @param createConnection - Function to create new SSH connection
   * @returns SSH client instance
   */
  async acquire(
    host: SSHHost,
    createConnection: (host: SSHHost) => Promise<Client>
  ): Promise<Client> {
    const hostKey = this.getHostKey(host);

    this.logger?.debug('Acquiring connection from pool', {
      component: 'ConnectionPool',
      integration: 'ssh',
      operation: 'acquire',
      metadata: {
        hostKey,
        poolSize: this.connections.size,
      },
    });

    // Check if connection exists and is healthy
    const existing = this.connections.get(hostKey);
    if (existing && !existing.inUse) {
      // Test connection health
      const isHealthy = await this.testConnection(existing.client);

      if (isHealthy) {
        // Mark as in use and update timestamp
        existing.inUse = true;
        existing.lastUsed = Date.now();

        this.logger?.debug('Reusing existing connection', {
          component: 'ConnectionPool',
          integration: 'ssh',
          operation: 'acquire',
          metadata: {
            hostKey,
            reused: true,
          },
        });

        return existing.client;
      } else {
        // Remove unhealthy connection
        this.logger?.warn('Removing unhealthy connection', {
          component: 'ConnectionPool',
          integration: 'ssh',
          operation: 'acquire',
          metadata: {
            hostKey,
          },
        });

        await this.remove(hostKey);
      }
    }

    // Check per-host connection limit
    const hostConnections = this.getHostConnectionCount(hostKey);
    if (hostConnections >= this.config.maxConnectionsPerHost) {
      const error = new Error(
        `Maximum connections per host (${this.config.maxConnectionsPerHost}) reached for ${hostKey}`
      );

      this.logger?.error('Per-host connection limit reached', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'acquire',
        metadata: {
          hostKey,
          currentConnections: hostConnections,
          maxConnectionsPerHost: this.config.maxConnectionsPerHost,
        },
      }, error);

      throw error;
    }

    // Check total connection limit and evict if necessary
    if (this.connections.size >= this.config.maxConnections) {
      this.logger?.debug('Pool at capacity, evicting LRU connection', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'acquire',
        metadata: {
          poolSize: this.connections.size,
          maxConnections: this.config.maxConnections,
        },
      });

      await this.evictLRU();
    }

    // Create new connection
    try {
      const client = await createConnection(host);

      // Store in pool
      this.connections.set(hostKey, {
        client,
        host,
        lastUsed: Date.now(),
        inUse: true,
      });

      this.logger?.debug('New connection created and added to pool', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'acquire',
        metadata: {
          hostKey,
          poolSize: this.connections.size,
        },
      });

      return client;
    } catch (error) {
      this.logger?.error('Failed to create new connection', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'acquire',
        metadata: {
          hostKey,
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   *
   * @param hostKey - Host key identifying the connection
   */
  async release(hostKey: string): Promise<void> {
    const connection = this.connections.get(hostKey);

    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();

      this.logger?.debug('Connection released back to pool', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'release',
        metadata: {
          hostKey,
        },
      });
    }
  }

  /**
   * Remove a connection from the pool
   *
   * @param hostKey - Host key identifying the connection
   */
  async remove(hostKey: string): Promise<void> {
    const connection = this.connections.get(hostKey);

    if (connection) {
      try {
        connection.client.end();
        this.connections.delete(hostKey);

        this.logger?.debug('Connection removed from pool', {
          component: 'ConnectionPool',
          integration: 'ssh',
          operation: 'remove',
          metadata: {
            hostKey,
            poolSize: this.connections.size,
          },
        });
      } catch (error) {
        // Log error but continue with removal
        this.logger?.warn('Error closing connection during removal', {
          component: 'ConnectionPool',
          integration: 'ssh',
          operation: 'remove',
          metadata: {
            hostKey,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        // Still remove from pool even if close failed
        this.connections.delete(hostKey);
      }
    }
  }

  /**
   * Close all connections and clear the pool
   */
  async closeAll(): Promise<void> {
    this.logger?.info('Closing all connections in pool', {
      component: 'ConnectionPool',
      integration: 'ssh',
      operation: 'closeAll',
      metadata: {
        connectionCount: this.connections.size,
      },
    });

    const promises: Promise<void>[] = [];

    for (const [hostKey] of this.connections) {
      promises.push(this.remove(hostKey));
    }

    await Promise.all(promises);
    this.stopCleanup();

    this.logger?.info('All connections closed', {
      component: 'ConnectionPool',
      integration: 'ssh',
      operation: 'closeAll',
    });
  }

  /**
   * Get the number of connections for a specific host
   */
  private getHostConnectionCount(hostKey: string): number {
    let count = 0;

    for (const [key] of this.connections) {
      if (key === hostKey) {
        count++;
      }
    }

    return count;
  }

  /**
   * Generate a unique key for a host
   * Format: user@host:port
   */
  private getHostKey(host: SSHHost): string {
    const user = host.user || 'root';
    const port = host.port || 22;

    // Extract hostname from URI if present
    let hostname = host.uri;
    if (hostname.startsWith('ssh://')) {
      hostname = hostname.substring(6);
    }

    // Remove any port from URI
    const colonIndex = hostname.indexOf(':');
    if (colonIndex !== -1) {
      hostname = hostname.substring(0, colonIndex);
    }

    return `${user}@${hostname}:${port}`;
  }

  /**
   * Test if a connection is still healthy
   */
  private async testConnection(client: Client): Promise<boolean> {
    return new Promise((resolve) => {
      // Simple health check - try to execute a basic command
      client.exec('echo test', (err, stream) => {
        if (err) {
          resolve(false);
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.on('close', () => {
          resolve(output.trim() === 'test');
        });

        stream.on('error', () => {
          resolve(false);
        });
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  }

  /**
   * Evict the least recently used connection
   */
  private async evictLRU(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find the least recently used connection that's not in use
    for (const [key, connection] of this.connections) {
      if (!connection.inUse && connection.lastUsed < oldestTime) {
        oldestKey = key;
        oldestTime = connection.lastUsed;
      }
    }

    // If no idle connection found, find the oldest one regardless
    if (oldestKey === null) {
      for (const [key, connection] of this.connections) {
        if (connection.lastUsed < oldestTime) {
          oldestKey = key;
          oldestTime = connection.lastUsed;
        }
      }
    }

    if (oldestKey) {
      this.logger?.debug('Evicting LRU connection', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'evictLRU',
        metadata: {
          hostKey: oldestKey,
          idleTime: Date.now() - oldestTime,
        },
      });

      await this.remove(oldestKey);
    }
  }

  /**
   * Start periodic cleanup of idle connections
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleConnections(),
      this.config.cleanupInterval
    );
  }

  /**
   * Stop periodic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Clean up idle connections that have exceeded the idle timeout
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, connection] of this.connections) {
      // Only cleanup connections that are not in use
      if (!connection.inUse) {
        const idleTime = now - connection.lastUsed;

        if (idleTime > this.config.idleTimeout) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      this.logger?.debug('Cleaning up idle connections', {
        component: 'ConnectionPool',
        integration: 'ssh',
        operation: 'cleanupIdleConnections',
        metadata: {
          idleConnectionCount: keysToRemove.length,
          totalConnections: this.connections.size,
        },
      });

      // Remove idle connections
      for (const key of keysToRemove) {
        await this.remove(key);
      }
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): {
    total: number;
    inUse: number;
    idle: number;
  } {
    let inUse = 0;
    let idle = 0;

    for (const connection of this.connections.values()) {
      if (connection.inUse) {
        inUse++;
      } else {
        idle++;
      }
    }

    return {
      total: this.connections.size,
      inUse,
      idle,
    };
  }
}
