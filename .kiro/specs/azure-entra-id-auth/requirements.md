# Requirements Document

## Introduction

Azure Entra ID (formerly Azure AD) authentication for Pabawi, providing SSO/OAuth 2.0 + OpenID Connect as an alternative authentication method alongside the existing local username/password flow. Users authenticate via their organization's Azure tenant, with automatic provisioning on first login and group-to-role mapping from Entra ID claims.

## Glossary

- **Entra_ID_Provider**: The Azure Entra ID OpenID Connect identity provider that issues ID tokens and access tokens after user authentication
- **Auth_Service**: The Pabawi backend AuthenticationService responsible for issuing and verifying Pabawi JWT tokens
- **RBAC_Service**: The Pabawi permission system comprising UserService, RoleService, PermissionService, and GroupService
- **Config_Service**: The Pabawi ConfigService that loads and validates environment-variable-based configuration via Zod
- **SSO_Session**: A Pabawi session established via Entra ID authentication, represented by Pabawi-issued JWT access and refresh tokens
- **ID_Token**: An OpenID Connect JWT issued by Entra ID containing user identity claims (sub, email, name, groups)
- **Authorization_Code**: A short-lived code returned by Entra ID after user consent, exchangeable for tokens at the token endpoint
- **Nonce**: A cryptographically random value bound to the authentication request and validated in the returned ID token to prevent replay attacks
- **PKCE**: Proof Key for Code Exchange — a code_verifier/code_challenge mechanism that protects the authorization code flow against interception
- **Federated_User**: A Pabawi user account linked to an Entra ID identity via the `sub` claim (subject identifier)
- **Group_Claim**: An Entra ID token claim containing the user's Azure group memberships (object IDs or names)

## Requirements

### Requirement 1: Entra ID Provider Configuration

**User Story:** As an administrator, I want to configure Azure Entra ID as an authentication provider, so that organization users can sign in with their corporate credentials.

#### Acceptance Criteria

1. IF `ENTRA_ID_ENABLED` is not set or is set to any value other than `"true"`, THEN THE Config_Service SHALL skip Entra ID configuration parsing and not require any other `ENTRA_ID_*` variables
2. IF `ENTRA_ID_ENABLED` is set to `"true"`, THEN THE Config_Service SHALL require `ENTRA_ID_TENANT_ID`, `ENTRA_ID_CLIENT_ID`, `ENTRA_ID_CLIENT_SECRET`, and `ENTRA_ID_REDIRECT_URI` to be non-empty strings, and SHALL validate that `ENTRA_ID_REDIRECT_URI` is a valid URL
3. IF `ENTRA_ID_ENABLED` is `"true"` and any required variable is undefined or an empty string, THEN THE Config_Service SHALL throw a configuration validation error at startup that includes the names of all missing variables
4. THE Config_Service SHALL accept an optional `ENTRA_ID_SCOPES` variable containing a comma-separated list of scope strings, defaulting to `"openid,profile,email"`, and SHALL discard empty entries resulting from the split
5. THE Config_Service SHALL accept an optional `ENTRA_ID_GROUP_MAPPING` variable containing a JSON object whose keys are Entra ID group identifier strings and whose values are Pabawi role name strings
6. IF `ENTRA_ID_GROUP_MAPPING` is set and contains invalid JSON or does not parse to an object with string keys and string values, THEN THE Config_Service SHALL throw a configuration validation error at startup indicating the parsing failure

### Requirement 2: OAuth 2.0 Authorization Code Flow Initiation

**User Story:** As a user, I want to click a "Sign in with Microsoft" button and be redirected to my organization's Azure login page, so that I can authenticate using my corporate credentials.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/auth/entra-id/login`, THE Auth_Service SHALL respond with an HTTP 302 redirect to the Entra ID authorization endpoint (`https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize`) with a valid OpenID Connect authorization request
2. THE Auth_Service SHALL include `response_type=code`, the configured `client_id`, the configured `redirect_uri`, scopes including at minimum `openid profile email`, a cryptographically random `state` parameter (minimum 32 bytes of entropy), and a cryptographically random `nonce` parameter (minimum 32 bytes of entropy) in the authorization URL query parameters
3. THE Auth_Service SHALL use PKCE by generating a `code_verifier` of 43 to 128 characters per RFC 7636, computing a `code_challenge` using S256, and including `code_challenge` and `code_challenge_method=S256` in the authorization URL
4. THE Auth_Service SHALL store the `state`, `nonce`, and `code_verifier` values server-side associated with the user's session, with a maximum time-to-live of 10 minutes, for validation during the callback
5. IF `ENTRA_ID_ENABLED` is not `"true"`, THEN THE Auth_Service SHALL return HTTP 404 for the `/api/auth/entra-id/login` endpoint
6. IF the Entra ID integration is enabled but required configuration values (`ENTRA_ID_TENANT_ID`, `ENTRA_ID_CLIENT_ID`, or `ENTRA_ID_REDIRECT_URI`) are missing or empty at request time, THEN THE Auth_Service SHALL return an HTTP 500 response with an error message indicating a server configuration problem without exposing the specific missing values

