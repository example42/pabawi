# Inventory Multiple Source Tags Bug

## Issue Description

When a node exists in multiple inventory sources (e.g., both Bolt and PuppetDB), it should display tags for all sources where it appears. Currently, `puppet.office.lab42` only shows the "PuppetDB" tag but should also show the "Bolt" tag since it exists in both inventories.

## Expected Behavior

- Node `puppet.office.lab42` should show both "Bolt" and "PuppetDB" tags
- The frontend code is correctly implemented to display multiple source tags
- The backend `NodeLinkingService.linkNodes()` method should populate the `sources` array with all sources where the node appears

## Current Behavior

- `puppet.office.lab42` only shows "PuppetDB" tag
- Other nodes like `ben.office.lab42` and `gw.office.lab42` correctly show only "Bolt" tag
- `bestia.office.lab42` correctly shows only "PuppetDB" tag

## Root Cause Analysis

The issue is likely in one of these areas:

1. **Node Identifier Matching**: The `extractIdentifiers()` method may not be correctly matching nodes across sources
2. **Source Attribution**: Nodes from different sources may have different identifiers that prevent proper linking
3. **Data Flow**: The aggregated inventory may not be correctly preserving source information

## Investigation Steps

1. Check what identifiers are extracted for `puppet.office.lab42` from both Bolt and PuppetDB
2. Verify that both sources are returning this node in their inventory
3. Debug the node linking process to see why they're not being merged
4. Test the API endpoint `/api/inventory` to see the raw response

## Files Involved

- `backend/src/integrations/NodeLinkingService.ts` - Node linking logic
- `backend/src/integrations/IntegrationManager.ts` - Inventory aggregation
- `frontend/src/pages/InventoryPage.svelte` - Frontend display (correctly implemented)

## Priority

Medium - This affects the user experience and visibility of multi-source nodes, but doesn't break core functionality.
