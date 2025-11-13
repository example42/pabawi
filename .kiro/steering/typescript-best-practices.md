---
title: TypeScript Best Practices
inclusion: always
---

# TypeScript Best Practices

## Code Style
- Use strict TypeScript configuration (`strict: true`)
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable and function names
- Use PascalCase for classes and interfaces
- Use camelCase for variables and functions
- Use UPPER_SNAKE_CASE for constants

## Type Safety
- Always define return types for functions
- Use union types instead of `any`
- Prefer interfaces over type aliases for object shapes
- Use generic types for reusable components
- Enable `noImplicitAny` and `strictNullChecks`

## Error Handling
- Use Result/Either patterns for error handling
- Prefer throwing typed errors over generic Error
- Use optional chaining (`?.`) and nullish coalescing (`??`)

## Imports/Exports
- Use named exports over default exports
- Group imports: external libraries first, then internal modules
- Use absolute imports with path mapping when possible

## Testing
- Write unit tests for all public functions
- Use descriptive test names
- Mock external dependencies
- Aim for high test coverage (>80%)
- Run tests with minimal verbosity to avoid session timeouts
- Use grep/filter options to run specific tests when debugging
- Prefer `npm test -- --silent` or `yarn test --silent` for automated runs