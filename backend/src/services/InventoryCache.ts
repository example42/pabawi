/**
 * Inventory Cache Service
 *
 * Provides in-memory caching for inventory data with TTL support,
 * cache invalidation, and automatic refresh on expiry.
 * Plugins can opt-in to use this service for caching inventory information.
 */

import { LoggerService } from './LoggerService.js';

/**
 * Node representation in inventory
 */
export interface Node {
  id: string;
  name: string;
  uri?: string;
  transport?: string;
  config?: Record<string, unknown>;
  source?: string;
  groups?: string[];
  metadata?: Record<string, unknown>;
  certificateStatus?: 'signed' | 'requested' | 'revoked';
}

/**
 * Cache entry with expiration tracking
 */
interface InventoryCacheEntry {
  nodes: Node[];
  groups: Map<string, string[]>; // group name -> node IDs
  expiresAt: number;
  cachedAt: number;
}

/**
 * Configuration options for InventoryCache
 */
export interface InventoryCacheConfig {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Enable automatic refresh on expiry (default: false) */
  autoRefresh?: boolean;
  /** Refresh callback function */
  refreshCallback?: () => Promise<Node[]>;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface InventoryCacheStats {
  hasData: boolean;
  nodeCount: number;
  groupCount: number;
  age: number;
  expiresIn: number;
  hits: number;
  misses: number;
  refreshes: number;
  hitRate: number;
}

/**
 * Inventory Cache Service
 *
 * Provides in-memory caching with:
 * - Configurable TTL
 * - Automatic expiration
 * - Cache invalidation
 * - Optional auto-refresh on expiry
 * - Group-based node organization
 * - Cache statistics
 */
export class InventoryCache {
  private cache: InventoryCacheEntry | null = null;
  private readonly ttl: number;
  private readonly autoRefresh: boolean;
  private readonly refreshCallback?: () => Promise<Node[]>;
  private readonly logger: LoggerService;
  private readonly debug: boolean;

  // Statistics
  private hits = 0;
  private misses = 0;
  private refreshes = 0;

  /**
   * Create a new InventoryCache instance
   *
   * @param config - Configuration options
   */
  constructor(config: InventoryCacheConfig = {}) {
    this.ttl = config.ttl ?? 300000; // Default: 5 minutes
    this.autoRefresh = config.autoRefresh ?? false;
    this.refreshCallback = config.refreshCallback;
    this.debug = config.debug ?? false;
    this.logger = new LoggerService();

    if (this.debug) {
      this.logger.debug('InventoryCache initialized', {
        component: 'InventoryCache',
        metadata: {
          ttl: this.ttl,
          autoRefresh: this.autoRefresh,
          hasRefreshCallback: !!this.refreshCallback,
        },
      });
    }
  }

  /**
   * Get all nodes from cache
   *
   * @param options - Get options
   * @returns Cached nodes or undefined if not found/expired
   */
  public async getNodes(
    options: { refresh?: boolean } = {}
  ): Promise<Node[] | undefined> {
    // Force refresh bypasses cache
    if (options.refresh) {
      if (this.debug) {
        this.logger.debug('Force refresh requested', {
          component: 'InventoryCache',
          operation: 'getNodes',
        });
      }
      this.misses++;
      return undefined;
    }

    // Check if cache exists
    if (!this.cache) {
      this.misses++;
      if (this.debug) {
        this.logger.debug('Cache miss - no data', {
          component: 'InventoryCache',
          operation: 'getNodes',
        });
      }
      return undefined;
    }

    // Check expiration
    const now = Date.now();
    if (now >= this.cache.expiresAt) {
      if (this.debug) {
        this.logger.debug('Cache expired', {
          component: 'InventoryCache',
          operation: 'getNodes',
          metadata: { age: now - this.cache.cachedAt },
        });
      }

      // Auto-refresh if enabled
      if (this.autoRefresh && this.refreshCallback) {
        try {
          const nodes = await this.refreshCallback();
          this.set(nodes);
          this.refreshes++;
          this.hits++;
          return nodes;
        } catch (error) {
          this.logger.error(
            'Auto-refresh failed',
            {
              component: 'InventoryCache',
              operation: 'getNodes',
            },
            error as Error
          );
          this.misses++;
          return undefined;
        }
      }

      this.cache = null;
      this.misses++;
      return undefined;
    }

    // Cache hit
    this.hits++;
    if (this.debug) {
      this.logger.debug('Cache hit', {
        component: 'InventoryCache',
        operation: 'getNodes',
        metadata: {
          nodeCount: this.cache.nodes.length,
          age: now - this.cache.cachedAt,
        },
      });
    }

    return this.cache.nodes;
  }

