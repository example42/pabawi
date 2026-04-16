# Frontend Code Analysis Report

**Generated:** January 28, 2026  
**Version:** 0.5.0

## Executive Summary

- **Total Files:** 82 TypeScript/Svelte files
- **Total Lines:** 30,614
- **Unique Backend Endpoints:** ~35+
- **Components:** 54 files (17,355 lines)
- **Pages:** 7 files (5,383 lines)
- **Libraries:** 20 files (3,290 lines)

---

## 📁 Directory Structure

```
frontend/src/
├── main.ts (18 lines)
├── App.svelte (55 lines)
├── vite-env.d.ts (2 lines)
├── components/ (54 files, 17,355 lines)
├── lib/ (20 files, 3,290 lines)
└── pages/ (7 files, 5,383 lines)
```

---

## 🗂️ Root Files (75 lines)

### main.ts (18 lines)

- **Description:** Application entry point that mounts the Svelte app
- **Methods:** None
- **Imports:** App.svelte, theme.svelte.ts
- **Backend Endpoints:** None

### App.svelte (55 lines)

- **Description:** Root component with routing, error boundary, and toast notifications
- **Methods:** `handleError()`
- **Imports:** All pages, Router, Navigation, ErrorBoundary, ToastContainer
- **Backend Endpoints:** None

### vite-env.d.ts (2 lines)

- **Description:** TypeScript declarations for Vite environment
- **Methods:** None
- **Backend Endpoints:** None

---

## 📚 Library Directory (3,290 lines)

### State Management Files

#### router.svelte.ts (114 lines)

- **Class:** `Router`
- **Description:** Client-side router with pattern matching and navigation
- **Methods:**
  - `navigate(path: string)` - Navigate to a new path
  - `matchRoute(path: string)` - Match path to route definition
  - `findRoute(path: string)` - Find matching route and extract params
- **Relationships:** Used by all pages, Navigation.svelte
- **Backend Endpoints:** None

#### expertMode.svelte.ts (31 lines)

- **Description:** Global expert mode state management
- **Methods:**
  - `toggle()` - Toggle expert mode on/off
  - `setEnabled(value: boolean)` - Set expert mode state
- **Relationships:** Used by api.ts, logger.ts, executionStream.ts, 6+ pages
- **Backend Endpoints:** None

#### theme.svelte.ts (82 lines)

- **Description:** Theme management (light/dark/system) with localStorage persistence
- **Methods:**
  - `setTheme(theme: Theme)` - Set active theme
  - `toggle()` - Toggle between light/dark
  - `applyTheme()` - Apply theme to DOM
- **Relationships:** Used by main.ts, Navigation.svelte
- **Backend Endpoints:** None

#### toast.svelte.ts (106 lines)

- **Description:** Toast notification state and helpers
- **Methods:**
  - `addToast(config)` - Add new toast notification
  - `removeToast(id)` - Remove toast by ID
  - `showSuccess(message)` - Success toast helper
  - `showError(message)` - Error toast helper
  - `showInfo(message)` - Info toast helper
  - `showWarning(message)` - Warning toast helper
- **Relationships:** Used by 8+ files, ToastContainer.svelte
- **Backend Endpoints:** None

#### reportFilters.svelte.ts (76 lines)

- **Description:** Puppet report filter state
- **Methods:**
  - `setFilter(key, value)` - Set filter value
  - `clearFilters()` - Reset all filters
  - `getFilters()` - Get active filters object
- **Relationships:** Used by ReportsPage.svelte, ReportFilterPanel.svelte
- **Backend Endpoints:** None

#### integrationColors.svelte.ts (156 lines)

- **Description:** Integration color mapping and management
- **Methods:**
  - `loadColors()` - Load color config from API
  - `getColor(integration)` - Get color for integration
  - `getAllColors()` - Get all integration colors
- **Relationships:** Used by IntegrationBadge.svelte, multiple pages
- **Backend Endpoints:** `GET /api/config/ui`

### API & Communication Files

#### api.ts (669 lines)

- **Description:** Centralized HTTP client with retry logic, error handling, and type safety
- **Key Functions:**
  - `fetchWithRetry(url, options, retries)` - Fetch with exponential backoff retry
  - `get<T>(url, options)` - GET request
  - `post<T>(url, body, options)` - POST request
  - `put<T>(url, body, options)` - PUT request
  - `del<T>(url, options)` - DELETE request
  - `parseErrorResponse(error)` - Parse error response with context
  - `getErrorGuidance(error)` - Get troubleshooting guidance for errors
- **Relationships:** Used by all pages and 20+ components
- **Backend Endpoints:** All (utility wrapper)

#### logger.svelte.ts (437 lines)

- **Description:** Frontend logging system with backend synchronization
- **Key Functions:**
  - `debug(message, metadata)` - Debug level log
  - `info(message, metadata)` - Info level log
  - `warn(message, metadata)` - Warning level log
  - `error(message, metadata)` - Error level log
  - `flush()` - Send logs to backend
  - `obfuscateData(data)` - Remove sensitive data from logs
  - `generateCorrelationId()` - Generate unique correlation ID
