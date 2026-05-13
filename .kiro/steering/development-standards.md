---
title: Development Standards
inclusion: always
---

## Code Quality Standards

- No file > 300 lines — split into focused modules if larger
- No function > 50 lines — extract helpers if needed
- Never use `any` in TypeScript unless absolutely unavoidable with a comment explaining why
- Never swallow errors silently — always log with context before re-throwing
- Never use `console.log` — use `LoggerService` everywhere with structured metadata: `{ component, integration, operation }`
- Never access `process.env` directly — always use `ConfigService` (backed by Zod validation)
- Never create duplicate files with suffixes like `_fixed`, `_clean`, `_backup`, `_old`, `_new`, `_copy`, `.bak`

## Backend-Specific Patterns

- All async Express route handlers must be wrapped with `asyncHandler()` from `utils/`
- All route files export factory functions (`createXxxRouter(container)`) — resolve services from the DI container, never instantiate `LoggerService` or `ExpertModeService` directly
- All database access must go through `DatabaseService` (shared instance, never create new connections per file)
- Use typed error classes from `errors/` — never throw generic `Error` when a typed subclass exists
- Integration plugins are declared in `plugins/registry.ts` and registered via a single loop in `server.ts`
- Routes delegate to services; services use integrations or repositories — no business logic in route handlers

## Async Performance

- When multiple `await` calls are independent, always use `Promise.all`
- Never await independent operations sequentially — evaluate dependencies first
- Example: `const [a, b] = await Promise.all([fetchA(), fetchB()])` not `const a = await fetchA(); const b = await fetchB()`

## Pre-Work Before Refactors

- Before any structural refactor on a file > 300 LOC: first remove all dead props, unused exports, unused imports, and debug logs in a separate cleanup commit
- For changes touching > 5 files: break into explicit phases, complete Phase 1, verify, then proceed to Phase 2
- Each phase must touch no more than 5 files

## Dependency Management

- Justify each new dependency with clear business or technical value
- Prefer well-maintained libraries with active communities
- Remove unused dependencies regularly
- Use lock files to ensure consistent installations across environments

## File Management

- Maintain clean directory structures per the project layout in `structure.md`
- Use consistent naming conventions: `PascalCase` for classes/components, `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants
- Avoid temporary or backup files in version control

## Documentation Approach

- Update `/docs` only when the user explicitly requests it, or when code/interface changes require it
- Working documents, analysis, and AI-generated notes go in `/.kiro/` subdirectories
- Use inline comments only for non-obvious business logic — self-documenting code is preferred
- Never create summary markdown files after completing work unless explicitly asked

## Quality Gates (must pass before any commit)

- All tests pass (`npm test`)
- TypeScript compiles with no errors (`tsc --noEmit` in both workspaces)
- No lint warnings (`npm run lint` — zero warnings policy)
- All pre-commit hooks pass (`npm run precommit`)
