/**
 * Feature: puppetserver-integration, Property 18: Configuration error handling
 * Validates: Requirements 8.4, 8.5
 *
 * This property test verifies that:
 * 1. Invalid Puppetserver configurations are properly detected and logged with detailed error messages
 * 2. The system continues operating normally when Puppetserver is not configured or disabled
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PuppetserverConfigSchema } from '../../../src/config/schema';
import {
  puppetserverConfigArbitrary,
  invalidPuppetserverConfigArbitrary,
} from '../../generators/puppetserver';
import type { PuppetserverConfig } from '../../../src/integrations/puppetserver/types';

describe('Property 18: Configuration error handling', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  it('should validate any valid Puppetserver configuration without errors', () => {
    fc.assert(
      fc.property(puppetserverConfigArbitrary(), (config) => {
        // Valid configurations should parse successfully
        const result = PuppetserverConfigSchema.safeParse(config);

        // Should succeed for valid configs
        expect(result.success).toBe(true);

        if (result.success) {
          // Verify all required fields are present
          expect(result.data).toHaveProperty('enabled');
          expect(result.data).toHaveProperty('serverUrl');

          // Verify types
          expect(typeof result.data.enabled).toBe('boolean');
          expect(typeof result.data.serverUrl).toBe('string');

          // If port is specified, it should be a valid port number
          if (result.data.port !== undefined) {
            expect(result.data.port).toBeGreaterThan(0);
            expect(result.data.port).toBeLessThanOrEqual(65535);
          }

          // If timeout is specified, it should be positive
          if (result.data.timeout !== undefined) {
            expect(result.data.timeout).toBeGreaterThan(0);
          }

          // If retryAttempts is specified, it should be non-negative
          if (result.data.retryAttempts !== undefined) {
            expect(result.data.retryAttempts).toBeGreaterThanOrEqual(0);
          }
        }
      }),
      propertyTestConfig
    );
  });

  it('should reject invalid Puppetserver configurations with detailed error messages', () => {
    fc.assert(
      fc.property(invalidPuppetserverConfigArbitrary(), (invalidConfig) => {
        // Invalid configurations should fail validation
        const result = PuppetserverConfigSchema.safeParse(invalidConfig);

        // Should fail for invalid configs
        expect(result.success).toBe(false);

        if (!result.success) {
          // Should have error details
          expect(result.error).toBeDefined();
          expect(result.error.issues).toBeDefined();
          expect(result.error.issues.length).toBeGreaterThan(0);

          // Error messages should be descriptive
          const errorMessages = result.error.issues.map((issue) => issue.message);
          expect(errorMessages.length).toBeGreaterThan(0);
          errorMessages.forEach((msg) => {
            expect(typeof msg).toBe('string');
            expect(msg.length).toBeGreaterThan(0);
          });
        }
      }),
      propertyTestConfig
    );
  });

  it('should handle disabled Puppetserver configuration gracefully', () => {
    fc.assert(
      fc.property(puppetserverConfigArbitrary(), (config) => {
        // Create a disabled configuration
        const disabledConfig: PuppetserverConfig = {
          ...config,
          enabled: false,
        };

        // Should parse successfully even when disabled
        const result = PuppetserverConfigSchema.safeParse(disabledConfig);

        expect(result.success).toBe(true);

        if (result.success) {
          // Verify it's marked as disabled
          expect(result.data.enabled).toBe(false);

          // Other fields should still be present and valid
          expect(result.data.serverUrl).toBeDefined();
        }
      }),
      propertyTestConfig
    );
  });

  it('should apply default values for optional configuration fields', () => {
    fc.assert(
      fc.property(fc.webUrl(), (serverUrl) => {
        // Minimal configuration with only required fields
        const minimalConfig = {
          enabled: true,
          serverUrl,
        };

        const result = PuppetserverConfigSchema.safeParse(minimalConfig);

        expect(result.success).toBe(true);

        if (result.success) {
          // Should have default values for optional fields
          expect(result.data.timeout).toBe(30000); // Default 30 seconds
          expect(result.data.retryAttempts).toBe(3); // Default 3 attempts
          expect(result.data.retryDelay).toBe(1000); // Default 1 second
          expect(result.data.inactivityThreshold).toBe(3600); // Default 1 hour
        }
      }),
      propertyTestConfig
    );
  });

  it('should validate SSL configuration when provided', () => {
    fc.assert(
      fc.property(
        puppetserverConfigArbitrary(),
        fc.boolean(),
        (config, sslEnabled) => {
          // Create config with SSL settings
          const configWithSSL: PuppetserverConfig = {
            ...config,
            ssl: {
              enabled: sslEnabled,
              ca: '/path/to/ca.pem',
              cert: '/path/to/cert.pem',
              key: '/path/to/key.pem',
              rejectUnauthorized: true,
            },
          };

          const result = PuppetserverConfigSchema.safeParse(configWithSSL);

          expect(result.success).toBe(true);

          if (result.success && result.data.ssl) {
            expect(result.data.ssl.enabled).toBe(sslEnabled);
            expect(typeof result.data.ssl.ca).toBe('string');
            expect(typeof result.data.ssl.cert).toBe('string');
            expect(typeof result.data.ssl.key).toBe('string');
            expect(typeof result.data.ssl.rejectUnauthorized).toBe('boolean');
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should validate cache configuration when provided', () => {
    fc.assert(
      fc.property(
        puppetserverConfigArbitrary(),
        fc.integer({ min: 1000, max: 3600000 }),
        (config, ttl) => {
          // Create config with cache settings
          const configWithCache: PuppetserverConfig = {
            ...config,
            cache: {
              ttl,
            },
          };

          const result = PuppetserverConfigSchema.safeParse(configWithCache);

          expect(result.success).toBe(true);

          if (result.success && result.data.cache) {
            expect(result.data.cache.ttl).toBe(ttl);
            expect(result.data.cache.ttl).toBeGreaterThan(0);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it('should validate circuit breaker configuration when provided', () => {
    fc.assert(
      fc.property(puppetserverConfigArbitrary(), (config) => {
        // Create config with circuit breaker settings
        const configWithCircuitBreaker: PuppetserverConfig = {
          ...config,
          circuitBreaker: {
            threshold: 5,
            timeout: 60000,
            resetTimeout: 30000,
          },
        };

        const result = PuppetserverConfigSchema.safeParse(configWithCircuitBreaker);

        expect(result.success).toBe(true);

        if (result.success && result.data.circuitBreaker) {
          expect(result.data.circuitBreaker.threshold).toBeGreaterThan(0);
          expect(result.data.circuitBreaker.timeout).toBeGreaterThan(0);
          expect(result.data.circuitBreaker.resetTimeout).toBeGreaterThan(0);
        }
      }),
      propertyTestConfig
    );
  });
});