- **Relationships:** Used by api.ts, executionStream.ts, multiple pages
- **Backend Endpoints:** `POST /api/debug/frontend-log`

#### executionStream.svelte.ts (451 lines)

- **Description:** Server-Sent Events (SSE) client for real-time execution streaming
- **Key Functions:**
  - `useExecutionStream()` - Hook that returns stream manager
    - `connect(executionId)` - Connect to execution stream
    - `disconnect()` - Close stream connection
    - `reconnect()` - Reconnect with exponential backoff
- **Relationships:** Used by ExecutionsPage.svelte, NodeDetailPage.svelte
- **Backend Endpoints:** `GET /api/executions/:id/stream` (SSE)

### Utility Files

#### ansiToHtml.ts (154 lines)

- **Description:** Convert ANSI terminal color codes to HTML with CSS
- **Key Functions:**
  - `ansiToHtml(text)` - Main conversion function
  - `parseAnsiCode(code)` - Parse ANSI escape codes
  - `styleToString(styles)` - Convert style object to CSS string
- **Relationships:** Used by CommandOutput.svelte, RealtimeOutputViewer.svelte
- **Backend Endpoints:** None

#### multiSourceUtils.ts (290 lines)

- **Description:** Multi-source data aggregation with graceful degradation
- **Key Functions:**
  - `fetchFromMultipleSources(sources)` - Fetch from multiple sources in parallel
  - `isNotConfiguredError(error)` - Check if error is configuration issue
  - `mergeFactsFromSources(sources)` - Merge fact data by priority
- **Relationships:** Used by InventoryPage.svelte, NodeDetailPage.svelte
- **Backend Endpoints:** None (orchestrates API calls)

#### storage.ts (120 lines)

- **Description:** Safe sessionStorage and localStorage utilities
- **Key Functions:**
  - `loadPageSize(key)` - Load pagination size
  - `savePageSize(key, value)` - Save pagination size
  - `getSessionItem(key)` - Safe sessionStorage get
  - `setSessionItem(key, value)` - Safe sessionStorage set
- **Relationships:** Used by multiple pages for persistence
- **Backend Endpoints:** None

#### accessibility.ts (180 lines)

- **Description:** Accessibility utilities, keyboard handlers, ARIA helpers
- **Exports:**
  - `buttonClasses` - Accessible button CSS classes
  - `inputClasses` - Accessible input CSS classes
  - `keyboardHandlers` - Keyboard event utilities
  - `ariaHelpers` - ARIA attribute helpers
  - `focusManagement` - Focus trap and restoration
- **Relationships:** Used by multiple interactive components
- **Backend Endpoints:** None

---

## 📄 Pages Directory (5,383 lines)

### HomePage.svelte (645 lines)

- **Description:** Dashboard with overview stats, integration status, recent reports, and executions
- **Key Functions:**
  - `fetchInventory()` - Load inventory count
  - `fetchIntegrationStatus()` - Load integration health
  - `fetchPuppetReports()` - Load recent Puppet reports
  - `fetchAggregatedRunHistory()` - Load run history chart data
  - `fetchRecentExecutions()` - Load recent executions
- **State Variables (19):** nodes, integrations, executions, puppetReports, aggregatedRunHistory, debugInfoBlocks, loading states
- **Backend Endpoints (5):**
  1. `GET /api/config/ui` - UI configuration
  2. `GET /api/inventory` - Inventory nodes
  3. `GET /api/integrations/status?refresh=true` - Integration status
  4. `GET /api/integrations/puppetdb/reports/summary?hours=X` - Puppet reports summary
  5. `GET /api/puppet/history?days=X` - Run history chart data
  6. `GET /api/executions?pageSize=10&page=1` - Recent executions

### InventoryPage.svelte (806 lines)

- **Description:** Inventory listing with search, filtering, PQL queries, and multi-source support
- **Key Functions:**
  - `fetchInventory()` - Load nodes with filters
  - `applyPqlQuery(query)` - Execute PQL query
  - `handleSearch()` - Debounced search handler
  - `toggleSort(field)` - Toggle sort direction
- **Key Features:**
  - 15 PQL query templates
  - Grid/list view toggle
  - Multi-source aggregation (Bolt + PuppetDB)
  - Debounced search (300ms delay)
  - Sorting by name, source, lastCheckIn
- **State Variables (13):** nodes, sources, searchQuery, transportFilter, sourceFilter, sortBy, sortOrder, viewMode, pqlQuery
- **Backend Endpoints (1):**
  1. `GET /api/inventory?pql=X&sortBy=Y&sortOrder=Z` - Inventory with filters

### ExecutionsPage.svelte (925 lines)

- **Description:** Execution history with advanced filtering, pagination, and real-time streaming
- **Key Functions:**
  - `fetchExecutions()` - Load execution history
  - `fetchExecutionDetail(id)` - Load full execution details
  - `cancelExecution(id)` - Cancel running execution
  - `openExecutionDetail(execution)` - Open modal detail view
- **Key Features:**
  - Real-time SSE streaming for running executions (expert mode)
  - Advanced filtering (status, node, date range)
  - Pagination support
  - Modal detail view with per-node results
  - Re-execution support
  - ANSI color rendering
