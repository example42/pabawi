# End-to-End Tests

Three Playwright projects against the assembled app:

- `setup` — seeds the administrator and saves its session.
- `anonymous` — the unauthenticated contract: the SPA is served, the auth guard
  redirects to the sign-in form, protected API routes answer 401.
- `chromium` — authenticated execution flows: admission, failure display and
  cancellation of queued work.

Everything is hermetic. The app under test runs on a scratch database with an
SSH inventory of two deliberately unreachable hosts, so the suite touches no
infrastructure and finishes in about six seconds.

## Running

```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # interactive
npm run test:e2e:headed   # visible browser
npm run test:e2e:debug    # step through
```

Playwright starts the app itself (`npm run dev:fullstack` on port 3000). The
browser binary is pinned to the installed `playwright-core`; if you see
`Executable doesn't exist`, run `npx playwright install chromium`.

Delete `e2e/.auth` to start from an empty database.

## Adding tests

Read [docs/internal/e2e-testing.md](../docs/internal/e2e-testing.md) first. It
documents the fixture hosts and the four rules, all of which were learned the
hard way: the flow suites that used to live here were deleted for breaking
them.
