# Implementation Plan: Pabawi v1.0.0 Plugin Architecture

## Overview

This implementation plan covers the complete v1.0.0 release including plugin system finalization, Node Journal feature, Events integration type, API versioning, and legacy code removal. Tasks are organized to build incrementally, with each phase building on the previous.

The implementation uses TypeScript for backend and Svelte with TailwindCSS for frontend, following the existing v1.x codebase patterns.

## Tasks

- [ ] 1. Plugin Directory Restructuring
  - [x] 1.1 Create new plugin directory structure
    - Create `plugins/` directory at project root with `native/` and `external/` subdirectories
    - Create plugin manifest schema (`plugin.json`) with Zod validation
    - Define standard plugin structure: `backend/`, `frontend/`, `cli/`, `config/`, `README.md`
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 1.2 Move BoltPlugin to new structure
    - Create `plugins/native/bolt/` directory
    - Move backend code from `backend/src/integrations/bolt/` to `plugins/native/bolt/backend/`
    - Create `plugins/native/bolt/frontend/` for widget components
    - Create `plugin.json` manifest for BoltPlugin
    - Update imports and exports
    - Verify BoltPlugin still initializes correctly
    - _Requirements: 1.4, 1.8, 15.1_
  
  - [x] 1.3 Move PuppetDBPlugin to new structure
    - Create `plugins/native/puppetdb/` directory
    - Move backend code from `backend/src/integrations/puppetdb/` to `plugins/native/puppetdb/backend/`
    - Create `plugins/native/puppetdb/frontend/` for widget components
    - Create `plugin.json` manifest for PuppetDBPlugin
    - Update imports and exports
    - Verify PuppetDBPlugin still initializes correctly
    - _Requirements: 1.4, 1.8, 15.2_
  
  - [x] 1.4 Move PuppetserverPlugin to new structure
    - Create `plugins/native/puppetserver/` directory
    - Move backend code from `backend/src/integrations/puppetserver/` to `plugins/native/puppetserver/backend/`
    - Create `plugins/native/puppetserver/frontend/` for widget components
    - Create `plugin.json` manifest for PuppetserverPlugin
    - Update imports and exports
    - Verify PuppetserverPlugin still initializes correctly
    - _Requirements: 1.4, 1.8, 15.3_
  
  - [x] 1.5 Move HieraPlugin to new structure
    - Create `plugins/native/hiera/` directory
    - Move backend code from `backend/src/integrations/hiera/` to `plugins/native/hiera/backend/`
    - Create `plugins/native/hiera/frontend/` for widget components
    - Create `plugin.json` manifest for HieraPlugin
    - Update imports and exports
    - Verify HieraPlugin still initializes correctly
    - _Requirements: 1.4, 1.8, 15.4_
  
  - [x] 1.6 Update PluginLoader for new directory structure
    - Modify PluginLoader to scan `plugins/native/` and `plugins/external/`
    - Add plugin manifest loading and validation
    - Update plugin discovery to use manifest files
    - Configure build system to include plugin frontend code
    - _Requirements: 1.2, 1.7_

- [x] 2. Checkpoint - Plugin restructuring complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 4 plugins load from new locations
  - Verify existing functionality still works

- [ ] 3. API Versioning Implementation
  - [ ] 3.1 Create v1 API router structure
    - Create `backend/src/routes/v1/` directory
    - Create main v1 router that mounts all v1 routes under `/api/v1`
    - Add `X-API-Version` response header middleware
    - _Requirements: 4.1, 4.2, 4.7_
  
  - [ ] 3.2 Create v1 plugins routes
    - Create `/api/v1/plugins` routes (list, get, capabilities, widgets, health)
    - Reference existing plugin route patterns from 0.x code
    - _Requirements: 4.4, 4.6_
  
  - [ ] 3.3 Create v1 capabilities routes
    - Create `/api/v1/capabilities` routes (list, get, execute)
    - Implement capability execution endpoint with RBAC
    - _Requirements: 4.4, 4.5_
  
  - [ ] 3.4 Create v1 nodes routes
    - Create `/api/v1/nodes` routes (list, get, sources)
    - Reference existing inventory/nodes routes from 0.x code for data structures
    - _Requirements: 4.8_
  
  - [ ] 3.5 Create v1 widgets routes
    - Create `/api/v1/widgets` routes (list, by-slot)
    - _Requirements: 4.4_
  
  - [ ]* 3.6 Write property test for API versioning compliance
    - **Property 10: API Versioning Compliance**
    - **Validates: Requirements 4.1, 4.3**

