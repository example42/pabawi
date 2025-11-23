# End-to-End Tests

This directory contains end-to-end (E2E) tests for Pabawi using Playwright.

## Overview

The E2E tests validate critical user flows through the application:

1. **Inventory to Command Execution** (`inventory-to-command.spec.ts`)
   - Navigate from inventory → node detail → execute command
   - Validate command execution results
   - Test error handling for invalid commands

2. **Inventory to Facts Gathering** (`inventory-to-facts.spec.ts`)
   - Navigate from inventory → node detail → gather facts
   - Validate facts display and formatting
   - Test error handling for unreachable nodes

3. **Inventory to Task Execution** (`inventory-to-task.spec.ts`)
   - Navigate from inventory → node detail → execute task
   - Validate task parameter forms
   - Test parameter validation

4. **Executions Page** (`executions-page.spec.ts`)
   - View execution history
   - Filter executions by status
   - View execution details
   - Test pagination

## Prerequisites

Before running E2E tests, ensure you have:

1. **Bolt CLI installed** and configured
2. **Valid Bolt inventory** in `bolt-project/inventory.yaml`
3. **Backend and frontend built** (tests will start the server automatically)

## Running Tests

### Run all E2E tests

```bash
npm run test:e2e
```

### Run tests with UI mode (interactive)

```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)

```bash
npm run test:e2e:headed
```

### Run tests in debug mode

```bash
npm run test:e2e:debug
```

### Run specific test file

```bash
npx playwright test e2e/inventory-to-command.spec.ts
```

### Run tests matching a pattern

```bash
npx playwright test --grep "command execution"
```

## Test Configuration

The Playwright configuration is in `playwright.config.ts` at the project root.

Key settings:

- **Base URL**: `http://localhost:3000`
- **Web Server**: Automatically starts `npm run dev:fullstack` before tests
- **Timeout**: 120 seconds for server startup
- **Browser**: Chromium (can be extended to Firefox, Safari)
- **Screenshots**: Captured on failure
- **Traces**: Captured on first retry

## Writing New Tests

When adding new E2E tests:

1. Create a new `.spec.ts` file in the `e2e/` directory
2. Use descriptive test names that explain the user flow
3. Add data-testid attributes to components for reliable selectors
4. Use flexible selectors that work with different UI implementations
5. Add appropriate timeouts for async operations
6. Document which requirements the test validates

Example:

```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature Flow', () => {
  test('should perform user action', async ({ page }) => {
    await page.goto('/');
    
    // Your test steps here
    await expect(page.locator('[data-testid="my-element"]')).toBeVisible();
  });
});
```

## Troubleshooting

### Tests fail with "Target closed" error

This usually means the server didn't start properly. Check:

- Backend and frontend build successfully
- Port 3000 is not already in use
- Bolt configuration is valid

### Tests timeout waiting for elements

The UI might have changed. Update selectors to match current implementation:

- Check for `data-testid` attributes
- Use flexible selectors (class patterns, text content)
- Increase timeout if operations are legitimately slow

### Server doesn't start

Check the web server configuration in `playwright.config.ts`:

- Verify the command is correct
- Check the URL is accessible
- Increase timeout if needed

## CI/CD Integration

To run E2E tests in CI:

```bash
# Install Playwright browsers
npx playwright install --with-deps chromium

# Run tests
npm run test:e2e
```

Set `CI=true` environment variable to enable CI-specific behavior:

- Retries on failure
- Single worker (no parallel execution)
- Fail on test.only

## Test Data

E2E tests use the actual Bolt inventory and configuration. Ensure:

- At least one node is defined in inventory
- Nodes are reachable (or tests handle unreachable nodes gracefully)
- Command whitelist allows basic commands like `pwd`, `echo`

## Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

This shows:

- Test results with pass/fail status
- Screenshots of failures
- Traces for debugging
- Execution timeline