### Requirement 3: Authorization Code Callback and Token Exchange

**User Story:** As a user returning from Azure login, I want Pabawi to securely exchange the authorization code for tokens, so that my identity is verified without exposing credentials.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/auth/entra-id/callback` with a non-empty `code` query parameter and a non-empty `state` query parameter, THE Auth_Service SHALL exchange the authorization code for tokens at the Entra ID token endpoint using the stored `code_verifier`, completing the exchange within 10 seconds or treating it as a failure
2. WHEN performing the authorization code exchange, THE Auth_Service SHALL validate that the `state` query parameter matches the value stored for the session prior to contacting the token endpoint
3. THE Auth_Service SHALL validate the returned ID_Token signature against the Entra ID JWKS (JSON Web Key Set) endpoint keys
4. THE Auth_Service SHALL validate that the `nonce` claim in the ID_Token matches the stored nonce value
5. THE Auth_Service SHALL validate the `aud` (audience) claim matches the configured `client_id` and the `iss` (issuer) claim matches the expected Entra ID issuer URL for the configured tenant
6. IF the `state` query parameter is missing, empty, or does not match the value stored for the session, THEN THE Auth_Service SHALL return HTTP 400 with error code `INVALID_STATE`
7. IF the authorization code exchange fails due to a non-2xx response from the token endpoint or a network timeout, THEN THE Auth_Service SHALL return HTTP 401 with error code `TOKEN_EXCHANGE_FAILED`
8. IF the ID_Token validation fails (signature, nonce, audience, or issuer), THEN THE Auth_Service SHALL return HTTP 401 with error code `INVALID_ID_TOKEN`
9. IF the callback request contains an `error` query parameter instead of a `code` parameter, THEN THE Auth_Service SHALL return HTTP 401 with error code `AUTH_PROVIDER_ERROR` and include the `error` and `error_description` values from the query string in the response body
10. WHEN the authorization code exchange and token validation complete (whether successfully or unsuccessfully), THE Auth_Service SHALL delete the stored `state`, `nonce`, and `code_verifier` values for the session so they cannot be reused

### Requirement 4: User Provisioning on First SSO Login

**User Story:** As a user signing in via Entra ID for the first time, I want Pabawi to automatically create my account from my Azure profile, so that I do not need a separate registration step.

#### Acceptance Criteria

1. WHEN the ID_Token is validated and no Federated_User exists with the matching `sub` claim, THE Auth_Service SHALL create a new user account using the `preferred_username`, `email`, `given_name`, and `family_name` claims from the ID_Token, storing an empty or null password hash to indicate the account is federation-only
2. THE Auth_Service SHALL store the Entra ID `sub` claim as the federated identity link on the new user record
3. WHEN the ID_Token is validated and a Federated_User already exists with the matching `sub` claim, THE Auth_Service SHALL use the existing user account for session creation without modifying the stored profile claims
4. WHEN a local user account exists with the same email as the Entra ID user but no federated link, THE Auth_Service SHALL link the Entra ID identity to the existing local account rather than creating a duplicate, preserving the existing password hash so that local login remains available
5. THE Auth_Service SHALL set newly provisioned Federated_User accounts as active by default and assign the same default role that locally created non-admin users receive
6. IF the `email` or `preferred_username` claim is missing from the ID_Token, THEN THE Auth_Service SHALL reject the authentication attempt and return an error response indicating which required claims are absent
7. IF the `preferred_username` claim does not conform to the username validation rules (3–50 characters, alphanumeric and underscores only), THEN THE Auth_Service SHALL derive the username from the local-part of the `email` claim, truncated to 50 characters, replacing disallowed characters with underscores
8. IF account provisioning fails after token validation (database write error or uniqueness constraint violation on the derived username), THEN THE Auth_Service SHALL reject the authentication attempt and return an error response indicating that account creation failed, without creating a partial user record

### Requirement 5: Group-to-Role Mapping

**User Story:** As an administrator, I want Entra ID group memberships to map to Pabawi roles, so that access control is managed centrally in Azure.

#### Acceptance Criteria

1. WHEN `ENTRA_ID_GROUP_MAPPING` is configured and the ID_Token contains a `groups` claim, THE RBAC_Service SHALL assign Pabawi roles to the user by matching each group object ID in the claim against the mapping keys and assigning the corresponding role values, and SHALL revoke any previously-mapped roles whose group object IDs are no longer present in the current `groups` claim
2. THE RBAC_Service SHALL match Entra ID group object IDs from the `groups` claim against keys in the `ENTRA_ID_GROUP_MAPPING` configuration using case-insensitive string comparison of UUID values
3. WHEN the user holds Pabawi roles that were assigned independently of the group mapping (manually or via other mechanisms), THE RBAC_Service SHALL preserve those roles unchanged during SSO login group synchronization
4. WHEN no `ENTRA_ID_GROUP_MAPPING` is configured, THE RBAC_Service SHALL not modify the user's existing Pabawi roles during SSO login
5. IF `ENTRA_ID_GROUP_MAPPING` references a Pabawi role name that does not exist in the roles table, THEN THE RBAC_Service SHALL log a warning indicating the unresolvable role name and skip that mapping entry without failing the login
6. IF `ENTRA_ID_GROUP_MAPPING` is configured but the ID_Token does not contain a `groups` claim, THEN THE RBAC_Service SHALL skip group-to-role synchronization and preserve the user's existing Pabawi roles unchanged
7. IF `ENTRA_ID_GROUP_MAPPING` contains invalid JSON that cannot be parsed, THEN THE RBAC_Service SHALL log an error at startup indicating the malformed configuration and disable group-to-role synchronization until the configuration is corrected

### Requirement 6: Pabawi Session Issuance After SSO Authentication

**User Story:** As a user who authenticated via Entra ID, I want to receive Pabawi JWT tokens, so that subsequent API requests are authorized without re-contacting Azure.

#### Acceptance Criteria

1. WHEN user provisioning or lookup completes after Entra ID authentication, THE Auth_Service SHALL issue a Pabawi JWT access token containing the user's id, username, and Pabawi roles, and a refresh token, using the same signing algorithm, issuer, audience, and expiry configuration as locally-authenticated tokens
2. WHEN issuing tokens for an SSO-authenticated user, THE Auth_Service SHALL generate a single-use authorization code with a maximum lifetime of 60 seconds, store it server-side mapped to the issued tokens, and redirect the user to the frontend application URL with the authorization code as a query parameter
3. WHEN the frontend exchanges the authorization code at the token endpoint, THE Auth_Service SHALL return the mapped access token and refresh token, then immediately invalidate the authorization code so it cannot be reused
4. IF the authorization code has expired or has already been exchanged, THEN THE Auth_Service SHALL reject the exchange request with an error response indicating the code is invalid and SHALL NOT issue tokens
5. WHEN issuing tokens after successful SSO login, THE Auth_Service SHALL update the user's `last_login_at` timestamp to the current UTC time
6. WHEN issuing tokens after successful SSO login, THE Auth_Service SHALL record the login via the AuditLoggingService with event type AUTH, action LOGIN_SUCCESS, and authentication method set to `entra-id`

### Requirement 7: Coexistence with Local Authentication

**User Story:** As an administrator, I want both local and SSO authentication to work simultaneously, so that users can choose their preferred login method.

#### Acceptance Criteria

1. WHILE `ENTRA_ID_ENABLED` is `"true"`, THE Auth_Service SHALL continue to accept local username/password authentication at `/api/auth/login`
2. THE Auth_Service SHALL verify JWT tokens issued via either local or Entra ID authentication using the same middleware and grant equivalent access to protected API endpoints for tokens carrying identical role and permission claims
3. WHEN a Federated_User has a password hash set, THE Auth_Service SHALL allow that user to authenticate via either local credentials or Entra ID
4. IF a Federated_User has no password hash set and attempts local login, THEN THE Auth_Service SHALL reject the request with HTTP 401 and an error message indicating the account requires SSO authentication
5. WHILE `ENTRA_ID_ENABLED` is `"true"`, THE frontend SHALL display both the "Sign in with Microsoft" button and the local login form on the login page
6. WHILE `ENTRA_ID_ENABLED` is `"false"`, THE frontend SHALL display only the local login form and SHALL NOT render the "Sign in with Microsoft" button

### Requirement 8: Logout Flow

**User Story:** As a user who authenticated via SSO, I want to log out completely, so that my session is terminated in both Pabawi and optionally in Azure.

#### Acceptance Criteria

1. WHEN an authenticated user calls the `POST /api/auth/logout` endpoint, THE Auth_Service SHALL revoke the access token presented in the Authorization header and any associated refresh token, and return an HTTP 200 response
2. IF the user's session was established via Entra ID authentication, THEN THE Auth_Service SHALL include an `entraIdLogoutUrl` field in the logout response body containing the Entra ID end-session endpoint URL with the `post_logout_redirect_uri` parameter set to the configured redirect destination and the `id_token_hint` parameter set to the user's stored ID token
3. IF the user's session was established via local authentication (not via Entra ID), THEN THE Auth_Service SHALL omit the `entraIdLogoutUrl` field from the logout response body
4. WHEN the frontend receives a logout response containing an `entraIdLogoutUrl` field, THE frontend SHALL redirect the user to that URL to complete single sign-out at Azure
5. THE Auth_Service SHALL accept an optional `ENTRA_ID_POST_LOGOUT_REDIRECT_URI` configuration variable for the post-logout redirect destination, defaulting to the value of the application's base URL (the `HOST` and `PORT` configuration)
6. IF the access token presented in the logout request is already revoked or invalid, THEN THE Auth_Service SHALL return an HTTP 401 response with error code `TOKEN_REVOKED`

### Requirement 9: Security Controls

**User Story:** As an administrator, I want the SSO integration to follow security best practices, so that the authentication flow is resistant to common attacks.

#### Acceptance Criteria

1. THE Auth_Service SHALL validate the `state` parameter on every callback request and reject with HTTP 400 if missing or mismatched
2. THE Auth_Service SHALL validate the `nonce` in every ID_Token and reject with HTTP 401 if it does not match the stored value
3. THE Auth_Service SHALL use PKCE (S256) on every authorization request to prevent authorization code interception
4. THE Auth_Service SHALL validate ID_Token signatures using keys fetched from the Entra ID JWKS endpoint and cache the JWKS keys with a configurable TTL (default 24 hours)
5. THE Auth_Service SHALL reject ID_Tokens where the `exp` claim indicates the token has expired, allowing a clock skew tolerance of no more than 5 minutes
6. THE Auth_Service SHALL store `state`, `nonce`, and `code_verifier` values with a maximum lifetime of 10 minutes, and SHALL reject callback requests arriving after expiry with HTTP 400 and error code `SESSION_EXPIRED`
7. THE Auth_Service SHALL never log or expose the `client_secret`, authorization codes, or Entra ID tokens in application logs
8. IF the JWKS endpoint is unreachable (connection timeout exceeding 5 seconds or non-2xx response), THEN THE Auth_Service SHALL use cached keys if available and log a warning, or return HTTP 503 with error code `JWKS_UNAVAILABLE` if no cached keys exist

### Requirement 10: Frontend SSO Integration

**User Story:** As a user, I want the login page to clearly present SSO as an option, so that I can authenticate with my corporate account.

#### Acceptance Criteria

1. WHEN the frontend loads the login page, THE frontend SHALL call `/api/auth/providers` to determine which authentication methods are available
2. IF the `/api/auth/providers` call fails or does not respond within 5 seconds, THEN THE frontend SHALL display only the local login form and show an error indication that SSO availability could not be determined
3. WHEN the providers response indicates Entra ID is enabled, THE frontend SHALL display a "Sign in with Microsoft" button using the Microsoft identity branding guidelines
4. WHEN the user clicks "Sign in with Microsoft", THE frontend SHALL redirect to `/api/auth/entra-id/login`
5. WHEN the frontend receives the redirect back from the SSO callback with an authorization code in the URL query parameter, THE frontend SHALL POST the code to `/api/auth/entra-id/token` and upon receiving a successful response, store the returned access token, refresh token, and user object in auth state and navigate to the authenticated landing page
6. IF the token exchange request to `/api/auth/entra-id/token` returns a non-success response, THEN THE frontend SHALL display an error message indicating authentication failed, retain the login page, and not store any tokens
7. WHEN the providers response does not indicate Entra ID is enabled, THE frontend SHALL display only the local login form without SSO options

### Requirement 11: Authentication Provider Discovery

**User Story:** As a frontend application, I want to discover available authentication methods, so that I can render the appropriate login options.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/auth/providers`, THE Auth_Service SHALL return a 200 response with a JSON object listing available authentication methods
2. THE Auth_Service SHALL include `{ "local": true }` in the providers response at all times
3. IF `ENTRA_ID_ENABLED` is set to `"true"`, THEN THE Auth_Service SHALL include `{ "entraId": { "enabled": true, "name": "Microsoft Entra ID" } }` in the providers response
4. IF `ENTRA_ID_ENABLED` is not set to `"true"`, THEN THE Auth_Service SHALL omit the `entraId` key from the providers response
5. THE `/api/auth/providers` endpoint SHALL be accessible without authentication
