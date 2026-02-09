# Plugin Context Fix for WidgetSlot

## Issue

Widgets rendered in WidgetSlot were throwing an error:

```
Error: Plugin context not found. Make sure the widget is rendered within a PluginContextProvider.
```

This occurred because widgets were being rendered directly without being wrapped in a `PluginContextProvider`, which is required for widgets to access the plugin SDK context (API client, router, toast, etc.).

## Root Cause

The `WidgetSlot` component was rendering widget components directly:

```svelte
<WidgetComponent {widget} />
```

However, widgets expect to be rendered within a `PluginContextProvider` that provides the plugin context via Svelte's context API.

## Solution

Wrapped all widget component renders in `PluginContextProvider`:

```svelte
<PluginContextProvider pluginName={widget.pluginName}>
  <WidgetComponent {widget} />
</PluginContextProvider>
```

This was applied to all three layout modes:

1. Grid layout
2. Stack layout  
3. Tabs layout

## Changes Made

**File**: `frontend/src/lib/plugins/WidgetSlot.svelte`

1. Added import for `PluginContextProvider`
2. Wrapped widget component rendering in all three layout modes with `PluginContextProvider`
3. Used `widget.pluginName` from the `LoadedWidget` interface to provide the correct plugin context

## Testing

- ✅ Build successful: `npm run build` completed without errors
- ✅ No TypeScript diagnostics errors
- ✅ All three layout modes updated (grid, stack, tabs)

## Impact

This fix ensures that:

- All widgets have access to the plugin SDK context
- Widgets can use `getPluginContext()` to access API client, router, toast, etc.
- Home page widgets (home-summary slot) work correctly
- Plugin home page widgets work correctly
- All widget slots across the application function properly

## Related Files

- `frontend/src/lib/plugins/PluginContextProvider.svelte` - Provides plugin context
- `frontend/src/lib/plugins/sdk/index.ts` - Plugin SDK context interface
- `frontend/src/lib/plugins/types.ts` - LoadedWidget interface with pluginName property
