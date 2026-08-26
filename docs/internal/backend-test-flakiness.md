# Backend test flakiness — diagnosis

Backend suite: 208 files / 3339 tests. Fails nondeterministically on an
**unmodified** config — different tests each run. Investigated on branch 150.

Observed baseline (clean config): runs produced 0, 1, 1, 3, 3, 4, 5 failures with
largely disjoint failing sets.

---

## Cause A — Bolt tests are cwd-dependent (PROVEN, deterministic)

**Not flakiness.** `test/integration/bolt-plugin-integration.test.ts:85`:

    const boltProjectPath = process.env.BOLT_PROJECT_PATH || "./bolt-project";

`./bolt-project` is resolved against the **process working directory**. Vitest
workers inherit the *launch* directory as cwd — it does NOT follow the project
root (verified with a probe test: launching from `backend/` gives
`CWD=<repo>/backend`, launching from the repo root gives `CWD=<repo>`).

- `<repo>/backend/bolt-project` — does not exist -> inventory errors -> `unavailable` -> passes
- `<repo>/bolt-project`         — **exists**     -> inventory succeeds -> `healthy`   -> fails

Correlation over 10 recorded suite runs was perfect: every run launched from
`backend/` passed these tests; every run launched from the repo root failed them.

Direct proof:

    cd backend && npx vitest --run test/integration/bolt-plugin-integration.test.ts
      -> 23 passed
    cd <repo>  && npx vitest --run backend/test/integration/bolt-plugin-integration.test.ts
      -> 3 failed   (expected 'healthy' to be 'unavailable')

An equivalent failure is reachable by setting `BOLT_PROJECT_PATH` to any real Bolt
project (6 failed | 17 passed), which is what `backend/.env` -> repo-root `.env`
supplies in normal app use (`BOLT_PROJECT_PATH=.../lab42-bolt/`).

### Secondary defect in the same file

The assertion contradicts its own guard (`:529`, also `:279`, `:418`):

    it("should handle inventory retrieval failures gracefully", ...)
      if (!boltAvailable) { expect(true).toBe(true); return; }   // body runs only when bolt IS available
      ...
      // Bolt should be unavailable when not installed
      expect(aggregatedInventory.sources.bolt.status).toBe("unavailable");

Bolt 5.5.0 IS installed here (`/opt/puppetlabs/bin/bolt`). The test passes today
only because the fallback project path happens not to exist. It asserts an error
path while its comment claims to assert an availability state.

### Consequence for tooling

A root-level `vitest.config.ts` using `test.projects` must NOT include the backend
project: doing so runs backend tests with cwd = repo root and trips this bug. The
root config in this repo therefore delegates to `frontend/vitest.config.ts` only.
Run backend from `backend/`, which is what `npm test` already does.

---

## Cause B — the remaining cluster (NARROWED BY ELIMINATION, not root-caused)

Affected: `consoleRbacTermination.property`, `consoleRbacCreation.property`,
`users`, `auth`, `EntraIdProviders`, `error-handling`, `rbac-performance`,
`batch-execution`.

Symptoms: `expected 204, got 401`; `expected 200, got 404`; `expected 200/404, got
426 "Upgrade Required"`; `Test timed out in 5000ms`; property tests failing after
a varying iteration count (3, 8, 45, 47, 86).

**Every affected file passes reliably in isolation.** They only fail in-suite.

### Ruled out

| Hypothesis | Evidence against |
|---|---|
| Cross-process port collision / concurrency | Fails just as often with `--maxWorkers=1 --fileParallelism=false` (1, 5, 1 failures over 3 serialized runs) |
| Ephemeral port exhaustion | TIME_WAIT peaked at 2945 during a full parallel run; macOS ephemeral range is 49152-65535 = 16384 ports |
| `process.env` leaking between test files | Probe: file A writes `__LEAK_PROBE__` and deletes `JWT_SECRET`; file B in the same run sees neither. Vitest isolates env per file |
| Multiple DB connections (`:memory:` per-connection DBs) | `SQLiteAdapter` holds a single `this.db`; no pool, no reconnect |
| Input-dependent property failures | fast-check reports `Shrunk 0 time(s)` — no minimal counterexample; failure depends on iteration count, not value |

Note: 24 test files write `process.env`, 13 delete keys from it, and 6 delete
`JWT_SECRET` outright. This is poor hygiene and worth cleaning up, but the probe
above shows it is **not** the cause — vitest isolates env per file.
`test/routes/auth.test.ts.backup` is stray cruft (not matched by the include glob).

### Remaining hypothesis

Load-sensitive timing assumptions. The failures cluster in suites doing bcrypt
hashing, JWT expiry, and timestamp comparisons — e.g. `users.test.ts > should
update updated_at timestamp` is a textbook timestamp-granularity race, and
`error-handling.test.ts > token expired` depends on wall-clock. Under full-suite
CPU contention these drift. Not yet proven; the next step is to instrument one
affected test to log actual vs expected timing rather than continue by elimination.

---

## Suggested fixes (NOT APPLIED)

1. `bolt-plugin-integration.test.ts` — make the three assertions independent of cwd
   and of whether Bolt is installed: inject a deliberately-invalid project path to
   exercise the error path, instead of relying on a relative path not existing.
   Requires a decision on the test's intent.
2. Stop `ConfigService` reading `.env` when `NODE_ENV === 'test'` so the developer's
   real config can never reach tests. (Pinning `BOLT_PROJECT_PATH: ''` in `test.env`
   does NOT work — empty string is falsy and falls back to `./bolt-project`.)
3. Cause B needs instrumentation before any fix.
