# Requirements Document

## Introduction

This document defines the requirements for the Pabawi v1.0.0 release, implementing a comprehensive modular plugin architecture. The release includes a pluggable system with RBAC controls, CLI and web widgets, automatic plugin loading, dynamic UI generation, a new Events integration type, and a Node Journal feature for tracking all activities on nodes.

The 4 native integrations (Bolt, PuppetDB, Puppetserver, Hiera) will be restructured as reference implementations following the same standards as external plugins. All legacy 0.5.x code will be removed, with working functionality recreated using the new architecture.

## Glossary

- **Plugin**: A modular integration component implementing `BasePluginInterface` that provides capabilities, widgets, and CLI commands
- **Capability**: A discrete unit of functionality provided by a plugin (e.g., `bolt.command.execute`, `puppetdb.facts`)
- **CapabilityRegistry**: Central registry that manages capability registration, routing, and execution with RBAC support
- **Widget**: A frontend Svelte component provided by a plugin that renders in designated UI slots
- **WidgetSlot**: A designated location in the UI where widgets can be rendered (e.g., `dashboard`, `node-detail`, `sidebar`, `home-summary`)
- **HomeWidget**: A special color-coded summary widget displayed on the main dashboard for each integration
- **IntegrationHomePage**: An automatically generated page with tabs for each capability category provided by an integration
- **NodeWidget**: A widget that displays node-specific information from an integration
- **NodeJournal**: A shared chronological log of all events, actions, and changes that occurred on a specific node
- **JournalEntry**: A single record in the Node Journal representing an event, action, or change
- **Event**: Something that happened on a system from a plugin's perspective (e.g., monitor alert, Puppet run change)
- **NativePlugin**: A plugin shipped with Pabawi that serves as a reference implementation for external plugins
- **ExternalPlugin**: A third-party plugin that follows the same standards as native plugins
- **InventorySource**: A plugin capability that provides node/system inventory data
- **RemoteExecution**: A plugin capability that executes commands, tasks, or playbooks on remote systems

## Requirements

### Requirement 1: Plugin System Architecture

**User Story:** As a developer, I want a standardized plugin system where native and external plugins follow the same structure, so that native plugins serve as reference implementations for external plugin development.

#### Acceptance Criteria

1. THE System SHALL define a standard plugin directory structure that both native and external plugins follow
2. WHEN a plugin is loaded, THE PluginLoader SHALL discover it based on a manifest file (`plugin.json` or `package.json`)
3. THE plugin directory structure SHALL include: `src/`, `widgets/`, `cli/`, `config/`, and `README.md`
4. THE native plugins (Bolt, PuppetDB, Puppetserver, Hiera) SHALL be moved to `backend/src/plugins/native/` directory
5. THE external plugins SHALL be loaded from `backend/src/plugins/external/` directory
6. WHEN a plugin registers capabilities, THE CapabilityRegistry SHALL validate RBAC permissions before execution
7. THE System SHALL auto-load plugins based on their declared capabilities and enabled status in configuration
8. THE plugin manifest SHALL declare: name, version, capabilities, widgets, CLI commands, and dependencies

### Requirement 2: Integration Types Standardization

**User Story:** As a developer, I want standardized integration types with common interfaces, so that different tools can be integrated consistently.

#### Acceptance Criteria

1. THE System SHALL define the following standard integration types: `Inventory`, `RemoteExecution`, `Info`, `ConfigurationManagement`, `Events`, `Monitoring`, `Provisioning`, `Deployment`
2. THE `Inventory` type SHALL consolidate node data from multiple plugins (PuppetDB, Bolt, future: Ansible, Terraform, AWS EC2, monitoring tools)
3. WHEN multiple plugins provide inventory for the same system, THE System SHALL aggregate the data into a unified node record
4. THE `RemoteExecution` type SHALL provide a standard interface for commands, Bolt tasks, Ansible playbooks, and similar actions
5. THE `Events` type SHALL capture things that happened on a system (monitor alerts, Puppet run changes, deployments)
6. THE `Info` type SHALL provide read-only data retrieval capabilities (facts, reports, catalogs)
7. WHEN a plugin provides inventory data, THE System SHALL attempt to correlate nodes across plugins using hostname, IP, or certname
8. THE System SHALL define standard capability schemas for each integration type to ensure consistency

