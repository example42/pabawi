# Tasks — Pabawi v1.0.0 Release Preparation

- [x] 1. Remove IntegrationConfigService and Database Table
  - [x] 1.1 Delete backend IntegrationConfigService files
    - Delete `backend/src/services/IntegrationConfigService.ts`
    - Delete `backend/src/services/IntegrationConfigService.types.ts`
    - Delete `backend/test/services/IntegrationConfigService.test.ts`
    - _Requirements: 1.2, 8.1_

  - [x] 1.2 Delete IntegrationConfigRouter and route tests
    - Delete `backend/src/routes/integrationConfig.ts`
    - Delete `backend/test/integrationConfig.routes.test.ts`
    - _Requirements: 1.3, 8.1_

  - [x] 1.3 Create migration to drop integration_configs table
    - Create `backend/src/database/migrations/010_drop_integration_configs.sql`
    - Content: `DROP TABLE IF EXISTS integration_configs;`
    - _Requirements: 1.4_

  - [x] 1.4 Remove IntegrationConfigService from server.ts
    - Remove import of `IntegrationConfigService`
    - Remove import of `createIntegrationConfigRouter`
    - Remove `IntegrationConfigService` instantiation
    - Remove `integrationConfigService.getEffectiveConfig("proxmox")` merge in Proxmox plugin init — use `proxmoxConfig` directly from ConfigService
    - Remove integration config router registration (`app.use(...)`)
    - Ensure Proxmox plugin receives config directly from `config.integrations.proxmox`
    - Ensure AWS plugin receives config directly from `config.integrations.aws` (verify no DB merge)
    - _Requirements: 1.5, 1.6, 1.7_

- [x] 2. Convert IntegrationConfigPage to Read-Only Status Dashboard
  - [x] 2.1 Rewrite IntegrationConfigPage.svelte as status dashboard
    - Remove all CRUD imports (`getIntegrationConfigs`, `getIntegrationConfig`, `saveIntegrationConfig`, `deleteIntegrationConfig`)
    - Fetch from `GET /api/integrations/status` on mount
    - Display each integration with name, icon, status indicator (green/yellow/red/gray)
    - Remove all form fields, save/delete buttons, add field button, field editing
    - Add "Test Connection" button for Proxmox and AWS (when enabled)
    - Wire test buttons to `testProxmoxConnection()` and `testAWSConnection()` (refactored to no-body calls)
    - Display test results (success/failure messages)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 12.1, 12.4_

  - [x] 2.2 Refactor test connection API functions
    - Update `testProxmoxConnection()` in `api.ts` to call `POST /api/integrations/proxmox/test` without sending config in body (backend reads from .env)
    - Update `testAWSConnection()` in `api.ts` similarly
    - Update backend Proxmox test endpoint to read config from ConfigService instead of request body
    - Update backend AWS test endpoint to read config from ConfigService instead of request body
    - _Requirements: 12.2, 12.3, 12.5, 12.6, 12.7_

