# Home Page Performance Issue - Current Status Analysis

## Date: 2026-02-07

## Summary

The home page performance issue (sluggish browser, spiraling CPU/memory usage) has been addressed through the comprehensive spec `.kiro/specs/home-page-loading-fixes`. Most implementation tasks are complete, but the issue may still persist.

## Spec Status

**Spec Location**: `.kiro/specs/home-page-loading-fixes/`

**Implementation Progress**: ~90% complete

- ✅ Backend metadata and summary endpoints (Task 1)
- ✅ InitializationCoordinator removed (Task 2)
- ✅ MenuBuilder updated for metadata-only (Task 3)
- ✅ DynamicNavigation immediate rendering (Task 4)
- ✅ HomePage progressive tile loading (Task 5)
- ✅ Home summary widgets created (Task 7)
- ✅ Plugin home pages created (Task 8)
- ✅ Error handling implemented (Task 10)
- ✅ Loading states added (Task 11)
- ✅ Performance optimizations (Task 12)
- ✅ Code cleanup (Task 13)

**Optional Tasks Remaining** (marked with `*` in tasks.md):

- Unit tests for endpoints (1.6)
- Performance tests (2.4, 4.4, 5.4, 8.4, 11.5, 12.5)
- Widget tests (7.8)
- Property-based test for error isolation (10.5)

## Recent Fix Attempt

**File**: `frontend/src/lib/plugins/WidgetSlot.svelte`
**Change**: Modified `$effect` to check if widgets are already loaded/loading before attempting to load them
**Status**: Implemented but not yet verified by user

## Potential Remaining Issues

### 1. WidgetSlot $effect Loop

The `$effect` in WidgetSlot may still trigger repeatedly if:

- The `widgets` derived value changes frequently
- Registry events increment `registryVersion` too often
- Widget loading state changes trigger re-renders

**Current mitigation**:

```typescript
$effect(() => {
  const currentWidgets = widgets;
  for (const widget of currentWidgets) {
    const existing = widgetStates.get(widget.id);
    if (!existing?.component && !existing?.loading) {
      loadWidgetComponent(widget);
    }
  }
});
```

### 2. Registry Event Frequency

The WidgetSlot subscribes to registry events and increments `registryVersion` on every event:

```typescript
if (
  event.type === "widget:registered" ||
  event.type === "widget:unregistered" ||
  event.type === "widget:updated" ||
  event.type === "registry:refreshed" ||
  event.type === "registry:cleared"
) {
  registryVersion++;
}
```

**Potential issue**: If plugins are registering widgets repeatedly, this could cause excessive re-renders.

### 3. Multiple Widget Slots

HomePage has 3 WidgetSlot components:

- `home-summary` (3 columns)
- `dashboard` (2 columns)
- `sidebar` (stack)

Each slot queries the registry independently, which could amplify any registry event issues.

### 4. Simultaneous API Calls

With 6 plugins now loading successfully, each HomeWidget makes an API call on mount:

- `/api/v1/plugins/puppetdb/summary`
- `/api/v1/plugins/puppetserver/summary`
- `/api/v1/plugins/hiera/summary`
- `/api/v1/plugins/bolt/summary`
- `/api/v1/plugins/ansible/summary`
- `/api/v1/plugins/ssh/summary`

**Current behavior**: All 6 calls happen in parallel when widgets mount.

## Recommended Next Steps

### Immediate Actions (User Testing Required)

1. **Test Current Fix**
   - User should test the home page with the current WidgetSlot fix
   - Check browser console for repeated API calls or errors
   - Check browser DevTools Performance tab for bottlenecks
   - Monitor backend logs for API call volume

2. **Gather Diagnostic Data**
   - Enable debug mode in WidgetSlot: `debug={true}`
   - Check console logs for widget loading patterns
   - Look for repeated "Starting load for widget" messages
   - Check if registry events are firing excessively

### Potential Fixes (If Issue Persists)

#### Option A: Debounce Registry Events

Add debouncing to registry event handling to prevent excessive re-renders:

