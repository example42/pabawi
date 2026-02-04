# Implementation Plan: Pabawi v1.0.0 Plugin Architecture

## Overview

This implementation plan covers the v1.0.0 release with the primary goal of making the core application completely plugin-agnostic. All integration-specific code (Puppet, Bolt, Hiera, PuppetDB, Puppetserver) must be removed from `backend/` and `frontend/` directories and exist only in `plugins/native/`.

### Priority Order

1. **Remove ALL Hardcoded Plugin References** - Eliminate every trace of Puppet/Bolt/Hiera from shared code
2. **Make Core Plugin-Agnostic** - Backend and frontend should auto-discover plugins, no hardcoded names
3. **Dynamic UI Composition** - All pages render based on plugin-provided widgets
4. **Live Node Journal** - On-demand journal populated from integration data

### Key Design Decision: Zero Hardcoded Plugin References

The `backend/src/` and `frontend/src/` directories MUST NOT contain:

- Any import statements referencing specific plugins (bolt, puppetdb, puppetserver, hiera)
- Any hardcoded plugin names, capability names, or route paths
- Any plugin-specific types, interfaces, or constants
- Any conditional logic based on plugin names

All plugin discovery happens via auto-loading from `plugins/native/` directory.

## Tasks

### Phase 1: Remove ALL Hardcoded Plugin References (PRIORITY)

- [ ] 1. Audit and Remove Backend Hardcoded References
  - [x] 1.1 Scan backend for hardcoded plugin imports
    - Search all files in `backend/src/` for imports from `integrations/bolt`, `integrations/puppetdb`, `integrations/puppetserver`, `integrations/hiera`
    - Search for any direct imports from `plugins/native/`
    - List all files that need modification
    - _Goal: Identify every hardcoded reference_
  
  - [x] 1.2 Remove plugin-specific imports from server.ts
    - Remove any direct plugin imports
    - Remove any hardcoded plugin initialization
    - Use only PluginLoader for plugin discovery
    - _Goal: server.ts knows nothing about specific plugins_
  
  - [x] 1.3 Remove plugin-specific imports from routes
    - Audit all route files in `backend/src/routes/`
    - Remove any imports that reference specific plugins
    - Routes should use CapabilityRegistry to discover capabilities
    - _Goal: Routes are completely plugin-agnostic_
  
  - [x] 1.4 Remove plugin-specific code from IntegrationManager
    - Remove any hardcoded plugin names or types
    - Remove any plugin-specific initialization logic
    - IntegrationManager should only work with generic plugin interfaces
    - _Goal: IntegrationManager is plugin-agnostic_
  
  - [x] 1.5 Remove plugin-specific code from services
    - Audit `backend/src/services/` for plugin references
    - Remove any hardcoded plugin names or capability names
    - Services should query CapabilityRegistry dynamically
    - _Goal: All services are plugin-agnostic_
  
  - [x] 1.6 Clean up types.ts
    - Remove any plugin-specific type definitions
    - Keep only generic plugin interfaces (BasePluginInterface, PluginCapability, PluginWidget)
    - Remove any hardcoded capability name types
    - _Goal: types.ts defines only generic plugin contracts_

- [ ] 2. Audit and Remove Frontend Hardcoded References
  - [x] 2.1 Scan frontend for hardcoded plugin imports
    - Search all files in `frontend/src/` for imports referencing bolt, puppetdb, puppetserver, hiera
    - Search for any direct imports from `plugins/native/`
    - List all files that need modification
    - _Goal: Identify every hardcoded reference_
  
  - [x] 2.2 Remove plugin-specific imports from pages
    - Audit all page components in `frontend/src/pages/`
    - Remove any direct plugin component imports
    - Pages should dynamically load widgets based on plugin registrations
    - _Goal: Pages are completely plugin-agnostic_
  
  - [x] 2.3 Remove plugin-specific imports from components
    - Audit all components in `frontend/src/components/`
    - Remove any hardcoded plugin references
    - Components should work with generic plugin data
    - _Goal: Components are plugin-agnostic_
  
  - [x] 2.4 Remove plugin-specific code from lib/
    - Audit `frontend/src/lib/` for plugin references
    - Remove any hardcoded plugin names or capability names
    - Utility functions should be generic
    - _Goal: All lib code is plugin-agnostic_
  
  - [x] 2.5 Clean up widgets/index.ts
    - Remove any plugin-specific exports
    - Export only generic widget infrastructure
    - Widget discovery should happen via API calls
    - _Goal: widgets/index.ts is plugin-agnostic_

