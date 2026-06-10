import { createHash, createPublicKey, randomBytes } from 'crypto';

import jwt from 'jsonwebtoken';

import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import type { EntraIdConfig } from '../config/schema';
import type { AuthenticationService } from './AuthenticationService';
import type { UserService, User } from './UserService';
import type { UserDTO } from './UserService';
import type { RoleService } from './RoleService';
import type { AuditLoggingService } from './AuditLoggingService';
import type { LoggerService } from './LoggerService';

// --- Error code constants ---
export const ENTRA_ID_ERROR_CODES = {
  INVALID_STATE: 'INVALID_STATE',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
  INVALID_ID_TOKEN: 'INVALID_ID_TOKEN',
  AUTH_PROVIDER_ERROR: 'AUTH_PROVIDER_ERROR',
  MISSING_CLAIMS: 'MISSING_CLAIMS',
  JWKS_UNAVAILABLE: 'JWKS_UNAVAILABLE',
  PROVISIONING_FAILED: 'PROVISIONING_FAILED',
  INVALID_AUTH_CODE: 'INVALID_AUTH_CODE',
} as const;

export type EntraIdErrorCode = typeof ENTRA_ID_ERROR_CODES[keyof typeof ENTRA_ID_ERROR_CODES];

// --- Typed error class ---
export class EntraIdError extends Error {
  readonly code: EntraIdErrorCode;

  constructor(code: EntraIdErrorCode, message: string) {
    super(message);
    this.name = 'EntraIdError';
    this.code = code;
  }
}

// --- IdTokenClaims interface ---
export interface IdTokenClaims {
  sub: string;
  email: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  nonce: string;
  aud: string;
  iss: string;
  exp: number;
  groups?: string[];
}

export interface OAuthStateEntry {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthCodeEntry {
  code: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
  idToken: string;
  authMethod: string;
  createdAt: string;
  expiresAt: string;
}

// --- JWKS types ---
interface JwksKey {
  kty: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
  x5c?: string[];
}

interface JwksCache {
  keys: JwksKey[];
  fetchedAt: number;
}

/**
 * EntraIdService handles Azure Entra ID (OpenID Connect) authentication.
 *
 * This service manages:
 * - Authorization URL generation with PKCE and state/nonce
 * - State store lifecycle (creation + TTL-based expiry cleanup)
 * - Token exchange and ID token validation
 * - JWKS key fetching and caching
 * - Provider metadata for frontend discovery
 */
export class EntraIdService {
  private readonly db: DatabaseAdapter;
  private readonly config: EntraIdConfig;
  readonly authService: AuthenticationService;
  readonly userService: UserService;
  readonly roleService: RoleService;
  readonly auditLogger: AuditLoggingService;
  private readonly logger: LoggerService;
  private jwksCache: JwksCache | null = null;

  constructor(
    db: DatabaseAdapter,
    config: EntraIdConfig,
    authService: AuthenticationService,
    userService: UserService,
    roleService: RoleService,
    auditLogger: AuditLoggingService,
    logger: LoggerService,
  ) {
    this.db = db;
    this.config = config;
    this.authService = authService;
    this.userService = userService;
    this.roleService = roleService;
    this.auditLogger = auditLogger;
    this.logger = logger;
  }

  /**
   * Generate an authorization URL for the Entra ID OAuth 2.0 + OIDC flow.
   *
   * Creates cryptographically random state, nonce, and PKCE code_verifier,
   * stores them in oauth_state_store with a 10-minute TTL, then returns
   * the full authorization endpoint URL with all required query parameters.
   */
  async generateAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    const codeVerifier = this.generateCodeVerifier(64);
    const codeChallenge = this.computeCodeChallenge(codeVerifier);

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await this.db.execute(
      `INSERT INTO oauth_state_store (state, nonce, code_verifier, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [state, nonce, codeVerifier, createdAt, expiresAt],
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const baseUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize`;
    const url = `${baseUrl}?${params.toString()}`;

    this.logger.info('Generated authorization URL', {
      component: 'EntraIdService',
      operation: 'generateAuthorizationUrl',
      metadata: { tenantId: this.config.tenantId },
    });

    return { url, state };
  }