- **State Variables (14):** executions, pagination, summary, filters, selectedExecution, executionStream, debugInfo
- **Backend Endpoints (5):**
  1. `GET /api/inventory` - Nodes for filter dropdown
  2. `GET /api/executions?page=X&pageSize=Y&status=Z&node=A&dateFrom=B&dateTo=C` - Executions list
  3. `GET /api/executions/:id` - Execution details
  4. `POST /api/executions/:id/cancel` - Cancel execution
  5. `GET /api/executions/:id/stream` (SSE) - Real-time streaming output

### NodeDetailPage.svelte (2,079 lines) ⭐ **Largest File**

- **Description:** Comprehensive node detail view with 5 tabs and extensive functionality
- **Tabs:**
  1. Overview - Node info and quick facts
  2. Facts - Fact gathering and display
  3. Actions - Command and task execution
  4. Puppet - Puppet reports, catalog, events, resources (6 sub-tabs)
  5. Hiera - Hiera data lookup
- **Puppet Sub-tabs:**
  1. Node Status - Latest status from PuppetDB
  2. Catalog Compilation - Compilation info and metadata
  3. Reports - Paginated report list
  4. Catalog - Compiled catalog resources
  5. Events - Puppet events timeline
  6. Managed Resources - Resource list
- **Key Functions:**
  - `fetchNode()` - Load node details
  - `fetchFacts()` - Gather facts
  - `executeCommand()` - Run shell command
  - `fetchExecutions()` - Load execution history
  - `fetchPuppetReports()` - Load Puppet reports
  - `fetchCatalog()` - Load compiled catalog
- **State Variables (30+):** node, facts, commands, puppet, hiera, catalog, events, resources, executions, activeTab, activePuppetTab
- **Backend Endpoints (15+):**
  1. `GET /api/nodes/:id` - Node details
  2. `POST /api/nodes/:id/facts` - Gather facts
  3. `POST /api/nodes/:id/command` - Execute command
  4. `GET /api/nodes/:id/executions` - Node executions
  5. `GET /api/nodes/:id/puppet-reports` - PuppetDB reports
  6. `GET /api/nodes/:id/puppet-reports/:hash` - Report details
  7. `GET /api/nodes/:id/catalog` - Compiled catalog
  8. `GET /api/nodes/:id/events` - Puppet events
  9. `GET /api/nodes/:id/managed-resources` - Managed resources
  10. `GET /api/nodes/:id/catalog-compilation` - Compilation info
  11. `GET /api/puppet/history/:nodeName?days=X` - Run chart data
  12. `GET /api/nodes/:id/hiera` - Hiera data
  13. `POST /api/nodes/:id/puppet` - Run Puppet
  14. `POST /api/nodes/:id/package` - Install package
  15. `GET /api/config/command-whitelist` - Command whitelist

### ReportsPage.svelte (523 lines)

- **Description:** Puppet reports viewer with environment selector and filtering
- **Key Functions:**
  - `fetchReports()` - Load reports for selected environment
  - `fetchReport(hash)` - Load report details
  - `refreshReports()` - Refresh report list
- **Backend Endpoints (3):**
  1. `GET /api/integrations/puppetdb/reports?environment=X&limit=Y` - Reports list
  2. `GET /api/integrations/puppetdb/reports/:hash` - Report details
  3. `GET /api/integrations/puppetserver/environments` - Environment list

### IntegrationsPage.svelte (252 lines)

- **Description:** Integration setup guides and configuration help
- **Key Functions:**
  - `fetchIntegrationInfo()` - Load integration status
- **Backend Endpoints (1):**
  1. `GET /api/integrations/status` - Integration status

### ErrorPage.svelte (153 lines)

- **Description:** Error handling test page with manual error triggers
- **Key Functions:**
  - `triggerError()` - Test error handling
- **Backend Endpoints (1):**
  1. `GET /api/error-test` - Test endpoint

---

## 🧩 Components Directory (17,355 lines, 54 files)

### Core UI Components

#### Router.svelte (27 lines)

- **Description:** Route matching and component rendering
- **Props:** routes
- **Backend Endpoints:** None

#### Navigation.svelte (116 lines)

- **Description:** Top navigation bar with theme toggle and expert mode
- **Backend Endpoints:** None

#### ErrorBoundary.svelte (123 lines)

- **Description:** Error catching wrapper component
- **Props:** onError callback
- **Backend Endpoints:** None

#### LoadingSpinner.svelte (25 lines)

- **Description:** Loading indicator animation
- **Usage:** 13+ files
- **Backend Endpoints:** None

#### SkeletonLoader.svelte (64 lines)

- **Description:** Skeleton loading state placeholder
- **Backend Endpoints:** None

#### ToastContainer.svelte (114 lines)

- **Description:** Toast notification display manager
- **Backend Endpoints:** None

#### ErrorAlert.svelte (178 lines)

- **Description:** Error display with retry functionality
- **Props:** error, onRetry callback
- **Usage:** 12+ files
- **Backend Endpoints:** None

#### StatusBadge.svelte (78 lines)

