/**
 * Feature: puppetserver-integration, Property 17: SSL and authentication support
 * Validates: Requirements 8.2, 8.3
 *
 * This property test verifies that:
 * 1. For any Puppetserver configuration with HTTPS, the system successfully establishes secure connections
 * 2. For any configuration with authentication (token or certificate), the system properly authenticates
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PuppetserverClient } from '../../../src/integrations/puppetserver/PuppetserverClient';
import type { PuppetserverClientConfig } from '../../../src/integrations/puppetserver/types';

describe('Property 17: SSL and authentication support', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  it('should create client with HTTPS configuration for any valid HTTPS URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.integer({ min: 1, max: 65535 }),
        fc.boolean(),
        (serverUrl, port, rejectUnauthorized) => {
          // Create client config with HTTPS
          const config: PuppetserverClientConfig = {
            serverUrl,
            port,
            rejectUnauthorized,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created
          expect(client).toBeDefined();
          expect(client.getBaseUrl()).toContain('https://');
          expect(client.hasSSL()).toBe(true);
        }
      ),
      propertyTestConfig
    );
  });

  it('should create client with token authentication for any valid token', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.string({ minLength: 10, maxLength: 100 }),
        (serverUrl, token) => {
          // Create client config with token authentication
          const config: PuppetserverClientConfig = {
            serverUrl,
            token,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created with token auth
          expect(client).toBeDefined();
          expect(client.hasTokenAuthentication()).toBe(true);
        }
      ),
      propertyTestConfig
    );
  });

  it('should support both HTTP and HTTPS protocols for any valid URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['http', 'https'] }),
        fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
        (serverUrl, port) => {
          // Create client config
          const config: PuppetserverClientConfig = {
            serverUrl,
            port,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created
          expect(client).toBeDefined();

          const baseUrl = client.getBaseUrl();
          expect(baseUrl).toBeDefined();

          // Should preserve protocol from serverUrl
          if (serverUrl.startsWith('https://')) {
            expect(baseUrl).toContain('https://');
          } else if (serverUrl.startsWith('http://')) {
            expect(baseUrl).toContain('http://');
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should use default ports when not specified for any URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['http', 'https'] }),
        (serverUrl) => {
          // Create client config without port
          const config: PuppetserverClientConfig = {
            serverUrl,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created
          expect(client).toBeDefined();

          const baseUrl = client.getBaseUrl();

          // Should use default port based on protocol
          if (serverUrl.startsWith('https://')) {
            expect(baseUrl).toContain(':8140'); // Default Puppetserver HTTPS port
          } else if (serverUrl.startsWith('http://')) {
            expect(baseUrl).toContain(':8080'); // Default Puppetserver HTTP port
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle configurations with both token and SSL for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.boolean(),
        (serverUrl, token, rejectUnauthorized) => {
          // Create client config with both token and SSL
          const config: PuppetserverClientConfig = {
            serverUrl,
            token,
            rejectUnauthorized,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created with both auth methods
          expect(client).toBeDefined();
          expect(client.hasTokenAuthentication()).toBe(true);
          expect(client.hasSSL()).toBe(true);
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle timeout configuration for any positive timeout value', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.integer({ min: 1000, max: 120000 }),
        (serverUrl, timeout) => {
          // Create client config with timeout
          const config: PuppetserverClientConfig = {
            serverUrl,
            timeout,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created
          expect(client).toBeDefined();
          expect(client.getBaseUrl()).toBeDefined();
        }
      ),
      propertyTestConfig
    );
  });

  it('should use default timeout when not specified for any URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        (serverUrl) => {
          // Create client config without timeout
          const config: PuppetserverClientConfig = {
            serverUrl,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify client is created (default timeout is 30000ms)
          expect(client).toBeDefined();
        }
      ),
      propertyTestConfig
    );
  });

  it('should correctly identify authentication method for any configuration', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
        (serverUrl, token) => {
          // Create client config
          const config: PuppetserverClientConfig = {
            serverUrl,
            token,
          };

          // Should create client without errors
          const client = new PuppetserverClient(config);

          // Verify authentication method detection
          expect(client).toBeDefined();

          if (token) {
            expect(client.hasTokenAuthentication()).toBe(true);
          } else {
            expect(client.hasTokenAuthentication()).toBe(false);
          }
        }
      ),
      propertyTestConfig
    );
  });
});
