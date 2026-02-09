# Requirements Document: V1 Plugins Finalization

## Introduction

This feature completes the v1 plugin architecture by fixing widget registration, adding capability-based category tabs, and correcting widget display behavior. The backend autoloading works correctly via PluginLoader, but the frontend has critical gaps:

**Plugin System Issues:**

- Ansible has `frontend/index.ts` but only exports components (no ANSIBLE_WIDGET_MANIFEST)
- SSH has no `frontend/index.ts` at all
- `registerPluginWidgets.ts` only imports bolt, hiera, puppetdb, puppetserver (missing ansible and ssh)
- Widgets get stuck loading because they're not registered in WIDGET_MANIFEST
- `IntegrationHomePage.svelte` lacks capability-based category tabs

**Widget Display Issues:**

- HomePage shows dashboard widgets (should only show home-widgets and integration status)
- Plugin home pages don't show dashboard widgets in main tab (should show them)

## Glossary

- **Plugin**: A modular integration that provides capabilities (commands, inventory, info, etc.) and widgets to the Pabawi system
- **Capability**: A specific function a plugin can perform (e.g., command.execute, inventory.list, info.facts)
- **Widget**: A frontend component that displays data or provides interaction for a plugin capability
- **Integration_Type**: A category that groups plugins by their primary functionality (RemoteExecution, InventorySource, Info, Event, etc.)
- **Autoloading**: The automatic discovery and registration of plugins and their capabilities during system initialization
- **Widget_Registration**: The process of importing and registering plugin widgets into the global widget manifest
- **Plugin_Home_Page**: A dedicated page for each plugin showing tabs for each capability category
- **Capability_Category**: A grouping of related capabilities (inventory, command, task, info, events, reports, package)
- **Native_Plugin**: A plugin bundled with Pabawi (ansible, bolt, hiera, puppetdb, puppetserver, ssh)
- **Frontend_Entry_Point**: The TypeScript file that exports widget manifests for a plugin (frontend/index.ts)

## Requirements

### Requirement 1: Complete Plugin Autoloading

**User Story:** As a system administrator, I want all native plugins to be automatically discovered and registered during system initialization, so that all plugin capabilities are available without manual configuration.

#### Acceptance Criteria

1. WHEN the backend starts, THE System SHALL discover all native plugins by scanning the plugins/native directory
2. WHEN a plugin is discovered, THE System SHALL load its plugin.json manifest and validate it against the schema
3. WHEN a plugin manifest is valid, THE System SHALL register all capabilities defined in the manifest
4. WHEN a plugin has multiple integration types, THE System SHALL register the plugin under all specified integration types
5. WHEN plugin registration completes, THE System SHALL log the total number of plugins and capabilities registered
6. IF a plugin manifest is invalid or missing, THEN THE System SHALL log a warning and continue loading other plugins

### Requirement 2: Complete Widget Registration

**User Story:** As a developer, I want all plugin widgets to be automatically registered during frontend initialization, so that widgets from all plugins are available for rendering.

#### Acceptance Criteria

1. WHEN the frontend initializes, THE Widget_Registration SHALL import widget manifests from all native plugins with frontend entry points
2. WHEN importing widget manifests, THE Widget_Registration SHALL include ansible and ssh plugins in addition to existing plugins
3. WHEN a widget manifest is imported, THE Widget_Registration SHALL register each widget entry into the global WIDGET_MANIFEST
4. WHEN widget registration completes, THE Widget_Registration SHALL log the total number of widgets registered
5. IF a plugin lacks a frontend entry point, THEN THE Widget_Registration SHALL skip that plugin without errors

### Requirement 3: Integration Type Navigation

**User Story:** As a user, I want to see all integration types in the navigation menu, so that I can access plugins by their capability categories including inventory sources.

#### Acceptance Criteria

1. WHEN the navigation menu renders, THE System SHALL display menu items for all integration types that have registered plugins
2. WHEN displaying integration types, THE System SHALL include InventorySource alongside RemoteExecution, Info, and Event types
3. WHEN a user clicks an integration type menu item, THE System SHALL navigate to a page showing all plugins of that type
4. WHEN multiple plugins share an integration type, THE System SHALL display all matching plugins in the integration type view
5. WHEN a plugin has multiple integration types, THE System SHALL appear in all relevant integration type views

### Requirement 4: Capability-Based Plugin Home Pages

**User Story:** As a user, I want each plugin home page to display tabs for each capability category, so that I can easily access different types of functionality provided by the plugin.

#### Acceptance Criteria

1. WHEN a user navigates to a plugin home page, THE System SHALL analyze the plugin's capabilities and group them by category
2. WHEN displaying capability categories, THE System SHALL create tabs for inventory, command, task, info, events, reports, and package categories that have capabilities
3. WHEN a capability category tab is selected, THE System SHALL display widgets that match that category
4. WHEN a plugin has no capabilities in a category, THE System SHALL not display a tab for that category
5. WHEN widgets are displayed in a category tab, THE System SHALL filter widgets by the user's permissions and required capabilities

