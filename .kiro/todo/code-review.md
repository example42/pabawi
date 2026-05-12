# Code Review: Smells, Antipatterns, and Issues

Analysis of the backend and frontend codebase as of branch `120`. Issues are grouped by severity.

---

## Critical — Security and Correctness

### 1. Command injection via unconstrained string interpolation (`backend/src/routes/puppet.ts:46–73`)

`buildPuppetCommand` takes `body.environment` and `body.tags` from the request body — validated only as `z.string()`, no character constraints — and interpolates them directly into the command string passed to `bolt command run`. Bolt may re-shell on the remote end. A crafted environment value like `production; rm -rf /` or a tag with embedded semicolons can execute arbitrary commands on every target node in the run. The fix requires either allowlist-validating these fields (e.g., `z.string().regex(/^[a-zA-Z0-9_\-]+$/)`) or passing them as discrete CLI arguments with explicit `--` separation.

[X] Already fixed: `PuppetEnvironmentSchema` (`/^[a-z0-9_]+$/`) and `PuppetTagSchema` (`/^[a-z0-9_][a-z0-9_:.-]*$/`) in `backend/src/validation/commonSchemas.ts` are applied to the Zod schemas in `puppet.ts`.

### 2. `JWT_SECRET` read via `process.env` in route handlers, bypassing `ConfigService`

Eight route files read secrets directly from `process.env` instead of through `ConfigService`:

- `auth.ts:76`, `users.ts:44`, `groups.ts:46`, `roles.ts:46`, `setup.ts:65`, `permissions.ts:38`, `inventory.ts:26` — `process.env.JWT_SECRET`
- Several files — `process.env.PABAWI_LIFECYCLE_TOKEN`

`ConfigService` validates and normalises config at startup with Zod. Direct `process.env` reads bypass that validation, meaning a missing or malformed `JWT_SECRET` silently produces `undefined` at the call site rather than failing fast at startup. It also means any future secret rotation logic in `ConfigService` won't apply to these paths.

[ ] Deferred: requires adding `jwtSecret` + `lifecycleToken` to `AppConfigSchema`, a `getAuthSecrets()` method on `ConfigService`, threading through 8 route factories and 15+ test files. Separate session.

### 3. Mutable global state for `IntegrationManager` (`backend/src/server.ts:1042`)

```ts
(global as Record<string, unknown>).integrationManager = integrationManager;
```

This is a DI substitute that works until it doesn't: tests that run in the same process can bleed state across cases, any module that reads from `global` gets an untyped reference it must cast, and there is no lifecycle enforcement (the global is never cleared). Several route files and services already receive `integrationManager` as a constructor or function argument — the global registration is redundant and dangerous. Remove it.

[X] Removed: the global write had zero readers. Deleted the assignment in `server.ts`.

---

## High — Structural and Maintainability

### 4. `server.ts` is a 1585-line God file with nine copy-pasted integration init blocks (`server.ts:265–947`)

Every integration follows the same template:

```ts
try {
  const xPlugin = new XPlugin(configService);
  integrationManager.registerPlugin(xPlugin);
  await xPlugin.initialize();
  logger.info('X integration initialized');
} catch (err) {
  logger.warn('X integration failed to initialize', { error: err });
}
```

This block is repeated nine times (Bolt, Ansible, PuppetDB, Puppetserver, Hiera, SSH, Proxmox, AWS, Azure) with no structural difference beyond the plugin class. Adding a tenth integration requires copying the block again. The correct model is a plugin registry list iterated at startup. The nine blocks should collapse to one loop over a registered plugin constructors array.

[ ] Deferred: architectural refactor of `server.ts` — separate session.

### 5. Same router mounted at two URL paths (`server.ts:1184–1202` and `1295–1323`)

