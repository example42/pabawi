---
title: Testing Best Practices
inclusion: always
---

## Test Framework

This project uses **Vitest** for unit and integration tests, and **Playwright** for E2E tests. Do not reference Jest, pytest, Mocha, or other test runners.

## Project Test Commands

```bash
# Run all tests (backend + frontend, no-watch)
npm test

# Backend tests only
npm test --workspace=backend

# Frontend tests only
npm test --workspace=frontend

# Backend watch mode
npm run test:watch --workspace=backend

# Run a single test file
cd backend && npx vitest run test/unit/SomeService.test.ts

# E2E tests
npm run test:e2e

# E2E with UI mode
npm run test:e2e:ui
```

## Test Organization

- **Backend unit/integration tests**: `backend/test/` directory (unit, integration, security, middleware, properties)
- **Integration plugin tests**: `backend/src/integrations/*/__tests__/`
- **Frontend tests**: co-located with source as `*.test.ts` files
- **E2E tests**: `e2e/` directory using Playwright (Chromium, base URL `http://localhost:3000`)

## Success Criteria

- Always define explicit, meaningful assertions — "page loads" is NOT a success criterion
- Every test must assert something observable (state change, return value, side effect, API response)
- Test both the happy path and relevant edge cases
- Do not merge code that breaks existing tests

## Backend Testing Conventions

- Use `supertest` for HTTP endpoint tests — test the full request/response cycle
- Database tests use **in-memory SQLite** — never use production or shared databases in tests
- Use `fast-check` for property-based testing where applicable
- Mock external CLI tools (bolt, ansible) and HTTP calls; do not mock `DatabaseService` or internal services unless unavoidable

## Frontend Testing Conventions

- Use `@testing-library/svelte` for component tests
- Test component behavior (user interaction, state changes) not implementation details
- Co-locate test files next to the component: `MyComponent.svelte` → `MyComponent.test.ts`

## Test Quality

- Descriptive test names: `describe('ServiceName') > it('does X when Y')`
- Group related tests under `describe` blocks
- Keep test files focused — one test file per module
- Avoid testing private implementation details; test public interfaces and behavior
- Do not rely on test execution order — each test must be independent

## Performance

- Run tests in parallel when possible (Vitest does this by default)
- Use in-memory databases and mocked external calls to keep tests fast
- Do not introduce real network calls or filesystem dependencies in unit tests

## CI Considerations

- All tests must pass before committing (`npm test`)
- E2E tests run against the full stack — ensure the server is running on port 3000
- Coverage reporting is separate from the main test run
