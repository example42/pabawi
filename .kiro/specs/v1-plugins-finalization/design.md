# Design Document: V1 Plugins Finalization

## Overview

This design completes the v1 plugin architecture by addressing gaps in widget registration, navigation display, widget loading, and widget display behavior. The backend PluginLoader works correctly and discovers all 6 native plugins from `plugins/native/` directories. However, the frontend has critical gaps:

**Current State:**

- Ansible has `frontend/index.ts` but only exports components (no ANSIBLE_WIDGET_MANIFEST)
- SSH has no `frontend/index.ts` at all
- `registerPluginWidgets.ts` only imports bolt, hiera, puppetdb, puppetserver (missing ansible and ssh)
- Widgets get stuck loading because PluginLoader tries to load from WIDGET_MANIFEST first, but ansible/ssh aren't registered there
- `IntegrationHomePage.svelte` displays plugin info but lacks capability-based category tabs
- HomePage incorrectly shows dashboard widgets (should only show home-summary widgets)
- Plugin home pages don't show dashboard widgets (should show them in overview tab)

**Solution:**

1. Create proper widget manifests for ansible and ssh following bolt's pattern (with `load` functions)
2. Update registerPluginWidgets.ts to import ansible and ssh manifests
3. Add category tab functionality to IntegrationHomePage
4. Fix HomePage to only display home-summary slot widgets
5. Fix IntegrationHomePage to display dashboard slot widgets in overview tab
6. Verify navigation displays all integration types including InventorySource
7. Ensure multi-type plugins (ansible, ssh) appear in all relevant integration type views

## Architecture

### Current State

**Backend (Working)**:

- `PluginLoader` class in `backend/src/integrations/PluginLoader.ts` handles plugin discovery
- Scans `plugins/native/` directory for subdirectories containing `plugin.json` manifests
- Validates manifests using Zod schemas
- Loads plugin instances via dynamic imports
- Registers capabilities in `CapabilityRegistry`
- Exposes plugin metadata via `/api/v1/plugins` endpoints

**Frontend (Incomplete)**:

- `registerPluginWidgets.ts` manually imports widget manifests
- Currently only imports: bolt, hiera, puppetdb, puppetserver
- Missing: ansible, ssh
- `IntegrationHomePage.svelte` displays plugin home pages
- Navigation menu doesn't show all integration types

### Target Architecture

```
Backend (No Changes Needed)
├── PluginLoader discovers all plugins
├── IntegrationManager initializes plugins
└── /api/v1/plugins endpoints expose metadata

Frontend (Needs Updates)
├── registerPluginWidgets.ts
│   ├── Import all plugin widget manifests
│   ├── Register widgets in global WIDGET_MANIFEST
│   └── Support dynamic discovery (future enhancement)
├── IntegrationHomePage.svelte
│   ├── Load plugin info from API
│   ├── Group capabilities by category
│   ├── Display category tabs
│   └── Render widgets per category
└── Navigation
    ├── Display all integration types
    └── Show plugins grouped by type
```

## Components and Interfaces

### 1. Frontend Widget Registration

**File**: `frontend/src/widgets/registerPluginWidgets.ts`

**Current Implementation** (Missing ansible and ssh):

```typescript
export async function registerAllPluginWidgets(): Promise<void> {
  const [
    { BOLT_WIDGET_MANIFEST },
    { HIERA_WIDGET_MANIFEST },
    { PUPPETDB_WIDGET_MANIFEST },
    { PUPPETSERVER_WIDGET_MANIFEST },
  ] = await Promise.all([
    import('../../../plugins/native/bolt/frontend/index'),
    import('../../../plugins/native/hiera/frontend/index'),
    import('../../../plugins/native/puppetdb/frontend/index'),
    import('../../../plugins/native/puppetserver/frontend/index'),
  ]);
  
  // Register widgets...
}
```

**Updated Implementation**:

