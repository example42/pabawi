# Design Document: Node Overview Widget Grid

## Overview

Reorganize the node detail overview tab into a composable, plugin-driven widget grid. Each integration plugin contributes one or more widgets via a frontend-only component registry. Widgets render in a 4-column responsive grid with priority-weighted ordering. Action buttons occupy a dedicated header row above the grid. Widgets load asynchronously and in parallel with graceful error handling per widget.

## Architecture

The widget grid system is a frontend-only architecture that transforms the node detail overview tab from a hard-coded layout into a composable, plugin-driven grid. Integration plugins contribute widgets through a central registry; the grid renders them in a priority-weighted 4-column layout after filtering out disabled integrations.

```
┌──────────────────────────────────────────────────┐
│  Static Imports (side-effects at module load)    │
│  e.g. import '../widgets/generalInfo.widget'     │
│       import '../widgets/puppetRuns.widget'       │
└───────────────────────┬──────────────────────────┘
                        │ registerWidget(def)
                        ▼
┌──────────────────────────────────────────────────┐
│  widgetRegistry.svelte.ts  ($state collection)   │
│  - Widget_Definition[]                           │
│  - getWidgets(): readonly Widget_Definition[]    │
└───────────────────────┬──────────────────────────┘
                        │ consumed by
                        ▼
┌──────────────────────────────────────────────────┐
│  WidgetGrid.svelte                               │
│  - Fetches /api/integrations/status              │
│  - Filters widgets by enabled integrations       │
│  - Separates "action" widgets → ActionRow        │
│  - Sorts by priority, renders WidgetFrame[]      │
└──────┬───────────────────────────────┬───────────┘
       │                               │
       ▼                               ▼
┌──────────────┐           ┌───────────────────────┐
│ ActionRow    │           │ WidgetFrame.svelte     │
│ (flex row)   │           │ (loading/error/content)│
└──────────────┘           └───────────────────────┘
```

## Components and Interfaces

### 1. Widget Registry Module (`frontend/src/lib/widgetRegistry.svelte.ts`)

Central store for widget definitions using Svelte 5 runes.

```typescript
import type { Component } from 'svelte';

export type WidgetType = 'action' | 'list' | 'summary';

export interface WidgetDefinition {
  /** Unique identifier for the widget */
  id: string;
  /** Display name shown in error badges */
  name: string;
  /** Svelte component to render */
  component: Component;
  /** Integration name (must match /api/integrations/status response) */
  integration: string;
  /** Widget category: determines placement (action → ActionRow, others → grid) */
  type: WidgetType;
  /** Column span in the grid: 1, 2, or 3. Clamped to [1,3] on registration. */
  colSpan: number;
  /** Numeric priority weight. Lower renders first. */
  priority: number;
}

// Internal reactive state
let definitions = $state<WidgetDefinition[]>([]);

/**
 * Register a widget definition. Column span is clamped to [1,3].
 * Called at module load time as a side-effect of static imports.
 */
export function registerWidget(def: WidgetDefinition): void {
  const clamped: WidgetDefinition = {
    ...def,
    colSpan: Math.max(1, Math.min(3, Math.round(def.colSpan))),
  };
  definitions.push(clamped);
}

/**
 * Get all registered widget definitions (readonly snapshot).
 */
export function getWidgets(): readonly WidgetDefinition[] {
  return definitions;
}

/**
 * Reset registry (used in tests only).
 */
export function _resetForTesting(): void {
  definitions = [];
}
```

### 2. WidgetGrid Component (`frontend/src/components/WidgetGrid.svelte`)

Orchestrator that fetches integration status, filters widgets, and renders the grid.