- **Description:** Status indicator badge (success, failed, running, etc.)
- **Props:** status
- **Usage:** 9+ files
- **Backend Endpoints:** None

#### IntegrationBadge.svelte (80 lines)

- **Description:** Integration source badge with color coding
- **Props:** source, showIcon
- **Usage:** 10+ files
- **Backend Endpoints:** None

### Command & Execution Components

#### CommandOutput.svelte (303 lines)

- **Description:** Display command stdout and stderr with ANSI colors
- **Props:** stdout, stderr, status
- **Backend Endpoints:** None

#### RealtimeOutputViewer.svelte (567 lines)

- **Description:** SSE streaming output viewer with auto-scroll
- **Key Methods:**
  - `connect()` - Connect to stream
  - `disconnect()` - Close stream
  - `copyToClipboard()` - Copy output to clipboard
- **Props:** executionId, autoConnect
- **Backend Endpoints:** None (uses stream prop)

#### TaskRunInterface.svelte (628 lines)

- **Description:** Task execution form with parameter inputs
- **Key Methods:**
  - `submitTask()` - Execute task with parameters
- **Props:** nodeId, nodeName
- **Backend Endpoints:**
  1. `POST /api/nodes/:id/task` - Execute task
  2. `GET /api/tasks` - List available tasks

#### PuppetRunInterface.svelte (479 lines)

- **Description:** Puppet run execution form with options
- **Key Methods:**
  - `submitPuppetRun()` - Trigger Puppet run
- **Props:** nodeId, nodeName
- **Backend Endpoints:**
  1. `POST /api/nodes/:id/puppet` - Run Puppet

#### PackageInstallInterface.svelte (472 lines)

- **Description:** Package installation form with provider selection
- **Key Methods:**
  - `submitPackageInstall()` - Install package
- **Props:** nodeId, nodeName
- **Backend Endpoints:**
  1. `POST /api/nodes/:id/package` - Install package

#### TaskParameterForm.svelte (256 lines)

- **Description:** Dynamic task parameter input form
- **Props:** task, onSubmit
- **Backend Endpoints:** None

#### ReExecutionButton.svelte (169 lines)

- **Description:** Re-run execution button with confirmation
- **Key Methods:**
  - `handleReExecute()` - Re-execute command/task
- **Props:** execution, onReExecute
- **Backend Endpoints:** None (emits event)

#### ExecutionList.svelte (201 lines)

- **Description:** Execution list table with status indicators
- **Props:** executions, onSelect
- **Backend Endpoints:** None

### Facts & Data Viewers

#### FactsViewer.svelte (74 lines)

- **Description:** Display facts as formatted JSON
- **Props:** facts
- **Backend Endpoints:** None

#### MultiSourceFactsViewer.svelte (519 lines)

- **Description:** Multi-source facts viewer with tabs per source
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/facts?source=bolt`
  2. `GET /api/nodes/:id/facts?source=puppetdb`

#### GlobalFactsTab.svelte (423 lines)

- **Description:** Global facts viewer with PQL queries
- **Backend Endpoints:**
  1. `GET /api/facts?pql=X` - Facts with PQL query

#### NodeHieraTab.svelte (746 lines)

- **Description:** Node-specific Hiera data viewer and lookup
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/hiera` - Node Hiera data

#### GlobalHieraTab.svelte (560 lines)

- **Description:** Global Hiera lookup interface
- **Backend Endpoints:**
  1. `GET /api/hiera/lookup` - Global Hiera lookup

### Puppet Components

#### NodeStatus.svelte (421 lines)

- **Description:** Node status from PuppetDB with latest report info
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/status` - Node status

#### PuppetReportsListView.svelte (424 lines)

- **Description:** Paginated Puppet reports list with filtering
- **Props:** reports, pagination, onPageChange
- **Backend Endpoints:** None (uses props)

#### PuppetReportsSummary.svelte (201 lines)

- **Description:** Puppet reports summary cards (success, failed, changed)
- **Props:** summary
- **Backend Endpoints:** None

#### ReportViewer.svelte (629 lines)

- **Description:** Detailed Puppet report viewer with metrics
- **Props:** report
- **Backend Endpoints:** None

#### PuppetRunChart.svelte (298 lines)

- **Description:** Puppet run history chart using Chart.js
- **Props:** data, nodeId
- **Backend Endpoints:** None

#### PuppetOutputViewer.svelte (214 lines)

- **Description:** Puppet run output display
- **Props:** output
- **Backend Endpoints:** None

#### EventsViewer.svelte (464 lines)

- **Description:** Puppet events timeline viewer
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/events` - Puppet events

#### CatalogViewer.svelte (378 lines)

- **Description:** Catalog resource viewer with filtering
- **Props:** catalog
- **Backend Endpoints:** None

#### CatalogComparison.svelte (642 lines)

- **Description:** Compare two catalogs side-by-side
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/catalog-comparison` - Catalog comparison

#### ManagedResourcesViewer.svelte (383 lines)

- **Description:** Managed resources list and filter
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/managed-resources` - Resources

#### CodeAnalysisTab.svelte (882 lines)

- **Description:** Code analysis viewer with issue categorization
- **Props:** nodeId
- **Backend Endpoints:**
  1. `GET /api/nodes/:id/code-analysis` - Code analysis

