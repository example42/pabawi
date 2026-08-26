# Backend test flakiness — diagnosis

Backend suite: 208 files / 3339 tests. Fails nondeterministically on an
**unmodified** config — different tests each run. Investigated on branch 150.

Observed baseline (clean config): runs produced 0, 1, 1, 3, 3, 4, 5 failures with
largely disjoint failing sets.

**Status: root-caused and fixed.** There were three independent causes, not one.
Cause B — the cluster previously filed as "narrowed by elimination, not
root-caused" — turned out not to be a timing problem at all.

---

## Cause A — Bolt tests were cwd-dependent (PROVEN, deterministic) — FIXED

**Not flakiness.** `test/integration/bolt-plugin-integration.test.ts`:

    const boltProjectPath = process.env.BOLT_PROJECT_PATH || "./bolt-project";

`./bolt-project` resolved against the **process working directory**. Vitest
workers inherit the *launch* directory as cwd — it does NOT follow the project
root (verified with a probe test: launching from `backend/` gives
`CWD=<repo>/backend`, launching from the repo root gives `CWD=<repo>`).

- `<repo>/backend/bolt-project` — does not exist -> inventory errors -> `unavailable` -> passed
- `<repo>/bolt-project`         — **exists**     -> inventory succeeds -> `healthy`   -> failed

Correlation over 10 recorded suite runs was perfect: every run launched from
`backend/` passed these tests; every run launched from the repo root failed them.

Three assertions (`:279`, `:418`, `:529`) required Bolt to be UNAVAILABLE while
their own guard (`if (!boltAvailable) return;`) meant the body only ran when Bolt
WAS available. They passed only because the fallback project path happened not to
exist. Setting `BOLT_PROJECT_PATH` to any real Bolt project — which the
developer's own `.env` supplies — produced 6 failed / 17 passed.

### Fix

1. The fallback path is resolved against the test file's own location, not cwd,
   so the launch directory no longer changes the result.
2. The three degradation assertions now use a **separate `IntegrationManager`
   wired to a project path that cannot exist** (`brokenManager`). "Bolt is
   failing" became a property of the fixture instead of an accident of the
   environment, and the assertions now match their stated intent.

Verified: passes from `backend/` **and** from the repo root (previously 3 failed).

### Known remaining condition (by design, not a defect)

With `BOLT_PROJECT_PATH` pointing at a **real** Bolt project, three
facts-gathering tests still fail — they now genuinely execute against the real
inventory's nodes and cannot reach them. That is inherent to running an
integration test against live infrastructure, not a test bug. Down from 6
failures to 3, and the remaining 3 no longer misrepresent what they assert.

### Note on the old suggestion #2

"Stop `ConfigService` reading `.env` when `NODE_ENV === 'test'`" was already
implemented (`src/config/ConfigService.ts:24`). Only an explicitly exported
`BOLT_PROJECT_PATH` reaches tests, not the `.env` file.

---

## Cause B — supertest port shadowing by unrelated applications (PROVEN) — FIXED

Affected: `consoleRbacTermination.property`, `consoleRbacCreation.property`,
`users`, `auth`, `EntraIdProviders`, `error-handling`, `rbac-performance`,
`batch-execution`, `permissions`, `groups`.

Symptoms: `expected 204, got 401`; `expected 200, got 404`; `expected 200/404,
got 426 "Upgrade Required"`; `socket hang up`; property tests failing after a
varying iteration count (3, 8, 12, 34, 36, 45, 86, 94) with `Shrunk 0 time(s)`.

### The mechanism

`request(app)` makes supertest call `app.listen(0)` and then connect to
`127.0.0.1:<port>` — a **fresh listening socket for every single request**
(`node_modules/supertest/lib/test.js:63`). On macOS that is unsafe:

1. `listen(0)` with no host binds the **wildcard** address (`::`). Verified:
   `server.address()` reports `{"address":"::","family":"IPv6"}`.
2. macOS allocates ephemeral ports from **49152–65535**
   (`net.inet.ip.portrange.first/last`) — the same range in which unrelated
   desktop applications hold long-lived listeners bound specifically to
   `127.0.0.1`.
3. A wildcard bind on a port already held on `127.0.0.1` **succeeds** — the two
   sockets coexist. But the more specific bind wins for incoming connections.
4. supertest then connects to `127.0.0.1:<port>` and its request is served by
   **the foreign application**.

The test receives a plausible, well-formed HTTP response its app never produced.
No error, no stack trace — just a wrong status code.

### Proof

`docs/internal/port-shadowing-probe.cjs` reproduces it directly. It replicates
the supertest lifecycle (listen(0) → read port → connect → close) with each
server answering with its own unique id, and reports every response that came
back with someone else's id.

8 processes × 4000 requests → **26 misroutes**, each mapping to a real process
on the machine (via `lsof -nP -iTCP -sTCP:LISTEN`):

| Port  | Foreign owner | Response the test saw |
|-------|---------------|-----------------------|
| 49152 | Ollama        | `200` + `<!doctype html>` |
| 49538, 60306, 61008 | Kiro Helper | `426 Upgrade Required`, `404 Not Found` |
| 57668, 58755 | Code Helper | `401 {"type":"authentication_error"…}`, `404` |
| 59863, 63975 | (unnamed) | `401 unauthorized\n` |

`426 Upgrade Required` appears **nowhere in this codebase** — it is `ws`'s reply
to a non-upgrade request. That response could only have come from another
process, which is what first made this conclusive.