- [ ] 3. Remove Plugin-Specific Route Files
  - [x] 3.1 Remove hardcoded route files
    - Delete any route files that are plugin-specific (e.g., bolt.ts, puppetdb.ts, puppetserver.ts, hiera.ts)
    - Keep only generic route files (integrations.ts, widgets.ts, etc.)
    - _Goal: No plugin-specific route files exist_
  
  - [x] 3.2 Create generic plugin routes
    - Create `/api/v1/plugins/:pluginName/*` route pattern
    - Route requests to plugins dynamically based on pluginName
    - Plugins register their own route handlers
    - _Goal: Single generic route pattern for all plugins_

- [ ] 4. Checkpoint - Hardcoded references removed
  - Run grep to verify no plugin names in backend/src/ or frontend/src/
  - Verify application compiles without errors
  - Verify PluginLoader discovers all plugins

### Phase 2: Delete Legacy Plugin Directories

- [ ] 5. Remove Backend Integration Directories
  - [ ] 5.1 Delete backend/src/integrations/bolt/
    - Remove entire directory
    - Verify no imports reference this path
    - _Goal: Directory does not exist_
  
  - [ ] 5.2 Delete backend/src/integrations/puppetdb/
    - Remove entire directory
    - Verify no imports reference this path
    - _Goal: Directory does not exist_
  
  - [ ] 5.3 Delete backend/src/integrations/puppetserver/
    - Remove entire directory
    - Verify no imports reference this path
    - _Goal: Directory does not exist_
  
  - [ ] 5.4 Delete backend/src/integrations/hiera/
    - Remove entire directory
    - Verify no imports reference this path
    - _Goal: Directory does not exist_
  
  - [ ] 5.5 Clean backend/src/integrations/
    - Keep only: BasePlugin.ts, CapabilityRegistry.ts, IntegrationManager.ts, PluginLoader.ts, PluginManifestSchema.ts, NodeLinkingService.ts, types.ts
    - Remove any other plugin-specific files
    - _Goal: Only generic infrastructure remains_

- [ ] 6. Remove Frontend Widget Directories
  - [ ] 6.1 Delete frontend/src/widgets/bolt/
    - Remove entire directory if exists
    - _Goal: Directory does not exist_
  
  - [ ] 6.2 Delete frontend/src/widgets/puppetdb/
    - Remove entire directory if exists
    - _Goal: Directory does not exist_
  
  - [ ] 6.3 Delete frontend/src/widgets/puppetserver/
    - Remove entire directory if exists
    - _Goal: Directory does not exist_
  
  - [ ] 6.4 Delete frontend/src/widgets/hiera/
    - Remove entire directory if exists
    - _Goal: Directory does not exist_
  
  - [ ] 6.5 Clean frontend/src/widgets/
    - Keep only generic widget infrastructure (index.ts with generic exports)
    - Remove any plugin-specific files
    - _Goal: Only generic infrastructure remains_

- [ ] 7. Remove Legacy Test Files
  - [ ] 7.1 Remove plugin-specific test files from backend/test/
    - Delete tests that directly import from deleted directories
    - Keep tests that use generic plugin interfaces
    - Move plugin-specific tests to plugins/native/{plugin}/test/
    - _Goal: No tests import from deleted directories_
  
  - [ ] 7.2 Update remaining tests
    - Fix any broken imports
    - Update tests to use CapabilityRegistry for plugin discovery
    - _Goal: All tests pass_

- [ ] 8. Checkpoint - Legacy directories removed
  - Verify deleted directories do not exist
  - Verify application compiles
  - Verify all tests pass
  - Verify plugins load correctly

### Phase 3: Dynamic Plugin Loading Infrastructure