### Admin & Setup Components

#### IntegrationStatus.svelte (1,108 lines)

- **Description:** Integration status grid with health checks
- **Props:** integrations
- **Backend Endpoints:** None

#### BoltSetupGuide.svelte (389 lines)

- **Description:** Bolt setup instructions and configuration
- **Backend Endpoints:** None

#### PuppetdbSetupGuide.svelte (353 lines)

- **Description:** PuppetDB setup guide with examples
- **Backend Endpoints:** None

#### PuppetserverSetupGuide.svelte (508 lines)

- **Description:** Puppetserver setup guide and configuration
- **Backend Endpoints:** None

#### HieraSetupGuide.svelte (606 lines)

- **Description:** Hiera setup guide with examples
- **Backend Endpoints:** None

#### PuppetserverStatus.svelte (348 lines)

- **Description:** Puppetserver status panel with metrics
- **Backend Endpoints:**
  1. `GET /api/integrations/puppetserver/status` - Status

#### PuppetDBAdmin.svelte (237 lines)

- **Description:** PuppetDB admin tools and utilities
- **Backend Endpoints:**
  1. `POST /api/integrations/puppetdb/admin/...` - Admin actions

#### EnvironmentSelector.svelte (422 lines)

- **Description:** Puppetserver environment dropdown selector
- **Backend Endpoints:**
  1. `GET /api/integrations/puppetserver/environments` - Environment list

### Expert Mode & Debug Components

#### ExpertModeDebugPanel.svelte (986 lines)

- **Description:** Debug info display with timeline view
- **Key Features:**
  - Timeline view of frontend/backend logs
  - Collapsible sections
  - Copy button integration
  - Correlation ID tracking
- **Props:** debugInfo, correlationId
- **Backend Endpoints:** None

#### ExpertModeCopyButton.svelte (600 lines)

- **Description:** Copy debug info to clipboard button
- **Key Features:**
  - JSON/text format options
  - Toast feedback
  - Data sanitization
- **Props:** debugInfo, format
- **Backend Endpoints:** None

#### DetailedErrorDisplay.svelte (240 lines)

- **Description:** Enhanced error display with stack traces
- **Props:** error, showStackTrace
- **Backend Endpoints:** None

### Pagination & Filters

#### PaginationControls.svelte (129 lines)

- **Description:** Pagination UI with page size selector
- **Props:** pagination, onPageChange
- **Backend Endpoints:** None

#### ReportFilterPanel.svelte (200 lines)

- **Description:** Puppet report filter form
- **Props:** filters, onFilterChange
- **Backend Endpoints:** None

---

## 📡 Backend Endpoint Summary

### Grouped by Integration

**Bolt (9 endpoints):**

- `GET /api/inventory` - Node inventory with optional PQL
- `GET /api/nodes/:id` - Node details
- `GET /api/nodes/:id/facts` - Node facts
- `POST /api/nodes/:id/command` - Execute command
- `POST /api/nodes/:id/task` - Execute task
- `GET /api/tasks` - List available tasks
- `GET /api/executions` - Execution history
- `GET /api/executions/:id` - Execution details
- `POST /api/executions/:id/cancel` - Cancel execution
- `GET /api/executions/:id/stream` (SSE) - Execution stream

**PuppetDB (6 endpoints):**

- `GET /api/integrations/puppetdb/reports/summary` - Reports summary
- `GET /api/nodes/:id/puppet-reports` - Node reports
- `GET /api/nodes/:id/puppet-reports/:hash` - Report details
- `GET /api/nodes/:id/events` - Puppet events
- `GET /api/nodes/:id/managed-resources` - Managed resources
- `GET /api/nodes/:id/status` - Node status
- `GET /api/facts?pql=X` - Global facts query

**Puppetserver (5 endpoints):**

- `GET /api/integrations/puppetserver/status` - Server status
- `GET /api/integrations/puppetserver/environments` - Environment list
- `GET /api/nodes/:id/catalog` - Compiled catalog
- `GET /api/nodes/:id/catalog-compilation` - Compilation info
- `GET /api/nodes/:id/catalog-comparison` - Catalog comparison

**Hiera (2 endpoints):**

- `GET /api/nodes/:id/hiera` - Node-specific Hiera
- `GET /api/hiera/lookup` - Global Hiera lookup

**Integration Management (2 endpoints):**

- `GET /api/integrations/status` - All integration status
- `GET /api/config/ui` - UI configuration

**Configuration (2 endpoints):**

- `GET /api/config/ui` - UI config with integration colors
- `GET /api/config/command-whitelist` - Command whitelist

**Debug/Logging (1 endpoint):**

- `POST /api/debug/frontend-log` - Send frontend logs

**Other (3 endpoints):**

- `GET /api/puppet/history/:nodeName?days=X` - Run history chart
- `POST /api/nodes/:id/puppet` - Run Puppet
- `POST /api/nodes/:id/package` - Install package

**Total Unique Endpoints:** ~35+

---

## 🔗 Import Relationship Map

### Most Imported Components

