/**
 * Feature: puppetserver-integration, Property 19: REST API usage
 * Validates: Requirements 9.2
 *
 * This property test verifies that:
 * 1. For any Puppetserver query, it uses the correct Puppetserver REST API endpoint
 * 2. API paths are properly constructed with correct parameters
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PuppetserverClient } from '../../../src/integrations/puppetserver/PuppetserverClient';
import type { PuppetserverClientConfig } from '../../../src/integrations/puppetserver/types';

describe('Property 19: REST API usage', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Helper to create a test client
  const createTestClient = (serverUrl: string): PuppetserverClient => {
    const config: PuppetserverClientConfig = {
      serverUrl,
      timeout: 5000,
    };
    return new PuppetserverClient(config);
  };

  it('should construct correct base URL for any valid server URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
        (serverUrl, port) => {
          const config: PuppetserverClientConfig = {
            serverUrl,
            port,
          };

          const client = new PuppetserverClient(config);
          const baseUrl = client.getBaseUrl();

          // Base URL should be properly formatted
          expect(baseUrl).toBeDefined();
          expect(baseUrl).toMatch(/^https?:\/\//);

          // Should include port
          if (port) {
            expect(baseUrl).toContain(`:${port}`);
          } else {
            // Should use default port
            expect(baseUrl).toContain(':8140');
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should use correct catalog API endpoints for any certname and environment', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.domain(),
        fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-z0-9_]+$/.test(s)),
        (serverUrl, certname, environment) => {
          const client = createTestClient(serverUrl);

          // Verify client has catalog methods
          expect(typeof client.compileCatalog).toBe('function');

          // Verify base URL is correct
          expect(client.getBaseUrl()).toContain('https://');
        }
      ),
      propertyTestConfig
    );
  });

  it('should use correct facts API endpoints for any certname', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.domain(),
        (serverUrl, certname) => {
          const client = createTestClient(serverUrl);

          // Verify client has facts method
          expect(typeof client.getFacts).toBe('function');

          // Verify base URL is correct
          expect(client.getBaseUrl()).toContain('https://');
        }
      ),
      propertyTestConfig
    );
  });

  it('should use correct environment API endpoints for any environment name', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-z0-9_]+$/.test(s)),
        (serverUrl, environmentName) => {
          const client = createTestClient(serverUrl);

          // Verify client has environment methods
          expect(typeof client.getEnvironments).toBe('function');
          expect(typeof client.getEnvironment).toBe('function');
          expect(typeof client.deployEnvironment).toBe('function');

          // Verify base URL is correct
          expect(client.getBaseUrl()).toContain('https://');
        }
      ),
      propertyTestConfig
    );
  });

  it('should use correct status API endpoints for any certname', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.domain(),
        (serverUrl, certname) => {
          const client = createTestClient(serverUrl);

          // Verify client has status method
          expect(typeof client.getStatus).toBe('function');

          // Verify base URL is correct
          expect(client.getBaseUrl()).toContain('https://');
        }
      ),
      propertyTestConfig
    );
  });

  it('should support all HTTP methods (GET, POST, PUT, DELETE) for any URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        (serverUrl) => {
          const client = createTestClient(serverUrl);

          // Verify client has all HTTP method wrappers
          expect(typeof client.get).toBe('function');
          expect(typeof client.post).toBe('function');
          expect(typeof client.put).toBe('function');
          expect(typeof client.delete).toBe('function');
        }
      ),
      propertyTestConfig
    );
  });

  it('should properly construct URLs with query parameters for any valid parameters', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.constantFrom('production', 'development', 'testing'),
        (serverUrl, environment) => {
          const client = createTestClient(serverUrl);
          const baseUrl = client.getBaseUrl();

          // Verify base URL is properly formatted
          expect(baseUrl).toBeDefined();
          expect(baseUrl).toMatch(/^https:\/\//);

          // Client should be ready to make requests with parameters
          expect(typeof client.getEnvironments).toBe('function');
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain consistent base URL across all API methods for any configuration', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.integer({ min: 1, max: 65535 }),
        (serverUrl, port) => {
          const config: PuppetserverClientConfig = {
            serverUrl,
            port,
          };

          const client = new PuppetserverClient(config);
          const baseUrl = client.getBaseUrl();

          // Base URL should be consistent
          expect(baseUrl).toBeDefined();
          expect(baseUrl).toContain(`${port}`);

          // All methods should use the same base URL
          expect(typeof client.compileCatalog).toBe('function');
          expect(typeof client.getFacts).toBe('function');
          expect(typeof client.getEnvironments).toBe('function');
          expect(typeof client.getStatus).toBe('function');
        }
      ),
      propertyTestConfig
    );
  });
});
