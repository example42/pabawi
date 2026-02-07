# Implementation Plan: Generic Execution Framework

## Overview

**REVISED PLAN - Leveraging Existing Infrastructure**

This plan has been revised to leverage existing v1.0.0 plugin infrastructure and services:

- ✅ **Already Exists**: BasePlugin, CapabilityRegistry, IntegrationManager, ExecutionQueue, StreamingExecutionManager
- 🎯 **Focus**: Create standardized capability interfaces for plugin types (Inventory, Facts, Reports, Events, Remote Execution)
- 🚀 **Priority**: Get Bolt plugin working end-to-end as proof of concept

The framework will provide **shared capability interfaces** that plugins implement, not a separate execution service layer.

## Tasks

### Phase 1: Define Standardized Capability Interfaces (Foundation)

**Goal:** Create TypeScript interfaces for the 5 plugin capability types that all execution plugins will implement

- [x] 1. Create standardized capability type interfaces
  - Create `backend/src/integrations/capability-types/` directory
  - Define `InventoryCapability` interface in `inventory.ts`
  - Define `FactsCapability` interface in `facts.ts`
  - Define `RemoteExecutionCapability` interface in `remote-execution.ts`
  - Define `ReportsCapability` interface in `reports.ts`
  - Define `EventsCapability` interface in `events.ts`
  - Export all interfaces from `index.ts`
  - _Requirements: 1.1, 3.1, 4.1, 5.1_

- [x] 1.1 Define Inventory capability interface
  - `inventory.list` - List all nodes from this source
  - `inventory.get` - Get specific node details
  - `inventory.groups` - List available groups
  - `inventory.filter` - Filter nodes by criteria
  - Include Zod schemas for validation
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 1.2 Define Facts capability interface
  - `info.facts` - Get facts for a node
  - `info.refresh` - Force refresh facts (bypass cache)
  - Include fact provider priority system
  - Include Zod schemas for validation
  - _Requirements: 4.1, 4.5, 4.8_

- [x] 1.3 Define Remote Execution capability interface
  - `command.execute` - Execute shell command on targets
  - `task.execute` - Execute task/playbook on targets
  - `script.execute` - Execute script on targets
  - Support for streaming output (integrate with StreamingExecutionManager)
  - Support for async execution (integrate with ExecutionQueue)
  - Include Zod schemas for validation
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.4 Define Reports capability interface
  - `reports.list` - List available reports
  - `reports.get` - Get specific report
  - `reports.query` - Query reports with filters
  - Include Zod schemas for validation
  - _Requirements: 5.1, 5.5, 5.8_

- [x] 1.5 Define Events capability interface
  - `events.list` - List events for a node
  - `events.stream` - Stream live events
  - `events.query` - Query events with filters
  - Include Zod schemas for validation
  - _Requirements: 5.1, 5.4, 11.1_

- [x] 1.6 Define Provisioning capability interface (future)
  - `provision.create` - Provision new infrastructure/nodes
  - `provision.status` - Get provisioning status
  - `provision.list` - List provisioned resources
  - `decommission.execute` - Decommission infrastructure/nodes
  - `decommission.status` - Get decommissioning status
  - Include Zod schemas for validation
  - _Requirements: 11.4_

- [x] 1.7 Define Software Installation capability interface (future)
  - `package.install` - Install software packages
  - `package.uninstall` - Uninstall software packages
  - `package.update` - Update software packages
  - `package.list` - List installed packages
  - `package.search` - Search available packages
  - Include Zod schemas for validation
  - _Requirements: 11.3_

- [x] 1.8 Define Deployment capability interface (future)
  - `deploy.execute` - Deploy application/service
  - `deploy.status` - Get deployment status
  - `deploy.rollback` - Rollback deployment
  - `deploy.history` - Get deployment history
  - Include Zod schemas for validation
  - _Requirements: 2.1_

- [x] 1.9 Define Alert capability interface (future)
  - `alert.list` - List alerts for nodes/services
  - `alert.get` - Get specific alert details
  - `alert.acknowledge` - Acknowledge an alert
  - `alert.resolve` - Resolve an alert
  - `alert.subscribe` - Subscribe to alert notifications
  - Include Zod schemas for validation
  - _Requirements: 5.1_

