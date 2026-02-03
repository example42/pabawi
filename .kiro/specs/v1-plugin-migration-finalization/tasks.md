# Implementation Plan: Pabawi v1.0.0 Plugin Architecture

## Overview

This implementation plan covers the v1.0.0 release with reorganized priorities:

1. **Plugin Code Migration** - Complete migration of all plugin-specific code to `plugins/` directory
2. **Legacy 0.x Removal** - Remove all traces of legacy 0.x code from backend and frontend
3. **Node Detail Widgets** - Complete widget implementations for node detail pages
4. **UI Composition** - Dynamic page generation from plugin-provided widgets
5. **Live Node Journal** - On-demand journal populated from integration data
6. **API Versioning Cleanup** - Ensure clean v1 API structure

### Key Design Decision: Plugin Directory as Single Source of Truth

All plugin-specific code MUST reside in `plugins/native/{pluginName}/` directory. The `backend/src/integrations/` and `frontend/src/widgets/` directories should only contain shared infrastructure code (BasePlugin, CapabilityRegistry, etc.), not plugin-specific implementations.

## Tasks

### Phase 1: Complete Plugin Code Migration

- [x] 1. Migrate Backend Plugin Code to plugins/ Directory
  - [x] 1.1 Migrate BoltPlugin backend code
    - Move `backend/src/integrations/bolt/BoltPlugin.ts` to `plugins/native/bolt/backend/`
    - Move `backend/src/bolt/BoltService.ts` to `plugins/native/bolt/backend/services/`
    - Move `backend/src/bolt/types.ts` to `plugins/native/bolt/backend/`
    - Update all imports in the plugin to use relative paths
    - Create re-export from `plugins/native/bolt/backend/index.ts`
    - _Requirements: 1.4, 1.8, 15.1_
  
  - [x] 1.2 Migrate PuppetDBPlugin backend code
    - Move all files from `backend/src/integrations/puppetdb/` to `plugins/native/puppetdb/backend/`
    - Include: PuppetDBPlugin.ts, PuppetDBService.ts, PuppetDBClient.ts, CircuitBreaker.ts, RetryLogic.ts, types.ts
    - Update all imports in the plugin to use relative paths
    - Create re-export from `plugins/native/puppetdb/backend/index.ts`
    - _Requirements: 1.4, 1.8, 15.2_
  
  - [x] 1.3 Migrate PuppetserverPlugin backend code
    - Move all files from `backend/src/integrations/puppetserver/` to `plugins/native/puppetserver/backend/`
    - Include: PuppetserverPlugin.ts, PuppetserverService.ts, PuppetserverClient.ts, errors.ts, types.ts
    - Update all imports in the plugin to use relative paths
    - Create re-export from `plugins/native/puppetserver/backend/index.ts`
    - _Requirements: 1.4, 1.8, 15.3_
  
  - [x] 1.4 Migrate HieraPlugin backend code
    - Move all files from `backend/src/integrations/hiera/` to `plugins/native/hiera/backend/`
    - Include: HieraPlugin.ts, HieraPluginV1.ts, HieraService.ts, HieraParser.ts, HieraResolver.ts, HieraScanner.ts, CatalogCompiler.ts, CodeAnalyzer.ts, FactService.ts, ForgeClient.ts, PuppetfileParser.ts, types.ts
    - Update all imports in the plugin to use relative paths
    - Create re-export from `plugins/native/hiera/backend/index.ts`
    - _Requirements: 1.4, 1.8, 15.4_

- [ ] 2. Migrate Frontend Widget Code to plugins/ Directory
  - [ ] 2.1 Migrate Bolt frontend widgets
    - Move all files from `frontend/src/widgets/bolt/` to `plugins/native/bolt/frontend/`
    - Include: CommandExecutor.svelte, TaskRunner.svelte, TaskBrowser.svelte, InventoryViewer.svelte
    - Update widget imports and exports
    - _Requirements: 1.6, 5.1_
  
  - [ ] 2.2 Migrate PuppetDB frontend widgets
    - Move all files from `frontend/src/widgets/puppetdb/` to `plugins/native/puppetdb/frontend/`
    - Include: FactsExplorer.svelte, ReportsViewer.svelte, ReportsSummary.svelte, EventsViewer.svelte, CatalogViewer.svelte, NodeBrowser.svelte
    - Update widget imports and exports
    - _Requirements: 1.7, 5.2_
  
  - [ ] 2.3 Migrate Puppetserver frontend widgets
    - Move all files from `frontend/src/widgets/puppetserver/` to `plugins/native/puppetserver/frontend/`
    - Include: StatusDashboard.svelte, EnvironmentManager.svelte
    - Update widget imports and exports
    - _Requirements: 1.8, 5.3_
  
  - [ ] 2.4 Migrate Hiera frontend widgets
    - Move all files from `frontend/src/widgets/hiera/` to `plugins/native/hiera/frontend/`
    - Include: HieraExplorer.svelte, KeyLookup.svelte, HierarchyViewer.svelte, NodeHieraData.svelte, CodeAnalysis.svelte, KeyValuesGrid.svelte
    - Update widget imports and exports
    - _Requirements: 1.9, 5.4_

