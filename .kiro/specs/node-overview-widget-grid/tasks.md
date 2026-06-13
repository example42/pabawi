# Implementation Plan: Node Overview Widget Grid

## Overview

Refactor the node detail overview tab from a monolithic 2700-line page into a composable, plugin-driven widget grid. A frontend-only widget registry allows integration plugins to contribute widgets via static import side-effects. Widgets render in a responsive 4-column CSS grid with priority-weighted ordering, action buttons in a dedicated header row, and per-widget async loading with error isolation.

## Tasks

- [x] 1. Create widget registry module and types
  - [x] 1.1 Create `frontend/src/lib/widgetRegistry.svelte.ts` with `WidgetDefinition` interface, `WidgetType` type, `registerWidget()`, `getWidgets()`, and `_resetForTesting()` using Svelte 5 `$state` rune
    - Implement colSpan clamping to [1,3] on registration
    - Export `filterWidgetsByStatus()` pure function for integration filtering
    - Export `stableSortByPriority()` pure function for priority ordering
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1_

  - [ ]* 1.2 Write property tests for widget registry (`frontend/src/lib/widgetRegistry.property.test.ts`)
    - **Property 1: Registration preserves widget definitions**
    - **Property 2: Column span clamping**
    - **Property 3: Integration filtering**
    - **Property 4: Stable priority ordering**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.2, 2.4, 3.2, 3.3**

- [x] 2. Implement WidgetFrame and ActionRow components
  - [x] 2.1 Create `frontend/src/components/WidgetFrame.svelte` with loading skeleton, error badge with retry, and content states
    - Accept `WidgetDefinition` and `nodeId` props
    - Map colSpan to responsive Tailwind classes (`col-span-1`, `sm:col-span-2 lg:col-span-2`, `sm:col-span-2 lg:col-span-3`)
    - Show animated skeleton placeholder during loading
    - Show error badge with integration name, error summary, and retry button on failure
    - Mount widget component with `onReady`/`onError` callbacks; use `{#key mountKey}` for retry remounting
    - _Requirements: 5.1, 5.3, 5.4, 6.1, 6.2, 6.4_

  - [x] 2.2 Create `frontend/src/components/ActionRow.svelte` with horizontal flex layout for action widgets
    - Render only when action widgets are present (no empty container)
    - Use `flex flex-wrap gap-2` layout
    - Render each action widget inside a WidgetFrame
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [ ]* 2.3 Write unit tests for WidgetFrame (`frontend/src/components/WidgetFrame.test.ts`)
    - **Property 5: Column span applied to frame element**
    - **Property 7: Error badge content**
    - Test loading skeleton display, error state with retry, and content transition
    - **Validates: Requirements 3.4, 5.4, 6.1, 6.2, 6.4**

- [x] 3. Implement WidgetGrid orchestrator component
  - [x] 3.1 Create `frontend/src/components/WidgetGrid.svelte` that fetches integration status, filters widgets, and renders grid
    - Fetch `/api/integrations/status` on mount
    - Filter widgets by enabled integrations (connected or degraded)
    - Separate action widgets from grid widgets
    - Sort both sets by priority (stable sort preserving registration order for ties)
    - Render ActionRow above a `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` container
    - Show inline error notification when integration status endpoint fails
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.2_

  - [ ]* 3.2 Write unit tests for WidgetGrid (`frontend/src/components/WidgetGrid.test.ts`)
    - **Property 6: Action row composition**
    - **Property 8: Error isolation**
    - Test integration status error displays notification
    - Test widgets with unknown integrations are excluded
    - **Validates: Requirements 2.2, 2.3, 2.4, 4.2, 6.3**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create widget registration modules for existing content
  - [x] 5.1 Create `frontend/src/lib/widgets/generalInfo.widget.ts` and `frontend/src/components/GeneralInfoWidget.svelte`
    - Extract "General Information" section from NodeDetailPage into standalone widget
    - Register as type `summary`, colSpan 2, priority 10, integration `bolt`
    - Component calls `onReady()` after data loads, `onError(err)` on failure
    - _Requirements: 8.1_

  - [x] 5.2 Create `frontend/src/lib/widgets/latestActions.widget.ts` and `frontend/src/components/LatestActionsWidget.svelte`
    - Extract execution history section from NodeDetailPage into standalone widget
    - Register as type `list`, colSpan 2, priority 20, integration `bolt`
    - _Requirements: 8.3_

  - [x] 5.3 Create `frontend/src/lib/widgets/puppetRuns.widget.ts` and `frontend/src/components/PuppetRunsWidget.svelte`
    - Extract latest puppet runs section from NodeDetailPage into standalone widget
    - Register as type `list`, colSpan 3, priority 100, integration `puppetdb`
    - _Requirements: 8.2_

- [x] 6. Create remaining widget registration modules
  - [x] 6.1 Create `frontend/src/lib/widgets/monitoringSummary.widget.ts` and `frontend/src/components/MonitoringSummaryWidget.svelte`
    - Extract Checkmk monitoring summary from NodeDetailPage into standalone widget
    - Register as type `summary`, colSpan 2, priority 100, integration `checkmk`
    - _Requirements: 8.4_

  - [x] 6.2 Create `frontend/src/lib/widgets/consoleAccess.widget.ts` and `frontend/src/components/ConsoleAccessWidget.svelte`
    - Extract console access button from NodeDetailPage into standalone widget
    - Register as type `action`, colSpan 1, priority 100, integration `proxmox`
    - _Requirements: 8.5_

  - [x] 6.3 Create barrel file `frontend/src/lib/widgets/index.ts` importing all widget registration modules
    - Import order: generalInfo, latestActions, puppetRuns, monitoringSummary, consoleAccess
    - _Requirements: 7.3_

- [x] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire WidgetGrid into NodeDetailPage and clean up
  - [x] 8.1 Import `frontend/src/lib/widgets/index.ts` barrel and replace the overview tab content in `NodeDetailPage.svelte` with `<WidgetGrid nodeId={nodeId} />`
    - Remove the hardcoded overview sections that are now handled by widgets
    - Preserve all other tabs (facts, actions, puppet, hiera, journal, manage, monitor) unchanged
    - _Requirements: 3.1, 4.1, 5.2_

  - [ ]* 8.2 Write integration test verifying WidgetGrid renders registered widgets with correct filtering (`frontend/src/components/WidgetGrid.integration.test.ts`)
    - Mock `/api/integrations/status` response
    - Register test widgets with various integration names
    - Verify only enabled-integration widgets render
    - Verify action widgets appear in ActionRow, grid widgets in the grid
    - **Validates: Requirements 2.2, 4.2, 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 9. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design specifies TypeScript with Svelte 5 runes — all new `.svelte.ts` files use `$state`
- The `filterWidgetsByStatus` and `stableSortByPriority` functions are extracted as pure functions for easy unit/property testing
- Widget components follow the contract: accept `nodeId`, `onReady`, `onError` props
- No backend changes required (Requirement 7)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2"] }
  ]
}
```