### Phase 2: Implement Bolt Plugin (Proof of Concept)

**Goal:** Get Bolt plugin working end-to-end using the standardized interfaces

- [x] 2. Create Bolt plugin structure
  - Create `plugins/native/bolt/backend/` directory
  - Create `plugins/native/bolt/frontend/` directory
  - Create `plugins/native/bolt/plugin.json` manifest
  - _Requirements: 6.1, 6.2_

- [x] 2.1 Implement BoltPlugin class
  - Extend BasePlugin
  - Define metadata (name, version, integrationType: RemoteExecution)
  - Implement `performInitialization()` - validate Bolt installation
  - Implement `performHealthCheck()` - check Bolt connectivity
  - _Requirements: 6.1, 6.7, 10.4_

- [x] 2.2 Implement Bolt inventory capabilities
  - Implement `inventory.list` capability
  - Use Bolt inventory command to list nodes
  - Map Bolt inventory format to standard Node interface
  - Register capability with CapabilityRegistry
  - _Requirements: 3.1, 3.10_

- [x] 2.3 Implement Bolt facts capabilities
  - Implement `info.facts` capability
  - Use Bolt facts command to collect node facts
  - Map Bolt facts format to standard Facts interface
  - Register capability with CapabilityRegistry
  - _Requirements: 4.1_

- [x] 2.4 Implement Bolt command execution capability
  - Implement `command.execute` capability
  - Integrate with ExecutionQueue for concurrency control
  - Integrate with StreamingExecutionManager for output streaming
  - Support synchronous and asynchronous execution
  - Capture stdout, stderr, exit codes per node
  - Support timeout and environment variables
  - Register capability with CapabilityRegistry
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 10.1_

- [x] 2.5 Implement Bolt task execution capability
  - Implement `task.execute` capability
  - Use Bolt task run command
  - Support task parameters
  - Integrate with ExecutionQueue and StreamingExecutionManager
  - Register capability with CapabilityRegistry
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.6 Create Bolt plugin manifest
  - Define plugin.json with metadata
  - List all capabilities
  - Define default permissions
  - Specify frontend entry point (if widgets exist)
  - _Requirements: 6.2, 6.3_

- [x] 2.7 Test Bolt plugin end-to-end
  - Load plugin via PluginLoader
  - Verify capabilities registered
  - Test inventory.list via API
  - Test info.facts via API
  - Test command.execute via API
  - Test task.execute via API
  - Verify ExecutionQueue integration
  - Verify StreamingExecutionManager integration
  - _Requirements: All Phase 2_

### Phase 3: Add Shared Helper Services (Optional Enhancements)

**Goal:** Create optional helper services that plugins can use for common patterns

- [x] 3. Create InventoryCache helper service
  - Implement in-memory cache with TTL
  - Support cache invalidation
  - Support refresh on expiry
  - Plugins can opt-in to use this for caching
  - _Requirements: 3.5, 3.6_

- [x] 3.1 Create FactsCache helper service
  - Implement in-memory cache with configurable TTL
  - Support force refresh
  - Support per-node caching
  - Plugins can opt-in to use this for caching
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 3.2 Create ExecutionLogger helper service
  - Structured logging for executions
  - Integration with existing LoggerService
  - Execution history storage
  - Performance metrics collection
  - Plugins can opt-in to use this for logging
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

- [x] 3.3 Create ErrorHandler helper service
  - Error categorization (ValidationError, TimeoutError, etc.)
  - Structured error responses
  - Retry logic with backoff strategies
  - Plugins can opt-in to use this for error handling
  - _Requirements: 1.8, 7.3, 7.4, 7.5, 7.6_

### Phase 4: Implement Additional Plugins

**Goal:** Implement PuppetDB, Puppetserver, and other plugins using the standardized interfaces

- [x] 4. Implement PuppetDB plugin
  - Create plugin structure
  - Implement inventory capabilities (nodes from PuppetDB)
  - Implement facts capabilities (facts from PuppetDB)
  - Implement reports capabilities (reports from PuppetDB)
  - Implement events capabilities (events from PuppetDB)
  - Register all capabilities
  - _Requirements: 3.1, 4.1, 5.1_