- [ ] 3. Update PluginLoader for New Directory Structure
  - [ ] 3.1 Update PluginLoader to load from plugins/ directory
    - Modify PluginLoader to scan `plugins/native/` and `plugins/external/`
    - Load plugin manifests from `plugin.json` files
    - Support configurable external plugins directory
    - _Requirements: 1.2, 1.5, 1.7_
  
  - [ ] 3.2 Update build system for plugin frontend code
    - Configure Vite to include plugin frontend components
    - Set up path aliases for plugin imports
    - Ensure plugin widgets are bundled correctly
    - _Requirements: 1.6_

- [ ] 4. Checkpoint - Plugin migration complete
  - Verify all 4 plugins load from new locations
  - Verify all tests pass
  - Verify existing functionality still works

### Phase 2: Legacy 0.x Code Removal

- [ ] 5. Remove Legacy Backend Code
  - [ ] 5.1 Remove legacy interfaces from types.ts
    - Remove `ExecutionToolPlugin`, `InformationSourcePlugin`, `IntegrationPlugin` interfaces
    - Remove `IntegrationConfig`, `PluginRegistration` types
    - Remove deprecated capability types
    - Keep only v1.x types: `BasePluginInterface`, `PluginCapability`, `PluginWidget`
    - _Requirements: 5.1, 5.4, 5.5, 5.6_
  
  - [ ] 5.2 Remove legacy IntegrationManager methods
    - Remove `getExecutionTool()`, `getInformationSource()` methods
    - Remove `getAllExecutionTools()`, `getAllInformationSources()` methods
    - Remove `executionTools` and `informationSources` Maps
    - Update any code that used these methods to use CapabilityRegistry
    - _Requirements: 5.2_
  
  - [ ] 5.3 Remove empty integration directories
    - Remove `backend/src/integrations/bolt/` directory (code moved to plugins/)
    - Remove `backend/src/integrations/puppetdb/` directory (code moved to plugins/)
    - Remove `backend/src/integrations/puppetserver/` directory (code moved to plugins/)
    - Remove `backend/src/integrations/hiera/` directory (code moved to plugins/)
    - Keep shared infrastructure: BasePlugin.ts, CapabilityRegistry.ts, IntegrationManager.ts, PluginLoader.ts, types.ts
    - _Requirements: 5.1_
  
  - [ ] 5.4 Remove legacy BoltService from backend/src/bolt/
    - Remove `backend/src/bolt/` directory (code moved to plugins/)
    - Update any imports that referenced this location
    - _Requirements: 5.1_

- [ ] 6. Remove Legacy Frontend Code
  - [ ] 6.1 Remove empty widget directories
    - Remove `frontend/src/widgets/bolt/` directory (code moved to plugins/)
    - Remove `frontend/src/widgets/puppetdb/` directory (code moved to plugins/)
    - Remove `frontend/src/widgets/puppetserver/` directory (code moved to plugins/)
    - Remove `frontend/src/widgets/hiera/` directory (code moved to plugins/)
    - Update `frontend/src/widgets/index.ts` to export from plugin locations
    - _Requirements: 5.7_
  
  - [ ] 6.2 Update frontend imports to use plugin paths
    - Update all component imports to reference `plugins/native/{plugin}/frontend/`
    - Update any hardcoded widget paths
    - _Requirements: 5.7_

- [ ] 7. Remove Legacy Route Files
  - [ ] 7.1 Identify and remove unversioned routes
    - Audit `backend/src/routes/` for unversioned route files
    - Remove routes that duplicate v1 API functionality
    - Keep only v1 routes under `/api/v1/`
    - _Requirements: 5.3_
  
  - [ ] 7.2 Update server.ts to only mount v1 routes
    - Remove any legacy route mounting
    - Ensure all routes are prefixed with `/api/v1/`
    - _Requirements: 4.1, 4.2_

- [ ] 8. Remove Legacy Test Files
  - [ ] 8.1 Remove .legacy test files
    - Remove `backend/test/integration/bolt-plugin-integration.test.ts.legacy`
    - Remove `backend/test/integration/integration-test-suite.test.ts.legacy`
    - Remove any other .legacy suffixed files
    - _Requirements: 5.1_
  
  - [ ] 8.2 Update test imports
    - Update test files to import from new plugin locations
    - Fix any broken test imports
    - _Requirements: 5.1_

