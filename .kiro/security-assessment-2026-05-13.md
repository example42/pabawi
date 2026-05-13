# Security Assessment — Pabawi Infrastructure Management UI

**Date**: 2026-05-13  
**Scope**: Backend source code (`backend/src/`) + dependency audit  
**Method**: Static analysis, control-flow tracing, `npm audit`  
**Assessed by**: goose (automated code review)

---

## Executive Summary

Pabawi's security posture is **generally solid for a development-stage project**. JWT authentication is correctly implemented with algorithm pinning (`HS256` only), bcrypt cost factor 12 meets OWASP 2023, Bolt is spawned without shell interpolation (`shell: false`, args-as-array), input sanitization runs globally, token revocation fails secure, and brute-force protection is layered (temporary + permanent lockout). The RBAC middleware is consistently applied across execution endpoints.

The following issues require attention before production deployment, ordered by severity:

1. **Critical** — MCP HTTP endpoints (`/mcp`) are mounted without any authentication middleware.
2. **Medium** — Bolt task names and parameters bypass `CommandWhitelistService`.
3. **Medium** — Legacy `?token=<JWT>` query-param fallback in SSE routes exposes tokens in access logs.
4. **Medium** — `CORS_ALLOWED_ORIGINS` unset → `Access-Control-Allow-Origin: *` (defense-in-depth gap).

---

## Findings Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| SA-00 | **Critical** | MCP | MCP HTTP endpoints mounted without authentication |
| SA-01 | **Medium** | CORS | Missing `CORS_ALLOWED_ORIGINS` allows all origins by default |
| SA-02 | **Medium** | Command Execution | Bolt task execution bypasses `CommandWhitelistService` |
| SA-03 | **Medium** | Auth / SSE | JWT exposed in server access logs via `?token=` legacy fallback |
| SA-04 | **Medium** | Dependencies | `fast-uri` path traversal + host confusion (runtime, via MCP SDK) |
| SA-05 | **Low** | Account Security | Cumulative lockout counter usable as account-level DoS |
| SA-06 | **Low** | Config | `trust proxy` not set — rate limiting and audit IPs break under reverse proxy |
| SA-07 | **Low** | Dependencies | `express-rate-limit` → `ip-address` XSS (HTML-emitting methods) |
| SA-08 | **Low** | Auth | Refresh token not rotated on use |
| SA-09 | **Low** | Build deps | `tar` multiple CVEs (build/install-time only, not runtime) |
| SA-10 | **Info** | Config | Command whitelist exposed to any authenticated user |
| SA-11 | **Info** | Auth | `PABAWI_LIFECYCLE_TOKEN` unset disables inventory webhook; when set, is a static shared bearer token |
| SA-12 | **Info** | Logging | Command arguments logged at INFO level — secrets in args land in logs |

---

## Findings Detail

### SA-00 — Critical: MCP HTTP endpoints mounted without authentication

**Location**: `backend/src/server.ts:793-844`

**Description**:  
The MCP session endpoints (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) are registered directly on the Express app without `authMiddleware` or any other authentication gate:

```ts
// server.ts — no authMiddleware before any of these
app.post("/mcp", asyncHandler(async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    // New session created with zero authentication checks
    transport = new StreamableHTTPServerTransport({ ... });
    const sessionServer = createMcpServer(mcpDeps);
    await sessionServer.connect(transport);
  }
  await transport!.handleRequest(req, res, req.body);
}));

app.get("/mcp", asyncHandler(async (req: Request, res: Response) => { ... }));
app.delete("/mcp", (req: Request, res: Response) => { ... });
```

Any client that can reach the port — including unauthenticated, anonymous network clients — can:

1. `POST /mcp` without `mcp-session-id` to create a new MCP session.
2. Use that session to invoke any of the 8 read-only tools (`inventory_list`, `facts_get`, `reports_query`, `catalogs_get`, `hiera_lookup`, `executions_list`, `integrations_list`, `journal_query`) under the provisioned `mcp-service` user's permissions.

The per-tool `checkPermission()` call in `McpToolHandlers.ts` checks the **service user's** RBAC permissions, not the caller's. It provides no gate against unauthenticated callers — it only controls which tools the MCP service user itself is permitted to use.

