# SSH Plugin Capabilities Not Showing in Metadata Endpoint

## Issue

The `/api/v1/plugins` metadata endpoint shows SSH plugin with empty capabilities array, even though the plugin registers 6 capabilities.

## Root Cause

The SSH plugin provides standardized capabilities (`command.execute`, `inventory.list`, etc.) that are also provided by the Bolt plugin. The `getAllCapabilities()` method in CapabilityRegistry deduplicates capabilities by name, returning only the **primary provider** (first registered).

Since Bolt initializes before SSH, Bolt's capabilities are returned and SSH's are filtered out as duplicates.

## Current Behavior

```json
{
  "name": "ssh",
  "displayName": "ssh",
  "capabilities": []  // Empty because all capabilities are duplicates
}
```

## Expected Behavior (Options)

1. **Show all capabilities a plugin provides** (even if not primary provider)
2. **Show plugin-specific capabilities only** (e.g., `ssh.command.execute`)
3. **Add a flag indicating secondary provider status**

## Impact

- **Low**: The endpoint works correctly for menu building
- The menu will show SSH plugin but without capability badges
- Users can still navigate to SSH plugin page
- Capability routing works correctly (uses priority-based selection)

## Recommendation

This is working as designed for the progressive loading architecture. The metadata endpoint is meant to show **available capabilities**, not enumerate every provider.

If we need to show plugin-specific capabilities, we should:

1. Add a `providedCapabilities` field that shows all capabilities the plugin provides
2. Keep `capabilities` field for primary capabilities only
3. Update the design document to clarify this distinction

## Related Files

- `backend/src/routes/v1/plugins.ts` - Metadata endpoint
- `backend/src/integrations/CapabilityRegistry.ts` - Capability deduplication logic
- `plugins/native/ssh/plugin.json` - SSH plugin manifest

## Priority

Low - Does not block task 1.1 completion or progressive loading architecture
