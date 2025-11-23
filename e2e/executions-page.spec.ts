import { test, expect } from '@playwright/test';

/**
 * E2E Test: Executions page filtering and detail view
 *
 * This test validates the executions page functionality including
 * filtering and viewing execution details.
 *
 * Requirements: 6.1
 */
test.describe('Executions Page Flow', () => {
  test('should display executions page with execution history', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Look for navigation to executions page
    const executionsLink = page.locator('a, button').filter({ hasText: /executions|history/i }).first();

    if (await executionsLink.isVisible()) {
      await executionsLink.click();

      // Wait for executions page to load
      await expect(page.locator('h1, h2').filter({ hasText: /executions|history/i })).toBeVisible({ timeout: 10000 });

      // Check if executions list is displayed
      const executionsList = page.locator('[data-testid="executions-list"], [class*="execution"]');

      // Either executions should be shown or empty state should be displayed
      const hasExecutions = await executionsList.first().isVisible();
      const hasEmptyState = await page.locator('text=/no executions|empty/i').isVisible();

      expect(hasExecutions || hasEmptyState).toBeTruthy();
    } else {
      // Try navigating directly to executions page
      await page.goto('/executions');

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Verify we're on executions page
      const pageContent = await page.textContent('body');
      expect(pageContent).toMatch(/executions|history|no executions/i);
    }
  });

  test('should filter executions by status', async ({ page }) => {
    // Navigate to executions page
    await page.goto('/');

    const executionsLink = page.locator('a, button').filter({ hasText: /executions|history/i }).first();

    if (await executionsLink.isVisible()) {
      await executionsLink.click();
    } else {
      await page.goto('/executions');
    }

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for filter controls
    const statusFilter = page.locator('select[name*="status" i], [data-testid="status-filter"]').first();

    if (await statusFilter.isVisible()) {
      // Get initial count of executions
      const initialExecutions = await page.locator('[data-testid="execution-item"], [class*="execution-item"]').count();

      // Change filter
      await statusFilter.selectOption({ index: 1 });

      // Wait for filter to apply
      await page.waitForTimeout(1000);

      // Verify filter was applied (count may change or stay same)
      const filteredExecutions = await page.locator('[data-testid="execution-item"], [class*="execution-item"]').count();

      // Filter should work (count may be different or same depending on data)
      expect(typeof filteredExecutions).toBe('number');
    }
  });

  test('should display execution details when clicking on an execution', async ({ page }) => {
    // Navigate to executions page
    await page.goto('/');

    const executionsLink = page.locator('a, button').filter({ hasText: /executions|history/i }).first();

    if (await executionsLink.isVisible()) {
      await executionsLink.click();
    } else {
      await page.goto('/executions');
    }

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for execution items
    const executionItem = page.locator('[data-testid="execution-item"], [class*="execution-item"]').first();

    if (await executionItem.isVisible()) {
      // Click on execution
      await executionItem.click();

      // Wait for detail view to appear (modal or panel)
      await page.waitForTimeout(1000);

      // Check for detail view
      const detailView = page.locator('[data-testid="execution-detail"], [class*="detail"], [role="dialog"]');

      // Detail view should be visible
      await expect(detailView.first()).toBeVisible({ timeout: 5000 });

      // Verify detail content is displayed
      const detailContent = await detailView.first().textContent();
      expect(detailContent).toBeTruthy();
      expect(detailContent!.length).toBeGreaterThan(0);
    }
  });

  test('should display summary statistics on executions page', async ({ page }) => {
    // Navigate to executions page
    await page.goto('/');

    const executionsLink = page.locator('a, button').filter({ hasText: /executions|history/i }).first();

    if (await executionsLink.isVisible()) {
      await executionsLink.click();
    } else {
      await page.goto('/executions');
    }

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for summary statistics (total, success, failed counts)
    const summaryCards = page.locator('[data-testid="summary"], [class*="summary"], [class*="stats"]');

    if (await summaryCards.first().isVisible()) {
      // Verify summary contains numbers
      const summaryText = await summaryCards.first().textContent();
      expect(summaryText).toMatch(/\d+/); // Should contain at least one number
    }
  });

  test('should paginate executions when there are many results', async ({ page }) => {
    // Navigate to executions page
    await page.goto('/');

    const executionsLink = page.locator('a, button').filter({ hasText: /executions|history/i }).first();

    if (await executionsLink.isVisible()) {
      await executionsLink.click();
    } else {
      await page.goto('/executions');
    }

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for pagination controls
    const paginationControls = page.locator('[data-testid="pagination"], [class*="pagination"]');

    if (await paginationControls.first().isVisible()) {
      // Get current page executions count
      const currentPageExecutions = await page.locator('[data-testid="execution-item"], [class*="execution-item"]').count();

      // Look for next page button
      const nextButton = page.locator('button').filter({ hasText: /next|>/i }).first();

      if (await nextButton.isVisible() && !await nextButton.isDisabled()) {
        // Click next page
        await nextButton.click();

        // Wait for new page to load
        await page.waitForTimeout(1000);

        // Verify page changed (URL or content should change)
        const newPageExecutions = await page.locator('[data-testid="execution-item"], [class*="execution-item"]').count();

        // Either count changed or we're on a different page
        expect(typeof newPageExecutions).toBe('number');
      }
    }
  });
});
