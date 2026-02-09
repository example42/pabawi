# Implementation Plan: V1 Plugins Finalization

## Overview

This implementation plan completes the v1 plugin architecture by fixing widget registration, adding capability-based category tabs to plugin home pages, fixing widget display behavior, and ensuring navigation displays all integration types. The backend autoloading works correctly via PluginLoader. The frontend needs:

1. Ansible widget manifest (file exists but only exports components, no ANSIBLE_WIDGET_MANIFEST)
2. SSH widget manifest (no frontend/index.ts file at all)
3. Update registerPluginWidgets.ts to import ansible and ssh (fixes widget loading)
4. Add category tabs to IntegrationHomePage.svelte
5. Fix HomePage to only show home-summary widgets (remove dashboard slot)
6. Fix IntegrationHomePage to show dashboard widgets in overview tab
7. Verify navigation shows all integration types including InventorySource

## Tasks

- [x] 1. Create/update frontend entry points for ansible and ssh plugins
  - [x] 1.1 Update ansible frontend entry point to export widget manifest
    - Modify `plugins/native/ansible/frontend/index.ts`
    - Add `ANSIBLE_WIDGET_MANIFEST` constant export following bolt's pattern
    - Use `load: () => import('./Component.svelte')` for each widget
    - Map all widgets from plugin.json with proper metadata
    - Keep existing component exports for backward compatibility
    - _Requirements: 9.1, 9.3_
  
  - [x] 1.2 Create ssh frontend entry point with widget manifest
    - Create `plugins/native/ssh/frontend/index.ts`
    - Export `SSH_WIDGET_MANIFEST` constant
    - Map ssh:home-widget from plugin.json to HomeWidget.svelte
    - Use `load` function pattern for lazy loading
    - _Requirements: 9.2, 9.3_
  
  - [ ]* 1.3 Write property test for manifest consistency
    - **Property 18: Plugin Manifest Consistency**
    - **Validates: Requirements 9.3**
    - Test that plugin.json and TypeScript manifests match for widget IDs and capabilities

- [x] 2. Update frontend widget registration system
  - [x] 2.1 Add ansible and ssh imports to registerPluginWidgets.ts
    - Import `ANSIBLE_WIDGET_MANIFEST` from ansible frontend
    - Import `SSH_WIDGET_MANIFEST` from ssh frontend
    - Add both manifests to the registration array
    - Update total count logging
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 2.2 Write property test for widget registration completeness
    - **Property 4: Widget Registration with Metadata**
    - **Validates: Requirements 2.3, 7.2**
    - Test that all widgets are registered with required metadata fields
  
  - [ ]* 2.3 Write unit tests for widget registration
    - Test that ansible and ssh are included in registration
    - Test that registration logs correct total count
    - Test error handling for missing frontend entry points
    - _Requirements: 2.2, 2.4, 2.5_

- [x] 3. Checkpoint - Verify widget registration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Enhance IntegrationHomePage with category tabs
  - [x] 4.1 Add category tab building logic
    - Create `buildCategoryTabs()` function
    - Group capabilities by category
    - Create tabs for categories with capabilities
    - Define category order and labels
    - _Requirements: 4.1, 4.2_
  
  - [x] 4.2 Add tab navigation UI
    - Create tab navigation component
    - Track active tab state
    - Style active/inactive tabs
    - Show capability counts per tab
    - _Requirements: 4.2_
  
  - [x] 4.3 Add tab content rendering
    - Render overview tab with general widgets
    - Render category tabs with filtered widgets
    - Pass category filter to WidgetSlot
    - _Requirements: 4.3_
  
  - [x] 4.4 Display multiple integration type badges
    - Check for `integrationTypes` array in metadata
    - Display badge for each integration type
    - Fallback to single `integrationType` if array not present
    - _Requirements: 3.5_
  
  - [ ]* 4.5 Write property test for category tab visibility
    - **Property 7: Category Tab Visibility**
    - **Validates: Requirements 4.2, 4.4**
    - Test that tabs exist iff category has capabilities
  
  - [ ]* 4.6 Write property test for category grouping
    - **Property 6: Capability Category Grouping**
    - **Validates: Requirements 4.1**
    - Test that capabilities are correctly grouped by category

