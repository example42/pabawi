import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { createEntraIdAuthRouter } from '../../src/routes/entraIdAuth';
import { createAuthRouter } from '../../src/routes/auth';
import { DatabaseService } from '../../src/database/DatabaseService';
import { EntraIdService } from '../../src/services/EntraIdService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';
import { DIContainer } from '../../src/container/DIContainer';
import { ConfigService } from '../../src/config/ConfigService';
import type { EntraIdConfig } from '../../src/config/schema';

// --- Test RSA key pair for signing ID tokens ---
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-key-id-001';

function pemToJwk(pem: string, kid: string): {
  kty: string; use: string; kid: string; n: string; e: string;
} {
  const keyObj = crypto.createPublicKey(pem);
  const jwk = keyObj.export({ format: 'jwk' });
  return {
    kty: 'RSA',
    use: 'sig',
    kid,
    n: jwk.n as string,
    e: jwk.e as string,
  };
}

const TEST_JWK = pemToJwk(publicKey, TEST_KID);

// --- Test Entra ID configuration ---
const TEST_TENANT_ID = 'test-tenant-id-12345';
const TEST_CLIENT_ID = 'test-client-id-67890';
const TEST_CLIENT_SECRET = 'test-client-secret-abcdef'; // pragma: allowlist secret
const TEST_REDIRECT_URI = 'http://localhost:3000/api/auth/entra-id/callback';

const testEntraIdConfig: EntraIdConfig = {
  enabled: true,
  tenantId: TEST_TENANT_ID,
  clientId: TEST_CLIENT_ID,
  clientSecret: TEST_CLIENT_SECRET, // pragma: allowlist secret
  redirectUri: TEST_REDIRECT_URI,
  scopes: ['openid', 'profile', 'email'],
  groupMapping: null,
  postLogoutRedirectUri: 'http://localhost:3000',
  jwksCacheTtlMs: 86400000,
};

/**
 * Sign a test ID token with our test private key.
 * Note: Do NOT include `exp` in claims if using `expiresIn` option (jsonwebtoken rejects both).
 */
function signTestIdToken(claims: Record<string, unknown>): string {
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: TEST_KID,
  });
}

/**
 * Create a valid test ID token with standard claims.
 */
function createValidIdToken(overrides: Partial<Record<string, unknown>> = {}, nonce?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: 'entra-user-sub-12345',
    email: 'testuser@example.com',
    preferred_username: 'testuser',
    given_name: 'Test',
    family_name: 'User',
    nonce: nonce ?? 'test-nonce',
    aud: TEST_CLIENT_ID,
    iss: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  return signTestIdToken(claims);
}

/**
 * Integration Tests for the full Entra ID OAuth Flow
 *
 * Tests the complete authorization URL generation → callback → token exchange
 * flow with mocked Entra ID endpoints.
 *
 * Validates: Requirements 2.1, 3.1, 7.1, 7.2, 7.3, 7.4, 9.4, 9.8
 */