- [ ] 4. Checkpoint - API versioning complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all v1 routes are accessible
  - Verify response headers include API version

- [ ] 5. Node Journal Backend Implementation
  - [ ] 5.1 Create journal database schema
    - Add `journal_entries` table to database schema
    - Add indexes for efficient querying
    - Create migration script
    - _Requirements: 3.2, 3.9_
  
  - [ ] 5.2 Implement NodeJournalService
    - Create `backend/src/services/NodeJournalService.ts`
    - Implement `createEntry`, `getNodeEntries`, `getEntry`, `queryEntries` methods
    - Implement filtering by type, plugin, date range, user
    - _Requirements: 3.1, 3.2, 3.8_
  
  - [ ] 5.3 Create v1 journal routes
    - Create `/api/v1/nodes/:id/journal` routes (list, create note)
    - Add query parameter support for filtering
    - _Requirements: 4.8_
  
  - [ ] 5.4 Integrate journal with capability execution
    - Modify CapabilityRegistry to create journal entries on RemoteExecution
    - Add journal entry creation for each target node
    - _Requirements: 3.4, 11.4_
  
  - [ ]* 5.5 Write property test for automatic journal entry creation
    - **Property 4: Automatic Journal Entry Creation**
    - **Validates: Requirements 3.4, 3.5, 4.7, 11.4**
  
  - [ ]* 5.6 Write property test for journal entry filtering
    - **Property 8: Journal Entry Filtering**
    - **Validates: Requirements 3.8**

- [ ] 6. Checkpoint - Node Journal backend complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify journal entries are created on capability execution
  - Verify filtering works correctly

- [ ] 7. Events Integration Type Implementation
  - [ ] 7.1 Create events database schema
    - Add `events` table to database schema
    - Add foreign key to journal_entries
    - Create migration script
    - _Requirements: 4.3_
  
  - [ ] 7.2 Implement EventService
    - Create `backend/src/services/EventService.ts`
    - Implement event creation with automatic journal entry linking
    - Implement event querying and filtering
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [ ] 7.3 Create v1 events routes
    - Create `/api/v1/events` routes (list all events)
    - Create `/api/v1/nodes/:id/events` routes (node-specific events)
    - _Requirements: 4.9_
  
  - [ ] 7.4 Add Events capability to PuppetDBPlugin
    - Implement `puppetdb.events.list` capability for Puppet run events
    - Map Puppet report events to the standard Event format
    - Create journal entries for Puppet events
    - _Requirements: 4.5, 4.7_
  
  - [ ]* 7.5 Write property test for event-to-journal linking
    - **Property 9: Event-to-Journal Linking**
    - **Validates: Requirements 4.7**

- [ ] 8. Checkpoint - Events implementation complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify events are created and linked to journal
  - Verify PuppetDB events are captured