```typescript
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { getWidgets, type WidgetDefinition } from '../lib/widgetRegistry.svelte';
  import ActionRow from './ActionRow.svelte';
  import WidgetFrame from './WidgetFrame.svelte';

  interface Props {
    nodeId: string;
  }

  interface IntegrationStatusEntry {
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
    type: 'execution' | 'information' | 'both';
  }

  let { nodeId }: Props = $props();

  let integrationStatus = $state<IntegrationStatusEntry[]>([]);
  let statusError = $state<string | null>(null);
  let statusLoaded = $state(false);

  // Set of enabled integration names (connected or degraded)
  const enabledIntegrations = $derived(
    new Set(
      integrationStatus
        .filter(i => i.status === 'connected' || i.status === 'degraded')
        .map(i => i.name)
    )
  );

  // All registered widgets, filtered to enabled integrations
  const visibleWidgets = $derived(
    getWidgets().filter(w => enabledIntegrations.has(w.integration))
  );

  // Action widgets sorted by priority (for ActionRow)
  const actionWidgets = $derived(
    stableSortByPriority(visibleWidgets.filter(w => w.type === 'action'))
  );

  // Grid widgets (non-action) sorted by priority
  const gridWidgets = $derived(
    stableSortByPriority(visibleWidgets.filter(w => w.type !== 'action'))
  );

  function stableSortByPriority(widgets: readonly WidgetDefinition[]): WidgetDefinition[] {
    return [...widgets].sort((a, b) => a.priority - b.priority);
  }

  onMount(async () => {
    try {
      const data = await get<{ integrations: IntegrationStatusEntry[] }>(
        '/api/integrations/status',
        { maxRetries: 1 }
      );
      integrationStatus = data.integrations;
    } catch (err) {
      statusError = err instanceof Error ? err.message : 'Failed to load integration status';
    } finally {
      statusLoaded = true;
    }
  });
</script>

{#if statusError}
  <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
    <p class="text-sm text-red-700 dark:text-red-400">
      Unable to load integration status: {statusError}
    </p>
  </div>
{:else}
  {#if actionWidgets.length > 0}
    <ActionRow widgets={actionWidgets} {nodeId} />
  {/if}

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each gridWidgets as widget (widget.id)}
      <WidgetFrame {widget} {nodeId} />
    {/each}
  </div>
{/if}
```

### 3. WidgetFrame Component (`frontend/src/components/WidgetFrame.svelte`)

Container for each widget position. Manages loading, error, and content states.

```typescript
<script lang="ts">
  import type { WidgetDefinition } from '../lib/widgetRegistry.svelte';

  interface Props {
    widget: WidgetDefinition;
    nodeId: string;
  }

  let { widget, nodeId }: Props = $props();

  let state = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state<string | null>(null);
  let mountKey = $state(0);

  // Column span CSS class mapping
  const spanClass = $derived(
    widget.colSpan === 3 ? 'sm:col-span-2 lg:col-span-3'
    : widget.colSpan === 2 ? 'sm:col-span-2 lg:col-span-2'
    : 'col-span-1'
  );

  function handleReady(): void {
    state = 'ready';
  }

  function handleError(err: Error): void {
    state = 'error';
    error = err.message || 'Widget failed to load';
  }

  function retry(): void {
    state = 'loading';
    error = null;
    mountKey += 1;
  }
</script>

<div class="{spanClass} min-h-[120px]">
  {#if state === 'loading'}
    <div class="h-full animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
      <div class="p-6 space-y-3">
        <div class="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div class="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div class="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
      </div>
    </div>
  {/if}

  {#if state === 'error'}
    <div class="h-full rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-2">
        <span class="text-sm font-medium text-red-800 dark:text-red-300">{widget.integration}</span>
        <span class="text-sm text-red-600 dark:text-red-400">{error}</span>
      </div>
      <button
        type="button"
        class="mt-2 text-sm text-red-700 underline hover:no-underline dark:text-red-400"
        onclick={retry}
      >
        Retry
      </button>
    </div>
  {/if}

  {#if state === 'loading' || state === 'ready'}
    <div class:hidden={state === 'loading'}>
      {#key mountKey}
        <widget.component
          {nodeId}
          onReady={handleReady}
          onError={handleError}
        />
      {/key}
    </div>
  {/if}
</div>
```

### 4. ActionRow Component (`frontend/src/components/ActionRow.svelte`)

Horizontal flex container for action-type widgets.

```typescript
<script lang="ts">
  import type { WidgetDefinition } from '../lib/widgetRegistry.svelte';
  import WidgetFrame from './WidgetFrame.svelte';

  interface Props {
    widgets: WidgetDefinition[];
    nodeId: string;
  }

  let { widgets, nodeId }: Props = $props();
</script>

{#if widgets.length > 0}
  <div class="mb-4 flex flex-wrap gap-2">
    {#each widgets as widget (widget.id)}
      <WidgetFrame {widget} {nodeId} />
    {/each}
  </div>
{/if}
```

