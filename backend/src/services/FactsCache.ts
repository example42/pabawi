/**
 * Facts Cache Service
 *
 * Provides in-memory caching for node facts with configurable TTL,
 * force refresh support, and per-node caching capabilities.
 * Plugins can opt-in to use this service for caching facts.
 */

import { LoggerService } from './LoggerService.js';

/**
 * Facts data type - flexible record structure
 */
export type Facts = Record<string, unknown>;

/**
 * Cache entry with expiration tracking
 */
interface CacheEntry {
  facts: Facts;
  expiresAt: number;
  cachedAt: number;
}

/**
 * Configuration options for FactsCache
 */
export interface FactsCacheConfig {
  /** Time-to-live in milliseconds (default: 10 minutes) */
  ttl?: number;
  /** Maximum number of cached nodes (default: 1000) */
  maxEntries?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

/**
 * Facts Cache Service
 *
 * Provides in-memory caching with:
 * - Configurable TTL per cache instance
 * - Per-node fact caching
 * - Force refresh capability
 * - Automatic expiration
 * - LRU eviction when max entries exceeded
 * - Cache statistics
 */
export class FactsCache {
  private readonly cache: Map<string, CacheEntry>;
  private readonly ttl: number;
  private readonly maxEntries: number;
  private readonly logger: LoggerService;
  private readonly debug: boolean;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  /**
   * Create a new FactsCache instance
   *
   * @param config - Configuration options
   */
  constructor(config: FactsCacheConfig = {}) {
    this.cache = new Map();
    this.ttl = config.ttl ?? 600000; // Default: 10 minutes
    this.maxEntries = config.maxEntries ?? 1000;
    this.debug = config.debug ?? false;
    this.logger = new LoggerService();

    if (this.debug) {
      this.logger.debug('FactsCache initialized', {
        component: 'FactsCache',
        metadata: { ttl: this.ttl, maxEntries: this.maxEntries },
      });
    }
  }

  /**
   * Get facts for a node from cache
   *
   * @param nodeId - Node identifier
   * @param options - Get options
   * @returns Cached facts or undefined if not found/expired
   */
  public get(
    nodeId: string,
    options: { refresh?: boolean } = {}
  ): Facts | undefined {
    // Force refresh bypasses cache
    if (options.refresh) {
      if (this.debug) {
        this.logger.debug(`Force refresh requested for node: ${nodeId}`, {
          component: 'FactsCache',
          operation: 'get',
        });
      }
      this.misses++;
      return undefined;
    }

    const entry = this.cache.get(nodeId);

    // Cache miss
    if (!entry) {
      this.misses++;
      if (this.debug) {
        this.logger.debug(`Cache miss for node: ${nodeId}`, {
          component: 'FactsCache',
          operation: 'get',
        });
      }
      return undefined;
    }

    // Check expiration
    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.cache.delete(nodeId);
      this.misses++;
      if (this.debug) {
        this.logger.debug(`Cache expired for node: ${nodeId}`, {
          component: 'FactsCache',
          operation: 'get',
          metadata: { age: now - entry.cachedAt },
        });
      }
      return undefined;
    }

    // Cache hit
    this.hits++;
    if (this.debug) {
      this.logger.debug(`Cache hit for node: ${nodeId}`, {
        component: 'FactsCache',
        operation: 'get',
        metadata: { age: now - entry.cachedAt },
      });
    }

    // Update LRU - move to end by deleting and re-adding
    this.cache.delete(nodeId);
    this.cache.set(nodeId, entry);

    return entry.facts;
  }

  /**
   * Set facts for a node in cache
   *
   * @param nodeId - Node identifier
   * @param facts - Facts to cache
   */
  public set(nodeId: string, facts: Facts): void {
    const now = Date.now();
    const entry: CacheEntry = {
      facts,
      expiresAt: now + this.ttl,
      cachedAt: now,
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.maxEntries && !this.cache.has(nodeId)) {
      this.evictOldest();
    }

    // Remove existing entry if present (for LRU update)
    if (this.cache.has(nodeId)) {
      this.cache.delete(nodeId);
    }

    this.cache.set(nodeId, entry);

    if (this.debug) {
      this.logger.debug(`Cached facts for node: ${nodeId}`, {
        component: 'FactsCache',
        operation: 'set',
        metadata: { ttl: this.ttl, size: this.cache.size },
      });
    }
  }

  /**
   * Delete facts for a specific node
   *
   * @param nodeId - Node identifier
   * @returns true if entry was deleted, false if not found
   */
  public delete(nodeId: string): boolean {
    const deleted = this.cache.delete(nodeId);

    if (deleted && this.debug) {
      this.logger.debug(`Deleted cache entry for node: ${nodeId}`, {
        component: 'FactsCache',
        operation: 'delete',
      });
    }

    return deleted;
  }

  /**
   * Clear all cached facts
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();

    if (this.debug) {
      this.logger.debug(`Cleared cache`, {
        component: 'FactsCache',
        operation: 'clear',
        metadata: { entriesCleared: size },
      });
    }
  }

  /**
   * Check if facts for a node are cached and not expired
   *
   * @param nodeId - Node identifier
   * @returns true if cached and not expired
   */
  public has(nodeId: string): boolean {
    const entry = this.cache.get(nodeId);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.cache.delete(nodeId);
      return false;
    }

    return true;
  }

  /**
   * Get the number of cached entries
   *
   * @returns Number of cached node facts
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics
   */
  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;

    if (this.debug) {
      this.logger.debug('Reset cache statistics', {
        component: 'FactsCache',
        operation: 'resetStats',
      });
    }
  }

  /**
   * Get all cached node IDs
   *
   * @returns Array of cached node IDs
   */
  public getNodeIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Evict expired entries
   *
   * @returns Number of entries evicted
   */
  public evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [nodeId, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(nodeId);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.evictions += evicted;
      if (this.debug) {
        this.logger.debug(`Evicted expired entries`, {
          component: 'FactsCache',
          operation: 'evictExpired',
          metadata: { evicted },
        });
      }
    }

    return evicted;
  }

  /**
   * Evict the oldest entry (LRU)
   * @private
   */
  private evictOldest(): void {
    // Map maintains insertion order, so first entry is oldest
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
      this.evictions++;

      if (this.debug) {
        this.logger.debug(`Evicted oldest entry: ${firstKey}`, {
          component: 'FactsCache',
          operation: 'evictOldest',
        });
      }
    }
  }
}
