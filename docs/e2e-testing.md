# End-to-End Testing Guide

## Overview

Pabawi includes comprehensive end-to-end (E2E) tests using Playwright to validate critical user flows through the application. These tests simulate real user interactions with the web interface.

## Test Coverage

The E2E test suite covers the following critical user flows:

### 1. Inventory to Command Execution

- Navigate from inventory page to node detail
- Execute commands on target nodes
- View command output (stdout, stderr, exit code)
- Handle command execution errors

### 2. Inventory to Facts Gathering

- Navigate from inventory page to node detail
- Gather system facts from target nodes
- Display facts in readable format
- Handle unreachable nodes gracefully

### 3. Inventory to Task Execution

- Navigate from inventory page to node detail
- Select and execute Bolt tasks
- Configure task parameters dynamically
- Validate required parameters

### 4. Executions Page

- View execution history
- Filter executions by status
- View detailed execution results
- Display summary statistics
- Paginate through results

## Prerequisites

Before running E2E tests, ensure:

1. **Bolt CLI is installed** and available in PATH
2. **Valid Bolt inventory** exists at `bolt-project/inventory.yaml`
3. **At least one node** is defined in the inventory
4. **Backend and frontend are built** (or will be built automatically)
5. **Port 3000 is available** (or configure a different port)

## Installation

Playwright and its dependencies are installed as part of the project setup:

```bash
npm install
```

To install Playwright browsers:

```bash
npx playwright install chromium --with-deps
```

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

This runs all tests in headless mode and generates an HTML report.

### Interactive UI Mode

```bash
npm run test:e2e:ui
```

Opens Playwright's interactive UI where you can:

- Run tests individually
- See test execution in real-time
- Debug failing tests
- View traces and screenshots

### Headed Mode (Visible Browser)

```bash
npm run test:e2e:headed
```

Runs tests with a visible browser window, useful for debugging.

### Debug Mode

```bash
npm run test:e2e:debug
```

Runs tests in debug mode with Playwright Inspector for step-by-step debugging.

### Run Specific Test File

```bash
npx playwright test e2e/inventory-to-command.spec.ts
```

### Run Tests Matching a Pattern

```bash
npx playwright test --grep "command execution"
```

### Run Single Test

```bash
npx playwright test e2e/inventory-to-command.spec.ts:12
```

## Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

The report includes:

- Test results with pass/fail status
- Screenshots of failures
- Execution traces for debugging
- Timeline of test execution

## Configuration

E2E tests are configured in `playwright.config.ts`:

```typescript
{
  testDir: './e2e',
  baseURL: 'http://localhost:3000',
  webServer: {
    command: 'npm run dev:fullstack',
    url: 'http://localhost:3000',
    timeout: 120000
  }
}
```

### Customizing Configuration

To change the base URL:

```bash
BASE_URL=http://localhost:8080 npm run test:e2e
```

To skip automatic server startup (if server is already running):

```bash
npx playwright test --config=playwright.config.ts
```

## Writing New Tests

When adding new E2E tests:

1. Create a new `.spec.ts` file in the `e2e/` directory
2. Use descriptive test names
3. Add appropriate selectors (prefer `data-testid`)
4. Include error handling scenarios
5. Document which requirements the test validates

Example:

```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test('should perform user action', async ({ page }) => {
    await page.goto('/');
    
    // Wait for element
    await expect(page.locator('[data-testid="my-element"]')).toBeVisible();
    
    // Interact with element
    await page.locator('[data-testid="my-button"]').click();
    
    // Verify result
    await expect(page.locator('[data-testid="result"]')).toContainText('Success');
  });
});
```

## Troubleshooting

### Tests Fail with "Target closed" Error

**Cause:** Server didn't start properly.

**Solution:**

- Verify backend and frontend build successfully
- Check that port 3000 is not in use
- Ensure Bolt configuration is valid

### Tests Timeout Waiting for Elements

**Cause:** UI elements have changed or are slow to load.

**Solution:**

- Update selectors to match current UI
- Increase timeout for slow operations
- Check browser console for errors

### Server Doesn't Start

**Cause:** Configuration or dependency issues.

**Solution:**

- Run `npm run build` manually to check for errors
- Verify all dependencies are installed
- Check `playwright.config.ts` web server configuration

### Tests Pass Locally but Fail in CI

**Cause:** Environment differences.

**Solution:**

- Set `CI=true` environment variable
- Install system dependencies: `npx playwright install --with-deps`
- Increase timeouts for slower CI environments

## CI/CD Integration

To run E2E tests in CI/CD pipelines:

```bash
# Install Playwright and browsers
npm install
npx playwright install --with-deps chromium

# Run tests
CI=true npm run test:e2e
```

### GitHub Actions Example

```yaml
- name: Install dependencies
  run: npm install

- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Test Data

E2E tests use the actual Bolt inventory and configuration. Ensure:

- **At least one node** is defined in `bolt-project/inventory.yaml`
- **Nodes are reachable** (or tests handle unreachable nodes gracefully)
- **Command whitelist** allows basic commands like `pwd`, `echo`
- **Tasks are available** in Bolt modules

## Best Practices

1. **Use data-testid attributes** for reliable selectors
2. **Test user flows**, not implementation details
3. **Handle async operations** with proper waits
4. **Test error scenarios** as well as happy paths
5. **Keep tests independent** - each test should work in isolation
6. **Use descriptive test names** that explain the user flow
7. **Add comments** to explain complex test logic
8. **Clean up after tests** if they create data

## Performance

E2E tests can be slow. To optimize:

- Run tests in parallel (default in Playwright)
- Use `--grep` to run specific tests during development
- Mock external dependencies when possible
- Use `--headed` only when debugging
- Consider running full suite only in CI

## Limitations

Current E2E tests have some limitations:

- **Require real Bolt setup** - tests use actual Bolt CLI and inventory
- **Network dependent** - tests may fail if nodes are unreachable
- **No mocking** - tests interact with real backend and Bolt
- **Limited browser coverage** - only Chromium is configured

## Future Enhancements

Potential improvements:

- Add Firefox and Safari browser testing
- Mock Bolt CLI responses for faster tests
- Add visual regression testing
- Test expert mode features
- Test realtime streaming output
- Add accessibility testing
- Add performance testing

## Support

For issues with E2E tests:

1. Check the [troubleshooting section](#troubleshooting)
2. Review test logs and screenshots in `test-results/`
3. Run tests in debug mode: `npm run test:e2e:debug`
4. Check Playwright documentation: <https://playwright.dev>

## Related Documentation

- [E2E Tests README](../e2e/README.md) - Detailed test documentation
- [User Guide](user-guide.md) - Application usage guide
- [API Documentation](api.md) - API endpoint reference
- [Troubleshooting Guide](troubleshooting.md) - Common issues and solutions
