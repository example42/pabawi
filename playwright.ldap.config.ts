import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/ldap-ui',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/pabawi-ldap-p6-browser-results',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3186', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run build:frontend && node_modules/.bin/tsx backend/test/fixtures/ldap/ui-server.ts',
    url: 'http://127.0.0.1:3186/api/setup/status',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      JWT_SECRET: 'browser-fixture-signing-key-not-a-real-secret', // pragma: allowlist secret
      ENTRA_ID_ENABLED: 'false',
      LDAP_ENABLED: 'true',
      LDAP_DIRECTORY_ID: 'browser-directory',
      LDAP_DIRECTORY_TYPE: 'openldap',
      LDAP_DISPLAY_NAME: 'Corporate directory',
      LDAP_HOSTNAME: 'ldap.example.test',
      LDAP_BASE_DN: 'dc=example,dc=test',
      LDAP_ANONYMOUS_LOOKUP: 'true',
      LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
    },
  },
});
