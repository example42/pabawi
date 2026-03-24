---
title: Tech Stack
inclusion: always
---

## Language & Runtime

- TypeScript (strict mode) across frontend and backend
- Node.js 20+ runtime
- ES2022 target for both frontend and backend

## Frontend

- Svelte 5 with Vite 7 bundler
- TailwindCSS 3 for styling (PostCSS + Autoprefixer)
- Client-side routing (custom `router.svelte.ts`)
- Svelte runes for state management (`*.svelte.ts` files)
- Dev server on port 5173, proxies `/api` to backend on port 3000

## Backend

- Express 4 HTTP server with TypeScript
- `tsx` for development (watch mode)
- `tsc` for production builds (CommonJS output to `dist/`)
- SQLite3 (primary) and PostgreSQL (optional) via adapter pattern
- SQL migrations in `src/database/migrations/`
- Zod for request validation
- JWT (jsonwebtoken) for authentication
- bcrypt for password hashing
- ssh2 for SSH connections
- helmet + cors + express-rate-limit for security
- dotenv for configuration (`backend/.env`)

## Monorepo Structure

- npm workspaces (`frontend`, `backend`)
- Root `package.json` orchestrates cross-workspace scripts
- Shared ESLint config at root (`eslint.config.js`)
- `typescript-eslint` strict + stylistic type-checked rules
- Key ESLint rules: `explicit-function-return-type`, `no-explicit-any`, `consistent-type-imports`

## Testing

- Vitest for unit tests (both frontend and backend)
- Backend tests: `environment: 'node'`, files in `test/` and `src/integrations/*/__tests__/`
- Frontend tests: `environment: 'jsdom'`, co-located `*.test.ts` files
- fast-check for property-based testing
- supertest for HTTP endpoint testing
- @testing-library/svelte for component tests
- Playwright for E2E tests (`e2e/` directory, Chromium, base URL `http://localhost:3000`)

## Pre-commit

- pre-commit framework with conventional commits enforcement
- ESLint, tsc (both workspaces), hadolint, markdownlint, shellcheck
- detect-secrets with `.secrets.baseline`

## Common Commands

```bash
# Install all dependencies
npm run install:all

# Development
npm run dev:frontend        # Vite dev server (port 5173)
npm run dev:backend         # tsx watch (port 3000)
npm run dev:fullstack       # Build frontend, copy to backend/public, run backend

# Build
npm run build               # Build frontend + copy + build backend

# Test
npm test                    # Run backend + frontend unit tests (vitest --run)
npm run test:e2e            # Playwright E2E tests

# Lint
npm run lint                # ESLint both workspaces
npm run lint:fix            # ESLint autofix both workspaces

# Pre-commit
npm run precommit           # Run all pre-commit hooks
npm run setup:hooks         # Install pre-commit hooks
```

## Deployment

- Docker support with multi-stage builds (Dockerfile, Dockerfile.alpine, Dockerfile.ubuntu)
- docker-compose.yml for container orchestration
- Frontend built and copied into `backend/public/` for single-server serving
- Health check endpoint at `/api/health`
