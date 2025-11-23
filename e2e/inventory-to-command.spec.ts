import { test, expect } from '@playwright/test';

/**
 * E2E Test: Inventory view → Node detail → Command execution flow
 *
 * This test validates the complete user journey from viewing the inventory,
 * selecting a node, and executing a command on that node.
 *
 * Requirements: 1.1, 1.5, 2.1, 4.1
 */
test.describe('Inventory to Command Execution Flow', () => {
  test('should navigate from inventory to node detail and execute command', async ({ page }) => {
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

    // Find the command execution section
    const commandSection = page.locator('[data-testid="command-section"], [class*="command"]').first();
    await expect(commandSection).toBeVisible({ timeout: 5000 });

    // Enter a simple command (e.g., "pwd" or "echo test")
    const commandInput = page.locator('input[type="text"][placeholder*="command" i], textarea[placeholder*="command" i]').first();
    await commandInput.fill('pwd');

    // Click the execute button
    const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
    await executeButton.click();

    // Wait for execution results to appear
    await expect(page.locator('[data-testid="command-output"], [class*="output"], [class*="result"]')).toBeVisible({ timeout: 10000 });

    // Verify that output is displayed (should contain some text)
    const output = page.locator('[data-testid="command-output"], [class*="output"], [class*="result"]').first();
    await expect(output).not.toBeEmpty();
  });

  test('should handle command execution errors gracefully', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Wait for inventory and navigate to first node
    await expect(page.locator('h1, h2').filter({ hasText: /inventory/i })).toBeVisible({ timeout: 10000 });
    const firstNode = page.locator('[data-testid="node-item"], .node-item, [class*="node"]').first();
    await firstNode.click();

    // Wait for node detail page
    await page.waitForURL(/\/nodes\/.*/, { timeout: 5000 });

    // Enter an invalid command
    const commandInput = page.locator('input[type="text"][placeholder*="command" i], textarea[placeholder*="command" i]').first();
    await commandInput.fill('invalid_command_that_does_not_exist');

    // Execute the command
    const executeButton = page.locator('button').filter({ hasText: /execute|run/i }).first();
    await executeButton.click();

    // Verify error message is displayed
    await expect(page.locator('[data-testid="error-alert"], [class*="error"], [role="alert"]')).toBeVisible({ timeout: 10000 });
  });
});
