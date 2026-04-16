# Pabawi v0.10.0 — Security Assessment Report

**Date:** 2026-03-22
**Scope:** Full codebase review — backend (`backend/src/`) and frontend (`frontend/src/`)
**Method:** Manual static analysis

---

## Executive Summary

No critical vulnerabilities were found. The codebase applies several security best practices correctly: parameterized SQL queries, `spawn()` without `shell: true`, helmet headers, rate limiting, input sanitization middleware, and bcrypt for passwords.

The most actionable findings are concentrated in **Ansible argument injection**, **JWT token storage in localStorage**, **CORS permissiveness in production**, and **command whitelist bypass via whitespace**.

| Severity  | Count |
|-----------|-------|
| Critical  | 0     |
| High      | 1     |
| Medium    | 9     |
| Low       | 8     |
| **Total** | **18** |

---

## Findings

### HIGH

---

#### H-01 — Ansible Module Argument Injection

**File:** `backend/src/integrations/ansible/AnsibleService.ts`
**Method:** `toModuleArgString()`

The method escapes backslashes and double quotes, but does not handle newlines (`\n`), null bytes, or Ansible-specific special syntax in parameter values. A crafted value could inject additional `-m` or `-a` flags when the resulting string is passed to Ansible.

```typescript
private toModuleArgString(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => {
      const strValue = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return strValue.includes(" ") ? `${key}="${strValue}"` : `${key}=${strValue}`;
    })
    .join(" ");
}
```

**Fix:** Strip or reject newlines and control characters from values before quoting. Additionally validate keys against an allowlist of expected parameter names for each module.

---

### MEDIUM

---

#### M-01 — JWT Token Stored in `localStorage`

**File:** `frontend/src/lib/auth.svelte.ts`

Access token, refresh token, and user object are all written to `localStorage`. Any XSS (even minor, e.g. via a dependency) can exfiltrate these without any further interaction.

```typescript
localStorage.setItem(TOKEN_KEY, data.token);
localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
localStorage.setItem(USER_KEY, JSON.stringify(data.user));
```

**Fix:** Prefer `httpOnly` secure cookies for tokens. If cookies are not viable, store only a short-lived access token in memory (`$state`) and use a `httpOnly` cookie exclusively for the refresh token.

---

#### M-02 — CORS Defaults Include `localhost` in Production

**File:** `backend/src/config/schema.ts`

```typescript
corsAllowedOrigins: z.array(z.string()).default([
  "http://localhost:5173",
  "http://localhost:3000",
]),
```

If `CORS_ALLOWED_ORIGINS` is not set in the production environment, the server silently accepts requests from localhost origins. This is unlikely to be exploited remotely but represents an accidental misconfiguration surface.

**Fix:** In `server.ts` startup validation, if `NODE_ENV === 'production'` and the CORS origin list still contains `localhost`, throw and abort startup.

---

#### M-03 — Ansible Node ID Not Validated

**File:** `backend/src/integrations/ansible/AnsibleService.ts`

`nodeId` is passed directly as an argument to `spawn()`. Although `shell: false` prevents shell interpretation, Ansible parses the value itself and a crafted node ID (`-e @/etc/passwd`) could inject Ansible CLI flags.

```typescript
const args = [
  nodeId,   // user-supplied, no validation
  "-i", this.inventoryPath,
  "-m", "shell",
  "-a", command,
];
```

**Fix:** Validate `nodeId` against `^[a-zA-Z0-9._-]+$` before constructing the argument list.

---

#### M-04 — SSE Auth Token Exposed via Query Parameter

**File:** `backend/src/routes/streaming.ts`

The SSE endpoint accepts `?token=<jwt>` as a fallback because the `EventSource` API cannot set headers. Query parameters are captured in access logs, proxy logs, and browser history.

```typescript
if (typeof req.query.token === "string" && !req.headers.authorization) {
  req.headers.authorization = `Bearer ${req.query.token}`;
  delete (req.query as Record<string, unknown>).token;
}
```

**Fix:** Ensure the access logger redacts the `token` query parameter. Consider migrating SSE streams to WebSocket (which supports custom headers) for long-term improvement.

---

