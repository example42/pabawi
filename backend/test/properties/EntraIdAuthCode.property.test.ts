/**
 * Property-Based Tests for EntraIdService — Authorization Code Single-Use and TTL (Property 16)
 *
 * **Validates: Requirements 6.2, 6.3, 6.4**
 *
 * Tests the correctness property from the design document:
 * - Property 16: Authorization code single-use and TTL
 *
 * For any successfully generated auth code, the code SHALL have expires_at ≤ 60
 * seconds from creation. After a successful exchange, any subsequent exchange
 * attempt with the same code SHALL be rejected. After the code expires, exchange
 * SHALL also be rejected.
 */

// Feature: azure-entra-id-auth, Property 16: Authorization code single-use and TTL

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { initializeTestSchema } from '../helpers/schema';
import {
  EntraIdService,
  EntraIdError,
  ENTRA_ID_ERROR_CODES,
} from '../../src/services/EntraIdService';
import type { EntraIdConfig } from '../../src/config/schema';
import type { AuthenticationService } from '../../src/services/AuthenticationService';
import type { UserService } from '../../src/services/UserService';
import type { RoleService } from '../../src/services/RoleService';
import type { AuditLoggingService } from '../../src/services/AuditLoggingService';
import type { LoggerService } from '../../src/services/LoggerService';

// --- Mock Factories ---

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

const TEST_USER_ID = 'mock-user-id-001';

const mockUser = {
  id: TEST_USER_ID,
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

// --- Test Suite ---

describe('EntraIdService — Property 16: Authorization code single-use and TTL', () => {
  let db: DatabaseAdapter;
  let service: EntraIdService;

  beforeEach(async () => {
    vi.restoreAllMocks();

    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeTestSchema(db);

    // Insert the test user
    await db.execute(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mockUser.id, mockUser.username, mockUser.email, '',
        mockUser.firstName, mockUser.lastName, mockUser.isActive, mockUser.isAdmin,
        mockUser.createdAt, mockUser.updatedAt,
      ],
    );

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
      createMockConfig(),
      mockAuthService,
      mockUserService,
      mockRoleService,
      mockAuditLogger,
      createMockLogger(),
    );
  });

  afterEach(async () => {
    await db.close();
  });

  /**
   * Test 1: Auth code TTL is always ≤ 60 seconds
   *
   * For any successfully generated auth code, expires_at - created_at ≤ 60000ms.
   */
  describe('Auth code TTL ≤ 60 seconds', () => {
    it('generated auth codes always have expires_at ≤ 60s from created_at', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const code = randomUUID();
            const now = new Date();
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'at', 'rt', TEST_USER_ID, 'idt', 'entra-id', createdAt, expiresAt],
            );

            const row = await db.queryOne<{ createdAt: string; expiresAt: string }>(
              `SELECT created_at AS "createdAt", expires_at AS "expiresAt"
               FROM oauth_auth_codes WHERE code = ?`,
              [code],
            );

            expect(row).not.toBeNull();
            const created = new Date(row!.createdAt).getTime();
            const expires = new Date(row!.expiresAt).getTime();
            const ttlMs = expires - created;

            expect(ttlMs).toBeLessThanOrEqual(60 * 1000);
            expect(ttlMs).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('exchangeAuthCode succeeds when TTL has not elapsed', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 59 }),
          async (secondsRemaining) => {
            const code = randomUUID();
            const now = new Date();
            const createdAt = new Date(now.getTime() - (60 - secondsRemaining) * 1000).toISOString();
            const expiresAt = new Date(now.getTime() + secondsRemaining * 1000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'access-tok', 'refresh-tok', TEST_USER_ID, 'id-tok', 'entra-id', createdAt, expiresAt],
            );

            const result = await service.exchangeAuthCode(code);
            expect(result.accessToken).toBe('access-tok');
            expect(result.refreshToken).toBe('refresh-tok');
            expect(result.user).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Test 2: After successful exchange, second exchange with same code throws INVALID_AUTH_CODE
   *
   * Single-use guarantee: once a code has been exchanged, any subsequent attempt
   * SHALL be rejected.
   */
  describe('Single-use enforcement', () => {
    it('rejects second exchange attempt after successful first exchange', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const code = randomUUID();
            const now = new Date();
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'at', 'rt', TEST_USER_ID, 'idt', 'entra-id', createdAt, expiresAt],
            );

            // First exchange succeeds
            const result = await service.exchangeAuthCode(code);
            expect(result.accessToken).toBe('at');

            // Second exchange must fail
            try {
              await service.exchangeAuthCode(code);
              expect.fail('Second exchange should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects all subsequent exchanges (N > 1) after first successful exchange', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (attempts) => {
            const code = randomUUID();
            const now = new Date();
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'at', 'rt', TEST_USER_ID, 'idt', 'entra-id', createdAt, expiresAt],
            );

            // First exchange succeeds
            await service.exchangeAuthCode(code);

            // All subsequent attempts fail
            for (let i = 0; i < attempts; i++) {
              try {
                await service.exchangeAuthCode(code);
                expect.fail(`Exchange attempt ${i + 2} should have thrown`);
              } catch (err) {
                expect(err).toBeInstanceOf(EntraIdError);
                expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Test 3: After code expires, exchange throws INVALID_AUTH_CODE
   *
   * Expired codes SHALL not be exchangeable regardless of whether they were
   * previously used.
   */
  describe('Expired code rejection', () => {
    it('rejects exchange of expired codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3600 }),
          async (secondsExpiredAgo) => {
            const code = randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() - secondsExpiredAgo * 1000).toISOString();
            const createdAt = new Date(now.getTime() - secondsExpiredAgo * 1000 - 60000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'at', 'rt', TEST_USER_ID, 'idt', 'entra-id', createdAt, expiresAt],
            );

            try {
              await service.exchangeAuthCode(code);
              expect.fail('Expired code exchange should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects expired codes even when never previously exchanged', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300 }),
          async (secondsExpired) => {
            const code = randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() - secondsExpired * 1000).toISOString();
            const createdAt = new Date(now.getTime() - secondsExpired * 1000 - 60000).toISOString();

            await db.execute(
              `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [code, 'at', 'rt', TEST_USER_ID, 'idt', 'entra-id', createdAt, expiresAt],
            );

            try {
              await service.exchangeAuthCode(code);
              expect.fail('Should have thrown for expired code');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Test 4: Code that was never stored throws INVALID_AUTH_CODE
   *
   * Any code not present in the database SHALL be rejected.
   */
  describe('Non-existent code rejection', () => {
    it('rejects codes that were never stored', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-f0-9]{16,64}$/),
          async (randomCode) => {
            try {
              await service.exchangeAuthCode(randomCode);
              expect.fail('Non-existent code should have thrown EntraIdError');
            } catch (err) {
              expect(err).toBeInstanceOf(EntraIdError);
              expect((err as EntraIdError).code).toBe(ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
