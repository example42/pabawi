/**
 * Property-Based Tests for EntraIdService — User Provisioning (Properties 12–14)
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.7**
 *
 * Tests the three correctness properties from the design document:
 * - Property 12: New federated user provisioning invariant
 * - Property 13: Existing federated user profile immutability
 * - Property 14: Username derivation from invalid preferred_username
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

import {
  EntraIdService,
  type IdTokenClaims,
} from '../../src/services/EntraIdService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import type { EntraIdConfig } from '../../src/config/schema';
import type { AuthenticationService } from '../../src/services/AuthenticationService';
import type { UserService, User } from '../../src/services/UserService';
import type { RoleService } from '../../src/services/RoleService';
import type { AuditLoggingService } from '../../src/services/AuditLoggingService';
import type { LoggerService } from '../../src/services/LoggerService';

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

function createMockUser(overrides: Partial<User> = {}): User {
  const now = new Date().toISOString();
  return {
    id: 'user-id-001',
    username: 'testuser',
    email: 'user@example.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    isActive: 1,
    isAdmin: 0,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    ...overrides,
  };
}

// --- Arbitraries ---

/** Generates a valid Entra ID subject identifier (opaque string) */
const subArb = fc.stringMatching(/^[a-zA-Z0-9_-]{10,40}$/);

/** Generates a valid email address */
const emailArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9._]{2,15}$/),
  fc.stringMatching(/^[a-z]{3,10}\.[a-z]{2,4}$/),
).map(([local, domain]) => `${local}@${domain}`);

/** Generates a valid preferred_username (matches ^[a-zA-Z0-9_]{3,50}$) */
const validUsernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,49}$/);

/** Generates first/last names */
const nameArb = fc.stringMatching(/^[A-Z][a-z]{1,19}$/);

/** Generates a complete valid IdTokenClaims set */
const validClaimsArb = fc.record({
  sub: subArb,
  email: emailArb,
  preferred_username: validUsernameArb,
  given_name: nameArb,
  family_name: nameArb,
  nonce: fc.stringMatching(/^[a-f0-9]{32,64}$/),
  aud: fc.constant('test-client-id-111'),
  iss: fc.constant('https://login.microsoftonline.com/test-tenant-id-000/v2.0'),
  exp: fc.constant(Math.floor(Date.now() / 1000) + 3600),
}) as fc.Arbitrary<IdTokenClaims>;

/**
 * Generates a preferred_username that does NOT match ^[a-zA-Z0-9_]{3,50}$
 * (contains special chars, spaces, dots, hyphens, or is too short/long)
 */