#### M-05 — Rate Limit Window Allows Burst Before Account Lockout

**File:** `backend/src/middleware/securityMiddleware.ts`

The IP-level auth rate limiter allows 10 attempts per 15 minutes. The account lockout fires after 5 failed attempts within 15 minutes. Between the two systems there is a window where an IP can fail 10 times (across multiple accounts) before the IP is rate-limited, while each individual account locks at 5.

**Fix:** Reduce the IP rate limit window to 5 attempts per 15 minutes to match the per-account lockout threshold. Consider adding exponential back-off.

---

#### M-06 — Loose Content Security Policy (`unsafe-inline` for Styles)

**File:** `backend/src/middleware/securityMiddleware.ts`

```typescript
styleSrc: ["'self'", "'unsafe-inline'"],
```

`unsafe-inline` for styles allows CSS injection attacks and weakens XSS mitigation. While style-only injection is lower severity than script injection, it enables clickjacking via CSS overlay and data exfiltration via CSS selectors.

**Fix:** Replace with CSP nonces or `style-src-attr` + `style-src-elem` with hashes. Svelte's scoped styles do not require `unsafe-inline` in production builds.

---

#### M-07 — Path Traversal Risk in Temporary Inventory Files

**File:** `backend/src/integrations/ansible/AnsibleService.ts`

Temporary inventory files are constructed with filenames derived from user-supplied `nodeId` values. A crafted `nodeId` containing `../` sequences could cause writes outside the intended temp directory.

**Fix:** Always derive temp file paths exclusively from `os.tmpdir()` + `crypto.randomUUID()`, never from user input.

---

#### M-08 — SSH Credentials Held in Plain-Text Process Memory

**File:** `backend/src/integrations/ssh/SSHService.ts`

SSH passwords and sudo passwords are stored as plain strings in memory throughout the connection lifecycle and are accessible via heap dumps or memory inspection.

```typescript
if (host.password) {
  connectConfig.password = host.password;
}
```

**Fix:** Retrieve credentials from an external secret store (e.g. HashiCorp Vault) at connection time and avoid retaining them in long-lived objects. At minimum, overwrite the string reference after use.

---

#### M-09 — No CSRF Mitigation for Non-JWT Paths

**File:** `backend/src/middleware/securityMiddleware.ts`

The application uses JWT in the `Authorization` header, which is immune to standard CSRF. However, the SSE token-in-query-parameter mechanism (see M-04) means that if tokens end up in cookies or a future auth path changes, CSRF protection will be absent.

**Fix:** Add `SameSite=Strict` or `SameSite=Lax` to all cookies now. Validate `Origin` header on all state-changing requests as a defence-in-depth measure.

---

### LOW

---

#### L-01 — Command Whitelist Bypass via Internal Whitespace

**File:** `backend/src/services/CommandWhitelistService.ts` (or `backend/src/validation/CommandWhitelistService.ts`)

The whitelist check normalizes leading/trailing whitespace with `.trim()` but not internal whitespace. A command like `ps  -adef` (double space) would not match a whitelist entry `ps -adef` under prefix-match mode.

```typescript
const trimmedCommand = command.trim();
return this.config.whitelist.some((allowed) =>
  trimmedCommand === allowed || trimmedCommand.startsWith(allowed + " "),
);
```

**Fix:** Normalize internal whitespace: `command.trim().replace(/\s+/g, ' ')`.

---

#### L-02 — Plain-Text Username in Auth Failure Logs

**File:** `backend/src/services/AuthenticationService.ts`

```typescript
console.warn(`[AUTH FAILURE] ${timestamp} - Username: ${username} - Reason: ${reason}`);
```

Logging plaintext usernames in failure messages leaks valid account names if logs are exposed.

**Fix:** Log a truncated or hashed username (`SHA-256(username).slice(0,8)`) instead of the raw value.

---

#### L-03 — `console.error()` Used Instead of `LoggerService`

**File:** `backend/src/services/AuthenticationService.ts` (multiple catch blocks)

Direct `console.error()` calls bypass `LoggerService`, losing structured metadata and making log aggregation inconsistent.

**Fix:** Replace all `console.*` calls with `this.logger.*` equivalents.

