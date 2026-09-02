# Implementation Plan: Azure Entra ID Authentication

## Overview

Implements Azure Entra ID (OpenID Connect) as a federated authentication provider using the OAuth 2.0 Authorization Code Flow with PKCE. The implementation adds a new `EntraIdService`, database migration, Express routes, and frontend SSO components while maintaining full backward compatibility with local authentication.

## Tasks

- [x] 1. Database migration and configuration schema
  - [x] 1.1 Create database migration `016_entra_id_auth.sql`
    - Create `federated_identities` table with columns: id, user_id, provider, subject, issuer, email, id_token, created_at, updated_at
    - Create `oauth_state_store` table with columns: state, nonce, code_verifier, created_at, expires_at
    - Create `oauth_auth_codes` table with columns: code, access_token, refresh_token, user_id, id_token, auth_method, created_at, expires_at, exchanged
    - Add indexes: idx_federated_identities_user, idx_federated_identities_lookup, idx_oauth_state_expires, idx_oauth_auth_codes_expires
    - Add FOREIGN KEY on federated_identities.user_id → users(id) ON DELETE CASCADE
    - Add UNIQUE constraint on (provider, subject) in federated_identities
    - _Requirements: 4.1, 4.2, 6.2, 9.6_

  - [x] 1.2 Add `EntraIdConfigSchema` to `backend/src/config/schema.ts`
    - Define Zod schema with: enabled (boolean, default false), tenantId (string min 1), clientId (string min 1), clientSecret (string min 1), redirectUri (string url), scopes (array of strings, default ["openid","profile","email"]), groupMapping (record string→string, nullable, default null), postLogoutRedirectUri (string url, optional), jwksCacheTtlMs (number int positive, default 86400000)
    - Export `EntraIdConfigSchema` and inferred `EntraIdConfig` type
    - Add `entraId` optional field to `AppConfigSchema`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [x] 1.3 Add Entra ID configuration parsing to `ConfigService.ts`
    - Add `parseEntraIdConfig()` private method following existing integration parsing pattern
    - Parse `ENTRA_ID_ENABLED`, `ENTRA_ID_TENANT_ID`, `ENTRA_ID_CLIENT_ID`, `ENTRA_ID_CLIENT_SECRET`, `ENTRA_ID_REDIRECT_URI`
    - Parse optional `ENTRA_ID_SCOPES` (comma-separated, discard empty entries, default to openid,profile,email)
    - Parse optional `ENTRA_ID_GROUP_MAPPING` (JSON Record<string,string>, throw on invalid JSON)
    - Parse optional `ENTRA_ID_POST_LOGOUT_REDIRECT_URI`, `ENTRA_ID_JWKS_CACHE_TTL_MS`
    - Skip all parsing when `ENTRA_ID_ENABLED !== "true"`; throw with all missing variable names when enabled but required vars absent
    - Add `getEntraIdConfig()` public accessor method
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.4 Write property tests for configuration parsing (Properties 1–4)
    - **Property 1: Non-"true" ENTRA_ID_ENABLED skips config validation**
    - **Property 2: Missing required variables produce comprehensive error**
    - **Property 3: Scope parsing discards empty entries**
    - **Property 4: Group mapping JSON round-trip**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Core EntraIdService implementation
  - [x] 3.1 Create `backend/src/services/EntraIdService.ts` — authorization URL generation
    - Implement class with constructor accepting DatabaseAdapter, EntraIdConfig, AuthenticationService, UserService, RoleService, AuditLoggingService, LoggerService
    - Implement `generateAuthorizationUrl()`: generate state (32 bytes crypto random), nonce (32 bytes), code_verifier (43–128 chars per RFC 7636), compute code_challenge via SHA256+BASE64URL, store state/nonce/code_verifier in `oauth_state_store` with 10-minute TTL, return authorization URL with all required query parameters
    - Implement `cleanupExpiredState()`: delete expired entries from oauth_state_store
    - Implement `getProviderInfo()`: return `{ enabled: true, name: "Microsoft Entra ID" }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 9.3, 9.6_

  - [x] 3.2 Write property tests for authorization URL and PKCE (Properties 5–6)
    - **Property 5: Authorization URL contains all required parameters**
    - **Property 6: PKCE code_verifier/code_challenge correctness**
    - **Validates: Requirements 2.2, 2.3, 9.3**

  - [x] 3.3 Implement `handleCallback()` in EntraIdService
    - Validate state parameter against stored entry (reject if missing/expired with INVALID_STATE)
    - Delete state entry immediately (one-time use, even on failure)
    - Exchange authorization code at `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with code_verifier, client_id, client_secret, redirect_uri (10s timeout)
    - Fetch JWKS keys from `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` (cache with configurable TTL, fallback to cache on failure)
    - Validate ID token: verify RS256 signature against JWKS keys, validate nonce, aud (=client_id), iss (=`https://login.microsoftonline.com/{tenant}/v2.0`), exp (5min skew max)
    - On validation failure, return typed errors (INVALID_STATE, TOKEN_EXCHANGE_FAILED, INVALID_ID_TOKEN, AUTH_PROVIDER_ERROR, MISSING_CLAIMS)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 9.1, 9.2, 9.4, 9.5, 9.7, 9.8_

  - [x] 3.4 Write property tests for callback validation (Properties 7–11)
    - **Property 7: State mismatch rejects callback**
    - **Property 8: ID token signature validation**
    - **Property 9: Nonce mismatch rejects token**
    - **Property 10: Audience and issuer validation**
    - **Property 11: State entries deleted after callback processing**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 9.1, 9.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. User provisioning and group-to-role synchronization
  - [x] 5.1 Add `createFederatedUser()` and `linkFederatedIdentity()` to `UserService.ts`
    - `createFederatedUser(claims)`: create user with null password_hash, is_active=1, derive username from preferred_username or email local-part (replace non-[a-zA-Z0-9_] with underscores, truncate to 50 chars), assign default viewer role, create federated_identities record with provider='entra-id' and subject=sub
    - `linkFederatedIdentity(userId, provider, subject, issuer, email)`: insert into federated_identities linking existing user to Entra ID identity
    - `findByFederatedIdentity(provider, subject)`: lookup user by federated identity
    - `findByEmail(email)`: public wrapper around existing private getUserByEmail
    - Handle uniqueness constraint violations on derived username with retry/error
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 4.8_

  - [x] 5.2 Implement user provisioning logic in EntraIdService
    - After ID token validation, look up federated_identities by (provider='entra-id', subject=sub)
    - If found: use existing user, do NOT update profile claims (immutability)
    - If not found: check users by email; if email match exists, link federated identity to existing account (preserve password_hash)
    - If no match: create new federated user via UserService.createFederatedUser()
    - Reject if email or preferred_username claims missing (MISSING_CLAIMS error)
    - Validate username derivation when preferred_username doesn't match ^[a-zA-Z0-9_]{3,50}$
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 5.3 Write property tests for user provisioning (Properties 12–14)
    - **Property 12: New federated user provisioning invariant**
    - **Property 13: Existing federated user profile immutability**
    - **Property 14: Username derivation from invalid preferred_username**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.7**

  - [x] 5.4 Implement group-to-role synchronization in EntraIdService
    - If groupMapping is configured and groups claim is present: match group object IDs case-insensitively against mapping keys
    - Assign corresponding Pabawi roles for matched groups
    - Revoke previously-mapped roles whose group IDs are no longer in the claim
    - Preserve roles assigned independently of the mapping (manually assigned)
    - If mapping references non-existent Pabawi role: log warning, skip entry
    - If no groups claim present or no mapping configured: skip sync entirely, preserve existing roles
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.5 Write property test for group-to-role synchronization (Property 15)
    - **Property 15: Group-to-role synchronization correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Session issuance and routes
  - [x] 7.1 Implement `exchangeAuthCode()` and session issuance in EntraIdService
    - After user provisioning: generate Pabawi JWT access + refresh tokens via AuthenticationService
    - Generate single-use authorization code (crypto random, 60s TTL), store in oauth_auth_codes mapped to tokens + userId + id_token
    - `exchangeAuthCode(code)`: lookup code, verify not expired and not already exchanged, mark as exchanged, return tokens + user DTO
    - Reject expired/exchanged codes with INVALID_AUTH_CODE error
    - Update user's last_login_at timestamp
    - Record audit log via AuditLoggingService (AUTH, LOGIN_SUCCESS, method=entra-id)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.2 Write property test for authorization code single-use and TTL (Property 16)
    - **Property 16: Authorization code single-use and TTL**
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [x] 7.3 Create `backend/src/routes/entraIdAuth.ts` route factory
    - Export `createEntraIdAuthRouter(databaseService, container)` following existing pattern
    - `GET /api/auth/entra-id/login`: call EntraIdService.generateAuthorizationUrl(), respond with 302 redirect
    - `GET /api/auth/entra-id/callback`: handle OAuth callback — validate state, exchange code, provision user, issue tokens, redirect to frontend with auth code
    - `POST /api/auth/entra-id/token`: exchange single-use auth code for Pabawi JWT pair (returns { token, refreshToken, user })
    - Return 404 for all endpoints when Entra ID is not enabled
    - Return 500 with SERVER_CONFIGURATION_ERROR if config values missing at request time
    - Handle error parameter from Entra ID (AUTH_PROVIDER_ERROR)
    - _Requirements: 2.1, 2.5, 2.6, 3.1, 3.6, 3.7, 3.8, 3.9, 6.2, 6.3, 6.4_

  - [x] 7.4 Add `/api/auth/providers` endpoint and modify logout in `auth.ts`
    - Add `GET /api/auth/providers` endpoint (no auth required): return `{ local: true }` always, add `{ entraId: { enabled: true, name: "Microsoft Entra ID" } }` when enabled
    - Modify `POST /api/auth/logout`: after token revocation, check if user session was established via Entra ID (lookup federated_identities + stored id_token), include `entraIdLogoutUrl` in response when applicable
    - Implement `buildLogoutUrl(idToken)` in EntraIdService: construct Entra ID end-session URL with post_logout_redirect_uri and id_token_hint
    - _Requirements: 7.4, 8.1, 8.2, 8.3, 8.5, 8.6, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.5 Write property test for providers endpoint (Property 17)
    - **Property 17: Providers endpoint always includes local authentication**
    - **Validates: Requirements 11.2**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. DI container registration and server wiring
  - [x] 9.1 Register EntraIdService in `DIContainer.ts` and wire in `server.ts`
    - Add `entraId` as optional key in `ServiceRegistry` interface
    - In server.ts: conditionally instantiate EntraIdService when Entra ID config is enabled
    - Mount entraIdAuth router at `/api/auth/entra-id` (conditional on config)
    - Ensure EntraIdService receives all required dependencies: DatabaseAdapter, EntraIdConfig, AuthenticationService, UserService, RoleService, AuditLoggingService, LoggerService
    - Set up periodic cleanup of expired state entries (e.g., every 5 minutes)
    - _Requirements: 2.5, 7.1, 7.2_

  - [x] 9.2 Write integration tests for the full OAuth flow
    - Test full authorization URL generation → callback → token exchange flow with mocked Entra ID endpoints
    - Test JWKS cache fallback on endpoint failure
    - Test token exchange timeout behavior (>10s)
    - Test database failure during provisioning (atomicity)
    - Test audit logging verification
    - Test federation-only account local login rejection (HTTP 401)
    - Test coexistence: local auth continues working when Entra ID enabled
    - _Requirements: 2.1, 3.1, 7.1, 7.2, 7.3, 7.4, 9.4, 9.8_

