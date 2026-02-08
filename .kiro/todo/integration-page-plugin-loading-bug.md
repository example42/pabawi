# Bug Report: Integration Pages Show "No plugin found with name: undefined"

## Issue Summary

When clicking links to integration pages (e.g., `/integrations/puppetdb`), the page fails to load with error:

```
Failed to load plugin info: No plugin found with name: undefined
```

The menu loads fine, but individual integration pages fail because the plugin name is undefined.

## Root Cause Analysis

**Location:** `frontend/src/pages/IntegrationHomePage.svelte` (line 57)

The component tries to read the plugin name from `router.params`:

```typescript
const pluginName = $derived(router.params.integrationName as string);
```

**Problem:** `router.params` is NOT being updated when routes change. The Router component passes params as a component prop, but IntegrationHomePage ignores this and tries to read from the global router state instead.

### How the Router Works

1. **Router.svelte** (component) receives routes and matches them
2. It extracts params from the matched route
3. It passes params as a **component prop**: `<Component {params} />`
4. **BUT** it does NOT update `router.params` state

### How Other Pages Handle This Correctly

**NodeDetailPage.svelte** (line 94):

```typescript
let { params }: Props = $props();
const nodeId = $derived(params?.id || '');
```

**IntegrationSetupPage.svelte** (line 14):

```typescript
let { params }: Props = $props();
const integration = $derived(params?.integration || '');
```

Both correctly receive params as a component prop.

### Why IntegrationHomePage Fails

IntegrationHomePage tries to read from `router.params.integrationName` which is:

- Never initialized (defaults to `{}`)
- Never updated when routes change
- Results in `undefined` plugin name
- API call fails: `/api/v1/plugins/undefined`
- Backend returns 404: "No plugin found with name: undefined"

## Solution

Update IntegrationHomePage to receive params as a component prop, matching the pattern used by other pages.

### Changes Required

**File:** `frontend/src/pages/IntegrationHomePage.svelte`

1. Add Props interface (after imports):

```typescript
interface Props {
  params?: { integrationName: string };
}
```

1. Receive params as prop (after other state declarations):

```typescript
let { params }: Props = $props();
```

1. Update pluginName derivation (line 57):

```typescript
// OLD:
const pluginName = $derived(router.params.integrationName as string);

// NEW:
const pluginName = $derived(params?.integrationName || '');
```

1. Remove unused `router` import if no longer needed

## Testing

After fix, verify:

1. Click menu link to integration page (e.g., `/integrations/puppetdb`)
2. Plugin name should be correctly extracted
3. API call should succeed: `/api/v1/plugins/puppetdb`
4. Plugin info should load without errors
5. Test all integration pages: puppetdb, puppetserver, hiera, bolt, ansible, ssh

## Files Affected

- `frontend/src/pages/IntegrationHomePage.svelte` - Main fix

## Related Files (for reference)

- `frontend/src/components/Router.svelte` - How params are passed
- `frontend/src/pages/NodeDetailPage.svelte` - Correct pattern
- `frontend/src/pages/IntegrationSetupPage.svelte` - Correct pattern
- `frontend/src/lib/router.svelte.ts` - Router implementation

## Priority

**HIGH** - Blocks all integration page navigation

## Status

Ready to fix