- [ ] 9. Inventory Aggregation Implementation
  - [ ] 9.1 Create unified nodes database schema
    - Add `nodes` table for unified node records
    - Add `node_sources` table for per-plugin data
    - Create migration script
    - _Requirements: 10.4_
  
  - [ ] 9.2 Implement InventoryAggregator service
    - Create `backend/src/services/InventoryAggregator.ts`
    - Implement node correlation by hostname, FQDN, IP, certname
    - Implement data merging with conflict resolution
    - _Requirements: 10.1, 10.2, 10.3, 10.6_
  
  - [ ] 9.3 Update v1 nodes routes for unified inventory
    - Update `/api/v1/nodes` to return unified inventory
    - Add `/api/v1/nodes/:id/sources` endpoint
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 9.4 Write property test for inventory node consolidation
    - **Property 5: Inventory Node Consolidation**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [ ] 10. Checkpoint - Inventory aggregation complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify nodes from multiple sources are consolidated
  - Verify sources are tracked correctly

- [ ] 11. Debug System Implementation
  - [ ] 11.1 Implement DebugService
    - Create `backend/src/services/DebugService.ts`
    - Implement log capture for API requests, capability executions, tool outputs
    - Implement filtering and clearing
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [ ] 11.2 Create debug middleware
    - Create middleware to capture request/response data when debug enabled
    - Add `_debug` field to responses when debug mode is on
    - Include correlation ID, execution time, capability info
    - _Requirements: 16.8, 16.9_
  
  - [ ] 11.3 Create v1 debug routes
    - Create `/api/v1/debug/logs` routes (get, clear)
    - Create `/api/v1/debug/status` and `/api/v1/debug/toggle` routes
    - _Requirements: 16.1_
  
  - [ ] 11.4 Integrate debug with capability execution
    - Capture raw tool output in CapabilityRegistry
    - Include tool output in debug logs
    - _Requirements: 16.4_
  
  - [ ]* 11.5 Write property test for debug information capture
    - **Property 6: Debug Information Capture**
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5**
  
  - [ ]* 11.6 Write property test for debug response metadata
    - **Property 15: Debug Response Metadata**
    - **Validates: Requirements 16.8, 16.9**

- [ ] 12. Checkpoint - Debug system complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify debug logs capture all required information
  - Verify _debug field appears in responses when enabled

- [ ] 13. Widget System Enhancement
  - [ ] 13.1 Add new widget slots to CapabilityRegistry
    - Add `home-summary` and `node-journal` slots
    - Update widget slot type definitions
    - _Requirements: 6.6_
  
  - [ ] 13.2 Implement widget validation on registration
    - Validate requiredCapabilities exist when registering widget
    - Fail registration if capabilities are missing
    - _Requirements: 6.2_
  
  - [ ] 13.3 Implement widget priority sorting
    - Ensure widgets are returned sorted by priority (highest first)
    - _Requirements: 6.3_
  
  - [ ]* 13.4 Write property test for widget priority sorting
    - **Property 7: Widget Priority Sorting**
    - **Validates: Requirements 6.3**
  
  - [ ]* 13.5 Write property test for widget registration validation
    - **Property 11: Widget Registration Validation**
    - **Validates: Requirements 6.2**

- [ ] 14. Checkpoint - Widget system enhancement complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify new slots are available
  - Verify widget validation works

- [ ] 15. Home Widgets for Native Plugins
  - [ ] 15.1 Create BoltPlugin HomeWidget
    - Add `home-summary` widget to BoltPlugin
    - Display node count, recent execution count, last execution status
    - Use Bolt's orange color (#FFAE1A)
    - Reference existing Bolt UI components from 0.x for functionality
    - _Requirements: 1.6, 5.1_
  
  - [ ] 15.2 Create PuppetDBPlugin HomeWidget
    - Add `home-summary` widget to PuppetDBPlugin
    - Display total nodes, recent reports summary, failed runs count
    - Use PuppetDB's violet color (#9063CD)
    - Reference existing PuppetDB UI components from 0.x for functionality
    - _Requirements: 1.7, 5.2_
  
  - [ ] 15.3 Create PuppetserverPlugin HomeWidget
    - Add `home-summary` widget to PuppetserverPlugin
    - Display environment count, catalog compilation status, server health
    - Use Puppetserver's blue color (#2E3A87)
    - Reference existing Puppetserver UI components from 0.x for functionality
    - _Requirements: 1.8, 5.3_
  
  - [ ] 15.4 Create HieraPlugin HomeWidget
    - Add `home-summary` widget to HieraPlugin
    - Display total keys indexed, hierarchy levels, last scan timestamp
    - Use Hiera's red color (#C1272D)
    - Reference existing Hiera UI components from 0.x for functionality
    - _Requirements: 1.9, 5.4_