```typescript
export async function registerAllPluginWidgets(): Promise<void> {
  const [
    { ANSIBLE_WIDGET_MANIFEST },
    { BOLT_WIDGET_MANIFEST },
    { HIERA_WIDGET_MANIFEST },
    { PUPPETDB_WIDGET_MANIFEST },
    { PUPPETSERVER_WIDGET_MANIFEST },
    { SSH_WIDGET_MANIFEST },
  ] = await Promise.all([
    import('../../../plugins/native/ansible/frontend/index'),
    import('../../../plugins/native/bolt/frontend/index'),
    import('../../../plugins/native/hiera/frontend/index'),
    import('../../../plugins/native/puppetdb/frontend/index'),
    import('../../../plugins/native/puppetserver/frontend/index'),
    import('../../../plugins/native/ssh/frontend/index'),
  ]);
  
  const manifests = [
    ANSIBLE_WIDGET_MANIFEST,
    BOLT_WIDGET_MANIFEST,
    HIERA_WIDGET_MANIFEST,
    PUPPETDB_WIDGET_MANIFEST,
    PUPPETSERVER_WIDGET_MANIFEST,
    SSH_WIDGET_MANIFEST,
  ];
  
  let totalRegistered = 0;
  for (const manifest of manifests) {
    for (const widgetEntry of Object.values(manifest)) {
      registerWidget(widgetEntry);
      totalRegistered++;
    }
  }
  
  console.log(`[WidgetRegistration] Registered ${totalRegistered} plugin widgets`);
}
```

### 2. Plugin Frontend Entry Points

**Ansible**: `plugins/native/ansible/frontend/index.ts`

**Current State**: File exists but only exports components, no widget manifest

**Required Implementation**:

```typescript
import type { WidgetManifest } from '../../../../frontend/src/widgets/types';

// Import widget components
import HomeWidget from './HomeWidget.svelte';
import PluginHomePage from './PluginHomePage.svelte';
import PlaybookRunner from './PlaybookRunner.svelte';
import CommandExecutor from './CommandExecutor.svelte';
import InventoryViewer from './InventoryViewer.svelte';
import NodeDetailTabs from './NodeDetailTabs.svelte';

export const ANSIBLE_WIDGET_MANIFEST: WidgetManifest = {
  'ansible:home-widget': {
    id: 'ansible:home-widget',
    name: 'Ansible Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['inventory.list'],
    priority: 20,
  },
  'ansible:home-page': {
    id: 'ansible:home-page',
    name: 'Ansible Home',
    load: () => import('./PluginHomePage.svelte'),
    slots: ['standalone-page'] as string[],
    defaultSize: { width: 4, height: 4 },
    requiredCapabilities: ['inventory.list'],
    route: '/integrations/ansible',
  },
  'ansible:playbook-runner': {
    id: 'ansible:playbook-runner',
    name: 'Playbook Runner',
    load: () => import('./PlaybookRunner.svelte'),
    slots: ['dashboard', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['task.execute'],
    category: 'task',
    nodeScoped: true,
  },
  'ansible:command-executor': {
    id: 'ansible:command-executor',
    name: 'Command Executor',
    load: () => import('./CommandExecutor.svelte'),
    slots: ['dashboard', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['command.execute'],
    category: 'command',
    nodeScoped: true,
  },
  'ansible:inventory-viewer': {
    id: 'ansible:inventory-viewer',
    name: 'Inventory Viewer',
    load: () => import('./InventoryViewer.svelte'),
    slots: ['dashboard', 'inventory-panel'] as string[],
    defaultSize: { width: 1, height: 2 },
    requiredCapabilities: ['inventory.list'],
    category: 'inventory',
  },
  'ansible:node-detail-tabs': {
    id: 'ansible:node-detail-tabs',
    name: 'Ansible Node Actions',
    load: () => import('./NodeDetailTabs.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 4, height: 3 },
    requiredCapabilities: ['command.execute'],
    nodeScoped: true,
    priority: 5,
  },
};
```

**SSH**: `plugins/native/ssh/frontend/index.ts`

**Current State**: File does not exist

**Required Implementation**:

```typescript
import type { WidgetManifest } from '../../../../frontend/src/widgets/types';

// Import widget components
import HomeWidget from './HomeWidget.svelte';

export const SSH_WIDGET_MANIFEST: WidgetManifest = {
  'ssh:home-widget': {
    id: 'ssh:home-widget',
    name: 'SSH Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['inventory.list'],
    priority: 20,
  },
};
```

### 3. Plugin Home Page with Category Tabs

**File**: `frontend/src/pages/IntegrationHomePage.svelte`

**Current State**: Displays plugin info and widgets but lacks category-based tabs

