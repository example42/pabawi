import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Playwright configuration for E2E tests
 * See https://playwright.dev/docs/test-configuration
 *
 * The app under test is isolated from the developer's environment: a scratch
 * database, an SSH inventory of two deliberately unreachable hosts, and no
 * reachable Bolt/PuppetDB/cloud integration. Nothing here may touch real
 * infrastructure — see docs/internal/e2e-testing.md.
 */

/** Credentials the setup project seeds and the authenticated specs reuse. */
export const ADMIN = {
  username: "e2e_admin",
  email: "e2e_admin@pabawi.test",
  password: "E2eAdminPass123!", // pragma: allowlist secret
} as const;

export const BOOTSTRAP_TOKEN = "e2e-bootstrap-token-32-chars-padded"; // pragma: allowlist secret

export const STORAGE_STATE = resolve(import.meta.dirname, "e2e/.auth/admin.json");

/** The SSH fixture host that refuses connections immediately. */
export const REFUSED_HOST = "e2e-refused";

/**
 * The SSH fixture host that points at a port a test opens itself with a
 * listener that never speaks, so a run against it stays busy until its timeout.
 */
export const STALLED_HOST = "e2e-stalled";

/** The port `STALLED_HOST` points at. A test owns the listener on it. */
export const STALLED_PORT = 45001;

export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    // Seeds the admin account and saves its storageState. Everything
    // authenticated depends on it; the unauthenticated smoke test does not.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testIgnore: /auth\.setup\.ts/,
      testMatch: /.*\.authenticated\.spec\.ts/,
      dependencies: ["setup"],
    },
    // The unauthenticated contract, which must keep running without a session.
    // It depends on the setup project only because the scratch database starts
    // empty: until an administrator exists the SPA shows the setup wizard
    // rather than the sign-in form.
    {
      name: "anonymous",
      use: { ...devices["Desktop Chrome"] },
      // Everything that is not the setup project or an authenticated spec, so
      // a new spec file lands in a project instead of silently never running.
      testIgnore: /(auth\.setup|\.authenticated\.spec)\.ts/,
      dependencies: ["setup"],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev:fullstack",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    env: {
      // A scratch database per run: never the developer's dev database. The
      // setup project seeds it, so it must not survive between runs.
      DATABASE_PATH: resolve(import.meta.dirname, "e2e/.auth/e2e.db"),
      JWT_SECRET: "e2e-jwt-secret-not-a-real-secret-32ch", // pragma: allowlist secret
      PABAWI_BOOTSTRAP_TOKEN: BOOTSTRAP_TOKEN,
      // Inventory and execution come from the SSH fixture alone. Bolt is left
      // unconfigured so no bolt binary or sample project is required.
      BOLT_PROJECT_PATH: ".",
      SSH_ENABLED: "true",
      SSH_DEFAULT_USER: "e2e",
      SSH_CONFIG_PATH: resolve(import.meta.dirname, "e2e/fixtures/ssh/config"),
      SSH_HOST_KEY_CHECK: "false",
      // Seconds, not milliseconds: bounded so an unreachable host cannot hold
      // a run open for the whole suite.
      SSH_CONNECTION_TIMEOUT: "10",
      SSH_COMMAND_TIMEOUT: "30",
      COMMAND_WHITELIST_ALLOW_ALL: "true",
      // One slot, so a second submission is admitted as queued and can be
      // cancelled before it is ever dispatched.
      CONCURRENT_EXECUTION_LIMIT: "1",
      LOG_LEVEL: "warn",
      NODE_ENV: "test",
    },
  },
});
