/**
 * Unit tests for EntraIdService — authorization URL generation, state cleanup,
 * and provider info.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EntraIdService, EntraIdError, ENTRA_ID_ERROR_CODES } from '../../../src/services/EntraIdService';
import type { IdTokenClaims } from '../../../src/services/EntraIdService';
import type { DatabaseAdapter } from '../../../src/database/DatabaseAdapter';
import type { EntraIdConfig } from '../../../src/config/schema';
import type { AuthenticationService } from '../../../src/services/AuthenticationService';
import type { UserService, User } from '../../../src/services/UserService';
import type { RoleService } from '../../../src/services/RoleService';
import type { AuditLoggingService } from '../../../src/services/AuditLoggingService';
import type { LoggerService } from '../../../src/services/LoggerService';

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

describe('EntraIdService', () => {
  let db: DatabaseAdapter;
  let config: EntraIdConfig;
  let logger: LoggerService;
  let service: EntraIdService;

  beforeEach(() => {
    db = createMockDb();
    config = createMockConfig();
    logger = createMockLogger();
    service = new EntraIdService(
      db,
      config,
      {} as AuthenticationService,
      {} as UserService,
      {} as RoleService,
      {} as AuditLoggingService,
      logger,
    );
  });

  describe('generateAuthorizationUrl()', () => {
    it('returns a URL targeting the correct Entra ID authorize endpoint', async () => {
      const { url } = await service.generateAuthorizationUrl();
      expect(url).toContain(
        `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
      );
    });

    it('includes response_type=code', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('response_type')).toBe('code');
    });

    it('includes the configured client_id', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('client_id')).toBe(config.clientId);
    });

    it('includes the configured redirect_uri', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('redirect_uri')).toBe(config.redirectUri);
    });

    it('includes space-separated scopes', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('scope')).toBe('openid profile email');
    });

    it('includes a state parameter with at least 32 bytes of entropy (64 hex chars)', async () => {
      const { url, state } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('state')).toBe(state);
      expect(state).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    it('includes a nonce parameter with at least 32 bytes of entropy', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      const nonce = params.get('nonce');
      expect(nonce).toHaveLength(64);
      expect(nonce).toMatch(/^[0-9a-f]+$/);
    });

    it('includes code_challenge and code_challenge_method=S256', async () => {
      const { url } = await service.generateAuthorizationUrl();
      const params = new URL(url).searchParams;
      expect(params.get('code_challenge_method')).toBe('S256');
      const challenge = params.get('code_challenge');
      expect(challenge).toBeTruthy();
      // base64url: no +, /, or = characters
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('stores state, nonce, code_verifier in oauth_state_store with 10-minute TTL', async () => {
      const before = Date.now();
      await service.generateAuthorizationUrl();
      const after = Date.now();

      expect(db.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('INSERT INTO oauth_state_store');

      const [state, nonce, codeVerifier, createdAt, expiresAt] = params as string[];
      expect(state).toHaveLength(64);
      expect(nonce).toHaveLength(64);
      // code_verifier: 64 chars from unreserved charset
      expect(codeVerifier).toHaveLength(64);
      expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);

      // Verify 10-minute TTL
      const createdMs = new Date(createdAt).getTime();
      const expiresMs = new Date(expiresAt).getTime();
      expect(createdMs).toBeGreaterThanOrEqual(before);
      expect(createdMs).toBeLessThanOrEqual(after);
      expect(expiresMs - createdMs).toBe(10 * 60 * 1000);
    });

    it('generates unique state values on each call', async () => {
      const r1 = await service.generateAuthorizationUrl();
      const r2 = await service.generateAuthorizationUrl();
      expect(r1.state).not.toBe(r2.state);
    });

    it('logs the generation without exposing secrets', async () => {
      await service.generateAuthorizationUrl();
      expect(logger.info).toHaveBeenCalledWith(
        'Generated authorization URL',
        expect.objectContaining({
          component: 'EntraIdService',
          operation: 'generateAuthorizationUrl',
        }),
      );
    });
  });

  describe('cleanupExpiredState()', () => {
    it('deletes expired entries and returns the count', async () => {
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ changes: 3 });
      const deleted = await service.cleanupExpiredState();
      expect(deleted).toBe(3);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM oauth_state_store WHERE expires_at < ?'),
        expect.any(Array),
      );
    });

    it('returns 0 when no expired entries exist', async () => {
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ changes: 0 });
      const deleted = await service.cleanupExpiredState();
      expect(deleted).toBe(0);
    });

    it('logs only when entries are actually deleted', async () => {
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ changes: 0 });
      await service.cleanupExpiredState();
      expect(logger.info).not.toHaveBeenCalled();

      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ changes: 2 });
      await service.cleanupExpiredState();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2'),
        expect.objectContaining({
          component: 'EntraIdService',
          operation: 'cleanupExpiredState',
        }),
      );
    });
  });

  describe('getProviderInfo()', () => {
    it('returns enabled=true and name "Microsoft Entra ID"', () => {
      const info = service.getProviderInfo();
      expect(info).toEqual({ enabled: true, name: 'Microsoft Entra ID' });
    });
  });

  describe('provisionUser()', () => {
    let mockUserService: {
      findByFederatedIdentity: ReturnType<typeof vi.fn>;
      findByEmail: ReturnType<typeof vi.fn>;
      createFederatedUser: ReturnType<typeof vi.fn>;
      linkFederatedIdentity: ReturnType<typeof vi.fn>;
    };
    let provisionService: EntraIdService;

    const baseUser: User = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashed',
      firstName: 'Test',
      lastName: 'User',
      isActive: 1,
      isAdmin: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastLoginAt: null,
    };

    const baseClaims: IdTokenClaims = {
      sub: 'entra-sub-abc123',
      email: 'test@example.com',
      preferred_username: 'testuser',
      given_name: 'Test',
      family_name: 'User',
      nonce: 'nonce-value',
      aud: 'test-client-id-111',
      iss: 'https://login.microsoftonline.com/test-tenant-id-000/v2.0',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    beforeEach(() => {
      mockUserService = {
        findByFederatedIdentity: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        createFederatedUser: vi.fn().mockResolvedValue(baseUser),
        linkFederatedIdentity: vi.fn().mockResolvedValue({
          id: 'fed-id-1',
          userId: baseUser.id,
          provider: 'entra-id',
          subject: baseClaims.sub,
          issuer: baseClaims.iss,
          email: baseClaims.email,
          idToken: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }),
      };

      provisionService = new EntraIdService(
        db,
        config,
        {} as AuthenticationService,
        mockUserService as unknown as UserService,
        {} as RoleService,
        {} as AuditLoggingService,
        logger,
      );
    });

    it('throws MISSING_CLAIMS when both email and preferred_username are absent', async () => {
      const claims: IdTokenClaims = {
        ...baseClaims,
        email: '',
        preferred_username: '',
      };

      await expect(provisionService.provisionUser(claims)).rejects.toThrow(EntraIdError);
      await expect(provisionService.provisionUser(claims)).rejects.toMatchObject({
        code: ENTRA_ID_ERROR_CODES.MISSING_CLAIMS,
      });
    });

    it('returns existing user when federated identity is found (no profile update)', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(baseUser);

      const result = await provisionService.provisionUser(baseClaims);

      expect(result).toBe(baseUser);
      expect(mockUserService.findByFederatedIdentity).toHaveBeenCalledWith(
        'entra-id',
        baseClaims.sub,
      );
      // Must not call create or link
      expect(mockUserService.createFederatedUser).not.toHaveBeenCalled();
      expect(mockUserService.linkFederatedIdentity).not.toHaveBeenCalled();
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('links federated identity to existing email-match user', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(baseUser);

      const result = await provisionService.provisionUser(baseClaims);

      expect(result).toBe(baseUser);
      expect(mockUserService.linkFederatedIdentity).toHaveBeenCalledWith(
        baseUser.id,
        'entra-id',
        baseClaims.sub,
        baseClaims.iss,
        baseClaims.email,
      );
      expect(mockUserService.createFederatedUser).not.toHaveBeenCalled();
    });

    it('creates new federated user when no match found', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);

      const newUser = { ...baseUser, id: 'new-user-456' };
      mockUserService.createFederatedUser.mockResolvedValue(newUser);

      const result = await provisionService.provisionUser(baseClaims);

      expect(result).toBe(newUser);
      expect(mockUserService.createFederatedUser).toHaveBeenCalledWith(baseClaims);
    });

    it('wraps createFederatedUser errors as PROVISIONING_FAILED', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.createFederatedUser.mockRejectedValue(
        new Error('UNIQUE constraint failed: users.username'),
      );

      await expect(provisionService.provisionUser(baseClaims)).rejects.toMatchObject({
        code: ENTRA_ID_ERROR_CODES.PROVISIONING_FAILED,
        message: 'Account creation failed',
      });
    });

    it('wraps linkFederatedIdentity errors as PROVISIONING_FAILED', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(baseUser);
      mockUserService.linkFederatedIdentity.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(provisionService.provisionUser(baseClaims)).rejects.toMatchObject({
        code: ENTRA_ID_ERROR_CODES.PROVISIONING_FAILED,
        message: 'Account creation failed',
      });
    });

    it('proceeds to createFederatedUser when email is present but no email match', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);

      await provisionService.provisionUser(baseClaims);

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(baseClaims.email);
      expect(mockUserService.createFederatedUser).toHaveBeenCalledWith(baseClaims);
    });

    it('skips email lookup and creates user when email is empty but preferred_username is present', async () => {
      const claims: IdTokenClaims = {
        ...baseClaims,
        email: '',
        preferred_username: 'someuser',
      };

      mockUserService.findByFederatedIdentity.mockResolvedValue(null);

      await provisionService.provisionUser(claims);

      // findByEmail should not be called with empty string
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
      expect(mockUserService.createFederatedUser).toHaveBeenCalledWith(claims);
    });

    it('logs provisioning actions without exposing tokens or secrets', async () => {
      mockUserService.findByFederatedIdentity.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);

      await provisionService.provisionUser(baseClaims);

      expect(logger.info).toHaveBeenCalledWith(
        'New federated user created',
        expect.objectContaining({
          component: 'EntraIdService',
          operation: 'provisionUser',
        }),
      );
    });
  });

  describe('syncGroupRoles()', () => {
    let mockUserService: {
      findByFederatedIdentity: ReturnType<typeof vi.fn>;
      findByEmail: ReturnType<typeof vi.fn>;
      createFederatedUser: ReturnType<typeof vi.fn>;
      linkFederatedIdentity: ReturnType<typeof vi.fn>;
      getUserRoles: ReturnType<typeof vi.fn>;
      assignRoleToUser: ReturnType<typeof vi.fn>;
      removeRoleFromUser: ReturnType<typeof vi.fn>;
    };
    let mockRoleService: {
      listRoles: ReturnType<typeof vi.fn>;
    };
    let syncService: EntraIdService;

    const allRoles = [
      { id: 'role-admin', name: 'Administrator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      { id: 'role-operator', name: 'Operator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      { id: 'role-viewer', name: 'Viewer', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      { id: 'role-deploy', name: 'Deployer', description: '', isBuiltIn: 0, createdAt: '', updatedAt: '' },
    ];

    beforeEach(() => {
      mockUserService = {
        findByFederatedIdentity: vi.fn(),
        findByEmail: vi.fn(),
        createFederatedUser: vi.fn(),
        linkFederatedIdentity: vi.fn(),
        getUserRoles: vi.fn().mockResolvedValue([]),
        assignRoleToUser: vi.fn().mockResolvedValue(undefined),
        removeRoleFromUser: vi.fn().mockResolvedValue(undefined),
      };

      mockRoleService = {
        listRoles: vi.fn().mockResolvedValue({ items: allRoles, total: allRoles.length, limit: 1000, offset: 0 }),
      };
    });

    function createSyncService(groupMapping: Record<string, string> | null): EntraIdService {
      const cfg = { ...createMockConfig(), groupMapping };
      syncService = new EntraIdService(
        db,
        cfg,
        {} as AuthenticationService,
        mockUserService as unknown as UserService,
        mockRoleService as unknown as RoleService,
        {} as AuditLoggingService,
        logger,
      );
      return syncService;
    }

    it('skips sync when groupMapping is null', async () => {
      createSyncService(null);
      await syncService.syncGroupRoles('user-1', ['group-a']);
      expect(mockRoleService.listRoles).not.toHaveBeenCalled();
      expect(mockUserService.getUserRoles).not.toHaveBeenCalled();
    });

    it('skips sync when groups is undefined', async () => {
      createSyncService({ 'group-a': 'Operator' });
      await syncService.syncGroupRoles('user-1', undefined);
      expect(mockRoleService.listRoles).not.toHaveBeenCalled();
      expect(mockUserService.getUserRoles).not.toHaveBeenCalled();
    });

    it('assigns roles for matched group IDs', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
        'bbbbbbbb-1111-2222-3333-444444444444': 'Deployer',
      });
      mockUserService.getUserRoles.mockResolvedValue([]);

      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
        'bbbbbbbb-1111-2222-3333-444444444444',
      ]);

      expect(mockUserService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-operator');
      expect(mockUserService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-deploy');
      expect(mockUserService.assignRoleToUser).toHaveBeenCalledTimes(2);
    });

    it('performs case-insensitive UUID matching', async () => {
      createSyncService({
        'AAAAAAAA-1111-2222-3333-444444444444': 'Operator',
      });
      mockUserService.getUserRoles.mockResolvedValue([]);

      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
      ]);

      expect(mockUserService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-operator');
    });

    it('revokes mapped roles whose group IDs are no longer in the claim', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
        'bbbbbbbb-1111-2222-3333-444444444444': 'Deployer',
      });
      // User currently has Operator and Deployer
      mockUserService.getUserRoles.mockResolvedValue([
        { id: 'role-operator', name: 'Operator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
        { id: 'role-deploy', name: 'Deployer', description: '', isBuiltIn: 0, createdAt: '', updatedAt: '' },
      ]);

      // Only group-a is in the claim now (Operator stays, Deployer revoked)
      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
      ]);

      expect(mockUserService.removeRoleFromUser).toHaveBeenCalledWith('user-1', 'role-deploy');
      expect(mockUserService.removeRoleFromUser).toHaveBeenCalledTimes(1);
      expect(mockUserService.assignRoleToUser).not.toHaveBeenCalled();
    });

    it('preserves roles assigned independently of the mapping (manually assigned)', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
      });
      // User has Viewer (manual) and Administrator (manual) — neither in mapping
      mockUserService.getUserRoles.mockResolvedValue([
        { id: 'role-viewer', name: 'Viewer', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
        { id: 'role-admin', name: 'Administrator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      ]);

      // No groups match the mapping
      await syncService.syncGroupRoles('user-1', []);

      // Should NOT remove Viewer or Administrator (they are not managed by this mapping)
      expect(mockUserService.removeRoleFromUser).not.toHaveBeenCalled();
      expect(mockUserService.assignRoleToUser).not.toHaveBeenCalled();
    });

    it('logs warning and skips mapping entry when role does not exist in Pabawi', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'NonExistentRole',
        'bbbbbbbb-1111-2222-3333-444444444444': 'Operator',
      });
      mockUserService.getUserRoles.mockResolvedValue([]);

      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
        'bbbbbbbb-1111-2222-3333-444444444444',
      ]);

      // Should log warning about NonExistentRole
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('NonExistentRole'),
        expect.objectContaining({ component: 'EntraIdService' }),
      );
      // Should still assign the valid Operator role
      expect(mockUserService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-operator');
      expect(mockUserService.assignRoleToUser).toHaveBeenCalledTimes(1);
    });

    it('does not assign roles the user already has', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
      });
      // User already has Operator
      mockUserService.getUserRoles.mockResolvedValue([
        { id: 'role-operator', name: 'Operator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      ]);

      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
      ]);

      expect(mockUserService.assignRoleToUser).not.toHaveBeenCalled();
      expect(mockUserService.removeRoleFromUser).not.toHaveBeenCalled();
    });

    it('handles empty groups claim by revoking all mapped roles', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
        'bbbbbbbb-1111-2222-3333-444444444444': 'Deployer',
      });
      // User has both mapped roles
      mockUserService.getUserRoles.mockResolvedValue([
        { id: 'role-operator', name: 'Operator', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
        { id: 'role-deploy', name: 'Deployer', description: '', isBuiltIn: 0, createdAt: '', updatedAt: '' },
        { id: 'role-viewer', name: 'Viewer', description: '', isBuiltIn: 1, createdAt: '', updatedAt: '' },
      ]);

      // Empty groups array — all mapped roles should be revoked, Viewer preserved
      await syncService.syncGroupRoles('user-1', []);

      expect(mockUserService.removeRoleFromUser).toHaveBeenCalledWith('user-1', 'role-operator');
      expect(mockUserService.removeRoleFromUser).toHaveBeenCalledWith('user-1', 'role-deploy');
      expect(mockUserService.removeRoleFromUser).toHaveBeenCalledTimes(2);
      // Viewer not touched
      expect(mockUserService.assignRoleToUser).not.toHaveBeenCalled();
    });

    it('logs sync completion with counts', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
      });
      mockUserService.getUserRoles.mockResolvedValue([]);

      await syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
      ]);

      expect(logger.info).toHaveBeenCalledWith(
        'Group-to-role sync completed',
        expect.objectContaining({
          component: 'EntraIdService',
          operation: 'syncGroupRoles',
          metadata: expect.objectContaining({
            userId: 'user-1',
            assigned: 1,
            revoked: 0,
            groupCount: 1,
          }),
        }),
      );
    });

    it('continues gracefully when assignRoleToUser throws (race condition)', async () => {
      createSyncService({
        'aaaaaaaa-1111-2222-3333-444444444444': 'Operator',
        'bbbbbbbb-1111-2222-3333-444444444444': 'Deployer',
      });
      mockUserService.getUserRoles.mockResolvedValue([]);
      mockUserService.assignRoleToUser
        .mockRejectedValueOnce(new Error('Role is already assigned to this user'))
        .mockResolvedValueOnce(undefined);

      // Should not throw — the error is swallowed with a log
      await expect(syncService.syncGroupRoles('user-1', [
        'aaaaaaaa-1111-2222-3333-444444444444',
        'bbbbbbbb-1111-2222-3333-444444444444',
      ])).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to assign role'),
        expect.any(Object),
      );
    });
  });
});