Rate at realistic volume: **7 misroutes in 9600 requests (~0.07%)**. A full suite
run issues ~10k HTTP requests, so the expected yield is 0–8 failures per run on
a disjoint, random set of tests — exactly the observed baseline.

### Why the earlier elimination round missed it

The old "ruled out" table dismissed port collision because the suite failed just
as often with `--maxWorkers=1 --fileParallelism=false`. That reasoning assumed
the collision was **between vitest workers**. It is not — it is with *unrelated
applications on the machine*, which is precisely why serializing workers changed
nothing. Every other row in that table was correct but irrelevant; the remaining
"load-sensitive timing" hypothesis was wrong.

### Why CI never showed this

Two CI runs six weeks apart (`32973348229`, `29428810351`) failed with the
**identical three tests** — the property-test timeouts, unrelated to this — and
204 files green both times. GitHub Actions runners have essentially nothing bound
in the ephemeral range, and Linux's range starts at 32768. **Cause B is a
local-development problem.**

### Fix

`test/helpers/httpHarness.ts` binds **one server per test file, explicitly to
`127.0.0.1`**, and swaps the mounted handler per request:

    let harness: HttpHarness;
    beforeAll(async () => { harness = await createHttpHarness(); });
    afterAll(async () => { await harness.close(); });

    await request(harness.use(app)).get("/api/…").expect(200);

Binding explicitly to loopback makes the kernel see the real conflict, so it
never hands out a shadowed port. Measured with the same probe: **0 misroutes in
9600 requests**, versus 7 unfixed.

Two constraints shaped this design:

- **A drop-in patch is not possible.** `listen(0, "127.0.0.1")` resolves the host
  via `dns.lookup`, so `server.address()` returns `null` until a later tick, and
  supertest reads the port synchronously. Passing an already-listening server is
  the supported way out: supertest skips its own `listen(0)` when
  `app.address()` is truthy, and only closes servers it opened itself
  (`lib/test.js:134-145`).
- **One server per file, not per app.** Per-request bind/close churn on loopback
  exhausts the ephemeral range — the probe hit `EADDRNOTAVAIL` 1949 times at
  high volume. Swapping the handler also keeps property tests that build a fresh
  Express app per iteration down to one socket instead of hundreds.

### Converted files

`auth`, `users`, `permissions`, `groups`, `auth-flow`, `batch-execution`,
`error-handling`, `EntraIdProviders.property`, `consoleRbacCreation.property`,
`consoleRbacTermination.property` — the files carrying the request volume.

**The remaining ~30 supertest files still use bare `request(app)`** and retain
the ~0.07%-per-request exposure. They issue few enough requests that the residual
rate is low, but the hazard is not zero. Convert them with the same helper if
they start showing unexplained status-code failures.

---

## Cause C — a deterministic domain bug in a property test — FIXED

`test/properties/consoleConfig.property.test.ts` >
`valid positive integers → correctly parsed`.

Failed in 2 of 5 baseline runs, after a varying iteration count (12, 34) — which
looked like flakiness. It was not: both runs reported the **same counterexample**,
`["CONSOLE_SESSION_TIMEOUT_MS", "1"]`. It only appeared intermittently because
fast-check reseeds each run.

The setup tried to keep heartbeat below timeout with:

    process.env.CONSOLE_HEARTBEAT_INTERVAL_MS = String(Math.max(1, timeout - 1));

With `timeout === 1` that yields `heartbeat === 1`, and `ConfigService` reverts
**both** fields to defaults when `heartbeatIntervalMs >= sessionTimeoutMs`
(`src/config/ConfigService.ts:96`) — tripping the exact revert the line existed
to avoid. A timeout of 1 admits no valid heartbeat, so the input is outside the
property's domain; it is now discarded with `fc.pre(timeout > 1)` rather than
clamped. Verified across 10 fresh seeds.

---

## Unrelated: three property tests timing out (CI-visible) — FIXED

The only failures CI ever showed, identical across runs six weeks apart:

- `EntraIdCallback.property` × 2 — called `generateTestKeyPair()` (RSA-2048)
  *inside* the property body, 100× per test. Hoisted to module scope alongside
  the existing `primaryKey`. 5000ms+ → ~58ms.
- `consoleBinaryRelay.property` — `collectMessages()` never removed its
  listeners, so every one of 100 runs tore down and rebuilt the entire fixture
  (2 HTTP servers + 4 WebSockets). Listeners now detach on settle, the rebuild is
  gone, and `collectMessages`' own hardcoded 5000ms budget (a second timeout
  racing vitest's) was raised alongside an explicit 60s test timeout.

Note for anyone tempted to speed that file up further: `binaryBufferArb`'s
`.chain()` over a uniform size is deliberate. A bare
`fc.uint8Array({ maxLength: 65536 })` applies fast-check's default size bias and
generates buffers of **12 bytes max** (measured: 3.4KB total across 100 runs, vs
14.5MB for `.chain()`), which never reach the `ws` fragmentation and buffering
paths the property exists to cover.

---

## Reproduction

    node docs/internal/port-shadowing-probe.cjs <worker-id> <requests>
    # e.g. 8 concurrent workers, 4000 requests each:
    for w in 1 2 3 4 5 6 7 8; do node docs/internal/port-shadowing-probe.cjs $w 4000 & done; wait

Any `MISMATCH` line is a request that reached a foreign server. Cross-reference
the port with `lsof -nP -iTCP -sTCP:LISTEN` to identify the owner. Expect zero
mismatches only if nothing else on the machine holds loopback ports in
49152–65535 — on a typical developer Mac, several things do.
