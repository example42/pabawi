# Integration Menu Analysis & Implementation Plan

**Date:** February 1, 2026  
**Version:** 1.0.0  
**Status:** In Progress

## Executive Summary

**Current State:**

- ✅ Menu system is working - integrations organized by category
- ✅ Navigation shows all integrations with colors and health status
- ✅ Generic integration home page component created
- 🔴 Integration tab content is missing (shows "No widget available")
- 🔴 Home page dashboard widgets not appearing
- 🔴 Home page still using old integration status API

**Immediate Priorities:**

1. Fix dashboard widget auto-loading on home page
2. Fix home page integration status display (use v1.0 menu API)
3. Implement widget embedding in integration tabs
4. Create/adapt missing widget components

**Next Session Goals:**

- Debug why WidgetRegistry isn't loading dashboard widgets
- Update HomePage to use `/api/integrations/menu` instead of old status API
- Implement widget component mapping in IntegrationHomePage.svelte
- Get at least one integration's tabs working (e.g., Bolt)

## Overview

This document analyzes the current integration capabilities and widgets to design an automatically generated menu system that organizes integrations by type.

## Current Integrations

### 1. Bolt Integration

**Type:** `RemoteExecution`  
**Color:** `#FFAE1A` (Orange)  
**Icon:** `terminal`  
**Status:** ✅ Full BasePluginInterface v1.0

#### Capabilities

| Capability | Category | Risk | Description |
|------------|----------|------|-------------|
| `bolt.command.execute` | command | execute | Execute shell command on target nodes |
| `bolt.task.execute` | task | execute | Execute Bolt task on target nodes |
| `bolt.inventory.list` | inventory | read | List nodes from Bolt inventory |
| `bolt.facts.query` | info | read | Gather facts from target nodes |
| `bolt.task.list` | task | read | List available Bolt tasks |
| `bolt.task.details` | task | read | Get task metadata and parameters |

#### Widgets

| Widget ID | Name | Slots | Size | Required Capability |
|-----------|------|-------|------|---------------------|
| `bolt:command-executor` | Command Executor | dashboard, node-detail, standalone-page | medium | bolt.command.execute |
| `bolt:task-runner` | Task Runner | dashboard, node-detail, standalone-page | large | bolt.task.execute |
| `bolt:inventory-viewer` | Inventory Viewer | dashboard, inventory-panel, sidebar | medium | bolt.inventory.list |
| `bolt:task-browser` | Task Browser | dashboard, sidebar | small | bolt.task.list |

#### CLI Commands

```bash
pab bolt run "command" --targets all
pab bolt task <task> --targets web-01 --params '{}'
pab bolt inventory
pab bolt facts <node>
pab bolt tasks [--module <module>]
```

### 2. PuppetDB Integration

**Type:** `Info`  
**Color:** `#9063CD` (Violet)  
**Icon:** `database`  
**Status:** ✅ Full BasePluginInterface v1.0

#### Capabilities

| Capability | Category | Risk | Description |
|------------|----------|------|-------------|
| `puppetdb.query` | info | read | Execute PQL queries against PuppetDB |
| `puppetdb.nodes` | inventory | read | List nodes from PuppetDB inventory |
| `puppetdb.facts` | info | read | Get facts for a specific node |
| `puppetdb.reports` | info | read | Get reports for a node |
| `puppetdb.report` | info | read | Get specific report by hash |
| `puppetdb.reports.summary` | info | read | Get aggregated report statistics |
| `puppetdb.reports.all` | info | read | Get all recent reports |
| `puppetdb.events` | info | read | Get events for a node |
| `puppetdb.catalog` | info | read | Get catalog for a node |
| `puppetdb.catalog.resources` | info | read | Get catalog resources by type |
| `puppetdb.stats` | info | read | Get PuppetDB summary statistics |

#### Widgets

| Widget ID | Name | Slots | Size | Required Capability |
|-----------|------|-------|------|---------------------|
| `puppetdb:node-browser` | Node Browser | dashboard, inventory-panel, standalone-page | large | puppetdb.nodes |
| `puppetdb:facts-explorer` | Facts Explorer | node-detail, standalone-page, modal | large | puppetdb.facts |
| `puppetdb:reports-viewer` | Reports Viewer | dashboard, node-detail, standalone-page | large | puppetdb.reports |
| `puppetdb:reports-summary` | Reports Summary | dashboard, sidebar | small | puppetdb.reports.summary |

#### CLI Commands

```bash
pab puppetdb query "nodes { certname ~ 'web' }"
pab puppetdb nodes [--query "filter"]
pab puppetdb facts <node>
pab puppetdb reports <node> [--limit 10]
```

### 3. Puppetserver Integration

**Type:** `ConfigurationManagement`  
**Color:** `#2E3A87` (Blue)  
**Icon:** `server`  
**Status:** ✅ Full BasePluginInterface v1.0

#### Capabilities

| Capability | Category | Risk | Description |
|------------|----------|------|-------------|
| `puppetserver.catalog` | config | execute | Compile catalog for a node |
| `puppetserver.catalog.get` | config | read | Get catalog for a node |
| `puppetserver.catalog.compare` | config | read | Compare catalogs between environments |
| `puppetserver.environments` | config | read | List available environments |
| `puppetserver.environment` | config | read | Get specific environment details |
| `puppetserver.environment.deploy` | config | execute | Deploy/refresh an environment |
| `puppetserver.environment.cache.flush` | config | execute | Flush environment cache |
| `puppetserver.facts` | info | read | Get facts for a node |
| `puppetserver.status` | info | read | Get Puppetserver status |
| `puppetserver.status.services` | info | read | Get detailed services status |
| `puppetserver.metrics` | info | read | Get Puppetserver metrics |
| `puppetserver.admin` | admin | read | Get admin API information |

#### Widgets

| Widget ID | Name | Slots | Size | Required Capability |
|-----------|------|-------|------|---------------------|
| `puppetserver:environment-manager` | Environment Manager | dashboard, standalone-page | large | puppetserver.environments |
| `puppetserver:status-dashboard` | Status Dashboard | dashboard, sidebar | medium | puppetserver.status |

#### CLI Commands

```bash
pab puppetserver catalog <node> [--environment production]
pab puppetserver compare <node> --env1 prod --env2 staging
pab puppetserver environments
pab puppetserver deploy <environment>
pab puppetserver status
```

### 4. Hiera Integration

**Type:** `Info`  
**Color:** `#C1272D` (Red)  
**Icon:** `search` (suggested)  
**Status:** ⚠️ Legacy InformationSourcePlugin (needs v1.0 upgrade)

#### Current Features (Legacy API)

- Hiera key lookup and resolution
- Node-specific Hiera data
- Key-value grid browsing
- Hierarchy viewer
- Code analysis (Puppet manifests, Hiera data)

#### Widgets (Frontend)

| Widget | File | Purpose |
|--------|------|---------|
| HieraExplorer | HieraExplorer.svelte | Browse all Hiera keys and values |
| NodeHieraData | NodeHieraData.svelte | View Hiera data for specific node |
| KeyLookup | KeyLookup.svelte | Look up specific Hiera key |
| KeyValuesGrid | KeyValuesGrid.svelte | Grid view of key-value pairs |
| HierarchyViewer | HierarchyViewer.svelte | Visualize Hiera hierarchy |
| CodeAnalysis | CodeAnalysis.svelte | Analyze Puppet code and Hiera usage |

#### Recommended v1.0 Capabilities

```typescript
// Suggested capability structure for Hiera v1.0 upgrade
capabilities: [
  { category: "config", name: "hiera.lookup", riskLevel: "read" },
  { category: "config", name: "hiera.resolve", riskLevel: "read" },
  { category: "config", name: "hiera.hierarchy", riskLevel: "read" },
  { category: "info", name: "hiera.node.data", riskLevel: "read" },
  { category: "info", name: "hiera.keys.list", riskLevel: "read" },
  { category: "audit", name: "hiera.code.analyze", riskLevel: "read" }
]
```

