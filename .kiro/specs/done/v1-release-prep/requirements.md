# Requirements Document — Pabawi v1.0.0 Release Preparation

## Introduction

This document defines the requirements for preparing Pabawi v1.0.0, the first stable release. The primary goal is to refactor the configuration system to a read-only model (removing per-user DB-stored config overrides in favor of `.env` as the single source of truth), fix and expand test coverage, update all documentation, clean up dead code and unused dependencies, and ensure the entire codebase passes linting, type checking, and pre-commit hooks.

## Glossary

- **Pabawi**: The web-based infrastructure command and control application being released as v1.0.0.
- **ConfigService**: The backend service (`backend/src/config/ConfigService.ts`) that parses and validates `backend/.env` using Zod schemas.
- **IntegrationConfigService**: The backend service (`backend/src/services/IntegrationConfigService.ts`) that provides CRUD operations for per-user integration configurations stored in the `integration_configs` database table. To be removed.
- **IntegrationConfigPage**: The frontend page (`frontend/src/pages/IntegrationConfigPage.svelte`) that currently provides a CRUD UI for managing per-user integration configs. To be replaced with a read-only integration status dashboard.
- **IntegrationConfigRouter**: The Express route handler (`backend/src/routes/integrationConfig.ts`) that exposes CRUD endpoints at `/api/config/integrations`. To be removed.
- **SetupGuide_Component**: Any of the eight frontend setup guide components (BoltSetupGuide, PuppetdbSetupGuide, ProxmoxSetupGuide, AWSSetupGuide, SSHSetupGuide, HieraSetupGuide, PuppetserverSetupGuide, AnsibleSetupGuide) that currently save configuration to the database.
- **IntegrationSetupPage**: The frontend page (`frontend/src/pages/IntegrationSetupPage.svelte`) that renders the appropriate SetupGuide_Component based on the URL parameter.
- **Integration_Status_Dashboard**: The new read-only page that replaces IntegrationConfigPage, showing which integrations are active and their connection status.
- **Env_Snippet_Wizard**: The new behavior of SetupGuide_Components where they generate `.env` configuration snippets for users to copy-paste instead of saving to the database.
- **Test_Connection_Endpoint**: Backend endpoints that verify connectivity to external services (Proxmox, AWS) without modifying configuration.
- **Integration_Configs_Table**: The `integration_configs` database table created by migration `009_integration_configs.sql`. To be removed.
- **Pre_Commit_Hooks**: The set of pre-commit checks configured in `.pre-commit-config.yaml` including ESLint, tsc, hadolint, markdownlint, shellcheck, detect-secrets, and conventional commits.

## Requirements

### Requirement 1: Remove IntegrationConfigService and Database Table

**User Story:** As a maintainer, I want to remove the per-user database-stored configuration system, so that `.env` becomes the single source of truth for all integration settings.

#### Acceptance Criteria

1. WHEN Pabawi v1.0.0 starts, THE ConfigService SHALL load all integration configuration exclusively from the `backend/.env` file.
2. THE Pabawi backend SHALL NOT contain the IntegrationConfigService class or its associated type definitions file (`IntegrationConfigService.types.ts`).
3. THE Pabawi backend SHALL NOT contain the IntegrationConfigRouter or any CRUD endpoints at `/api/config/integrations`.
4. WHEN the database is initialized, THE DatabaseService SHALL apply a migration that drops the `integration_configs` table and its associated indexes.
5. THE server startup code (`server.ts`) SHALL NOT instantiate IntegrationConfigService or pass it to any integration plugin initialization.
6. WHEN the Proxmox integration initializes, THE Pabawi backend SHALL use only the `.env`-sourced configuration from ConfigService without merging database-stored overrides.
7. WHEN the AWS integration initializes, THE Pabawi backend SHALL use only the `.env`-sourced configuration from ConfigService without merging database-stored overrides.

### Requirement 2: Convert IntegrationConfigPage to Read-Only Status Dashboard

**User Story:** As an operator, I want to see which integrations are active and their connection status at a glance, so that I can verify my infrastructure setup without modifying configuration through the web UI.

#### Acceptance Criteria

1. THE Integration_Status_Dashboard SHALL display each registered integration with its name, enabled/disabled status, and connection health indicator.
2. WHEN the Integration_Status_Dashboard loads, THE Pabawi frontend SHALL fetch integration status from the existing `/api/integrations/status` endpoint.
3. THE Integration_Status_Dashboard SHALL NOT provide any form fields, save buttons, delete buttons, or other UI elements that allow modifying integration configuration.
4. WHEN an integration is enabled and healthy, THE Integration_Status_Dashboard SHALL display a green status indicator for that integration.
5. WHEN an integration is disabled or unreachable, THE Integration_Status_Dashboard SHALL display a red or gray status indicator for that integration.
6. WHERE the Proxmox integration is enabled, THE Integration_Status_Dashboard SHALL display a "Test Connection" button that triggers a connectivity check.
7. WHERE the AWS integration is enabled, THE Integration_Status_Dashboard SHALL display a "Test Connection" button that triggers a connectivity check.