- [x] 3. Convert Setup Guides to Env Snippet Wizards
  - [x] 3.1 Refactor ProxmoxSetupGuide.svelte
    - Remove `onMount` config loading from DB (`getIntegrationConfig('proxmox')`)
    - Remove "Save Configuration" button and `handleSaveConfiguration()` function
    - Remove "Test Connection" button (moved to Status Dashboard)
    - Remove imports of `saveIntegrationConfig`, `getIntegrationConfig`
    - Keep form fields for generating the `.env` snippet
    - Ensure `.env` snippet preview is prominent (already partially exists)
    - Add masking for sensitive values in preview (show `***` for password/token)
    - Add "Copy to Clipboard" button for the full snippet (already partially exists)
    - Add instructions: "Paste into `backend/.env` and restart the application"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

  - [x] 3.2 Refactor AWSSetupGuide.svelte
    - Same changes as 3.1 but for AWS-specific env vars
    - Remove `onMount` config loading, save/test buttons, DB API calls
    - Keep form fields and `.env` snippet generation
    - Ensure snippet includes `AWS_ENABLED`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
    - Add masking for sensitive values, copy button, instructions
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

  - [x] 3.3 Refactor remaining setup guides
    - Apply same pattern to: BoltSetupGuide, PuppetdbSetupGuide, SSHSetupGuide, HieraSetupGuide, PuppetserverSetupGuide, AnsibleSetupGuide
    - Remove any `saveIntegrationConfig`/`getIntegrationConfig` calls
    - Ensure each guide is a pure `.env` snippet wizard
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [x] 4. Remove Frontend Integration Config API Functions
  - [x] 4.1 Clean up api.ts
    - Remove `saveIntegrationConfig()` function
    - Remove `getIntegrationConfig()` function
    - Remove `getIntegrationConfigs()` function
    - Remove `deleteIntegrationConfig()` function
    - Remove `saveProxmoxConfig()` deprecated wrapper
    - Remove `saveAWSConfig()` deprecated wrapper
    - Remove `IntegrationConfigRecord` type
    - Verify no remaining imports of these functions across the frontend
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Fix all TypeScript compilation errors
    - Run `tsc --noEmit` in frontend workspace
    - Fix any broken imports or references to removed functions/types
    - Ensure zero type errors
    - _Requirements: 4.4_

- [x] 5. Fix Existing Broken Tests
  - [x] 5.1 Run test suite and fix failures
    - Run `npm test` from project root
    - Identify and fix test failures caused by the config refactor
    - Update test mocks that referenced IntegrationConfigService or its routes
    - Ensure all existing tests pass
    - _Requirements: 5.1, 5.4_

  - [x] 5.2 Fix lint and type errors
    - Run `npm run lint` and fix all errors
    - Run `tsc --noEmit` in both workspaces and fix all type errors
    - _Requirements: 5.2, 5.3_

- [x] 6. Add Missing Test Coverage
  - [x] 6.1 Add ConfigService property tests
    - Create/update `backend/test/config/ConfigService.test.ts`
    - Property test: for any valid env var combination, ConfigService produces valid AppConfig (Property 1)
    - Unit tests: specific integration config blocks, defaults, error cases
    - Tag: `// Feature: v1-release-prep, Property 1: ConfigService env parsing round-trip`
    - Use fast-check with minimum 100 iterations
    - _Requirements: 6.1_

  - [x] 6.2 Add IntegrationManager property tests
    - Create/update `backend/test/integrations/IntegrationManager.test.ts`
    - Property test: for any set of plugins with some failing, manager registers healthy ones (Property 8)
    - Unit tests: plugin registration, lifecycle, health checks
    - Tag: `// Feature: v1-release-prep, Property 8: IntegrationManager graceful degradation`
    - Use fast-check with minimum 100 iterations
    - _Requirements: 6.2_

  - [x] 6.3 Add Integration Status Dashboard tests
    - Create `frontend/src/pages/IntegrationConfigPage.test.ts`
    - Property tests: dashboard renders all integrations (Property 2), no mutation controls (Property 3), correct status colors (Property 4)
    - Unit tests: test connection button behavior, error states, loading states
    - Use fast-check with minimum 100 iterations
    - _Requirements: 6.3_

  - [x] 6.4 Add Env Snippet Wizard tests
    - Create `frontend/src/components/ProxmoxSetupGuide.test.ts`
    - Property tests: snippet contains required vars (Property 5), no save calls (Property 6), sensitive masking (Property 7)
    - Create `frontend/src/components/AWSSetupGuide.test.ts`
    - Property tests: snippet contains required vars (Property 5), no save calls (Property 6)
    - Use fast-check with minimum 100 iterations
    - _Requirements: 6.4_

  - [x] 6.5 Remove obsolete IntegrationConfigService tests
    - Verify `backend/test/services/IntegrationConfigService.test.ts` was deleted in task 1.1
    - Verify `backend/test/integrationConfig.routes.test.ts` was deleted in task 1.2
    - _Requirements: 6.5_

