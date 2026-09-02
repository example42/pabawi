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
3. If using group-to-role mapping, also add `GroupMember.Read.All` (requires admin consent)
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

The flow uses OAuth 2.0 Authorization Code with PKCE (S256). State, nonce, and code verifier are stored server-side with a 10-minute TTL.

## User Provisioning

On first SSO login:

1. If a Pabawi user with the same email already exists, the Entra ID identity is **linked** to that account. The existing password remains valid for local login.
2. If no matching user exists, a new account is created with:
   - Username derived from `preferred_username` or email local-part
   - No password (federation-only — cannot use local login)
   - Default viewer role assigned
   - Active status

On subsequent logins, the existing account is used without modifying stored profile data.

## Group-to-Role Mapping

Map Azure group object IDs to Pabawi role names:

```bash
ENTRA_ID_GROUP_MAPPING={"e5f3a1b2-...":"administrator","c7d8e9f0-...":"operator"}
```

Behavior:

- Groups present in the token claim → corresponding Pabawi roles are assigned
- Groups removed since last login → corresponding mapped roles are revoked
- Roles assigned outside the mapping (manually) → preserved unchanged
- Mapping references a non-existent Pabawi role → warning logged, entry skipped
- No `groups` claim in token → no role changes made

Group IDs are matched case-insensitively (UUIDs).

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
- JWT tokens are identical regardless of auth method — middleware sees no difference

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
| Group roles not syncing | No `groups` claim in token | Configure group claims in Token configuration (Azure portal) |
| Config validation error at startup | Missing required variables | Set all of: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` |
