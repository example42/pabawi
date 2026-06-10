/**
 * Property-Based Tests for EntraIdService — Callback Validation (Properties 7–11)
 *
 * **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 9.1, 9.2**
 *
 * Tests the five correctness properties from the design document:
 * - Property 7: State mismatch rejects callback
 * - Property 8: ID token signature validation
 * - Property 9: Nonce mismatch rejects token
 * - Property 10: Audience and issuer validation
 * - Property 11: State entries deleted after callback processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { generateKeyPairSync, createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';

import {
  EntraIdService,
  EntraIdError,
  ENTRA_ID_ERROR_CODES,
} from '../../src/services/EntraIdService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import type { EntraIdConfig } from '../../src/config/schema';
import type { AuthenticationService } from '../../src/services/AuthenticationService';
import type { UserService } from '../../src/services/UserService';
import type { RoleService } from '../../src/services/RoleService';
import type { AuditLoggingService } from '../../src/services/AuditLoggingService';
import type { LoggerService } from '../../src/services/LoggerService';

// --- Test RSA Key Pairs ---

function generateTestKeyPair(): { privateKey: string; publicKey: string; kid: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const kid = `test-kid-${Math.random().toString(36).slice(2, 10)}`;
  return { privateKey, publicKey, kid };
}

function pemToJwkComponents(pem: string): { n: string; e: string } {
  const keyObject = createPublicKey(pem);
  const jwk = keyObject.export({ format: 'jwk' }) as { n: string; e: string };
  return { n: jwk.n, e: jwk.e };
}

// --- Mock Factories ---

function createMockDb(): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({ changes: 0 }),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getDialect: vi.fn().mockReturnValue('sqlite' as const),
  };
}

function createMockConfig(): EntraIdConfig {
  return {
    enabled: true,
    tenantId: 'test-tenant-id-000',
    clientId: 'test-client-id-111',
    clientSecret: 'test-client-secret-222', // pragma: allowlist secret
    redirectUri: 'http://localhost:3000/api/auth/entra-id/callback',
    scopes: ['openid', 'profile', 'email'],
    groupMapping: null,
    jwksCacheTtlMs: 86400000,
  };
}

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    shouldLog: vi.fn().mockReturnValue(true),
    formatMessage: vi.fn().mockReturnValue(''),
    getLevel: vi.fn().mockReturnValue('info'),
    setLogBuffer: vi.fn(),
    getLogBuffer: vi.fn().mockReturnValue(null),
  } as unknown as LoggerService;
}

// Pre-generate key pairs (expensive, do once)
const primaryKey = generateTestKeyPair();
const primaryJwk = pemToJwkComponents(primaryKey.publicKey);

function buildIdToken(
  config: EntraIdConfig,
  nonce: string,
  overrides: Record<string, unknown> = {},
  signingKey: string = primaryKey.privateKey,
  kid: string = primaryKey.kid,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'test-subject-001',
    email: 'user@example.com',
    preferred_username: 'testuser',
    given_name: 'Test',
    family_name: 'User',
    nonce,
    aud: config.clientId,
    iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    exp: now + 3600,
    iat: now,
    ...overrides,
  };

  return jwt.sign(payload, signingKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', kid, typ: 'JWT' },
  });
}

function mockFetchForToken(idToken: string): void {
  const jwksResponse = {
    keys: [{
      kty: 'RSA',
      use: 'sig',
      kid: primaryKey.kid,
      n: primaryJwk.n,
      e: primaryJwk.e,
    }],
  };

  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/oauth2/v2.0/token')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id_token: idToken,
          access_token: 'mock-access-token',
        }),
      });
    }
    if (url.includes('/discovery/v2.0/keys')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(jwksResponse),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }));
}

function mockFetchThatTracksTokenCalls(): { fetchMock: ReturnType<typeof vi.fn>; getTokenCalls: () => unknown[][] } {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/oauth2/v2.0/token')) {
      // Return a valid-looking response to not throw before we check
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id_token: 'x', access_token: 'y' }),
      });
    }
    if (url.includes('/discovery/v2.0/keys')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ keys: [] }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    getTokenCalls: () => fetchMock.mock.calls.filter(
      (call: unknown[]) => String(call[0]).includes('/oauth2/v2.0/token'),
    ),
  };
}

// --- Arbitraries ---
const hexStringArb = fc.stringMatching(/^[a-f0-9]{16,64}$/);
const codeArb = fc.stringMatching(/^[a-f0-9]{8,32}$/);

describe('EntraIdService — Callback Validation Properties', () => {
  let db: DatabaseAdapter;
  let config: EntraIdConfig;
  let logger: LoggerService;
  let service: EntraIdService;

  const mockUser = {
    id: 'mock-user-id-001',
    username: 'testuser',
    email: 'testuser@example.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    isActive: 1,
    isAdmin: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createMockDb();
    config = createMockConfig();
    logger = createMockLogger();

    const mockAuthService = {
      generateToken: vi.fn().mockResolvedValue('mock-access-token'),
      generateRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
    } as unknown as AuthenticationService;

    const mockUserService = {
      findByFederatedIdentity: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      createFederatedUser: vi.fn().mockResolvedValue(mockUser),
      getUserById: vi.fn().mockResolvedValue(mockUser),
      toUserDTO: vi.fn().mockReturnValue({ id: mockUser.id, username: mockUser.username }),
      getUserRoles: vi.fn().mockResolvedValue([]),
    } as unknown as UserService;

    const mockRoleService = {
      listRoles: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    } as unknown as RoleService;

    const mockAuditLogger = {
      logAuthenticationAttempt: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditLoggingService;

    service = new EntraIdService(
      db,
      config,
      mockAuthService,
      mockUserService,
      mockRoleService,
      mockAuditLogger,
      logger,
    );
  });

  // Feature: azure-entra-id-auth, Property 7: State mismatch rejects callback
  /**
   * Property 7: State mismatch rejects callback
   *
   * **Validates: Requirements 3.2, 3.6, 9.1**
   *
   * For any callback request where the state query parameter does not exactly
   * match the stored state value (including missing, empty, or expired state),
   * the service SHALL reject the request with INVALID_STATE without contacting
   * the token endpoint.
   */
  describe('Property 7: State mismatch rejects callback', () => {
    it('rejects with INVALID_STATE when state is not found in store', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexStringArb,
          codeArb,
          async (state, code) => {
            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const { getTokenCalls } = mockFetchThatTracksTokenCalls();

            try {
              await service.handleCallback(code, state);
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_STATE);
            }

            // Token endpoint must NOT have been called
            expect(getTokenCalls()).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects with INVALID_STATE when state entry is expired', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexStringArb,
          codeArb,
          fc.integer({ min: 1, max: 60 }),
          async (state, code, minutesAgo) => {
            const now = new Date();
            const expiredAt = new Date(now.getTime() - minutesAgo * 60 * 1000);

            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
              state,
              nonce: 'test-nonce',
              code_verifier: 'test-verifier-value-that-is-long-enough',
              created_at: new Date(expiredAt.getTime() - 10 * 60 * 1000).toISOString(),
              expires_at: expiredAt.toISOString(),
            });

            const { getTokenCalls } = mockFetchThatTracksTokenCalls();

            try {
              await service.handleCallback(code, state);
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_STATE);
            }

            // Token endpoint must NOT have been called
            expect(getTokenCalls()).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 8: ID token signature validation
  /**
   * Property 8: ID token signature validation
   *
   * **Validates: Requirements 3.3**
   *
   * For any JWT signed with a key present in the JWKS key set, signature
   * validation SHALL pass. For any JWT signed with a key NOT in the JWKS key
   * set, signature validation SHALL fail with INVALID_ID_TOKEN.
   */
  describe('Property 8: ID token signature validation', () => {
    const storedNonce = 'stored-nonce-value-for-sig-test';

    function setupValidStateEntry(): void {
      const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        state: 'valid-state',
        nonce: storedNonce,
        code_verifier: 'valid-code-verifier-value-here-long',
        created_at: new Date().toISOString(),
        expires_at: future,
      });
    }

    it('accepts tokens signed with a key present in JWKS', async () => {
      await fc.assert(
        fc.asyncProperty(
          codeArb,
          async (code) => {
            setupValidStateEntry();
            const idToken = buildIdToken(config, storedNonce);
            mockFetchForToken(idToken);

            const result = await service.handleCallback(code, 'valid-state');
            expect(result.userId).toBe('mock-user-id-001');
            expect(result.authMethod).toBe('entra-id');
            expect(result.code).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects tokens signed with a key NOT in JWKS', async () => {
      await fc.assert(
        fc.asyncProperty(
          codeArb,
          async (code) => {
            setupValidStateEntry();

            // Sign with a different key not in JWKS
            const wrongKey = generateTestKeyPair();
            const idToken = buildIdToken(
              config,
              storedNonce,
              {},
              wrongKey.privateKey,
              wrongKey.kid,
            );
            mockFetchForToken(idToken);

            try {
              await service.handleCallback(code, 'valid-state');
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 9: Nonce mismatch rejects token
  /**
   * Property 9: Nonce mismatch rejects token
   *
   * **Validates: Requirements 3.4, 9.2**
   *
   * For any ID token where the nonce claim does not match the stored nonce
   * value, the service SHALL reject with INVALID_ID_TOKEN.
   */
  describe('Property 9: Nonce mismatch rejects token', () => {
    const noncePairArb = fc
      .tuple(
        fc.stringMatching(/^[a-f0-9]{16,64}$/),
        fc.stringMatching(/^[a-f0-9]{16,64}$/),
      )
      .filter(([a, b]) => a !== b);

    it('rejects when token nonce does not match stored nonce', async () => {
      await fc.assert(
        fc.asyncProperty(
          noncePairArb,
          codeArb,
          async ([storedNonce, tokenNonce], code) => {
            const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
              state: 'valid-state',
              nonce: storedNonce,
              code_verifier: 'valid-code-verifier-value-here-long',
              created_at: new Date().toISOString(),
              expires_at: future,
            });

            // Valid signature but wrong nonce in token
            const idToken = buildIdToken(config, tokenNonce);
            mockFetchForToken(idToken);

            try {
              await service.handleCallback(code, 'valid-state');
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 10: Audience and issuer validation
  /**
   * Property 10: Audience and issuer validation
   *
   * **Validates: Requirements 3.5**
   *
   * For any ID token where aud ≠ clientId OR iss ≠ expected issuer URL, the
   * service SHALL reject with INVALID_ID_TOKEN.
   */
  describe('Property 10: Audience and issuer validation', () => {
    const storedNonce = 'stored-nonce-for-aud-iss-test';

    function setupValidState(): void {
      const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        state: 'valid-state',
        nonce: storedNonce,
        code_verifier: 'valid-code-verifier-value-here-long',
        created_at: new Date().toISOString(),
        expires_at: future,
      });
    }

    const wrongAudienceArb = fc
      .stringMatching(/^[a-z0-9-]{8,40}$/)
      .filter((s) => s !== 'test-client-id-111');

    const wrongTenantArb = fc
      .stringMatching(/^[a-z0-9-]{8,40}$/)
      .filter((s) => s !== 'test-tenant-id-000');

    it('rejects when audience does not match configured clientId', async () => {
      await fc.assert(
        fc.asyncProperty(
          wrongAudienceArb,
          codeArb,
          async (wrongAud, code) => {
            setupValidState();
            const idToken = buildIdToken(config, storedNonce, { aud: wrongAud });
            mockFetchForToken(idToken);

            try {
              await service.handleCallback(code, 'valid-state');
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects when issuer does not match expected tenant URL', async () => {
      await fc.assert(
        fc.asyncProperty(
          wrongTenantArb,
          codeArb,
          async (wrongTenant, code) => {
            setupValidState();
            const wrongIss = `https://login.microsoftonline.com/${wrongTenant}/v2.0`;
            const idToken = buildIdToken(config, storedNonce, { iss: wrongIss });
            mockFetchForToken(idToken);

            try {
              await service.handleCallback(code, 'valid-state');
              expect.fail('Should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 11: State entries deleted after callback processing
  /**
   * Property 11: State entries deleted after callback processing
   *
   * **Validates: Requirements 3.10**
   *
   * For any callback execution (whether successful or failed), the
   * oauth_state_store entry SHALL be deleted.
   */
  describe('Property 11: State entries deleted after callback processing', () => {
    const storedNonce = 'stored-nonce-for-deletion-test';

    function assertStateDeleted(state: string): void {
      const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCalls = executeCalls.filter(
        (call: unknown[]) => String(call[0]).includes('DELETE FROM oauth_state_store'),
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
      const stateDeleteCall = deleteCalls.find(
        (call: unknown[]) => (call[1] as unknown[]).includes(state),
      );
      expect(stateDeleteCall).toBeDefined();
    }

    it('deletes state entry on successful callback', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexStringArb,
          codeArb,
          async (state, code) => {
            const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
              state,
              nonce: storedNonce,
              code_verifier: 'valid-code-verifier-value-here-long',
              created_at: new Date().toISOString(),
              expires_at: future,
            });

            const idToken = buildIdToken(config, storedNonce);
            mockFetchForToken(idToken);

            await service.handleCallback(code, state);
            assertStateDeleted(state);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('deletes state entry even when state is not found (failed callback)', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexStringArb,
          codeArb,
          async (state, code) => {
            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            mockFetchThatTracksTokenCalls();

            try {
              await service.handleCallback(code, state);
            } catch {
              // Expected INVALID_STATE
            }

            assertStateDeleted(state);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('deletes state entry when token validation fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          hexStringArb,
          codeArb,
          async (state, code) => {
            const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
              state,
              nonce: storedNonce,
              code_verifier: 'valid-code-verifier-value-here-long',
              created_at: new Date().toISOString(),
              expires_at: future,
            });

            // Sign with wrong key → INVALID_ID_TOKEN
            const wrongKey = generateTestKeyPair();
            const idToken = buildIdToken(
              config,
              storedNonce,
              {},
              wrongKey.privateKey,
              wrongKey.kid,
            );
            mockFetchForToken(idToken);

            try {
              await service.handleCallback(code, state);
            } catch {
              // Expected INVALID_ID_TOKEN
            }

            assertStateDeleted(state);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
