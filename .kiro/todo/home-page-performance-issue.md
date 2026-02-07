# Home Page Performance Issue

## Symptoms

- Home page loads and shows plugin list
- Browser tab becomes sluggish with spiraling CPU and memory usage
- Occurs after fixing plugin loading (all 6 plugins now load)

## Potential Causes

### 1. Widget Loading Loop

The WidgetSlot component has an `$effect` that loads widget components:

```typescript
$effect(() => {
  for (const widget of widgets) {
    loadWidgetComponent(widget);
  }
});
```

This could trigger repeatedly if `widgets` keeps changing.

### 2. Multiple Widget Slots

HomePage has 3 WidgetSlot components:

- home-summary (3 columns)
- dashboard (2 columns)  
- sidebar (stack)

Each slot queries the registry and loads widgets independently.

### 3. Simultaneous API Calls

With 6 plugins now loading, each HomeWidget makes an API call to `/api/plugins/:name/summary` on mount. This could be:

- 6 simultaneous API calls
- Each call potentially triggering backend work
- No rate limiting or batching

### 4. Registry Events

The WidgetSlot subscribes to registry events and increments `registryVersion` on every event, which triggers `$derived` recalculation.

## Investigation Steps

1. Check browser console for:
   - Repeated API calls
   - Error messages
   - Widget loading logs

2. Check backend logs for:
   - API call volume
   - Slow endpoints
   - Error patterns

3. Check if widgets are re-mounting repeatedly

4. Profile the page to identify the bottleneck

## Potential Fixes

### Quick Fix: Disable Some Widgets

Temporarily disable some home-summary widgets to confirm the issue.

### Proper Fix: Batch API Calls

Create a single endpoint that returns all plugin summaries:

- `/api/v1/plugins/summaries` returns all summaries in one call
- Widgets read from shared state instead of individual API calls

### Alternative Fix: Debounce Registry Events

Add debouncing to registry event handling to prevent excessive re-renders.

### Alternative Fix: Memoize Widget Loading

Ensure `loadWidgetComponent` truly skips already-loaded widgets.

## Status

- Issue identified: 2024-02-07
- Investigation: In progress
- Fix: Pending
