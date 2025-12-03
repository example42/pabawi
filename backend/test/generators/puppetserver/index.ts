/**
 * Property-based test generators for Puppetserver integration
 *
 * Provides fast-check arbitraries for generating test data.
 */

import fc from 'fast-check';
import type {
  Certificate,
  CertificateStatus,
  NodeStatus,
  Environment,
  PuppetserverConfig,
  PuppetserverSSLConfig,
} from '../../../src/integrations/puppetserver/types';

/**
 * Generate a valid certificate status
 */
export const certificateStatusArbitrary = (): fc.Arbitrary<CertificateStatus> =>
  fc.constantFrom('signed', 'requested', 'revoked');

/**
 * Generate a valid certificate
 */
export const certificateArbitrary = (): fc.Arbitrary<Certificate> =>
  fc.record({
    certname: fc.domain(),
    status: certificateStatusArbitrary(),
    fingerprint: fc.hexaString({ minLength: 64, maxLength: 64 }),
    dns_alt_names: fc.option(fc.array(fc.domain(), { minLength: 0, maxLength: 5 })),
    authorization_extensions: fc.option(fc.dictionary(fc.string(), fc.anything())),
    not_before: fc.option(fc.date().map((d) => d.toISOString())),
    not_after: fc.option(fc.date().map((d) => d.toISOString())),
  });

/**
 * Generate a valid node status
 */
export const nodeStatusArbitrary = (): fc.Arbitrary<NodeStatus> =>
  fc.record({
    certname: fc.domain(),
    latest_report_hash: fc.option(fc.hexaString({ minLength: 40, maxLength: 40 })),
    latest_report_status: fc.option(fc.constantFrom('unchanged', 'changed', 'failed')),
    latest_report_noop: fc.option(fc.boolean()),
    latest_report_noop_pending: fc.option(fc.boolean()),
    cached_catalog_status: fc.option(fc.string()),
    catalog_timestamp: fc.option(fc.date().map((d) => d.toISOString())),
    facts_timestamp: fc.option(fc.date().map((d) => d.toISOString())),
    report_timestamp: fc.option(fc.date().map((d) => d.toISOString())),
    catalog_environment: fc.option(fc.string()),
    report_environment: fc.option(fc.string()),
  });

/**
 * Generate a valid environment
 */
export const environmentArbitrary = (): fc.Arbitrary<Environment> =>
  fc.record({
    name: fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')), // pragma: allowlist secret
      { minLength: 3, maxLength: 20 }
    ),
    last_deployed: fc.option(fc.date().map((d) => d.toISOString())),
    status: fc.option(fc.constantFrom('deployed', 'deploying', 'failed')),
  });

/**
 * Generate a valid SSL configuration
 */
export const sslConfigArbitrary = (): fc.Arbitrary<PuppetserverSSLConfig> =>
  fc.record({
    enabled: fc.boolean(),
    ca: fc.option(fc.string(), { nil: undefined }),
    cert: fc.option(fc.string(), { nil: undefined }),
    key: fc.option(fc.string(), { nil: undefined }),
    rejectUnauthorized: fc.option(fc.boolean(), { nil: undefined }),
  });

/**
 * Generate a valid Puppetserver configuration
 */
export const puppetserverConfigArbitrary = (): fc.Arbitrary<PuppetserverConfig> =>
  fc.record({
    enabled: fc.boolean(),
    serverUrl: fc.webUrl({ validSchemes: ['http', 'https'] }),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    token: fc.option(fc.string(), { nil: undefined }),
    ssl: fc.option(sslConfigArbitrary(), { nil: undefined }),
    timeout: fc.option(fc.integer({ min: 1000, max: 120000 }), { nil: undefined }),
    retryAttempts: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    retryDelay: fc.option(fc.integer({ min: 100, max: 10000 }), { nil: undefined }),
    inactivityThreshold: fc.option(fc.integer({ min: 60, max: 86400 }), { nil: undefined }),
    cache: fc.option(
      fc.record({
        ttl: fc.integer({ min: 1000, max: 3600000 }),
      }),
      { nil: undefined }
    ),
    circuitBreaker: fc.option(
      fc.record({
        threshold: fc.integer({ min: 1, max: 20 }),
        timeout: fc.integer({ min: 10000, max: 300000 }),
        resetTimeout: fc.integer({ min: 5000, max: 120000 }),
      }),
      { nil: undefined }
    ),
  });

/**
 * Generate an invalid Puppetserver configuration (missing required fields or invalid values)
 */
export const invalidPuppetserverConfigArbitrary = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    // Missing serverUrl entirely
    fc.record({
      enabled: fc.boolean(),
    }),
    // Invalid serverUrl - not a URL
    fc.record({
      enabled: fc.boolean(),
      serverUrl: fc.constantFrom('not-a-url', '', 'just-text'),
    }),
    // Invalid port - out of range
    fc.record({
      enabled: fc.boolean(),
      serverUrl: fc.webUrl({ validSchemes: ['http', 'https'] }),
      port: fc.constantFrom(-1, 0, 65536, 100000),
    }),
    // Invalid timeout - negative or zero
    fc.record({
      enabled: fc.boolean(),
      serverUrl: fc.webUrl({ validSchemes: ['http', 'https'] }),
      timeout: fc.constantFrom(-1, 0, -100),
    }),
    // Invalid retry attempts - negative
    fc.record({
      enabled: fc.boolean(),
      serverUrl: fc.webUrl({ validSchemes: ['http', 'https'] }),
      retryAttempts: fc.constantFrom(-1, -10, -100),
    }),
    // Invalid inactivity threshold - negative or zero
    fc.record({
      enabled: fc.boolean(),
      serverUrl: fc.webUrl({ validSchemes: ['http', 'https'] }),
      inactivityThreshold: fc.constantFrom(-1, 0, -100),
    })
  );
