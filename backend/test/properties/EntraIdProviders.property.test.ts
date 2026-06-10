/**
 * Property-Based Tests for Providers Endpoint — Property 17
 *
 * **Validates: Requirements 11.2**
 *
 * Tests the correctness property from the design document:
 * - Property 17: Providers endpoint always includes local authentication
 *
 * For any application configuration state (Entra ID enabled or disabled, any
 * combination of integrations), the `GET /api/auth/providers` response SHALL
 * always contain `{ "local": true }`.
 */

// Feature: azure-entra-id-auth, Property 17: Providers endpoint always includes local authentication

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import express from 'express';
import request from 'supertest';

import { createAuthRouter } from '../../src/routes/auth.ts';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { DatabaseService } from '../../src/database/DatabaseService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { DIContainer } from '../../src/container/DIContainer';
import { LoggerService } from '../../src/services/LoggerService';
import { ExpertModeService } from '../../src/services/ExpertModeService';
import { ConfigService } from '../../src/config/ConfigService';
import { initializeTestSchema } from '../helpers/schema';

/**
 * Arbitrary that generates a configuration state for the test.
 * - entraIdEnabled: whether an EntraIdService mock is registered
 * - extraServices: random additional service keys registered on the container (noise)
 */
interface ConfigState {
  entraIdEnabled: boolean;
  extraServiceKeys: string[];
  providerName: string;
}

const configStateArb: fc.Arbitrary<ConfigState> = fc.record({
  entraIdEnabled: fc.boolean(),
  extraServiceKeys: fc.array(
    fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,20}$/),
    { minLength: 0, maxLength: 5 },
  ),
  providerName: fc.constantFrom(
    'Microsoft Entra ID',
    'Azure AD',
    'Custom SSO Provider',
  ),
});

describe('Providers Endpoint — Property 17: Providers endpoint always includes local authentication', () => {
  let db: DatabaseAdapter;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Minimal env for ConfigService
    process.env.JWT_SECRET = 'test-jwt-secret-for-property-tests-minimum-32chars!!'; // pragma: allowlist secret
    process.env.HOST = 'localhost';
    process.env.PORT = '3000';

    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeTestSchema(db);

    databaseService = {
      getAdapter: () => db,
    } as unknown as DatabaseService;
  });

  afterEach(async () => {
    await db.close();
    delete process.env.JWT_SECRET;
    delete process.env.HOST;
    delete process.env.PORT;
  });

  /**
   * Build a container with the given configuration state.
   * Optionally registers a mock EntraIdService on the "entraId" key.
   */
  function buildContainer(state: ConfigState): DIContainer {
    const container = new DIContainer();
    container.register('logger', new LoggerService());
    container.register('expertMode', new ExpertModeService());
    container.register('config', new ConfigService());

    // Access internal service map to register additional keys (simulates other integrations)
    const services = (container as unknown as { services: Map<string, unknown> }).services;

    // Register noise services (random integrations that should not affect providers)
    for (const key of state.extraServiceKeys) {
      services.set(key, { name: key });
    }

    // Conditionally register EntraIdService mock
    if (state.entraIdEnabled) {
      services.set('entraId', {
        getProviderInfo: () => ({ enabled: true as const, name: state.providerName }),
      });
    }

    return container;
  }

  /**
   * Build an Express app with the auth router mounted at /api/auth.
   */
  function buildApp(container: DIContainer): express.Application {
    const app = express();
    app.use(express.json());
    const router = createAuthRouter(databaseService, container);
    app.use('/api/auth', router);
    return app;
  }

  /**
   * Property: For ANY configuration state, `GET /api/auth/providers`
   * response always contains `{ local: true }`.
   */
  it('response always contains local: true regardless of configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        configStateArb,
        async (state) => {
          const container = buildContainer(state);
          const app = buildApp(container);

          const res = await request(app)
            .get('/api/auth/providers')
            .expect(200);

          // Core invariant: local is always true
          expect(res.body.local).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: When Entra ID service is present, response also contains entraId info.
   */
  it('includes entraId provider info when EntraIdService is registered', async () => {
    await fc.assert(
      fc.asyncProperty(
        configStateArb.filter((s) => s.entraIdEnabled),
        async (state) => {
          const container = buildContainer(state);
          const app = buildApp(container);

          const res = await request(app)
            .get('/api/auth/providers')
            .expect(200);

          // local is still present
          expect(res.body.local).toBe(true);

          // entraId info is present
          expect(res.body.entraId).toBeDefined();
          expect(res.body.entraId.enabled).toBe(true);
          expect(res.body.entraId.name).toBe(state.providerName);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: When Entra ID service is absent, response does NOT contain entraId key.
   */
  it('omits entraId key when EntraIdService is not registered', async () => {
    await fc.assert(
      fc.asyncProperty(
        configStateArb.filter((s) => !s.entraIdEnabled),
        async (state) => {
          const container = buildContainer(state);
          const app = buildApp(container);

          const res = await request(app)
            .get('/api/auth/providers');

          expect(res.status).toBe(200);

          // local is always present
          expect(res.body.local).toBe(true);

          // entraId key should be absent
          expect(res.body.entraId).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Endpoint is accessible without authentication (no auth header needed).
   */
  it('endpoint responds 200 without any auth header for any config state', async () => {
    await fc.assert(
      fc.asyncProperty(
        configStateArb,
        async (state) => {
          const container = buildContainer(state);
          const app = buildApp(container);

          // No Authorization header at all — endpoint must not require auth
          const res = await request(app)
            .get('/api/auth/providers');

          expect(res.status).toBe(200);
          expect(res.body.local).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
