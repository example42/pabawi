# Plugin Interface Syntax Errors

## Issue

Four plugins (bolt, hiera, puppetdb, puppetserver) have TypeScript syntax errors that prevent them from loading. The `getSummary()` and `getData()` method implementations are incorrectly placed inside the `BasePluginInterface` interface definition instead of in the plugin class.

## Root Cause

In TypeScript, interfaces can only contain method signatures, not implementations. The `async` keyword and method bodies must be in the class that implements the interface, not in the interface itself.

## Affected Files

1. `plugins/native/bolt/backend/BoltPlugin.ts` - FIXED ✓
2. `plugins/native/hiera/backend/HieraPlugin.ts` - Lines 170-360
3. `plugins/native/puppetdb/backend/PuppetDBPlugin.ts` - Lines 203-317
4. `plugins/native/puppetserver/backend/PuppetserverPlugin.ts` - Lines 169-250

## Fix Required

For each file:

1. Remove the `async` keyword and method implementations from the `BasePluginInterface` interface
2. Keep only the method signatures in the interface:

   ```typescript
   getSummary(): Promise<{...}>;
   getData(): Promise<{...}>;
   ```

3. Ensure the implementations exist in the actual plugin class (e.g., `HieraPlugin`, `PuppetDBPlugin`, etc.)

## Impact

- Only ansible and ssh plugins are currently loading
- The `/api/plugins` endpoint only returns 2 plugins instead of 6
- Users cannot access puppetdb, puppetserver, hiera, or bolt functionality

## Status

- Bolt: Fixed ✓
- Hiera: Fixed ✓
- PuppetDB: Fixed ✓
- Puppetserver: Fixed ✓

## Resolution

All four plugins have been fixed by:

1. Removing `async` keyword and method implementations from `BasePluginInterface`
2. Keeping only method signatures in the interface
3. Adding actual implementations to the plugin classes

The plugins should now load correctly. PuppetDB has some unrelated import warnings that don't prevent loading.
