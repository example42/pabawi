import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, REFUSED_HOST } from '../playwright.config';

/**
 * Authenticated execution flows against the SSH fixture hosts, which are
 * deliberately unreachable: nothing here contacts real infrastructure.
 *
 * What it establishes that the unit and route suites cannot: the assembled
 * app, served as it ships, admits work promptly and renders the outcome the
 * backend actually recorded. The failure case is the point — the UI used to
 * report success for every completed run (finding I07).
 *
 * Rules for anything added here are in docs/internal/e2e-testing.md. The short
 * version: assert unconditionally, select on contracts, and prove the test can
 * fail before trusting it.
 */

async function authorize(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/auth/login', {
    data: { username: ADMIN.username, password: ADMIN.password },
  });
  expect(login.status()).toBe(200);
  return ((await login.json()) as { token: string }).token;
}

test.describe('Execution lifecycle', () => {
  test('admits a command promptly and shows the failure it really had', async ({ page, request }) => {
    const token = await authorize(request);

    const startedAt = Date.now();
    const submission = await request.post(`/api/nodes/${REFUSED_HOST}/command`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { command: 'echo pabawi-e2e', tool: 'ssh' },
    });
    const admissionMs = Date.now() - startedAt;

    // Admission returns an identifier before the provider has finished.
    expect(submission.status()).toBe(202);
    const { executionId } = (await submission.json()) as { executionId: string };
    expect(executionId).toBeTruthy();
    expect(admissionMs).toBeLessThan(5000);

    await page.goto('/executions');

    const row = page.getByTestId(`execution-row-${executionId}`);
    await expect(row).toBeVisible();

    // The host refuses the connection, so this run fails. A `complete` event
    // must not be rendered as success.
    await expect(row.getByTestId('execution-status')).toHaveText('Failed', { timeout: 30_000 });
  });

  test('renders a failed run as failed in its detail view', async ({ page, request }) => {
    const token = await authorize(request);

    const submission = await request.post(`/api/nodes/${REFUSED_HOST}/command`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { command: 'echo pabawi-e2e-detail', tool: 'ssh' },
    });
    expect(submission.status()).toBe(202);
    const { executionId } = (await submission.json()) as { executionId: string };

    await page.goto('/executions');
    const row = page.getByTestId(`execution-row-${executionId}`);
    await expect(row.getByTestId('execution-status')).toHaveText('Failed', { timeout: 30_000 });

    await row.click();

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Failed').first()).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Cancel Execution' })).toHaveCount(0);
  });
});