- [x] 5. Add category filtering to WidgetSlot component
  - [x] 5.1 Add filterByCategory prop to WidgetSlot
    - Add optional `filterByCategory` prop
    - Filter widgets by category property
    - Handle widgets without category (show in overview)
    - _Requirements: 4.3, 8.3, 8.4_
  
  - [x] 5.2 Enhance empty state handling
    - Show empty state when no widgets match filter
    - Display category-specific empty messages
    - _Requirements: 8.5_
  
  - [ ]* 5.3 Write property test for category widget filtering
    - **Property 8: Category Widget Filtering**
    - **Validates: Requirements 4.3**
    - Test that only matching widgets are displayed per category
  
  - [ ]* 5.4 Write property test for widget category placement
    - **Property 16: Widget Category Placement**
    - **Validates: Requirements 8.3, 8.4**
    - Test that widgets appear in correct tabs based on category property

- [x] 6. Fix HomePage to only show home-summary widgets
  - [x] 6.1 Remove dashboard WidgetSlot from HomePage
    - Remove the WidgetSlot component that displays dashboard slot
    - Keep only the home-summary WidgetSlot
    - Update empty state message for home-summary
    - _Requirements: 11.1, 11.2_
  
  - [ ]* 6.2 Write property test for HomePage widget slot restriction
    - **Property 21: HomePage Widget Slot Restriction**
    - **Validates: Requirements 11.1, 11.2**
    - Test that only home-summary widgets are displayed on HomePage

- [x] 7. Fix IntegrationHomePage to show dashboard widgets
  - [x] 7.1 Add dashboard WidgetSlot to overview tab
    - Add WidgetSlot for dashboard slot before standalone-page slot
    - Use grid layout for dashboard widgets
    - Keep standalone-page WidgetSlot with stack layout
    - _Requirements: 11.3, 11.4_
  
  - [x] 7.2 Add dashboard WidgetSlot to category tabs
    - Add WidgetSlot for dashboard slot in category tab rendering
    - Apply category filter to dashboard WidgetSlot
    - Keep standalone-page WidgetSlot with category filter
    - _Requirements: 11.5_
  
  - [ ]* 7.3 Write property test for plugin home page dashboard display
    - **Property 22: Plugin Home Page Dashboard Widget Display**
    - **Validates: Requirements 11.3, 11.4**
    - Test that dashboard and standalone-page widgets are displayed
  
  - [ ]* 7.4 Write property test for category tab widget filtering
    - **Property 23: Category Tab Widget Filtering**
    - **Validates: Requirements 11.5**
    - Test that widgets are filtered by category in category tabs

- [x] 8. Checkpoint - Verify widget display fixes
  - Ensure all tests pass, ask the user if questions arise.
    - Handle widgets without category (show in overview)
    - _Requirements: 4.3, 8.3, 8.4_
  
  - [x] 5.2 Enhance empty state handling
    - Show empty state when no widgets match filter
    - Display category-specific empty messages
    - _Requirements: 8.5_
  
  - [ ]* 5.3 Write property test for category widget filtering
    - **Property 8: Category Widget Filtering**
    - **Validates: Requirements 4.3**
    - Test that only matching widgets are displayed per category
  
  - [ ]* 5.4 Write property test for widget category placement
    - **Property 16: Widget Category Placement**
    - **Validates: Requirements 8.3, 8.4**
    - Test that widgets appear in correct tabs based on category property

- [ ] 9. Checkpoint - Verify category tabs functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Verify ansible plugin widgets exist
  - [x] 10.1 Verify ansible widget components exist
    - Check that `plugins/native/ansible/frontend/HomeWidget.svelte` exists
    - Check that `plugins/native/ansible/frontend/PluginHomePage.svelte` exists
    - Check that `plugins/native/ansible/frontend/PlaybookRunner.svelte` exists
    - Check that `plugins/native/ansible/frontend/CommandExecutor.svelte` exists
    - Check that `plugins/native/ansible/frontend/InventoryViewer.svelte` exists
    - Check that `plugins/native/ansible/frontend/NodeDetailTabs.svelte` exists
    - All components already exist, no creation needed
    - _Requirements: 1.1_

