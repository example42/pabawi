import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ADMIN, BOOTSTRAP_TOKEN, STORAGE_STATE } from '../playwright.config';

/**
 * Seeds the administrator and saves its authenticated storage state.
 *
 * Everything past the sign-in screen depends on this project. It talks to the
 * API rather than driving the setup form, because what the authenticated specs
 * need is a session, not coverage of the setup wizard.
 *
 * The scratch database survives between local runs, so a second run finds
 * setup already complete and only logs in. See docs/internal/e2e-testing.md.
 */
setup('seed the administrator and save its session', async ({ request, page, context }) => {
  const initialize = await request.post('/api/setup/initialize', {
    headers: { 'X-Pabawi-Bootstrap-Token': BOOTSTRAP_TOKEN },
    data: {
      username: ADMIN.username,
      email: ADMIN.email,
      password: ADMIN.password,
      firstName: 'E2E',
      lastName: 'Admin',
      allowSelfRegistration: false,
      defaultNewUserRole: null,
    },
  });

  // 409 means a previous run already seeded this database.
  expect([200, 201, 409]).toContain(initialize.status());

  const login = await request.post('/api/auth/login', {
    data: { username: ADMIN.username, password: ADMIN.password },
  });
  expect(login.status()).toBe(200);

  const session = (await login.json()) as {
    token: string;
    refreshToken: string;
    user: Record<string, unknown>;
  };
  expect(session.token).toBeTruthy();

  // The frontend reads its session from localStorage, so the state has to be
  // written on the app's own origin.
  await page.goto('/');
  await page.evaluate((stored) => {
    localStorage.setItem('authToken', stored.token);
    localStorage.setItem('refreshToken', stored.refreshToken);
    localStorage.setItem('authUser', stored.user);
  }, { token: session.token, refreshToken: session.refreshToken, user: JSON.stringify(session.user) });

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
});
