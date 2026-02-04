# Frontend Hardcoded Plugin References Audit

**Date:** 2026-02-04  
**Task:** 2.1 Scan frontend for hardcoded plugin imports  
**Goal:** Identify every hardcoded reference to bolt, puppetdb, puppetserver, hiera in frontend/src/

## Summary

Found **8 categories** of hardcoded plugin references across **15+ files** in the frontend codebase.

## Categories of Hardcoded References

### 1. Direct Plugin Imports from `plugins/native/`

**Location:** `frontend/src/widgets/index.ts`

**Issues:**

- Direct imports from `@plugins/native/bolt/frontend`
- Direct imports from `@plugins/native/puppetdb/frontend`
- Direct imports from `@plugins/native/puppetserver/frontend`
- Direct imports from `@plugins/native/hiera/frontend`
- Exports plugin-specific widget manifests and getter functions

**Lines:**

```typescript
// Line 15-18: Direct imports
import { BOLT_WIDGET_MANIFEST, getBoltWidgetIds, getBoltWidget } from '@plugins/native/bolt/frontend';
import { PUPPETDB_WIDGET_MANIFEST, getPuppetDBWidgetIds, getPuppetDBWidget } from '@plugins/native/puppetdb/frontend';
import { PUPPETSERVER_WIDGET_MANIFEST, getPuppetserverWidgetIds, getPuppetserverWidget } from '@plugins/native/puppetserver/frontend';
import { HIERA_WIDGET_MANIFEST, getHieraWidgetIds, getHieraWidget } from '@plugins/native/hiera/frontend';

// Line 21-24: Re-exports
export { BOLT_WIDGET_MANIFEST } from '@plugins/native/bolt/frontend';
export { PUPPETDB_WIDGET_MANIFEST } from '@plugins/native/puppetdb/frontend';
export { PUPPETSERVER_WIDGET_MANIFEST } from '@plugins/native/puppetserver/frontend';
export { HIERA_WIDGET_MANIFEST } from '@plugins/native/hiera/frontend';

// Line 151-154: Function exports
export { getBoltWidgetIds, getBoltWidget };
export { getPuppetDBWidgetIds, getPuppetDBWidget };
export { getPuppetserverWidgetIds, getPuppetserverWidget };
export { getHieraWidgetIds, getHieraWidget };
```

**Impact:** HIGH - This is the main widget registry that hardcodes all plugin widgets

---

### 2. Plugin-Specific Setup Guide Components

**Location:** `frontend/src/components/index.ts`

**Issues:**

- Exports for `BoltSetupGuide`, `PuppetdbSetupGuide`, `PuppetserverSetupGuide`, `HieraSetupGuide`
- Exports for `GlobalHieraTab`, `NodeHieraTab`
- Exports for `PuppetDBAdmin`, `PuppetserverStatus`

**Lines:**

```typescript
// Line 22, 36-38
export { default as HieraSetupGuide } from "./HieraSetupGuide.svelte";
export { default as PuppetserverSetupGuide } from "./PuppetserverSetupGuide.svelte";
export { default as PuppetdbSetupGuide } from "./PuppetdbSetupGuide.svelte";
export { default as BoltSetupGuide } from "./BoltSetupGuide.svelte";

// Line 21-22, 29, 32
export { default as GlobalHieraTab } from "./GlobalHieraTab.svelte";
export { default as NodeHieraTab } from "./NodeHieraTab.svelte";
export { default as PuppetDBAdmin } from "./PuppetDBAdmin.svelte";
```

**Component Files:**

- `frontend/src/components/BoltSetupGuide.svelte`
- `frontend/src/components/PuppetdbSetupGuide.svelte`
- `frontend/src/components/PuppetserverSetupGuide.svelte`
- `frontend/src/components/HieraSetupGuide.svelte`
- `frontend/src/components/GlobalHieraTab.svelte`
- `frontend/src/components/NodeHieraTab.svelte`
- `frontend/src/components/PuppetDBAdmin.svelte`
- `frontend/src/components/PuppetserverStatus.svelte`

**Impact:** HIGH - These are plugin-specific components that should be in plugin directories

---

### 3. Hardcoded Widget Component Imports in Pages