**Impact**:  
Full unauthenticated read access to infrastructure inventory, Puppet facts, PuppetDB reports, catalogs, Hiera data, execution history, integration configuration, and audit journal — for anyone with network access to the backend port. In a typical deployment where the backend is reachable on a LAN or behind a thin reverse proxy, this is equivalent to no authentication on those resources.

**Recommendation**:  
Add `authMiddleware` (or a dedicated MCP bearer token check) to all three `/mcp` routes before the handler:

```ts
// Option A — reuse existing JWT auth
app.post("/mcp", authMiddleware, asyncHandler(async (req, res) => { ... }));
app.get("/mcp",  authMiddleware, asyncHandler(async (req, res) => { ... }));
app.delete("/mcp", authMiddleware, (req, res) => { ... });
```

```ts
// Option B — dedicated MCP token (simpler for machine-to-machine clients)
const mcpTokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers["x-mcp-token"];
  if (token !== config.mcpToken) return res.status(401).json({ error: "Unauthorized" });
  next();
};
```

Option A is recommended — it keeps a single auth path and allows per-user RBAC on MCP sessions in the future.

---

### SA-01 — Medium: CORS allows all origins when `CORS_ALLOWED_ORIGINS` is unset

**Location**: `backend/src/server.ts:444-448`, `backend/src/config/ConfigService.ts:643-646`

**Description**:  
When `CORS_ALLOWED_ORIGINS` is not set in the environment, `corsAllowedOrigins` resolves to `undefined`. The `cors` npm package interprets `origin: undefined` as falsy, entering the `!options.origin` branch which sets `Access-Control-Allow-Origin: *`.

```ts
// ConfigService.ts
corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : undefined,  // → Access-Control-Allow-Origin: *

// server.ts
app.use(cors({ origin: config.corsAllowedOrigins, credentials: true }));
```

**Actual impact** (downgraded from High on initial draft):  
Per browser spec, `Access-Control-Allow-Origin: *` combined with `credentials: true` causes browsers to **reject** the preflight response — credentialed cross-origin requests are blocked by the browser, not the server. Additionally, Pabawi uses JWT in the `Authorization` header (not cookies), so there is no ambient credential for a cross-origin attacker to abuse.

The practical risk today is limited. The severity concern is forward-looking: if authentication is ever extended to include cookies (e.g., for SSO), or if `credentials: true` is removed (which would make `*` fully permissive), this becomes a direct exploit. It is also a violation of defense-in-depth.

**Recommendation**:  
Default to a restrictive value rather than `undefined`. Fail startup in production if not explicitly set:

```ts
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ALLOWED_ORIGINS) {
  throw new Error('CORS_ALLOWED_ORIGINS must be set in production');
}
const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : [`http://localhost:${config.port}`];
```

---

### SA-02 — Medium: Bolt task execution bypasses `CommandWhitelistService`

**Location**: `backend/src/routes/tasks.ts:487-593`, `backend/src/routes/commands.ts:147-184`

**Description**:  
Command execution via `POST /api/nodes/:id/command` validates the command string through `CommandWhitelistService.validateCommand()` before dispatching. Task execution via `POST /api/nodes/:id/task` passes `taskName` and `parameters` directly to `integrationManager.executeAction()` without any whitelist check.

```ts
// commands.ts — correctly gated
commandWhitelistService.validateCommand(command);  // throws if not allowed

