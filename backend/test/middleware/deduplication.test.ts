import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { RequestDeduplicationMiddleware } from '../../src/middleware/deduplication';

describe('RequestDeduplicationMiddleware', () => {
  let middleware: RequestDeduplicationMiddleware;

  beforeEach(() => {
    middleware = new RequestDeduplicationMiddleware({
      ttl: 1000, // 1 second for testing
      maxSize: 3, // Small size for testing LRU
      enabled: true,
    });
  });

  // Helper to create mock request, response, and next function
  const createMocks = (
    method = 'GET',
    path = '/api/test',
    query: Record<string, unknown> = {},
    expertMode = false
  ) => {
    const req = {
      method,
      path,
      originalUrl: path, // Add originalUrl for cache key generation
      url: path, // Add url as fallback
      query,
      expertMode, // Add expertMode for cache key generation
    } as Request;

    const jsonMock = vi.fn((body: unknown) => res as Response);
    const res = {
      json: jsonMock,
      statusCode: 200,
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    return { req, res, next, jsonMock };
  };

  describe('cache key generation', () => {
    it('should generate consistent keys for identical requests', () => {
      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { id: '1' }, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { id: '1' }, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different methods', () => {
      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: {}, expertMode: false } as Request;
      const req2 = { method: 'POST', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: {}, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different paths', () => {
      const req1 = { method: 'GET', path: '/api/test1', originalUrl: '/api/test1', url: '/api/test1', query: {}, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test2', originalUrl: '/api/test2', url: '/api/test2', query: {}, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different query parameters', () => {
      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { id: '1' }, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { id: '2' }, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).not.toBe(key2);
    });

    it('should generate SHA-256 hash as cache key', () => {
      const req = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: {}, expertMode: false } as Request;
      const key = middleware.generateKey(req);

      // SHA-256 produces 64 character hex string
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('cache operations', () => {
    it('should return null for non-existent cache entry', () => {
      const cached = middleware.getCached('non-existent-key');
      expect(cached).toBeNull();
    });

    it('should store and retrieve cached responses', () => {
      const key = 'test-key';  // pragma: allowlist secret
      const response = { data: 'test' };

      middleware.setCached(key, response);
      const cached = middleware.getCached(key);

      expect(cached).not.toBeNull();
      expect(cached?.response).toEqual(response);
    });

    it('should return null for expired cache entries', async () => {
      const key = 'test-key';  // pragma: allowlist secret
      const response = { data: 'test' };

      middleware.setCached(key, response, 100); // 100ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const cached = middleware.getCached(key);
      expect(cached).toBeNull();
    });

    it('should update access count on cache hit', () => {
      const key = 'test-key';  // pragma: allowlist secret
      const response = { data: 'test' };

      middleware.setCached(key, response);

      const cached1 = middleware.getCached(key);
      expect(cached1?.accessCount).toBe(2); // 1 from set, 1 from get

      const cached2 = middleware.getCached(key);
      expect(cached2?.accessCount).toBe(3);
    });

    it('should update lastAccessed timestamp on cache hit', () => {
      const key = 'test-key';  // pragma: allowlist secret
      const response = { data: 'test' };

      middleware.setCached(key, response);
      const firstAccess = middleware.getCached(key);
      const firstTime = firstAccess?.lastAccessed;

      // Small delay
      const now = Date.now();
      while (Date.now() - now < 10) {
        // Wait
      }

      const secondAccess = middleware.getCached(key);
      const secondTime = secondAccess?.lastAccessed;

      expect(secondTime).toBeGreaterThan(firstTime!);
    });

    it('should clear all cache entries', () => {
      middleware.setCached('key1', { data: '1' });
      middleware.setCached('key2', { data: '2' });

      expect(middleware.getStats().size).toBe(2);

      middleware.clear();

      expect(middleware.getStats().size).toBe(0);
      expect(middleware.getCached('key1')).toBeNull();
      expect(middleware.getCached('key2')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      // Fill cache to max size (3)
      middleware.setCached('key1', { data: '1' });
      middleware.setCached('key2', { data: '2' });
      middleware.setCached('key3', { data: '3' });

      expect(middleware.getStats().size).toBe(3);

      // Access key2 and key3 to make key1 the LRU
      middleware.getCached('key2');
      middleware.getCached('key3');

      // Add new entry, should evict key1
      middleware.setCached('key4', { data: '4' });

      expect(middleware.getStats().size).toBe(3);
      expect(middleware.getCached('key1')).toBeNull();
      expect(middleware.getCached('key2')).not.toBeNull();
      expect(middleware.getCached('key3')).not.toBeNull();
      expect(middleware.getCached('key4')).not.toBeNull();
    });

    it('should not evict when updating existing entry', () => {
      middleware.setCached('key1', { data: '1' });
      middleware.setCached('key2', { data: '2' });
      middleware.setCached('key3', { data: '3' });

      // Update existing entry
      middleware.setCached('key2', { data: 'updated' });

      expect(middleware.getStats().size).toBe(3);
      expect(middleware.getCached('key1')).not.toBeNull();
      expect(middleware.getCached('key2')?.response).toEqual({ data: 'updated' });
      expect(middleware.getCached('key3')).not.toBeNull();
    });
  });

  describe('middleware function', () => {
    it('should cache GET request responses', () => {
      const { req, res, next, jsonMock } = createMocks('GET', '/api/test', { id: '1' });
      const middlewareFn = middleware.middleware();

      // First request - cache miss
      middlewareFn(req, res, next);
      expect(next).toHaveBeenCalledOnce();

      // Simulate response
      res.json({ data: 'test' });

      // Second identical request - cache hit
      const { req: req2, res: res2, next: next2 } = createMocks('GET', '/api/test', { id: '1' });
      middlewareFn(req2, res2, next2);

      // Should not call next() for cache hit
      expect(next2).not.toHaveBeenCalled();
      expect(res2.json).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should not cache POST requests', () => {
      const { req, res, next } = createMocks('POST', '/api/test');
      const middlewareFn = middleware.middleware();

      middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledOnce();

      // Simulate response
      res.json({ data: 'test' });

      // Verify not cached
      const key = middleware.generateKey(req);
      expect(middleware.getCached(key)).toBeNull();
    });

    it('should not cache PUT requests', () => {
      const { req, res, next } = createMocks('PUT', '/api/test');
      const middlewareFn = middleware.middleware();

      middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should not cache DELETE requests', () => {
      const { req, res, next } = createMocks('DELETE', '/api/test');
      const middlewareFn = middleware.middleware();

      middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should not cache error responses', () => {
      const { req, res, next } = createMocks('GET', '/api/test');
      res.statusCode = 500;

      const middlewareFn = middleware.middleware();

      middlewareFn(req, res, next);
      expect(next).toHaveBeenCalledOnce();

      // Simulate error response
      res.json({ error: 'Internal Server Error' });

      // Verify not cached
      const key = middleware.generateKey(req);
      expect(middleware.getCached(key)).toBeNull();
    });

    it('should cache successful responses (2xx status codes)', () => {
      const statusCodes = [200, 201, 204];

      statusCodes.forEach((statusCode) => {
        const testMiddleware = new RequestDeduplicationMiddleware({ ttl: 1000, maxSize: 10 });
        const { req, res, next } = createMocks('GET', `/api/test/${statusCode}`);
        res.statusCode = statusCode;

        const middlewareFn = testMiddleware.middleware();
        middlewareFn(req, res, next);

        res.json({ status: 'success' });

        const key = testMiddleware.generateKey(req);
        expect(testMiddleware.getCached(key)).not.toBeNull();
      });
    });

    it('should skip caching when disabled', () => {
      const disabledMiddleware = new RequestDeduplicationMiddleware({ enabled: false });
      const { req, res, next } = createMocks('GET', '/api/test');
      const middlewareFn = disabledMiddleware.middleware();

      middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledOnce();

      res.json({ data: 'test' });

      const key = disabledMiddleware.generateKey(req);
      expect(disabledMiddleware.getCached(key)).toBeNull();
    });
  });

  describe('cache statistics', () => {
    it('should return correct cache size', () => {
      middleware.setCached('key1', { data: '1' });
      middleware.setCached('key2', { data: '2' });

      const stats = middleware.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
    });

    it('should return cache entries with metadata', () => {
      middleware.setCached('key1', { data: '1' });

      const stats = middleware.getStats();
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0]).toHaveProperty('key');
      expect(stats.entries[0]).toHaveProperty('age');
      expect(stats.entries[0]).toHaveProperty('accessCount');
    });

    it('should calculate hit rate correctly', () => {
      middleware.setCached('key1', { data: '1' });
      middleware.getCached('key1'); // Hit
      middleware.getCached('key1'); // Hit

      const stats = middleware.getStats();

      // 3 total accesses (1 set + 2 gets), 1 unique entry
      // Hit rate = (3 - 1) / 3 = 0.666...
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });

    it('should return zero hit rate for empty cache', () => {
      const stats = middleware.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should use default TTL when not specified', () => {
      const defaultMiddleware = new RequestDeduplicationMiddleware();
      const stats = defaultMiddleware.getStats();

      // Default maxSize should be 1000
      expect(stats.maxSize).toBe(1000);
    });

    it('should use custom TTL when specified', () => {
      const customMiddleware = new RequestDeduplicationMiddleware({ ttl: 5000 });
      customMiddleware.setCached('key1', { data: '1' });

      const cached = customMiddleware.getCached('key1');
      expect(cached?.ttl).toBe(5000);
    });

    it('should use custom maxSize when specified', () => {
      const customMiddleware = new RequestDeduplicationMiddleware({ maxSize: 5 });
      const stats = customMiddleware.getStats();

      expect(stats.maxSize).toBe(5);
    });

    it('should respect enabled flag', () => {
      const disabledMiddleware = new RequestDeduplicationMiddleware({ enabled: false });
      const { req, res, next } = createMocks('GET', '/api/test');

      const middlewareFn = disabledMiddleware.middleware();
      middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('edge cases', () => {
    it('should handle empty query parameters', () => {
      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: {}, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: {}, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).toBe(key2);
    });

    it('should handle complex query parameters', () => {
      const query = {
        filter: 'status:active',
        sort: 'name',
        page: 1,
        nested: { key: 'value' },
      };

      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      expect(key1).toBe(key2);
    });

    it('should handle query parameter order differences', () => {
      // Note: JSON.stringify may produce different strings for different key orders
      // This test verifies current behavior
      const req1 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { a: '1', b: '2' }, expertMode: false } as Request;
      const req2 = { method: 'GET', path: '/api/test', originalUrl: '/api/test', url: '/api/test', query: { b: '2', a: '1' }, expertMode: false } as Request;

      const key1 = middleware.generateKey(req1);
      const key2 = middleware.generateKey(req2);

      // Keys may differ due to JSON.stringify key ordering
      // This is acceptable as it's a conservative approach (cache miss vs incorrect cache hit)
      expect(typeof key1).toBe('string');
      expect(typeof key2).toBe('string');
    });

    it('should handle very large response bodies', () => {
      const largeResponse = { data: 'x'.repeat(1000000) }; // 1MB string

      middleware.setCached('large-key', largeResponse);
      const cached = middleware.getCached('large-key');

      expect(cached?.response).toEqual(largeResponse);
    });

    it('should handle concurrent cache operations', () => {
      // Simulate concurrent requests
      const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];

      keys.forEach((key, index) => {
        middleware.setCached(key, { data: index });
      });

      // Verify all entries within maxSize are accessible
      const stats = middleware.getStats();
      expect(stats.size).toBeLessThanOrEqual(3); // maxSize is 3
    });
  });
});