- [ ] 9. Enhance PluginLoader for Full Auto-Discovery
  - [ ] 9.1 Update PluginLoader to auto-register routes
    - Plugins define routes in plugin.json manifest
    - PluginLoader registers routes dynamically
    - No hardcoded route registration in server.ts
    - _Goal: Routes are auto-discovered from plugins_
  
  - [ ] 9.2 Update PluginLoader to auto-register widgets
    - Plugins define widgets in plugin.json manifest
    - PluginLoader registers widgets with CapabilityRegistry
    - Frontend fetches widget list from API
    - _Goal: Widgets are auto-discovered from plugins_
  
  - [ ] 9.3 Create plugin API endpoint
    - Create `/api/v1/plugins` endpoint listing all loaded plugins
    - Include plugin metadata, capabilities, widgets
    - Frontend uses this to build dynamic UI
    - _Goal: Frontend discovers plugins via API_

- [ ] 10. Update Frontend for Dynamic Widget Loading
  - [ ] 10.1 Create dynamic widget loader
    - Fetch available widgets from `/api/v1/widgets/slot/:slotName`
    - Dynamically import widget components
    - Render widgets based on API response
    - _Goal: Frontend loads widgets dynamically_
  
  - [ ] 10.2 Update pages to use dynamic widget loading
    - HomePage loads widgets for `home-summary` slot
    - NodeDetailPage loads widgets for `node-detail` slot
    - IntegrationHomePage loads widgets for integration-specific slots
    - _Goal: All pages use dynamic widget loading_

- [ ] 11. Checkpoint - Dynamic loading complete
  - Verify plugins are auto-discovered
  - Verify routes are auto-registered
  - Verify widgets are dynamically loaded
  - Verify UI renders correctly

### Phase 4: Node Detail Widgets Implementation

- [ ] 12. Node Detail Widgets Implementation
  - [ ] 12.1 Create BoltPlugin node-detail widgets
    - Add CommandExecutor widget for `node-detail` slot
    - Add TaskRunner widget for `node-detail` slot
    - Add FactsViewer widget for `node-detail` slot
    - Widgets live in `plugins/native/bolt/frontend/`
    - _Goal: Bolt provides node-detail widgets_
  
  - [ ] 12.2 Create PuppetDBPlugin node-detail widgets
    - Add FactsExplorer widget for `node-detail` slot
    - Add ReportsViewer widget for `node-detail` slot
    - Add EventsViewer widget for `node-detail` slot
    - Add CatalogViewer widget for `node-detail` slot
    - Widgets live in `plugins/native/puppetdb/frontend/`
    - _Goal: PuppetDB provides node-detail widgets_
  
  - [ ] 12.3 Create PuppetserverPlugin node-detail widgets
    - Add CatalogCompilation widget for `node-detail` slot
    - Add EnvironmentInfo widget for `node-detail` slot
    - Add NodeStatus widget for `node-detail` slot
    - Widgets live in `plugins/native/puppetserver/frontend/`
    - _Goal: Puppetserver provides node-detail widgets_
  
  - [ ] 12.4 Create HieraPlugin node-detail widgets
    - Add KeyLookup widget for `node-detail` slot
    - Add HierarchyViewer widget for `node-detail` slot
    - Add NodeHieraData widget for `node-detail` slot
    - Widgets live in `plugins/native/hiera/frontend/`
    - _Goal: Hiera provides node-detail widgets_

- [ ] 13. Checkpoint - Node detail widgets complete
  - Verify all plugin widgets render in node detail page
  - Verify widget functionality works correctly

### Phase 5: Live Node Journal Implementation

- [ ] 14. Live Node Journal Backend
  - [ ] 14.1 Define JournalEntry interface
    - Create `backend/src/services/NodeJournalService.ts`
    - Define JournalEntry type with: timestamp, source plugin, entry type, title, description, metadata
    - Entry types: `event`, `action`, `note`, `alert`
    - _Goal: Generic journal interface defined_
  
  - [ ] 14.2 Implement live journal aggregation
    - Create method to fetch journal entries from all plugins on-demand
    - Each plugin provides a `journal.entries` capability
    - Aggregate and sort entries by timestamp
    - _Goal: Journal aggregates from all plugins_
  
  - [ ] 14.3 Create v1 journal routes
    - Create `/api/v1/nodes/:id/journal` route (GET only - live fetch)
    - Add query parameter support for filtering (type, plugin, date range)
    - _Goal: Journal API endpoint exists_
  
  - [ ] 14.4 Add journal capability to plugins
    - Add `journal.entries` capability to each plugin
    - Plugins return their own journal entries for a node
    - _Goal: All plugins provide journal entries_