- [x] 11. Verify ssh plugin widget exists
  - [x] 11.1 Verify ssh HomeWidget component exists
    - Check that `plugins/native/ssh/frontend/HomeWidget.svelte` exists
    - Component already exists, no creation needed
    - _Requirements: 1.1_

- [x] 12. Review component migration status (most already done)
  - [x] 12.1 Verify setup guide components are in plugin directories
    - Check if setup guides are already in plugin directories or still in shared components
    - Document current locations
    - _Requirements: 5.1, 5.2_
  
  - [x] 12.2 Verify bolt-specific components are in plugin directory
    - Check if PackageManager, TaskRunner, FactsViewer are in bolt/frontend
    - Document current locations
    - _Requirements: 5.3, 5.4_
  
  - [x] 12.3 Verify puppetdb-specific components are in plugin directory
    - Check if CatalogViewer, EventsViewer, ReportsViewer are in puppetdb/frontend
    - Document current locations
    - _Requirements: 5.3, 5.4_
  
  - [ ]* 12.4 Write property test for migrated widget compliance (if migration needed)
    - **Property 10: Migrated Widget Interface Compliance**
    - **Validates: Requirements 5.4**
    - Test that migrated widgets have valid v1 interface

- [x] 13. Verify navigation displays all integration types
  - [x] 13.1 Check navigation menu integration type logic
    - Verify navigation queries all registered plugins
    - Ensure InventorySource type is included in menu
    - Test that multi-type plugins appear in all relevant views
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 13.2 Write property test for integration type navigation
    - **Property 5: Integration Type Navigation Completeness**
    - **Validates: Requirements 3.1, 3.3, 3.4**
    - Test that all integration types are displayed and clickable
  
  - [ ]* 13.3 Write property test for multi-type plugin registration
    - **Property 3: Multi-Type Plugin Registration**
    - **Validates: Requirements 1.4, 3.5**
    - Test that plugins with multiple types appear in all views

- [x] 14. Checkpoint - Verify navigation and integration types
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement permission-based widget filtering
  - [x] 15.1 Add permission checking to widget rendering
    - Check user permissions against widget required capabilities
    - Filter widgets based on permission check results
    - Handle missing permissions gracefully
    - _Requirements: 4.5, 7.4_
  
  - [ ]* 15.2 Write property test for permission-based filtering
    - **Property 9: Permission-Based Widget Filtering**
    - **Validates: Requirements 4.5, 7.4**
    - Test that widgets are filtered correctly based on user permissions

- [x] 16. Enhance widget context provision
  - [x] 16.1 Ensure widgets receive required context
    - Pass pluginName and pluginInfo to all widgets
    - Pass node context to node-scoped widgets
    - Validate context structure
    - _Requirements: 7.3, 7.5_
  
  - [ ]* 16.2 Write property test for widget context provision
    - **Property 15: Widget Context Provision**
    - **Validates: Requirements 7.3, 7.5**
    - Test that widgets receive correct context based on scope

- [x] 17. Implement health status display and updates
  - [x] 17.1 Add health status query to plugin home page
    - Query plugin health from backend API
    - Display health indicator with appropriate styling
    - Show error messages for offline plugins
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 17.2 Add reactive health status updates
    - Implement polling or WebSocket for health updates
    - Update UI without page refresh when status changes
    - Handle connection errors gracefully
    - _Requirements: 10.5_
  
  - [ ]* 17.3 Write property test for health status display
    - **Property 19: Plugin Health Status Display**
    - **Validates: Requirements 10.2, 10.3, 10.4**
    - Test that correct indicators are shown for each health status
  
  - [ ]* 17.4 Write property test for reactive health updates
    - **Property 20: Reactive Health Status Updates**
    - **Validates: Requirements 10.5**
    - Test that UI updates when health status changes

