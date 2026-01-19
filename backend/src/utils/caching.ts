/**
 * Caching Utilities
 *
 * Consolidates duplicate caching patterns across the codebase.
 * Provides a unified caching interface with TTL support.
 */

/**
 * Cache entry with TTL
 */
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  ttl: number;
  maxEntries?: number;
}

/**
 * Simple in-memory cache with TTL support
 *
 * This class consolidates the duplicate SimpleCache implementations
 * found in PuppetDBService and PuppetserverService.
 */
export class SimpleCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxEntries: number;

  constructor(config: CacheConfig) {
    this.ttl = config.ttl;
    this.maxEntries = config.maxEntries ?? 1000;
  }

  /**
   * Get cached value if not expired
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Set cached value with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Optional TTL override (uses default if not provided)
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Enforce max entries limit using LRU eviction
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry (first entry in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + (ttlMs ?? this.ttl),
    });
  }

  /**
   * Check if a key exists and is not expired
   *
   * @param key - Cache key
   * @returns True if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific cache entry
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttl: this.ttl,
    };
  }
}

/**
 * Cache entry with timestamp for services that track cache time
 */
export interface TimestampedCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Check if a cache entry is valid (not expired)
 *
 * @param entry - Cache entry to check
 * @param ttl - Time to live in milliseconds
 * @returns True if entry is valid
 */
export function isCacheValid<T>(
  entry: TimestampedCacheEntry<T> | null,
  ttl: number
): boolean {
  if (!entry) {
    return false;
  }

  const now = Date.now();
  return now - entry.timestamp < ttl;
}

/**
 * Create a cache entry with timestamp
 *
 * @param data - Data to cache
 * @param ttl - Time to live in milliseconds
 * @returns Cache entry with timestamp
 */
export function createCacheEntry<T>(
  data: T,
  ttl: number
): TimestampedCacheEntry<T> {
  const now = Date.now();
  return {
    data,
    timestamp: now,
    expiresAt: now + ttl,
  };
}

/**
 * Build a cache key from multiple parts
 *
 * @param parts - Parts to join into a cache key
 * @returns Cache key string
 */
export function buildCacheKey(...parts: (string | number)[]): string {
  return parts.join(":");
}