### Requirement 3: Convert Setup Guides to Env Snippet Wizards

**User Story:** As an operator setting up Pabawi for the first time, I want the setup guides to generate `.env` configuration snippets that I can copy-paste into my configuration file, so that I can configure integrations without the web UI writing to a database.

#### Acceptance Criteria

1. WHEN a user completes a SetupGuide_Component form, THE Env_Snippet_Wizard SHALL generate a formatted `.env` snippet containing the relevant environment variable assignments.
2. THE Env_Snippet_Wizard SHALL provide a "Copy to Clipboard" button that copies the generated `.env` snippet to the system clipboard.
3. THE Env_Snippet_Wizard SHALL NOT call any backend API endpoint to save configuration to the database.
4. WHEN a user fills in the Proxmox setup wizard, THE Env_Snippet_Wizard SHALL generate environment variables including `PROXMOX_ENABLED`, `PROXMOX_HOST`, `PROXMOX_PORT`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, and SSL settings.
5. WHEN a user fills in the AWS setup wizard, THE Env_Snippet_Wizard SHALL generate environment variables including `AWS_ENABLED`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.
6. WHEN a user fills in any SetupGuide_Component, THE Env_Snippet_Wizard SHALL display instructions directing the user to paste the snippet into `backend/.env` and restart the application.
7. THE Env_Snippet_Wizard SHALL mask sensitive values (tokens, passwords, secret keys) in the preview display while keeping the full values in the clipboard copy.

### Requirement 4: Remove Frontend Integration Config API Functions

**User Story:** As a maintainer, I want to remove all frontend API functions related to integration config CRUD operations, so that the frontend codebase does not reference deleted backend endpoints.

#### Acceptance Criteria

1. THE Pabawi frontend API client (`frontend/src/lib/api.ts`) SHALL NOT contain the `saveIntegrationConfig`, `getIntegrationConfig`, `getIntegrationConfigs`, or `deleteIntegrationConfig` functions.
2. THE Pabawi frontend API client SHALL NOT contain the `saveProxmoxConfig` function or the deprecated wrapper that calls `saveIntegrationConfig`.
3. THE Pabawi frontend SHALL NOT contain the `IntegrationConfigRecord` type definition used by the removed CRUD operations.
4. WHEN the frontend is compiled, THE TypeScript compiler SHALL report zero errors related to missing integration config API references.

### Requirement 5: Fix All Existing Broken Tests

**User Story:** As a maintainer, I want all existing tests to pass, so that the v1.0.0 release has a verified baseline of correctness.

#### Acceptance Criteria

1. WHEN `npm test` is executed from the project root, THE test runner SHALL report zero test failures across both backend and frontend workspaces.
2. WHEN `npm run lint` is executed from the project root, THE linter SHALL report zero errors across both backend and frontend workspaces.
3. WHEN `tsc --noEmit` is executed in both the backend and frontend workspaces, THE TypeScript compiler SHALL report zero type errors.
4. IF a test failure is caused by the configuration system refactor (Requirements 1-4), THEN THE test suite SHALL contain updated or replacement tests that validate the new read-only configuration behavior.

### Requirement 6: Add Missing Test Coverage

**User Story:** As a maintainer, I want comprehensive test coverage for core services and integration plugins, so that the v1.0.0 release has confidence in its correctness.

#### Acceptance Criteria

1. THE backend test suite SHALL contain unit tests for the ConfigService that verify `.env` parsing and Zod schema validation for all integration configuration blocks.
2. THE backend test suite SHALL contain unit tests for the IntegrationManager that verify plugin registration, lifecycle management, and graceful degradation when plugins fail to initialize.
3. THE frontend test suite SHALL contain component tests for the Integration_Status_Dashboard that verify read-only display of integration status and the absence of configuration mutation controls.
4. THE frontend test suite SHALL contain component tests for at least two Env_Snippet_Wizard components (Proxmox and one other) that verify correct `.env` snippet generation and clipboard copy behavior.
5. WHEN tests that were previously testing IntegrationConfigService CRUD operations exist, THE test suite SHALL have those tests removed or replaced with tests for the new read-only behavior.

### Requirement 7: Update Documentation

**User Story:** As a user or contributor, I want accurate and up-to-date documentation, so that I can install, configure, and contribute to Pabawi v1.0.0 correctly.

#### Acceptance Criteria

1. THE README.md SHALL reflect version 1.0.0, include accurate setup instructions, and remove any references to web-based integration configuration management.
2. THE configuration documentation (`docs/configuration.md`) SHALL describe `.env` as the single source of truth for all integration settings and remove references to database-stored config overrides.
3. THE API documentation (`docs/api.md`, `docs/api-endpoints-reference.md`, `docs/integrations-api.md`) SHALL NOT reference the `/api/config/integrations` CRUD endpoints.
4. THE setup guide documentation for each integration (`docs/integrations/*.md`) SHALL describe the `.env`-based configuration approach and reference the web UI setup wizard as a helper for generating `.env` snippets.
5. THE architecture documentation (`docs/architecture.md`) SHALL accurately describe the configuration flow as `.env` → ConfigService → integration plugins, without mentioning IntegrationConfigService or database-stored overrides.
6. THE Docker deployment guide (`docs/docker-deployment.md`) SHALL include accurate instructions for passing `.env` configuration to containers.
7. THE CHANGELOG.md SHALL contain a v1.0.0 entry summarizing the configuration system refactor, test improvements, documentation updates, and any breaking changes from v0.10.0.

