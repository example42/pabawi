# Expert Mode Coverage Checklist for v0.5.0

## Overview

This document provides a comprehensive checklist for ensuring expert mode coverage across all frontend pages and backend routes in pabawi v0.5.0. Every section that interacts with the backend must have consistent expert mode views with proper logging.

## Design Principles

### On-Page Expert Mode View (Compact)

- Shows errors (red), warnings (yellow/orange), info (blue)
- Consistent color coding using integration colors where applicable
- "Show Details" button to open full popup
- Minimal, non-intrusive display

### Expert Mode Popup (Full)

- Complete debug information including debug-level logs
- Performance metrics (memory, CPU, cache stats, request stats)
- Contextual troubleshooting data:
  - Current URL and route
  - Browser information (user agent, viewport, language, platform)
  - Relevant cookies
  - Request headers
  - Timestamp and request ID
- Copy-to-clipboard button for entire context
- Formatted for easy sharing with support/AI

### Backend Requirements

- All endpoints use LoggerService for consistent logging
- All endpoints collect and attach debug info when expert mode enabled
- All endpoints include performance metrics in debug info
- All endpoints log at appropriate levels (error, warn, info, debug)

## Frontend Pages Coverage

### ✓ = Implemented | ○ = Not Yet Implemented

### HomePage (`frontend/src/pages/HomePage.svelte`)

- [ ] ○ Integration status section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Puppet reports summary section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Quick actions section (if backend calls)
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

### InventoryPage (`frontend/src/pages/InventoryPage.svelte`)

- [ ] ○ Inventory list section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Node filtering section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Bulk actions section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

### NodeDetailPage (`frontend/src/pages/NodeDetailPage.svelte`)

- [ ] ○ Node status tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Facts tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Hiera tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Catalog tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Reports tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Managed resources tab
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

### PuppetPage (`frontend/src/pages/PuppetPage.svelte`)

- [ ] ○ Reports list section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Report filtering section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Report details section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

### ExecutionsPage (`frontend/src/pages/ExecutionsPage.svelte`)

- [ ] ○ Executions list section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Execution details section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Re-execution section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

### IntegrationSetupPage (`frontend/src/pages/IntegrationSetupPage.svelte`)

- [ ] ○ Integration health checks section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context
- [ ] ○ Configuration validation section
  - [ ] ○ Compact debug panel
  - [ ] ○ Full popup with context

## Backend Routes Coverage

### ✓ = Implemented | ○ = Not Yet Implemented

### Integration Routes (`backend/src/routes/integrations.ts`)

- [ ] ○ GET /api/integrations/status
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/integrations/health
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/integrations/colors
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Inventory Routes (`backend/src/routes/inventory.ts`)

- [ ] ○ GET /api/inventory
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/inventory/:id
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ POST /api/inventory/bulk-action
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Puppet Routes (`backend/src/routes/puppet.ts`)

- [ ] ○ GET /api/puppet/reports
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/puppet/reports/:id
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/puppet/nodes/:id/reports
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/puppet/nodes/:id/catalog
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/puppet/nodes/:id/resources
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Facts Routes (`backend/src/routes/facts.ts`)

- [ ] ○ GET /api/facts/:nodeId
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/facts/:nodeId/:factName
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Hiera Routes (`backend/src/routes/hiera.ts`)

- [ ] ○ GET /api/hiera/:nodeId
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/hiera/:nodeId/:key
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Executions Routes (`backend/src/routes/executions.ts`)

- [ ] ○ GET /api/executions
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/executions/:id
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ POST /api/executions/:id/re-execute
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Tasks Routes (`backend/src/routes/tasks.ts`)

- [ ] ○ POST /api/tasks/execute
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/tasks/list
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Commands Routes (`backend/src/routes/commands.ts`)

- [ ] ○ POST /api/commands/execute
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Packages Routes (`backend/src/routes/packages.ts`)

- [ ] ○ POST /api/packages/install
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling
- [ ] ○ GET /api/packages/list
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

### Streaming Routes (`backend/src/routes/streaming.ts`)

- [ ] ○ GET /api/streaming/execution/:id
  - [ ] ○ LoggerService logging (error, warn, info, debug)
  - [ ] ○ Debug info with performance metrics
  - [ ] ○ Proper error handling

## Component Updates Required

### ExpertModeService Enhancements

- [ ] ○ Add performance metrics collection method
- [ ] ○ Add request context collection method
- [ ] ○ Update DebugInfo interface with warnings, info, debug arrays
- [ ] ○ Add performance and context fields to DebugInfo

### ExpertModeDebugPanel Component

- [ ] ○ Implement compact mode (on-page view)
- [ ] ○ Implement full mode (popup view)
- [ ] ○ Consistent color coding (errors=red, warnings=yellow, info=blue)
- [ ] ○ "Show Details" button in compact mode

### ExpertModeCopyButton Component

- [ ] ○ Add performance metrics option
- [ ] ○ Add browser information option
- [ ] ○ Add cookies and storage option
- [ ] ○ Format output for support/AI sharing

## Testing Requirements

### Property Tests

- [ ] ○ Property 7: Expert Mode Page Coverage
- [ ] ○ Property 8: Debug Info Color Consistency
- [ ] ○ Property 9: Backend Logging Completeness

### Unit Tests

- [ ] ○ ExpertModeService performance metrics collection
- [ ] ○ ExpertModeService context collection
- [ ] ○ ExpertModeDebugPanel compact vs full modes
- [ ] ○ ExpertModeDebugPanel color consistency
- [ ] ○ ExpertModeCopyButton with all options

## Progress Tracking

**Total Frontend Sections**: 21
**Completed**: 0
**Remaining**: 21

**Total Backend Routes**: 25+
**Completed**: 4 (partially - inventory, reports, nodes, health)
**Remaining**: 21+

**Component Updates**: 3
**Completed**: 0 (partial implementations exist)
**Remaining**: 3

**Property Tests**: 3
**Completed**: 0
**Remaining**: 3

**Unit Tests**: 5
**Completed**: 0
**Remaining**: 5

## Notes

- This checklist should be updated as work progresses
- Each checkbox represents a discrete piece of work
- Consistent look and feel is critical - use the same components everywhere
- Performance metrics should be collected from PerformanceMonitorService
- All contextual data should be collected consistently across all pages
