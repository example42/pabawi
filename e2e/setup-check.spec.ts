import { test, expect } from '@playwright/test';

/**
 * Smoke test: the server boots, the SPA mounts, and the auth guard holds.
 *
 * This is deliberately the only E2E suite. It asserts the unauthenticated
 * contract only, so it needs no seeded user, no database fixture and no
 * reachable Bolt/PuppetDB inventory.
 *
 * Anything past the login screen requires an authenticated storageState and a
 * hermetic backend (scratch DATABASE_PATH + sample BOLT_PROJECT_PATH); see
 * docs/internal/e2e-testing.md before adding such a test here.
 *
 * Selectors are accessible names, not CSS class fragments. Keep it that way:
 * a selector that matches loosely is a test that fails to fail.
 */
test.describe('Setup Verification', () => {
  test('serves the SPA shell', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/pabawi/i);
  });

  test('renders the sign-in form when unauthenticated', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sign in to Pabawi' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('sends an unauthenticated deep link to the sign-in form', async ({ page }) => {
    await page.goto('/executions');

    await expect(page.getByRole('heading', { name: 'Sign in to Pabawi' })).toBeVisible();
  });

  test('rejects unauthenticated API reads with 401', async ({ request }) => {
    const response = await request.get('/api/inventory');

    expect(response.status()).toBe(401);
  });
});