- [ ] 9. Clean Up Documentation References
  - [ ] 9.1 Update copilot-instructions.md
    - Remove references to legacy `ExecutionToolPlugin`, `InformationSourcePlugin`
    - Update plugin development instructions for new directory structure
    - _Requirements: 5.1_
  
  - [ ] 9.2 Update architecture documentation
    - Update docs to reflect new plugin directory structure
    - Remove references to legacy patterns
    - _Requirements: 5.1_

- [ ] 10. Checkpoint - Legacy removal complete
  - Verify no legacy interfaces remain in codebase
  - Verify all tests pass
  - Verify no broken imports
  - Verify application starts and functions correctly

### Phase 3: Node Detail Widgets Implementation

- [ ] 11. Node Detail Widgets Implementation
  - [ ] 11.1 Create BoltPlugin node-detail widgets
    - Add CommandExecutor widget for `node-detail` slot
    - Add TaskRunner widget for `node-detail` slot
    - Add FactsViewer widget for `node-detail` slot
    - Reference existing Bolt node components from 0.x
    - _Requirements: 3.9, 15.5_
  
  - [ ] 11.2 Create PuppetDBPlugin node-detail widgets
    - Add FactsExplorer widget for `node-detail` slot
    - Add ReportsViewer widget for `node-detail` slot
    - Add EventsViewer widget for `node-detail` slot
    - Add CatalogViewer widget for `node-detail` slot
    - Reference existing PuppetDB node components from 0.x
    - _Requirements: 3.10, 15.5_
  
  - [ ] 11.3 Create PuppetserverPlugin node-detail widgets
    - Add CatalogCompilation widget for `node-detail` slot
    - Add EnvironmentInfo widget for `node-detail` slot
    - Add NodeStatus widget for `node-detail` slot
    - Reference existing Puppetserver node components from 0.x
    - _Requirements: 3.11, 15.5_
  
  - [ ] 11.4 Create HieraPlugin node-detail widgets
    - Add KeyLookup widget for `node-detail` slot
    - Add HierarchyViewer widget for `node-detail` slot
    - Add NodeHieraData widget for `node-detail` slot
    - Reference existing Hiera node components from 0.x
    - _Requirements: 3.12, 15.5_

- [ ] 12. Checkpoint - Node detail widgets complete
  - Ensure all tests pass
  - Verify all plugin widgets render in node detail page
  - Verify widget functionality matches 0.x behavior

### Phase 4: Frontend Page Implementation (UI Composition)

- [ ] 13. Frontend Pages with Widget Composition
  - [ ] 13.1 Create new HomePage with widget slots
    - Create new `frontend/src/pages/HomePage.svelte` using v1 patterns
    - Implement `home-summary` widget slot rendering
    - Fetch widgets from `/api/v1/widgets/slot/home-summary`
    - Add welcome section and system overview
    - Reference existing HomePage from 0.x for layout inspiration
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 13.2 Create IntegrationHomePage component
    - Create `frontend/src/pages/IntegrationHomePage.svelte`
    - Implement automatic tab generation from capability categories
    - Display plugin metadata with color theming
    - Include health status section and CLI reference
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_
  
  - [ ] 13.3 Create new NodeDetailPage with plugin tabs
    - Create new `frontend/src/pages/NodeDetailPage.svelte` using v1 patterns
    - Implement automatic tab generation from plugins with node-detail widgets
    - Add Summary widget aggregating data from all integrations
    - Add Journal tab for live NodeJournal timeline
    - Reference existing NodeDetailPage from 0.x for functionality
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 11.1, 11.2, 11.3, 11.5_

- [ ] 14. Checkpoint - Frontend pages complete
  - Ensure all tests pass
  - Verify HomePage renders home widgets
  - Verify IntegrationHomePage generates tabs correctly
  - Verify NodeDetailPage shows plugin tabs

### Phase 5: Live Node Journal Implementation