// tasks.ts — no equivalent gate
const result = await integrationManager.executeAction("bolt", {
  type: "task",
  target: nodeId,
  action: taskName,       // user-supplied, unrestricted
  parameters,             // user-supplied, unrestricted
});
```

**Impact**:  
Any user with `bolt:execute` permission can run any Bolt task available in the project, including potentially destructive ones (e.g., `package::install`, `service::restart`, `exec::*`, or custom tasks). Task `parameters` are also completely untyped (`z.record(z.unknown())`). The whitelist provides no protection for the task surface.

This may be intentional (tasks operate in a different trust model than ad-hoc shell commands), but the asymmetry is undocumented and the effective security boundary is unclear.

**Recommendation**:  
Either extend the whitelist to cover task names (e.g., `TASK_WHITELIST` env var), or explicitly document that task execution is unrestricted and tighten `bolt:execute` role assignment to admin-equivalent. At minimum, validate `taskName` against the actual task list from `boltService.listTasks()` before dispatching.

---

### SA-03 — Medium: JWT exposed in access logs via `?token=` legacy fallback

**Location**: `backend/src/routes/streaming.ts:64-70`

**Description**:  
`streamAuthMiddleware` supports a `?token=<JWT>` query-parameter fallback for SSE connections:

```ts
} else if (typeof req.query.token === "string") {
  // Legacy fallback — JWT in URL (kept for backward compatibility)
  req.headers.authorization = `Bearer ${req.query.token}`;
  delete (req.query as Record<string, unknown>).token;
}
```

Any token passed as `?token=` appears in web server access logs (nginx, caddy, etc.), browser history, and `Referer` headers on subsequent requests. The preferred `?ticket=` mechanism (30-second single-use ticket from `POST /:id/stream-ticket`) is correctly implemented and avoids this entirely.

**Recommendation**:  
Remove the `?token=` fallback. If a transition window is necessary, emit a `warn`-level log entry on each use and set a removal milestone in the issue tracker.

---

### SA-04 — Medium: `fast-uri` path traversal and host confusion (runtime)

**Location**: `backend/package.json` → `@modelcontextprotocol/sdk` → `fast-uri <=3.1.1`

**Description**:  
`npm audit` reports two HIGH CVEs against `fast-uri`:

- **GHSA-q3j6-qgpj-74h6** (CVSS 7.5): Path traversal via percent-encoded dot segments
- **GHSA-v39h-62p7-jpjc** (CVSS 7.5): Host confusion via percent-encoded authority delimiters

`fast-uri` is a runtime production dependency pulled in by `@modelcontextprotocol/sdk`. Risk is partially mitigated by the current deployment scope (read-only tools, session-based transport), but the dependency is live in production. Risk increases as MCP exposure is broadened — and is compounded by SA-00 (unauthenticated MCP endpoints).

**Recommendation**:  
Upgrade `@modelcontextprotocol/sdk` once a version ships that depends on `fast-uri >=3.1.2`. Track: <https://github.com/advisories/GHSA-q3j6-qgpj-74h6>. Resolving SA-00 reduces the exploitable attack surface in the interim.

---

### SA-05 — Low: Permanent lockout counter usable as account-level DoS

**Location**: `backend/src/services/AuthenticationService.ts:748-751`, constants at lines 976-979

**Description**:  
The cumulative permanent lockout counter (`login_attempt_counters.cumulativeFailedAttempts`) is never decremented on successful login. After 10 total failed attempts across any time period, the account is permanently locked and requires manual admin intervention.

An attacker who knows a valid username can cause permanent lockout with 10 requests — no password knowledge required.

**Impact**:  
Targeted DoS against specific accounts. Elevated risk when usernames are predictable (e.g., `admin`, email-pattern).

**Recommendation**:  

1. Proactively alert on permanent lockout (journal entry + log alert).
2. Consider resetting the cumulative counter on successful authentication, or basing it on a rolling time window rather than cumulative-forever.

---

### SA-06 — Low: `trust proxy` not set — rate limiting and IP audit break under reverse proxy

**Location**: `backend/src/server.ts` (absent — `app.set("trust proxy", ...)` not present)

**Description**:  
Express is not configured to trust `X-Forwarded-For` headers from a reverse proxy. When deployed behind nginx, caddy, or a cloud load balancer, `req.ip` resolves to the proxy's IP address rather than the client's.

This breaks two controls:

1. **Auth rate limiting** (`securityMiddleware.ts:93-116`) — all clients appear to share the same IP. 10 failed login attempts by any user trips the per-IP rate limit for every user behind that proxy; conversely, distributed attacks from many IPs are not rate-limited unless the proxy IP itself is banned.
2. **Audit log IP attribution** — `AuditLoggingService` and `AuthenticationService` record `req.ip` for authentication events. All events will show the proxy IP, making forensics after a breach useless.

**Recommendation**:  
Configure trust proxy appropriately for the deployment topology:

```ts
// For single trusted reverse proxy:
app.set("trust proxy", 1);

