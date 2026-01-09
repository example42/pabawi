/**
 * Unit tests for PuppetserverClient
 *
 * Tests retry logic, circuit breaker integration, and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PuppetserverClient } from '../../src/integrations/puppetserver/PuppetserverClient';
import type { PuppetserverClientConfig } from '../../src/integrations/puppetserver/types';
import {
  PuppetserverConnectionError,
  PuppetserverTimeoutError,
  PuppetserverAuthenticationError,
} from '../../src/integrations/puppetserver/errors';

describe('PuppetserverClient', () => {
  let client: PuppetserverClient;
  let config: PuppetserverClientConfig;

  beforeEach(() => {
    config = {
      serverUrl: 'https://puppetserver.example.com',
      port: 8140,
      timeout: 5000,
    };
    client = new PuppetserverClient(config);
  });

  describe('Circuit Breaker Integration', () => {
    it('should have a circuit breaker instance', () => {
      const circuitBreaker = client.getCircuitBreaker();
      expect(circuitBreaker).toBeDefined();
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should have circuit breaker in closed state initially', () => {
      const circuitBreaker = client.getCircuitBreaker();
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should provide circuit breaker statistics', () => {
      const circuitBreaker = client.getCircuitBreaker();
      const stats = circuitBreaker.getStats();

      expect(stats).toBeDefined();
      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('Retry Configuration', () => {
    it('should have retry configuration', () => {
      const retryConfig = client.getRetryConfig();
      expect(retryConfig).toBeDefined();
      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.initialDelay).toBe(1000);
      expect(retryConfig.maxDelay).toBe(30000);
      expect(retryConfig.backoffMultiplier).toBe(2);
      expect(retryConfig.jitter).toBe(true);
    });

    it('should allow updating retry configuration', () => {
      const newConfig = {
        maxAttempts: 5,
        initialDelay: 2000,
      };

      client.setRetryConfig(newConfig);
      const retryConfig = client.getRetryConfig();

      expect(retryConfig.maxAttempts).toBe(5);
      expect(retryConfig.initialDelay).toBe(2000);
      // Other values should remain unchanged
      expect(retryConfig.maxDelay).toBe(30000);
      expect(retryConfig.backoffMultiplier).toBe(2);
    });

    it('should have shouldRetry function', () => {
      const retryConfig = client.getRetryConfig();
      expect(retryConfig.shouldRetry).toBeDefined();
      expect(typeof retryConfig.shouldRetry).toBe('function');
    });

    it('should have onRetry callback', () => {
      const retryConfig = client.getRetryConfig();
      expect(retryConfig.onRetry).toBeDefined();
      expect(typeof retryConfig.onRetry).toBe('function');
    });
  });

  describe('Error Categorization', () => {
    it('should categorize connection errors correctly', async () => {
      // Create a client pointing to a non-existent server
      const badClient = new PuppetserverClient({
        serverUrl: 'https://localhost:9999',
        timeout: 1000,
      });

      // Update retry config to fail fast
      badClient.setRetryConfig({
        maxAttempts: 0, // No retries
      });

      try {
        await badClient.getEnvironments();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(PuppetserverConnectionError);
      }
    });

    it('should handle timeout errors', async () => {
      // Create a client with very short timeout
      const timeoutClient = new PuppetserverClient({
        serverUrl: 'https://httpstat.us/200?sleep=10000', // Slow endpoint
        timeout: 100, // Very short timeout
      });

      // Update retry config to fail fast
      timeoutClient.setRetryConfig({
        maxAttempts: 0, // No retries
      });

      try {
        await timeoutClient.getEnvironments();
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Should be either timeout or connection error
        expect(
          error instanceof PuppetserverTimeoutError ||
          error instanceof PuppetserverConnectionError
        ).toBe(true);
      }
    });
  });

  describe('Client Configuration', () => {
    it('should create client with HTTPS', () => {
      expect(client.getBaseUrl()).toContain('https://');
      expect(client.hasSSL()).toBe(true);
    });

    it('should create client with token authentication', () => {
      const tokenClient = new PuppetserverClient({
        ...config,
        token: 'test-token-123',
      });

      expect(tokenClient.hasTokenAuthentication()).toBe(true);
    });

    it('should create client without token authentication', () => {
      expect(client.hasTokenAuthentication()).toBe(false);
    });

    it('should use default port for HTTPS', () => {
      const defaultPortClient = new PuppetserverClient({
        serverUrl: 'https://puppetserver.example.com',
      });

      expect(defaultPortClient.getBaseUrl()).toContain(':8140');
    });

    it('should use default port for HTTP', () => {
      const httpClient = new PuppetserverClient({
        serverUrl: 'http://puppetserver.example.com',
      });

      expect(httpClient.getBaseUrl()).toContain(':8080');
    });

    it('should use custom port when specified', () => {
      const customPortClient = new PuppetserverClient({
        serverUrl: 'https://puppetserver.example.com',
        port: 9999,
      });

      expect(customPortClient.getBaseUrl()).toContain(':9999');
    });
  });

  describe('API Methods', () => {
    it('should have status API methods', () => {
      expect(typeof client.getStatus).toBe('function');
    });

    it('should have catalog API methods', () => {
      expect(typeof client.compileCatalog).toBe('function');
    });

    it('should have facts API methods', () => {
      expect(typeof client.getFacts).toBe('function');
    });

    it('should have environment API methods', () => {
      expect(typeof client.getEnvironments).toBe('function');
      expect(typeof client.getEnvironment).toBe('function');
      expect(typeof client.deployEnvironment).toBe('function');
    });

    it('should have generic HTTP methods', () => {
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
      expect(typeof client.put).toBe('function');
      expect(typeof client.delete).toBe('function');
    });
  });


});