- [ ] 7. Update Documentation
  - [~] 7.1 Update README.md
    - Update version references to 1.0.0
    - Remove any references to web-based integration configuration management
    - Update setup instructions to reflect `.env`-only configuration
    - _Requirements: 7.1_

  - [~] 7.2 Update configuration and API docs
    - Update `docs/configuration.md` — `.env` as single source of truth, remove DB config override references
    - Update `docs/api.md`, `docs/api-endpoints-reference.md`, `docs/integrations-api.md` — remove `/api/config/integrations` CRUD endpoints
    - Update `docs/architecture.md` — config flow is `.env` → ConfigService → plugins, remove IntegrationConfigService
    - _Requirements: 7.2, 7.3, 7.5_

  - [~] 7.3 Update integration setup guides and Docker docs
    - Update `docs/integrations/*.md` — `.env`-based configuration, reference web UI wizard as snippet generator
    - Update `docs/docker-deployment.md` — accurate `.env` passing instructions
    - _Requirements: 7.4, 7.6_

  - [~] 7.4 Update CHANGELOG.md
    - Add v1.0.0 entry summarizing: config system refactor, IntegrationConfigService removal, setup wizard conversion, test improvements, documentation updates, breaking changes from v0.10.0
    - _Requirements: 7.7_

- [ ] 8. Clean Up Dead Code and Unused Dependencies
  - [~] 8.1 Verify all IntegrationConfigService references removed
    - Search codebase for any remaining references to IntegrationConfigService, IntegrationConfigRouter, integration_configs
    - Remove any commented-out code blocks > 5 lines referencing removed functionality
    - Check `frontend/src/components/index.ts` barrel export for removed components
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [~] 8.2 Check for unused dependencies
    - Run `npm ls` in each workspace
    - Identify and remove packages imported by zero source files
    - _Requirements: 8.3_

- [ ] 9. Update Version to 1.0.0
  - [~] 9.1 Bump version in all package.json files
    - Update `package.json` (root): `"version": "1.0.0"`
    - Update `backend/package.json`: `"version": "1.0.0"`
    - Update `frontend/package.json`: `"version": "1.0.0"`
    - _Requirements: 9.1, 9.2, 9.3_

  - [~] 9.2 Update version in other files
    - Update `.kiro/steering/product.md`: change `v0.10.0` to `v1.0.0`
    - Update health check endpoint in `server.ts` to include `version: "1.0.0"` in response
    - Verify `docker-compose.yml` image tag is `latest` (already correct)
    - _Requirements: 9.4, 9.5, 9.6_