### Requirement 3: Node Journal Feature

**User Story:** As a user, I want a shared journal for each node that logs all events, actions, and changes from all integrations, so that I can see a complete history of what happened on that node.

#### Acceptance Criteria

1. THE System SHALL maintain a NodeJournal for each node that aggregates entries from all plugins
2. THE NodeJournal SHALL store entries with: timestamp, source plugin, entry type, title, description, metadata, and user (if applicable)
3. THE NodeJournal entry types SHALL include: `event`, `action`, `provisioning`, `installation`, `deployment`, `note`, `alert`
4. WHEN a plugin executes a RemoteExecution capability, THE System SHALL automatically create a journal entry
5. WHEN a plugin reports an Event, THE System SHALL automatically create a journal entry
6. THE NodeJournal SHALL support manual note entries added by users
7. THE NodeDetailPage SHALL display the NodeJournal as a chronological timeline
8. THE NodeJournal SHALL be filterable by entry type, source plugin, date range, and user
9. THE NodeJournal entries SHALL be persisted in the database with proper indexing for efficient queries
10. WHEN a node is provisioned or decommissioned, THE System SHALL create corresponding journal entries

### Requirement 4: Events Integration Type

**User Story:** As a user, I want plugins to report events that occurred on systems, so that I can track alerts, changes, and incidents in one place.

#### Acceptance Criteria

1. THE System SHALL define an `Events` integration type for plugins that report system events
2. THE Event capability interface SHALL include: `events.list`, `events.get`, `events.subscribe`
3. WHEN a plugin reports an event, THE Event SHALL include: timestamp, severity, source, node, title, description, and metadata
4. THE Event severity levels SHALL be: `info`, `warning`, `error`, `critical`
5. THE PuppetDBPlugin SHALL report Puppet run events (changes, failures, corrections)
6. THE System SHALL provide an EventsViewer widget for displaying events on the dashboard and node pages
7. WHEN an event is reported, THE System SHALL automatically create a NodeJournal entry for the affected node
8. THE System SHALL support event aggregation to group related events (e.g., multiple Puppet changes in one run)

### Requirement 5: Home Widget System

**User Story:** As a user, I want to see a color-coded summary tile for each enabled integration on the home page, so that I can quickly understand the status and key metrics of each integration at a glance.

#### Acceptance Criteria

1. WHEN the HomePage loads, THE WidgetSlot component SHALL render a HomeWidget for each enabled plugin that provides a `home-summary` slot widget
2. WHEN a plugin defines a HomeWidget, THE HomeWidget SHALL display using the plugin's configured color from `metadata.color`
3. THE HomeWidget SHALL display the integration name, health status indicator, and key summary metrics relevant to that integration
4. WHEN the user clicks on a HomeWidget, THE System SHALL navigate to that integration's home page
5. IF a plugin is disabled or unhealthy, THEN THE HomeWidget SHALL display a visual indicator of the degraded state
6. THE BoltPlugin SHALL provide a HomeWidget showing: node count, recent execution count, and last execution status
7. THE PuppetDBPlugin SHALL provide a HomeWidget showing: total nodes, recent reports summary, and failed runs count
8. THE PuppetserverPlugin SHALL provide a HomeWidget showing: environment count, catalog compilation status, and server health
9. THE HieraPlugin SHALL provide a HomeWidget showing: total keys indexed, hierarchy levels, and last scan timestamp

### Requirement 6: Integration Home Page Generation

**User Story:** As a user, I want each integration to have its own dedicated home page with tabs organized by capability category, so that I can access all features of an integration in one place.

#### Acceptance Criteria