```typescript
let registryUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

onMount(() => {
  const unsubscribe = registry.subscribe((event) => {
    if (
      event.type === "widget:registered" ||
      event.type === "widget:unregistered" ||
      event.type === "widget:updated" ||
      event.type === "registry:refreshed" ||
      event.type === "registry:cleared"
    ) {
      // Debounce registry updates
      if (registryUpdateTimeout) {
        clearTimeout(registryUpdateTimeout);
      }
      registryUpdateTimeout = setTimeout(() => {
        registryVersion++;
      }, 100); // 100ms debounce
    }
  });

  return () => {
    if (registryUpdateTimeout) {
      clearTimeout(registryUpdateTimeout);
    }
    unsubscribe();
  };
});
```

#### Option B: Batch API Calls

Create a single endpoint that returns all plugin summaries:

**Backend**: `GET /api/v1/plugins/summaries`

```typescript
{
  "summaries": {
    "puppetdb": { /* summary data */ },
    "bolt": { /* summary data */ },
    "ansible": { /* summary data */ },
    // ...
  }
}
```

**Frontend**: Widgets read from shared state instead of individual API calls.

#### Option C: Use $effect.root() for Widget Loading

Prevent the $effect from re-running when widget states change:

```typescript
$effect.root(() => {
  const currentWidgets = widgets;
  for (const widget of currentWidgets) {
    const existing = widgetStates.get(widget.id);
    if (!existing?.component && !existing?.loading) {
      loadWidgetComponent(widget);
    }
  }
});
```

#### Option D: Memoize Widget Query

Cache the widget query result to prevent excessive registry queries:

```typescript
let cachedWidgets = $state<LoadedWidget[]>([]);
let lastRegistryVersion = $state(0);

let widgets = $derived.by(() => {
  void registryVersion; // Establish dependency
  
  // Only re-query if registry version changed
  if (registryVersion !== lastRegistryVersion) {
    cachedWidgets = registry.getWidgetsForSlot(slot, userCapabilities);
    lastRegistryVersion = registryVersion;
  }
  
  return cachedWidgets;
});
```

## Spec Update Recommendations

### If Issue Persists

1. **Add New Task**: "14.1 Investigate and fix WidgetSlot performance issue"
   - Diagnose root cause (registry events, $effect loop, API calls)
   - Implement appropriate fix (debouncing, batching, memoization)
   - Test with all 6 plugins loading
   - Verify browser remains responsive

2. **Update Design Document**: Add section on "Widget Loading Performance"
   - Document the registry event subscription pattern
   - Explain debouncing strategy
   - Document API call batching approach

3. **Add Property Test**: "Property 11: Widget Loading Efficiency"
   - *For any* widget slot with N widgets, widget loading should trigger at most N API calls
   - *For any* registry event, widget re-renders should be debounced to prevent excessive updates

### If Issue Resolved

1. **Mark Spec as Complete**: Update tasks.md to mark all required tasks as complete
2. **Document Solution**: Add notes to design.md about the WidgetSlot fix
3. **Close Diagnostic Documents**: Move `.kiro/todo/home-page-performance-issue.md` to `.kiro/done/`

## Files to Monitor

- `frontend/src/lib/plugins/WidgetSlot.svelte` - Widget loading logic
- `frontend/src/lib/plugins/WidgetRegistry.svelte.ts` - Registry event system
- `frontend/src/pages/HomePage.svelte` - Multiple widget slots
- `plugins/native/*/frontend/HomeWidget.svelte` - Individual widget implementations

## Success Criteria

The issue is resolved when:

- ✅ Home page loads within 2 seconds
- ✅ Browser remains responsive (no sluggishness)
- ✅ CPU usage stays normal (< 30%)
- ✅ Memory usage stays stable (no spiraling)
- ✅ No repeated API calls in console
- ✅ No excessive registry events
- ✅ All 6 plugin widgets load successfully

## Conclusion

The comprehensive spec has addressed most of the architectural issues. The remaining performance problem is likely related to:

1. Widget loading $effect triggering repeatedly
2. Registry events causing excessive re-renders
3. Lack of debouncing/batching

**Next Action**: User should test the current fix and provide feedback. If issue persists, implement one of the recommended fixes (debouncing is the quickest win).
