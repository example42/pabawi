# Pabawi Security Assessment Report

**Date:** 2026-02-27  
**Version Assessed:** 0.8.0  
**Assessor:** AI-assisted code review  
**Scope:** Full-stack — backend (Express/TypeScript), frontend (Svelte 5 SPA), authentication/RBAC, command execution, database, and dependencies

---

## Executive Summary

Pabawi has a **solid security foundation**: parameterized SQL queries (no injection vectors found), `shell: false` on all subprocess spawning, Zod input validation on all routes, Helmet with strict CSP, RBAC on execution routes, and rate limiting. However, **4 critical/high-severity issues** and **11 medium-severity issues** were identified, primarily around unauthenticated configuration exposure, path traversal in playbook execution, remote command injection when the whitelist is disabled, and JWT secret management.

### Risk Summary

| Severity | Count |
|----------|-------|
| Critical / High | 4 |
| Medium | 11 |
| Low | 6 |
| Dependency Vulnerabilities | 14 (2 low, 4 moderate, 8 high) |

---

## Critical / High Findings

### F-01: Unauthenticated `/api/config` Exposes Security-Critical Configuration

**Severity:** CRITICAL  
**Location:** [`backend/src/server.ts` L824–L835](backend/src/server.ts#L824-L835)  
**Category:** Information Disclosure

The inline `GET /api/config` handler is mounted **before** `authMiddleware` with zero authentication:

```typescript
// Configuration endpoint (excluding sensitive values)
// Protected by authentication — moved behind authMiddleware below   ← COMMENT IS WRONG
app.get("/api/config", (_req: Request, res: Response) => {
  res.json({
    commandWhitelist: {
      allowAll: config.commandWhitelist.allowAll,
      matchMode: config.commandWhitelist.matchMode,
      whitelist: config.commandWhitelist.whitelist,
    },
    executionTimeout: config.executionTimeout,
  });
});
```

Additionally, the config router mounted at the same path is also unauthenticated:

```typescript
app.use("/api/config", configRouter);
```

**Impact:** An attacker learns exactly which commands are whitelisted, whether `allowAll` is `true` (which would enable arbitrary remote code execution), the match mode, and the execution timeout. This is actionable intelligence for crafting targeted attacks.

**Recommendation:**

- Move the `/api/config` handler behind `authMiddleware`, or create a separate unauthenticated endpoint that omits security-sensitive fields (whitelist, `allowAll`).
- Fix the misleading comment.

---

### F-02: Path Traversal in `playbookPath`

**Severity:** HIGH  
**Location:** [`backend/src/routes/playbooks.ts` L12](backend/src/routes/playbooks.ts#L12), [`backend/src/integrations/ansible/AnsibleService.ts` L171–L177](backend/src/integrations/ansible/AnsibleService.ts#L171-L177)  
**Category:** Path Traversal / Arbitrary File Execution

The `playbookPath` field is validated only as a non-empty string:

```typescript
const PlaybookExecutionBodySchema = z.object({
  playbookPath: z.string().min(1, "Playbook path is required"),
  // ...
});
```

This value flows directly to `ansible-playbook`:

```typescript
const args = [
  "-i", this.inventoryPath,
  playbookPath,     // ← user-supplied, no path validation
  "--limit", nodeId,
];
```

**Impact:** An authenticated user with `ansible:execute` permission can execute arbitrary playbooks from anywhere on the filesystem (e.g., `../../../../tmp/malicious.yml` or `/etc/ansible/evil.yml`).

**Recommendation:**

- Validate that `playbookPath` is a relative path (no `..` sequences, no absolute paths).
- Resolve against a configured base directory and verify the canonical path stays within that directory.
- Add a regex constraint: e.g., `/^[a-zA-Z0-9][a-zA-Z0-9_\-/]*\.ya?ml$/`.

---

### F-03: Remote Command Injection When `allowAll=true`

**Severity:** HIGH  
**Location:** [`backend/src/integrations/bolt/BoltService.ts` L740–L748](backend/src/integrations/bolt/BoltService.ts#L740-L748), [`backend/src/integrations/ansible/AnsibleService.ts` L56–L63](backend/src/integrations/ansible/AnsibleService.ts#L56-L63)  
**Category:** Command Injection (Remote)

User-supplied `command` strings flow directly to Bolt and Ansible:

```typescript
// BoltService
const args = ["command", "run", command, "--targets", nodeId, "--format", "json"];

// AnsibleService
const args = [nodeId, "-i", this.inventoryPath, "-m", "shell", "-a", command];
```

While `shell: false` prevents **local** shell interpretation, both Bolt and Ansible execute these commands in a **remote shell** on target nodes. The `CommandWhitelistService` mitigates this, but setting `COMMAND_WHITELIST_ALLOW_ALL=true` removes **all protection**, including the shell metacharacter blocklist.

**Impact:** Full remote code execution on all managed infrastructure nodes.

**Recommendation:**

- Always block shell metacharacters (`; | & $ \` ( ) { } \n \r > <`) regardless of the`allowAll` setting.
- Provide a separate `blockMetacharacters` configuration option, or at minimum document the extreme risk of `allowAll=true`.
- Consider additional per-user command restrictions via RBAC.

---

### F-04: JWT Secret Falls Back to Ephemeral Random Value Silently

**Severity:** HIGH  
**Location:** [`backend/src/services/AuthenticationService.ts` L84–L89](backend/src/services/AuthenticationService.ts#L84-L89)  
**Category:** Authentication / Cryptographic Weakness

```typescript
this.jwtSecret = jwtSecret || process.env.JWT_SECRET || this.generateDefaultSecret();
if (!jwtSecret && !process.env.JWT_SECRET) {
  console.warn('WARNING: No JWT_SECRET provided. Using generated secret. This is insecure for production!');
}
```

**Impact:**

- A process restart silently invalidates all existing sessions.
- Multi-instance deployments generate different secrets, causing cross-instance auth failures.
- The warning goes only to `console.warn` — not `LoggerService`, not a startup abort.

**Recommendation:**

- Fail hard at startup if `JWT_SECRET` is not set when `NODE_ENV !== 'development'`.
- Add `JWT_SECRET` to the Zod config schema with entropy/length validation.
- Use `LoggerService` for the warning, not `console.warn`.

---

## Medium Findings

### F-05: Expert Mode Header Is Unauthenticated — Leaks Stack Traces

**Severity:** MEDIUM  
**Location:** [`backend/src/middleware/errorHandler.ts` L37](backend/src/middleware/errorHandler.ts#L37)  
**Category:** Information Disclosure

```typescript
const expertMode = req.headers["x-expert-mode"] === "true";
```

Any HTTP client — without authentication — can set `X-Expert-Mode: true` and receive detailed error responses including stack traces, Bolt commands with arguments, and execution context details. The error sanitization at L63–66 scrubs some patterns but internal architecture details still leak.

**Recommendation:** Tie expert mode to an authenticated session and a specific RBAC permission (e.g., `system:debug`), not an unauthenticated request header.

---

### F-06: `expertMode` in Request Body Is User-Controlled

**Severity:** MEDIUM  
**Location:** [`backend/src/routes/puppet.ts` L19](backend/src/routes/puppet.ts#L19), [`backend/src/routes/packages.ts`](backend/src/routes/packages.ts), [`backend/src/routes/playbooks.ts`](backend/src/routes/playbooks.ts)  
**Category:** Information Disclosure

Any authenticated user can set `expertMode: true` in the request body to capture full stdout/stderr (potentially containing passwords, secrets, or PII) into the execution record, which is persisted to the database.

**Recommendation:** Gate on an RBAC permission (e.g., `system:debug`) rather than trusting the request body.

---

### F-07: Same JWT Secret for Access and Refresh Tokens

**Severity:** MEDIUM  
**Location:** [`backend/src/services/AuthenticationService.ts` L236–L255](backend/src/services/AuthenticationService.ts#L236-L255)  
**Category:** Authentication / Token Security

Both access tokens (1h lifetime) and refresh tokens (7d lifetime) are signed with the identical `this.jwtSecret`. No `issuer` or `audience` claims are set.

**Impact:** A compromised access token key also compromises all refresh tokens. Tokens are not bound to any specific service, enabling cross-service forgery if the secret is shared.

**Recommendation:**

- Use separate signing keys for access and refresh tokens.
- Set `issuer` and `audience` claims to bind tokens to the Pabawi instance.

---

### F-08: Incomplete Shell Metacharacter Blocklist

**Severity:** MEDIUM  
**Location:** [`backend/src/validation/CommandWhitelistService.ts` L33](backend/src/validation/CommandWhitelistService.ts#L33)  
**Category:** Input Validation

The pattern `/[;|&`$(){}\n\r><]/` does not block:

- **Backslash** (`\`) — line continuation / character escaping in shells
- **Tab** (`\t`) — whitespace substitute
- **Glob wildcards** (`*`, `?`, `[`, `]`) — e.g., `rm -rf *` would pass if `rm` is whitelisted in prefix mode

While `shell: false` prevents local interpretation, these characters **are** interpreted by the remote shell on target nodes.

**Recommendation:** Expand the pattern to include `\`, `\t`, `*`, `?`, `[`, `]`, and `~`.

---

### F-09: `taskName` Has No Validation Schema

**Severity:** MEDIUM  
**Location:** [`backend/src/integrations/bolt/BoltService.ts` L955](backend/src/integrations/bolt/BoltService.ts#L955)  
**Category:** Input Validation

Task names pass directly to `bolt task run <taskName>` without any regex validation at the route or service layer. A crafted name could exploit Bolt's module resolution.

**Recommendation:** Add a validation schema in `commonSchemas.ts`:

```typescript
const TASK_NAME_PATTERN = /^[a-z][a-z0-9_]*(::[a-z][a-z0-9_]*)*$/;
```

---

### F-10: `extraVars` Accepts Arbitrary Unvalidated Data

**Severity:** MEDIUM  
**Location:** [`backend/src/routes/playbooks.ts` L14](backend/src/routes/playbooks.ts#L14)  
**Category:** Input Validation / Server-Side Template Injection

```typescript
extraVars: z.record(z.unknown()).optional(),
```

These values propagate as `--extra-vars` to Ansible and can override **any** playbook variable (target hosts, privilege escalation settings, etc.). If playbook templates use `{{ variable }}` in `shell` or `command` modules without quoting, this enables Jinja2 template injection.

**Recommendation:** Restrict `extraVars` keys to an allowlist, validate value types as strings/numbers only, and limit the maximum size/depth.

---

### F-11: Incomplete Escaping in `toModuleArgString`

**Severity:** MEDIUM  
**Location:** [`backend/src/integrations/ansible/AnsibleService.ts` L351–L357](backend/src/integrations/ansible/AnsibleService.ts#L351-L357)  
**Category:** Command Injection (Remote)

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

Only `\` and `"` are escaped. Shell metacharacters like `$()`, backticks, `!`, and `;` survive and reach the remote shell when Ansible runs the module.

**Recommendation:** Add escaping for `$`, `` ` ``, `!`, `;`, `|`, `&`, `(`, `)`, `{`, `}`, `>`, `<`, and newlines.

---

### F-12: Database File Permissions Not Explicitly Set

**Severity:** MEDIUM  
**Location:** [`backend/src/database/DatabaseService.ts` L27](backend/src/database/DatabaseService.ts#L27)  
**Category:** Data Protection

```typescript
mkdirSync(dbDir, { recursive: true });
```

No `mode` parameter. With a permissive umask, the SQLite file containing password hashes, execution history, and audit logs may be world-readable.

**Recommendation:** Set `mode: 0o700` on `mkdirSync` and `chmod` the database file to `0o600` after creation.

---

### F-13: JWT Tokens Stored in `localStorage`

**Severity:** MEDIUM  
**Location:** [`frontend/src/lib/auth.svelte.ts` L281–L283](frontend/src/lib/auth.svelte.ts#L281-L283)  
**Category:** Token Security / XSS Risk

```typescript
localStorage.setItem(TOKEN_KEY, data.token);
localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
```

`localStorage` is accessible to any JavaScript running on the same origin. If an XSS vulnerability is ever introduced, both access and refresh tokens can be exfiltrated.

**Mitigating factor:** Current XSS protections appear solid (HTML escaping before `{@html}`, no `innerHTML` in production code).

**Recommendation:** Consider migrating to `httpOnly` cookies with `SameSite=Strict` and `Secure` flags.

---

### F-14: CORS Origins Accept Arbitrary Strings

**Severity:** MEDIUM  
**Location:** [`backend/src/config/schema.ts` L287](backend/src/config/schema.ts#L287)  
**Category:** Configuration Validation

```typescript
corsAllowedOrigins: z.array(z.string()).default(["http://localhost:5173", "http://localhost:3000"]),
```

No URL format validation. Setting `["*"]` would silently open the API to cross-origin attacks from any website.

**Recommendation:** Validate each origin matches a URL pattern (`z.string().url()` or a custom regex).

---

### F-15: `users:write` Permission Enables Privilege Escalation

**Severity:** MEDIUM  
**Location:** [`backend/src/routes/users.ts` L395](backend/src/routes/users.ts#L395)  
**Category:** Privilege Escalation

A user with `users:write` permission can call `PUT /api/users/:id` and update the `isAdmin` field on **any** user, including themselves.

**Recommendation:** Require `users:admin` permission for changes to `isAdmin`, `roles`, or `groups` fields. Separate "profile update" from "admin user management."

---

## Low Findings

### F-16: Setup Endpoint Race Condition

**Severity:** LOW  
**Location:** [`backend/src/routes/setup.ts`](backend/src/routes/setup.ts)

The `isSetupComplete()` check and admin user creation in `/api/setup/initialize` are not atomic. Concurrent requests during initial setup could create duplicate admin users. Mitigated by database unique constraints on username/email.

---

### F-17: `process.env` Inherited by Child Processes

**Severity:** LOW  
**Location:** [`backend/src/integrations/bolt/BoltService.ts` L139](backend/src/integrations/bolt/BoltService.ts#L139)

The entire environment (including `JWT_SECRET`, database credentials, integration tokens) is passed to spawned Bolt/Ansible processes and potentially accessible to remote targets if the tool passes them through.

**Recommendation:** Filter `process.env` to only include Bolt/Ansible-specific variables.

---

### F-18: Audit Logs Lack Integrity Protection

**Severity:** LOW  
**Location:** [`backend/src/services/AuditLoggingService.ts`](backend/src/services/AuditLoggingService.ts)

Audit logs are stored in the same SQLite database as application data. An admin with database access or a SQL injection (if one were found) could modify or delete audit entries. No cryptographic integrity protection (checksums, HMAC, append-only mode) exists.

---

### F-19: Account Lockout Message Confirms Username Existence

**Severity:** LOW  
**Location:** [`backend/src/services/AuthenticationService.ts` L125](backend/src/services/AuthenticationService.ts#L125)

The lockout response message differs from the "Invalid credentials" message, revealing that the username exists and is specifically locked. Minor username enumeration vector.

---

### F-20: bcrypt Cost Factor = 10

**Severity:** LOW  
**Location:** [`backend/src/services/AuthenticationService.ts` L81](backend/src/services/AuthenticationService.ts#L81)

OWASP minimum is 10 (current value). For an infrastructure management tool with elevated privilege implications, 12 is recommended.

---

### F-21: ExpertModeCopyButton Exports JWT Tokens in Debug Dump

**Severity:** LOW  
**Location:** [`frontend/src/components/ExpertModeCopyButton.svelte`](frontend/src/components/ExpertModeCopyButton.svelte)

The debug export collects **all** `localStorage` and `sessionStorage` contents, including `authToken` and `refreshToken`. If debug output is shared (e.g., pasted into a support ticket), tokens are exposed.

**Recommendation:** Redact `authToken` and `refreshToken` keys from the debug export.

---

## Dependency Vulnerabilities

**`npm audit` — 14 vulnerabilities (2 low, 4 moderate, 8 high)**

| Package | Severity | Vulnerability | Advisory |
|---------|----------|---------------|----------|
| `tar` ≤7.5.7 | **HIGH** | Hardlink path traversal (GHSA-34x7-hfp2-rc4v) | [Link](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) |
| `tar` ≤7.5.7 | **HIGH** | Race condition on macOS APFS (GHSA-r6q2-hw4h-h46w) | [Link](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) |
| `tar` ≤7.5.7 | **HIGH** | Symlink poisoning (GHSA-8qq5-rm4j-mr97) | [Link](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) |
| `tar` ≤7.5.7 | **HIGH** | Arbitrary file read/write via symlink chain (GHSA-83g3-92jg-28cx) | [Link](https://github.com/advisories/GHSA-83g3-92jg-28cx) |
| `rollup` 4.0.0–4.58.0 | **HIGH** | Arbitrary file write via path traversal (GHSA-mw96-cpmx-2vgc) | [Link](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) |
| `minimatch` ≤3.1.3 | **HIGH** | Multiple ReDoS (GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74) | |
| `qs` 6.7.0–6.14.1 | Moderate | arrayLimit bypass DoS (GHSA-w7fw-mjwx-w883) | |
| `svelte` ≤5.53.4 | Moderate | Multiple SSR XSS (5 advisories) — low risk for SPA | |
| `ajv` <6.14.0 | Moderate | ReDoS with `$data` option (GHSA-2g4f-4pwh-qvx6) | |
| `devalue` ≤5.6.2 | Low | Sparse array amplification, prototype pollution | |

**Note:** Root `package.json` pins `tar` to `7.5.6` via `overrides`, which is **within the vulnerable range** (≤7.5.7).

**Remediation:**

```bash
# Fix auto-fixable vulnerabilities
npm audit fix

# Update tar override in package.json
# Change "tar": "7.5.6" → "tar": ">=7.6.0"

# For sqlite3 dependency chain (tar via node-gyp), evaluate:
npm audit fix --force  # Note: may downgrade sqlite3 to 5.0.2
```

---

## Positive Security Findings

The following security controls are properly implemented and commendable:

| Control | Status |
|---------|--------|
| **SQL Injection Protection** | All queries use parameterized `?` placeholders — no injection vectors found |
| **Local Command Injection Protection** | `shell: false` on all `spawn()` calls |
| **Input Validation** | Zod schemas applied on all route handlers |
| **Input Sanitization** | Middleware blocks prototype pollution, null bytes, deep nesting (>10 levels) |
| **Security Headers** | Helmet with strict CSP (`default-src: 'self'`, `frame-src: 'none'`, `object-src: 'none'`) |
| **Rate Limiting** | 100 req/min general, 10 req/15min auth endpoints |
| **RBAC** | Per-resource per-action permissions on all execution routes |
| **Password Security** | bcrypt hashing, strong password policy (8+ chars, mixed case, number, special) |
| **Token Revocation** | SHA-256 hashed token revocation list with user-wide revocation |
| **XSS Protection** | `ansiToHtml()` HTML-escapes before adding span tags; `{@html}` only with prior `escapeHtml()` |
| **No `innerHTML`** | No production code uses `innerHTML` |
| **Router Safety** | External link navigation blocked — no open redirect |
| **User Enumeration** | Generic "Invalid credentials" for both invalid username and wrong password |
| **Account Lockout** | Temporary (5 attempts/15min) and permanent (10 total) thresholds |
| **Audit Logging** | Auth events, RBAC failures logged with IP and user-agent |
| **JSON Body Limit** | 100KB max prevents large payload DoS |
| **Graceful Shutdown** | SIGTERM handler cleans up streams and database |

---

## Prioritized Remediation Plan

### P0 — Fix Immediately

| # | Finding | Effort |
|---|---------|--------|
| F-01 | Move `/api/config` behind `authMiddleware`; fix misleading comment | Small |
| F-02 | Add path traversal protection to `playbookPath` | Small |
| F-03 | Block metacharacters even when `allowAll=true` | Small |
| F-04 | Abort startup if `JWT_SECRET` is unset in production | Small |

### P1 — Fix in Next Sprint

| # | Finding | Effort |
|---|---------|--------|
| F-05 | Gate expert mode on RBAC permission | Medium |
| F-06 | Gate `expertMode` in request bodies on RBAC | Small |
| F-09 | Add `taskName` validation schema | Small |
| F-07 | Separate access/refresh token signing keys; add `iss`/`aud` claims | Medium |
| DEP | Run `npm audit fix`; update `tar` override to `>=7.6.0` | Small |

### P2 — Plan for Next Release

| # | Finding | Effort |
|---|---------|--------|
| F-15 | Restrict `users:write` from setting `isAdmin` | Small |
| F-12 | Set explicit DB file permissions | Small |
| F-08 | Expand shell metacharacter blocklist | Small |
| F-11 | Fix `toModuleArgString` escaping | Small |
| F-10 | Restrict `extraVars` keys/values | Medium |
| F-14 | Add URL validation to CORS configuration | Small |

### P3 — Backlog

| # | Finding | Effort |
|---|---------|--------|
| F-13 | Consider httpOnly cookies for token storage | Large |
| F-20 | Increase bcrypt cost factor to 12 | Small |
| F-17 | Filter `process.env` before passing to child processes | Medium |
| F-21 | Redact tokens from debug export | Small |
| F-18 | Add audit log integrity protection | Large |
| F-19 | Unify lockout error message with generic "Invalid credentials" | Small |

---

## Methodology

This assessment was performed through static code analysis of the full source tree:

- **Backend:** All routes (22 files), all middleware (6 files), all services (16 files), database layer, integrations (Bolt, Ansible, PuppetDB, Puppetserver, Hiera, SSH), validation schemas, and configuration
- **Frontend:** API client, authentication store, ANSI-to-HTML conversion, `{@html}` usage, `localStorage`/`sessionStorage` usage, router, SSE streaming
- **Dependencies:** `npm audit` analysis of all direct and transitive dependencies
- **Configuration:** Zod config schema, environment variable handling, CORS settings

Tools used: Manual code review, `npm audit`, grep pattern analysis across all `.ts` and `.svelte` files.

---

*End of report*
