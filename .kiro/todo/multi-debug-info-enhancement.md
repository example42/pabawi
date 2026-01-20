# Multi-Debug Info Enhancement

## Status: Completed

## Overview

Enhanced expert mode to display multiple debug info blocks when a page makes multiple API calls, instead of only showing the most recent one.

## Implementation Details

### Completed

- ✅ Added `LabeledDebugInfo` type to `frontend/src/lib/api.ts`
- ✅ Updated `PuppetPage.svelte` to collect multiple debug blocks
- ✅ Modified debug info callback to accept label parameter
- ✅ Updated all component calls in PuppetPage with appropriate labels:
  - Puppet Run History
  - Puppet Reports
  - Puppet Environments
  - Node Facts
  - Puppetserver Status
  - PuppetDB Statistics
  - Hiera Data
  - Code Analysis
- ✅ Updated ExpertModeDebugPanel rendering to show multiple blocks
- ✅ **Updated `HomePage.svelte` to collect multiple debug blocks**:
  - Inventory
  - Integration Status
  - Recent Executions
  - Puppet Reports Summary
  - Aggregated Run History
- ✅ **Updated `NodeDetailPage.svelte` to collect multiple debug blocks**:
  - Node Details
  - Execution History
  - Puppet Reports
  - Catalog
  - Catalog Resources
  - Events
  - Managed Resources
  - Node Status
  - Run History
  - PuppetDB Facts
- ✅ **Updated `InventoryPage.svelte` to collect multiple debug blocks**:
  - Inventory

## Benefits

- Complete visibility into all API calls on a page
- Better debugging experience
- Helps identify which specific call is slow or failing
- Each block is independently collapsible

## Technical Notes

- Uses array-based approach for simplicity
- Debug blocks are keyed by label for efficient updates
- Blocks are cleared when switching tabs/pages
- Backward compatible with existing single debug info pattern