## Integration Type Categorization

Based on the integrations analysis, here's the proposed menu structure:

### 1. Remote Execution

- **Bolt**: Integration home page with capability tabs

### 2. Configuration Management

- **Puppetserver**: Integration home page with capability tabs
- **Hiera** (future): Integration home page with capability tabs

### 3. Information/Reporting

- **PuppetDB**: Integration home page with capability tabs

## Proposed Menu Structure

### Current Menu (Static)

```
Home | Inventory | Executions | Puppet | Setup
```

### New Menu Structure (Dynamic + Organized)

```
┌─ Core ─────────────────────────────────────────────────────┐
│ Home                                                        │
├─ Dynamic Integrations (Auto-Generated by Active Plugins) ──┤
│ ▼ Remote Execution                                         │
│   └─ Bolt → /integrations/bolt                             │
│      (home page with tabs: Commands, Tasks, Inventory)     │
│                                                             │
│ ▼ Configuration Management                                 │
│   ├─ Puppetserver → /integrations/puppetserver             │
│   │  (tabs: Environments, Catalogs, Status)                │
│   └─ Hiera → /integrations/hiera                           │
│      (tabs: Explorer, Lookups, Code Analysis)              │
│                                                             │
│ ▼ Info & Reporting                                         │
│   └─ PuppetDB → /integrations/puppetdb                     │
│      (tabs: Facts, Reports, Events, Catalogs)              │
├─ Legacy ───────────────────────────────────────────────────┤
│ Inventory → /inventory                                      │
│ Executions → /executions                                    │
├─ Administration ───────────────────────────────────────────┤
│ Users → /admin/users                                        │
│ Roles → /admin/roles                                        │
│ Plugins → /admin/plugins                                    │
│ Settings → /admin/settings                                  │
└─────────────────────────────────────────────────────────────┘
```

### Integration Home Page Structure

Each integration has a dedicated home page at `/integrations/{name}` with:

**Example: /integrations/bolt**

```
┌─ Bolt Integration ────────────────────────────────────────┐
│ [Header with Bolt branding, color: #FFAE1A, icon]         │
├─ Tabs (Auto-Generated from Capabilities) ─────────────────┤
│ ┌─────┬──────┬───────────┬───────┐                        │
│ │ Commands │ Tasks │ Inventory │ Facts │                  │
│ └─────┴──────┴───────────┴───────┘                        │
│                                                             │
│ [Active Tab Content - Widget Embedded Here]                │
│ • Commands tab → CommandExecutor widget                    │
│ • Tasks tab → TaskRunner widget                            │
│ • Inventory tab → InventoryViewer widget                   │
│ • Facts tab → Facts query widget                           │
└─────────────────────────────────────────────────────────────┘
```

**Example: /integrations/puppetdb**

```
┌─ PuppetDB Integration ────────────────────────────────────┐
│ [Header with PuppetDB branding, color: #9063CD, icon]     │
├─ Tabs (Auto-Generated) ───────────────────────────────────┤
│ ┌──────┬─────────┬────────┬──────────┬───────┐           │
│ │ Nodes │ Facts │ Reports │ Events │ Catalogs │           │
│ └──────┴─────────┴────────┴──────────┴───────┘           │
│                                                             │
│ [Active Tab Content]                                        │
│ • Nodes tab → NodeBrowser widget                           │
│ • Facts tab → FactsExplorer widget                         │
│ • Reports tab → ReportsViewer widget                       │
│ • Events tab → Events viewer widget                        │
│ • Catalogs tab → Catalog viewer widget                     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Backend Infrastructure ✅ (Mostly Done)

- [x] BasePluginInterface with metadata, capabilities, widgets
- [x] IntegrationType enumeration
- [x] CapabilityRegistry for capability routing
- [x] Plugin health checks and status
- [ ] **NEW:** Add endpoint `/api/integrations/menu` to list integration menu structure

### Phase 2: Menu Data Endpoint (TODO)

Create `/api/integrations/menu` endpoint that returns grouped integrations by type:

```typescript
interface IntegrationMenuData {
  // Integration types with their member integrations
  categories: {
    type: IntegrationType;        // "RemoteExecution", "ConfigurationManagement", etc.
    label: string;                 // "Remote Execution", "Configuration Management"
    description: string;
    icon: string;
    priority: number;
    integrations: {
      name: string;                // "bolt", "puppetdb", etc.
      displayName: string;         // "Bolt", "PuppetDB"
      description: string;
      color: string;               // "#FFAE1A"
      icon: string;                // SVG path or icon name
      enabled: boolean;
      healthy: boolean;
      path: string;                // "/integrations/bolt"
      
      // Capability tabs for the integration home page
      tabs: {
        id: string;                // "commands", "tasks", "inventory"
        label: string;             // "Commands", "Tasks", "Inventory"
        capability: string;        // "bolt.command.execute"
        widget?: string;           // Widget ID to render in tab
        icon?: string;
        priority: number;
      }[];
    }[];
  }[];
  
