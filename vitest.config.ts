import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — frontend only.
 *
 * Without this, running `vitest` from the repository root picks up no config at
 * all, so frontend test files fail at import analysis because the Svelte plugin
 * is missing ("Failed to parse source ... invalid JS syntax" pointing at a
 * `.svelte` file). Delegating to frontend/vitest.config.ts keeps that file the
 * single source of truth for jsdom, the svelte plugin, and the setup file.
 *
 * Backend is deliberately NOT listed. Vitest workers inherit the launch
 * directory as their cwd (it does not follow the project root), and several
 * backend tests resolve paths relative to cwd — e.g.
 * test/integration/bolt-plugin-integration.test.ts reads
 * `process.env.BOLT_PROJECT_PATH || "./bolt-project"`, which finds the real
 * ./bolt-project at the repo root and inverts the test's expectations.
 * Run backend tests from backend/ (`npm run test --workspace=backend`), which
 * is what `npm test` already does.
 */
export default defineConfig({
  test: {
    projects: ['frontend/vitest.config.ts'],
  },
});