- [ ] 10. Ensure Pre-Commit Hooks Pass
  - [~] 10.1 Run full pre-commit check
    - Run `pre-commit run --all-files`
    - Fix any ESLint errors in both workspaces
    - Fix any TypeScript type errors in both workspaces
    - Address any `detect-secrets` false positives with `pragma: allowlist secret` comments
    - Fix any markdownlint errors
    - Fix any hadolint errors in Dockerfiles
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 11. Review, Update, and Verify Docker Configurations
  - [~] 11.1 Update Dockerfile version labels and description
    - Update `LABEL org.opencontainers.image.version` from `"0.10.0"` to `"1.0.0"` in all three Dockerfiles (`Dockerfile`, `Dockerfile.alpine`, `Dockerfile.ubuntu`)
    - Update `LABEL org.opencontainers.image.description` in `Dockerfile.alpine` and `Dockerfile.ubuntu` from `"Web interface for Bolt automation tool"` to `"Puppet Ansible Bolt Awesome Web Interface"` (match main Dockerfile)
    - _Requirements: 9.6, 11.1_

  - [~] 11.2 Align integration ENV defaults across all Dockerfiles
    - `Dockerfile` (main) sets `ANSIBLE_ENABLED=false`, `PROXMOX_ENABLED=false`, `AWS_ENABLED=false` — but `Dockerfile.alpine` and `Dockerfile.ubuntu` are missing these
    - Add `ANSIBLE_ENABLED=false`, `PROXMOX_ENABLED=false`, `AWS_ENABLED=false`, `SSH_ENABLED=false` to the ENV block in `Dockerfile.alpine` and `Dockerfile.ubuntu`
    - Verify all Dockerfiles have consistent ENV defaults for all integrations
    - _Requirements: 11.1_

  - [~] 11.3 Fix Dockerfile.alpine and Dockerfile.ubuntu migration copy
    - `Dockerfile.alpine` and `Dockerfile.ubuntu` copy `schema.sql` but NOT the `migrations/` directory — they will fail to run migrations at startup
    - Replace `COPY --from=backend-builder ... /app/backend/src/database/schema.sql ./dist/database/` with `COPY --from=backend-builder ... /app/backend/src/database/migrations ./dist/database/migrations` (matching the main Dockerfile pattern)
    - Verify migration 010 (`DROP TABLE IF EXISTS integration_configs`) runs cleanly in all image variants
    - _Requirements: 11.1, 11.4_

  - [~] 11.4 Fix Dockerfile.alpine and Dockerfile.ubuntu production deps
    - Main `Dockerfile` has a separate `backend-deps` stage that installs `--omit=dev` for production node_modules (ensuring native modules like sqlite3 are built for target platform)
    - `Dockerfile.alpine` and `Dockerfile.ubuntu` copy node_modules from the build stage (includes dev deps and may have wrong platform binaries)
    - Add the `backend-deps` stage pattern from main Dockerfile to both `Dockerfile.alpine` and `Dockerfile.ubuntu`
    - _Requirements: 11.1_

  - [~] 11.5 Update .env.docker example file
    - Add missing integration examples: `PROXMOX_ENABLED`, `PROXMOX_HOST`, `PROXMOX_PORT`, `PROXMOX_TOKEN`, `AWS_ENABLED`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
    - Add `JWT_SECRET` placeholder with comment
    - Add `COMMAND_WHITELIST_ALLOW_ALL` setting
    - Verify all env var names match what ConfigService actually parses
    - Remove any references to DB-stored config overrides
    - _Requirements: 11.3_

  - [~] 11.6 Review and update docker-compose.yml
    - Verify `env_file` configuration correctly passes `.env` to the container
    - Add commented-out volume mounts for SSH keys, Ansible project directory (currently missing)
    - Verify health check matches the updated `/api/health` response (v1.0.0)
    - _Requirements: 11.2_

  - [~] 11.7 Review and update docker-entrypoint.sh
    - Verify `scripts/docker-entrypoint.sh` handles the case where `/data` directory doesn't exist yet (create it)
    - Ensure entrypoint is consistent across all Dockerfiles (main uses external script, alpine/ubuntu use inline heredoc — consider standardizing)
    - _Requirements: 11.1_

  - [~] 11.8 Update Docker deployment documentation
    - Update `docs/docker-deployment.md` to reflect v1.0.0 configuration model (`.env` as single source of truth)
    - Remove any references to web-based integration configuration or IntegrationConfigService
    - Add Proxmox and AWS integration examples to the Docker deployment guide (currently missing)
    - Add SSH and Ansible integration examples to the Docker deployment guide (currently missing)
    - Update the "Environment Variables" section to reference the updated configuration guide
    - Fix broken link: `./uppetserver-integration-setup.md` → `./integrations/puppetserver.md` (typo in Additional Resources)
    - _Requirements: 7.6, 11.3_

