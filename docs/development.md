# Development Guide

## Setup

```bash
git clone git@github.com:example42/pabawi.git
cd pabawi
npm run install:all   # installs root + backend + frontend dependencies
```

Copy `.env.example` to `backend/.env` and configure at minimum `BOLT_PROJECT_PATH`.

## Running Locally

```bash
# Backend only (port 3000, tsx watch)
npm run dev:backend

# Frontend only (port 5173, Vite dev server)
npm run dev:frontend

# Full stack (build frontend + serve from backend)
npm run dev:fullstack
```

Frontend dev server proxies `/api/*` to `http://localhost:3000`. Access the UI at `http://localhost:5173`.

## Building

```bash
npm run build           # build both backend (tsc) and frontend (vite)
```

Output: `backend/dist/` and `frontend/dist/`. The backend serves `frontend/dist/` as static files in production.

## Testing

```bash
npm run test                              # all tests, no watch
npm test --workspace=backend              # backend only
npm test --workspace=frontend             # frontend only
npm run test:watch --workspace=backend    # backend watch mode

# Run a single file
cd backend && npx vitest run test/unit/SomeService.test.ts
```

**E2E (Playwright):**

```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:headed   # visible browser
```

E2E tests require the full application running. Start it with `npm run dev:fullstack` before running Playwright.

## Linting

```bash
npm run lint        # lint both workspaces (0 warnings allowed)
npm run lint:fix    # auto-fix
```

The CI pipeline runs lint and type checks. All linting must pass before merging.

## Pre-commit Hooks

```bash
pip install pre-commit   # or: brew install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg
pre-commit run --all-files    # run manually
```

Hooks check: secrets, large files, YAML validity, commit message format, ESLint.

## Project Structure

```
pabawi/
├── backend/
│   ├── src/            # TypeScript source
│   ├── test/           # unit, integration, security, property tests
│   └── dist/           # compiled output
├── frontend/
│   ├── src/            # Svelte 5 + TypeScript source
│   └── dist/           # compiled output
├── e2e/                # Playwright tests
├── docs/               # documentation
└── scripts/            # setup and utility scripts
```

See [architecture.md](./architecture.md) for the full source layout.

## Adding a New Integration

Every integration is a plugin. To add one:

1. Create `backend/src/integrations/<name>/` with:
   - `<Name>Plugin.ts` — extends `BasePlugin`, implements lifecycle and routing
   - `<Name>Service.ts` — business logic (API calls, CLI spawning)
2. Add config schema to `backend/src/config/schema.ts`
3. Parse env vars in `backend/src/config/ConfigService.ts`
4. Register the plugin in `backend/src/server.ts`
5. Add routes in `backend/src/routes/` (optional)
6. Add tests in `backend/test/unit/`
7. Add a doc in `docs/integrations/<name>.md`

Follow the patterns in `integrations/ansible/` or `integrations/ssh/` for a clean example.

## Key Conventions

| Rule | Detail |
|---|---|
| Config | Never read `process.env` directly — use `ConfigService` |
| Logging | Use `LoggerService`, never `console.log` |
| DB access | Use the shared `DatabaseService` singleton — never create connections in individual files |
| Async | Use `Promise.all` for independent `await` calls |
| Routes | Wrap all async route handlers with `asyncHandler()` |
| Error types | Use typed errors from `backend/src/errors/` |
| Svelte state | Use `$state()`, `$effect()`, `$derived()` — no stores |

## Code Quality Gates

All of these must pass before a PR is merged:

- `npm run lint` — 0 warnings
- TypeScript compiles with no errors
- All tests pass (`npm test`)
- No file > 300 lines (split if larger)
- No function > 50 lines (extract helpers)

## Environment Variables for Testing

Backend tests use in-memory SQLite and don't read `.env`. The test environment is set via `NODE_ENV=test` (handled by Vitest configuration).

For E2E tests, create `backend/.env.test` with a complete configuration pointing to a test Bolt project.