describe('Entra ID Auth Flow Integration Tests', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let entraIdService: EntraIdService;
  let container: DIContainer;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-for-entra-id-integration'; // pragma: allowlist secret
    process.env.ENTRA_ID_ENABLED = 'true';
    process.env.ENTRA_ID_TENANT_ID = TEST_TENANT_ID;
    process.env.ENTRA_ID_CLIENT_ID = TEST_CLIENT_ID;
    process.env.ENTRA_ID_CLIENT_SECRET = TEST_CLIENT_SECRET; // pragma: allowlist secret
    process.env.ENTRA_ID_REDIRECT_URI = TEST_REDIRECT_URI;

    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const db = databaseService.getAdapter();
    const logger = new LoggerService();
    const auditLogger = new AuditLoggingService(db);
    const jwtSecret = process.env.JWT_SECRET;
    const authService = new AuthenticationService(db, jwtSecret, auditLogger, 4);
    const userService = new UserService(db, authService);
    const roleService = new RoleService(db);

    entraIdService = new EntraIdService(
      db,
      testEntraIdConfig,
      authService,
      userService,
      roleService,
      auditLogger,
      logger,
    );

    container = new DIContainer();
    container.register('logger', logger);

    const configService = new ConfigService();
    container.register('config', configService);

    const { ExpertModeService } = await import('../../src/services/ExpertModeService');
    container.register('expertMode', new ExpertModeService());
    container.register('entraId', entraIdService);

    app = express();
    app.use(express.json());
    app.use('/api/auth/entra-id', createEntraIdAuthRouter(databaseService, container));
    app.use('/api/auth', createAuthRouter(databaseService, container));

    // Mock global fetch for external Entra ID calls
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await databaseService.close();
    delete process.env.ENTRA_ID_ENABLED;
    delete process.env.ENTRA_ID_TENANT_ID;
    delete process.env.ENTRA_ID_CLIENT_ID;
    delete process.env.ENTRA_ID_CLIENT_SECRET;
    delete process.env.ENTRA_ID_REDIRECT_URI;
  });

  describe('Full happy path: auth URL → callback → token exchange', () => {
    it('should complete the full OAuth flow', async () => {
      // Step 1: Get the authorization URL via /login endpoint
      const loginResponse = await request(app)
        .get('/api/auth/entra-id/login')
        .expect(302);

      const redirectUrl = new URL(loginResponse.headers.location);
      expect(redirectUrl.hostname).toBe('login.microsoftonline.com');
      expect(redirectUrl.pathname).toContain(TEST_TENANT_ID);
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
      expect(redirectUrl.searchParams.get('client_id')).toBe(TEST_CLIENT_ID);
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');

      const state = redirectUrl.searchParams.get('state');
      const nonce = redirectUrl.searchParams.get('nonce');
      expect(state).toBeTruthy();
      expect(nonce).toBeTruthy();

      // Step 2: Simulate callback from Entra ID
      // We need to get the stored nonce from the DB to create a valid ID token
      const stateEntry = await databaseService.getAdapter().queryOne<{
        nonce: string;
        code_verifier: string;
      }>(
        `SELECT nonce, code_verifier FROM oauth_state_store WHERE state = ?`,
        [state!],
      );
      expect(stateEntry).not.toBeNull();

      const validIdToken = createValidIdToken({ nonce: stateEntry!.nonce }, stateEntry!.nonce);

      // Mock the token endpoint
      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({
              id_token: validIdToken,
              access_token: 'mock-entra-access-token',
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.includes('/discovery/v2.0/keys')) {
          return new Response(
            JSON.stringify({ keys: [TEST_JWK] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response('Not found', { status: 404 });
      });

      // Call the callback endpoint
      const callbackResponse = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'mock-auth-code', state: state! })
        .expect(302);

      // Should redirect to frontend with an auth code
      const frontendRedirect = new URL(callbackResponse.headers.location);
      const authCode = frontendRedirect.searchParams.get('code');
      expect(authCode).toBeTruthy();
      expect(authCode!.length).toBeGreaterThan(0);

      // Step 3: Exchange the auth code for tokens
      const tokenResponse = await request(app)
        .post('/api/auth/entra-id/token')
        .send({ code: authCode })
        .expect(200);

      expect(tokenResponse.body).toHaveProperty('token');
      expect(tokenResponse.body).toHaveProperty('refreshToken');
      expect(tokenResponse.body).toHaveProperty('user');
      expect(tokenResponse.body.user.username).toBe('testuser');
      expect(tokenResponse.body.user.email).toBe('testuser@example.com');

      // Step 4: Verify the auth code cannot be reused (single-use)
      const replayResponse = await request(app)
        .post('/api/auth/entra-id/token')
        .send({ code: authCode })
        .expect(400);

      expect(replayResponse.body.error.code).toBe('INVALID_AUTH_CODE');
    });
  });

  describe('JWKS cache fallback on endpoint failure', () => {
    it('should use cached JWKS keys when endpoint fails on second request', async () => {
      // First: generate auth URL to get state
      const loginRes = await request(app)
        .get('/api/auth/entra-id/login')
        .expect(302);

      const redirectUrl = new URL(loginRes.headers.location);
      const state = redirectUrl.searchParams.get('state')!;

      const stateEntry = await databaseService.getAdapter().queryOne<{
        nonce: string;
        code_verifier: string;
      }>(
        `SELECT nonce, code_verifier FROM oauth_state_store WHERE state = ?`,
        [state],
      );

      const validIdToken = createValidIdToken({ nonce: stateEntry!.nonce }, stateEntry!.nonce);

      let jwksFetchCount = 0;

      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({
              id_token: validIdToken,
              access_token: 'mock-access-token',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.includes('/discovery/v2.0/keys')) {
          jwksFetchCount++;
          if (jwksFetchCount === 1) {
            // First call succeeds — populates the cache
            return new Response(
              JSON.stringify({ keys: [TEST_JWK] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          // Subsequent calls fail — should use cache
          return new Response('Service unavailable', { status: 503 });
        }

        return new Response('Not found', { status: 404 });
      });

      // First callback: should succeed and cache JWKS keys
      const callbackRes1 = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'auth-code-1', state })
        .expect(302);

      const authCode1 = new URL(callbackRes1.headers.location).searchParams.get('code')!;
      await request(app).post('/api/auth/entra-id/token').send({ code: authCode1 }).expect(200);

      // Now force cache to be stale by manipulating the service internals
      // The jwksCache has a fetchedAt that we need to backdating.
      // Since the cache TTL is 24h, the second request within the test will use
      // the in-memory cache anyway. Let's verify via a second full flow.

      // Generate a new authorization URL for a second login
      const loginRes2 = await request(app).get('/api/auth/entra-id/login').expect(302);
      const state2 = new URL(loginRes2.headers.location).searchParams.get('state')!;

      const stateEntry2 = await databaseService.getAdapter().queryOne<{
        nonce: string;
      }>(
        `SELECT nonce FROM oauth_state_store WHERE state = ?`,
        [state2],
      );

      const validIdToken2 = createValidIdToken(
        { nonce: stateEntry2!.nonce, sub: 'returning-user-sub' },
        stateEntry2!.nonce,
      );

      // Update fetch mock to return the second token
      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({ id_token: validIdToken2, access_token: 'mock-access-2' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/discovery/v2.0/keys')) {
          // JWKS endpoint fails completely
          return new Response('Service unavailable', { status: 503 });
        }
        return new Response('Not found', { status: 404 });
      });

      // Force cache expiry by manipulating the internal cache timestamp
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entraIdService as any).jwksCache.fetchedAt = 0;

      // Second callback: JWKS endpoint fails but cache should serve
      const callbackRes2 = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'auth-code-2', state: state2 })
        .expect(302);

      const authCode2 = new URL(callbackRes2.headers.location).searchParams.get('code')!;
      const tokenRes2 = await request(app)
        .post('/api/auth/entra-id/token')
        .send({ code: authCode2 })
        .expect(200);

      expect(tokenRes2.body.user.email).toBe('testuser@example.com');
    });
  });

  describe('Token exchange timeout behavior (>10s)', () => {
    it('should return TOKEN_EXCHANGE_FAILED when token endpoint times out', async () => {
      const loginRes = await request(app).get('/api/auth/entra-id/login').expect(302);
      const state = new URL(loginRes.headers.location).searchParams.get('state')!;

      // Mock the token endpoint to abort (simulating a timeout via AbortError)
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('/oauth2/v2.0/token')) {
          // Simulate AbortSignal.timeout(10000) firing
          const error = new DOMException('The operation was aborted', 'AbortError');
          if (init?.signal) {
            // Check if the signal is already aborted
            if (init.signal.aborted) {
              throw error;
            }
          }
          throw error;
        }

        return new Response('Not found', { status: 404 });
      });

      const callbackRes = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'timeout-code', state })
        .expect(401);

      expect(callbackRes.body.error.code).toBe('TOKEN_EXCHANGE_FAILED');
      expect(callbackRes.body.error.message).toContain('unreachable');
    });
  });

  describe('Database failure during provisioning (atomicity)', () => {
    it('should reject with PROVISIONING_FAILED and leave no partial state', async () => {
      const loginRes = await request(app).get('/api/auth/entra-id/login').expect(302);
      const state = new URL(loginRes.headers.location).searchParams.get('state')!;

      const stateEntry = await databaseService.getAdapter().queryOne<{ nonce: string }>(
        `SELECT nonce FROM oauth_state_store WHERE state = ?`,
        [state],
      );

      const idToken = createValidIdToken({ nonce: stateEntry!.nonce }, stateEntry!.nonce);

      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({ id_token: idToken, access_token: 'mock-access' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/discovery/v2.0/keys')) {
          return new Response(
            JSON.stringify({ keys: [TEST_JWK] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      // Spy on the UserService.createFederatedUser to throw a DB error
      const createFederatedUserSpy = vi.spyOn(
        entraIdService.userService,
        'createFederatedUser',
      );
      createFederatedUserSpy.mockRejectedValueOnce(new Error('SQLITE_CONSTRAINT: UNIQUE'));

      const callbackRes = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'db-fail-code', state })
        .expect(500);

      expect(callbackRes.body.error.code).toBe('PROVISIONING_FAILED');

      // Verify no user was partially created
      const users = await databaseService.getAdapter().query<{ username: string }>(
        `SELECT username FROM users WHERE email = 'testuser@example.com'`,
        [],
      );
      expect(users).toHaveLength(0);

      // Verify no federated identity was created
      const identities = await databaseService.getAdapter().query<{ id: string }>(
        `SELECT id FROM federated_identities WHERE subject = 'entra-user-sub-12345'`,
        [],
      );
      expect(identities).toHaveLength(0);
    });
  });

  describe('Audit logging verification', () => {
    it('should record audit log entry after successful SSO login', async () => {
      const loginRes = await request(app).get('/api/auth/entra-id/login').expect(302);
      const state = new URL(loginRes.headers.location).searchParams.get('state')!;

      const stateEntry = await databaseService.getAdapter().queryOne<{ nonce: string }>(
        `SELECT nonce FROM oauth_state_store WHERE state = ?`,
        [state],
      );

      const idToken = createValidIdToken({ nonce: stateEntry!.nonce }, stateEntry!.nonce);

      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({ id_token: idToken, access_token: 'mock-access' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/discovery/v2.0/keys')) {
          return new Response(
            JSON.stringify({ keys: [TEST_JWK] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const callbackRes = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'audit-code', state })
        .expect(302);

      const authCode = new URL(callbackRes.headers.location).searchParams.get('code')!;
      await request(app).post('/api/auth/entra-id/token').send({ code: authCode }).expect(200);

      // Verify audit log entry exists
      const auditLogs = await databaseService.getAdapter().query<{
        eventType: string;
        action: string;
        details: string;
        result: string;
      }>(
        `SELECT event_type AS "eventType", "action", details, result
         FROM audit_logs
         WHERE event_type = 'auth' AND "action" = 'login_success'
         ORDER BY timestamp DESC LIMIT 1`,
        [],
      );

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].result).toBe('success');

      const details = JSON.parse(auditLogs[0].details);
      expect(details.username).toBe('testuser');
      expect(details.reason).toBe('method=entra-id');
    });
  });

  describe('Federation-only account local login rejection', () => {
    it('should reject local login with HTTP 401 for user with null password_hash', async () => {
      // First: complete an SSO login to create a federation-only user
      const loginRes = await request(app).get('/api/auth/entra-id/login').expect(302);
      const state = new URL(loginRes.headers.location).searchParams.get('state')!;

      const stateEntry = await databaseService.getAdapter().queryOne<{ nonce: string }>(
        `SELECT nonce FROM oauth_state_store WHERE state = ?`,
        [state],
      );

      const idToken = createValidIdToken({ nonce: stateEntry!.nonce }, stateEntry!.nonce);

      fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/oauth2/v2.0/token')) {
          return new Response(
            JSON.stringify({ id_token: idToken, access_token: 'mock-access' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/discovery/v2.0/keys')) {
          return new Response(
            JSON.stringify({ keys: [TEST_JWK] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const callbackRes = await request(app)
        .get('/api/auth/entra-id/callback')
        .query({ code: 'fed-only-code', state })
        .expect(302);

      const authCode = new URL(callbackRes.headers.location).searchParams.get('code')!;
      await request(app).post('/api/auth/entra-id/token').send({ code: authCode }).expect(200);

      // Verify user exists and has null password_hash
      const user = await databaseService.getAdapter().queryOne<{
        passwordHash: string | null;
      }>(
        `SELECT password_hash AS "passwordHash" FROM users WHERE username = 'testuser'`,
        [],
      );
      expect(user).not.toBeNull();
      expect(user!.passwordHash).toBeNull();

      // Attempt local login with this federation-only user
      const localLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'AnyPassword123!' })
        .expect(401);

      expect(localLoginRes.body.error).toBeDefined();
    });
  });

  describe('Coexistence: local auth continues working when Entra ID enabled', () => {
    it('should allow local user registration and login while Entra ID is enabled', async () => {
      // Verify the providers endpoint shows both
      const providersRes = await request(app)
        .get('/api/auth/providers')
        .expect(200);

      expect(providersRes.body.local).toBe(true);
      expect(providersRes.body.entraId).toBeDefined();
      expect(providersRes.body.entraId.enabled).toBe(true);
      expect(providersRes.body.entraId.name).toBe('Microsoft Entra ID');

      // Enable self-registration for the test
      await databaseService.getAdapter().execute(
        `INSERT INTO config (key, value, updated_at)
         VALUES ('allow_self_registration', 'true', datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
        [],
      );

      // Register a local user
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'localuser',
          email: 'localuser@example.com',
          password: 'SecurePass123!',
          firstName: 'Local',
          lastName: 'User',
        })
        .expect(201);

      expect(registerRes.body.user.username).toBe('localuser');

      // Login with local credentials
      const localLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'localuser', password: 'SecurePass123!' })
        .expect(200);

      expect(localLoginRes.body).toHaveProperty('token');
      expect(localLoginRes.body).toHaveProperty('refreshToken');
      expect(localLoginRes.body.user.username).toBe('localuser');

      // Simultaneously, Entra ID endpoints are available
      const entraLoginRes = await request(app)
        .get('/api/auth/entra-id/login')
        .expect(302);

      expect(entraLoginRes.headers.location).toContain('login.microsoftonline.com');
    });
  });
});