**Location:** `frontend/src/pages/IntegrationHomePage.svelte`

**Issues:**

- Hardcoded dynamic imports for PuppetDB widgets
- Widget component mapping uses hardcoded plugin names

**Lines:**

```typescript
// Line 81-87: Hardcoded widget component map
const widgetComponents: Record<string, () => Promise<{ default: Component }>> = {
  // PuppetDB widgets
  'puppetdb:node-browser': () => import('@plugins/native/puppetdb/frontend/NodeBrowser.svelte'),
  'puppetdb:facts-explorer': () => import('@plugins/native/puppetdb/frontend/FactsExplorer.svelte'),
  'puppetdb:reports-viewer': () => import('@plugins/native/puppetdb/frontend/ReportsViewer.svelte'),
  'puppetdb:reports-summary': () => import('@plugins/native/puppetdb/frontend/ReportsSummary.svelte'),
  'puppetdb:events-viewer': () => import('@plugins/native/puppetdb/frontend/EventsViewer.svelte'),
  'puppetdb:catalog-viewer': () => import('@plugins/native/puppetdb/frontend/CatalogViewer.svelte'),
};
```

**Impact:** HIGH - Prevents dynamic widget loading

---

### 4. Hardcoded Plugin Names in IntegrationSetupPage

**Location:** `frontend/src/pages/IntegrationSetupPage.svelte`

**Issues:**

- Imports plugin-specific setup guide components
- Uses hardcoded plugin name checks in template

**Lines:**

```typescript
// Line 4: Imports
import { PuppetserverSetupGuide, PuppetdbSetupGuide, BoltSetupGuide, HieraSetupGuide } from '../components';

// Line 70, 97, 124, 151: Template conditionals
{#if integration === 'puppetserver'}
  <PuppetserverSetupGuide />
{:else if integration === 'puppetdb'}
  <PuppetdbSetupGuide />
{:else if integration === 'bolt'}
  <BoltSetupGuide />
{:else if integration === 'hiera'}
  <HieraSetupGuide />
```

**Impact:** HIGH - Hardcoded plugin-specific setup pages

---

### 5. Hardcoded Plugin Names in PuppetPage

**Location:** `frontend/src/pages/PuppetPage.svelte`

**Issues:**

- Imports plugin-specific components
- Hardcoded plugin name checks
- Hardcoded integration color lookups
- Hardcoded tab IDs including 'hiera'

**Lines:**

```typescript
// Line 10-12: Imports
import PuppetserverStatus from '../components/PuppetserverStatus.svelte';
import PuppetDBAdmin from '../components/PuppetDBAdmin.svelte';
import GlobalHieraTab from '../components/GlobalHieraTab.svelte';

// Line 25: Tab type includes 'hiera'
type TabId = 'reports' | 'environments' | 'facts' | 'status' | 'admin' | 'hiera' | 'analysis';

// Line 92-98: Hardcoded plugin name lookups
const puppetDB = data.integrations.find(i => i.name === 'puppetdb');
const puppetserver = data.integrations.find(i => i.name === 'puppetserver');
const hiera = data.integrations.find(i => i.name === 'hiera');

isPuppetDBActive = puppetDB?.status === 'connected';
isPuppetserverActive = puppetserver?.status === 'connected';
isHieraActive = hiera?.status === 'connected';

// Line 244, 265, 286, 307, 329, 352, 373: Hardcoded color lookups
style="color: {integrationColors.getColor('puppetdb').primary}"
style="color: {integrationColors.getColor('puppetserver').primary}"
style="color: {integrationColors.getColor('hiera').primary}"
```

**Impact:** HIGH - Entire page is hardcoded for specific plugins

---

### 6. Hardcoded Plugin Names in InventoryPage

**Location:** `frontend/src/pages/InventoryPage.svelte`

**Issues:**

- Hardcoded default source as 'bolt'
- Hardcoded source display name mapping
- Hardcoded integration badge references
- Hardcoded PuppetDB-specific features (PQL query)

**Lines:**

