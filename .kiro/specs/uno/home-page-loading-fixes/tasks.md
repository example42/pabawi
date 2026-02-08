# Implementation Plan: Progressive Loading Architecture for Home Page

## Overview

This implementation plan addresses critical browser performance issues after login where the system becomes extremely sluggish due to loading all plugin data upfront. The solution implements a progressive loading architecture where:

1. **App shell renders immediately** - No blocking initialization
2. **Menu builds from capability metadata** - No data fetching, just capability availability
3. **Home page shows lightweight tiles** - Summary widgets that load independently
4. **Plugin home pages load on-demand** - Full data only when navigating to plugin pages

**Key Architectural Changes:**

- Remove InitializationCoordinator (blocking initialization)
- Add backend metadata and summary endpoints
- Update MenuBuilder to use metadata only
- Create plugin home pages with on-demand loading
- Implement home summary widgets for progressive tile loading

## Tasks

- [x] 1. Add backend metadata and summary endpoints
  - [x] 1.1 Create `/api/v1/plugins` metadata endpoint
    - Return plugin list with capabilities, health status, and display info
    - No data fetching - metadata only (name, displayName, capabilities, enabled, healthy)
    - Response time must be under 100ms
    - _Requirements: 2.1, 5.1_
  
  - [x] 1.2 Add `getSummary()` method to plugin interface
    - Define PluginSummary interface (pluginName, displayName, metrics, healthy, lastUpdate)
    - Each plugin implements lightweight summary (counts, status, health only)
    - Summary must return in under 500ms
    - _Requirements: 4.2, 7.4_
  
  - [x] 1.3 Create `/api/plugins/:name/summary` endpoints
    - Call plugin's getSummary() method
    - Return lightweight summary data (not full data)
    - Handle plugin errors gracefully (return error in response)
    - _Requirements: 4.2, 4.3_
  
  - [x] 1.4 Add `getData()` method to plugin interface
    - Define PluginData interface (pluginName, displayName, data, healthy, capabilities)
    - Each plugin implements full data loading
    - Only called when navigating to plugin page
    - _Requirements: 3.7, 5.3_
  
  - [x] 1.5 Create `/api/plugins/:name/data` endpoints
    - Call plugin's getData() method
    - Return full plugin data for plugin home pages
    - Only called on-demand (not during app init)
    - _Requirements: 3.7, 5.3_
  
  - [ ]* 1.6 Write unit tests for new endpoints
    - Test metadata endpoint returns correct structure
    - Test summary endpoints return lightweight data quickly
    - Test data endpoints return full data
    - Test error handling for failed plugins
    - _Requirements: 2.1, 4.2, 5.3_

- [x] 2. Remove InitializationCoordinator and blocking initialization
  - [x] 2.1 Delete InitializationCoordinator files
    - Delete `frontend/src/lib/initialization/InitializationCoordinator.svelte.ts`
    - Delete `frontend/src/lib/initialization/index.ts`
    - Delete `frontend/src/lib/initialization/` directory
    - _Requirements: 1.1, 5.5_
  
  - [x] 2.2 Remove backend readiness endpoint
    - Remove `/api/health/ready` endpoint from `backend/src/routes/health.ts`
    - Remove readiness tracking from IntegrationManager
    - Remove `getInitializationTime()` method
    - _Requirements: 5.5_
  
  - [x] 2.3 Update App.svelte to render immediately
    - Remove InitializationCoordinator import and usage
    - Remove coordinator.initialize() call
    - Remove coordinator state checks (loaded, error, checking_backend)
    - Remove loading screen component
    - Render shell immediately (navigation, layout, router)
    - Keep auth check only (setup status and authentication)
    - _Requirements: 1.1, 1.4, 7.1_
  
  - [ ]* 2.4 Write performance test for immediate shell rendering
    - Verify app shell renders within 500ms of login
    - Verify no blocking on data loading
    - _Requirements: 1.1, 7.1_