- [ ] 15. Live Node Journal Backend
  - [ ] 15.1 Define JournalEntry interface
    - Create `backend/src/services/NodeJournalService.ts`
    - Define JournalEntry type with: timestamp, source plugin, entry type, title, description, metadata
    - Entry types: `event`, `action`, `note`, `alert`
    - _Requirements: 3.1, 3.2_
  
  - [ ] 15.2 Implement live journal aggregation
    - Create method to fetch journal entries from all plugins on-demand
    - Each plugin provides a `getJournalEntries(nodeId)` capability
    - Aggregate and sort entries by timestamp
    - _Requirements: 3.1, 3.4, 3.5_
  
  - [ ] 15.3 Create v1 journal routes
    - Create `/api/v1/nodes/:id/journal` route (GET only - live fetch)
    - Add query parameter support for filtering (type, plugin, date range)
    - No POST endpoint needed (journal is read-only from integrations)
    - _Requirements: 4.8_
  
  - [ ] 15.4 Add journal capability to plugins
    - Add `bolt.journal.entries` capability to BoltPlugin (execution history)
    - Add `puppetdb.journal.entries` capability to PuppetDBPlugin (reports, events)
    - Add `puppetserver.journal.entries` capability to PuppetserverPlugin (catalog compilations)
    - Add `hiera.journal.entries` capability to HieraPlugin (lookups, scans)
    - _Requirements: 3.4, 3.5_

- [ ] 16. Live Node Journal Frontend
  - [ ] 16.1 Create NodeJournal timeline component
    - Create `frontend/src/components/NodeJournal.svelte`
    - Display journal entries in chronological timeline
    - Implement filtering by type, plugin, date range
    - Use plugin colors for entry identification
    - Show loading state while fetching from integrations
    - _Requirements: 3.7, 3.8, 13.5_
  
  - [ ] 16.2 Integrate journal into NodeDetailPage
    - Add "Journal" tab to NodeDetailPage
    - Fetch entries from `/api/v1/nodes/:id/journal` on tab activation
    - Support real-time refresh
    - _Requirements: 3.7_

- [ ] 17. Checkpoint - Live Node Journal complete
  - Ensure all tests pass
  - Verify journal entries are fetched from integrations
  - Verify filtering works correctly
  - Verify timeline displays correctly

### Phase 6: Widget System Enhancement

- [ ] 18. Widget System Enhancement
  - [ ] 18.1 Add new widget slots to CapabilityRegistry
    - Add `home-summary` and `node-journal` slots
    - Update widget slot type definitions
    - _Requirements: 6.6_
  
  - [ ] 18.2 Implement widget validation on registration
    - Validate requiredCapabilities exist when registering widget
    - Fail registration if capabilities are missing
    - _Requirements: 6.2_
  
  - [ ] 18.3 Implement widget priority sorting
    - Ensure widgets are returned sorted by priority (highest first)
    - _Requirements: 6.3_

- [ ] 19. Checkpoint - Widget system enhancement complete
  - Ensure all tests pass
  - Verify new slots are available
  - Verify widget validation works

### Phase 7: Final Integration and Polish

- [ ] 20. Final Integration
  - [ ] 20.1 Update routing configuration
    - Configure frontend router for new page structure
    - Add routes for `/integrations/:pluginName`
    - Ensure all navigation works correctly
    - _Requirements: 2.1, 11.6_
  
  - [ ] 20.2 Add health status indicators throughout UI
    - Add health indicators to HomeWidgets
    - Add health section to IntegrationHomePage
    - Add error states to plugin tabs on NodeDetailPage
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 14.1, 14.2_
  
  - [ ] 20.3 Implement color theming system
    - Create utility for generating light/dark color variants
    - Apply plugin colors consistently across UI
    - Support dark mode color adjustments
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.5_

- [ ] 21. Final Checkpoint - v1.0.0 complete
  - Ensure all tests pass
  - Verify all features work end-to-end
  - Verify no regressions from 0.x functionality
  - Review for any remaining legacy code

### Optional: Property Tests

These property tests can be added for additional validation but are not required for MVP:

- [ ]* Property test: Widget Rendering Correctness (Requirements 1.1, 1.2, 1.3, 1.5)
- [ ]* Property test: Tab Generation from Capabilities (Requirements 2.2, 2.3, 7.1, 7.2)
- [ ]* Property test: RBAC Permission Filtering (Requirements 2.6, 6.4, 7.3)
- [ ]* Property test: Widget Priority Sorting (Requirements 6.3)
- [ ]* Property test: Journal Entry Filtering (Requirements 3.8)
- [ ]* Property test: API Versioning Compliance (Requirements 4.1, 4.3)
- [ ]* Property test: Widget Registration Validation (Requirements 6.2)
- [ ]* Property test: Plugin Health State Display (Requirements 9.1, 9.2)
- [ ]* Property test: Node Detail Tab Generation (Requirements 3.2, 3.3)
- [ ]* Property test: Capability Category Label Transformation (Requirements 7.4)

## Notes

- Tasks marked with `*` are optional property tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- **Plugin Directory**: All plugin code must reside in `plugins/native/{pluginName}/`
- **Legacy Removal**: Priority is to remove all 0.x traces before adding new features
- **Live Journal**: No database storage - entries fetched on-demand from integrations
- **UI Composition**: Pages dynamically render widgets based on plugin registrations