```typescript
// Line 209, 230: Default to 'bolt'
result = result.filter(node => (node.source || 'bolt') === sourceFilter);
comparison = (a.source || 'bolt').localeCompare(b.source || 'bolt');

// Line 246: Default source
const source = node.source || 'bolt';

// Line 389-396: Hardcoded source display names
function getSourceDisplayName(source: string): string {
  switch (source) {
    case 'bolt':
      return 'Bolt';
    case 'puppetdb':
      return 'PuppetDB';
    case 'puppetserver':
      return 'Puppetserver';
    case 'hiera':
      return 'Hiera';
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

// Line 432-433: Hardcoded integration badges
<IntegrationBadge integration="bolt" variant="badge" size="sm" />
<IntegrationBadge integration="puppetdb" variant="badge" size="sm" />

// Line 439, 455: PuppetDB-specific feature checks
{#if Object.keys(sources).includes('puppetdb')}
{#if showPqlInput && Object.keys(sources).includes('puppetdb')}

// Line 723, 789: Default source in template
<IntegrationBadge integration={node.source || 'bolt'} variant="badge" size="sm" />
```

**Impact:** HIGH - Hardcoded inventory source handling

---

### 7. Hardcoded Plugin Names in NodeDetailPage

**Location:** `frontend/src/pages/NodeDetailPage.svelte`

**Issues:**

- Imports plugin-specific component (NodeHieraTab)

**Lines:**

```typescript
// Line 23: Import
import NodeHieraTab from '../components/NodeHieraTab.svelte';
```

**Impact:** MEDIUM - One plugin-specific component import

---

### 8. Hardcoded Integration Colors

**Location:** `frontend/src/lib/integrationColors.svelte.ts`

**Issues:**

- Hardcoded interface with plugin names as keys
- Hardcoded type definition
- Hardcoded default colors
- Hardcoded valid integrations list

**Lines:**

```typescript
// Line 16-19: Hardcoded interface
export interface IntegrationColors {
  bolt: IntegrationColorConfig;
  puppetdb: IntegrationColorConfig;
  puppetserver: IntegrationColorConfig;
  hiera: IntegrationColorConfig;
}

// Line 24: Hardcoded type
export type IntegrationType = keyof IntegrationColors;

// Line 113: Hardcoded valid integrations
getValidIntegrations(): IntegrationType[] {
  return ['bolt', 'puppetdb', 'puppetserver', 'hiera'];
}

// Line 132-147: Hardcoded default colors
private getDefaultColors(): IntegrationColors {
  return {
    bolt: { primary: '#FFAE1A', light: '#FFF4E0', dark: '#CC8B15' },
    puppetdb: { primary: '#9063CD', light: '#F0E6FF', dark: '#7249A8' },
    puppetserver: { primary: '#2E3A87', light: '#E8EAFF', dark: '#1F2760' },
    hiera: { primary: '#C1272D', light: '#FFE8E9', dark: '#9A1F24' },
  };
}
```

**Impact:** HIGH - Core color system hardcodes plugin names

---

### 9. Plugin Names in Comments and Documentation

**Location:** Multiple files

**Issues:**

- Comments referencing specific plugins
- JSDoc examples with plugin names
- Type documentation

**Files:**

- `frontend/src/lib/api.ts` (Line 153: comment about integration names)
- `frontend/src/lib/auth.svelte.ts` (Line 564, 714: wildcard examples)
- `frontend/src/lib/multiSourceFetch.ts` (Line 4: comment about PuppetDB/Puppetserver)
- `frontend/src/lib/plugins/WidgetRegistry.svelte.ts` (Line 118, 625: examples)

**Impact:** LOW - Documentation only, but should be updated

---

### 10. Test Files with Hardcoded Plugin Names

**Location:** Test files

**Issues:**

- Test data and assertions use hardcoded plugin names

**Files:**

- `frontend/src/components/IntegrationBadge.test.ts` (58+ references)
- `frontend/src/components/DebugCopyButton.test.ts` (Line 23, 188)
- `frontend/src/components/DebugPanel.test.ts` (Line 16, 23, 167-168)
- `frontend/src/lib/navigation/MenuBuilder.test.ts` (Line 200, 221, 225, 232-233)

**Impact:** MEDIUM - Tests need to be updated to use dynamic plugin data

---

## Files Requiring Modification