  // Legacy routes (preserved for backward compatibility)
  legacy: {
    label: string;
    path: string;
    icon?: string;
  }[];
}
```

**Example Response:**

```json
{
  "categories": [
    {
      "type": "RemoteExecution",
      "label": "Remote Execution",
      "icon": "terminal",
      "priority": 100,
      "integrations": [
        {
          "name": "bolt",
          "displayName": "Bolt",
          "color": "#FFAE1A",
          "icon": "terminal",
          "enabled": true,
          "healthy": true,
          "path": "/integrations/bolt",
          "tabs": [
            {
              "id": "commands",
              "label": "Commands",
              "capability": "bolt.command.execute",
              "widget": "bolt:command-executor",
              "icon": "terminal",
              "priority": 100
            },
            {
              "id": "tasks",
              "label": "Tasks",
              "capability": "bolt.task.execute",
              "widget": "bolt:task-runner",
              "icon": "play",
              "priority": 90
            },
            {
              "id": "inventory",
              "label": "Inventory",
              "capability": "bolt.inventory.list",
              "widget": "bolt:inventory-viewer",
              "priority": 80
            }
          ]
        }
      ]
    },
    {
      "type": "Info",
      "label": "Info & Reporting",
      "icon": "database",
      "priority": 80,
      "integrations": [
        {
          "name": "puppetdb",
          "displayName": "PuppetDB",
          "color": "#9063CD",
          "path": "/integrations/puppetdb",
          "tabs": [
            {
              "id": "facts",
              "label": "Facts",
              "capability": "puppetdb.facts",
              "widget": "puppetdb:facts-explorer"
            },
            {
              "id": "reports",
              "label": "Reports",
              "capability": "puppetdb.reports",
              "widget": "puppetdb:reports-viewer"
            }
          ]
        }
      ]
    }
  ],
  "legacy": [
    { "label": "Inventory", "path": "/inventory", "icon": "server" },
    { "label": "Executions", "path": "/executions", "icon": "list" }
  ]
}
```

### Phase 3: Frontend Menu Generation ✅ (COMPLETED)

1. **MenuBuilder Enhancement** ✅
   - Fetch integration menu data from `/api/integrations/menu`
   - Auto-generate category groups (Remote Execution, Configuration Management, etc.)
   - Each category contains integration links (not individual capabilities)
   - Preserve Legacy section with Inventory and Executions
   - Preserve Administration section
   - Respect RBAC permissions (hide categories/integrations user can't access)

2. **DynamicNavigation Updates** ✅
   - Add integration categories as collapsible groups
   - Show integration names (not individual capabilities) as menu items
   - Link to integration home pages (`/integrations/{name}`)
   - Use integration colors for group headers
   - Show health status indicators (colored dot) next to integration names
   - Add Legacy and Administration sections

3. **IntegrationHomePage Component** ✅
   - Created basic component at `/integrations/:integrationName`
   - Loads integration metadata from plugin
   - Generates tabs from capabilities
   - Shows integration branding (color, icon, description)
   - Displays health status

### Phase 4: Integration-Specific Pages (TODO - CURRENT PRIORITY)

**Status:** The generic `IntegrationHomePage.svelte` exists but needs to be populated with tab content and widgets for each integration.

**Blockers:**

- Tab widgets are not being rendered (empty state shown)
- Need to create integration-specific tab content components
- Widget embedding system needs to be connected to tabs

**Required Tasks:**

1. **Create Bolt Integration Pages** 🔴 PRIORITY
   - `/integrations/bolt?tab=commands` - Command executor (embed `CommandExecutor.svelte`)
   - `/integrations/bolt?tab=tasks` - Task runner (embed `TaskRunner.svelte`)
   - `/integrations/bolt?tab=inventory` - Inventory viewer (embed `InventoryViewer.svelte`)
   - `/integrations/bolt?tab=facts` - Facts query interface (create new component)

2. **Create PuppetDB Integration Pages** 🔴 PRIORITY
   - `/integrations/puppetdb?tab=nodes` - Node browser (embed `NodeBrowser.svelte`)
   - `/integrations/puppetdb?tab=facts` - Facts explorer (embed `FactsExplorer.svelte`)
   - `/integrations/puppetdb?tab=reports` - Reports viewer (embed `ReportsViewer.svelte`)
   - `/integrations/puppetdb?tab=events` - Events viewer (create new component)
   - `/integrations/puppetdb?tab=catalogs` - Catalog viewer (create new component)

3. **Create Puppetserver Integration Pages** 🔴 PRIORITY
   - `/integrations/puppetserver?tab=environments` - Environment manager (embed `EnvironmentManager.svelte`)
   - `/integrations/puppetserver?tab=catalogs` - Catalog compiler/viewer (create new component)
   - `/integrations/puppetserver?tab=status` - Status dashboard (embed `StatusDashboard.svelte`)

4. **Create Hiera Integration Pages** 🟡 MEDIUM
   - `/integrations/hiera?tab=explorer` - Hiera explorer (embed `HieraExplorer.svelte`)
   - `/integrations/hiera?tab=lookup` - Key lookup (embed `KeyLookup.svelte`)
   - `/integrations/hiera?tab=hierarchy` - Hierarchy viewer (embed `HierarchyViewer.svelte`)
   - `/integrations/hiera?tab=code-analysis` - Code analysis (embed `CodeAnalysis.svelte`)

5. **Widget Tab Embedding System** 🔴 PRIORITY
   - Enhance `IntegrationHomePage.svelte` to properly embed widgets in tabs
   - Connect widget IDs from tab metadata to actual Svelte components
   - Implement lazy loading for tab content (don't load all widgets upfront)
   - Handle missing widgets gracefully (show fallback UI)
   - Pass context to widgets (integration name, node selection, etc.)

### Phase 5: Home Page Dashboard Improvements (TODO - CURRENT PRIORITY)

**Status:** Home page exists but has issues:

- Integration status using old API (`/api/integrations/status` - legacy format)
- Dashboard widgets not automatically shown from v1.0 plugins
- WidgetSlot component exists but widgets not registering for "dashboard" slot

**Required Tasks:**

1. **Update Integration Status Display** 🔴 PRIORITY
   - Change from `/api/integrations/status` to use data from `/api/integrations/menu`
   - Display integration health from menu data (per-integration healthy status)
   - Show integration count by category
   - Link integration status cards to integration home pages
   - Use integration colors for status cards

2. **Fix Dashboard Widget Auto-Loading** 🔴 PRIORITY
   - Verify WidgetRegistry is loading widgets from plugins
   - Ensure widgets with `slots: ['dashboard']` are being registered
   - Debug why WidgetSlot is showing empty state
   - Check widget loading in:
     - Bolt: `bolt:task-browser` (should show on dashboard)
     - PuppetDB: `puppetdb:reports-summary` (should show on dashboard)
   - Verify widget components exist and are properly exported

3. **Dashboard Widget Layout** 🟡 MEDIUM
   - Implement proper grid layout for dashboard widgets
   - Respect widget size hints (small, medium, large)
   - Allow widget reordering (future: drag-and-drop)
   - Save user's widget layout preferences to localStorage

### Phase 6: Widget Slot System Enhancement (FUTURE)

Allow widgets to be:

- Embedded in integration pages ✅ (basic support exists)
- Added to dashboards 🔴 (needs fixing)
- Opened in modals (future)
- Shown in sidebars (future)

## Current Status Summary (February 1, 2026)

### ✅ What's Working

1. **Backend Infrastructure**
   - `/api/integrations/menu` endpoint generates menu structure ✅
   - Integration categories by type (RemoteExecution, ConfigurationManagement, Info) ✅
   - Tab generation from capabilities + widgets ✅
   - Health status checking ✅
   - RBAC permission filtering ✅

2. **Frontend Navigation**
   - DynamicNavigation displays categorized integrations ✅
   - Integration colors and icons ✅
   - Health status indicators ✅
   - Legacy and Administration sections ✅
   - Collapsible categories ✅

3. **Generic Integration Home Page**
   - `IntegrationHomePage.svelte` component created ✅
   - Loads integration metadata from `/api/integrations/menu` ✅
   - Tab navigation UI ✅
   - Integration branding (color, icon, header) ✅
   - Deep linking support (`?tab=<id>`) ✅

### 🔴 What's Broken/Missing

1. **Integration Tab Content** (CRITICAL)
   - Tabs show "No widget available" message
   - Widget components not being loaded/embedded in tabs
   - Need to connect widget IDs to actual Svelte components
   - Missing integration-specific page components

2. **Home Page Dashboard** (CRITICAL)
   - Still using old integration status API format
   - Dashboard widgets not automatically appearing
   - WidgetSlot showing "No dashboard widgets available"
   - Need to debug widget registration system

3. **Integration Pages Missing** (CRITICAL)
   - No dedicated content for Bolt tabs
   - No dedicated content for PuppetDB tabs
   - No dedicated content for Puppetserver tabs
   - Hiera widgets exist but not connected to tab system

### 🟡 Next Immediate Steps

**Priority 1: Fix Dashboard Widgets (Home Page)**

1. Debug WidgetRegistry - why aren't widgets being registered?
2. Check plugin widget metadata (ensure `slots: ['dashboard']` is set)
3. Verify WidgetSlot component is querying WidgetRegistry correctly
4. Fix integration status on home page (use `/api/integrations/menu` instead of old API)

**Priority 2: Implement Integration Tab Content**

1. Create widget mapping system in `IntegrationHomePage.svelte`
2. Map widget IDs to actual Svelte component imports:

   ```typescript
   const widgetComponents = {
     'bolt:command-executor': () => import('@/components/CommandExecutor.svelte'),
     'bolt:task-runner': () => import('@/components/TaskRunner.svelte'),
     // etc.
   };
   ```

3. Lazy load widget components when tab is activated
4. Handle missing widgets with informative fallback UI

**Priority 3: Create Missing Integration Content**

1. Bolt - ensure CommandExecutor, TaskRunner, InventoryViewer are embeddable
2. PuppetDB - create/adapt NodeBrowser, FactsExplorer, ReportsViewer
3. Puppetserver - create/adapt EnvironmentManager, StatusDashboard
4. Hiera - adapt existing widgets for tab embedding

## Next Steps 2

### 1. Fix Dashboard Widget Loading 🔴 IMMEDIATE

**Goal:** Make dashboard widgets from plugins automatically appear on home page.

**Investigation Steps:**

- Check if plugins are properly defining widgets with `slots: ['dashboard']`
- Verify WidgetRegistry is being populated at app startup
- Debug WidgetSlot component's widget query logic
- Check widget component exports and paths

**Files to Examine:**

- `backend/src/integrations/bolt/BoltPlugin.ts` - widget definitions
- `backend/src/integrations/puppetdb/PuppetDBPlugin.ts` - widget definitions
- `frontend/src/lib/plugins/WidgetRegistry.ts` - registration logic
- `frontend/src/lib/plugins/WidgetSlot.svelte` - rendering logic
- `frontend/src/pages/HomePage.svelte` - widget slot usage

**Success Criteria:**

- `bolt:task-browser` widget appears on dashboard
- `puppetdb:reports-summary` widget appears on dashboard
- Widgets respect user capabilities (filtered by permissions)

### 2. Fix Home Page Integration Status 🔴 IMMEDIATE

**Goal:** Update home page to use v1.0 integration data instead of legacy status API.

**Required Changes:**

- Change from `/api/integrations/status` to `/api/integrations/menu`
- Extract health status from menu data
- Show integration count by category
- Link status cards to integration home pages
- Use integration colors for visual consistency

**Files to Update:**

- `frontend/src/pages/HomePage.svelte` - change API endpoint and data structure
- `frontend/src/components/IntegrationStatus.svelte` - update to use menu data format

**Success Criteria:**

- Integration status shows current v1.0 plugin health
- Status cards are color-coded by integration
- Clicking status card navigates to integration home page
- Shows category groupings (e.g., "Remote Execution: 1 integration, healthy")

### 3. Implement Widget Embedding in Tabs 🔴 IMMEDIATE

**Goal:** Make integration tabs actually show widget content instead of "No widget available".

**Required Changes:**

- Create widget component mapping in `IntegrationHomePage.svelte`
- Implement dynamic import system for widgets
- Add lazy loading (load widget only when tab is activated)
- Handle missing widgets gracefully

**Implementation:**

```svelte
<!-- In IntegrationHomePage.svelte -->
<script>
  const widgetComponents = {
    'bolt:command-executor': () => import('@/components/bolt/CommandExecutor.svelte'),
    'bolt:task-runner': () => import('@/components/bolt/TaskRunner.svelte'),
    'bolt:inventory-viewer': () => import('@/components/bolt/InventoryViewer.svelte'),
    'bolt:task-browser': () => import('@/components/bolt/TaskBrowser.svelte'),
    'puppetdb:node-browser': () => import('@/components/puppetdb/NodeBrowser.svelte'),
    'puppetdb:facts-explorer': () => import('@/components/puppetdb/FactsExplorer.svelte'),
    'puppetdb:reports-viewer': () => import('@/components/puppetdb/ReportsViewer.svelte'),
    'puppetdb:reports-summary': () => import('@/components/puppetdb/ReportsSummary.svelte'),
    'puppetserver:environment-manager': () => import('@/components/puppetserver/EnvironmentManager.svelte'),
    'puppetserver:status-dashboard': () => import('@/components/puppetserver/StatusDashboard.svelte'),
  };
  
  let loadedWidget = $state(null);
  
  async function loadWidgetForTab(tab) {
    if (!tab.widget || !widgetComponents[tab.widget]) {
      loadedWidget = null;
      return;
    }
    
    try {
      const module = await widgetComponents[tab.widget]();
      loadedWidget = module.default;
    } catch (err) {
      console.error(`Failed to load widget ${tab.widget}:`, err);
      loadedWidget = null;
    }
  }