### Requirement 5: Widget Migration from 0.5 Components

**User Story:** As a developer, I want existing 0.5 components to be migrated to the new plugin widget structure, so that all functionality is preserved in the v1 architecture.

#### Acceptance Criteria

1. WHEN migrating components, THE System SHALL identify all 0.5 components that belong to specific plugins
2. WHEN a component is identified for migration, THE System SHALL move it to the appropriate plugin's frontend directory
3. WHEN a component is moved, THE System SHALL update import paths and component references
4. WHEN a component is adapted, THE System SHALL ensure it follows the v1 widget interface with proper capability requirements
5. WHEN migration is complete, THE System SHALL remove migrated components from the shared components directory

### Requirement 6: Inventory Data Access

**User Story:** As a user, I want to access inventory data from all plugins that provide inventory capabilities, so that I can view and manage nodes from multiple sources.

#### Acceptance Criteria

1. WHEN a plugin provides inventory capabilities, THE System SHALL expose inventory.list, inventory.get, inventory.groups, and inventory.filter endpoints
2. WHEN the inventory view loads, THE System SHALL query all plugins with InventorySource integration type
3. WHEN displaying inventory data, THE System SHALL merge results from multiple inventory sources
4. WHEN a node appears in multiple inventory sources, THE System SHALL indicate which plugins provide data for that node
5. WHEN inventory data is unavailable from a plugin, THE System SHALL display an error for that plugin without blocking other sources

### Requirement 7: Plugin Widget Component Structure

**User Story:** As a developer, I want a consistent widget component structure across all plugins, so that widgets are maintainable and follow established patterns.

#### Acceptance Criteria

1. WHEN creating a plugin widget, THE System SHALL require the widget to export a Svelte component
2. WHEN a widget is registered, THE System SHALL validate that it includes required metadata (id, name, component, slots, size, requiredCapabilities)
3. WHEN a widget renders, THE System SHALL receive context including pluginName and pluginInfo
4. WHEN a widget requires capabilities, THE System SHALL only render the widget if the user has required permissions
5. WHEN a widget is node-scoped, THE System SHALL receive node context in addition to plugin context

### Requirement 8: Plugin Home Page Widget Slots

**User Story:** As a user, I want plugin home pages to display relevant widgets in appropriate slots, so that I can interact with plugin functionality in an organized manner.

#### Acceptance Criteria

1. WHEN a plugin home page renders, THE System SHALL load widgets registered for the standalone-page slot
2. WHEN displaying widgets, THE System SHALL organize widgets by capability category tabs
3. WHEN a widget has a category property, THE System SHALL display it in the matching category tab
4. WHEN a widget lacks a category property, THE System SHALL display it in a general tab
5. WHEN no widgets are available for a category, THE System SHALL display an empty state message

### Requirement 9: Frontend Entry Point Widget Manifests

**User Story:** As a developer, I want ansible and ssh plugins to export proper widget manifests from their frontend entry points, so that their widgets can be registered and displayed.

#### Acceptance Criteria

1. WHEN ansible frontend entry point exists, THE System SHALL export a widget manifest constant named ANSIBLE_WIDGET_MANIFEST
2. WHEN creating ssh frontend entry point, THE System SHALL create a frontend/index.ts file in the ssh plugin directory
3. WHEN the widget manifest is defined, THE System SHALL include all widgets from the plugin's plugin.json file
4. WHEN widgets are defined, THE System SHALL map each widget to its Svelte component with a load function
5. WHEN the entry point is complete, THE System SHALL be importable by the widget registration system

### Requirement 10: Plugin Health and Status Display

**User Story:** As a user, I want to see the health status of each plugin on its home page, so that I can quickly identify if a plugin is functioning correctly.

#### Acceptance Criteria

1. WHEN a plugin home page loads, THE System SHALL query the plugin's health status from the backend
2. WHEN displaying health status, THE System SHALL show a visual indicator (healthy/offline) with appropriate colors
3. WHEN a plugin is offline, THE System SHALL display an error message with troubleshooting information
4. WHEN a plugin is healthy, THE System SHALL display a success indicator
5. WHEN health status changes, THE System SHALL update the display without requiring a page refresh

### Requirement 11: Widget Slot Display Behavior

**User Story:** As a user, I want widgets to appear in appropriate locations, so that the home page shows summaries and plugin pages show detailed tools.

#### Acceptance Criteria

1. WHEN the home page renders, THE System SHALL display only widgets from the home-summary slot
2. WHEN the home page renders, THE System SHALL NOT display widgets from the dashboard slot
3. WHEN a plugin home page renders in the overview tab, THE System SHALL display widgets from the dashboard slot
4. WHEN a plugin home page renders in the overview tab, THE System SHALL display widgets from the standalone-page slot
5. WHEN a plugin home page renders in a category tab, THE System SHALL display only widgets matching that category from dashboard and standalone-page slots