**Enhanced Implementation** (Add category tabs):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { auth } from '../lib/auth.svelte';
  import WidgetSlot from '../lib/plugins/WidgetSlot.svelte';

  interface Props {
    params?: Record<string, string>;
  }

  interface PluginInfo {
    metadata: {
      name: string;
      version: string;
      author: string;
      description: string;
      integrationType: string;
      integrationTypes?: string[];
      homepage?: string;
      color?: string;
      icon?: string;
    };
    enabled: boolean;
    healthy: boolean;
    widgets: Array<{
      id: string;
      name: string;
      component: string;
      slots: string[];
      size: string;
      requiredCapabilities: string[];
      category?: string;
      priority?: number;
    }>;
    capabilities: Array<{
      name: string;
      category: string;
      description: string;
      riskLevel: string;
      requiredPermissions: string[];
    }>;
    priority: number;
  }

  interface CategoryTab {
    id: string;
    label: string;
    count: number;
  }

  let { params }: Props = $props();
  const pluginName = $derived(params?.integrationName || '');
  const userCapabilities = $derived(auth.permissions?.allowed ?? []);

  let pluginInfo = $state<PluginInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeTab = $state<string>('overview');
  let categoryTabs = $state<CategoryTab[]>([]);

  /**
   * Group capabilities by category and create tabs
   */
  function buildCategoryTabs(info: PluginInfo): CategoryTab[] {
    const categories = new Map<string, number>();
    
    // Count capabilities per category
    for (const cap of info.capabilities) {
      const count = categories.get(cap.category) || 0;
      categories.set(cap.category, count + 1);
    }
    
    // Create tabs for categories with capabilities
    const tabs: CategoryTab[] = [
      { id: 'overview', label: 'Overview', count: 0 }
    ];
    
    const categoryOrder = ['inventory', 'command', 'task', 'info', 'events', 'reports', 'package'];
    const categoryLabels: Record<string, string> = {
      inventory: 'Inventory',
      command: 'Commands',
      task: 'Tasks',
      info: 'Information',
      events: 'Events',
      reports: 'Reports',
      package: 'Packages',
    };
    
    for (const category of categoryOrder) {
      const count = categories.get(category);
      if (count && count > 0) {
        tabs.push({
          id: category,
          label: categoryLabels[category] || category,
          count,
        });
      }
    }
    
    return tabs;
  }

  /**
   * Load plugin info when page mounts
   */
  async function loadPluginInfo() {
    loading = true;
    error = null;

    try {
      const data = await get<PluginInfo>(`/api/v1/plugins/${pluginName}`);
      pluginInfo = data;
      categoryTabs = buildCategoryTabs(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plugin info';
      error = message;
      showError(`Failed to load ${pluginName}: ${message}`);
      console.error('Failed to load plugin info:', err);
    } finally {
      loading = false;
    }
  }

  function retryLoad() {
    void loadPluginInfo();
  }

  onMount(() => {
    void loadPluginInfo();
  });
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  {#if loading}
    <!-- Loading State -->
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="space-y-6">
        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <SkeletonLoader height="80px" />
        </div>
        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <SkeletonLoader height="400px" />
        </div>
      </div>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="flex min-h-screen items-center justify-center">
      <div class="rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800 max-w-md">
        <svg class="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Failed to Load Plugin</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">{error}</p>
        <div class="mt-6 flex gap-3 justify-center">
          <button
            onclick={retryLoad}
            class="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
          <button
            onclick={() => router.navigate('/')}
            class="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  {:else if pluginInfo}
    <!-- Success State - Plugin Loaded -->
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <!-- Plugin Header -->
      <div class="mb-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-lg" style="background-color: {pluginInfo.metadata.color || '#6B7280'}20;">
              {#if pluginInfo.metadata.icon}
                <span class="text-3xl">{pluginInfo.metadata.icon}</span>
              {:else}
                <svg class="h-8 w-8" style="color: {pluginInfo.metadata.color || '#6B7280'};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              {/if}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-3">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                  {pluginInfo.metadata.name}
                </h1>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  v{pluginInfo.metadata.version}
                </span>
              </div>
              <p class="mt-1 text-gray-600 dark:text-gray-400">
                {pluginInfo.metadata.description}
              </p>
              <div class="mt-2 flex items-center gap-3 flex-wrap">
                {#if pluginInfo.metadata.integrationTypes}
                  {#each pluginInfo.metadata.integrationTypes as integrationType}
                    <IntegrationBadge integration={integrationType} variant="badge" size="sm" />
                  {/each}
                {:else}
                  <IntegrationBadge integration={pluginInfo.metadata.integrationType} variant="badge" size="sm" />
                {/if}
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  by {pluginInfo.metadata.author}
                </span>
              </div>
            </div>
          </div>

          <!-- Health Status Badge -->
          <div class="flex items-center gap-2">
            {#if pluginInfo.healthy}
              <span class="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <span class="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400"></span>
                Healthy
              </span>
            {:else}
              <span class="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                <span class="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                Offline
              </span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Category Tabs -->
      {#if categoryTabs.length > 1}
        <div class="mb-6">
          <div class="border-b border-gray-200 dark:border-gray-700">
            <nav class="-mb-px flex space-x-8" aria-label="Tabs">
              {#each categoryTabs as tab}
                <button
                  onclick={() => activeTab = tab.id}
                  class="whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                    {activeTab === tab.id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                >
                  {tab.label}
                  {#if tab.count > 0}
                    <span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                      {tab.count}
                    </span>
                  {/if}
                </button>
              {/each}
            </nav>
          </div>
        </div>
      {/if}

      <!-- Tab Content -->
      <div class="space-y-6">
        {#if activeTab === 'overview'}
          <!-- Overview Tab -->
          {#if pluginInfo.metadata.homepage}
            <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">Homepage</h3>
              <a
                href={pluginInfo.metadata.homepage}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1 block text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {pluginInfo.metadata.homepage} ↗
              </a>
            </div>
          {/if}

          <!-- Plugin-specific widgets (standalone-page slot) -->
          <WidgetSlot
            slot="standalone-page"
            layout="stack"
            context={{ pluginName, pluginInfo }}
            {userCapabilities}
            showEmptyState={true}
            emptyMessage="No content widgets available for this plugin."
            showLoadingStates={true}
          />
        {:else}
          <!-- Category-specific widgets -->
          <WidgetSlot
            slot="standalone-page"
            layout="stack"
            context={{ pluginName, pluginInfo, category: activeTab }}
            {userCapabilities}
            filterByCategory={activeTab}
            showEmptyState={true}
            emptyMessage="No widgets available for this category."
            showLoadingStates={true}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>
```

### 4. Widget Slot Category Filtering

**File**: `frontend/src/lib/plugins/WidgetSlot.svelte`

**Enhanced Props**:

```typescript
interface Props {
  slot: string;
  layout?: 'grid' | 'stack' | 'flex';
  context?: Record<string, unknown>;
  userCapabilities?: string[];
  filterByCategory?: string;  // NEW: Filter widgets by category
  showEmptyState?: boolean;
  emptyMessage?: string;
  showLoadingStates?: boolean;
}
```

**Category Filtering Logic**:

```typescript
// Filter widgets by category if specified
const filteredWidgets = $derived(() => {
  let widgets = widgetsForSlot;
  
  if (filterByCategory) {
    widgets = widgets.filter(w => w.category === filterByCategory);
  }
  
  return widgets;
});
```

### 5. Widget Loading Flow and Fix

**Problem**: Widgets get stuck in "loading" state because:

1. PluginLoader tries to load from local WIDGET_MANIFEST first (via WidgetBridge)
2. Ansible and SSH widgets aren't in WIDGET_MANIFEST because registerPluginWidgets.ts doesn't import them
3. PluginLoader falls back to plugin module, but that also fails
4. Widget remains in loading state indefinitely

**Solution**: Register ansible and SSH widget manifests in registerPluginWidgets.ts

**Widget Loading Flow**:

```
1. WidgetSlot requests widgets for a slot
2. WidgetRegistry returns matching widgets
3. WidgetSlot calls PluginLoader.loadWidgetComponent(widgetId)
4. PluginLoader checks WidgetBridge.hasLocalWidget(widgetId)
   ├─ If YES: Load from WIDGET_MANIFEST via WidgetBridge ✓
   └─ If NO: Try plugin module, then fail ✗
5. Component loaded and rendered
```

**Current State**:

- Bolt, Hiera, PuppetDB, Puppetserver: ✓ Registered in WIDGET_MANIFEST
- Ansible: ✗ Not registered (no manifest export)
- SSH: ✗ Not registered (no index.ts file)

**After Fix**:

- All 6 plugins: ✓ Registered in WIDGET_MANIFEST
- All widgets load successfully

### 6. HomePage Widget Display Fix

**File**: `frontend/src/pages/HomePage.svelte`

**Current Issue**: HomePage shows both home-summary AND dashboard widgets

**Current Implementation**:

```svelte
<!-- Home summary widgets -->
<WidgetSlot
  slot="home-summary"
  layout="grid"
  ...
/>

<!-- Dashboard widgets (SHOULD NOT BE HERE) -->
<WidgetSlot
  slot="dashboard"
  layout="grid"
  ...
/>
```

**Fixed Implementation**:

```svelte
<!-- Only show home-summary widgets -->
<WidgetSlot
  slot="home-summary"
  layout="grid"
  context={{ view: 'home' }}
  {userCapabilities}
  showEmptyState={true}
  emptyMessage="No summary widgets available. Enable plugins to see summaries."
  showLoadingStates={true}
/>

<!-- Remove dashboard WidgetSlot from HomePage -->
```

**Rationale**:

- home-summary widgets are designed for quick overviews (small, summary cards)
- dashboard widgets are detailed tools meant for plugin home pages
- Mixing them on HomePage creates clutter and confusion

### 7. IntegrationHomePage Widget Display Fix

**File**: `frontend/src/pages/IntegrationHomePage.svelte`

**Current Issue**: Plugin home pages only show standalone-page widgets, not dashboard widgets

**Current Implementation**:

```svelte
<!-- Only standalone-page slot -->
<WidgetSlot
  slot="standalone-page"
  layout="stack"
  context={{ pluginName, pluginInfo }}
  ...
/>
```

**Fixed Implementation**:

```svelte
{#if activeTab === 'overview'}
  <!-- Overview tab shows both dashboard and standalone-page widgets -->
  <div class="space-y-6">
    <!-- Dashboard widgets (detailed tools) -->
    <WidgetSlot
      slot="dashboard"
      layout="grid"
      context={{ pluginName, pluginInfo }}
      {userCapabilities}
      showEmptyState={false}
      showLoadingStates={true}
    />
    
    <!-- Standalone page widgets (full-page content) -->
    <WidgetSlot
      slot="standalone-page"
      layout="stack"
      context={{ pluginName, pluginInfo }}
      {userCapabilities}
      showEmptyState={true}
      emptyMessage="No content widgets available for this plugin."
      showLoadingStates={true}
    />
  </div>
{:else}
  <!-- Category tabs show filtered dashboard and standalone-page widgets -->
  <div class="space-y-6">
    <WidgetSlot
      slot="dashboard"
      layout="grid"
      context={{ pluginName, pluginInfo, category: activeTab }}
      {userCapabilities}
      filterByCategory={activeTab}
      showEmptyState={false}
      showLoadingStates={true}
    />
    
    <WidgetSlot
      slot="standalone-page"
      layout="stack"
      context={{ pluginName, pluginInfo, category: activeTab }}
      {userCapabilities}
      filterByCategory={activeTab}
      showEmptyState={true}
      emptyMessage="No widgets available for this category."
      showLoadingStates={true}
    />
  </div>
{/if}
```

**Rationale**:

- dashboard widgets provide detailed tools and should appear on plugin home pages
- standalone-page widgets provide full-page content
- Both should be shown in overview tab
- Both should be filtered by category in category tabs

### 8. Component Organization Review

**Current State**: Most component migration was completed in previous work. Components are organized as follows:

**Plugin-Specific Components** (in plugin directories):

- Ansible: HomeWidget, PluginHomePage, PlaybookRunner, CommandExecutor, InventoryViewer, NodeDetailTabs
- Bolt: HomeWidget, CommandExecutor, TaskRunner, InventoryViewer, TaskBrowser, FactsViewer, PluginHomePage, NodeDetailTabs, PackageManager
- SSH: HomeWidget
- Hiera, PuppetDB, Puppetserver: Various plugin-specific components

**Shared Framework Components** (in `frontend/src/components/`):

- CommandOutput.svelte - Used by multiple plugins for command output display
- RealtimeOutputViewer.svelte - Used by multiple plugins for streaming output
- PermissionGuard.svelte - Framework component for permission checking
- IntegrationBadge.svelte - Framework component for integration type badges
- LoadingSpinner.svelte - Framework component
- SkeletonLoader.svelte - Framework component
- DebugPanel.svelte - Framework component

**Action**: Verify organization and document any remaining plugin-specific components in shared directory for potential future cleanup.

## Data Models

### Plugin Manifest (plugin.json)

```typescript
interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  integrationType: string;  // Legacy single type
  integrationTypes?: string[];  // NEW: Multiple types supported (ansible, ssh use this)
  homepage?: string;
  color?: string;
  icon?: string;
  tags: string[];
  minPabawiVersion: string;
  dependencies: string[];
  entryPoint: string;
  frontendEntryPoint?: string;
  capabilities: PluginCapability[];
  widgets: PluginWidget[];
  cliCommands?: CliCommand[];
  defaultPermissions: Record<string, string[]>;
}

interface PluginCapability {
  name: string;
  category: string;
  description: string;
  riskLevel: 'read' | 'write' | 'execute' | 'admin';
  requiredPermissions: string[];
}

interface PluginWidget {
  id: string;
  name: string;
  component: string;
  slots: string[];
  size: 'small' | 'medium' | 'large' | 'full';
  requiredCapabilities: string[];
  category?: string;  // For tab grouping (inventory, command, task, info, events, reports, package)
  nodeScoped?: boolean;
  priority?: number;
  route?: string;
}
```

### Widget Manifest (TypeScript)

```typescript
interface WidgetManifest {
  [widgetId: string]: {
    id: string;
    name: string;
    load: () => Promise<{ default: SvelteComponent }>;  // Dynamic import function
    slots: string[];
    defaultSize: { width: number; height: number };
    requiredCapabilities: string[];
    category?: string;  // For tab grouping
    nodeScoped?: boolean;
    priority?: number;
    route?: string;
  };
}
```

**Note**: The widget manifest uses `load` functions for lazy loading, not direct component references. This follows the pattern established by bolt's widget manifest.

### Category Tab

```typescript
interface CategoryTab {
  id: string;          // 'inventory', 'command', 'task', etc.
  label: string;       // 'Inventory', 'Commands', 'Tasks', etc.
  count: number;       // Number of capabilities in this category
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Plugin Manifest Validation

*For any* plugin with a plugin.json file, loading the manifest should either succeed with valid data or fail with descriptive validation errors, and validation failures should not prevent other plugins from loading.
**Validates: Requirements 1.2, 1.6**

### Property 2: Capability Registration Completeness

*For any* valid plugin manifest, all capabilities defined in the manifest should be registered in the CapabilityRegistry and accessible via the plugin's capability list.
**Validates: Requirements 1.3**

### Property 3: Multi-Type Plugin Registration

*For any* plugin with multiple integration types in its integrationTypes array, the plugin should appear in all corresponding integration type views and navigation categories.
**Validates: Requirements 1.4, 3.5**

### Property 4: Widget Registration with Metadata

*For any* widget manifest imported during frontend initialization, each widget entry should be registered in the global WIDGET_MANIFEST with all required metadata fields (id, name, component, slots, size, requiredCapabilities).
**Validates: Requirements 2.3, 7.2**

### Property 5: Integration Type Navigation Completeness

*For any* set of registered plugins, the navigation menu should display menu items for all unique integration types present in those plugins, and clicking any integration type should show all plugins of that type.
**Validates: Requirements 3.1, 3.3, 3.4**

### Property 6: Capability Category Grouping

*For any* plugin's capabilities, grouping by category should produce a map where each category contains only capabilities with that category value, and all capabilities appear in exactly one category group.
**Validates: Requirements 4.1**

### Property 7: Category Tab Visibility

*For any* plugin and capability category, a tab for that category should exist in the plugin home page if and only if the plugin has at least one capability in that category.
**Validates: Requirements 4.2, 4.4**

### Property 8: Category Widget Filtering

*For any* selected category tab, only widgets with a matching category property (or no category for the overview tab) should be displayed, and all matching widgets should be displayed.
**Validates: Requirements 4.3**

### Property 9: Permission-Based Widget Filtering

*For any* user and widget with required capabilities, the widget should be displayed if and only if the user has all required permissions for those capabilities.
**Validates: Requirements 4.5, 7.4**

### Property 10: Migrated Widget Interface Compliance

*For any* widget migrated from 0.5 components, the widget should export a valid Svelte component and include all required v1 widget metadata (id, name, component, slots, size, requiredCapabilities).
**Validates: Requirements 5.4**

### Property 11: Inventory Plugin Endpoint Exposure

*For any* plugin with inventory capabilities (inventory.list, inventory.get, inventory.groups, inventory.filter), all four standardized inventory endpoints should be exposed and functional.
**Validates: Requirements 6.1**

### Property 12: Multi-Source Inventory Querying

*For any* inventory view load, all plugins with InventorySource integration type should be queried, and results should be merged into a unified inventory list.
**Validates: Requirements 6.2, 6.3**

### Property 13: Multi-Source Node Attribution

*For any* node that appears in multiple inventory sources, the display should indicate all plugins that provide data for that node.
**Validates: Requirements 6.4**

### Property 14: Inventory Source Failure Isolation

*For any* inventory plugin that fails to return data, an error should be displayed for that specific plugin, but other inventory sources should continue to function and display their data.
**Validates: Requirements 6.5**

### Property 15: Widget Context Provision

*For any* widget render, the widget should receive context containing at minimum pluginName and pluginInfo, and if the widget is node-scoped, it should also receive node context.
**Validates: Requirements 7.3, 7.5**

### Property 16: Widget Category Placement

*For any* widget, it should appear in its specified category tab if it has a category property, otherwise it should appear in the overview/general tab.
**Validates: Requirements 8.3, 8.4**

### Property 17: Empty Category State Display

*For any* category tab with no available widgets (either no widgets exist or user lacks permissions), an empty state message should be displayed.
**Validates: Requirements 8.5**

### Property 18: Plugin Manifest Consistency

*For any* plugin with both a plugin.json manifest and a TypeScript widget manifest (frontend/index.ts), the widgets defined in both manifests should match in terms of widget IDs and required capabilities.
**Validates: Requirements 9.3**

### Property 19: Plugin Health Status Display

*For any* plugin health status (healthy or offline), the plugin home page should display the correct visual indicator with appropriate colors and messages (success indicator for healthy, error message for offline).
**Validates: Requirements 10.2, 10.3, 10.4**

### Property 20: Reactive Health Status Updates

*For any* change in plugin health status, the UI display should update to reflect the new status without requiring a manual page refresh.
**Validates: Requirements 10.5**

### Property 21: HomePage Widget Slot Restriction

*For any* widget with slots array, if the widget is displayed on HomePage, then the widget's slots array must include 'home-summary' and the widget must not be from the 'dashboard' slot.
**Validates: Requirements 11.1, 11.2**

### Property 22: Plugin Home Page Dashboard Widget Display

*For any* plugin home page in overview tab, all widgets with 'dashboard' in their slots array should be displayed, and all widgets with 'standalone-page' in their slots array should be displayed.
**Validates: Requirements 11.3, 11.4**

### Property 23: Category Tab Widget Filtering

*For any* plugin home page category tab and any widget, the widget should be displayed if and only if the widget's category matches the active tab category AND the widget's slots include either 'dashboard' or 'standalone-page'.
**Validates: Requirements 11.5**

## Error Handling

### Backend Error Handling

1. **Plugin Discovery Failures**
   - If a plugin directory cannot be read, log warning and continue with other plugins
   - If plugin.json is malformed, log error with file path and continue
   - If plugin.json fails schema validation, log validation errors and skip plugin

2. **Plugin Loading Failures**
   - If plugin entry point cannot be found, try fallback entry points
   - If plugin module fails to import, log error with stack trace and continue
   - If plugin initialization fails, mark plugin as unhealthy but keep in registry

3. **Capability Registration Failures**
   - If capability handler is missing, log error but register capability metadata
   - If capability has invalid format, log validation error and skip capability
   - If duplicate capability names exist, log warning and use last registered

### Frontend Error Handling

1. **Widget Registration Failures**
   - If widget manifest import fails, log error and continue with other plugins
   - If widget component is missing, log error but register widget metadata
   - If widget has invalid metadata, log validation warning and register with defaults

2. **Plugin Home Page Errors**
   - If plugin info API call fails, display error state with retry button
   - If plugin is offline, show offline indicator but still display static info
   - If widget loading fails, show error in widget slot but continue rendering page

3. **Navigation Errors**
   - If integration type has no plugins, hide menu item
   - If plugin route is invalid, redirect to home page
   - If user lacks permissions for all widgets, show permission denied message

### Error Recovery Strategies

1. **Graceful Degradation**
   - System continues functioning even if individual plugins fail
   - Partial data is better than no data (show available inventory sources)
   - UI remains usable even with missing widgets

2. **User Feedback**
   - Clear error messages with actionable information
   - Retry buttons for transient failures
   - Links to setup guides for configuration issues

3. **Logging and Monitoring**
   - All errors logged with context (plugin name, operation, error details)
   - Health check failures trigger alerts
   - Performance metrics for plugin loading times

## Testing Strategy

### Unit Testing

**Backend Unit Tests**:

- Plugin manifest schema validation with valid and invalid manifests
- Plugin discovery with various directory structures
- Capability registration with different capability configurations
- Error handling for missing files, malformed JSON, invalid schemas

**Frontend Unit Tests**:

- Widget registration with valid and invalid manifests
- Category tab building with various capability configurations
- Widget filtering by category and permissions
- Health status display with different status values

**Example Unit Tests**:

- Test that ansible and ssh plugins are included in widget registration
- Test that InventorySource appears in navigation menu
- Test that plugin with no capabilities in a category doesn't show that tab
- Test that offline plugin displays error message

### Property-Based Testing

**Configuration**:

- Use fast-check library for TypeScript/JavaScript property-based testing
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: v1-plugins-finalization, Property N: [property text]**

**Property Test Examples**:

1. **Property 2: Capability Registration Completeness**

   ```typescript
   // Feature: v1-plugins-finalization, Property 2: Capability Registration Completeness
   fc.assert(
     fc.property(
       fc.record({
         name: fc.string(),
         capabilities: fc.array(fc.record({
           name: fc.string().filter(s => /^[a-z]+\.[a-z]+$/.test(s)),
           category: fc.constantFrom('inventory', 'command', 'task', 'info'),
           description: fc.string(),
           riskLevel: fc.constantFrom('read', 'write', 'execute', 'admin'),
           requiredPermissions: fc.array(fc.string()),
         })),
       }),
       (manifest) => {
         const plugin = loadPluginFromManifest(manifest);
         const registeredCapabilities = plugin.capabilities.map(c => c.name);
         const manifestCapabilities = manifest.capabilities.map(c => c.name);
         
         // All manifest capabilities should be registered
         return manifestCapabilities.every(cap => 
           registeredCapabilities.includes(cap)
         );
       }
     ),
     { numRuns: 100 }
   );
   ```

2. **Property 7: Category Tab Visibility**

   ```typescript
   // Feature: v1-plugins-finalization, Property 7: Category Tab Visibility
   fc.assert(
     fc.property(
       fc.record({
         capabilities: fc.array(fc.record({
           category: fc.constantFrom('inventory', 'command', 'task', 'info', 'events', 'reports', 'package'),
         })),
       }),
       (pluginInfo) => {
         const tabs = buildCategoryTabs(pluginInfo);
         const categoriesWithCapabilities = new Set(
           pluginInfo.capabilities.map(c => c.category)
         );
         
         // Tab exists iff category has capabilities
         for (const category of ['inventory', 'command', 'task', 'info', 'events', 'reports', 'package']) {
           const hasTab = tabs.some(t => t.id === category);
           const hasCapabilities = categoriesWithCapabilities.has(category);
           
           if (hasTab !== hasCapabilities) {
             return false;
           }
         }
         
         return true;
       }
     ),
     { numRuns: 100 }
   );
   ```

3. **Property 9: Permission-Based Widget Filtering**

   ```typescript
   // Feature: v1-plugins-finalization, Property 9: Permission-Based Widget Filtering
   fc.assert(
     fc.property(
       fc.record({
         widgets: fc.array(fc.record({
           id: fc.string(),
           requiredCapabilities: fc.array(fc.string()),
         })),
         userPermissions: fc.array(fc.string()),
       }),
       ({ widgets, userPermissions }) => {
         const filtered = filterWidgetsByPermissions(widgets, userPermissions);
         
         // Widget should be included iff user has all required permissions
         for (const widget of widgets) {
           const hasAllPermissions = widget.requiredCapabilities.every(cap =>
             userPermissions.includes(cap)
           );
           const isIncluded = filtered.some(w => w.id === widget.id);
           
           if (hasAllPermissions !== isIncluded) {
             return false;
           }
         }
         
         return true;
       }
     ),
     { numRuns: 100 }
   );
   ```

### Integration Testing

**End-to-End Scenarios**:

1. Start backend, verify all 6 native plugins are discovered and loaded
2. Load frontend, verify all plugin widgets are registered
3. Navigate to each integration type, verify correct plugins are displayed
4. Navigate to each plugin home page, verify tabs match capabilities
5. Test inventory view with multiple sources (ansible, bolt, puppetdb, ssh)
6. Test permission-based widget filtering with different user roles

**Component Integration Tests**:

- Test IntegrationHomePage with mock plugin data
- Test WidgetSlot with category filtering
- Test navigation menu with various plugin configurations
- Test widget registration with missing frontend entry points

### Manual Testing Checklist

- [ ] All 6 native plugins appear in backend logs on startup
- [ ] Navigation menu shows InventorySource, RemoteExecution, Info, Event types
- [ ] Ansible plugin home page displays with correct tabs
- [ ] Bolt plugin home page shows inventory, command, task, info, package tabs
- [ ] PuppetDB plugin home page shows inventory, info, events tabs
- [ ] SSH plugin home page displays with inventory tab
- [ ] Inventory view shows nodes from all inventory sources
- [ ] Clicking category tabs filters widgets correctly
- [ ] Widgets respect user permissions
- [ ] Offline plugins show error state
- [ ] Health status updates without page refresh
