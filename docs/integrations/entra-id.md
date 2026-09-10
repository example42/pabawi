# Azure Entra ID Authentication

Pabawi supports Azure Entra ID (formerly Azure AD) as a federated authentication provider via OpenID Connect. Users authenticate through their organization's Azure tenant and are automatically provisioned on first login. Group memberships can be mapped to Pabawi roles for centralized access control.

## Prerequisites

- Azure Entra ID tenant
- App registration in the Azure portal with:
  - A client secret
  - Redirect URI configured (e.g. `https://pabawi.example.com/api/auth/entra-id/callback`)
  - `openid`, `profile`, and `email` permissions granted
- (Optional) Group claims configured in the token if using group-to-role mapping

## Configuration

```bash
ENTRA_ID_ENABLED=true
ENTRA_ID_TENANT_ID=12345678-abcd-efgh-ijkl-123456789012
ENTRA_ID_CLIENT_ID=abcdef01-2345-6789-abcd-ef0123456789
ENTRA_ID_CLIENT_SECRET=your-client-secret-value
ENTRA_ID_REDIRECT_URI=https://pabawi.example.com/api/auth/entra-id/callback

# Optional
# ENTRA_ID_SCOPES=openid,profile,email
# ENTRA_ID_GROUP_MAPPING={"group-uuid-1":"administrator","group-uuid-2":"operator"}
# ENTRA_ID_POST_LOGOUT_REDIRECT_URI=https://pabawi.example.com
# ENTRA_ID_JWKS_CACHE_TTL_MS=86400000
```