1. WHEN a user navigates to `/integrations/:pluginName`, THE System SHALL render an IntegrationHomePage for that plugin
2. THE IntegrationHomePage SHALL automatically generate tabs based on the capability categories registered by the plugin
3. WHEN rendering tabs, THE System SHALL group capabilities by their `category` field (e.g., `command`, `info`, `config`, `inventory`)
4. THE IntegrationHomePage SHALL display the plugin's metadata including name, description, version, and color theming
5. WHEN a tab is selected, THE System SHALL render all widgets from that plugin that match the selected capability category
6. IF a user lacks permission for a capability category, THEN THE System SHALL hide or disable that tab
7. THE IntegrationHomePage SHALL include a health status section showing the plugin's current health check result
8. WHEN the plugin provides CLI commands, THE IntegrationHomePage SHALL display a CLI reference section with examples

### Requirement 7: Node Page Enhancement

**User Story:** As a user, I want the node detail page to automatically display tabs for each integration that provides node-level capabilities, so that I can see all relevant information about a node from all integrations in one place.

#### Acceptance Criteria

1. WHEN the NodeDetailPage loads, THE System SHALL query the CapabilityRegistry for all widgets with `node-detail` slot
2. THE NodeDetailPage SHALL automatically generate tabs based on plugins that provide node-level widgets
3. WHEN a plugin provides multiple node-level widgets, THE System SHALL group them under a single tab named after the plugin
4. THE NodeDetailPage SHALL display a special "Summary" widget at the top showing essential info from all integrations for that node
5. THE Summary widget SHALL aggregate: OS info from PuppetDB facts, last Puppet run status, Bolt connectivity status, and Hiera key count
6. WHEN a tab is selected, THE System SHALL lazy-load the widgets for that tab to optimize performance
7. IF a plugin's health check fails, THEN THE System SHALL display an error state in that plugin's tab
8. THE NodeDetailPage SHALL include a "Journal" tab displaying the NodeJournal timeline for that node
9. THE BoltPlugin SHALL provide node widgets for: command execution, task execution, and facts viewing
10. THE PuppetDBPlugin SHALL provide node widgets for: facts explorer, reports viewer, events viewer, and catalog viewer
11. THE PuppetserverPlugin SHALL provide node widgets for: catalog compilation, environment info, and node status
12. THE HieraPlugin SHALL provide node widgets for: key lookup, hierarchy viewer, and node Hiera data

### Requirement 8: API Versioning

**User Story:** As a developer, I want all v1.0.0 API endpoints to be versioned under `/api/v1/`, so that we have a clean API structure that can evolve in future versions.

#### Acceptance Criteria

1. THE System SHALL prefix all v1.0.0 routes with `/api/v1/`
2. WHEN registering v1 routes, THE Express router SHALL mount them under the `/api/v1` path prefix
3. THE System SHALL remove all legacy unversioned routes
4. THE v1 API routes SHALL include: `/api/v1/plugins`, `/api/v1/capabilities`, `/api/v1/widgets`
5. THE v1 API routes SHALL include capability execution endpoints: `/api/v1/capabilities/:capabilityName/execute`
6. THE v1 API routes SHALL include plugin-specific endpoints: `/api/v1/plugins/:pluginName/capabilities`
7. THE System SHALL document the API version in response headers using `X-API-Version: 1.0.0`
8. THE v1 API routes SHALL include node endpoints: `/api/v1/nodes`, `/api/v1/nodes/:nodeId`, `/api/v1/nodes/:nodeId/journal`
9. THE v1 API routes SHALL include event endpoints: `/api/v1/events`, `/api/v1/nodes/:nodeId/events`

### Requirement 9: Legacy Code Removal (Optional at the end)

**User Story:** As a developer, I want all legacy 0.5.x code to be removed, so that the codebase is clean and maintainable without deprecated patterns.

#### Acceptance Criteria

