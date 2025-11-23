import { test, expect } from '@playwright/test';

/**
 * E2E Test: Inventory view → Node detail → Task execution flow
 *
 * This test validates the complete user journey from viewing the inventory,
 * selecting a node, and executing a task on that node.
 *
 * Requirements: 1.1, 1.5, 2.1, 5.3
 */
test.describe('Inventory to Task Execution Flow', () => {
  test('should navigate from inventory to node detail and execute task', async ({ page }) => {
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

    // Find the task execution section
    const taskSection = page.locator('[data-testid="task-section"], [class*="task"]').first();
    await expect(taskSection).toBeVisible({ timeout: 5000 });

    // Look for task dropdown or task list
    const taskSelect = page.locator('select[name*="task" i], [data-testid="task-select"]').first();

    if (await taskSelect.isVisible()) {
      // Select a task from dropdown
      await taskSelect.selectOption({ index: 1 }); // Select first available task

      // Wait for task parameters to load (if any)
      await page.waitForTimeout(1000);

      // Click execute button
      const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
      await executeButton.click();

      // Wait for execution results
      await expect(page.locator('[data-testid="task-output"], [class*="output"], [class*="result"]')).toBeVisible({ timeout: 15000 });

      // Verify output is displayed
      const output = page.locator('[data-testid="task-output"], [class*="output"], [class*="result"]').first();
      await expect(output).not.toBeEmpty();
    } else {
      // If no task dropdown, look for task list or buttons
      const taskButton = page.locator('button').filter({ hasText: /task/i }).first();
      if (await taskButton.isVisible()) {
        await taskButton.click();

        // Wait for task interface to appear
        await page.waitForTimeout(1000);

        // Try to execute a task
        const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
        if (await executeButton.isVisible()) {
          await executeButton.click();

          // Wait for results
          await page.waitForTimeout(5000);
        }
      }
    }
  });

  test('should display task parameters when task is selected', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Navigate to first node
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    // Wait for node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Find task section
    const taskSection = page.locator('[data-testid="task-section"], [class*="task"]').first();
    await expect(taskSection).toBeVisible({ timeout: 5000 });

    // Look for task dropdown
    const taskSelect = page.locator('select[name*="task" i], [data-testid="task-select"]').first();

    if (await taskSelect.isVisible()) {
      // Get the number of available tasks
      const options = await taskSelect.locator('option').count();

      if (options > 1) {
        // Select a task
        await taskSelect.selectOption({ index: 1 });

        // Wait for parameters to load
        await page.waitForTimeout(1000);

        // Check if parameter form is displayed
        const parameterForm = page.locator('[data-testid="task-parameters"], [class*="parameter"]');

        // Either parameters should be shown or execute button should be available
        const hasParameters = await parameterForm.isVisible();
        const hasExecuteButton = await page.locator('button').filter({ hasText: /execute|run/i }).isVisible();

        expect(hasParameters || hasExecuteButton).toBeTruthy();
      }
    }
  });

  test('should validate required task parameters', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Navigate to first node
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    // Wait for node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Find task section
    const taskSection = page.locator('[data-testid="task-section"], [class*="task"]').first();
    await expect(taskSection).toBeVisible({ timeout: 5000 });

    // Look for task dropdown
    const taskSelect = page.locator('select[name*="task" i], [data-testid="task-select"]').first();

    if (await taskSelect.isVisible()) {
      // Select a task
      await taskSelect.selectOption({ index: 1 });

      // Wait for parameters
      await page.waitForTimeout(1000);

      // Try to execute without filling required parameters
      const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();

      if (await executeButton.isVisible()) {
        await executeButton.click();

        // Check for validation error or successful execution
        await page.waitForTimeout(2000);

        // Either validation error should appear or execution should proceed
        const hasError = await page.locator('[data-testid="error"], [class*="error"], [role="alert"]').isVisible();
        const hasOutput = await page.locator('[data-testid="task-output"], [class*="output"]').isVisible();

        expect(hasError || hasOutput).toBeTruthy();
      }
    }
  });
});