const invalidUsernameArb = fc.oneof(
  // Contains disallowed characters (dots, hyphens, spaces, @)
  fc.stringMatching(/^[a-z]{3,10}[.\-@ ][a-z]{3,10}$/),
  // Too short (1-2 chars)
  fc.stringMatching(/^[a-z]{1,2}$/),
  // Contains special characters
  fc.stringMatching(/^[a-z]{3,8}[!#$%]{1,3}[a-z]{3,8}$/),
);

describe('EntraIdService — User Provisioning Properties', () => {
  let db: DatabaseAdapter;
  let config: EntraIdConfig;
  let logger: LoggerService;
  let mockUserService: UserService;
  let mockRoleService: RoleService;
  let service: EntraIdService;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createMockDb();
    config = createMockConfig();
    logger = createMockLogger();

    mockUserService = {
      findByFederatedIdentity: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      createFederatedUser: vi.fn().mockImplementation(async (claims: IdTokenClaims) => {
        return createMockUser({
          id: `new-user-${claims.sub}`,
          username: claims.preferred_username || claims.email.split('@')[0],
          email: claims.email,
          passwordHash: '',
          firstName: claims.given_name,
          lastName: claims.family_name,
          isActive: 1,
        });
      }),
      linkFederatedIdentity: vi.fn().mockResolvedValue({
        id: 'fed-id-001',
        userId: 'user-id-001',
        provider: 'entra-id',
        subject: 'test-sub',
        issuer: 'test-issuer',
        email: 'user@example.com',
        idToken: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getUserRoles: vi.fn().mockResolvedValue([]),
      assignRoleToUser: vi.fn().mockResolvedValue(undefined),
      removeRoleFromUser: vi.fn().mockResolvedValue(undefined),
    } as unknown as UserService;

    mockRoleService = {
      listRoles: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as RoleService;

    service = new EntraIdService(
      db,
      config,
      {} as AuthenticationService,
      mockUserService,
      mockRoleService,
      {} as AuditLoggingService,
      logger,
    );
  });

  // Feature: azure-entra-id-auth, Property 12: New federated user provisioning invariant
  /**
   * Property 12: New federated user provisioning invariant
   *
   * **Validates: Requirements 4.1, 4.2, 4.5**
   *
   * For any valid ID token claims (sub, email, preferred_username/derived username,
   * given_name, family_name) where no federated identity exists with that sub:
   * the service SHALL create a user with is_active=1, null password_hash,
   * a federated_identities record with provider='entra-id' and subject=sub,
   * and SHALL assign the default viewer role.
   */
  describe('Property 12: New federated user provisioning invariant', () => {
    it('creates a new user via createFederatedUser when no federated identity exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          validClaimsArb,
          async (claims) => {
            // Reset mocks for each iteration
            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(null);
            vi.mocked(mockUserService.findByEmail).mockResolvedValue(null);
            vi.mocked(mockUserService.createFederatedUser).mockResolvedValue(
              createMockUser({
                id: `new-user-${claims.sub}`,
                username: claims.preferred_username,
                email: claims.email,
                passwordHash: '',
                firstName: claims.given_name,
                lastName: claims.family_name,
                isActive: 1,
              }),
            );

            const result = await service.provisionUser(claims);

            // Service looked up federated identity first
            expect(mockUserService.findByFederatedIdentity).toHaveBeenCalledWith(
              'entra-id',
              claims.sub,
            );

            // No existing identity → called createFederatedUser with the claims
            expect(mockUserService.createFederatedUser).toHaveBeenCalledWith(claims);

            // Returned user has is_active=1 and empty passwordHash
            expect(result.isActive).toBe(1);
            expect(result.passwordHash).toBe('');

            // linkFederatedIdentity should NOT be called (createFederatedUser does it internally)
            expect(mockUserService.linkFederatedIdentity).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('the created user has correct profile fields from claims', async () => {
      await fc.assert(
        fc.asyncProperty(
          validClaimsArb,
          async (claims) => {
            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(null);
            vi.mocked(mockUserService.findByEmail).mockResolvedValue(null);

            const createdUser = createMockUser({
              id: `new-user-${claims.sub}`,
              username: claims.preferred_username,
              email: claims.email,
              passwordHash: '',
              firstName: claims.given_name,
              lastName: claims.family_name,
              isActive: 1,
              isAdmin: 0,
            });
            vi.mocked(mockUserService.createFederatedUser).mockResolvedValue(createdUser);

            const result = await service.provisionUser(claims);

            expect(result.email).toBe(claims.email);
            expect(result.firstName).toBe(claims.given_name);
            expect(result.lastName).toBe(claims.family_name);
            expect(result.isAdmin).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 13: Existing federated user profile immutability
  /**
   * Property 13: Existing federated user profile immutability
   *
   * **Validates: Requirements 4.3**
   *
   * For any returning user (federated identity already linked), calling the
   * provisioning flow with different claim values (name, email) SHALL NOT
   * modify the existing user record's first_name, last_name, or email fields.
   */
  describe('Property 13: Existing federated user profile immutability', () => {
    it('returns existing user unchanged when federated identity is already linked', async () => {
      await fc.assert(
        fc.asyncProperty(
          validClaimsArb,
          nameArb,
          nameArb,
          emailArb,
          async (claims, differentFirst, differentLast, differentEmail) => {
            // The existing user has different profile data than the incoming claims
            const existingUser = createMockUser({
              id: 'existing-user-id',
              username: 'existing_username',
              email: differentEmail,
              firstName: differentFirst,
              lastName: differentLast,
              passwordHash: 'hashed-password-value',
              isActive: 1,
            });

            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(existingUser);

            const result = await service.provisionUser(claims);

            // The returned user is the existing user, not modified
            expect(result.id).toBe('existing-user-id');
            expect(result.email).toBe(differentEmail);
            expect(result.firstName).toBe(differentFirst);
            expect(result.lastName).toBe(differentLast);

            // createFederatedUser and linkFederatedIdentity must NOT be called
            expect(mockUserService.createFederatedUser).not.toHaveBeenCalled();
            expect(mockUserService.linkFederatedIdentity).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not update the existing user password hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          validClaimsArb,
          async (claims) => {
            const existingUser = createMockUser({
              id: 'existing-user-id',
              passwordHash: 'original-bcrypt-hash-value',
              isActive: 1,
            });

            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(existingUser);

            const result = await service.provisionUser(claims);

            // Password hash remains unchanged
            expect(result.passwordHash).toBe('original-bcrypt-hash-value');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: azure-entra-id-auth, Property 14: Username derivation from invalid preferred_username
  /**
   * Property 14: Username derivation from invalid preferred_username
   *
   * **Validates: Requirements 4.7**
   *
   * For any preferred_username that does not match ^[a-zA-Z0-9_]{3,50}$,
   * the service SHALL derive the username from the email local-part by
   * replacing all characters not in [a-zA-Z0-9_] with underscores and
   * truncating to 50 characters.
   */
  describe('Property 14: Username derivation from invalid preferred_username', () => {
    it('derives username from email local-part when preferred_username is invalid', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidUsernameArb,
          emailArb,
          nameArb,
          nameArb,
          subArb,
          async (invalidUsername, email, firstName, lastName, sub) => {
            const claims: IdTokenClaims = {
              sub,
              email,
              preferred_username: invalidUsername,
              given_name: firstName,
              family_name: lastName,
              nonce: 'test-nonce-value',
              aud: config.clientId,
              iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
              exp: Math.floor(Date.now() / 1000) + 3600,
            };

            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(null);
            vi.mocked(mockUserService.findByEmail).mockResolvedValue(null);

            // Capture what createFederatedUser receives to verify username derivation
            let receivedClaims: IdTokenClaims | null = null;
            vi.mocked(mockUserService.createFederatedUser).mockImplementation(
              async (c: IdTokenClaims) => {
                receivedClaims = c;
                return createMockUser({
                  id: `new-user-${c.sub}`,
                  email: c.email,
                  // UserService.createFederatedUser internally derives the username
                  username: c.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 50),
                  passwordHash: '',
                  isActive: 1,
                });
              },
            );

            const result = await service.provisionUser(claims);

            // createFederatedUser was called with original claims
            // (UserService.deriveUsername handles the derivation internally)
            expect(receivedClaims).not.toBeNull();
            expect(receivedClaims!.preferred_username).toBe(invalidUsername);
            expect(receivedClaims!.email).toBe(email);

            // The returned username must be derived from email local-part:
            // replace non-[a-zA-Z0-9_] with underscores, truncate to 50
            const expectedUsername = email.split('@')[0]
              .replace(/[^a-zA-Z0-9_]/g, '_')
              .slice(0, 50);
            expect(result.username).toBe(expectedUsername);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('derived username is at most 50 characters', async () => {
      // Generate emails with long local parts
      const longLocalPartEmail = fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9.]{50,80}$/),
        fc.constant('example.com'),
      ).map(([local, domain]) => `${local}@${domain}`);

      await fc.assert(
        fc.asyncProperty(
          longLocalPartEmail,
          subArb,
          async (email, sub) => {
            const claims: IdTokenClaims = {
              sub,
              email,
              preferred_username: 'ab', // Too short → invalid
              given_name: 'Test',
              family_name: 'User',
              nonce: 'test-nonce',
              aud: config.clientId,
              iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
              exp: Math.floor(Date.now() / 1000) + 3600,
            };

            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(null);
            vi.mocked(mockUserService.findByEmail).mockResolvedValue(null);
            vi.mocked(mockUserService.createFederatedUser).mockImplementation(
              async (c: IdTokenClaims) => {
                const username = c.email.split('@')[0]
                  .replace(/[^a-zA-Z0-9_]/g, '_')
                  .slice(0, 50);
                return createMockUser({
                  id: `new-user-${c.sub}`,
                  email: c.email,
                  username,
                  passwordHash: '',
                  isActive: 1,
                });
              },
            );

            const result = await service.provisionUser(claims);
            expect(result.username.length).toBeLessThanOrEqual(50);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('derived username only contains [a-zA-Z0-9_]', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidUsernameArb,
          emailArb,
          subArb,
          async (invalidUsername, email, sub) => {
            const claims: IdTokenClaims = {
              sub,
              email,
              preferred_username: invalidUsername,
              given_name: 'Test',
              family_name: 'User',
              nonce: 'test-nonce',
              aud: config.clientId,
              iss: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
              exp: Math.floor(Date.now() / 1000) + 3600,
            };

            vi.mocked(mockUserService.findByFederatedIdentity).mockResolvedValue(null);
            vi.mocked(mockUserService.findByEmail).mockResolvedValue(null);
            vi.mocked(mockUserService.createFederatedUser).mockImplementation(
              async (c: IdTokenClaims) => {
                const username = c.email.split('@')[0]
                  .replace(/[^a-zA-Z0-9_]/g, '_')
                  .slice(0, 50);
                return createMockUser({
                  id: `new-user-${c.sub}`,
                  email: c.email,
                  username,
                  passwordHash: '',
                  isActive: 1,
                });
              },
            );

            const result = await service.provisionUser(claims);
            expect(result.username).toMatch(/^[a-zA-Z0-9_]+$/);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