- [x] 3. Update MenuBuilder for metadata-only construction
  - [x] 3.1 Remove plugin loading code from MenuBuilder
    - Remove `loadPlugins()` method
    - Remove `fetchIntegrationMenu()` method
    - Remove PluginLoader import and usage
    - Remove WidgetRegistry initialization
    - Remove old `initialize()` method
    - _Requirements: 2.1, 5.1_
  
  - [x] 3.2 Implement metadata-based menu building
    - Create `fetchMetadata()` method that calls `/api/v1/plugins`
    - Create `buildFromMetadata()` method that builds menu synchronously
    - Menu items are just links (no widget data)
    - Add status badges (loading/ready/offline) based on plugin health
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 3.3 Implement new `fetchAndBuild()` method
    - Fetch metadata from `/api/v1/plugins`
    - Build menu synchronously from metadata
    - Update menu state reactively
    - Handle errors gracefully (show error, allow retry)
    - _Requirements: 2.1, 2.4_
  
  - [x] 3.4 Make menu building idempotent
    - Check if already built before rebuilding
    - Cache metadata for 30 seconds
    - Return early on subsequent calls
    - _Requirements: 2.5_
  
  - [ ]* 3.5 Write unit tests for MenuBuilder
    - Test metadata fetching
    - Test menu building from metadata
    - Test status badges for plugin health
    - Test idempotent behavior
    - Test error handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Update DynamicNavigation for immediate rendering
  - [x] 4.1 Remove coordinator dependency
    - Remove InitializationCoordinator import
    - Remove coordinator state checks
    - Remove coordinator-based loading states
    - _Requirements: 1.2, 2.1_
  
  - [x] 4.2 Initialize menu immediately on mount
    - Call MenuBuilder.fetchAndBuild() in onMount
    - Don't wait for coordinator
    - Show menu skeleton while loading
    - _Requirements: 1.2, 7.2_
  
  - [x] 4.3 Add menu skeleton loader
    - Show skeleton items while metadata loads
    - Menu appears immediately (even if empty)
    - Progressive enhancement as metadata loads
    - _Requirements: 1.2, 2.1_
  
  - [ ]* 4.4 Write integration test for DynamicNavigation
    - Test menu appears within 1 second
    - Test skeleton loader displays
    - Test menu updates when metadata loads
    - _Requirements: 1.2, 7.2_

- [x] 5. Update HomePage for progressive tile loading
  - [x] 5.1 Remove integration status section
    - Remove `fetchIntegrationStatus()` function
    - Remove integration status state variables
    - Remove IntegrationStatus component usage
    - Remove integration status section from template
    - _Requirements: 4.1_
  
  - [x] 5.2 Add home-summary widget slot
    - Use WidgetSlot component with slot="home-summary"
    - Configure grid layout (3 columns, gap 4)
    - Enable loading states (showLoadingStates=true)
    - Enable empty state with message
    - _Requirements: 4.1, 4.3_
  
  - [x] 5.3 Ensure page renders immediately
    - Page shell renders instantly
    - Tiles load progressively (no blocking)
    - Failed tiles don't block other tiles
    - _Requirements: 1.3, 4.3, 4.4_
  
  - [ ]* 5.4 Write integration test for HomePage
    - Test page shell renders immediately
    - Test tiles load independently
    - Test failed tiles don't block others
    - _Requirements: 1.3, 4.3, 4.4_