- [ ] 12. Audit Config Settings Consistency
  - [~] 12.1 Verify .env.example matches ConfigService parsing
    - Cross-reference every env var in `.env.example` and `backend/.env.example` against `ConfigService.parseIntegrationsConfig()` and `ConfigService.loadConfiguration()` — flag any vars listed in .env.example that ConfigService never reads, and any vars ConfigService reads that are missing from .env.example
    - Known gaps to investigate: `PROXMOX_USERNAME`, `PROXMOX_PASSWORD`, `PROXMOX_REALM`, `PROXMOX_TIMEOUT`, `PROXMOX_PRIORITY` are parsed by ConfigService but not in .env.example; `PROXMOX_TOKEN` format in .env.example (`user@realm!tokenid=token-value`) may not match what ConfigService expects
    - Verify SSH env vars: `loadSSHConfig()` reads `SSH_DEFAULT_USER` (required when enabled) but .env.example has it empty — add a comment or sample value
    - Verify AWS env vars: ConfigService reads `AWS_SESSION_TOKEN`, `AWS_ENDPOINT` but these are not in .env.example — add them as commented-out options
    - Ensure both `.env.example` files (root and `backend/`) stay in sync — they should be identical or one should be removed
    - _Requirements: 1.1, 7.2_

  - [~] 12.2 Verify setup guide wizards generate correct env var names
    - For each of the 8 setup guide components, verify the `.env` snippet they generate uses env var names that exactly match what ConfigService/loadSSHConfig actually parse
    - Cross-reference ProxmoxSetupGuide snippet vars against `ConfigService.parseIntegrationsConfig()` Proxmox section
    - Cross-reference AWSSetupGuide snippet vars against `ConfigService.parseIntegrationsConfig()` AWS section
    - Cross-reference SSHSetupGuide snippet vars against `loadSSHConfig()` in `backend/src/integrations/ssh/config.ts`
    - Cross-reference BoltSetupGuide snippet vars against `loadConfiguration()` bolt-related vars (`BOLT_PROJECT_PATH`, `BOLT_EXECUTION_TIMEOUT`, `COMMAND_WHITELIST`, etc.)
    - Cross-reference PuppetdbSetupGuide, PuppetserverSetupGuide, HieraSetupGuide, AnsibleSetupGuide snippet vars against their respective ConfigService parsing blocks
    - Flag any env vars in setup guides that don't exist in ConfigService, and any ConfigService vars missing from setup guides
    - _Requirements: 3.1, 3.4, 3.5_

  - [~] 12.3 Verify .env.docker matches ConfigService and Docker ENV defaults
    - Cross-reference `.env.docker` against ConfigService — ensure all env var names are correct and no stale/renamed vars exist
    - `.env.docker` is missing: Proxmox settings, AWS settings, `JWT_SECRET`, `AUTH_ENABLED`, `COMMAND_WHITELIST_ALLOW_ALL`, `COMMAND_WHITELIST`, streaming/cache/queue settings
    - `.env.docker` uses `DATABASE_PATH=/pabawi/data/pabawi.db` but Dockerfile sets `DATABASE_PATH=/data/pabawi.db` — resolve the inconsistency
    - Verify `.env.docker` paths reference container-internal paths (not host paths)
    - _Requirements: 11.3_

  - [~] 12.4 Reconcile Dockerfile ENV defaults with ConfigService defaults
    - Verify that ENV defaults in all three Dockerfiles match ConfigService's Zod schema defaults (port, host, database path, etc.)
    - Ensure no Dockerfile sets an ENV default that contradicts what ConfigService would produce from the same value
    - _Requirements: 11.1_

- [ ] 13. Final Validation
  - [~] 13.1 Run complete test suite
    - Run `npm test` — zero failures
    - Run `npm run lint` — zero errors
    - Run `tsc --noEmit` in both workspaces — zero type errors
    - Run `pre-commit run --all-files` — zero failures
    - _Requirements: 5.1, 5.2, 5.3, 10.1_
