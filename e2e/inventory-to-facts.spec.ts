import { test, expect } from '@playwright/test';

/**
 * E2E Test: Inventory view → Node detail → Facts gathering flow
 *
 * This test validates the complete user journey from viewing the inventory,
 * selecting a node, and gathering facts from that node.
 *
 * Requirements: 1.1, 1.5, 2.1, 3.1
 */
test.describe('Inventory to Facts Gathering Flow', () => {
  test('should navigate from inventory to node detail and gather facts', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Wait for the inventory page to load
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });

    // Verify inventory list is displayed
    const inventoryList = page.locator('[data-testid="inventory-list"], .node-list, [class*="inventory"]').first();
    await expect(inventoryList).toBeVisible({ timeout: 5000 });

    // Click on the first node in the inventory
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await expect(firstNode).toBeVisible({ timeout: 5000 });
    await firstNode.click();

    // Wait for navigation to node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Verify node detail page is displayed
    await expect(page.locator('h1, h2').filter({ hasText: /node|detail/i })).toBeVisible({ timeout: 5000 });

    // Find and click the "Gather Facts" button
    const gatherFactsButton = page.locator('button').filter({ hasText: /gather facts|facts/i }).first();
    await expect(gatherFactsButton).toBeVisible({ timeout: 5000 });
    await gatherFactsButton.click();

    // Wait for facts to be gathered (this may take a while)
    // Look for loading indicator first
    const loadingIndicator = page.locator('[data-testid="loading"], [class*="loading"], [class*="spinner"]');
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });
    }

    // Verify facts are displayed
    const factsSection = page.locator('[data-testid="facts-viewer"], [class*="facts"]').first();
    await expect(factsSection).toBeVisible({ timeout: 30000 });

    // Verify that facts contain some data (should have OS info, networking, etc.)
    const factsContent = await factsSection.textContent();
    expect(factsContent).toBeTruthy();
    expect(factsContent!.length).toBeGreaterThan(0);
  });

  test('should display facts in a readable format', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Navigate to first node
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    // Wait for node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Gather facts
    const gatherFactsButton = page.locator('button').filter({ hasText: /gather facts|facts/i }).first();
    await gatherFactsButton.click();

    // Wait for facts to load
    await page.waitForTimeout(2000); // Give it time to start loading

    // Wait for loading to complete
    const loadingIndicator = page.locator('[data-testid="loading"], [class*="loading"], [class*="spinner"]');
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });
    }

    // Verify facts viewer is present
    const factsViewer = page.locator('[data-testid="facts-viewer"], [class*="facts"]').first();
    await expect(factsViewer).toBeVisible({ timeout: 5000 });

    // Check for collapsible sections or tree structure
    // Facts should be organized (e.g., OS, networking, memory)
    const factsText = await factsViewer.textContent();
    expect(factsText).toMatch(/os|operating|system|network|memory|processor/i);
  });

  test('should handle facts gathering errors gracefully', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Navigate to first node
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    // Wait for node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Gather facts
    const gatherFactsButton = page.locator('button').filter({ hasText: /gather facts|facts/i }).first();
    await gatherFactsButton.click();

    // Wait for either success or error
    await page.waitForTimeout(2000);

    // Check if error is displayed (in case node is unreachable)
    const errorAlert = page.locator('[data-testid="error-alert"], [class*="error"], [role="alert"]');
    const factsViewer = page.locator('[data-testid="facts-viewer"], [class*="facts"]');

    // Either facts should be displayed OR an error should be shown
    const hasError = await errorAlert.isVisible();
    const hasFacts = await factsViewer.isVisible();

    expect(hasError || hasFacts).toBeTruthy();
  });
});