`createInventoryRouter` is mounted at both `/api/inventory` and `/api/nodes`. `PackagesRouter` is mounted at both `/api` and `/api/nodes`. This produces duplicate REST surfaces with identical behaviour. Any bug or security fix applied to one mount point must be applied to the other, but there is no enforcement that they stay in sync. The duplicate mounts should be removed; clients should use a single canonical path.

[ ] Deferred: requires audit of all frontend call sites + possible client migration — separate session.

### 6. `~80 lines of async execution logic duplicated` between single-node and multi-node handlers (`puppet.ts:262–340` vs `484–558`)

Both handlers: spawn the bolt process, update the DB record, record a journal entry, emit SSE events, and handle errors. The code is near-verbatim. The only difference is the node target(s). This duplication means any fix (e.g., the injection issue in §1, or adding audit fields) must be applied twice. Extract a `runPuppetOn(targets, options, context)` helper.

[ ] Deferred: non-trivial extraction with test coverage required — separate session.

### 7. `api.ts` is a 1378-line God module mixing HTTP infrastructure with domain functions (`frontend/src/lib/api.ts`)

Lines 1–580 are generic HTTP client infrastructure (retry logic, error parsing, token refresh). Lines 786–1003 are 20+ Proxmox-specific API functions. Lines 1055–1293 are AWS-specific functions. Mixing transport layer with domain API bindings in one file makes it impossible to tree-shake, difficult to test, and expensive to navigate. Split along the obvious seam: `api.ts` (HTTP client + retry), `proxmoxApi.ts`, `awsApi.ts`, and so on.

[ ] Deferred: large file split touching all consumer imports — separate session.

### 8. Pervasive absence of dependency injection: 64 `LoggerService` and 80 `ExpertModeService` instantiations

```bash
# grep results:
# new LoggerService() — 64 occurrences
# new ExpertModeService() — 80 occurrences
```

Every service and route handler instantiates its own logger. Changing the log level at runtime cannot be done centrally. Injecting a test logger in unit tests requires monkey-patching the class. The plugin architecture already demonstrates the right pattern (dependencies passed to constructors), but it is not applied to shared services.

[ ] Deferred: requires introducing a DI container or passing through 60+ call sites — separate session.

