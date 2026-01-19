# Bug: Stale Debug Info Persisting Across Navigation and Tab Switches

## Status
✅ **FIXED** - 2026-01-19

## Problem Description

When expert mode is enabled, debug information (`debugInfo`) was persisting across:
1. Page navigation (e.g., from Inventory → Home → Node Detail)
2. Tab switches within a page (e.g., switching tabs in NodeDetailPage or PuppetPage)
3. Data refreshes (e.g., clicking refresh or applying filters)

This caused:
- **Incorrect URLs** displayed in debug panel (showing previous request URL)
- **Stale error messages** from previous requests
- **Confusing debug data** that didn't match current page content
- **Poor user experience** when troubleshooting issues

## Root Cause

The `debugInfo` state variable was declared as `$state<DebugInfo | null>(null)` in each page component, but was **never explicitly cleared** when:
- Component mounted (page navigation)
- New data was fetched
- Tabs were switched

This meant old debug info would persist until a new request with `_debug` field replaced it.

## Impact

- Users saw misleading debug information
- Troubleshooting external API errors was confusing
- Expert mode appeared broken or unreliable
- Page content sometimes didn't update correctly after navigation

## Solution

Added `debugInfo = null` at strategic points:

### 1. In `onMount()` lifecycle hook
Clears debug info when navigating to a page:
```typescript
onMount(() => {
  debugInfo = null; // Clear debug info on mount
  // ... rest of initialization
});
```

### 2. At start of fetch functions
Clears debug info before making new API requests:
```typescript
async function fetchInventory(): Promise<void> {
  loading = true;
  error = null;
  debugInfo = null; // Clear previous debug info
  // ... rest of fetch logic
}
```

### 3. In tab switching functions
Clears debug info when switching tabs:
```typescript
function switchTab(tabId: TabId): void {
  activeTab = tabId;
  debugInfo = null; // Clear debug info when switching tabs
  // ... rest of tab switching logic
}
```

## Files Modified

1. `frontend/src/pages/InventoryPage.svelte`
   - Added `debugInfo = null` in `onMount()`
   - Added `debugInfo = null` in `fetchInventory()`

2. `frontend/src/pages/HomePage.svelte`
   - Added `debugInfo = null` in `onMount()`
   - Added `debugInfo = null` in `fetchInventory()`

3. `frontend/src/pages/NodeDetailPage.svelte`
   - Added `debugInfo = null` in `onMount()`
   - Added `debugInfo = null` in `fetchNode()`
   - Added `debugInfo = null` in `switchTab()`
   - Added `debugInfo = null` in `switchPuppetSubTab()`

4. `frontend/src/pages/PuppetPage.svelte`
   - Added `debugInfo = null` in `onMount()`
   - Added `debugInfo = null` in `fetchAllReports()`
   - Added `debugInfo = null` in `switchTab()`

5. `frontend/src/pages/ExecutionsPage.svelte`
   - Added `debugInfo = null` in `onMount()`
   - Added `debugInfo = null` in `fetchExecutions()`

6. `frontend/src/pages/IntegrationSetupPage.svelte`
   - Added `debugInfo = null` in `onMount()`

## Testing

To verify the fix:
1. Enable expert mode
2. Navigate to Inventory page and trigger an error
3. Navigate to Home page - debug info should be cleared
4. Navigate to Node Detail page and switch tabs - debug info should clear on each tab switch
5. Refresh browser on any page - debug info should be cleared

## Related Issues

- Part of v0.5.0 release (Phase 2: Expert Mode)
- Related to task 6.5 in implementation plan
- Complements the expert mode implementation across all routes

## Prevention

For future pages with expert mode:
- Always clear `debugInfo` in `onMount()`
- Always clear `debugInfo` at the start of fetch functions
- Always clear `debugInfo` in tab/view switching functions
- Consider creating a reusable hook or utility for this pattern