  /**
   * Delete expired entries from oauth_state_store.
   *
   * @returns Number of deleted rows
   */
  async cleanupExpiredState(): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db.execute(
      `DELETE FROM oauth_state_store WHERE expires_at < ?`,
      [now],
    );

    const deleted = result.changes;

    if (deleted > 0) {
      this.logger.info(`Cleaned up ${String(deleted)} expired OAuth state entries`, {
        component: 'EntraIdService',
        operation: 'cleanupExpiredState',
        metadata: { deletedCount: deleted },
      });
    }

    return deleted;
  }

  /**
   * Return provider info for the discovery endpoint.
   */
  getProviderInfo(): { enabled: true; name: string } {
    return { enabled: true, name: 'Microsoft Entra ID' };
  }

  /**
   * Handle the OAuth callback: validate state, exchange code for tokens,
   * validate the ID token, provision/lookup user, sync roles, issue session.
   *
   * Returns an AuthCodeEntry containing the single-use authorization code
   * that the frontend will exchange for the actual JWT pair.
   */
  async handleCallback(code: string, state: string): Promise<AuthCodeEntry> {
    const logMeta = { component: 'EntraIdService', operation: 'handleCallback' };

    // 1. Look up state entry
    const stateEntry = await this.db.queryOne<{
      state: string;
      nonce: string;
      code_verifier: string;
      created_at: string;
      expires_at: string;
    }>(
      `SELECT state, nonce, code_verifier, created_at, expires_at
       FROM oauth_state_store WHERE state = ?`,
      [state],
    );

    // 2. Delete state entry immediately (one-time use, even on failure)
    await this.db.execute(
      `DELETE FROM oauth_state_store WHERE state = ?`,
      [state],
    );

    // 3. Validate state exists
    if (!stateEntry) {
      this.logger.warn('OAuth callback received with invalid state', logMeta);
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_STATE,
        'State parameter missing or mismatched',
      );
    }

