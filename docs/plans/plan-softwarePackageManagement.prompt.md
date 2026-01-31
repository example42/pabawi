# Software Package Management Extension Plan

## Overview

Implement a new plugin for Pabawi to handle software package management across classic infrastructures (physical/virtual machines). This extends existing package routes into a proper plugin architecture, leveraging remote command execution tools (e.g., Bolt, Ansible) via IntegrationManager. Following backend refactoring, Bolt is no longer in a dedicated `src/bolt/` dir but integrated as a plugin under `integrations/bolt/`. Frontend has existing `PackageInstallInterface.svelte` for UI.

## Existing Code to Reuse

- `backend/src/routes/packages.ts`: Contains full package operation logic using remote execution (now via IntegrationManager).
- `backend/src/bolt/types.ts`: `ExecutionResult` type includes "package" for tracking (note: types may move to integrations/bolt/ after refactoring).
- IntegrationManager, CommandWhitelistService, ExecutionQueue, LoggerService, ExpertModeService, DatabaseService.
- Frontend: `src/components/PackageInstallInterface.svelte` for UI (extend for full integration).

## Implementation Steps

1. **Create Plugin Folder and Files**:
   - Add `backend/src/integrations/package-manager/` with `types.ts` and `PackageManagerPlugin.ts`.
   - Define types for PackageOperation and PackageResult.
   - Implement PackageManagerPlugin extending BasePlugin and ExecutionToolPlugin.
   - Methods: initialize, healthCheck, executePackageOperation.
   - Build commands based on OS (detect via facts from IntegrationManager), when using integrations which don't already abstract package management like remote-ssh (still to develop)
   - Directly use package abstractions layers when using integrations like Ansible and Bolt that already have package modules.
   - Add logging and expert mode support.
   - Wrap any output and errors into PackageResult, which are visible in the frontend, with detailed logging in expert mode.

2. **Refactor Existing Routes**:
   - Update `backend/src/routes/packages.ts` to fully use IntegrationManager for all operations (no direct Bolt calls post-refactoring).
   - Ensure consistency with other routes (asyncHandler, error handling).

3. **Register Plugin**:
   - In `backend/src/server.ts`, import and register PackageManagerPlugin with priority 10 (after Bolt plugin).

4. **Frontend Updates**:
   - Extend `PackageInstallInterface.svelte` to integrate with new backend API.
   - Add to router and pages as needed.

5. **Testing**:
   - Add unit tests in `backend/test/unit/package-manager/`.
   - Run `npm test --workspace=backend`.
   - Add E2E test in `e2e/` for package operations.
   - Test frontend integration.

## Effort Estimate

Low-Medium: Reuses existing code, but accounts for refactoring changes (e.g., Bolt plugin migration).

## Validation

- After changes, run build/tests/linters.
- Ensure no broken builds; verify IntegrationManager handles Bolt seamlessly.