- [x] 4.1 Implement Puppetserver plugin
  - Create plugin structure
  - Implement catalog capabilities
  - Implement environment capabilities
  - Implement status capabilities
  - Register all capabilities
  - _Requirements: 5.1_

- [x] 4.2 Implement SSH plugin (future)
  - Create plugin structure
  - Implement remote execution capabilities
  - Implement inventory capabilities (from SSH config)
  - Register all capabilities
  - _Requirements: 1.1, 3.1_

- [x] 4.3 Implement Ansible plugin (future)
  - Create plugin structure
  - Implement playbook execution capabilities
  - Implement inventory capabilities (from Ansible inventory)
  - Register all capabilities
  - _Requirements: 1.1, 2.1, 3.1_

- [ ] 4.4 Implement Terraform plugin (future)
  - Create plugin structure
  - Implement provisioning capabilities (provision.create, decommission.execute)
  - Implement deployment capabilities (deploy.execute, deploy.status)
  - Implement inventory capabilities (list provisioned resources)
  - Register all capabilities
  - _Requirements: 11.4_

- [ ] 4.5 Implement Package Manager plugins (future)
  - Create plugin structure for apt/yum/dnf/chocolatey
  - Implement software installation capabilities (package.install, package.uninstall, package.update)
  - Implement package listing capabilities (package.list, package.search)
  - Register all capabilities
  - _Requirements: 11.3_

- [ ] 4.6 Implement Monitoring plugins (future)
  - Create plugin structure for Prometheus/Grafana/Nagios/Datadog
  - Implement alert capabilities (alert.list, alert.get, alert.acknowledge)
  - Implement events capabilities (events.stream for monitoring events)
  - Register all capabilities
  - _Requirements: 5.1_

- [ ] 4.7 Implement CI/CD plugins (future)
  - Create plugin structure for Jenkins/GitLab CI/GitHub Actions
  - Implement deployment capabilities (deploy.execute, deploy.rollback, deploy.history)
  - Implement events capabilities (deployment events)
  - Register all capabilities
  - _Requirements: 2.1_

### Phase 5: Node Journal Integration (Future)

**Goal:** Integrate with Node Journal when implemented

- [x] 5. Implement Node Journal integration
  - Create JournalEntry interface
  - Implement journal writing for executions
  - Implement journal writing for package installations
  - Implement journal writing for provisioning
  - Link journal entries to execution records
  - Support manual journal entries
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.10, 11.11_

### Phase 6: Frontend Widgets (Future)

**Goal:** Create frontend widgets for each plugin

- [x] 6. Create Bolt frontend widgets
  - Create CommandExecutor widget for dashboard
  - Create InventoryViewer widget for inventory panel
  - Create TaskRunner widget for dashboard
  - Register widgets in plugin.json
  - _Requirements: 6.1_

- [x] 6.1 Create PuppetDB frontend widgets
  - Create ReportsViewer widget
  - Create EventsViewer widget
  - Create FactsViewer widget
  - Register widgets in plugin.json
  - _Requirements: 6.1_

### Phase 7: Plugin Finalization (Bolt & PuppetDB Standards)

**Goal:** Finalize Bolt and PuppetDB plugins to set the standard for all future plugins

- [x] 7. Enhance Bolt plugin home page
  - Create PluginHomePage.svelte with tabbed interface
  - Add "Inventory" tab showing all nodes (global view)
  - Add "Tasks" tab showing available tasks (global view)
  - Add "Executions" tab showing execution history (global view)
  - Add "Packages" tab for package management (global view)
  - Register home page route in plugin.json
  - _Requirements: 6.1_

- [x] 7.1 Enhance Bolt node detail tabs
  - Create NodeDetailTabs.svelte component
  - Add "Execute Command" tab (node-specific)
  - Add "Run Task" tab (node-specific)
  - Add "Manage Packages" tab (node-specific)
  - Add "Facts" tab (node-specific)
  - Register node tabs in plugin.json
  - _Requirements: 6.1_

