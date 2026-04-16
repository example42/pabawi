---
title: TypeScript Best Practices
inclusion: fileMatch
fileMatchPattern: '*.ts'
---

## Configuration

- Strict mode is mandatory (`strict: true`) — never relax strict settings
- `noImplicitAny` and `strictNullChecks` are enforced via the shared tsconfig
- ESLint enforces: `@typescript-eslint/explicit-function-return-type`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/consistent-type-imports`

## Code Style

- `const` over `let`, never `var`
- PascalCase for classes and interfaces; camelCase for variables and functions; UPPER_SNAKE_CASE for constants
- Named exports over default exports
- Group imports: external libraries first, then internal modules
- Use `import type` for type-only imports (enforced by ESLint)

## Type Safety

- **Never use `any`** — use union types, `unknown`, or generics instead. If unavoidable, add an inline comment explaining why
- Always define explicit return types for public functions
- Prefer interfaces over type aliases for object shapes; use type aliases for unions and computed types
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safe property access

## Error Handling

- Use the typed error classes from `backend/src/errors/` — never throw generic `Error` when a typed subclass exists
- Never swallow errors silently — always log with context before re-throwing
- Use `asyncHandler()` from `utils/` to wrap all async Express route handlers
- Propagate errors up through services; handle them at route or middleware boundaries

## Imports and Modules

- Use named exports consistently
- Avoid barrel re-exports unless they meaningfully simplify the public API
- Use absolute imports where path mapping is configured

## Testing

- Write tests for all public functions and services using Vitest
- Use descriptive test names: `describe('ClassName') > it('does X when Y')`
- Do not mock `DatabaseService` or internal services unless unavoidable — prefer in-memory SQLite
- Use `fast-check` for property-based tests on pure functions with complex input domains
- All tests must pass and TypeScript must compile before committing