1. **LoadingSpinner.svelte** - Used in 13+ files
2. **ErrorAlert.svelte** - Used in 12+ files
3. **IntegrationBadge.svelte** - Used in 10+ files
4. **StatusBadge.svelte** - Used in 9+ files
5. **ExpertModeDebugPanel.svelte** - Used in 7 pages/components

### Most Imported Libraries

1. **api.ts** (get, post) - Used in all 7 pages + 20+ components
2. **router.svelte.ts** - Used in 7 pages + Navigation
3. **expertMode.svelte.ts** - Used in 6 pages + api.ts, logger.ts, executionStream.ts
4. **toast.svelte.ts** - Used in 8+ files
5. **logger.svelte.ts** - Used in 6+ files

### Dependency Graph

```
App.svelte
├── Router.svelte
│   └── All 7 Pages
│       ├── api.ts
│       │   ├── logger.ts
│       │   │   └── expertMode.svelte.ts
│       │   └── expertMode.svelte.ts
│       ├── router.svelte.ts
│       ├── toast.svelte.ts
│       └── Many Components
│           ├── LoadingSpinner.svelte
│           ├── ErrorAlert.svelte
│           ├── IntegrationBadge.svelte
│           └── StatusBadge.svelte
├── Navigation.svelte
│   ├── router.svelte.ts
│   ├── theme.svelte.ts
│   └── expertMode.svelte.ts
├── ErrorBoundary.svelte
└── ToastContainer.svelte
    └── toast.svelte.ts
```

### Component Relationships by Feature

**Execution Feature:**

- ExecutionsPage.svelte
  - ExecutionList.svelte
  - RealtimeOutputViewer.svelte
  - ReExecutionButton.svelte
  - executionStream.svelte.ts
  - api.ts

**Node Detail Feature:**

- NodeDetailPage.svelte
  - FactsViewer.svelte
  - MultiSourceFactsViewer.svelte
  - CommandOutput.svelte
  - TaskRunInterface.svelte
    - TaskParameterForm.svelte
  - PuppetRunInterface.svelte
  - PackageInstallInterface.svelte
  - NodeStatus.svelte
  - CatalogViewer.svelte
  - EventsViewer.svelte
  - ManagedResourcesViewer.svelte
  - NodeHieraTab.svelte

**Puppet Reporting Feature:**

- ReportsPage.svelte
  - EnvironmentSelector.svelte
  - PuppetReportsListView.svelte
  - ReportViewer.svelte
  - PuppetReportsSummary.svelte
  - reportFilters.svelte.ts

**Integration Management:**

- IntegrationsPage.svelte
  - IntegrationStatus.svelte
  - BoltSetupGuide.svelte
  - PuppetdbSetupGuide.svelte
  - PuppetserverSetupGuide.svelte
  - HieraSetupGuide.svelte

---

## 📊 Code Metrics & Complexity

### Largest Files (Top 10)

1. **NodeDetailPage.svelte** - 2,079 lines
2. **IntegrationStatus.svelte** - 1,108 lines
3. **ExpertModeDebugPanel.svelte** - 986 lines
4. **ExecutionsPage.svelte** - 925 lines
5. **CodeAnalysisTab.svelte** - 882 lines
6. **InventoryPage.svelte** - 806 lines
7. **NodeHieraTab.svelte** - 746 lines
8. **api.ts** - 669 lines
9. **HomePage.svelte** - 645 lines
10. **CatalogComparison.svelte** - 642 lines

### Lines by Category

- **State Management:** 6 files, 551 lines (2%)
- **API Communication:** 3 files, 1,557 lines (5%)
- **Utilities:** 4 files, 744 lines (2%)
- **Pages:** 7 files, 5,383 lines (18%)
- **UI Components:** 17 files, ~2,500 lines (8%)
- **Data Display Components:** 15 files, ~5,000 lines (16%)
- **Puppet-specific Components:** 13 files, ~4,500 lines (15%)
- **Expert Mode/Debug:** 3 files, ~1,900 lines (6%)

### Complexity Indicators

**High Complexity Files (>500 lines):**

- NodeDetailPage.svelte (2,079) - Multiple tabs, 15+ endpoints
- IntegrationStatus.svelte (1,108) - Grid layout, health checks
- ExpertModeDebugPanel.svelte (986) - Timeline, log correlation
- ExecutionsPage.svelte (925) - Filtering, streaming, modal
- CodeAnalysisTab.svelte (882) - Issue categorization
- InventoryPage.svelte (806) - Multi-source, PQL queries
- NodeHieraTab.svelte (746) - Hiera lookup
- api.ts (669) - Retry logic, error handling
- HomePage.svelte (645) - Dashboard widgets
- CatalogComparison.svelte (642) - Diff comparison

**Files with Most State Variables:**

- NodeDetailPage.svelte - 30+ state variables
- HomePage.svelte - 19 state variables
- ExecutionsPage.svelte - 14 state variables
- InventoryPage.svelte - 13 state variables

**Files with Most Backend Calls:**

- NodeDetailPage.svelte - 15+ endpoints
- HomePage.svelte - 6 endpoints
- ExecutionsPage.svelte - 5 endpoints

---

## 🎯 Architectural Patterns

