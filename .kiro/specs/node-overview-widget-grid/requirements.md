# Requirements Document

## Introduction

Reorganize the node detail overview tab into a composable, plugin-driven widget grid. Each integration plugin contributes one or more widgets via a frontend-only component registry. Widgets render in a 4-column responsive grid with priority-weighted ordering. Action buttons occupy a dedicated header row above the grid. Widgets load asynchronously and in parallel with graceful error handling per widget.

## Glossary

- **Widget_Registry**: A frontend-only TypeScript module that maintains an ordered collection of widget definitions contributed by integration plugins
- **Widget_Definition**: A declarative descriptor containing a Svelte component reference, column span, priority weight, required integration name, and widget type
- **Widget_Grid**: A 4-column CSS grid layout that renders widget components according to their declared column spans and priority order
- **Action_Row**: A dedicated horizontal strip rendered between the page header and the Widget_Grid, containing action button widgets
- **Widget_Frame**: The container element rendered for each widget position in the grid, showing loading state until the widget component mounts
- **Integration_Status_Endpoint**: The existing `GET /api/integrations/status` backend endpoint that returns enabled/disabled state and health for each integration
- **Priority_Weight**: A numeric value declared per widget that determines render order within the grid (lower number renders first)
- **Column_Span**: An integer (1–3) declaring how many columns a widget occupies in the 4-column grid

## Requirements

### Requirement 1: Widget Registry

**User Story:** As a plugin developer, I want to register widgets from my integration so that the overview tab dynamically displays plugin-contributed content without modifying the core page.

#### Acceptance Criteria

1. THE Widget_Registry SHALL expose a registration function that accepts a Widget_Definition containing: component reference, integration name, widget type, column span, and priority weight
2. THE Widget_Registry SHALL store all registered Widget_Definitions in a single ordered collection accessible at runtime
3. WHEN a Widget_Definition is registered with a column span value outside the range 1–3, THE Widget_Registry SHALL clamp the value to the nearest valid bound (1 or 3)
4. THE Widget_Registry SHALL accept Widget_Definitions with a widget type of "action", "list", or "summary"
5. THE Widget_Registry SHALL be implemented as a TypeScript module using Svelte 5 runes for reactive state

### Requirement 2: Integration Filtering

**User Story:** As an operator, I want the overview tab to display widgets only for integrations that are enabled and reachable so that I see relevant information without noise from disabled plugins.

#### Acceptance Criteria

1. WHEN the overview tab mounts, THE Widget_Grid SHALL fetch integration status from the Integration_Status_Endpoint
2. THE Widget_Grid SHALL render only Widget_Definitions whose declared integration name matches an integration with status "connected" or "degraded" from the Integration_Status_Endpoint response
3. WHEN the Integration_Status_Endpoint returns an error, THE Widget_Grid SHALL render no integration-dependent widgets and display a single inline error notification
4. IF a Widget_Definition declares an integration name that does not appear in the Integration_Status_Endpoint response, THEN THE Widget_Grid SHALL exclude that widget from rendering

### Requirement 3: Widget Grid Layout

**User Story:** As a user, I want the overview tab to display information in an organized grid so that I can scan node details at a glance.

#### Acceptance Criteria

1. THE Widget_Grid SHALL use a 4-column CSS grid layout with TailwindCSS utility classes
2. THE Widget_Grid SHALL render widgets in ascending Priority_Weight order (lowest weight first)
3. WHEN two widgets share the same Priority_Weight, THE Widget_Grid SHALL render them in registration order
4. THE Widget_Grid SHALL assign each widget a column span matching the widget's declared Column_Span value (1, 2, or 3 columns)
5. WHILE the viewport width is below the `sm` TailwindCSS breakpoint, THE Widget_Grid SHALL collapse to a single-column layout where each widget spans the full width
6. WHILE the viewport width is between the `sm` and `lg` TailwindCSS breakpoints, THE Widget_Grid SHALL use a 2-column layout

### Requirement 4: Action Row

**User Story:** As a user, I want quick-access action buttons (Run Puppet, VM controls, Console) rendered prominently above the detail grid so that I can take immediate actions without scrolling.

#### Acceptance Criteria

1. THE Action_Row SHALL render between the page header (hostname/metadata) and the Widget_Grid
2. THE Action_Row SHALL contain only widgets with widget type "action"
3. THE Action_Row SHALL render action widgets in ascending Priority_Weight order
4. THE Action_Row SHALL use a horizontal flex layout that wraps on smaller viewports
5. WHEN no action widgets are available (all associated integrations disabled), THE Action_Row SHALL not render any container element

### Requirement 5: Async Widget Loading

**User Story:** As a user, I want to see the grid frame immediately when the page loads so that I have spatial context while individual widgets fetch their data.

#### Acceptance Criteria

1. WHEN the overview tab renders, THE Widget_Grid SHALL display all Widget_Frames immediately with a loading skeleton placeholder
2. THE Widget_Grid SHALL mount all widget components in parallel without awaiting sequential completion
3. WHEN a widget component finishes loading its data, THE Widget_Frame SHALL replace the skeleton with the widget content without affecting other widgets
4. WHILE a widget is loading, THE Widget_Frame SHALL display an animated skeleton placeholder with dimensions matching the widget's declared Column_Span

### Requirement 6: Widget Error Handling

**User Story:** As a user, I want a widget that fails to load to show a contained error state so that one broken integration does not prevent me from using the rest of the overview.

#### Acceptance Criteria

1. IF a widget component throws an error during mount or data fetching, THEN THE Widget_Frame SHALL display an inline error badge showing the integration name and a short error summary
2. IF a widget component throws an error, THEN THE Widget_Frame SHALL offer a retry button that re-mounts the widget component
3. IF a widget component throws an error, THEN THE Widget_Grid SHALL continue rendering all other widgets without interruption
4. WHEN a widget error badge is displayed, THE Widget_Frame SHALL maintain its declared Column_Span to preserve grid layout stability

### Requirement 7: No New Backend Endpoint

**User Story:** As a developer, I want the widget registry to be purely frontend so that no backend changes are required for registration.

#### Acceptance Criteria

1. THE Widget_Registry SHALL operate entirely in the frontend without requiring a dedicated backend endpoint for widget metadata
2. THE Widget_Registry SHALL rely exclusively on the existing Integration_Status_Endpoint for determining which integrations are active
3. WHEN integration plugins register widgets, THE registration SHALL occur at module load time via static import side-effects

### Requirement 8: Existing Widget Migration

**User Story:** As a user, I want the current overview content (General Info, Latest Puppet Runs, Latest Actions, Monitoring Summary, Console) to appear in the new grid system so that no functionality is lost.

#### Acceptance Criteria

1. THE Widget_Registry SHALL include a "General Information" summary widget spanning 2 columns with Priority_Weight lower than all integration-contributed widgets
2. WHEN the puppetdb integration is enabled, THE Widget_Registry SHALL include a "Latest Puppet Runs" list widget spanning 3 columns
3. THE Widget_Registry SHALL include a "Latest Actions" list widget spanning 2 columns
4. WHEN the checkmk integration is enabled, THE Widget_Registry SHALL include a "Monitoring Summary" summary widget spanning 2 columns
5. WHEN console capabilities are available for the node, THE Widget_Registry SHALL include a "Console Access" action widget in the Action_Row