1. THE System SHALL remove all legacy interfaces: `ExecutionToolPlugin`, `InformationSourcePlugin`, `IntegrationPlugin`
2. THE System SHALL remove all legacy methods from IntegrationManager: `getExecutionTool()`, `getInformationSource()`, `getAllExecutionTools()`, `getAllInformationSources()`
3. THE System SHALL remove all legacy route files: unversioned `routes/inventory.ts`, `routes/facts.ts`, `routes/commands.ts`, `routes/tasks.ts`, `routes/puppet.ts`
4. THE System SHALL remove the legacy `IntegrationConfig` type and replace with plugin configuration
5. THE System SHALL update all imports to use only v1.0.0 types from `integrations/types.ts`
6. THE System SHALL remove the legacy `PluginRegistration` type and use only `PluginRegistrationV1`
7. THE System SHALL clean up the frontend to remove any legacy API calls and use only v1 endpoints
8. WHEN removing legacy code, THE System SHALL preserve working functionality by reimplementing it using the v1 architecture

### Requirement 10: Inventory Consolidation

**User Story:** As a user, I want inventory data from multiple sources to be consolidated into a unified view, so that I can see all my nodes regardless of which tool discovered them.

#### Acceptance Criteria

1. THE System SHALL aggregate inventory data from all plugins that provide `inventory.list` capability
2. WHEN multiple plugins report the same node, THE System SHALL merge the data into a single unified node record
3. THE System SHALL correlate nodes across plugins using: hostname, FQDN, IP address, certname, or custom identifiers
4. THE unified node record SHALL include a `sources` field listing all plugins that contributed data
5. WHEN displaying a node, THE System SHALL show which integrations have data for that node
6. THE System SHALL provide a conflict resolution strategy when plugins report conflicting data for the same field
7. THE inventory consolidation SHALL support future plugins: Ansible, Terraform, AWS EC2, monitoring tools (Icinga)

### Requirement 11: Remote Execution Standardization

**User Story:** As a user, I want a consistent interface for executing commands across different tools, so that I can use the same workflow regardless of the underlying execution tool.

#### Acceptance Criteria

1. THE System SHALL define a standard RemoteExecution capability interface with common parameters
2. THE RemoteExecution interface SHALL include: target nodes, action type, action content, parameters, timeout, and options
3. THE action types SHALL include: `command`, `task`, `playbook`, `script`
4. WHEN a RemoteExecution capability is invoked, THE System SHALL create a NodeJournal entry for each target node
5. THE RemoteExecution result SHALL include: status, output (stdout/stderr), exit code, duration, and per-node results
6. THE BoltPlugin SHALL implement RemoteExecution for: shell commands and Bolt tasks
7. THE System SHALL support streaming output for long-running executions
8. THE RemoteExecution interface SHALL be extensible for future tools: Ansible playbooks, SSH commands, WinRM

### Requirement 12: Plugin Widget Registration

**User Story:** As a plugin developer, I want to register widgets with specific slots and capabilities, so that the UI can automatically render my widgets in the appropriate locations.

#### Acceptance Criteria

1. WHEN a plugin initializes, THE CapabilityRegistry SHALL register all widgets defined in the plugin's `widgets` array
2. THE widget registration SHALL validate that all `requiredCapabilities` are also registered by the plugin
3. WHEN querying widgets for a slot, THE CapabilityRegistry SHALL return widgets sorted by `priority` (highest first)
4. THE CapabilityRegistry SHALL filter widgets based on user permissions for the required capabilities
5. WHEN a widget is registered, THE System SHALL store the plugin name, widget ID, slots, and required capabilities
6. THE System SHALL support the following widget slots: `dashboard`, `node-detail`, `inventory-panel`, `standalone-page`, `sidebar`, `modal`, `home-summary`, `node-journal`
7. WHEN a plugin is disabled, THE System SHALL exclude its widgets from slot queries

### Requirement 13: Plugin Color Theming

**User Story:** As a user, I want each integration to have consistent color theming throughout the UI, so that I can easily identify which integration I'm working with.

#### Acceptance Criteria

