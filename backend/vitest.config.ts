import { defineConfig } from 'vitest/config';
import os from 'node:os';

// Cap parallelism to reduce CPU contention (bcrypt) and ephemeral-port
// exhaustion from supertest. Default vitest behaviour uses one worker per
// logical CPU which causes flaky timeouts on high-core machines.
const maxWorkers = Math.max(2, Math.min(8, Math.ceil(os.cpus().length / 2)));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/integrations/ssh/__tests__/**/*.test.ts', 'src/integrations/ansible/__tests__/**/*.test.ts', 'src/integrations/proxmox/__tests__/**/*.test.ts', 'src/integrations/aws/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    pool: 'forks',
    maxWorkers,
    minWorkers: 1,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-for-vitest', // pragma: allowlist secret
      PABAWI_LIFECYCLE_TOKEN: 'test-lifecycle-token', // pragma: allowlist secret
    },
  },
});