- [ ] 16. Checkpoint - Home widgets complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 4 home widgets render correctly
  - Verify colors and metrics are displayed

- [ ] 17. Frontend Page Implementation
  - [ ] 17.1 Create new HomePage with widget slots
    - Create new `frontend/src/pages/HomePage.svelte` using v1 patterns
    - Implement `home-summary` widget slot rendering
    - Add welcome section and system overview
    - Reference existing HomePage from 0.x for layout inspiration
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 17.2 Create IntegrationHomePage component
    - Create `frontend/src/pages/IntegrationHomePage.svelte`
    - Implement automatic tab generation from capability categories
    - Display plugin metadata with color theming
    - Include health status section and CLI reference
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_
  
  - [ ] 17.3 Create new NodeDetailPage with plugin tabs
    - Create new `frontend/src/pages/NodeDetailPage.svelte` using v1 patterns
    - Implement automatic tab generation from plugins with node-detail widgets
    - Add Summary widget aggregating data from all integrations
    - Add Journal tab for NodeJournal timeline
    - Reference existing NodeDetailPage from 0.x for functionality
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ] 17.4 Create NodeJournal timeline component
    - Create `frontend/src/components/NodeJournal.svelte`
    - Display journal entries in chronological timeline
    - Implement filtering by type, plugin, date range
    - Use plugin colors for entry identification
    - _Requirements: 3.7, 3.8, 13.5_
  
  - [ ] 17.5 Create DebugPanel component
    - Create `frontend/src/components/DebugPanel.svelte`
    - Display API requests, responses, tool outputs, errors
    - Implement filtering and copy-to-clipboard
    - Support real-time updates for streaming output
    - Reference existing debug components from 0.x
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.10, 16.12_
  
  - [ ]* 17.6 Write property test for widget rendering correctness
    - **Property 1: Widget Rendering Correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
  
  - [ ]* 17.7 Write property test for tab generation from capabilities
    - **Property 2: Tab Generation from Capabilities**
    - **Validates: Requirements 2.2, 2.3, 7.1, 7.2**
  
  - [ ]* 17.8 Write property test for RBAC permission filtering
    - **Property 3: RBAC Permission Filtering**
    - **Validates: Requirements 2.6, 6.4, 7.3**

- [ ] 18. Checkpoint - Frontend pages complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify HomePage renders home widgets
  - Verify IntegrationHomePage generates tabs correctly
  - Verify NodeDetailPage shows plugin tabs and journal

- [ ] 19. Node Detail Widgets for Native Plugins
  - [ ] 19.1 Create BoltPlugin node-detail widgets
    - Add CommandExecutor widget for `node-detail` slot
    - Add TaskRunner widget for `node-detail` slot
    - Add FactsViewer widget for `node-detail` slot
    - Reference existing Bolt node components from 0.x
    - _Requirements: 3.9, 15.5_
  
  - [ ] 19.2 Create PuppetDBPlugin node-detail widgets
    - Add FactsExplorer widget for `node-detail` slot
    - Add ReportsViewer widget for `node-detail` slot
    - Add EventsViewer widget for `node-detail` slot
    - Add CatalogViewer widget for `node-detail` slot
    - Reference existing PuppetDB node components from 0.x
    - _Requirements: 3.10, 15.5_
  
  - [ ] 19.3 Create PuppetserverPlugin node-detail widgets
    - Add CatalogCompilation widget for `node-detail` slot
    - Add EnvironmentInfo widget for `node-detail` slot
    - Add NodeStatus widget for `node-detail` slot
    - Reference existing Puppetserver node components from 0.x
    - _Requirements: 3.11, 15.5_
  
  - [ ] 19.4 Create HieraPlugin node-detail widgets
    - Add KeyLookup widget for `node-detail` slot
    - Add HierarchyViewer widget for `node-detail` slot
    - Add NodeHieraData widget for `node-detail` slot
    - Reference existing Hiera node components from 0.x
    - _Requirements: 3.12, 15.5_