### 5. Widget Self-Registration Pattern

Each widget is a standalone module that registers itself as a side-effect. These modules are imported statically by the WidgetGrid (or a central barrel file) to guarantee registration before render.

Example (`frontend/src/lib/widgets/generalInfo.widget.ts`):

```typescript
import { registerWidget } from '../widgetRegistry.svelte';
import GeneralInfoWidget from '../../components/GeneralInfoWidget.svelte';

registerWidget({
  id: 'core-general-info',
  name: 'General Information',
  component: GeneralInfoWidget,
  integration: 'bolt', // always available when bolt is connected
  type: 'summary',
  colSpan: 2,
  priority: 10,
});
```

A barrel file (`frontend/src/lib/widgets/index.ts`) imports all widget registration modules:

```typescript
// Core widgets
import './generalInfo.widget';
import './latestActions.widget';

// Integration-dependent widgets
import './puppetRuns.widget';
import './monitoringSummary.widget';
import './consoleAccess.widget';
```

The `WidgetGrid.svelte` imports this barrel file at the top of its script block, ensuring all widgets are registered before the first render.

### 6. Integration Status Fetching

The existing `GET /api/integrations/status` endpoint returns:

```typescript
interface IntegrationStatusResponse {
  integrations: Array<{
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
    type: 'execution' | 'information' | 'both';
    lastCheck?: string;
    message?: string;
  }>;
}
```

Filtering logic (pure function, testable independently):

```typescript
export function filterWidgetsByStatus(
  widgets: readonly WidgetDefinition[],
  integrations: readonly IntegrationStatusEntry[],
): WidgetDefinition[] {
  const enabled = new Set(
    integrations
      .filter(i => i.status === 'connected' || i.status === 'degraded')
      .map(i => i.name),
  );
  return widgets.filter(w => enabled.has(w.integration));
}
```

### 7. Data Flow

```
Module load → widget registration side-effects fire → registry populated
                                                          │
Page mount → WidgetGrid.svelte mounts ───────────────────►│
                │                                          │
                ├─ fetch /api/integrations/status           │
                │                                          │
                ▼                                          ▼
           statusLoaded = true              getWidgets() returns all defs
                │                                          │
                └──── $derived: filterWidgetsByStatus ─────┘
                              │
                ┌─────────────┼─────────────┐
                ▼                            ▼
         actionWidgets              gridWidgets
         (type=action)              (type=list|summary)
                │                            │
                ▼                            ▼
          ActionRow                  CSS Grid with WidgetFrames
         (flex-wrap)               (4-col, responsive breakpoints)
```

### 8. Individual Widget Components (Migration)

Each existing overview section becomes a standalone Svelte component:

| Widget | Component | Type | Span | Priority | Integration |
|--------|-----------|------|------|----------|-------------|
| General Information | `GeneralInfoWidget.svelte` | summary | 2 | 10 | bolt |
| Latest Puppet Runs | `PuppetRunsWidget.svelte` | list | 3 | 100 | puppetdb |
| Latest Actions | `LatestActionsWidget.svelte` | list | 2 | 20 | bolt |
| Monitoring Summary | `MonitoringSummaryWidget.svelte` | summary | 2 | 100 | checkmk |
| Console Access | `ConsoleAccessWidget.svelte` | action | 1 | 100 | proxmox |

The "General Information" and "Latest Actions" widgets use `bolt` as their integration since they rely on the core Bolt inventory which is always the base integration. Their priority values (10, 20) are lower than integration-contributed widgets (100+), ensuring they render first.

### 9. Error Handling Strategy

- **Per-widget isolation**: Each `WidgetFrame` catches errors from its child component independently. An error in one widget does not propagate to siblings.
- **Error badge**: Shows the integration name and a truncated error message within the widget's grid slot, preserving layout.
- **Retry**: A button in the error state increments a `mountKey`, causing Svelte's `{#key}` block to destroy and recreate the component.
- **Integration status error**: If the status endpoint fails entirely, no integration-dependent widgets render. A single inline notification explains the issue.

