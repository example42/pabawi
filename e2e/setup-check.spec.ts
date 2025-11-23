import { test, expect } from '@playwright/test';

/**
 * Setup verification test
 *
 * This test verifies that the application starts correctly and
 * the basic infrastructure is working before running full E2E tests.
 */
test.describe('Setup Verification', () => {
  test('should load the application homepage', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Verify page loaded successfully
    expect(page.url()).toContain('localhost:3000');

    // Verify page has content
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('should have navigation elements', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Look for navigation elements (links or buttons)
    const navElements = page.locator('nav, header, [role="navigation"]');

    // Should have some navigation
    const count = await navElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should respond to API health check', async ({ page }) => {
    // Try to access the API
    const response = await page.request.get('/api/inventory');

    // Should get a response (even if it's an error, it means server is running)
    expect(response.status()).toBeLessThan(500);
  });
});
