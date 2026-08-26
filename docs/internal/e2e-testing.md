# End-to-End Testing Guide

## Overview

Pabawi runs a single Playwright suite, [`e2e/setup-check.spec.ts`](../../e2e/setup-check.spec.ts).
It is a smoke test of the unauthenticated contract, not a user-flow suite.

## Current coverage

| Test | Asserts |
| --- | --- |
| serves the SPA shell | `GET /` returns 200 and the document title matches Pabawi |
| renders the sign-in form when unauthenticated | heading, username field, password field, submit button are visible |
| sends an unauthenticated deep link to the sign-in form | `/executions` renders the sign-in form rather than the page |
| rejects unauthenticated API reads with 401 | `GET /api/inventory` answers 401 |

Together these cover: the backend boots, static assets are served, the SPA
mounts and routes, the frontend auth guard holds, and `authMiddleware` is
actually mounted on protected routes.

The suite is hermetic — no seeded user, no database fixture, no reachable Bolt
or PuppetDB inventory — so it runs on any checkout in about a second.

## Running

```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # interactive
npm run test:e2e:headed   # visible browser
npm run test:e2e:debug    # step through
npx playwright test e2e/setup-check.spec.ts:18   # a single test by line
npx playwright show-report                        # HTML report after a run
```

Playwright starts the app itself via `webServer` (`npm run dev:fullstack`,
port 3000) and reuses an already-running server unless `CI=true`.

### Browser binaries

The chromium revision is pinned by the installed `playwright-core`, not by
whatever is already in `~/Library/Caches/ms-playwright`. A cache holding only
another revision fails every test with:

```
Executable doesn't exist at .../chromium_headless_shell-<rev>/...
```

Fix with `npx playwright install chromium`. In CI use
`npx playwright install --with-deps chromium`.

## Not in CI

`.github/workflows/ci.yml` runs lint, both typechecks, unit tests and both
builds. It does not run this suite. Wire it in before relying on it as a gate —
an E2E suite nobody runs drifts out of sync with the UI within a release or two.

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

## Extending past the login screen

Authenticated tests are worth adding, but not before the harness underneath
them is real. Required, in order:

1. **Isolate the backend.** Set `webServer.env` in `playwright.config.ts` to
   override `DATABASE_PATH` to a scratch file and `BOLT_PROJECT_PATH` to the
   checked-in `samples/integrations/bolt` fixture. Without this the suite runs
   against the developer's own dev database and live infrastructure.
2. **Seed and authenticate once.** Add a Playwright setup project that creates
   the admin via `POST /api/setup/initialize`, logs in via
   `POST /api/auth/login`, and saves `storageState`. The frontend reads its
   token from `localStorage` under `authToken` (also `refreshToken`, `authUser`).
3. **Add real selectors.** Put `data-testid` on the specific elements the tests
   touch and select only on those, or use accessible-name selectors
   (`getByRole`, `getByLabel`, `getByPlaceholder`) as `setup-check` does.
4. **Add the CI step**, so the suite cannot rot unnoticed.

## Rules for new tests

1. **Assert unconditionally.** No `if (visible) { assert } else { weaker assert }`.
   If a precondition may be absent, fix the fixture or fail — never branch into
   a softer claim.
2. **Select on contracts, not fragments.** `getByRole` / `getByLabel` /
   `getByPlaceholder` / `data-testid`. Never substring-match a class attribute.
3. **Verify the test can fail.** After writing it, break the expectation on
   purpose and confirm it goes red. An assertion never observed failing is an
   assertion not known to work.
4. **Stay hermetic.** A test that needs a reachable production host belongs in
   manual integration checks, not here.