- [x] 10. Frontend SSO integration
  - [x] 10.1 Create `frontend/src/lib/entraIdAuth.svelte.ts`
    - Reactive state for provider availability (call `/api/auth/providers` on init)
    - Handle provider discovery failure (5s timeout → show only local login)
    - Expose `isEntraIdEnabled` derived state and `entraIdProviderName` state
    - Implement callback handler: extract `code` from URL query parameter, POST to `/api/auth/entra-id/token`, store tokens in auth state, navigate to landing page
    - Handle token exchange errors: display error message, retain login page
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7_

  - [x] 10.2 Create `frontend/src/components/EntraIdLoginButton.svelte`
    - Microsoft-branded "Sign in with Microsoft" button following Microsoft identity branding guidelines
    - On click: redirect to `/api/auth/entra-id/login`
    - Accessible: proper button semantics, ARIA label, keyboard interaction
    - _Requirements: 10.3, 10.4_

  - [x] 10.3 Modify `frontend/src/pages/Login.svelte` for SSO support
    - Import and use entraIdAuth state module
    - Conditionally render EntraIdLoginButton when `isEntraIdEnabled` is true
    - Show only local login form when Entra ID is not enabled
    - Show error indication when provider discovery fails
    - Handle callback redirect: detect `?code=` in URL, trigger token exchange flow
    - Implement SSO logout redirect when logout response contains `entraIdLogoutUrl`
    - _Requirements: 7.5, 7.6, 8.4, 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_

  - [x] 10.4 Write frontend tests
    - Test EntraIdLoginButton renders correctly with Microsoft branding
    - Test Login.svelte conditionally renders SSO button based on provider state
    - Test callback handler extracts code and exchanges for tokens
    - Test error state when provider discovery or token exchange fails
    - Test SSO logout redirect behavior
    - _Requirements: 7.5, 7.6, 10.1, 10.2, 10.3, 10.5, 10.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 17 correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The project uses TypeScript strict mode; all code must pass `tsc --noEmit`, ESLint, and vitest
- Database columns use `snake_case` with `AS "camelCase"` aliases in SELECT queries (per database conventions)
- Phased execution: each task group touches ≤5 files to comply with workspace steering rules
- Never log client_secret, authorization codes, or tokens (security requirement 9.7)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.4"] },
    { "id": 6, "tasks": ["5.3", "5.5"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4", "7.5"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "10.1"] },
    { "id": 12, "tasks": ["10.2"] },
    { "id": 13, "tasks": ["10.3"] },
    { "id": 14, "tasks": ["10.4"] }
  ]
}
```
