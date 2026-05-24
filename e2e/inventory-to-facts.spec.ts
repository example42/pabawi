import { test, expect } from '@playwright/test';

/**
 * E2E Test: Inventory view → Node detail → Facts gathering flow
 *
 * Validates the on-demand facts UX: opening a node loads quickly without
 * auto-fetching, the Facts tab exposes one card per integration, and the
 * user can request facts via the per-source "Load facts" or bulk "Load all"
 * buttons.
 *
 * Requirements: 1.1, 1.5, 2.1, 3.1
 */
test.describe('Inventory to Facts on-demand flow', () => {
  test('should navigate from inventory to node detail and load facts on demand', async ({ page }) => {
    await page.goto('/');

    // Wait for the inventory page to load
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });

    // Click the first node in the inventory
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await expect(firstNode).toBeVisible({ timeout: 5000 });
    await firstNode.click();

    // Wait for navigation to node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Switch to the Facts tab (no auto-fetching now: facts only load on demand)
    const factsTab = page.locator('button, a').filter({ hasText: /^\s*facts\s*$/i }).first();
    await expect(factsTab).toBeVisible({ timeout: 5000 });
    await factsTab.click();

    // Each integration card surfaces a "Load facts" button while idle.
    const loadFactsButton = page.locator('button').filter({ hasText: /load facts/i }).first();
    await expect(loadFactsButton).toBeVisible({ timeout: 5000 });
    await loadFactsButton.click();

    // After at least one source loads, the source-view toggle ("Per Source",
    // "All", "Merged") appears. Use the All button as a proof-of-load.
    const allViewButton = page.locator('button').filter({ hasText: /^\s*all\s*$/i }).first();
    await expect(allViewButton).toBeVisible({ timeout: 30000 });
  });

  test('should display facts in a readable format after a Load all', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Open the Facts tab and trigger a bulk load.
    const factsTab = page.locator('button, a').filter({ hasText: /^\s*facts\s*$/i }).first();
    await factsTab.click();

    const loadAllButton = page.locator('button').filter({ hasText: /load all/i }).first();
    await expect(loadAllButton).toBeVisible({ timeout: 5000 });
    await loadAllButton.click();

    // Once data lands, the toggle group exposes the All view. Click it.
    const allViewButton = page.locator('button').filter({ hasText: /^\s*all\s*$/i }).first();
    await expect(allViewButton).toBeVisible({ timeout: 30000 });
    await allViewButton.click();

    // The All view renders an "All facts (per source)" panel.
    const allHeading = page.locator('text=/all facts \\(per source\\)/i').first();
    await expect(allHeading).toBeVisible({ timeout: 10000 });

    // The panel contents should reference recognisable fact families when
    // any source returned data.
    const factsRegion = page.locator('[data-testid="facts-viewer"], [class*="facts"]').first();
    await expect(factsRegion).toBeVisible({ timeout: 5000 });
    const factsText = await factsRegion.textContent();
    expect(factsText).toMatch(/os|operating|system|network|memory|processor|node|hostname/i);
  });

  test('should surface per-source errors without breaking the page', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    const factsTab = page.locator('button, a').filter({ hasText: /^\s*facts\s*$/i }).first();
    await factsTab.click();

    const loadFactsButton = page.locator('button').filter({ hasText: /load facts/i }).first();
    await expect(loadFactsButton).toBeVisible({ timeout: 5000 });
    await loadFactsButton.click();

    // After the request settles, the card flips to either a Refresh button
    // (success) or a Retry button (error). Either is an acceptable terminal
    // state — what matters is the page didn't crash.
    const terminalAffordance = page.locator('button').filter({ hasText: /refresh|retry/i });
    await expect(terminalAffordance.first()).toBeVisible({ timeout: 30000 });
  });
});