- [ ] 15. Live Node Journal Frontend
  - [ ] 15.1 Create NodeJournal timeline component
    - Create `frontend/src/components/NodeJournal.svelte`
    - Display journal entries in chronological timeline
    - Implement filtering by type, plugin, date range
    - Use plugin colors for entry identification
    - _Goal: Journal UI component exists_
  
  - [ ] 15.2 Integrate journal into NodeDetailPage
    - Add "Journal" tab to NodeDetailPage
    - Fetch entries from `/api/v1/nodes/:id/journal` on tab activation
    - _Goal: Journal tab works in node detail_

- [ ] 16. Checkpoint - Live Node Journal complete
  - Verify journal entries are fetched from integrations
  - Verify filtering works correctly
  - Verify timeline displays correctly

### Phase 6: Final Integration and Polish

- [ ] 17. Final Integration
  - [ ] 17.1 Update routing configuration
    - Configure frontend router for new page structure
    - Add routes for `/integrations/:pluginName`
    - Ensure all navigation works correctly
    - _Goal: All routes work_
  
  - [ ] 17.2 Add health status indicators throughout UI
    - Add health indicators to HomeWidgets
    - Add health section to IntegrationHomePage
    - Add error states to plugin tabs on NodeDetailPage
    - _Goal: Health status visible everywhere_
  
  - [ ] 17.3 Implement color theming system
    - Create utility for generating light/dark color variants
    - Apply plugin colors consistently across UI
    - Support dark mode color adjustments
    - _Goal: Consistent color theming_

- [ ] 18. Update Documentation
  - [ ] 18.1 Update architecture documentation
    - Document new plugin directory structure
    - Document auto-discovery mechanism
    - Remove all references to legacy patterns
    - _Goal: Docs reflect new architecture_
  
  - [ ] 18.2 Update plugin development guide
    - Document how to create new plugins
    - Document plugin.json manifest format
    - Document widget registration
    - _Goal: Plugin development is documented_

- [ ] 19. Final Checkpoint - v1.0.0 complete
  - Verify no hardcoded plugin references in backend/src/ or frontend/src/
  - Verify all plugins load from plugins/native/
  - Verify all tests pass
  - Verify all features work end-to-end

## Verification Commands

After each phase, run these commands to verify no hardcoded references remain:

```bash
# Check for hardcoded plugin names in backend
grep -r "bolt\|puppetdb\|puppetserver\|hiera" backend/src/ --include="*.ts" | grep -v "// " | grep -v "node_modules"

# Check for hardcoded plugin names in frontend
grep -r "bolt\|puppetdb\|puppetserver\|hiera" frontend/src/ --include="*.ts" --include="*.svelte" | grep -v "// " | grep -v "node_modules"

# Verify deleted directories don't exist
ls backend/src/integrations/bolt 2>/dev/null && echo "FAIL: bolt dir exists" || echo "OK: bolt dir removed"
ls backend/src/integrations/puppetdb 2>/dev/null && echo "FAIL: puppetdb dir exists" || echo "OK: puppetdb dir removed"
ls backend/src/integrations/puppetserver 2>/dev/null && echo "FAIL: puppetserver dir exists" || echo "OK: puppetserver dir removed"
ls backend/src/integrations/hiera 2>/dev/null && echo "FAIL: hiera dir exists" || echo "OK: hiera dir removed"
```

## Notes

- **No Backwards Compatibility** - Cut old code, don't maintain compatibility
- **Plugin Directory is Source of Truth** - All plugin code in `plugins/native/{pluginName}/`
- **Auto-Discovery Only** - No hardcoded plugin registration
- **Dynamic UI** - Frontend discovers and renders plugins via API
- **Live Journal** - No database storage, entries fetched on-demand from plugins