</script>

<!-- In tab content area -->
{#if currentTab}
  {#if loadedWidget}
    <svelte:component this={loadedWidget} integration={integration.name} />
  {:else if currentTab.widget}
    <div class="loading">Loading widget...</div>
  {:else}
    <div class="fallback">
      No widget available for {currentTab.label}.
      Capability: {currentTab.capability}
    </div>
  {/if}
{/if}
```

**Files to Update:**

- `frontend/src/pages/IntegrationHomePage.svelte` - add widget loading logic
- Create/verify widget components exist at expected paths

**Success Criteria:**

- Opening `/integrations/bolt?tab=commands` shows CommandExecutor widget
- Opening `/integrations/puppetdb?tab=reports` shows ReportsViewer widget
- Tab content loads lazily (only when tab is activated)
- Missing widgets show helpful fallback message

### 4. Create Missing Widget Components 🟡 MEDIUM PRIORITY

**Goal:** Ensure all integration tabs have corresponding widget components.

**Required Components:**

**Bolt:**

- ✅ `CommandExecutor.svelte` (exists)
- ✅ `TaskRunner.svelte` (exists)
- 🔶 `InventoryViewer.svelte` (may need adaptation)
- ❌ `TaskBrowser.svelte` (needs creation or adaptation)

**PuppetDB:**

- 🔶 `NodeBrowser.svelte` (may exist, needs verification)
- 🔶 `FactsExplorer.svelte` (may exist, needs verification)
- 🔶 `ReportsViewer.svelte` (may exist, needs verification)
- ❌ `ReportsSummary.svelte` (dashboard widget, may be missing)
- ❌ Events viewer (not yet implemented)
- ❌ Catalog viewer (not yet implemented)

**Puppetserver:**

- 🔶 `EnvironmentManager.svelte` (may exist, needs verification)
- 🔶 `StatusDashboard.svelte` (may exist, needs verification)
- ❌ Catalog compiler interface (needs creation)

**Hiera:**

- ✅ `HieraExplorer.svelte` (exists)
- ✅ `KeyLookup.svelte` (exists)
- ✅ `HierarchyViewer.svelte` (exists)
- ✅ `CodeAnalysis.svelte` (exists)

**Action Items:**

1. Audit existing widgets in `frontend/src/components/` and `frontend/src/widgets/`
2. Identify which components need creation vs adaptation
3. Create missing components or adapt existing ones for tab embedding
4. Ensure all components accept consistent props (integration name, context, etc.)

### 5. Update Backend Plugin Widget Metadata 🟡 MEDIUM PRIORITY

**Goal:** Ensure all backend plugins correctly define their widgets with proper metadata.

**Verification Checklist:**
For each plugin (`BoltPlugin.ts`, `PuppetDBPlugin.ts`, `PuppetserverPlugin.ts`), verify:

- Widget ID matches frontend component mapping
- `slots` array correctly specifies where widget can appear (`dashboard`, `standalone-page`, etc.)
- `requiredCapabilities` correctly matches plugin capabilities
- `priority` is set for sorting
- `size` hint is appropriate (`small`, `medium`, `large`)

**Example:**

```typescript
widgets: [
  {
    id: 'bolt:command-executor',
    name: 'Command Executor',
    description: 'Execute shell commands on target nodes',
    slots: ['dashboard', 'standalone-page', 'node-detail'],
    requiredCapabilities: ['bolt.command.execute'],
    size: 'medium',
    priority: 90,
    icon: 'terminal'
  }
]
```

## Technical Details

### Integration Home Page Tab Generation

**Algorithm:**

1. Load plugin from IntegrationManager by name
2. Extract all capabilities from plugin
3. Group capabilities by category (command, task, info, config, etc.)
4. For each capability:
   - Find matching widget (if any) via `requiredCapabilities` field
   - Create tab definition:
     - ID: Last part of capability name (e.g., "command.execute" → "execute")
     - Label: Humanized capability description
     - Widget: Widget component to render
     - Icon: From widget or default category icon
     - Priority: From widget or default
5. Sort tabs by priority (highest first)
6. Filter tabs by user permissions

**Example Tab Generation for Bolt:**

```typescript
// Input: Bolt plugin with 6 capabilities + 4 widgets
const boltPlugin = plugins.get('bolt');

// Output: Tab configuration
const tabs = [
  {
    id: 'commands',
    label: 'Commands',
    capability: 'bolt.command.execute',
    widget: 'bolt:command-executor',
    icon: 'terminal',
    priority: 100,
    component: () => import('@/widgets/bolt/CommandExecutor.svelte')
  },
  {
    id: 'tasks',
    label: 'Tasks',
    capability: 'bolt.task.execute',
    widget: 'bolt:task-runner',
    icon: 'play',
    priority: 90,
    component: () => import('@/widgets/bolt/TaskRunner.svelte')
  },
  {
    id: 'inventory',
    label: 'Inventory',
    capability: 'bolt.inventory.list',
    widget: 'bolt:inventory-viewer',
    icon: 'server',
    priority: 80,
    component: () => import('@/widgets/bolt/InventoryViewer.svelte')
  },
  {
    id: 'facts',
    label: 'Facts',
    capability: 'bolt.facts.query',
    widget: null, // No dedicated widget, show simple facts query form
    icon: 'info',
    priority: 70
  }
];
```

### Menu Data Endpoint Implementation

**Backend Route:** `GET /api/integrations/menu`

**Handler Logic:**

```typescript
// In backend/src/routes/integrations.ts
router.get('/menu', async (req, res) => {
  const user = req.user; // From auth middleware
  const integrationManager = req.app.get('integrationManager');
  
  // Get all v1.0 plugins
  const plugins = integrationManager.getAllV1Plugins();
  
  // Group by integration type
  const categoriesMap = new Map<IntegrationType, {
    type: IntegrationType,
    label: string,
    icon: string,
    priority: number,
    integrations: IntegrationMenuItem[]
  }>();
  
  for (const [name, plugin] of plugins) {
    const { metadata, capabilities, widgets } = plugin;
    
    // Skip if disabled or unhealthy
    if (!plugin.isEnabled()) continue;
    
    // Generate tabs from capabilities
    const tabs = generateTabsFromCapabilities(capabilities, widgets, user);
    
    // Group by integration type
    let category = categoriesMap.get(metadata.integrationType);
    if (!category) {
      const metadata = getIntegrationTypeMetadata(metadata.integrationType);
      category = {
        type: metadata.integrationType,
        label: metadata.label,
        icon: metadata.icon,
        priority: metadata.priority,
        integrations: []
      };
      categoriesMap.set(metadata.integrationType, category);
    }
    
    // Add integration to category
    category.integrations.push({
      name: metadata.name,
      displayName: metadata.name.charAt(0).toUpperCase() + metadata.name.slice(1),
      description: metadata.description,
      color: metadata.color,
      icon: metadata.icon,
      enabled: true,
      healthy: await plugin.healthCheck().then(h => h.status === 'healthy'),
      path: `/integrations/${metadata.name}`,
      tabs: tabs
    });
  }
  
  // Sort categories by priority
  const categories = Array.from(categoriesMap.values())
    .sort((a, b) => b.priority - a.priority);
  
  // Legacy routes
  const legacy = [
    { label: 'Inventory', path: '/inventory', icon: 'server' },
    { label: 'Executions', path: '/executions', icon: 'list' }
  ];
  
  res.json({ categories, legacy });
});
```

### Permission Filtering

```typescript
// In MenuBuilder - filter at multiple levels
class MenuBuilder {
  // 1. Filter entire categories (hide if no accessible integrations)
  private filterCategories(categories: Category[], user: User): Category[] {
    return categories
      .map(cat => ({
        ...cat,
        integrations: this.filterIntegrations(cat.integrations, user)
      }))
      .filter(cat => cat.integrations.length > 0); // Hide empty categories
  }
  
  // 2. Filter integrations (hide if no accessible tabs)
  private filterIntegrations(integrations: Integration[], user: User): Integration[] {
    return integrations
      .map(int => ({
        ...int,
        tabs: this.filterTabs(int.tabs, user)
      }))
      .filter(int => int.tabs.length > 0); // Hide if user can't access any tabs
  }
  
  // 3. Filter tabs by capability permissions
  private filterTabs(tabs: Tab[], user: User): Tab[] {
    return tabs.filter(tab => 
      !tab.capability || user.hasCapability(tab.capability)
    );
  }
}
```

### Integration Home Page Component

```svelte
<!-- IntegrationHomePage.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from './router.svelte';
  import { get } from './api';
  import WidgetSlot from './WidgetSlot.svelte';
  
  // Get integration name from route params
  const integrationName = $derived(page.params.integrationName);
  const activeTab = $derived(page.query.tab || null);
  
  let integration = $state(null);
  let tabs = $state([]);
  let currentTab = $state(null);
  
  onMount(async () => {
    // Load integration data
    const menuData = await get('/api/integrations/menu');
    
    // Find this integration in the menu data
    for (const category of menuData.categories) {
      const found = category.integrations.find(i => i.name === integrationName);
      if (found) {
        integration = found;
        tabs = found.tabs;
        currentTab = activeTab 
          ? tabs.find(t => t.id === activeTab) || tabs[0]
          : tabs[0];
        break;
      }
    }
  });
  
  function setTab(tab) {
    currentTab = tab;
    // Update URL with tab query param
    navigate(`/integrations/${integrationName}?tab=${tab.id}`);
  }
</script>

{#if integration}
  <!-- Integration Header -->
  <header class="border-b" style="border-color: {integration.color}">
    <div class="flex items-center gap-4 p-6">
      <div class="text-4xl" style="color: {integration.color}">
        {integration.icon}
      </div>
      <div>
        <h1 class="text-3xl font-bold">{integration.displayName}</h1>
        <p class="text-gray-600">{integration.description}</p>
      </div>
      <div class="ml-auto">
        {#if integration.healthy}
          <span class="flex items-center gap-2 text-green-600">
            <span class="h-2 w-2 rounded-full bg-green-600"></span>
            Healthy
          </span>
        {:else}
          <span class="flex items-center gap-2 text-yellow-600">
            <span class="h-2 w-2 rounded-full bg-yellow-600"></span>
            Degraded
          </span>
        {/if}
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <nav class="flex gap-1 px-6">
      {#each tabs as tab}
        <button
          onclick={() => setTab(tab)}
          class="px-4 py-2 font-medium rounded-t-lg transition-colors"
          class:active={currentTab?.id === tab.id}
          style:border-bottom-color={currentTab?.id === tab.id ? integration.color : 'transparent'}
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </header>
  
  <!-- Tab Content -->
  <main class="p-6">
    {#if currentTab}
      {#if currentTab.widget}
        <!-- Render widget component -->
        <WidgetSlot widgetId={currentTab.widget} slot="standalone-page" />
      {:else}
        <!-- Fallback: show capability info -->
        <div class="rounded-lg bg-gray-50 p-8 text-center">
          <p class="text-gray-600">
            No widget available for {currentTab.label}
          </p>
          <p class="text-sm text-gray-500">
            Capability: <code>{currentTab.capability}</code>
          </p>
        </div>
      {/if}
    {/if}
  </main>
{:else}
  <div class="p-6">
    <p class="text-gray-600">Loading integration...</p>
  </div>
{/if}
```

### DynamicNavigation Menu Structure

```svelte
<!-- Updated DynamicNavigation.svelte -->
<nav>
  <!-- Core: Home -->
  <a href="/" use:link class={isActive('/') ? 'active' : ''}>
    Home
  </a>
  
  <!-- Dynamic Integration Categories -->
  {#each menuData.categories as category}
    <div class="menu-group">
      <button 
        onclick={() => toggleCategory(category.type)}
        class="category-header"
        style="color: {getCategoryColor(category.type)}"
      >
        {category.icon} {category.label}
        <ChevronIcon expanded={!collapsedCategories.has(category.type)} />
      </button>
      
      {#if !collapsedCategories.has(category.type)}
        <div class="category-items">
          {#each category.integrations as integration}
            <a 
              href={integration.path} 
              use:link
              class="integration-link"
              class:active={isActive(integration.path)}
            >
              <span style="color: {integration.color}">
                {integration.icon}
              </span>
              <span>{integration.displayName}</span>
              
              <!-- Health indicator -->
              <span class="health-dot" class:healthy={integration.healthy} class:degraded={!integration.healthy}></span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
  
  <!-- Legacy Section -->
  <div class="menu-group">
    <div class="section-header">Legacy</div>
    {#each menuData.legacy as legacyItem}
      <a href={legacyItem.path} use:link class={isActive(legacyItem.path) ? 'active' : ''}>
        {legacyItem.icon} {legacyItem.label}
      </a>
    {/each}
  </div>
  
  <!-- Administration Section -->
  <div class="menu-group">
    <div class="section-header">Administration</div>
    <a href="/admin/users" use:link>Users</a>
    <a href="/admin/roles" use:link>Roles</a>
    <a href="/admin/plugins" use:link>Plugins</a>
    <a href="/admin/settings" use:link>Settings</a>
  </div>
</nav>
```

## Next Steps

1. **Create backend `/api/integrations/menu` endpoint**
   - Query IntegrationManager for all loaded plugins
   - Group plugins by IntegrationType
   - For each plugin:
     - Extract metadata (name, color, icon, type)
     - Generate tabs from capabilities + widgets mapping
     - Include health status
     - Build category structure
   - Add legacy routes array
   - Return filtered by user permissions

2. **Create IntegrationHomePage component**
   - Dynamic Svelte component at `/integrations/:integrationName`
   - Load integration metadata via API
   - Generate tab navigation from capabilities
   - Embed widgets based on active tab
   - Handle deep linking with `?tab=<tabId>` query param
   - Add integration header with branding
   - Show health and configuration status

3. **Enhance MenuBuilder.svelte.ts**
   - Fetch integration menu data from `/api/integrations/menu`
   - Generate category groups (Remote Execution, Config Management, etc.)
   - Create integration links (not capability links) under each category
   - Add Legacy section with Inventory and Executions
   - Preserve existing Administration section
   - Apply permission filtering at category and integration level

4. **Update DynamicNavigation.svelte**
   - Render category dropdowns with integration links
   - Apply integration color coding to category headers
   - Add health status dots next to integration names
   - Implement hover states and active route highlighting
   - Add Legacy and Administration sections
   - Support collapsible groups

5. **Update App.svelte routing**
   - Add route: `/integrations/:integrationName` → IntegrationHomePage
   - Keep existing routes:
     - `/inventory` (legacy)
     - `/executions` (legacy)
     - `/admin/*` (administration)
   - Pass integration name as prop to IntegrationHomePage

6. **Widget Loading System**
   - Enhance WidgetRegistry to support lazy loading
   - Load widget components on-demand when tab is activated
   - Cache loaded widgets for faster tab switching
   - Handle widget loading errors gracefully

## Route Structure

### New Routes

- `/integrations/bolt` - Bolt integration home (with tabs: Commands, Tasks, Inventory, Facts)
- `/integrations/puppetdb` - PuppetDB integration home (with tabs: Nodes, Facts, Reports, Events, Catalogs)
- `/integrations/puppetserver` - Puppetserver integration home (with tabs: Environments, Catalogs, Status)
- `/integrations/hiera` - Hiera integration home (with tabs: Explorer, Lookups, Hierarchy, Code Analysis)

### Legacy Routes (Preserved)

- `/inventory` - Current multi-source inventory page
- `/executions` - Current execution history page

### Admin Routes (Preserved)

- `/admin/users` - User management
- `/admin/roles` - Role and permission management  
- `/admin/plugins` - Plugin configuration and status
- `/admin/settings` - System settings

### Tab Deep Linking

- `/integrations/bolt?tab=commands` - Direct link to Commands tab
- `/integrations/puppetdb?tab=reports` - Direct link to Reports tab
- `/integrations/puppetserver?tab=environments` - Direct link to Environments tab

## Open Questions

1. **Should integration pages support sub-routes for tabs?**
   - Current: `/integrations/bolt?tab=commands` (query param)
   - Alternative: `/integrations/bolt/commands` (sub-route)
   - **Recommendation:** Query params for simpler implementation, can migrate later

2. **How to handle widgets with multiple slots?**
   - **Decision:** Widget's `slots` array determines where it can render
   - Integration home page uses "standalone-page" slot
   - Widget can still render in dashboard, sidebar, etc.

3. **Should we preserve /puppet route?**
   - Current: Hardcoded `/puppet` page exists
   - **Recommendation:** Deprecate in favor of individual integration pages
   - Could redirect `/puppet` → `/integrations/puppetserver`

4. **How to handle disabled/unconfigured integrations?**
   - **Decision:** Don't show in menu at all if disabled
   - Show setup link in plugin admin page
   - Could add "Available Integrations" section showing disabled ones

5. **Should categories collapse/expand state persist?**
   - **Recommendation:** Yes, store in localStorage
   - Remember user's preference across sessions
   - Default: All categories expanded

6. **How to handle integration pages when no widgets exist?**
   - **Recommendation:** Show capability list with execute buttons
   - Allow raw JSON parameter input for testing
   - Encourage creating widgets through plugin admin

## Benefits

1. **Automatic Menu Generation**: No manual menu updates when adding integrations
2. **Type-Based Organization**: Logical grouping by integration purpose
3. **Permission-Aware**: Users only see integrations they can access
4. **Health Monitoring**: Visual indicators for integration status
5. **Consistent UX**: Same navigation pattern across all integrations
6. **Scalability**: Easy to add new integrations without menu changes
7. **Discovery**: Users can easily find integration-specific features

## Quick Reference Checklist

### Phase Status

- [x] Phase 1: Backend Infrastructure (BasePluginInterface, menu endpoint)
- [x] Phase 2: Menu Data Endpoint (`/api/integrations/menu`)
- [x] Phase 3: Frontend Menu Generation (DynamicNavigation)
- [ ] Phase 4: Integration-Specific Pages (tab content) 🔴 **IN PROGRESS**
- [ ] Phase 5: Home Page Dashboard Improvements 🔴 **IN PROGRESS**
- [ ] Phase 6: Widget Slot System Enhancement (future)

### Current Issues to Fix

- [ ] 🔴 Dashboard widgets not appearing on home page
- [ ] 🔴 Home page using old integration status API
- [ ] 🔴 Integration tabs showing "No widget available"
- [ ] 🔴 Widget components not being loaded in tabs

### Integration Pages Checklist

**Bolt (`/integrations/bolt`)**

- [ ] Commands tab - embed CommandExecutor
- [ ] Tasks tab - embed TaskRunner
- [ ] Inventory tab - embed InventoryViewer
- [ ] Facts tab - create facts query UI

**PuppetDB (`/integrations/puppetdb`)**

- [ ] Nodes tab - embed NodeBrowser
- [ ] Facts tab - embed FactsExplorer
- [ ] Reports tab - embed ReportsViewer
- [ ] Events tab - create events viewer
- [ ] Catalogs tab - create catalog viewer

**Puppetserver (`/integrations/puppetserver`)**

- [ ] Environments tab - embed EnvironmentManager
- [ ] Catalogs tab - create catalog compiler UI
- [ ] Status tab - embed StatusDashboard

**Hiera (`/integrations/hiera`)**

- [ ] Explorer tab - embed HieraExplorer
- [ ] Lookup tab - embed KeyLookup
- [ ] Hierarchy tab - embed HierarchyViewer
- [ ] Code Analysis tab - embed CodeAnalysis

### Dashboard Widgets Checklist

- [ ] Verify `bolt:task-browser` widget registration
- [ ] Verify `puppetdb:reports-summary` widget registration
- [ ] Debug WidgetRegistry population
- [ ] Fix WidgetSlot component query logic
- [ ] Test widget permissions filtering

### Files to Check/Modify

**Backend:**

- `backend/src/integrations/bolt/BoltPlugin.ts` - widget metadata
- `backend/src/integrations/puppetdb/PuppetDBPlugin.ts` - widget metadata
- `backend/src/integrations/puppetserver/PuppetserverPlugin.ts` - widget metadata
- `backend/src/routes/integrations/menu.ts` - menu endpoint (working)

**Frontend:**

- `frontend/src/pages/HomePage.svelte` - fix status API, dashboard widgets
- `frontend/src/pages/IntegrationHomePage.svelte` - add widget loading
- `frontend/src/components/IntegrationStatus.svelte` - update data format
- `frontend/src/lib/plugins/WidgetRegistry.ts` - verify registration
- `frontend/src/lib/plugins/WidgetSlot.svelte` - verify rendering
- Widget components in `frontend/src/components/` and `frontend/src/widgets/`

## Detailed Implementation: PuppetDB Integration Pages

### Overview

The PuppetDB integration (`/integrations/puppetdb`) provides comprehensive access to PuppetDB's information and reporting capabilities. All required widget components already exist in `frontend/src/widgets/puppetdb/`.

**Integration Metadata:**

- **Type:** `Info` (Information/Reporting)
- **Color:** `#9063CD` (Violet)
- **Icon:** `database`
- **Status:** ✅ Full BasePluginInterface v1.0
- **Route:** `/integrations/puppetdb`

### Available Widgets

All PuppetDB widgets are already implemented:

| Widget ID | Component Path | Status | Slots |
|-----------|---------------|---------|-------|
| `puppetdb:node-browser` | `widgets/puppetdb/NodeBrowser.svelte` | ✅ Exists | dashboard, inventory-panel, standalone-page |
| `puppetdb:facts-explorer` | `widgets/puppetdb/FactsExplorer.svelte` | ✅ Exists | node-detail, standalone-page, modal |
| `puppetdb:reports-viewer` | `widgets/puppetdb/ReportsViewer.svelte` | ✅ Exists | dashboard, node-detail, standalone-page |
| `puppetdb:reports-summary` | `widgets/puppetdb/ReportsSummary.svelte` | ✅ Exists | dashboard, sidebar |

### Tab Structure

The PuppetDB integration home page should generate the following tabs from capabilities:

#### Tab 1: Nodes (`?tab=nodes`)

- **Capability:** `puppetdb.nodes`
- **Widget:** `puppetdb:node-browser`
- **Purpose:** Browse all nodes in PuppetDB inventory
- **Features:**
  - Search nodes by certname pattern
  - Filter by facts, environment, status
  - View node details (facts, reports, events)
  - Export node lists
- **Component:** `NodeBrowser.svelte` (already exists)

#### Tab 2: Facts (`?tab=facts`)

- **Capability:** `puppetdb.facts`
- **Widget:** `puppetdb:facts-explorer`
- **Purpose:** Explore and query facts across nodes
- **Features:**
  - Search facts by key or value
  - View fact hierarchy (structured facts)
  - Compare facts across nodes
  - Export fact data
- **Component:** `FactsExplorer.svelte` (already exists)

#### Tab 3: Reports (`?tab=reports`)

- **Capability:** `puppetdb.reports`
- **Widget:** `puppetdb:reports-viewer`
- **Purpose:** View Puppet run reports
- **Features:**
  - Filter reports by node, status, time range
  - View report timeline
  - Show resource changes
  - Display report metrics
- **Component:** `ReportsViewer.svelte` (already exists)

#### Tab 4: Events (`?tab=events`)

- **Capability:** `puppetdb.events`
- **Widget:** 🔴 **NEEDS CREATION** - `puppetdb:events-viewer`
- **Purpose:** View resource events from Puppet runs
- **Features Required:**
  - Filter events by resource type, status
  - Show event timeline
  - Display event details (old/new values)
  - Group by node or resource
- **Component Path:** `widgets/puppetdb/EventsViewer.svelte` (to be created)

#### Tab 5: Catalogs (`?tab=catalogs`)

- **Capability:** `puppetdb.catalog` or `puppetdb.catalog.resources`
- **Widget:** 🔴 **NEEDS CREATION** - `puppetdb:catalog-viewer`
- **Purpose:** View and explore compiled catalogs
- **Features Required:**
  - Display catalog resources
  - Filter by resource type
  - Show resource relationships
  - View catalog metadata
- **Component Path:** `widgets/puppetdb/CatalogViewer.svelte` (to be created)

### Widget Component Mapping

Add this to `IntegrationHomePage.svelte`:

```typescript
const widgetComponents = {
  // PuppetDB widgets (4 existing, 2 to be created)
  'puppetdb:node-browser': () => import('@/widgets/puppetdb/NodeBrowser.svelte'),
  'puppetdb:facts-explorer': () => import('@/widgets/puppetdb/FactsExplorer.svelte'),
  'puppetdb:reports-viewer': () => import('@/widgets/puppetdb/ReportsViewer.svelte'),
  'puppetdb:reports-summary': () => import('@/widgets/puppetdb/ReportsSummary.svelte'),
  
  // To be created:
  // 'puppetdb:events-viewer': () => import('@/widgets/puppetdb/EventsViewer.svelte'),
  // 'puppetdb:catalog-viewer': () => import('@/widgets/puppetdb/CatalogViewer.svelte'),
};
```

### Backend Plugin Configuration

The backend plugin already defines all widgets correctly in `backend/src/integrations/puppetdb/PuppetDBPlugin.ts`:

```typescript
readonly widgets: PluginWidget[] = [
  {
    id: "puppetdb:node-browser",
    name: "Node Browser",
    component: "./components/NodeBrowser.svelte",
    slots: ["dashboard", "inventory-panel", "standalone-page"],
    size: "large",
    requiredCapabilities: ["puppetdb.nodes"],
    icon: "server",
    priority: 100,
    config: {
      showSearch: true,
      showFilters: true,
    },
  },
  {
    id: "puppetdb:facts-explorer",
    name: "Facts Explorer",
    component: "./components/FactsExplorer.svelte",
    slots: ["node-detail", "standalone-page", "modal"],
    size: "large",
    requiredCapabilities: ["puppetdb.facts"],
    icon: "info",
    priority: 90,
    config: {
      showSearch: true,
      showExpandAll: true,
    },
  },
  {
    id: "puppetdb:reports-viewer",
    name: "Reports Viewer",
    component: "./components/ReportsViewer.svelte",
    slots: ["dashboard", "node-detail", "standalone-page"],
    size: "large",
    requiredCapabilities: ["puppetdb.reports"],
    icon: "file-text",
    priority: 85,
    config: {
      showStatusFilter: true,
      showTimeline: true,
    },
  },
  {
    id: "puppetdb:reports-summary",
    name: "Reports Summary",
    component: "./components/ReportsSummary.svelte",
    slots: ["dashboard", "sidebar"],
    size: "small",
    requiredCapabilities: ["puppetdb.reports.summary"],
    icon: "pie-chart",
    priority: 95,
  },
];
```

### Implementation Tasks

#### ✅ Already Complete

1. Backend plugin with v1.0 interface
2. All 11 PuppetDB capabilities defined
3. Widget metadata for 4 main widgets
4. NodeBrowser component
5. FactsExplorer component
6. ReportsViewer component
7. ReportsSummary component (dashboard widget)

#### 🔴 Required Tasks

**Task 1: Add PuppetDB widgets to IntegrationHomePage** (Priority 1)

- File: `frontend/src/pages/IntegrationHomePage.svelte`
- Action: Add widget component mappings for PuppetDB
- Test: Navigate to `/integrations/puppetdb?tab=nodes` - should show NodeBrowser

**Task 2: Create EventsViewer widget** (Priority 2)

- File: `frontend/src/widgets/puppetdb/EventsViewer.svelte` (new)
- Functionality:
  - Query events via `/api/puppetdb/events/:certname` endpoint
  - Display event timeline with filters
  - Show old_value → new_value for each event
  - Filter by status (success, failure, noop, skip)
  - Group by resource type or timestamp
- Props:

  ```typescript
  interface Props {
    integration: string;  // 'puppetdb'
    certname?: string;    // Optional node filter
    limit?: number;       // Default 100
  }
  ```

**Task 3: Create CatalogViewer widget** (Priority 3)

- File: `frontend/src/widgets/puppetdb/CatalogViewer.svelte` (new)
- Functionality:
  - Query catalog via `/api/puppetdb/catalog/:certname` endpoint
  - Display catalog resources in table or tree view
  - Filter by resource type
  - Show resource parameters
  - Display resource relationships (requires/before/notify)
- Props:

  ```typescript
  interface Props {
    integration: string;  // 'puppetdb'
    certname: string;     // Required - node to get catalog for
  }
  ```

**Task 4: Update backend widget definitions** (Priority 2)
Once EventsViewer and CatalogViewer are created, add to `PuppetDBPlugin.ts`:

```typescript
// Add to widgets array in PuppetDBPlugin.ts
{
  id: "puppetdb:events-viewer",
  name: "Events Viewer",
  component: "./components/EventsViewer.svelte",
  slots: ["node-detail", "standalone-page"],
  size: "large",
  requiredCapabilities: ["puppetdb.events"],
  icon: "activity",
  priority: 80,
  config: {
    showStatusFilter: true,
    defaultLimit: 100,
  },
},
{
  id: "puppetdb:catalog-viewer",
  name: "Catalog Viewer",
  component: "./components/CatalogViewer.svelte",
  slots: ["node-detail", "standalone-page"],
  size: "large",
  requiredCapabilities: ["puppetdb.catalog"],
  icon: "file-code",
  priority: 75,
  config: {
    showRelationships: true,
    showParameters: true,
  },
}
```

**Task 5: Test dashboard widget loading** (Priority 1)

- Verify `puppetdb:reports-summary` appears on home page dashboard
- Check widget registration in WidgetRegistry
- Ensure widget respects user capabilities

### API Endpoints Used

PuppetDB integration tabs will use these existing backend endpoints:

| Tab | Endpoint | Method | Description |
|-----|----------|--------|-------------|
| Nodes | `/api/puppetdb/nodes` | GET | List all nodes with optional query filter |
| Facts | `/api/puppetdb/facts/:certname` | GET | Get all facts for a node |
| Reports | `/api/puppetdb/reports/:certname` | GET | Get reports for a node |
| Reports | `/api/puppetdb/reports/summary` | GET | Get aggregated report statistics (dashboard) |
| Events | `/api/puppetdb/events/:certname` | GET | Get events for a node |
| Catalogs | `/api/puppetdb/catalog/:certname` | GET | Get catalog for a node |
| Catalogs | `/api/puppetdb/catalog/resources/:type` | GET | Get all resources of a type |

### Widget Component Template

For creating new PuppetDB widgets (EventsViewer, CatalogViewer), follow this pattern:

```svelte
<!-- EventsViewer.svelte example -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '@/lib/api';
  
  interface Props {
    integration: string;
    certname?: string;
    limit?: number = 100;
  }
  
  let { integration, certname, limit = 100 }: Props = $props();
  
  let events = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let statusFilter = $state('all'); // all, success, failure, noop, skip
  
  async function loadEvents() {
    if (!certname) return;
    
    loading = true;
    error = null;
    
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      
      const response = await get(`/api/puppetdb/events/${certname}?${params}`);
      events = response.events || [];
    } catch (err) {
      error = err.message;
      console.error('Failed to load events:', err);
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    if (certname) {
      loadEvents();
    }
  });
  
  $effect(() => {
    // Reload when filters change
    if (certname && statusFilter) {
      loadEvents();
    }
  });
</script>

<div class="puppetdb-events-viewer">
  <header class="border-b border-violet-200 pb-4 mb-4">
    <h2 class="text-xl font-semibold text-violet-900">
      Events {certname ? `for ${certname}` : ''}
    </h2>
    
    <!-- Status Filter -->
    <div class="mt-2">
      <label class="text-sm font-medium text-gray-700">Filter by status:</label>
      <select bind:value={statusFilter} class="ml-2 rounded border px-2 py-1">
        <option value="all">All</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
        <option value="noop">No-op</option>
        <option value="skip">Skipped</option>
      </select>
    </div>
  </header>
  
  {#if loading}
    <div class="text-center py-8 text-gray-500">
      Loading events...
    </div>
  {:else if error}
    <div class="rounded bg-red-50 border border-red-200 text-red-800 p-4">
      Error: {error}
    </div>
  {:else if events.length === 0}
    <div class="text-center py-8 text-gray-500">
      No events found
    </div>
  {:else}
    <div class="events-list space-y-2">
      {#each events as event}
        <div class="event-item rounded border p-3 hover:bg-gray-50">
          <div class="flex items-start justify-between">
            <div>
              <span class="font-mono text-sm text-violet-600">
                {event.resource_type}[{event.resource_title}]
              </span>
              <span class={`ml-2 text-xs px-2 py-1 rounded ${
                event.status === 'success' ? 'bg-green-100 text-green-800' :
                event.status === 'failure' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {event.status}
              </span>
            </div>
            <time class="text-sm text-gray-500">
              {new Date(event.timestamp).toLocaleString()}
            </time>
          </div>
          
          {#if event.message}
            <p class="mt-2 text-sm text-gray-700">{event.message}</p>
          {/if}
          
          {#if event.old_value !== undefined || event.new_value !== undefined}
            <div class="mt-2 text-sm">
              <span class="text-red-600">- {JSON.stringify(event.old_value)}</span>
              <br>
              <span class="text-green-600">+ {JSON.stringify(event.new_value)}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .puppetdb-events-viewer {
    padding: 1rem;
    background: white;
    border-radius: 0.5rem;
  }
  
  .events-list {
    max-height: 600px;
    overflow-y: auto;
  }
</style>
```

### Testing Checklist

After implementing widget embedding:

- [ ] Navigate to `/integrations/puppetdb` - should show integration home page
- [ ] Verify 5 tabs: Nodes, Facts, Reports, Events, Catalogs
- [ ] Test `/integrations/puppetdb?tab=nodes` - NodeBrowser widget loads
- [ ] Test `/integrations/puppetdb?tab=facts` - FactsExplorer widget loads
- [ ] Test `/integrations/puppetdb?tab=reports` - ReportsViewer widget loads
- [ ] Test `/integrations/puppetdb?tab=events` - EventsViewer widget loads (after creation)
- [ ] Test `/integrations/puppetdb?tab=catalogs` - CatalogViewer widget loads (after creation)
- [ ] Verify home page dashboard shows `puppetdb:reports-summary` widget
- [ ] Test deep linking (share URL with tab parameter)
- [ ] Test tab navigation (URL updates when switching tabs)
- [ ] Verify integration header shows violet color (#9063CD)
- [ ] Check health status indicator

### Integration with Existing Pages

The PuppetDB integration should work alongside existing inventory features:

**From Inventory Page:**

- Click node → View node details
- "View in PuppetDB" button → Navigate to `/integrations/puppetdb?tab=nodes&certname=<node>`
- "View Facts" button → Navigate to `/integrations/puppetdb?tab=facts&certname=<node>`

**From Executions Page:**

- Click execution → View results
- "View PuppetDB Report" link (if Puppet run) → Navigate to `/integrations/puppetdb?tab=reports&certname=<node>`

### Success Criteria

✅ PuppetDB integration is fully functional when:

1. All existing widgets (NodeBrowser, FactsExplorer, ReportsViewer, ReportsSummary) are embedded and working
2. EventsViewer widget created and functional
3. CatalogViewer widget created and functional
4. Tab navigation works smoothly with URL query param updates
5. Dashboard shows ReportsSummary widget
6. Integration header displays with violet branding
7. All tabs respect RBAC permissions
8. Deep linking works (can share direct links to specific tabs)
9. Widgets properly handle loading, error, and empty states
10. Performance is good (widgets lazy-load when tab is activated)

## References

- [Plugin Architecture](../architecture.md#plugin-architecture)
- [Integration Types](../../backend/src/integrations/types.ts)
- [MenuBuilder Implementation](../../frontend/src/lib/navigation/MenuBuilder.svelte.ts)
- [Current Integrations](../../backend/src/integrations/)
