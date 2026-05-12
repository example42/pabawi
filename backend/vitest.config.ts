import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/integrations/ssh/__tests__/**/*.test.ts', 'src/integrations/ansible/__tests__/**/*.test.ts', 'src/integrations/proxmox/__tests__/**/*.test.ts', 'src/integrations/aws/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-for-vitest', // pragma: allowlist secret
      PABAWI_LIFECYCLE_TOKEN: 'test-lifecycle-token', // pragma: allowlist secret
    },
  },
});