  /**
   * Get nodes by group from cache
   *
   * @param group - Group name
   * @returns Cached nodes in the group or undefined if not found/expired
   */
  public async getNodesByGroup(group: string): Promise<Node[] | undefined> {
    const nodes = await this.getNodes();
    if (!nodes || !this.cache) {
      return undefined;
    }

    const nodeIds = this.cache.groups.get(group);
    if (!nodeIds) {
      return [];
    }

    return nodes.filter(node => nodeIds.includes(node.id));
  }

  /**
   * Get all groups from cache
   *
   * @returns Array of group names or undefined if cache expired
   */
  public async getGroups(): Promise<string[] | undefined> {
    const nodes = await this.getNodes();
    if (!nodes || !this.cache) {
      return undefined;
    }

    return Array.from(this.cache.groups.keys());
  }

  /**
   * Set inventory data in cache
   *
   * @param nodes - Nodes to cache
   */
  public set(nodes: Node[]): void {
    const now = Date.now();

    // Build group index
    const groups = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.groups) {
        for (const group of node.groups) {
          if (!groups.has(group)) {
            groups.set(group, []);
          }
          groups.get(group)!.push(node.id);
        }
      }
    }

    this.cache = {
      nodes,
      groups,
      expiresAt: now + this.ttl,
      cachedAt: now,
    };

    if (this.debug) {
      this.logger.debug('Cached inventory data', {
        component: 'InventoryCache',
        operation: 'set',
        metadata: {
          nodeCount: nodes.length,
          groupCount: groups.size,
          ttl: this.ttl,
        },
      });
    }
  }

  /**
   * Invalidate the cache
   */
  public invalidate(): void {
    const hadData = this.cache !== null;
    this.cache = null;

    if (hadData && this.debug) {
      this.logger.debug('Cache invalidated', {
        component: 'InventoryCache',
        operation: 'invalidate',
      });
    }
  }

  /**
   * Check if cache has valid data
   *
   * @returns true if cache has data and is not expired
   */
  public hasValidData(): boolean {
    if (!this.cache) {
      return false;
    }

    const now = Date.now();
    return now < this.cache.expiresAt;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  public getStats(): InventoryCacheStats {
    const now = Date.now();
    const total = this.hits + this.misses;

    return {
      hasData: this.cache !== null,
      nodeCount: this.cache?.nodes.length ?? 0,
      groupCount: this.cache?.groups.size ?? 0,
      age: this.cache ? now - this.cache.cachedAt : 0,
      expiresIn: this.cache ? Math.max(0, this.cache.expiresAt - now) : 0,
      hits: this.hits,
      misses: this.misses,
      refreshes: this.refreshes,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics
   */
  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.refreshes = 0;

    if (this.debug) {
      this.logger.debug('Reset cache statistics', {
        component: 'InventoryCache',
        operation: 'resetStats',
      });
    }
  }

  /**
   * Refresh cache using the configured callback
   *
   * @returns true if refresh succeeded, false otherwise
   */
  public async refresh(): Promise<boolean> {
    if (!this.refreshCallback) {
      this.logger.warn('No refresh callback configured', {
        component: 'InventoryCache',
        operation: 'refresh',
      });
      return false;
    }

    try {
      const nodes = await this.refreshCallback();
      this.set(nodes);
      this.refreshes++;

      if (this.debug) {
        this.logger.debug('Cache refreshed successfully', {
          component: 'InventoryCache',
          operation: 'refresh',
          metadata: { nodeCount: nodes.length },
        });
      }

      return true;
    } catch (error) {
      this.logger.error(
        'Cache refresh failed',
        {
          component: 'InventoryCache',
          operation: 'refresh',
        },
        error as Error
      );
      return false;
    }
  }

  /**
   * Get time until cache expires
   *
   * @returns Milliseconds until expiration, or 0 if expired/no cache
   */
  public getTimeUntilExpiry(): number {
    if (!this.cache) {
      return 0;
    }

    const now = Date.now();
    return Math.max(0, this.cache.expiresAt - now);
  }

  /**
   * Get cache age
   *
   * @returns Milliseconds since cache was created, or 0 if no cache
   */
  public getCacheAge(): number {
    if (!this.cache) {
      return 0;
    }

    const now = Date.now();
    return now - this.cache.cachedAt;
  }
}