### Requirement 8: Clean Up Dead Code and Unused Dependencies

**User Story:** As a maintainer, I want the codebase free of dead code and unused dependencies, so that the v1.0.0 release is lean and maintainable.

#### Acceptance Criteria

1. THE Pabawi backend SHALL NOT contain any source files, type definitions, or test files related to IntegrationConfigService that are no longer referenced.
2. THE Pabawi frontend SHALL NOT contain any components, pages, type definitions, or API functions related to integration config CRUD that are no longer referenced.
3. WHEN `npm ls` is executed in each workspace, THE dependency tree SHALL NOT contain packages that are imported by zero source files in that workspace.
4. THE Pabawi backend SHALL NOT contain commented-out code blocks larger than 5 lines that reference removed functionality.
5. THE frontend component barrel export (`frontend/src/components/index.ts`) SHALL NOT export components that have been removed or renamed.

### Requirement 9: Update Version to 1.0.0

**User Story:** As a release manager, I want all version references updated to 1.0.0, so that the release is consistently versioned across all artifacts.

#### Acceptance Criteria

1. THE root `package.json` SHALL specify version `1.0.0`.
2. THE `backend/package.json` SHALL specify version `1.0.0`.
3. THE `frontend/package.json` SHALL specify version `1.0.0`.
4. THE product steering document (`.kiro/steering/product.md`) SHALL reference version `v1.0.0`.
5. WHEN the application serves the health check endpoint (`/api/health`), THE response SHALL include version `1.0.0`.
6. THE Docker image tags in `docker-compose.yml` SHALL reference the `1.0.0` version or `latest` tag.

### Requirement 10: Ensure Pre-Commit Hooks Pass

**User Story:** As a maintainer, I want all pre-commit hooks to pass on the entire codebase, so that the v1.0.0 release meets all code quality gates.

#### Acceptance Criteria

1. WHEN `pre-commit run --all-files` is executed, THE Pre_Commit_Hooks SHALL report zero failures across all configured hooks.
2. WHEN ESLint runs as part of pre-commit, THE linter SHALL report zero errors in both backend and frontend workspaces.
3. WHEN `tsc --noEmit` runs as part of pre-commit for both workspaces, THE TypeScript compiler SHALL report zero type errors.
4. WHEN `detect-secrets` runs as part of pre-commit, THE scanner SHALL report zero new secrets (false positives addressed with `pragma: allowlist secret` comments).
5. WHEN `markdownlint` runs as part of pre-commit, THE linter SHALL report zero errors across all Markdown files.
6. WHEN `hadolint` runs as part of pre-commit, THE Dockerfile linter SHALL report zero errors across all Dockerfiles.

### Requirement 11: Update Docker Configurations

**User Story:** As a deployer, I want Docker configurations that work correctly with the v1.0.0 configuration model, so that containerized deployments use `.env` as the single source of truth.

#### Acceptance Criteria

1. THE Dockerfile(s) SHALL build a working Pabawi v1.0.0 image that starts without errors when provided a valid `.env` file.
2. THE `docker-compose.yml` SHALL mount or pass the `.env` file to the container using `env_file` or volume mounts.
3. THE `.env.docker` example file SHALL contain accurate environment variable examples for all supported integrations, reflecting the v1.0.0 configuration model.
4. IF the `integration_configs` table removal migration runs inside a Docker container with an existing database, THEN THE migration SHALL complete without errors and the application SHALL start normally.

### Requirement 12: Maintain Test Connection Functionality

**User Story:** As an operator, I want to test connectivity to Proxmox and AWS from the web UI, so that I can verify my `.env` configuration is correct without leaving the browser.

#### Acceptance Criteria

1. WHERE the Proxmox integration is enabled, THE Integration_Status_Dashboard SHALL provide a "Test Connection" action that calls the existing Proxmox test connection endpoint.
2. WHEN the Proxmox test connection succeeds, THE Integration_Status_Dashboard SHALL display a success message with connection details.
3. WHEN the Proxmox test connection fails, THE Integration_Status_Dashboard SHALL display an error message with diagnostic information.
4. WHERE the AWS integration is enabled, THE Integration_Status_Dashboard SHALL provide a "Test Connection" action that calls the existing AWS test connection endpoint.
5. WHEN the AWS test connection succeeds, THE Integration_Status_Dashboard SHALL display a success message with connection details.
6. WHEN the AWS test connection fails, THE Integration_Status_Dashboard SHALL display an error message with diagnostic information.
7. THE test connection endpoints SHALL use only the `.env`-sourced configuration from ConfigService, without reading from the `integration_configs` database table.