### 1. Svelte 5 Runes

All components use Svelte 5's modern reactive syntax:

- `$state()` - Reactive state (used in all components)
- `$derived()` - Computed values (InventoryPage, HomePage)
- `$effect()` - Side effects (ExecutionsPage for URL sync)
- `$props()` - Component props (all components)

### 2. Expert Mode Implementation

- **Global State:** `expertMode.svelte.ts`
- **API Headers:** `X-Expert-Mode`, `X-Correlation-ID`
- **Debug Info Collection:** `logger.ts` with backend sync
- **Frontend Logging:** Structured logs with correlation IDs
- **Real-time Correlation:** Frontend + backend log linking
- **Components:** ExpertModeDebugPanel, ExpertModeCopyButton

### 3. Multi-Source Data Pattern

- **Graceful Degradation:** `multiSourceUtils.ts`
- **Source Attribution:** IntegrationBadge shows data origin
- **Linked Nodes:** Same node across Bolt/PuppetDB
- **Priority Resolution:** Backend handles conflicts
- **Error Handling:** Per-source error isolation

### 4. Real-Time Streaming

- **SSE Client:** `executionStream.svelte.ts`
- **Auto-Reconnect:** Exponential backoff
- **Event Types:** start, stdout, stderr, status, complete, error
- **Components:** RealtimeOutputViewer, ExecutionsPage
- **Correlation:** Correlation IDs link stream to execution

### 5. Error Handling

- **Retry Logic:** `api.ts` with exponential backoff
- **User-Friendly Messages:** Error parsing and guidance
- **Troubleshooting Help:** `getErrorGuidance()`
- **Toast Notifications:** Success/error feedback
- **Error Boundaries:** ErrorBoundary component
- **Detailed Display:** DetailedErrorDisplay with stack traces

### 6. Type Safety

- **TypeScript:** All files use strict TypeScript
- **API Types:** Interfaces for all API responses
- **Generics:** `api.get<T>()`, `api.post<T>()` etc.
- **Svelte Props:** `$props<{...}>()` with types

### 7. Performance Optimizations

- **Debouncing:** Search inputs (300ms)
- **Caching:** Integration colors in memory
- **Pagination:** All large lists paginated
- **Lazy Loading:** Dynamic imports for routes
- **Session Storage:** Persist pagination preferences

---

## 🔧 Refactoring Opportunities

### High Priority

1. **NodeDetailPage.svelte (2,079 lines)**
   - Split into separate files per tab
   - Extract sub-tab logic into dedicated components
   - Consider creating `NodeDetailContext` for shared state
   - Estimated reduction: ~1,500 lines if split into 5 tab files

2. **IntegrationStatus.svelte (1,108 lines)**
   - Extract individual integration cards into components
   - Create `IntegrationCard.svelte` base component
   - Estimated reduction: ~800 lines

3. **api.ts (669 lines)**
   - Split error handling into `errorHandling.ts`
   - Create `retryLogic.ts` for retry strategies
   - Estimated reduction: ~400 lines

### Medium Priority

1. **ExpertModeDebugPanel.svelte (986 lines)**
   - Extract timeline view into separate component
   - Create `DebugInfoSection.svelte` for collapsible sections
   - Estimated reduction: ~600 lines

2. **ExecutionsPage.svelte (925 lines)**
   - Extract modal detail view into `ExecutionDetailModal.svelte`
   - Move filter logic to dedicated component
   - Estimated reduction: ~400 lines

3. **CodeAnalysisTab.svelte (882 lines)**
   - Extract issue categories into separate components
   - Create reusable `IssueList.svelte`
   - Estimated reduction: ~500 lines

### Low Priority

1. **Duplicate Code Patterns**
   - Pagination logic repeated across pages
   - Loading states handled inconsistently
   - Error displays duplicated
   - Consider creating `usePagination()`, `useLoading()`, `useError()` composables

2. **Test Coverage**
   - Only 3 test files found (ExpertModeCopyButton.test.ts, ExpertModeDebugPanel.test.ts, PaginationControls.test.ts)
   - Add tests for api.ts, router.svelte.ts, executionStream.svelte.ts
   - Add component tests for critical paths

---

## 🚀 Performance Recommendations

### Optimization Opportunities

1. **Virtual Scrolling**
   - ExecutionList.svelte for large execution history
   - ManagedResourcesViewer.svelte for many resources
   - EventsViewer.svelte for long event lists

2. **Request Deduplication**
   - Multiple components calling same endpoint simultaneously
   - Implement request cache in api.ts with short TTL

3. **Code Splitting**
   - Lazy load heavy dependencies (Chart.js)
   - Dynamic imports for rarely used components

4. **Memoization**
   - Cache integration colors in localStorage
   - Memoize expensive computations in $derived

5. **Debouncing**
   - Already implemented for search (300ms)
   - Consider for filter changes

---

## 🧪 Testing Priorities

### Critical Path Components

1. **api.ts** - All API communication flows through here
   - Test retry logic with exponential backoff
   - Test error parsing and guidance
   - Test expert mode header injection
   - Test correlation ID generation