- [x] 6. Checkpoint - Test immediate rendering and menu
  - Verify app shell renders within 500ms after login
  - Verify menu appears within 1 second
  - Verify browser remains responsive (no sluggishness)
  - Verify no blocking on initialization
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create home summary widgets for each plugin
  - [x] 7.1 Update plugin manifests with home-summary widgets
    - Add widget definition for slot "home-summary"
    - Set size to "medium"
    - Set priority (20 for core plugins)
    - Specify requiredCapabilities
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.2 Implement PuppetDB home summary widget
    - Create `plugins/native/puppetdb/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/puppetdb/summary`
    - Display node count, healthy nodes, last update
    - Link to `/integrations/puppetdb`
    - Handle loading/error states independently
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 7.3 Implement Puppetserver home summary widget
    - Create `plugins/native/puppetserver/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/puppetserver/summary`
    - Display server status, catalog compilations, last update
    - Link to `/integrations/puppetserver`
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 7.4 Implement Hiera home summary widget
    - Create `plugins/native/hiera/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/hiera/summary`
    - Display key count, lookup stats, last update
    - Link to `/integrations/hiera`
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 7.5 Implement Bolt home summary widget
    - Create `plugins/native/bolt/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/bolt/summary`
    - Display task count, recent runs, last update
    - Link to `/integrations/bolt`
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 7.6 Implement Ansible home summary widget
    - Create `plugins/native/ansible/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/ansible/summary`
    - Display playbook count, recent runs, last update
    - Link to `/integrations/ansible`
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 7.7 Implement SSH home summary widget
    - Create `plugins/native/ssh/frontend/HomeWidget.svelte`
    - Fetch from `/api/plugins/ssh/summary`
    - Display connection count, active sessions, last update
    - Link to `/integrations/ssh`
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [ ]* 7.8 Write unit tests for home summary widgets
    - Test independent loading for each widget
    - Test error handling doesn't block other widgets
    - Test loading states display correctly
    - Test links navigate to correct plugin pages
    - _Requirements: 4.3, 4.4_

- [x] 8. Create plugin home pages with on-demand loading
  - [x] 8.1 Create generic IntegrationHomePage component
    - Create `frontend/src/pages/IntegrationHomePage.svelte`
    - Get plugin name from route params
    - Load full data on mount from `/api/plugins/:name/data`
    - Show loading/error/success states
    - Use standalone-page widget slot for plugin-specific widgets
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  
  - [x] 8.2 Add routes for plugin home pages
    - Add route `/integrations/:integrationName` to router
    - Map to IntegrationHomePage component
    - Pass integrationName as param
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 8.3 Ensure data loads only on navigation
    - No data loading during app init
    - Data loads in IntegrationHomePage onMount
    - Verify no blocking on app startup
    - _Requirements: 3.7, 5.3_
  
  - [ ]* 8.4 Write integration tests for plugin home pages
    - Test navigation to plugin pages
    - Test data loads on-demand
    - Test loading/error states
    - Test no data loading during app init
    - _Requirements: 3.7, 5.3_

- [x] 9. Checkpoint - Test progressive loading
  - Verify home tiles load independently
  - Verify failed tiles don't block others
  - Verify plugin pages load data on-demand
  - Verify no data loading during app init
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement error handling and graceful degradation
  - [x] 10.1 Handle metadata fetch failures
    - Show error in menu with retry button
    - Don't block app rendering
    - Log error for debugging
    - _Requirements: 8.1, 8.2_
  
  - [x] 10.2 Handle tile load failures
    - Show error in tile with retry button
    - Don't block other tiles
    - Log error for debugging
    - _Requirements: 8.1, 8.2_
  
  - [x] 10.3 Handle plugin page load failures
    - Show error page with retry button
    - Provide clear error message
    - Log error for debugging
    - _Requirements: 8.1, 8.2_
  
  - [x] 10.4 Implement graceful degradation for partial plugin failures
    - Backend continues with available plugins
    - Menu shows available plugins only
    - Home tiles show available plugins only
    - Log failed plugins for debugging
    - _Requirements: 8.2_
  
  - [ ]* 10.5 Write property test for error isolation
    - **Property 7: Failed Tiles Don't Block Others**
    - **Validates: Requirements 4.4, 6.5**