See [configuration.md](../configuration.md#azure-entra-id-sso) for the full variable reference.

## Azure Portal Setup

### 1. Register an Application

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: e.g. "Pabawi SSO"
3. Supported account types: "Accounts in this organizational directory only" (single tenant)
4. Redirect URI: Web → `https://your-pabawi-host/api/auth/entra-id/callback`
5. Click **Register**

### 2. Configure Client Secret

1. In the app registration → **Certificates & secrets → New client secret**
2. Set a description and expiry
3. Copy the **Value** (shown only once) → use as `ENTRA_ID_CLIENT_SECRET`

### 3. Configure API Permissions

1. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**
2. Add: `openid`, `profile`, `email`
3. Configure ID-token group claims if using role mapping. Pabawi does not fetch group membership from Microsoft Graph.
4. Click **Grant admin consent**

### 4. Configure Token Claims (Optional)

For group-to-role mapping:

1. Go to **Token configuration → Add groups claim**
2. Select "Security groups" and/or "All groups"
3. Under "ID token", ensure "Group ID" is selected

### 5. Note Required Values

From the app registration's **Overview** page:

- **Application (client) ID** → `ENTRA_ID_CLIENT_ID`
- **Directory (tenant) ID** → `ENTRA_ID_TENANT_ID`

## Authentication Flow

```
User → "Sign in with Microsoft" → Pabawi backend → 302 redirect to Microsoft login
Microsoft login → user authenticates → callback to Pabawi with authorization code
Pabawi → exchanges code for ID token → validates token → provisions user → issues Pabawi JWT
```

The flow uses OAuth 2.0 Authorization Code with PKCE (S256). State, nonce, and code verifier are stored server-side with a 10-minute TTL. A random HttpOnly, SameSite=Lax cookie binds the callback and final token exchange to the initiating browser. Only its SHA-256 digest is stored with state and codes. HTTPS redirect URIs use a Secure, host-only `__Host-pabawi-sso` cookie. Plain HTTP is supported for local development.

Start at `/api/auth/entra-id/login` in the browser that will complete the flow. Both the callback and `/api/auth/entra-id/token` require its cookie. Starting another login in that browser replaces the pending binding. State and final codes are claimed once using checked conditional writes; the final code expires after 60 seconds. These endpoints send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Old in-flight logins without a browser binding must restart after upgrading.

## User Provisioning

Identity lookup uses the validated provider, issuer and subject. Email and display names are profile data, not evidence of ownership of a local account. A new identity with an existing account's email is rejected. An inactive account cannot obtain a session, including through a code issued before deactivation.

If neither the identity nor the email exists, Pabawi creates an active federation-only account with a derived username and the configured default new-user role. Returning identities use the enrolled account without changing its profile. Tenant administrators control who may authenticate, including guest users: restrict assignment to this application in Entra before enabling SSO. Pabawi does not independently exclude guests.

### Explicit enrollment of an existing account

An administrator must verify the intended tenant, application-specific subject and local account through a trusted process. A signed token's email alone is insufficient. Use an authenticated Pabawi access JWT with both `rbac:admin` and `users:admin`:

```http
POST /api/auth/entra-id/enroll
Authorization: Bearer <administrator-access-jwt>
Content-Type: application/json

{"userId":"<existing-pabawi-user-id>","subject":"<verified-id-token-sub>"}
```

The issuer is fixed to the configured tenant. Enrollment preserves the local password and records the actor, target account, issuer and subject in the audit log. Duplicate identities return 409 and cannot be silently reassigned. This is an API operation; there is no enrollment UI. Review pre-upgrade email-linked accounts separately: an upgrade cannot establish who originally controlled those identities.

## Group-to-Role Mapping

Map Azure group object IDs to Pabawi role names:

```bash
ENTRA_ID_GROUP_MAPPING={"e5f3a1b2-...":"administrator","c7d8e9f0-...":"operator"}
```

At each SSO login, the mapped roles are replaced atomically from the current claims. Group IDs and role names match case-insensitively. Manual roles, including manual grants to the same role, are stored separately and remain effective when an SSO grant disappears. Permission checks and JWT role metadata use the union of both sources.

Missing or empty `groups` removes provider-managed grants. Removing mappings, including the entire configuration, also removes obsolete provider grants at the next login. A mapped role that does not exist fails reconciliation and login; no partial role update commits. Group overage or malformed group claims remove provider grants and deny login when mapping is enabled. Pabawi does not follow claim-supplied endpoints or resolve overage through Graph. See Microsoft's [group overage documentation](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-web-app-role-based-access-control).

Migration 027 marks existing direct role assignments on federated accounts as legacy because their source was not recorded. They remain effective until the next SSO reconciliation, which removes them and applies the current mapping. Before upgrading, review these assignments. To preserve an intended manual grant across that reconciliation, an entitlement administrator must remove and reassign it after the upgrade; this clears its legacy marker. Group-derived grants are unaffected. New manual assignments have explicit provenance and survive subsequent reconciliation.

Changes in Entra are observed at the next SSO login, not continuously. Disable an account or remove its Pabawi grants when immediate local revocation is required.

## Logout

When a user who authenticated via Entra ID logs out:

1. Pabawi revokes the access and refresh tokens
2. The logout response includes an `entraIdLogoutUrl`
3. The frontend redirects to that URL for single sign-out at Microsoft
4. After Microsoft logout, the browser redirects to `ENTRA_ID_POST_LOGOUT_REDIRECT_URI`

## Coexistence with Local Auth

Both authentication methods work simultaneously:

- The login page shows "Sign in with Microsoft" alongside the local login form
- Users with linked accounts can use either method
- Federation-only users (no password) must use SSO
- JWT tokens are identical regardless of auth method ; middleware sees no difference

## Security

- PKCE (S256) on every authorization request
- State and nonce validated on every callback
- ID token signatures verified against JWKS keys (cached 24h by default)
- Single-use authorization codes (60s TTL) for frontend token delivery
- Clock skew tolerance: 5 minutes for token expiry
- Client secret, authorization codes, and tokens are never logged

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 404 on `/api/auth/entra-id/login` | `ENTRA_ID_ENABLED` not set to `"true"` | Check `.env` value is exactly `true` |
| `INVALID_STATE` on callback | State expired (>10 min) or browser cookies issue | Retry login; check server clock |
| `TOKEN_EXCHANGE_FAILED` | Network issue or invalid client secret | Verify `ENTRA_ID_CLIENT_SECRET`; check connectivity to `login.microsoftonline.com` |
| `INVALID_ID_TOKEN` | Tenant/client ID mismatch or clock skew | Verify `ENTRA_ID_TENANT_ID` and `ENTRA_ID_CLIENT_ID` match the app registration |
| `MISSING_CLAIMS` | App registration missing `email` or `profile` scope | Add permissions in Azure portal and grant admin consent |
| `JWKS_UNAVAILABLE` | Cannot reach Microsoft's key endpoint | Check outbound HTTPS; keys are cached so transient failures are tolerated |
| Mapped roles disappear | Missing `groups` claim or removed mapping | Configure ID-token group claims and review mapping configuration |
| `GROUPS_UNAVAILABLE` | Group overage or malformed claims | Reduce the groups emitted for this application; Graph overage resolution is not implemented |
| `IDENTITY_COLLISION` | Existing local email without an enrolled identity | Verify ownership and use explicit administrative enrollment |
| Config validation error at startup | Missing required variables | Set all of: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` |
