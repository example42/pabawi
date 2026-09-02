# End-to-End Tests

One Playwright suite, `setup-check.spec.ts`, covering the unauthenticated
contract: the server serves the SPA, the auth guard redirects to the sign-in
form, and protected API routes answer 401.

That is the whole suite on purpose. It is hermetic — no seeded user, no
database fixture, no reachable Bolt/PuppetDB inventory — so it runs anywhere
in about a second.

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

## Adding tests

Two rules, both learned the hard way — the four flow suites that used to live
here (`inventory-to-*`, `executions-page`) were deleted because they broke both:

1. **Assert unconditionally.** No `if (await thing.isVisible()) { … } else { … }`.
   A conditional around an assertion produces a test that reports success on the
   branch where it checked nothing. Five such tests passed for months while the
   browser sat on the login screen.

2. **Select on contracts, not fragments.** Use `getByRole`, `getByLabel`,
   `getByPlaceholder`, or a `data-testid` you add to the component. Never
   `[class*="node"]` — substring matching on utility classes matches anything
   and pins nothing.

Anything past the login screen needs authentication and a hermetic backend
first. See [docs/internal/e2e-testing.md](../docs/internal/e2e-testing.md).