- [ ] 20. Checkpoint - Node detail widgets complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all plugin widgets render in node detail page
  - Verify widget functionality matches 0.x behavior

- [ ] 21. Legacy Code Removal
  - [ ] 21.1 Remove legacy interfaces from types.ts
    - Remove `ExecutionToolPlugin`, `InformationSourcePlugin`, `IntegrationPlugin`
    - Remove `IntegrationConfig`, `PluginRegistration`
    - Remove deprecated capability types
    - _Requirements: 5.1, 5.4, 5.5, 5.6_
  
  - [ ] 21.2 Remove legacy IntegrationManager methods
    - Remove `getExecutionTool()`, `getInformationSource()`
    - Remove `getAllExecutionTools()`, `getAllInformationSources()`
    - Update any code that used these methods
    - _Requirements: 5.2_
  
  - [ ] 21.3 Remove legacy route files
    - Remove unversioned routes: `routes/inventory.ts`, `routes/facts.ts`, `routes/commands.ts`, `routes/tasks.ts`, `routes/puppet.ts`
    - Remove any other 0.x route files not needed
    - Update server.ts to only mount v1 routes
    - _Requirements: 5.3_
  
  - [ ] 21.4 Remove legacy frontend code
    - Remove old HomePage.svelte (replaced by new v1 version)
    - Remove old NodeDetailPage.svelte (replaced by new v1 version)
    - Remove legacy API calls and replace with v1 endpoints
    - _Requirements: 5.7_
  
  - [ ] 21.5 Clean up old integrations directory
    - Remove `backend/src/integrations/` directory after plugins are moved to `plugins/native/`
    - Keep only shared utilities if any (move to `backend/src/shared/`)
    - Update all imports throughout codebase
    - _Requirements: 5.1_

- [ ] 22. Checkpoint - Legacy code removal complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no legacy code remains
  - Verify application still functions correctly

- [ ] 23. Final Integration and Polish
  - [ ] 23.1 Update routing configuration
    - Configure frontend router for new page structure
    - Add routes for `/integrations/:pluginName`
    - Ensure all navigation works correctly
    - _Requirements: 2.1, 11.6_
  
  - [ ] 23.2 Add health status indicators throughout UI
    - Add health indicators to HomeWidgets
    - Add health section to IntegrationHomePage
    - Add error states to plugin tabs on NodeDetailPage
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 14.1, 14.2_
  
  - [ ] 23.3 Implement color theming system
    - Create utility for generating light/dark color variants
    - Apply plugin colors consistently across UI
    - Support dark mode color adjustments
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.5_
  
  - [ ]* 23.4 Write property test for plugin health state display
    - **Property 12: Plugin Health State Display**
    - **Validates: Requirements 9.1, 9.2**
  
  - [ ]* 23.5 Write property test for node detail tab generation
    - **Property 13: Node Detail Tab Generation**
    - **Validates: Requirements 3.2, 3.3**
  
  - [ ]* 23.6 Write property test for capability category label transformation
    - **Property 14: Capability Category Label Transformation**
    - **Validates: Requirements 7.4**

- [ ] 24. Final Checkpoint - v1.0.0 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all features work end-to-end
  - Verify no regressions from 0.x functionality
  - Review for any remaining legacy code

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Reference 0.x code for functionality but implement using v1.x patterns
