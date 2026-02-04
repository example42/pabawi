# Implementation Plan: Pabawi v1.0.0 Plugin Architecture

## Overview

**STATUS: Phase 2 Complete - All Legacy 0.x Code Deleted**

All legacy plugin directories have been removed from `backend/src/integrations/`. The application currently does NOT compile. This is expected and intentional.

### Current State (Post-Deletion)

✅ **Deleted:**

- `backend/src/integrations/bolt/`
- `backend/src/integrations/puppetdb/`
- `backend/src/integrations/puppetserver/`
- `backend/src/integrations/hiera/`
- All plugin-specific test files
- All property-based tests for deleted plugins

✅ **Preserved:**

- Generic infrastructure: `BasePlugin.ts`, `CapabilityRegistry.ts`, `IntegrationManager.ts`, `PluginLoader.ts`, `types.ts`
- Native plugin directories: `plugins/native/bolt/`, `plugins/native/puppetdb/`, etc.
- Frontend widget infrastructure: `frontend/src/widgets/index.ts`

❌ **Broken (Needs Fixing):**

- Backend compilation (70+ TypeScript errors)
- Routes that import deleted services
- Frontend components with hardcoded API endpoints
- Configuration schemas for deleted plugins

### New Priority Order: Get Interface Working

**PRIORITY 1: Fix Compilation Errors** - Make the backend compile
**PRIORITY 2: Fix Core Routes** - Get basic API endpoints working
**PRIORITY 3: Fix Frontend** - Remove hardcoded references, make UI load
**PRIORITY 4: Implement Minimal Plugin** - Get at least one plugin working end-to-end
**PRIORITY 5: Dynamic Features** - Node Journal, Events, full plugin system

## Tasks

### ✅ COMPLETED: Phase 1 & 2 - Delete Legacy Code

- [x] 1. Audit and Remove Backend Hardcoded References
- [x] 2. Audit and Remove Frontend Hardcoded References  
- [x] 3. Remove Plugin-Specific Route Files
- [x] 4. Checkpoint - Hardcoded references removed
- [x] 5. Remove Backend Integration Directories
- [x] 6. Remove Frontend Widget Directories
- [x] 7. Remove Legacy Test Files
- [x] 8. Checkpoint - Legacy directories removed

---

## 🔥 PRIORITY 1: Fix Backend Compilation

**Goal:** Make `npm run build` succeed in backend directory

- [x] P1.1 Fix types.ts - Remove legacy interfaces
  - Remove `InformationSourcePlugin` interface (no longer used)
  - Remove `ExecutionToolPlugin` interface (no longer used)
  - Remove `IntegrationPlugin` interface (no longer used)
  - Keep only v1.x interfaces: `BasePluginInterface`, `PluginCapability`, `PluginWidget`, `PluginMetadata`
  - Remove any hardcoded capability name types
  - _Goal: types.ts compiles with only v1.x types_

- [x] P1.2 Fix IntegrationManager - Remove legacy methods
  - Remove `getExecutionTool()` method
  - Remove `getInformationSource()` method
  - Remove `getAllExecutionTools()` method
  - Remove `getAllInformationSources()` method
  - Remove `executeAction()` method (replaced by CapabilityRegistry)
  - Keep only v1.x methods: `registerPlugin()`, `getPlugin()`, `getAllPlugins()`, `getPluginsByType()`
  - _Goal: IntegrationManager compiles with only v1.x API_

- [x] P1.3 Fix BasePlugin - Update constructor signature
  - Remove old constructor that takes 4 parameters (name, type, logger, performanceMonitor)
  - Use new constructor that takes 0-2 parameters (logger?, performanceMonitor?)
  - Update `metadata` and `capabilities` to be required properties
  - Make `shutdown()` return `Promise<void>` instead of `void`
  - _Goal: BasePlugin matches v1.x interface_

- [x] P1.4 Fix configuration schemas
  - Remove plugin-specific config from `backend/src/config/schema.ts`
  - Remove `puppetdb`, `puppetserver`, `hiera`, `boltProjectPath`, `hieraConfigPath` fields
  - Keep only generic plugin configuration structure
  - Update ConfigService to not reference deleted plugin configs
  - _Goal: Configuration is plugin-agnostic_

