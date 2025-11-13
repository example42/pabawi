---
title: Testing Best Practices
inclusion: always
---

# Testing Best Practices

## Test Execution
- Always run tests with minimal verbosity to prevent session timeouts
- Use `--silent` or `--quiet` flags when available
- Filter tests with grep/pattern matching for focused testing
- Avoid running full test suites in automated contexts unless necessary

## Common Test Commands
```bash
# NPM/Yarn - Use silent mode
npm test -- --silent
yarn test --silent

# Jest - Minimal output
npm test -- --verbose=false --silent
npx jest --silent --passWithNoTests

# Pytest - Quiet mode
pytest -q
python -m pytest --tb=short -q

# Mocha - Minimal reporter
npx mocha --reporter min

# Filtering specific tests
npm test -- --grep "specific test"
npx jest --testNamePattern="specific test"
pytest -k "test_specific"
```

## Output Management
- Use summary reporters instead of verbose output
- Capture detailed logs only when tests fail
- Use `--bail` or `--maxfail=1` to stop on first failure
- Redirect verbose output to files when needed: `npm test > test-results.log 2>&1`

## Test Organization
- Group related tests to enable selective running
- Use test tags/categories for filtering
- Keep test names descriptive but concise
- Separate unit, integration, and e2e tests

## Performance
- Run tests in parallel when possible (`--parallel`, `--maxWorkers`)
- Use test caching mechanisms
- Mock external dependencies to speed up tests
- Skip slow tests in development with appropriate flags

## CI/CD Considerations
- Use different verbosity levels for local vs CI environments
- Capture test artifacts (coverage, reports) separately from console output
- Use test result formatters that work well with CI systems
- Consider splitting large test suites across multiple jobs