### 10. Responsive Breakpoints

The grid uses Tailwind's responsive prefixes:
- `grid-cols-1` (default, below `sm`)
- `sm:grid-cols-2` (≥640px)
- `lg:grid-cols-4` (≥1024px)

Column spans are also responsive:
- `col-span-1` always applies at base
- `sm:col-span-N` applies at ≥640px
- `lg:col-span-N` applies at ≥1024px

Below `sm`, all widgets collapse to full width regardless of declared span.

## Data Models

### WidgetDefinition

```typescript
interface WidgetDefinition {
  id: string;
  name: string;
  component: Component;
  integration: string;
  type: 'action' | 'list' | 'summary';
  colSpan: number; // clamped to [1,3]
  priority: number;
}
```

### Widget Component Contract

Every widget component must accept these props:

```typescript
interface WidgetComponentProps {
  nodeId: string;
  onReady: () => void;
  onError: (error: Error) => void;
}
```

The widget calls `onReady()` after its data loads successfully, and `onError(err)` if it fails. The `WidgetFrame` transitions states accordingly.

### IntegrationStatusEntry

```typescript
interface IntegrationStatusEntry {
  name: string;
  status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
  type: 'execution' | 'information' | 'both';
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Integration status endpoint fails | No integration widgets rendered; inline error notification |
| Widget throws on mount | Error badge with integration name + message; retry button |
| Widget throws during data fetch | Same as mount error (caught by onError callback) |
| Widget takes too long | Not enforced at frame level (individual widgets handle their own timeouts) |
| Unknown integration in widget def | Widget excluded from render (not in enabled set) |

## Testing Strategy

- **Unit tests** (Vitest + @testing-library/svelte): Verify individual component behavior — WidgetFrame states, ActionRow rendering, WidgetGrid filtering logic.
- **Property tests** (Vitest + fast-check): Validate universal properties of the registry (clamping, filtering, sorting) across randomized inputs.
- **Example tests**: Specific scenarios like error state rendering, retry behavior, empty action row.
- **E2E tests** (Playwright): Responsive breakpoints and full-page integration with real API responses.

Unit tests cover the pure-logic layer (registry, filtering, sorting). Property tests target the 8 correctness properties below. Integration tests verify the component tree renders correctly with mocked API responses.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Registration preserves widget definitions

For any valid WidgetDefinition, registering it in the Widget_Registry and then querying the registry SHALL return a definition with all original fields preserved (except colSpan which may be clamped).

**Validates: Requirements 1.1, 1.2**

### Property 2: Column span clamping

For any integer value provided as colSpan during registration, the stored colSpan SHALL equal `Math.max(1, Math.min(3, Math.round(value)))`.

**Validates: Requirements 1.3**

### Property 3: Integration filtering

For any set of registered WidgetDefinitions and any integration status response, the visible widget set SHALL contain exactly those widgets whose integration name appears in the status response with status "connected" or "degraded", and no others.

**Validates: Requirements 2.2, 2.4**

### Property 4: Stable priority ordering

For any set of widgets rendered in the grid or action row, the rendered sequence SHALL be sorted by ascending priority weight, and widgets with equal priority weight SHALL appear in their original registration order (stable sort).

**Validates: Requirements 3.2, 3.3, 4.3**

### Property 5: Column span applied to frame element

For any widget rendered in the grid, regardless of its internal state (loading, ready, or error), its containing frame element SHALL have a CSS class corresponding to its declared colSpan value.

**Validates: Requirements 3.4, 5.4, 6.4**

### Property 6: Action row composition

For any set of visible widgets, the action row SHALL contain exactly those widgets with type "action" and no widgets of type "list" or "summary", rendered in ascending priority order.

**Validates: Requirements 4.2, 4.3**

### Property 7: Error badge content

For any widget that throws an error, the displayed error badge SHALL contain the widget's integration name and a non-empty error summary string.

**Validates: Requirements 6.1**

### Property 8: Error isolation

For any set of widgets where a subset throws errors, all non-erroring widgets SHALL render their content state independently and without interruption.

**Validates: Requirements 6.3**