- [x] P1.5 Fix routes - Remove broken imports
  - Fix `backend/src/routes/commands.ts` - remove `executeAction()` calls
  - Fix `backend/src/routes/tasks.ts` - remove `executeAction()` calls
  - Fix `backend/src/routes/plugins.ts` - remove legacy plugin registration code
  - Fix `backend/src/routes/v1/plugins.ts` - remove legacy plugin registration code
  - Comment out or stub broken functionality temporarily
  - _Goal: All route files compile_

- [x] P1.6 Fix middleware and services
  - Fix `backend/src/middleware/errorHandler.ts` - remove `boltCommand` field
  - Fix `backend/src/services/IntegrationColorService.ts` - fix type conversion
  - Remove any other compilation errors
  - _Goal: All middleware and services compile_

- [x] P1.7 Checkpoint - Backend compiles
  - Run `npm run build` in backend directory
  - Verify 0 TypeScript errors
  - _Goal: Clean compilation_

---

## 🔥 PRIORITY 2: Fix Core Routes & API

**Goal:** Get basic API endpoints responding (even if with empty data)

- [ ] P2.1 Create stub v1 routes
  - Create `/api/v1/plugins` - return empty array initially
  - Create `/api/v1/capabilities` - return empty array initially
  - Create `/api/v1/widgets` - return empty array initially
  - Create `/api/v1/nodes` - return empty array initially
  - Mount v1 routes in server.ts
  - _Goal: v1 API endpoints exist and respond_

- [ ] P2.2 Update server.ts initialization
  - Remove any hardcoded plugin initialization
  - Use PluginLoader to discover plugins from `plugins/native/`
  - Register discovered plugins with IntegrationManager
  - Handle initialization errors gracefully
  - _Goal: Server starts without errors_

- [ ] P2.3 Fix PluginLoader
  - Ensure PluginLoader can discover plugins from `plugins/native/`
  - Load plugin.json manifests
  - Dynamically import plugin backend code
  - Register capabilities with CapabilityRegistry
  - _Goal: Plugins are auto-discovered_

- [ ] P2.4 Checkpoint - Server starts
  - Run `npm start` in backend directory
  - Verify server starts on port 3000
  - Verify `/api/v1/plugins` endpoint responds
  - _Goal: Backend server is running_

---

## 🔥 PRIORITY 3: Fix Frontend Compilation & Hardcoded References

**Goal:** Make frontend compile and remove hardcoded API endpoints

- [ ] P3.1 Fix frontend components - Remove hardcoded endpoints
  - Fix `CatalogComparison.svelte` - remove `/api/integrations/puppetserver/` endpoints
  - Fix `EnvironmentSelector.svelte` - remove `/api/integrations/puppetserver/` endpoints
  - Fix `PuppetserverStatus.svelte` - remove `/api/integrations/puppetserver/` endpoints
  - Fix `PuppetReportsListView.svelte` - remove `/api/integrations/puppetdb/` endpoints
  - Fix `NodeHieraTab.svelte` - remove `/api/integrations/hiera/` endpoints
  - Replace with dynamic API calls to `/api/v1/capabilities/:name/execute`
  - _Goal: No hardcoded plugin endpoints in components_

- [ ] P3.2 Fix frontend components - Remove plugin-specific logic
  - Fix `PackageInstallInterface.svelte` - remove hardcoded "bolt" references
  - Fix `CommandOutput.svelte` - remove `boltCommand` field
  - Fix `DetailedErrorDisplay.svelte` - remove `boltCommand` field
  - Fix `PuppetReportsSummary.svelte` - make integration badge dynamic
  - _Goal: Components are plugin-agnostic_

- [ ] P3.3 Fix frontend pages
  - Update pages to fetch plugins from `/api/v1/plugins`
  - Update pages to fetch widgets from `/api/v1/widgets/slot/:slotName`
  - Remove any hardcoded plugin assumptions
  - _Goal: Pages use dynamic plugin discovery_

- [ ] P3.4 Fix frontend lib utilities
  - Update API client to use v1 endpoints
  - Remove any hardcoded plugin names from utilities
  - _Goal: Utilities are plugin-agnostic_

- [ ] P3.5 Checkpoint - Frontend compiles
  - Run `npm run build` in frontend directory
  - Verify 0 TypeScript/Svelte errors
  - _Goal: Clean compilation_

---

## 🔥 PRIORITY 4: Implement Minimal Working Plugin

**Goal:** Get at least Bolt plugin working end-to-end as proof of concept