- [x] 7.2 Add Bolt package management capability
  - Implement `package.install` capability
  - Implement `package.uninstall` capability
  - Implement `package.update` capability
  - Implement `package.list` capability
  - Create PackageManager.svelte widget
  - Register capabilities with CapabilityRegistry
  - _Requirements: 11.3_

- [x] 7.3 Add Bolt journal integration
  - Integrate with Node Journal service (when available)
  - Log command executions to journal
  - Log task executions to journal
  - Log package installations to journal
  - Include execution ID, user, timestamp, status
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 7.4 Enhance PuppetDB plugin home page
  - Create PluginHomePage.svelte with tabbed interface
  - Add "Nodes" tab showing all nodes (global view)
  - Add "Reports" tab showing recent reports (global view)
  - Add "Events" tab showing recent events (global view)
  - Add "Resources" tab showing resource types (global view)
  - Add "Query" tab for PQL queries (global view)
  - Register home page route in plugin.json
  - _Requirements: 6.1_

- [x] 7.5 Enhance PuppetDB node detail tabs
  - Create NodeDetailTabs.svelte component
  - Add "Facts" tab (node-specific)
  - Add "Reports" tab (node-specific)
  - Add "Events" tab (node-specific)
  - Add "Catalog" tab (node-specific)
  - Add "Resources" tab showing node resources (node-specific)
  - Register node tabs in plugin.json
  - _Requirements: 6.1_

- [x] 7.6 Add PuppetDB resource types capability
  - Implement `resources.types` capability to list all resource types
  - Implement `resources.list` capability to list resources by type
  - Implement `resources.get` capability to get specific resource details
  - Create ResourceTypesViewer.svelte widget
  - Register capabilities with CapabilityRegistry
  - _Requirements: 5.1_

- [x] 7.7 Enhance home page summary tiles
  - Update Bolt HomeWidget to show color-coded health status
  - Update PuppetDB HomeWidget to show color-coded health status
  - Add metrics: node count, execution count, success rate
  - Add quick action buttons
  - Link to plugin home pages
  - _Requirements: 6.1_

### Phase 8: CLI Generation (Future)

**Goal:** Auto-generate CLI commands from capability schemas

- [ ] 8. Implement CLI generator
  - Create CLIGenerator class
  - Generate commands from capability schemas
  - Generate help documentation
  - Validate arguments against schemas
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

## Notes

**Key Changes from Original Plan:**

1. **Leverages Existing Infrastructure**: Uses BasePlugin, CapabilityRegistry, IntegrationManager, ExecutionQueue, StreamingExecutionManager
2. **No Separate Framework Layer**: Plugins implement standardized capability interfaces directly
3. **Self-Composing Plugin Types**: 5 capability types (Inventory, Facts, Remote Execution, Reports, Events)
4. **Bolt First**: Get Bolt working end-to-end as proof of concept before other plugins
5. **Helper Services Optional**: Caching, logging, error handling are optional helpers, not required framework components
6. **Incremental Adoption**: Existing v1.0.0 infrastructure already supports this approach

**What Already Exists:**

- ✅ BasePlugin abstract class with lifecycle methods
- ✅ CapabilityRegistry for capability-based routing
- ✅ IntegrationManager for plugin management
- ✅ ExecutionQueue for concurrency control
- ✅ StreamingExecutionManager for output streaming
- ✅ LoggerService for structured logging
- ✅ PerformanceMonitorService for metrics
- ✅ Plugin discovery via PluginLoader
- ✅ RBAC integration in CapabilityRegistry

**What Needs to be Built:**

- 🔨 Standardized capability type interfaces (Phase 1):
  - Core: Inventory, Facts, Remote Execution, Reports, Events
  - Future: Provisioning/Decommissioning, Software Installation, Deployment, Alerts
- 🔨 Bolt plugin implementation (Phase 2)
- 🔨 Optional helper services (Phase 3)
- 🔨 Additional plugins (Phase 4+)

**Priority Order:**

1. **Phase 1** - Define capability interfaces (1-2 days)
2. **Phase 2** - Implement Bolt plugin (3-5 days)
3. **Phase 3** - Optional helpers as needed
4. **Phase 4+** - Additional plugins incrementally