### High Priority (Core Infrastructure)

1. **`frontend/src/widgets/index.ts`** - Complete rewrite needed for dynamic widget loading
2. **`frontend/src/lib/integrationColors.svelte.ts`** - Make dynamic, fetch from API
3. **`frontend/src/pages/IntegrationHomePage.svelte`** - Remove hardcoded widget imports
4. **`frontend/src/pages/IntegrationSetupPage.svelte`** - Make setup pages dynamic
5. **`frontend/src/pages/PuppetPage.svelte`** - Remove or make generic
6. **`frontend/src/pages/InventoryPage.svelte`** - Remove hardcoded source handling

### Medium Priority (Components)

1. **`frontend/src/components/index.ts`** - Remove plugin-specific exports
2. **`frontend/src/pages/NodeDetailPage.svelte`** - Remove plugin-specific imports

### Plugin-Specific Components (Should Move to Plugin Directories)

1. **`frontend/src/components/BoltSetupGuide.svelte`** → `plugins/native/bolt/frontend/`
2. **`frontend/src/components/PuppetdbSetupGuide.svelte`** → `plugins/native/puppetdb/frontend/`
3. **`frontend/src/components/PuppetserverSetupGuide.svelte`** → `plugins/native/puppetserver/frontend/`
4. **`frontend/src/components/HieraSetupGuide.svelte`** → `plugins/native/hiera/frontend/`
5. **`frontend/src/components/GlobalHieraTab.svelte`** → `plugins/native/hiera/frontend/`
6. **`frontend/src/components/NodeHieraTab.svelte`** → `plugins/native/hiera/frontend/`
7. **`frontend/src/components/PuppetDBAdmin.svelte`** → `plugins/native/puppetdb/frontend/`
8. **`frontend/src/components/PuppetserverStatus.svelte`** → `plugins/native/puppetserver/frontend/`

### Low Priority (Documentation & Tests)

1. **`frontend/src/lib/api.ts`** - Update comments
2. **`frontend/src/lib/auth.svelte.ts`** - Update examples in comments
3. **`frontend/src/lib/multiSourceFetch.ts`** - Update comments
4. **`frontend/src/lib/plugins/WidgetRegistry.svelte.ts`** - Update examples
5. **`frontend/src/components/IntegrationBadge.test.ts`** - Update test data
6. **`frontend/src/components/DebugCopyButton.test.ts`** - Update test data
7. **`frontend/src/components/DebugPanel.test.ts`** - Update test data
8. **`frontend/src/lib/navigation/MenuBuilder.test.ts`** - Update test data

## Recommended Approach

### Phase 1: Core Infrastructure

1. Create dynamic widget loading system (replace `widgets/index.ts`)
2. Make integration colors dynamic (fetch from API)
3. Create generic setup page system

### Phase 2: Move Plugin Components

1. Move all plugin-specific components to `plugins/native/{plugin}/frontend/`
2. Update imports to use dynamic loading

### Phase 3: Update Pages

1. Make IntegrationHomePage fully dynamic
2. Remove or genericize PuppetPage
3. Update InventoryPage to be source-agnostic
4. Update NodeDetailPage to load widgets dynamically

### Phase 4: Cleanup

1. Update comments and documentation
2. Update test files
3. Remove plugin-specific exports from `components/index.ts`

## Verification Commands

```bash
# Check for remaining hardcoded plugin names in frontend
grep -r "bolt\|puppetdb\|puppetserver\|hiera" frontend/src/ \
  --include="*.ts" --include="*.svelte" \
  | grep -v "// " \
  | grep -v "node_modules" \
  | grep -v ".test.ts"

# Check for imports from plugins/native
grep -r "@plugins/native" frontend/src/ \
  --include="*.ts" --include="*.svelte"

# Check for hardcoded integration names in string literals
grep -r "['\"]\(bolt\|puppetdb\|puppetserver\|hiera\)['\"]" frontend/src/ \
  --include="*.ts" --include="*.svelte" \
  | grep -v ".test.ts"
```

## Next Steps

This audit completes task 2.1. The next task (2.2) should focus on removing plugin-specific imports from pages, starting with the high-priority files identified above.