### 9. Inline `require()` for MCP SDK with suppressed type errors (`server.ts:1397–1407`)

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js') as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
```

`require()` inside an `async` function body, typed as `any`, defeats the module system. If the SDK ships types (which it does), this is a sign the import was written to silence a compile error rather than fix it. Use a proper `import` at the top of the file.

[ ] Deferred: the inline comment confirms this is intentional — the backend's `tsconfig.json` uses `moduleResolution: "node"`, and the MCP SDK requires `node16`+ to resolve `package.json` "exports". Fixing this means migrating the backend to `moduleResolution: "node16"` / `"bundler"`, which affects every import statement. Separate session.

---

## Medium — Robustness

### 10. Brittle locale-dependent error categorisation in `BoltService` (`BoltService.ts:556–561`, `798–803`, `1051–1086`)

Bolt errors are categorised by pattern-matching substrings in `stderr.toLowerCase()`:

```ts
if (stderr.toLowerCase().includes('unreachable')) { ... }
if (stderr.toLowerCase().includes('authentication')) { ... }
```

This breaks silently when: Bolt changes its error message wording, a future Bolt version localises output, or a node hostname happens to contain one of these trigger words. Bolt has a structured JSON error format — parse `_error.kind` from the JSON response instead of scraping stderr.

[ ] Deferred: requires auditing Bolt JSON error schema across supported versions — separate session.

### 11. Task list cache never expires (`BoltService.ts:1351`)

```ts
if (this.taskListCache !== null) return this.taskListCache;
```

There is no TTL, no invalidation, no cache-busting. A new Bolt task deployed to the module path will not be visible until the process restarts. Every other cache in the codebase (inventory: 30 s, facts: 5 min) has a TTL; this one is accidentally permanent.

[X] Fixed: `taskListCache` converted to `CacheEntry<Task[]>` with a 5-minute TTL matching the facts cache.

### 12. Frontend polling with raw `fetch()` ignoring the SSE infrastructure (`PuppetRunInterface.svelte:255–282`)

`pollExecutionResult` uses raw `fetch()` with no auth header injection, no retry, no error type discrimination — while `executionStream.svelte.ts` already provides a typed SSE client and is used in the same component (line 223) for expert-mode streaming. The polling path re-implements a subset of what the SSE path already does, and it does it worse. Either extend SSE to cover the non-expert path or at minimum route through `api.ts`.

[ ] Deferred: architectural call on whether to promote SSE to the default path — separate session.

### 13. `sanitizeGroupName` is a textbook deny-list antipattern (`IntegrationManager.ts:1242–1273`)

```ts
.replace(/script/gi, '')
.replace(/eval/gi, '')
.replace(/--/g, '')
.replace(/['";\(\)]/g, '')
```

Deny-lists for injection defence are always incomplete and can be bypassed by encoding, splitting tokens, or using synonyms (`exec`, `Function`, etc.). The correct fix is context-specific: if group names flow into SQL, use parameterised queries; if they flow into shell commands, use an allowlist regex (`/^[a-zA-Z0-9_\-]+$/`).

[X] Replaced with allowlist: `/[^a-zA-Z0-9 _.:/-]/g` strips everything outside the safe set. Group names never flow into shell commands and SQL access is already parameterised, so the attack surface is XSS + log injection — both addressed by the allowlist. Tests updated.

---

## Cross-Cutting Patterns

### 14. Type system abandoned in 108 places

```bash
# grep -rn 'as any\|as unknown as\|eslint-disable.*@typescript' — 108 occurrences
```

A TypeScript codebase with 108 type suppressions has effectively opted out of the type system at its most complex points. Most of these appear at integration boundaries (Bolt JSON output, MCP SDK, Express request extensions). The correct response is to write typed interfaces for these boundaries; the suppressions are a symptom of missing types, not a fix.

[ ] Deferred: codebase-wide typing effort — separate session.

### 15. `console.log`/`console.error` left in production frontend components

`console.error('Error executing Puppet run:', err)` in `PuppetRunInterface.svelte:247`. `[CatalogComparison]` and `[EnvironmentSelector]` prefixed `console.log` calls in their respective components. These bypass the logging infrastructure, are visible in browser devtools, and may leak internal state details. Route through the structured logger or remove entirely.

[X] Fixed for the three flagged components: routed through `logger` (from `lib/logger.svelte`). Other `console.*` sites in pages (`HomePage`, `ExecutionsPage`, `NodeDetailPage`, etc.) remain — broader sweep left for a follow-up.

### 16. `LoggerService` instantiated inside a `catch` block and at router module scope (`puppet.ts:116`, `135`)

```ts
// line 116 — inside recordPuppetJournal's catch handler
const loggerService = new LoggerService();

// line 135 — module-level but separate from the one at line 27
const loggerService = new LoggerService();
```

The module already has a logger at line 27. These are stale copies that log independently, making it impossible to correlate output by instance or control verbosity centrally.

[X] Fixed: consolidated onto a single module-scoped `moduleLogger` in `puppet.ts`. Both previously separate instances now share it.

### 17. Type erasure to access JWT user on the request object (`puppet.ts:259`)

```ts
(req as unknown as { user?: { id?: string } }).user?.id
```

This is a sign that the Express `Request` type is not extended to include the auth middleware's injected fields. The fix — declare `user` on `Express.Request` via declaration merging in a `.d.ts` file — is a one-time change that removes this pattern everywhere.

[X] Fixed: the declaration merging already exists in `authMiddleware.ts`. The cast was also masking a bug — the code read `.user?.id`, but the middleware sets `.user.userId`, so the cast silently produced `"unknown"` on every call. Replaced with typed `req.user?.userId` in both `puppet.ts` (2 sites) and `executions.ts` (1 site).
