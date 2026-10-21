import { test, expect, type Page } from '@playwright/test';

const localPassword = 'LocalTest123!'; // pragma: allowlist secret
const directoryPassword = 'x'; // pragma: allowlist secret

async function localLogin(page: Page, username = 'browseradmin'): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(localPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3186/');
}

test('LDAP uses short credentials, denies without fallback, and preserves an explicit provider choice', async ({ page }) => {
  const logins: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /auth\/(ldap\/)?login$/.test(request.url())) logins.push(request.url());
  });
  await page.goto('/login');
  await page.getByLabel('Sign in using').selectOption('ldap');
  await page.getByLabel('Username', { exact: true }).fill('missing');
  await page.getByLabel('Password', { exact: true }).fill(directoryPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Sign in using')).toHaveValue('ldap');
  expect(logins).toEqual(['http://127.0.0.1:3186/api/auth/ldap/login']);
  await page.getByLabel('Username', { exact: true }).fill('a');
  await page.getByLabel('Password', { exact: true }).fill(directoryPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3186/');
  expect(logins.every(url => url.endsWith('/ldap/login'))).toBe(true);
});

test('administrator manages mappings, sees failed diagnostic stages and reads nullable directory profiles', async ({ page }) => {
  await localLogin(page);
  await page.goto('/roles');
  const panel = page.getByRole('region', { name: 'LDAP administration' });
  await expect(panel.getByText('Operators to Viewer: Enabled')).toBeVisible();
  await panel.getByLabel('Search directory groups', { exact: true }).fill('empty');
  await panel.getByRole('button', { name: 'Search groups', exact: true }).click();
  await expect(panel.getByText('No directory groups found.')).toBeVisible();
  await panel.getByLabel('Search directory groups', { exact: true }).fill('op');
  await panel.getByRole('button', { name: 'Search groups', exact: true }).click();
  await panel.getByLabel('Directory group', { exact: true }).selectOption('10112233-4455-6677-8899-aabbccddeeff');
  await panel.getByLabel('Pabawi role', { exact: true }).selectOption('role-operator-001');
  await panel.getByRole('button', { name: 'Create mapping', exact: true }).click();
  await expect(panel.getByText('Operators to Operator: Enabled')).toBeVisible();
  await panel.getByLabel('Exact directory username (optional)').fill('outage');
  await panel.getByRole('button', { name: 'Run directory diagnostics', exact: true }).click();
  await expect(panel.getByText('tls: failed (2 ms), UNAVAILABLE')).toBeVisible();
  await panel.getByLabel('Exact directory username (optional)').fill('a');
  await panel.getByRole('checkbox', { name: 'Operators', exact: true }).check();
  await panel.getByRole('button', { name: 'Run directory diagnostics', exact: true }).click();
  await expect(panel.getByText('Matched selected groups: 1')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mappings.png'), fullPage: true });

  const operator = panel.getByRole('listitem').filter({ hasText: 'Operators to Operator: Enabled' });
  await operator.getByRole('button', { name: /Disable mapping/ }).click();
  await expect(panel.getByText('Operators to Operator: Disabled')).toBeVisible();
  const disabled = panel.getByRole('listitem').filter({ hasText: 'Operators to Operator: Disabled' });
  page.once('dialog', dialog => dialog.accept());
  await disabled.getByRole('button', { name: /Remove mapping/ }).click();
  await expect(panel.getByText('Operators to Operator: Disabled')).toHaveCount(0);

  await page.goto('/users');
  const row = page.getByRole('row').filter({ hasText: 'Directory A' });
  await expect(row.getByText('Not provided', { exact: true })).toBeVisible();
  await row.getByTitle('Edit user').click();
  await expect(page.getByRole('region', { name: 'Authentication source' })).toContainText('Corporate directory / browser-directory: a');
  await expect(page.getByText(/Directory profile fields are read-only/)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('profile.png'), fullPage: true });
});

test('non-administrator cannot enter the role management page', async ({ page }) => {
  await localLogin(page, 'browserviewer');
  await page.goto('/roles');
  await expect(page.getByRole('region', { name: 'LDAP administration' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Role Management', exact: true })).toHaveCount(0);
});