- [x] 11. Add loading states and progress indicators
  - [x] 11.1 Add skeleton loaders for menu
    - Show skeleton items while metadata loads
    - Smooth transition to actual menu
    - _Requirements: 9.1_
  
  - [x] 11.2 Add skeleton loaders for home tiles
    - Show skeleton tiles while data loads
    - Smooth transition to actual tiles
    - _Requirements: 9.1_
  
  - [x] 11.3 Add loading indicators for plugin pages
    - Show loading spinner while data loads
    - Show progress message
    - _Requirements: 9.1_
  
  - [x] 11.4 Ensure loading states are accessible
    - Use ARIA live regions for updates
    - Announce loading progress to screen readers
    - Ensure keyboard navigation works
    - _Requirements: 9.5_
  
  - [ ]* 11.5 Write accessibility tests for loading states
    - Test ARIA live regions
    - Test screen reader announcements
    - Test keyboard navigation
    - _Requirements: 9.5_

- [x] 12. Optimize performance
  - [x] 12.1 Implement metadata caching
    - Cache `/api/v1/plugins` response for 30 seconds
    - Use stale-while-revalidate pattern
    - _Requirements: 7.1, 7.2_
  
  - [x] 12.2 Implement summary caching
    - Cache summary responses for 10 seconds
    - Use stale-while-revalidate pattern
    - _Requirements: 7.4_
  
  - [x] 12.3 Load home tiles in parallel
    - Use Promise.all for parallel loading
    - Don't wait for one tile before loading next
    - _Requirements: 1.3, 4.3_
  
  - [x] 12.4 Enable response compression
    - Enable gzip compression for API responses
    - Reduce payload size
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ]* 12.5 Write performance tests
    - **Property 1: Immediate Shell Rendering**
    - **Property 2: Menu Appears Within 1 Second**
    - **Property 3: Browser Remains Responsive**
    - **Property 5: No Blocking on Full Data**
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 7.1, 7.2, 7.3, 7.5**

- [x] 13. Deprecate and clean up old code
  - [x] 13.1 Mark `/api/integrations/menu` as deprecated
    - Add deprecation warning to endpoint
    - Add response header: `Deprecated: true`
    - Log deprecation warnings
    - Update documentation
    - _Requirements: 5.5_
  
  - [x] 13.2 Mark IntegrationStatus component as deprecated
    - Add deprecation comment to component
    - Update documentation
    - Plan removal for future release
    - _Requirements: 4.1_
  
  - [x] 13.3 Remove unused imports and code
    - Run ESLint to find unused imports
    - Run TypeScript compiler to find unused types
    - Remove unused utility functions
    - _Requirements: 5.5_
  
  - [x] 13.4 Update documentation
    - Remove InitializationCoordinator references
    - Document new progressive loading architecture
    - Update API documentation for new endpoints
    - _Requirements: 5.5_

- [x] 14. Final checkpoint - Comprehensive testing
  - Run all unit tests
  - Run all property-based tests (minimum 100 iterations each)
  - Test full flow: login → shell → menu → home → plugin page
  - Test performance (shell < 500ms, menu < 1s, tiles < 2s)
  - Test error scenarios (failed metadata, failed tiles, failed plugins)
  - Test browser responsiveness (no sluggishness)
  - Test graceful degradation with partial plugin failures
  - Verify all 6 plugin home pages exist and work
  - Verify no blocking on full plugin data during init
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each property test should run a minimum of 100 iterations
- Use fast-check library for property-based testing in TypeScript
- The progressive loading architecture removes all blocking initialization
- App shell must render within 500ms (critical requirement)
- Menu must appear within 1 second (critical requirement)
- Browser must remain responsive throughout (no sluggishness)
- All plugin data loading must be on-demand (not during app init)
- Home tiles load independently and progressively
- Failed components don't block other components
- All 6 core plugins need home pages: puppetdb, puppetserver, hiera, bolt, ansible, ssh

## Success Metrics

- Home page shell renders < 500ms after login ✓
- Menu appears < 1 second after login ✓
- Browser remains responsive (no sluggishness) ✓
- Home tiles load progressively < 2 seconds each ✓
- Plugin home pages exist for all 6 core plugins ✓
- Zero blocking on full plugin data during init ✓
- User-reported performance issues < 1% of sessions ✓
