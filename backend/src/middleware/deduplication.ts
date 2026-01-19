import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Cache entry structure for storing request responses
 */
interface CacheEntry {
  key: string;
  response: unknown;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Configuration options for request deduplication middleware
 */
interface DeduplicationConfig {
  ttl?: number;           // Time-to-live in milliseconds (default: 60000ms = 60s)
  maxSize?: number;       // Maximum number of cache entries (default: 1000)
  enabled?: boolean;      // Enable/disable caching (default: true)
}

/**
 * Request Deduplication Middleware
 *
 * Implements caching for identical API requests to minimize external API calls
 * and improve performance. Uses LRU (Least Recently Used) eviction strategy
 * when cache reaches maximum size.
 *
 * Features:
 * - Generates cache keys from request method, path, and query parameters
 * - Configurable TTL (time-to-live) for cache entries
 * - LRU eviction strategy to manage memory usage
 * - Cryptographic hash for cache keys to prevent collisions
 *
 * Requirements: 4.1, 4.5
 */
export class RequestDeduplicationMiddleware {
  private cache: Map<string, CacheEntry>;
  private readonly ttl: number;
  private readonly maxSize: number;
  private readonly enabled: boolean;

  constructor(config: DeduplicationConfig = {}) {
    this.cache = new Map();
    this.ttl = config.ttl ?? 60000; // Default 60 seconds
    this.maxSize = config.maxSize ?? 1000; // Default 1000 entries
    this.enabled = config.enabled ?? true;
  }

  /**
   * Generate a unique cache key from request method, path, query parameters, and expert mode
   * Uses SHA-256 hash to prevent key collisions and ensure consistent key length
   */
  generateKey(req: Request): string {
    const method = req.method;
    // Use originalUrl to get the full path including mount point
    // This prevents cache collisions between different routes
    const path = req.originalUrl || req.url;
    const query = JSON.stringify(req.query);
    // Include expert mode in cache key to prevent caching expert mode responses
    // for non-expert mode requests and vice versa
    const expertMode = req.expertMode ? 'expert' : 'normal';

    // Create a deterministic string representation of the request
    const requestString = `${method}:${path}:${query}:${expertMode}`;

    // Use cryptographic hash to generate cache key
    return crypto
      .createHash('sha256')
      .update(requestString)
      .digest('hex');
  }

  /**
   * Get cached response if available and not expired
   * Updates access count and last accessed timestamp for LRU tracking
   */
  getCached(key: string): CacheEntry | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if entry has expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update LRU tracking
    entry.accessCount++;
    entry.lastAccessed = now;

    return entry;
  }

  /**
   * Store response in cache with TTL
   * Implements LRU eviction when cache reaches maximum size
   */
  setCached(key: string, response: unknown, ttl?: number): void {
    const now = Date.now();

    // Evict least recently used entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      key,
      response,
      timestamp: now,
      ttl: ttl ?? this.ttl,
      accessCount: 1,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
  }

  /**
   * Evict the least recently used entry from cache
   * Uses lastAccessed timestamp to determine LRU entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    // Find entry with oldest lastAccessed timestamp
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: { key: string; age: number; accessCount: number }[];
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map(entry => ({
      key: entry.key,
      age: now - entry.timestamp,
      accessCount: entry.accessCount,
    }));

    // Calculate hit rate based on access counts
    const totalAccesses = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const uniqueEntries = entries.length;
    const hitRate = uniqueEntries > 0 ? (totalAccesses - uniqueEntries) / totalAccesses : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate,
      entries,
    };
  }

  /**
   * Express middleware function
   * Intercepts responses and caches them for future identical requests
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Skip caching if disabled or not a GET request
      if (!this.enabled || req.method !== 'GET') {
        next();
        return;
      }

      const cacheKey = this.generateKey(req);
      const cached = this.getCached(cacheKey);

      // Return cached response if available
      if (cached) {
        res.json(cached.response);
        return;
      }

      // Intercept response to cache it
      const originalJson = res.json.bind(res);

      res.json = (body: unknown): Response => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.setCached(cacheKey, body);
        }

        return originalJson(body);
      };

      next();
    };
  }
}

/**
 * Create a singleton instance for application-wide use
 */
export const deduplicationMiddleware = new RequestDeduplicationMiddleware({
  ttl: 60000,      // 60 seconds
  maxSize: 1000,   // 1000 entries
  enabled: true,
});

/**
 * Export middleware function for use in Express app
 */
export const requestDeduplication = deduplicationMiddleware.middleware();