1. WHEN a plugin defines `metadata.color`, THE System SHALL use that color for all UI elements related to that plugin
2. THE HomeWidget SHALL use the plugin color for its border, header background, or accent elements
3. THE IntegrationHomePage SHALL use the plugin color in its header and tab styling
4. THE NodeDetailPage tabs SHALL use the plugin color as an accent for the active tab indicator
5. THE NodeJournal entries SHALL use the source plugin's color for visual identification
6. THE System SHALL generate light and dark variants of the plugin color for different UI contexts
7. IF a plugin does not define a color, THE System SHALL use a default neutral color

### Requirement 14: Health Status Integration

**User Story:** As a user, I want to see the health status of each integration throughout the UI, so that I know when an integration is experiencing issues.

#### Acceptance Criteria

1. WHEN displaying a HomeWidget, THE System SHALL show a health indicator (green/yellow/red) based on the plugin's health check
2. WHEN a plugin health check returns `degraded: true`, THE System SHALL display a yellow/warning indicator
3. THE IntegrationHomePage SHALL display detailed health information including `workingCapabilities` and `failingCapabilities`
4. WHEN a capability execution fails due to plugin health issues, THE System SHALL display a user-friendly error message
5. THE System SHALL cache health check results for 30 seconds to avoid excessive health check calls
6. WHEN the user clicks on a health indicator, THE System SHALL show detailed health information in a tooltip or modal

### Requirement 15: Native Plugin Implementation

**User Story:** As a developer, I want the 4 native plugins to be fully implemented following the v1.0 standards, so that they serve as reference implementations for external plugin development.

#### Acceptance Criteria

1. THE BoltPlugin SHALL implement all capabilities: `bolt.command.execute`, `bolt.task.execute`, `bolt.task.list`, `bolt.inventory.list`, `bolt.facts.query`
2. THE PuppetDBPlugin SHALL implement all capabilities: `puppetdb.nodes`, `puppetdb.facts`, `puppetdb.reports`, `puppetdb.events`, `puppetdb.catalog`, `puppetdb.query`
3. THE PuppetserverPlugin SHALL implement all capabilities: `puppetserver.catalog`, `puppetserver.environments`, `puppetserver.status`, `puppetserver.facts`
4. THE HieraPlugin SHALL implement all capabilities: `hiera.lookup`, `hiera.keys`, `hiera.hierarchy`, `hiera.scan`, `hiera.node`, `hiera.analysis`
5. EACH native plugin SHALL provide HomeWidget, IntegrationPage widgets, and NodeDetail widgets
6. EACH native plugin SHALL include CLI command definitions for all capabilities
7. EACH native plugin SHALL include comprehensive documentation in its README.md
8. THE native plugins SHALL be located in `backend/src/plugins/native/{pluginName}/` directory structure

### Requirement 16: Debug Mode Feature

**User Story:** As a developer or power user, I want a debug mode that shows all API requests, responses, tool outputs, and errors, so that I can troubleshoot issues and understand what's happening under the hood.

#### Acceptance Criteria

1. THE System SHALL provide a toggleable debug mode accessible via UI toggle or keyboard shortcut
2. WHEN debug mode is enabled, THE System SHALL display a DebugPanel showing all API requests and responses
3. THE DebugPanel SHALL show for each request: URL, method, headers, request body, response status, response body, and timing
4. WHEN a capability is executed, THE DebugPanel SHALL show the raw output from the underlying tool (Bolt, PuppetDB API, etc.)
5. WHEN an error occurs, THE DebugPanel SHALL display the full error stack trace and context
6. THE DebugPanel SHALL support filtering by: request type, status code, plugin source, and time range
7. THE DebugPanel SHALL support copying request/response data to clipboard for sharing
8. WHEN debug mode is enabled, THE API responses SHALL include a `_debug` field with execution metadata
9. THE debug metadata SHALL include: correlation ID, execution time, capability name, plugin name, and raw tool output
10. THE DebugPanel SHALL persist debug logs in session storage for review after page navigation
11. THE System SHALL provide a "Clear Debug Logs" action to reset the debug panel
12. WHEN streaming output is available (e.g., command execution), THE DebugPanel SHALL show real-time output updates