---

#### L-04 — No Refresh Token Rotation

**File:** `frontend/src/lib/auth.svelte.ts`

Refresh tokens are long-lived and not rotated on each use. A stolen refresh token can be used repeatedly without detection.

**Fix:** Issue a new refresh token on each access token refresh and invalidate the old one (refresh token rotation). Detect reuse of invalidated refresh tokens as a compromise signal.

---

#### L-05 — Ephemeral JWT Secret in Development Not Flagged Loudly

**File:** `backend/src/services/AuthenticationService.ts`

When `JWT_SECRET` is absent in non-production, an ephemeral secret is generated silently (beyond a log warning). Sessions are invalidated on every restart with no user-visible error.

**Fix:** Print a prominent startup banner (not just a log line) and refuse to start if `JWT_SECRET` is absent even in development, or document the ephemeral behaviour explicitly in `README`.

---

#### L-06 — SSH Private Key Path Exposed in Logs

**File:** `backend/src/integrations/ssh/SSHService.ts` and config

The full filesystem path to the SSH private key is logged during configuration initialisation. If logs are forwarded to an external system, this reveals key locations to potential attackers.

**Fix:** Log only the filename, not the full path. Obfuscate or omit key paths from structured log metadata.

---

#### L-07 — No HSTS Header Verified in Production

**File:** `backend/src/middleware/securityMiddleware.ts`

Helmet is configured, but there is no startup assertion that `Strict-Transport-Security` is active. In HTTP-only deployments, HSTS has no effect, but the absence of an explicit check means a misconfigured TLS termination proxy could silently serve HTTP.

**Fix:** Add a startup warning or assertion if `NODE_ENV === 'production'` and `HTTPS` is not confirmed (e.g. via `X-Forwarded-Proto` detection).

---

#### L-08 — Token Revocation Records Never Pruned

**File:** `backend/src/services/AuthenticationService.ts` / `backend/src/database/`

Revoked tokens are stored with an `expiresAt` timestamp but there is no scheduled cleanup job to remove expired revocation records. Over time this table will grow unboundedly.

**Fix:** Add a periodic cleanup query (`DELETE FROM revoked_tokens WHERE expires_at < NOW()`) as a scheduled job or a lazy cleanup triggered on each revocation check.

---

## What Is Done Well

| Area | Status |
|------|--------|
| SQL queries — all parameterized | ✓ |
| Child process spawning — `shell: false` throughout | ✓ |
| Passwords — bcrypt with default cost factor | ✓ |
| Account lockout — implemented with progressive delay | ✓ |
| Helmet security headers — enabled | ✓ |
| Input sanitization middleware — query, body, params | ✓ |
| Rate limiting — global + auth-specific | ✓ |
| Token revocation — database-backed | ✓ |
| Foreign key enforcement in SQLite | ✓ |
| No `innerHTML` / `{@html}` detected in frontend | ✓ |
| Command execution timeout with SIGTERM→SIGKILL | ✓ |

---

## Priority Remediation Order

| Priority | ID | Finding |
|----------|----|---------|
| 1 | H-01 | Ansible module argument injection |
| 2 | M-01 | JWT in localStorage |
| 3 | M-03 | Ansible node ID not validated |
| 4 | M-02 | CORS localhost default in production |
| 5 | L-01 | Command whitelist whitespace bypass |
| 6 | M-04 | SSE token in query string logged |
| 7 | M-06 | CSP `unsafe-inline` for styles |
| 8 | M-05 | Auth rate limit vs lockout gap |
| 9 | M-07 | Path traversal in temp inventory |
| 10 | M-08 | SSH credentials in plain-text memory |

---

## Recommendations

- Run `npm audit` in CI on every PR and block merges on high/critical advisories.
- Add SAST tooling (e.g. Semgrep with the `nodejs` and `typescript` rulesets) to the CI pipeline.
- Introduce a secrets scanning step (e.g. `truffleHog` or `gitleaks`) to prevent accidental credential commits.
- Schedule a follow-up review after Azure support (`.kiro/specs/azure-support/`) is implemented, as cloud credential handling introduces new attack surface.