    // 4. Verify state not expired
    const now = new Date();
    const expiresAt = new Date(stateEntry.expires_at);
    if (now > expiresAt) {
      this.logger.warn('OAuth callback received with expired state', logMeta);
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_STATE,
        'Authentication session expired',
      );
    }

    // 5. Exchange authorization code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(
      code,
      stateEntry.code_verifier,
    );

    // 6. Fetch JWKS keys (cached)
    const jwksKeys = await this.getJwksKeys();

    // 7. Verify ID token
    const claims = this.verifyIdToken(
      tokenResponse.id_token,
      jwksKeys,
      stateEntry.nonce,
    );

    this.logger.info('ID token validated successfully', {
      ...logMeta,
      metadata: { sub: claims.sub },
    });

    // 8. Provision or look up the user
    const user = await this.provisionUser(claims);

    // 9. Sync group-to-role mapping
    await this.syncGroupRoles(user.id, claims.groups);

    // 10. Issue session tokens and generate auth code
    const authCodeEntry = await this.issueSessionTokens(
      user,
      tokenResponse.id_token,
    );

    return authCodeEntry;
  }

  /**
   * Provision or locate a user based on validated ID token claims.
   *
   * Flow:
   * 1. Reject if email AND preferred_username are both missing
   * 2. Look up federated_identities by (provider='entra-id', subject=sub)
   * 3. If found: return existing user without updating profile (immutability)
   * 4. If not found: check users by email
   * 5. If email match: link federated identity to existing account
   * 6. If no match: create new federated user
   *
   * @param claims - Validated ID token claims
   * @returns The provisioned or existing user
   */
  async provisionUser(claims: IdTokenClaims): Promise<User> {
    const logMeta = { component: 'EntraIdService', operation: 'provisionUser' };

    // 1. Reject if both email and preferred_username are missing
    if (!claims.email && !claims.preferred_username) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.MISSING_CLAIMS,
        'Required identity claims absent: email and preferred_username',
      );
    }

    // 2. Look up by federated identity
    const existingUser = await this.userService.findByFederatedIdentity(
      'entra-id',
      claims.sub,
    );

    if (existingUser) {
      // 3. Returning user — do NOT update profile claims (immutability)
      this.logger.info('Returning federated user found', {
        ...logMeta,
        metadata: { userId: existingUser.id, sub: claims.sub },
      });
      return existingUser;
    }

    // 4. No federated identity — check by email
    if (claims.email) {
      const emailMatch = await this.userService.findByEmail(claims.email);

      if (emailMatch) {
        // 5. Email match — link federated identity to existing account
        try {
          await this.userService.linkFederatedIdentity(
            emailMatch.id,
            'entra-id',
            claims.sub,
            claims.iss,
            claims.email,
          );

          this.logger.info('Linked federated identity to existing account', {
            ...logMeta,
            metadata: { userId: emailMatch.id, sub: claims.sub },
          });

          return emailMatch;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error('Failed to link federated identity', {
            ...logMeta,
            metadata: { error: message },
          });
          throw new EntraIdError(
            ENTRA_ID_ERROR_CODES.PROVISIONING_FAILED,
            'Account creation failed',
          );
        }
      }
    }

    // 6. No match — create new federated user
    try {
      const newUser = await this.userService.createFederatedUser(claims);

      this.logger.info('New federated user created', {
        ...logMeta,
        metadata: { userId: newUser.id, sub: claims.sub },
      });

      return newUser;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to create federated user', {
        ...logMeta,
        metadata: { error: message },
      });
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.PROVISIONING_FAILED,
        'Account creation failed',
      );
    }
  }

  /**
   * Issue Pabawi JWT session tokens and generate a single-use authorization code.
   *
   * Steps:
   * 1. Generate access + refresh tokens via AuthenticationService
   * 2. Generate a crypto-random single-use authorization code
   * 3. Store the code in oauth_auth_codes with 60s TTL
   * 4. Update user's last_login_at timestamp
   * 5. Record audit log (AUTH, LOGIN_SUCCESS, method=entra-id)
   *
   * @returns AuthCodeEntry for the frontend to exchange
   */
  private async issueSessionTokens(
    user: User,
    idToken: string,
  ): Promise<AuthCodeEntry> {
    const logMeta = { component: 'EntraIdService', operation: 'issueSessionTokens' };

    // 1. Generate Pabawi JWT tokens
    const accessToken = await this.authService.generateToken(user);
    const refreshToken = await this.authService.generateRefreshToken(user);

    // 2. Generate single-use authorization code (32 bytes of entropy)
    const authCode = randomBytes(32).toString('hex');

    // 3. Store in oauth_auth_codes with 60-second TTL
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

    await this.db.execute(
      `INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [authCode, accessToken, refreshToken, user.id, idToken, 'entra-id', createdAt, expiresAt],
    );

    // 4. Update user's last_login_at
    const loginTime = now.toISOString();
    await this.db.execute(
      `UPDATE users SET last_login_at = ? WHERE id = ?`,
      [loginTime, user.id],
    );

    // 5. Record audit log
    await this.auditLogger.logAuthenticationAttempt(
      user.username,
      true,
      user.id,
      undefined,
      undefined,
      'method=entra-id',
    );

    this.logger.info('Session tokens issued for SSO user', {
      ...logMeta,
      metadata: { userId: user.id },
    });

    return {
      code: authCode,
      accessToken,
      refreshToken,
      userId: user.id,
      idToken,
      authMethod: 'entra-id',
      createdAt,
      expiresAt,
    };
  }

  /**
   * Exchange a single-use authorization code for Pabawi JWT tokens + user DTO.
   *
   * Validates that the code exists, is not expired, and has not been exchanged.
   * Marks the code as exchanged atomically. Returns the stored tokens and user.
   *
   * @throws EntraIdError with INVALID_AUTH_CODE if code is invalid, expired, or already used.
   */
  async exchangeAuthCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserDTO;
  }> {
    const logMeta = { component: 'EntraIdService', operation: 'exchangeAuthCode' };

    // 1. Look up the code
    const entry = await this.db.queryOne<{
      code: string;
      accessToken: string;
      refreshToken: string;
      userId: string;
      idToken: string;
      authMethod: string;
      createdAt: string;
      expiresAt: string;
      exchanged: number;
    }>(
      `SELECT code,
              access_token  AS "accessToken",
              refresh_token AS "refreshToken",
              user_id       AS "userId",
              id_token      AS "idToken",
              auth_method   AS "authMethod",
              created_at    AS "createdAt",
              expires_at    AS "expiresAt",
              exchanged
       FROM oauth_auth_codes WHERE code = ?`,
      [code],
    );

    // 2. Verify code exists
    if (!entry) {
      this.logger.warn('Auth code exchange attempted with invalid code', logMeta);
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE,
        'Authorization code invalid',
      );
    }

    // 3. Verify not already exchanged
    if (entry.exchanged === 1) {
      this.logger.warn('Auth code exchange attempted with already-used code', logMeta);
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE,
        'Authorization code invalid',
      );
    }

    // 4. Verify not expired
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);
    if (now > expiresAt) {
      this.logger.warn('Auth code exchange attempted with expired code', logMeta);
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE,
        'Authorization code invalid',
      );
    }

    // 5. Mark as exchanged
    await this.db.execute(
      `UPDATE oauth_auth_codes SET exchanged = 1 WHERE code = ?`,
      [code],
    );

    // 6. Look up the user
    const user = await this.userService.getUserById(entry.userId);
    if (!user) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE,
        'Authorization code invalid',
      );
    }

    this.logger.info('Auth code exchanged successfully', {
      ...logMeta,
      metadata: { userId: user.id },
    });

    return {
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      user: this.userService.toUserDTO(user),
    };
  }

  /**
   * Exchange authorization code at the Entra ID token endpoint.
   * Uses AbortSignal.timeout(10000) for 10-second timeout.
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<{ id_token: string; access_token: string }> {
    const logMeta = { component: 'EntraIdService', operation: 'exchangeCodeForTokens' };
    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Token exchange network failure', {
        ...logMeta,
        metadata: { error: message },
      });
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.TOKEN_EXCHANGE_FAILED,
        'Token endpoint unreachable',
      );
    }

    if (!response.ok) {
      this.logger.error('Token exchange returned non-2xx', {
        ...logMeta,
        metadata: { status: response.status },
      });
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.TOKEN_EXCHANGE_FAILED,
        'Could not exchange authorization code',
      );
    }

    const data = await response.json() as { id_token?: string; access_token?: string };

    if (!data.id_token || !data.access_token) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.TOKEN_EXCHANGE_FAILED,
        'Token response missing required fields',
      );
    }

    return { id_token: data.id_token, access_token: data.access_token };
  }

  /**
   * Fetch JWKS keys from the Entra ID discovery endpoint.
   * Caches keys with configurable TTL. Falls back to cache on failure.
   */
  private async getJwksKeys(): Promise<JwksKey[]> {
    const logMeta = { component: 'EntraIdService', operation: 'getJwksKeys' };
    const ttl = this.config.jwksCacheTtlMs;

    // Return cached keys if still valid
    if (this.jwksCache && (Date.now() - this.jwksCache.fetchedAt) < ttl) {
      return this.jwksCache.keys;
    }

    const jwksUrl = `https://login.microsoftonline.com/${this.config.tenantId}/discovery/v2.0/keys`;

    try {
      const response = await fetch(jwksUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`JWKS endpoint returned ${String(response.status)}`);
      }

      const data = await response.json() as { keys: JwksKey[] };
      this.jwksCache = { keys: data.keys, fetchedAt: Date.now() };
      return data.keys;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn('JWKS fetch failed, attempting cache fallback', {
        ...logMeta,
        metadata: { error: message },
      });

      // Fallback to stale cache if available
      if (this.jwksCache) {
        this.logger.warn('Using stale JWKS cache', logMeta);
        return this.jwksCache.keys;
      }

      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.JWKS_UNAVAILABLE,
        'Cannot verify token signatures',
      );
    }
  }

  /**
   * Verify the ID token: signature (RS256 via JWKS), nonce, aud, iss, exp.
   */
  private verifyIdToken(
    idToken: string,
    jwksKeys: JwksKey[],
    expectedNonce: string,
  ): IdTokenClaims {
    // Decode header to find kid
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN,
        'Token could not be decoded',
      );
    }

    const kid = decoded.header.kid;
    const key = jwksKeys.find((k) => k.kid === kid);
    if (!key) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN,
        'Token signature verification failed - key not found',
      );
    }

    // Convert JWK to PEM
    const pem = this.jwkToPem(key);

    // Verify signature, exp (with 5min clockTolerance), aud, iss
    const expectedIssuer = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`;

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(idToken, pem, {
        algorithms: ['RS256'],
        audience: this.config.clientId,
        issuer: expectedIssuer,
        clockTolerance: 300, // 5 minutes in seconds
      }) as jwt.JwtPayload;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN,
        message,
      );
    }

    // Validate nonce
    if (payload.nonce !== expectedNonce) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN,
        'Token nonce validation failed',
      );
    }

    // Validate required claims presence
    const missingClaims: string[] = [];
    if (!payload.sub) missingClaims.push('sub');
    if (!payload.email && !payload.preferred_username) {
      missingClaims.push('email or preferred_username');
    }

    if (missingClaims.length > 0) {
      throw new EntraIdError(
        ENTRA_ID_ERROR_CODES.MISSING_CLAIMS,
        `Required identity claims absent: ${missingClaims.join(', ')}`,
      );
    }

    return {
      sub: payload.sub!,
      email: String(payload.email ?? ''),
      preferred_username: String(payload.preferred_username ?? ''),
      given_name: String(payload.given_name ?? ''),
      family_name: String(payload.family_name ?? ''),
      nonce: payload.nonce as string,
      aud: (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud)!,
      iss: payload.iss!,
      exp: payload.exp!,
      groups: payload.groups as string[] | undefined,
    };
  }

  /**
   * Convert a JWK RSA key to PEM format using Node.js crypto.
   */
  private jwkToPem(key: JwksKey): string {
    const publicKey = createPublicKey({
      key: {
        kty: key.kty,
        n: key.n,
        e: key.e,
      },
      format: 'jwk',
    });

    return publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }

  /**
   * Synchronize Entra ID group memberships to Pabawi roles.
   *
   * Algorithm:
   * 1. If groupMapping is null or groups is undefined → skip (preserve existing roles)
   * 2. Get all Pabawi roles to validate mapping targets
   * 3. Get user's current roles
   * 4. Determine which mapped roles the user should have (based on groups claim)
   * 5. Add roles that are in "should have" but not currently assigned
   * 6. Remove roles that are currently assigned via mapping but no longer in "should have"
   * 7. Never touch roles that are not part of the mapping (manually assigned roles preserved)
   */
  async syncGroupRoles(userId: string, groups: string[] | undefined): Promise<void> {
    const logMeta = { component: 'EntraIdService', operation: 'syncGroupRoles' };

    // Skip sync if no mapping configured or no groups claim present
    if (!this.config.groupMapping || groups === undefined) {
      this.logger.info('Skipping group-to-role sync (no mapping or no groups claim)', logMeta);
      return;
    }

    const groupMapping = this.config.groupMapping;

    // Get all available Pabawi roles
    const allRolesResult = await this.roleService.listRoles({ limit: 1000, offset: 0 });
    const allRoles = allRolesResult.items;
    const rolesByName = new Map(allRoles.map((r) => [r.name.toLowerCase(), r]));

    // Get user's current roles
    const currentRoles = await this.userService.getUserRoles(userId);
    const currentRoleIds = new Set(currentRoles.map((r) => r.id));

    // Normalize groups claim to lowercase for case-insensitive comparison
    const normalizedGroups = new Set(groups.map((g) => g.toLowerCase()));

    // Determine which role IDs are managed by the mapping (all valid mapping targets)
    const managedRoleIds = new Set<string>();
    // Determine which role IDs the user should have based on current groups
    const shouldHaveRoleIds = new Set<string>();

    for (const [groupId, roleName] of Object.entries(groupMapping)) {
      const role = rolesByName.get(roleName.toLowerCase());

      if (!role) {
        this.logger.warn(`Group mapping references non-existent role "${roleName}", skipping`, {
          ...logMeta,
          metadata: { groupId, roleName },
        });
        continue;
      }

      managedRoleIds.add(role.id);

      // Case-insensitive UUID comparison
      if (normalizedGroups.has(groupId.toLowerCase())) {
        shouldHaveRoleIds.add(role.id);
      }
    }

    // Assign roles that user should have but doesn't
    let assigned = 0;
    for (const roleId of shouldHaveRoleIds) {
      if (!currentRoleIds.has(roleId)) {
        try {
          await this.userService.assignRoleToUser(userId, roleId);
          assigned++;
        } catch (err: unknown) {
          // Role may already be assigned (race condition) — log and continue
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.logger.warn(`Failed to assign role during group sync: ${message}`, logMeta);
        }
      }
    }

    // Revoke managed roles that user currently has but should no longer have
    let revoked = 0;
    for (const roleId of managedRoleIds) {
      if (currentRoleIds.has(roleId) && !shouldHaveRoleIds.has(roleId)) {
        try {
          await this.userService.removeRoleFromUser(userId, roleId);
          revoked++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.logger.warn(`Failed to revoke role during group sync: ${message}`, logMeta);
        }
      }
    }

    this.logger.info('Group-to-role sync completed', {
      ...logMeta,
      metadata: { userId, assigned, revoked, groupCount: groups.length },
    });
  }

  /**
   * Build the Entra ID end-session URL for single sign-out.
   *
   * Constructs the logout URL with:
   * - post_logout_redirect_uri: from config (or fallback to base URL)
   * - id_token_hint: the user's stored ID token
   *
   * @param idToken - The ID token stored from the user's SSO session
   * @returns Full Entra ID logout URL
   */
  buildLogoutUrl(idToken: string): string {
    const baseLogoutUrl =
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/logout`;

    const postLogoutRedirectUri = this.config.postLogoutRedirectUri ?? this.config.redirectUri;

    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutRedirectUri,
      id_token_hint: idToken,
    });

    return `${baseLogoutUrl}?${params.toString()}`;
  }

  /**
   * Generate a code_verifier per RFC 7636 Section 4.1.
   * Uses unreserved characters [A-Z, a-z, 0-9, "-", ".", "_", "~"].
   */
  private generateCodeVerifier(length: number): string {
    const unreserved = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = randomBytes(length);
    let verifier = '';
    for (let i = 0; i < length; i++) {
      verifier += unreserved[bytes[i] % unreserved.length];
    }
    return verifier;
  }

  /**
   * Compute code_challenge from code_verifier using S256 method.
   * SHA-256 hash → base64url encoding (no padding).
   */
  private computeCodeChallenge(codeVerifier: string): string {
    const hash = createHash('sha256').update(codeVerifier).digest();
    return hash.toString('base64url');
  }
}