- [ ] 18. Verify backend plugin autoloading
  - [ ] 18.1 Test backend plugin discovery
    - Start backend and check logs for plugin discovery
    - Verify all 6 native plugins are discovered
    - Check that plugin manifests are loaded correctly
    - _Requirements: 1.1, 1.2_
  
  - [ ]* 18.2 Write unit test for plugin discovery
    - Test that all native plugins are discovered on startup
    - Test that plugin.json manifests are validated
    - Test error handling for invalid manifests
    - _Requirements: 1.1, 1.2, 1.5, 1.6_
  
  - [ ]* 18.3 Write property test for capability registration
    - **Property 2: Capability Registration Completeness**
    - **Validates: Requirements 1.3**
    - Test that all manifest capabilities are registered

- [x] 19. Implement inventory multi-source functionality
  - [x] 19.1 Verify inventory endpoints for all plugins
    - Check that ansible, bolt, puppetdb, ssh expose inventory endpoints
    - Test inventory.list, inventory.get, inventory.groups, inventory.filter
    - _Requirements: 6.1_
  
  - [x] 19.2 Implement multi-source inventory querying
    - Query all InventorySource plugins when loading inventory view
    - Merge results from multiple sources
    - Indicate source plugin for each node
    - _Requirements: 6.2, 6.3, 6.4_
  
  - [x] 19.3 Add inventory source failure isolation
    - Handle failures from individual inventory sources
    - Display errors for failed sources
    - Continue showing data from successful sources
    - _Requirements: 6.5_
  
  - [ ]* 19.4 Write property test for inventory endpoint exposure
    - **Property 11: Inventory Plugin Endpoint Exposure**
    - **Validates: Requirements 6.1**
    - Test that all inventory plugins expose required endpoints
  
  - [ ]* 19.5 Write property test for multi-source inventory querying
    - **Property 12: Multi-Source Inventory Querying**
    - **Validates: Requirements 6.2, 6.3**
    - Test that all InventorySource plugins are queried and merged
  
  - [ ]* 19.6 Write property test for multi-source node attribution
    - **Property 13: Multi-Source Node Attribution**
    - **Validates: Requirements 6.4**
    - Test that nodes show all providing plugins
  
  - [ ]* 19.7 Write property test for inventory failure isolation
    - **Property 14: Inventory Source Failure Isolation**
    - **Validates: Requirements 6.5**
    - Test that one source failure doesn't block others

- [ ] 20. Checkpoint - Verify inventory functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Review and document current component organization
  - [x] 21.1 Document which components are plugin-specific vs shared
    - Identify components in `frontend/src/components/` that are plugin-specific
    - Identify truly shared framework components (CommandOutput, PermissionGuard, etc.)
    - Document findings for potential future cleanup
    - _Requirements: 5.5_

- [ ] 22. Final integration testing
  - [ ] 22.1 Test complete plugin lifecycle
    - Start backend, verify all plugins load
    - Load frontend, verify all widgets register
    - Navigate to each plugin home page
    - Test category tabs on each plugin
    - _Requirements: All_
  
  - [ ] 22.2 Test inventory multi-source integration
    - Load inventory view
    - Verify nodes from all sources appear
    - Test filtering and grouping
    - Verify source attribution
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [ ] 22.3 Test permission-based access
    - Test with different user roles
    - Verify widgets are filtered correctly
    - Test that unauthorized users see appropriate messages
    - _Requirements: 4.5, 7.4_
  
  - [ ]* 22.4 Write integration tests for end-to-end scenarios
    - Test plugin discovery and loading
    - Test widget registration and rendering
    - Test navigation and routing
    - Test category tabs and filtering

- [ ] 23. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Backend autoloading already works via PluginLoader - focus is on frontend
- Ansible widget components already exist, just need proper manifest export
- SSH HomeWidget already exists, just need to create index.ts with manifest
- Component migration was largely done in previous work - task 9 is verification only
- Shared components (CommandOutput, PermissionGuard, etc.) remain in `frontend/src/components/`