2. **executionStream.svelte.ts** - Real-time streaming
   - Test SSE connection/disconnection
   - Test reconnection with backoff
   - Test event parsing and state updates
   - Test error handling

3. **router.svelte.ts** - Navigation
   - Test route matching with dynamic params
   - Test navigation state updates
   - Test 404 handling

4. **multiSourceUtils.ts** - Data aggregation
   - Test multi-source fetching
   - Test error isolation per source
   - Test fact merging by priority

### Component Testing

1. **NodeDetailPage.svelte**
   - Test tab switching
   - Test command execution flow
   - Test fact gathering
   - Test Puppet operations

2. **ExecutionsPage.svelte**
   - Test filtering logic
   - Test pagination
   - Test real-time streaming integration
   - Test modal detail view

3. **InventoryPage.svelte**
   - Test PQL query application
   - Test search debouncing
   - Test sorting
   - Test multi-source aggregation

---

## 📝 Naming Conventions

### File Naming

- **Components:** PascalCase.svelte (e.g., `NodeDetailPage.svelte`)
- **Libraries:** camelCase.ts or camelCase.svelte.ts (e.g., `router.svelte.ts`)
- **Tests:** camelCase.test.ts (e.g., `expertMode.test.ts`)

### Code Conventions

- **State Variables:** camelCase (e.g., `selectedNode`)
- **Functions:** camelCase (e.g., `fetchInventory()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `INTEGRATION_COLORS`)
- **Types/Interfaces:** PascalCase (e.g., `ExecutionResult`)
- **Props:** camelCase with `$props()` (e.g., `$props<{ nodeId: string }>()`)

---

## 📚 Documentation Status

### Well-Documented

- ✅ api.ts - Comprehensive JSDoc comments
- ✅ executionStream.svelte.ts - Usage examples
- ✅ logger.svelte.ts - Configuration docs
- ✅ router.svelte.ts - Route pattern docs

### Needs Documentation

- ❌ Most components lack JSDoc comments
- ❌ Complex state management not documented
- ❌ Expert mode flow needs diagram
- ❌ Multi-source aggregation needs examples

### Example Files

- ✅ RealtimeOutputViewer.example.svelte
- ✅ EnvironmentSelector.example.md
- ✅ executionStream.example.svelte
- ✅ MultiSourceFactsViewer.example.md
- ✅ ExpertModeCopyButton.example.md

---

## 🎨 UI/UX Patterns

### CSS Framework

- **Tailwind CSS** - Utility-first CSS
- **Custom Theme** - Light/dark mode support
- **Integration Colors:**
  - Bolt: Orange (#FFAE1A)
  - PuppetDB: Violet (#9063CD)
  - Puppetserver: Blue (#2E3A87)
  - Hiera: Red (#C1272D)

### Accessibility

- **ARIA Labels:** accessibility.ts utilities
- **Keyboard Navigation:** Focus management, keyboard handlers
- **Screen Reader Support:** Proper semantic HTML
- **Color Contrast:** Meets WCAG AA standards

### Responsive Design

- **Mobile-First:** Tailwind responsive classes
- **Grid/List Toggle:** InventoryPage
- **Collapsible Sections:** Long content areas
- **Modal Dialogs:** ExecutionsPage detail view

---

## 🔐 Security Considerations

### Frontend Security

- **No Hardcoded Secrets:** All config from API
- **Input Validation:** Form validation before submission
- **XSS Prevention:** Svelte's automatic escaping
- **CORS:** Backend handles CORS policy
- **Command Whitelist:** Validated on backend

### Expert Mode Security

- **Correlation IDs:** No sensitive data in IDs
- **Log Obfuscation:** `obfuscateData()` in logger.ts
- **Debug Info Sanitization:** Before copy to clipboard

---

## 📦 External Dependencies

### Runtime Dependencies (from package.json)

- **chart.js** - Charts in PuppetRunChart
- **svelte** - Framework
- **vite** - Build tool

### Dev Dependencies

- **typescript** - Type checking
- **tailwindcss** - CSS framework
- **vitest** - Testing
- **eslint** - Linting
- **postcss** - CSS processing

---

## 🎯 Conclusion

The Pabawi frontend is a well-architected Svelte 5 application with **30,614 lines** of code across **82 files**. Key strengths include:

✅ **Strong Architecture:**

- Plugin-based backend integration
- Multi-source data aggregation
- Real-time streaming with SSE
- Expert mode for debugging
- Comprehensive error handling

✅ **Modern Stack:**

- Svelte 5 with runes
- TypeScript strict mode
- Tailwind CSS
- Vite build system

✅ **Feature-Rich:**

- 35+ backend endpoints
- 5 major integration types
- Real-time execution streaming
- Advanced filtering and search
- PQL query support

⚠️ **Areas for Improvement:**

- Large files need splitting (NodeDetailPage: 2,079 lines)
- Test coverage is minimal
- Documentation needs expansion
- Performance optimizations needed for large datasets

Overall, the codebase is maintainable and follows modern best practices, with clear opportunities for optimization and enhancement.

---

**Report Generated:** January 28, 2026  
**Analysis Tool:** AI Code Analysis Agent  
**Total Analysis Time:** ~15 minutes