- [ ] P4.1 Implement BoltPlugin v1.x backend
  - Create `plugins/native/bolt/backend/BoltPlugin.ts` implementing `BasePluginInterface`
  - Define metadata with name, version, color, etc.
  - Define capabilities: `bolt:command:execute`, `bolt:inventory:list`, `bolt:facts:query`
  - Implement capability handlers
  - Create plugin.json manifest
  - _Goal: Bolt plugin implements v1.x interface_

- [ ] P4.2 Register BoltPlugin capabilities
  - Register capabilities with CapabilityRegistry
  - Implement RBAC permissions for capabilities
  - Test capability execution via `/api/v1/capabilities/bolt:command:execute/execute`
  - _Goal: Bolt capabilities are executable via API_

- [ ] P4.3 Create BoltPlugin frontend widgets
  - Create `plugins/native/bolt/frontend/HomeWidget.svelte`
  - Create `plugins/native/bolt/frontend/CommandExecutor.svelte`
  - Create `plugins/native/bolt/frontend/InventoryViewer.svelte`
  - Register widgets in plugin.json
  - _Goal: Bolt widgets exist_

- [ ] P4.4 Test end-to-end Bolt functionality
  - Start backend server
  - Verify Bolt plugin loads
  - Verify Bolt capabilities are registered
  - Verify Bolt widgets are available
  - Test command execution from frontend
  - _Goal: Bolt plugin works end-to-end_

---

## 🔴 PRIORITY 5: Implement Remaining Plugins (Lower Priority)

**Goal:** Get PuppetDB, Puppetserver, and Hiera working

- [ ] P5.1 Implement PuppetDBPlugin v1.x
  - Create backend plugin class
  - Define capabilities: `puppetdb:nodes`, `puppetdb:facts`, `puppetdb:reports`, `puppetdb:events`, `puppetdb:catalog`
  - Create frontend widgets
  - _Goal: PuppetDB plugin works_

- [ ] P5.2 Implement PuppetserverPlugin v1.x
  - Create backend plugin class
  - Define capabilities: `puppetserver:catalog`, `puppetserver:environments`, `puppetserver:status`
  - Create frontend widgets
  - _Goal: Puppetserver plugin works_

- [ ] P5.3 Implement HieraPlugin v1.x
  - Create backend plugin class
  - Define capabilities: `hiera:lookup`, `hiera:keys`, `hiera:hierarchy`, `hiera:scan`
  - Create frontend widgets
  - _Goal: Hiera plugin works_

---

## 🔴 PRIORITY 6: Advanced Features (Future)

**Goal:** Implement Node Journal, Events, and full dynamic UI

- [ ] P6.1 Implement Node Journal backend
  - Create NodeJournalService
  - Define JournalEntry interface
  - Create database schema for journal entries
  - Create `/api/v1/nodes/:id/journal` endpoint
  - _Goal: Journal backend exists_

- [ ] P6.2 Implement Node Journal frontend
  - Create NodeJournal.svelte component
  - Add Journal tab to NodeDetailPage
  - Implement filtering and timeline view
  - _Goal: Journal UI works_

- [ ] P6.3 Implement Events integration type
  - Define Events capability interface
  - Update plugins to report events
  - Create EventsViewer widget
  - Link events to journal entries
  - _Goal: Events system works_

- [ ] P6.4 Implement full dynamic UI
  - IntegrationHomePage auto-generates tabs
  - NodeDetailPage auto-generates plugin tabs
  - HomePage renders HomeWidgets dynamically
  - _Goal: Fully dynamic UI_

---

## Verification Commands

```bash
# Check backend compilation
cd backend && npm run build

# Check frontend compilation  
cd frontend && npm run build

# Start backend server
cd backend && npm start

# Verify v1 API endpoints
curl http://localhost:3000/api/v1/plugins
curl http://localhost:3000/api/v1/capabilities
curl http://localhost:3000/api/v1/widgets

# Check for remaining hardcoded references
grep -r "integrations/bolt\|integrations/puppetdb\|integrations/puppetserver\|integrations/hiera" backend/src/ --include="*.ts"
grep -r "/api/integrations/bolt\|/api/integrations/puppetdb\|/api/integrations/puppetserver\|/api/integrations/hiera" frontend/src/ --include="*.ts" --include="*.svelte"
```

---

## Notes

- **Focus on getting it working first** - Don't worry about perfection
- **Stub out broken functionality** - Comment out or return empty data temporarily
- **One plugin at a time** - Get Bolt working before moving to others
- **Test incrementally** - Verify each priority level before moving to next
- **The goal is a working interface** - Even with minimal functionality
