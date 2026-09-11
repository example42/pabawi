# End-to-End Testing Guide

## Overview

Pabawi runs three Playwright projects against the assembled app, served the way
it ships (`npm run dev:fullstack`, port 3000):

| Project | Spec | What it establishes |
| --- | --- | --- |
| `setup` | [`auth.setup.ts`](../../e2e/auth.setup.ts) | Seeds the administrator and saves its `storageState` |
| `anonymous` | everything else | The unauthenticated contract |
| `chromium` | `*.authenticated.spec.ts` | Authenticated execution flows |

A spec named `*.authenticated.spec.ts` runs with a seeded session; any other
spec runs without one. Neither project ignores unmatched files, so a new spec
always lands in a project rather than silently never running.

The whole suite runs in about six seconds and touches no infrastructure.

## Isolation

`playwright.config.ts` sets `webServer.env`, so the app under test never reads
the developer's `.env`, database or inventory:

| Setting | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `test` | Stops `ConfigService` from loading `backend/.env` |
| `DATABASE_PATH` | `e2e/.auth/e2e.db` | A scratch database, git-ignored |
| `BOLT_PROJECT_PATH` | `.` | Bolt stays unconfigured: no binary, no sample project |
| `SSH_*` | the fixture below | The only inventory and the only execution tool |
| `CONCURRENT_EXECUTION_LIMIT` | `1` | One slot, so a second submission is observably queued |

The scratch database survives between local runs. The setup project therefore
accepts `409 SETUP_ALREADY_COMPLETE` and logs in instead. Delete `e2e/.auth` for
a clean run.

## The SSH fixture

[`e2e/fixtures/ssh/config`](../../e2e/fixtures/ssh/config) defines two hosts,
both deliberately unreachable, in two different ways:

- **`e2e-refused`** — `127.0.0.1:1`. Nothing listens, so the connection is
  refused in about a millisecond and the run reaches a terminal failure
  immediately. This is the target for admission and failure-display tests.
- **`e2e-stalled`** — `localhost:45001`. Nothing listens either, unless a test
  opens a listener that accepts the connection and then never writes a byte, so
  the SSH handshake waits for a banner that never arrives and the run stays
  busy for as long as the test holds it. This is how a queued execution is made
  observable without a race.

The two use different host *strings* (`127.0.0.1` versus `localhost`) on
purpose: node linking merges hosts that share an address, and merged hosts
cannot be used as two separate targets.

## Running

```bash
npm run test:e2e          # headless, all projects
npm run test:e2e:ui       # interactive
npm run test:e2e:headed   # visible browser
npm run test:e2e:debug    # step through
npx playwright test execution-cancellation        # one spec
npx playwright show-report                        # HTML report after a run
```

### Browser binaries

The chromium revision is pinned by the installed `playwright-core`, not by
whatever is already in `~/Library/Caches/ms-playwright`. A cache holding only
another revision fails every test with:

```
Executable doesn't exist at .../chromium_headless_shell-<rev>/...
```

Fix with `npx playwright install chromium`. In CI use
`npx playwright install --with-deps chromium`.

## In CI

`.github/workflows/ci.yml` runs the suite in its own `e2e` job and uploads the
Playwright report when it fails. Before that job existed the suite ran only on a
maintainer's laptop, which is how an E2E suite drifts out of sync with the UI
within a release or two.

## History: why the flow suites were deleted

`e2e/` previously held four suites — `inventory-to-command`,
`inventory-to-facts`, `inventory-to-task` and `executions-page`, 13 tests
across 4 files. All were removed. They were written before authentication
existed and had two structural defects that made their results meaningless:

**They targeted a UI that was never built.** The specs selected on 17
`data-testid` values; the frontend defines 4, with zero overlap. Every selector
fell through to a substring fallback such as `[class*="node"]` or
`[class*="output"]`, which match on utility-class fragments and pin nothing.

**They wrapped assertions in conditionals.** The recurring shape was:

```ts
if (await executionsLink.isVisible()) {
  ...real assertions...
} else {
  await page.goto('/executions');
  expect(pageContent).toMatch(/executions|history|no executions/i);
}
```

Once login was introduced the link was never visible, so the else branch was
always taken. All five `executions-page` tests reported green while the browser
sat on the sign-in screen, having verified nothing. False green is worse than
red: red reports a problem, green hides one.

They were also non-hermetic — `inventory-to-command` executed `pwd` against
whatever real hosts `BOLT_PROJECT_PATH` pointed at.

## Rules for new tests

1. **Assert unconditionally.** No `if (visible) { assert } else { weaker assert }`.
   If a precondition may be absent, fix the fixture or fail — never branch into
   a softer claim.
2. **Select on contracts, not fragments.** `getByRole` / `getByLabel` /
   `getByPlaceholder` / `data-testid`. Never substring-match a class attribute.
   Add a `data-testid` to the component when no accessible name identifies the
   element, as `ExecutionList` does for rows and their status cell.
3. **Verify the test can fail.** After writing it, break the expectation on
   purpose and confirm it goes red. An assertion never observed failing is an
   assertion not known to work.
4. **Name it for the project it belongs to.** `*.authenticated.spec.ts` runs
   with a session; anything else runs anonymously. A spec that matches no
   project would not run at all, and a suite that does not run is the same
   false green as one that asserts nothing.
5. **Stay hermetic.** A test that needs a reachable production host belongs in
   manual integration checks, not here. If a test needs work to still be
   running, hold it open deliberately (see `e2e-stalled`) rather than relying on
   something being slow.

## Not covered here

Console sessions. A console flow needs a provider to connect to, and the
provider side is covered by the backend suite against a fake WebSocket upstream
(`backend/test/security/console-lifecycle.test.ts`) rather than through the
browser.