// For known proxy IP:
app.set("trust proxy", "10.0.0.1");
```

Expose this as a config variable (`TRUST_PROXY`) and document expected values per deployment pattern.

---

### SA-07 — Low: `express-rate-limit` → `ip-address` XSS (HTML-emitting methods)

**Location**: `backend/package.json` (runtime) → `express-rate-limit ^8.2.1` → `ip-address <=10.1.0`

**Description**:  
GHSA-v2v4-37r5-5v8g (XSS) in `ip-address <=10.1.0`, via `Address6.toHtml()`. `express-rate-limit` uses `ip-address` only for IP normalization in key generation — it does not call HTML-emitting methods. Practical exploitability: negligible.

**Recommendation**:  
Update `express-rate-limit` once a release pins `ip-address >=10.1.1`.

---

### SA-08 — Low: Refresh token not rotated on use

**Location**: `backend/src/services/AuthenticationService.ts:389-428`

**Description**:  
`refreshToken()` issues a new access token but returns the **same** refresh token, which remains valid for the remainder of its 7-day window. A stolen refresh token gives the attacker persistent access until the original expiry.

**Recommendation**:  
Issue a new refresh token on every use and revoke the consumed one. This bounds stolen-token exposure to the next refresh cycle.

---

### SA-09 — Low: `tar` multiple CVEs (build-time only)

**Location**: `npm audit` → `sqlite3 ^5.1.7` → `node-gyp` → `tar`

**Description**:  
Multiple HIGH CVEs in `tar` (path traversal via hardlink, symlink poisoning, race conditions). Not reachable at runtime — only during `npm install` when `sqlite3` compiles from source.

**Recommendation**:  
Pre-build `sqlite3` native binaries in CI (prebuilt binary or Docker layer) to remove the `node-gyp` chain from runtime environments.

---

### SA-10 — Info: Command whitelist exposed to any authenticated user

**Location**: `backend/src/server.ts:520-529`

```ts
app.get("/api/config", authMiddleware, (_req: Request, res: Response) => {
  res.json({
    commandWhitelist: {
      allowAll: config.commandWhitelist.allowAll,
      matchMode: config.commandWhitelist.matchMode,
      whitelist: config.commandWhitelist.whitelist,  // full list
    },
    executionTimeout: config.executionTimeout,
  });
});
```

Any authenticated user can retrieve the complete command whitelist, aiding reconnaissance when crafting permitted-but-dangerous command strings.

**Recommendation**:  
Gate behind an admin-only RBAC check, or return only the fields needed for UX (e.g., `allowAll`, `matchMode`) without enumerating individual whitelist entries.

---

### SA-11 — Info: `PABAWI_LIFECYCLE_TOKEN` — silent disable and static token risk

**Location**: `backend/src/routes/inventory.ts:26-53`, `backend/src/config/schema.ts:368`

**Description**:  
Two distinct issues:

**11a — Silent disable**: `lifecycleToken` defaults to an empty string. `createLifecycleAuth()` returns HTTP 500 `LIFECYCLE_AUTH_MISCONFIGURED` when the token is empty — it does **not** grant open access, which is correct. However, the feature silently fails with no startup warning, making it easy to deploy thinking lifecycle webhooks are active when they are not.

**11b — Static shared bearer token**: When configured, `PABAWI_LIFECYCLE_TOKEN` is a static shared bearer secret. It has no HMAC signature over the request body, no nonce/replay protection, no per-source token differentiation, and no rotation mechanism. Any party that observes the token (e.g., in a log, transit, or a compromised orchestration system) can forge lifecycle events indefinitely.

**Recommendation**:  
11a: Log a `warn`-level message at startup when `PABAWI_LIFECYCLE_TOKEN` is not set.  
11b: For production, consider HMAC-SHA256 request signing (the token becomes a signing key, the signature is sent as a header alongside the body) to prevent replay and forgery. If static bearer remains the design, document it explicitly and ensure token rotation is part of operational runbooks.

---

### SA-12 — Info: Command arguments logged at INFO level

**Location**: `backend/src/routes/commands.ts` (command dispatch logging)

**Description**:  
The commands router logs structured metadata including the command string at INFO level. If a whitelist-permitted command embeds secrets as positional arguments (e.g., `my-tool --password s3kr3t`), those secrets appear in the application log in plaintext.

This is a best-effort observation — actual exposure depends on what commands are whitelisted and how operators call them.

**Recommendation**:  
Document that commands logged by Pabawi will include all arguments. Advise operators to use commands that take secrets from environment variables or files rather than positional arguments when possible.

---

## Positive Security Controls

The following controls were verified and are correctly implemented:

| Control | Location | Status |
|---------|----------|--------|
| JWT algorithm pinned to `HS256` | `AuthenticationService.ts:362` | ✅ |
| JWT production requirement enforced | `AuthenticationService.ts:111-117` | ✅ |
| `shell: false` on Bolt spawn | `BoltService.ts:150-153` | ✅ no shell injection |
| Shell metacharacter blocklist always applied | `CommandWhitelistService.ts:33-48` | ✅ even in `allowAll` mode |
| bcrypt cost factor 12 | `AuthenticationService.ts:102` | ✅ OWASP 2023 |
| Token revocation fails secure | `AuthenticationService.ts:569-572` | ✅ returns `true` on error |
| Input sanitization middleware (global) | `securityMiddleware.ts:127-227` | ✅ null bytes, depth, proto pollution |
| Prototype pollution prevention | `securityMiddleware.ts:182-185` | ✅ `__proto__`, `constructor`, `prototype` blocked |
| Auth rate limiting (10/15min per IP) | `securityMiddleware.ts:93-116` | ✅ (see SA-06 for proxy caveat) |
| Helmet headers + CSP | `securityMiddleware.ts:20-36` | ✅ |
| RBAC on all execution endpoints | `server.ts:576-621` | ✅ |
| Debug endpoint requires `debug:admin` | `server.ts:730` | ✅ |
| SSE stream-ticket mechanism (JWT not in URL) | `streaming.ts:86-129` | ✅ |
| Setup endpoint idempotency guard | `setup.ts:136-137` | ✅ re-setup blocked |
| SQL parameterized queries (spot-checked) | `AuthenticationService.ts`, `ExecutionRepository.ts`, `UserService.ts`, `RoleService.ts` | ✅ no concatenated SQL found in spot-check |
| Generic error on auth failure (no user enumeration) | `AuthenticationService.ts:201-202` | ✅ |
| Brute force: temporary lockout (5 in 15 min) | `AuthenticationService.ts:764-767` | ✅ |
| Brute force: permanent lockout (10 cumulative) | `AuthenticationService.ts:748-751` | ✅ (see SA-05) |
| Lifecycle webhook fails closed when unconfigured | `inventory.ts:26-53` | ✅ returns 500, not open |

---

## Dependency Audit Summary

`npm audit` (2026-05-13): **15 vulnerabilities** (0 critical, 10 high, 3 moderate, 2 low)

| Package | Severity | CVE | Runtime? | Notes |
|---------|----------|-----|----------|-------|
| `fast-uri` | High | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc | Yes | Via `@modelcontextprotocol/sdk` — see SA-04 |
| `fast-xml-builder` | High+Mod | GHSA-5wm8-gmm8-39j9, GHSA-45c6-75p6-83cc | Needs verification | Track upstream |
| `hono` | Mod (×5) | GHSA-9vqf-7f2p-gf9v etc. | Likely via MCP SDK | Low exploitability in current transport config |
| `tar` | High (×6) | GHSA-34x7-hfp2-rc4v etc. | No (build only) | Via sqlite3/node-gyp — see SA-09 |
| `express-rate-limit` | Mod | GHSA-v2v4-37r5-5v8g | Yes | Via ip-address, low actual risk — see SA-07 |
| `@tootallnate/once` | Low | GHSA-vpq2-c234-7xj6 | No (build only) | Via http-proxy-agent/node-gyp |

---

## Remediation Priority

1. **SA-00** (Critical, MCP auth) — Add `authMiddleware` to `POST/GET/DELETE /mcp` before any deployment. Single-line change per route.
2. **SA-03** (Medium, JWT in URL) — Remove `?token=` legacy path. No clients should rely on it given the ticket mechanism.
3. **SA-02** (Medium, task whitelist) — Decide and document the task execution policy; enforce a task name allowlist or tighten `bolt:execute` role assignment.
4. **SA-01** (Medium, CORS) — Fix before any internet-facing deployment. One-line config change + startup assertion.
5. **SA-06** (Low, trust proxy) — Set before deploying behind any reverse proxy. Required for rate limiting and audit logs to be meaningful.
6. **SA-04** (Medium, fast-uri) — Upgrade `@modelcontextprotocol/sdk` when a fixed release is available; resolving SA-00 reduces interim exposure.
7. **SA-08** (Low, refresh rotation) — Implement before production. Straightforward change in `AuthenticationService.refreshToken()`.
8. **SA-05** (Low, DoS lockout) — Add admin alerting; revisit cumulative-forever counter policy.
