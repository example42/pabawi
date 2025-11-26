# Design Document: PuppetDB Integration and Multi-Tool Architecture

## Overview

This design document outlines the architecture for version 0.2.0 of Padawi, transforming it from a Bolt-specific web interface into a general-purpose remote execution platform. The core architectural shift introduces a plugin-based integration system where PuppetDB serves as the first additional integration beyond Puppet Bolt. This establishes patterns and abstractions that will support future integrations with Ansible, Terraform, AWS CLI, Azure CLI, Kubernetes, and other infrastructure management tools.

The design introduces two key concepts:

- **Execution Tools**: Backend systems that perform actions (Bolt, Ansible, etc.)
- **Information Sources**: Backend systems that provide node data (PuppetDB, cloud APIs, etc.)

PuppetDB integration provides:

- Dynamic inventory discovery
- Node facts from Puppet agent runs
- Puppet run reports with detailed resource changes
- Compiled catalogs showing desired state
- Individual resource events for change tracking

Additionally, this version introduces action re-execution capabilities, allowing users to quickly repeat operations with preserved parameters, and comprehensive UI enhancements to support the multi-tool architecture.

**Expert Mode Enhancement**: A critical priority for this version is enhancing the expert mode experience to provide complete transparency into command execution. When expert mode is enabled, users will see the full command line being executed and complete, untruncated output (stdout/stderr). This visibility is essential for debugging, auditing, and understanding exactly what operations are being performed on managed infrastructure.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Home Page   │  │ Inventory    │  │ Node Detail  │     │
│  │  Dashboard   │  │    Page      │  │    Page      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                  │
│                     API Client Layer                         │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP/REST
┌────────────────────────────┴────────────────────────────────┐
│                    Backend (Node.js/Express)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Integration Manager                      │  │
│  │  ┌────────────────┐      ┌────────────────┐         │  │
│  │  │ Execution Tool │      │ Information    │         │  │
│  │  │   Plugins      │      │ Source Plugins │         │  │
│  │  └────────────────┘      └────────────────┘         │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                           │                      │
│  ┌────────┴────────┐         ┌───────┴────────┐           │
│  │  BoltService    │         │ PuppetDBService │           │
│  │  (Existing)     │         │    (New)        │           │
│  └─────────────────┘         └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Integration Plugin Architecture

The system uses a plugin-based architecture to support multiple backend integrations:

```typescript
interface IntegrationPlugin {
  name: string;
  type: 'execution' | 'information' | 'both';
  initialize(config: IntegrationConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}

interface ExecutionToolPlugin extends IntegrationPlugin {
  type: 'execution' | 'both';
  executeAction(action: Action): Promise<ExecutionResult>;
  listCapabilities(): Capability[];
}

interface InformationSourcePlugin extends IntegrationPlugin {
  type: 'information' | 'both';
  getInventory(): Promise<Node[]>;
  getNodeFacts(nodeId: string): Promise<Facts>;
  getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}
```

## Components and Interfaces

### Backend Components

#### 1. PuppetDBService

Primary service for interacting with PuppetDB API.

```typescript
class PuppetDBService implements InformationSourcePlugin {
  private client: PuppetDBClient;
  private config: PuppetDBConfig;
  private cache: CacheManager;

  constructor(config: PuppetDBConfig, cacheConfig: CacheConfig);
  
  // Plugin interface
  async initialize(config: IntegrationConfig): Promise<void>;
  async healthCheck(): Promise<HealthStatus>;
  
  // Inventory operations
  async getInventory(): Promise<Node[]>;
  async getNode(certname: string): Promise<Node | null>;
  
  // Facts operations
  async getNodeFacts(certname: string): Promise<Facts>;
  async queryFacts(pqlQuery: string): Promise<Facts[]>;
  
  // Reports operations
  async getNodeReports(certname: string, limit?: number): Promise<Report[]>;
  async getReport(reportId: string): Promise<Report | null>;
  
  // Catalog operations
  async getNodeCatalog(certname: string): Promise<Catalog | null>;
  async getCatalogResources(certname: string): Promise<Resource[]>;
  
  // Events operations
  async getNodeEvents(certname: string, filters?: EventFilters): Promise<Event[]>;
  async queryEvents(pqlQuery: string): Promise<Event[]>;
}
```

#### 2. PuppetDBClient

Low-level HTTP client for PuppetDB API communication.

```typescript
class PuppetDBClient {
  private baseUrl: string;
  private token?: string;
  private httpsAgent?: https.Agent;
  
  constructor(config: PuppetDBClientConfig);
  
  async query(endpoint: string, pql?: string, params?: QueryParams): Promise<unknown>;
  async get(path: string): Promise<unknown>;
  
  private buildQueryUrl(endpoint: string, pql?: string, params?: QueryParams): string;
  private handleResponse(response: Response): Promise<unknown>;
  private handleError(error: Error): never;
}
```

#### 3. IntegrationManager

Manages all integration plugins and routes requests to appropriate services.

```typescript
class IntegrationManager {
  private plugins: Map<string, IntegrationPlugin>;
  private executionTools: Map<string, ExecutionToolPlugin>;
  private informationSources: Map<string, InformationSourcePlugin>;
  
  constructor();
  
  async registerPlugin(plugin: IntegrationPlugin): Promise<void>;
  async initializePlugins(): Promise<void>;
  
  getExecutionTool(name: string): ExecutionToolPlugin | null;
  getInformationSource(name: string): InformationSourcePlugin | null;
  
  async getAggregatedInventory(): Promise<AggregatedInventory>;
  async getNodeData(nodeId: string): Promise<AggregatedNodeData>;
  
  async healthCheckAll(): Promise<Map<string, HealthStatus>>;
}
```

#### 4. ExecutionRepository (Enhanced)

Extended to support action re-execution with original execution references.

```typescript
interface ExecutionRecord {
  id: string;
  type: ExecutionType;
  targetNodes: string[];
  action: string;
  parameters?: Record<string, unknown>;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  results: NodeResult[];
  error?: string;
  command?: string;              // Full command line executed
  stdout?: string;               // NEW: Complete stdout output
  stderr?: string;               // NEW: Complete stderr output
  expertMode?: boolean;
  originalExecutionId?: string;  // NEW: Reference to original execution if re-executed
  reExecutionCount?: number;     // NEW: Number of times this has been re-executed
}

class ExecutionRepository {
  // Existing methods...
  
  // NEW: Find original execution for re-execution
  async findOriginalExecution(executionId: string): Promise<ExecutionRecord | null>;
  
  // NEW: Find all re-executions of an execution
  async findReExecutions(originalExecutionId: string): Promise<ExecutionRecord[]>;
  
  // NEW: Create re-execution with reference to original
  async createReExecution(
    originalExecutionId: string,
    execution: Omit<ExecutionRecord, 'id' | 'originalExecutionId'>
  ): Promise<string>;
}
```

### Frontend Components

#### 1. Integration Status Component

Displays connection status for all configured integrations.

```typescript
interface IntegrationStatusProps {
  integrations: IntegrationStatus[];
  onRefresh?: () => void;
}

interface IntegrationStatus {
  name: string;
  type: 'execution' | 'information' | 'both';
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: string;
  error?: string;
}
```

#### 2. Enhanced Node Detail Page

Tabbed interface for viewing data from multiple sources.

```typescript
interface NodeDetailTab {
  id: string;
  label: string;
  source: string;  // 'bolt', 'puppetdb', etc.
  component: Component;
  loadData: () => Promise<unknown>;
}

// Tabs:
// - Overview (combined data from all sources)
// - Facts (Bolt + PuppetDB)
// - Execution History (Bolt)
// - Puppet Reports (PuppetDB)
// - Catalog (PuppetDB)
// - Events (PuppetDB)
```

#### 3. Re-execution Button Component

Reusable component for triggering action re-execution.

```typescript
interface ReExecutionButtonProps {
  execution: ExecutionRecord;
  onReExecute: (execution: ExecutionRecord) => void;
  disabled?: boolean;
}
```

#### 4. PuppetDB Data Viewers

Specialized components for displaying PuppetDB data.

```typescript
// Report Viewer
interface ReportViewerProps {
  report: Report;
  onResourceClick?: (resource: ResourceEvent) => void;
}

// Catalog Viewer
interface CatalogViewerProps {
  catalog: Catalog;
  onResourceClick?: (resource: Resource) => void;
  searchable?: boolean;
}

// Events Viewer
interface EventsViewerProps {
  events: Event[];
  filters?: EventFilters;
  onFilterChange?: (filters: EventFilters) => void;
}
```

#### 5. Expert Mode Command Display Component

Enhanced component for displaying command execution details when expert mode is enabled.

```typescript
interface CommandDisplayProps {
  command: string;
  output?: string;
  stderr?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  expertMode: boolean;
}

// Features:
// - Display full command line with syntax highlighting
// - Show complete stdout/stderr without truncation
// - Preserve formatting, line breaks, and special characters
// - Provide scrolling and search capabilities for long output
// - Use monospace font for technical content
// - Toggle between expert and simplified views
```

## Data Models

### PuppetDB Data Types

```typescript
interface Report {
  certname: string;
  hash: string;
  environment: string;
  status: 'unchanged' | 'changed' | 'failed';
  noop: boolean;
  puppet_version: string;
  report_format: number;
  configuration_version: string;
  start_time: string;
  end_time: string;
  producer_timestamp: string;
  receive_time: string;
  transaction_uuid: string;
  metrics: ReportMetrics;
  logs: LogEntry[];
  resource_events: ResourceEvent[];
}

interface ReportMetrics {
  resources: {
    total: number;
    skipped: number;
    failed: number;
    failed_to_restart: number;
    restarted: number;
    changed: number;
    out_of_sync: number;
    scheduled: number;
  };
  time: {
    [key: string]: number;  // timing metrics
  };
  changes: {
    total: number;
  };
  events: {
    success: number;
    failure: number;
    total: number;
  };
}

interface ResourceEvent {
  resource_type: string;
  resource_title: string;
  property: string;
  timestamp: string;
  status: 'success' | 'failure' | 'noop' | 'skipped';
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
  containment_path: string[];
}

interface Catalog {
  certname: string;
  version: string;
  transaction_uuid: string;
  environment: string;
  producer_timestamp: string;
  hash: string;
  resources: Resource[];
  edges: Edge[];
}

interface Resource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

interface Edge {
  source: ResourceRef;
  target: ResourceRef;
  relationship: 'contains' | 'before' | 'require' | 'subscribe' | 'notify';
}

interface ResourceRef {
  type: string;
  title: string;
}

interface Event {
  certname: string;
  timestamp: string;
  report: string;
  resource_type: string;
  resource_title: string;
  property: string;
  status: 'success' | 'failure' | 'noop' | 'skipped';
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
}

interface EventFilters {
  status?: 'success' | 'failure' | 'noop' | 'skipped';
  resourceType?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}
```

### Configuration Types

```typescript
interface PuppetDBConfig {
  serverUrl: string;
  port?: number;
  token?: string;
  ssl?: {
    enabled: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

interface IntegrationConfig {
  enabled: boolean;
  name: string;
  type: 'execution' | 'information' | 'both';
  config: Record<string, unknown>;
  priority?: number;  // For ordering when multiple sources provide same data
}

interface AppConfig {
  // Existing config...
  integrations: {
    puppetdb?: PuppetDBConfig;
    // Future: ansible, terraform, etc.
  };
}
```

### Aggregated Data Types

```typescript
interface AggregatedInventory {
  nodes: Node[];
  sources: {
    [source: string]: {
      nodeCount: number;
      lastSync: string;
      status: 'healthy' | 'degraded' | 'unavailable';
    };
  };
}

interface AggregatedNodeData {
  node: Node;
  facts: {
    [source: string]: Facts;
  };
  executionHistory: ExecutionRecord[];
  puppetData?: {
    reports: Report[];
    catalog: Catalog | null;
    events: Event[];
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Prework Analysis

1.1 WHEN the system is configured with PuppetDB connection details THEN Padawi SHALL retrieve the list of active nodes from PuppetDB
Thoughts: This is about the system's ability to connect to PuppetDB and retrieve data. We can test this by generating random PuppetDB configurations (valid and invalid), attempting connections, and verifying that valid configs return node lists while invalid ones fail appropriately.
Testable: yes - property

1.2 WHEN PuppetDB returns node data THEN the system SHALL transform it into a normalized inventory format compatible with multiple execution tools
Thoughts: This is about data transformation consistency. We can generate random PuppetDB node responses and verify that the transformation always produces valid normalized inventory format.
Testable: yes - property

1.3 WHEN the inventory page loads THEN the system SHALL display nodes from PuppetDB alongside nodes from other inventory sources with clear source attribution
Thoughts: This is a UI rendering requirement. We can test that the rendered output contains source attribution for each node.
Testable: yes - property

1.4 WHERE PuppetDB is configured as an inventory source THEN the system SHALL support filtering nodes by PuppetDB query language (PQL)
Thoughts: This is about query functionality. We can generate random PQL queries and verify they filter the node list correctly.
Testable: yes - property

1.5 WHEN PuppetDB connection fails THEN the system SHALL display an error message and continue to show nodes from other available inventory sources
Thoughts: This is about error handling and graceful degradation. We can simulate connection failures and verify the system continues functioning with other sources.
Testable: yes - property

2.1 WHEN a user navigates to a node detail page THEN the system SHALL query PuppetDB for the latest facts for that node
Thoughts: This is about ensuring the query happens. We can verify that navigating to a node detail page triggers a PuppetDB query.
Testable: yes - example

2.2 WHEN PuppetDB returns facts THEN the system SHALL display them in a structured, searchable format with clear source attribution
Thoughts: This is about data presentation. We can generate random facts and verify they're displayed with proper structure and source labels.
Testable: yes - property

2.3 WHEN displaying facts THEN the system SHALL organize them by category (system, network, hardware, custom)
Thoughts: This is about categorization logic. We can generate random facts and verify they're correctly categorized.
Testable: yes - property

2.4 WHEN facts are displayed THEN the system SHALL show the timestamp of when the facts were last updated and the source system
Thoughts: This is about metadata display. We can verify that rendered facts include timestamp and source.
Testable: yes - property

2.5 WHEN PuppetDB fact retrieval fails THEN the system SHALL display an error message while preserving other node detail functionality from other sources
Thoughts: This is about error handling. We can simulate fact retrieval failures and verify other functionality continues.
Testable: yes - property

3.1 WHEN a user navigates to a node detail page THEN the system SHALL query PuppetDB for recent Puppet reports for that node
Thoughts: This is about ensuring the query happens. Similar to 2.1.
Testable: yes - example

3.2 WHEN PuppetDB returns reports THEN the system SHALL display them in reverse chronological order alongside other execution history
Thoughts: This is about ordering. We can generate random reports with timestamps and verify they're sorted correctly.
Testable: yes - property

3.3 WHEN displaying a report THEN the system SHALL show the run timestamp, status (success, failure, unchanged), and resource change summary
Thoughts: This is about required fields in display. We can verify rendered reports contain all required fields.
Testable: yes - property

3.4 WHEN a user selects a report THEN the system SHALL display detailed information including changed resources, logs, and metrics
Thoughts: This is about detail view completeness. We can verify that selecting a report shows all required detail sections.
Testable: yes - example

3.5 WHERE reports contain errors THEN the system SHALL highlight failed resources and error messages prominently
Thoughts: This is about error highlighting in UI. We can verify that reports with errors have visual highlighting.
Testable: yes - property

4.1 WHEN a user navigates to a node detail page THEN the system SHALL query PuppetDB for the latest catalog for that node
Thoughts: Similar to 2.1 and 3.1 - ensuring query happens.
Testable: yes - example

4.2 WHEN PuppetDB returns a catalog THEN the system SHALL display the catalog resources in a structured, browsable format
Thoughts: This is about data presentation. We can verify catalogs are displayed with proper structure.
Testable: yes - property

4.3 WHEN displaying catalog resources THEN the system SHALL organize them by resource type with filtering and search capabilities
Thoughts: This is about organization and filtering. We can verify resources are grouped by type and filtering works.
Testable: yes - property

4.4 WHEN a user selects a catalog resource THEN the system SHALL display the resource parameters and relationships
Thoughts: This is about detail view. We can verify selecting a resource shows parameters and relationships.
Testable: yes - example

4.5 WHEN catalog data is displayed THEN the system SHALL show the catalog compilation timestamp and environment
Thoughts: This is about metadata display. We can verify rendered catalogs include timestamp and environment.
Testable: yes - property

5.1 WHEN a user navigates to a node detail page THEN the system SHALL query PuppetDB for recent events for that node
Thoughts: Similar to previous query requirements.
Testable: yes - example

5.2 WHEN PuppetDB returns events THEN the system SHALL display them in reverse chronological order with filtering by event type
Thoughts: This is about ordering and filtering. We can verify events are sorted and filterable.
Testable: yes - property

5.3 WHEN displaying events THEN the system SHALL show the event timestamp, resource, status (success, failure, noop), and message
Thoughts: This is about required fields. We can verify events display all required information.
Testable: yes - property

5.4 WHERE events represent failures THEN the system SHALL highlight them prominently with error details
Thoughts: This is about error highlighting. Similar to 3.5.
Testable: yes - property

5.5 WHEN a user filters events THEN the system SHALL support filtering by status, resource type, and time range
Thoughts: This is about filter functionality. We can verify all filter types work correctly.
Testable: yes - property

6.1 WHEN the system starts THEN Padawi SHALL read PuppetDB connection configuration from environment variables or configuration files
Thoughts: This is about configuration loading. We can verify the system reads config from expected sources.
Testable: yes - example

6.2 WHERE PuppetDB uses HTTPS THEN the system SHALL support SSL certificate validation with options for custom CA certificates
Thoughts: This is about SSL support. We can verify HTTPS connections work with various SSL configurations.
Testable: yes - property

6.3 WHERE PuppetDB requires authentication THEN the system SHALL support token-based authentication
Thoughts: This is about auth support. We can verify token auth works correctly.
Testable: yes - property

6.4 WHEN PuppetDB configuration is invalid THEN the system SHALL log detailed error messages for troubleshooting
Thoughts: This is about error logging. We can verify invalid configs produce appropriate error messages.
Testable: yes - property

6.5 WHEN PuppetDB is not configured THEN the system SHALL operate normally without PuppetDB features enabled
Thoughts: This is about graceful degradation. We can verify the system works without PuppetDB config.
Testable: yes - property

7.1 WHEN viewing an execution in the executions page THEN the system SHALL display a re-execute button for all action types (commands, tasks, plans)
Thoughts: This is about UI element presence. We can verify the button appears for all action types.
Testable: yes - property

7.2 WHEN a user clicks the re-execute button THEN the system SHALL navigate to the appropriate execution interface with all previous parameters pre-filled
Thoughts: This is about navigation and parameter preservation. We can verify clicking re-execute loads the correct interface with correct parameters.
Testable: yes - property

7.3 WHEN re-executing an action THEN the system SHALL preserve the target nodes, action type, and all parameters from the original execution
Thoughts: This is a round-trip property. We can verify that re-executing preserves all original execution data.
Testable: yes - property

7.4 WHEN re-executing an action THEN the system SHALL allow the user to modify any parameters before execution
Thoughts: This is about UI editability. We can verify pre-filled parameters are editable.
Testable: yes - example

7.5 WHEN an action is re-executed THEN the system SHALL create a new execution record with a reference to the original execution
Thoughts: This is about data integrity. We can verify re-executions are linked to originals.
Testable: yes - property

8.1 WHEN viewing a node detail page with execution history THEN the system SHALL display a re-execute button for each action execution
Thoughts: Similar to 7.1 but in different context.
Testable: yes - property

8.2 WHEN a user clicks the re-execute button on a node detail page THEN the system SHALL navigate to the appropriate execution interface with the node and parameters pre-filled
Thoughts: Similar to 7.2 but with node context.
Testable: yes - property

8.3 WHEN re-executing from a node detail page THEN the system SHALL preserve the action type and all parameters
Thoughts: Similar to 7.3.
Testable: yes - property

8.4 WHEN re-executing from a node detail page THEN the system SHALL set the target node to the current node being viewed
Thoughts: This is about context preservation. We can verify the current node is set as target.
Testable: yes - property

9.1 WHEN a user visits the home page THEN the system SHALL display a dashboard with quick access to inventory, executions, and common operations
Thoughts: This is about UI layout. We can verify the dashboard contains required sections.
Testable: yes - example

9.2 WHEN displaying the home page THEN the system SHALL show summary statistics (total nodes, recent executions, success rate) from all integrated sources
Thoughts: This is about data aggregation. We can verify statistics include data from all sources.
Testable: yes - property

9.3 WHEN displaying the home page THEN the system SHALL provide quick action buttons for common operations across different execution tools
Thoughts: This is about UI elements. We can verify quick action buttons are present.
Testable: yes - example

9.4 WHEN displaying the home page THEN the system SHALL show recent execution activity with status indicators and source attribution
Thoughts: This is about data display. We can verify recent activity includes status and source.
Testable: yes - property

9.5 WHERE integration sources are configured THEN the home page SHALL display connection status for each source (PuppetDB, etc.)
Thoughts: This is about status display. We can verify configured sources show status.
Testable: yes - property

10.1 WHEN a user views a node detail page THEN the system SHALL organize information into clearly labeled tabs or sections (Overview, Facts, Execution History, Puppet Reports, Catalog, Events)
Thoughts: This is about UI organization. We can verify all required tabs are present.
Testable: yes - example

10.2 WHEN displaying node information THEN the system SHALL clearly indicate the source of each data type (Bolt, PuppetDB, etc.)
Thoughts: This is about source attribution. We can verify each data section shows its source.
Testable: yes - property

10.3 WHEN switching between tabs THEN the system SHALL preserve the current node context and load data on demand
Thoughts: This is about state management. We can verify tab switching maintains context.
Testable: yes - property

10.4 WHEN displaying node information THEN the system SHALL use consistent styling and layout patterns across all tabs
Thoughts: This is about UI consistency. We can verify styling is consistent.
Testable: yes - property

10.5 WHEN loading node data THEN the system SHALL show loading indicators for each section independently without blocking other sections
Thoughts: This is about async loading. We can verify sections load independently.
Testable: yes - property

11.1 WHEN using the application THEN the system SHALL apply consistent color schemes, typography, and spacing across all pages and integrated tools
Thoughts: This is about UI consistency. We can verify styling is consistent across pages.
Testable: yes - property

11.2 WHEN displaying status information THEN the system SHALL use consistent status badges and icons with clear visual hierarchy
Thoughts: This is about visual consistency. We can verify status indicators are consistent.
Testable: yes - property

11.3 WHEN displaying buttons and interactive elements THEN the system SHALL provide clear hover states, focus indicators, and visual feedback
Thoughts: This is about interaction feedback. We can verify interactive elements have proper states.
Testable: yes - property

11.4 WHEN displaying errors or warnings THEN the system SHALL use consistent alert styling, positioning, and dismissal patterns
Thoughts: This is about error UI consistency. We can verify alerts are consistent.
Testable: yes - property

11.5 WHEN the application loads THEN the system SHALL use consistent loading indicators and skeleton screens for all data sources
Thoughts: This is about loading state consistency. We can verify loading indicators are consistent.
Testable: yes - property

12.1 WHEN the backend starts THEN the system SHALL initialize integration clients (PuppetDB, etc.) using a plugin-based architecture
Thoughts: This is about initialization. We can verify plugins are initialized correctly.
Testable: yes - example

12.2 WHEN querying PuppetDB THEN the system SHALL use the PuppetDB query language (PQL) for efficient data retrieval
Thoughts: This is about query format. We can verify queries use PQL syntax.
Testable: yes - property

12.3 WHEN integration queries fail THEN the system SHALL implement retry logic with exponential backoff and circuit breaker patterns
Thoughts: This is about resilience. We can verify retry logic works correctly.
Testable: yes - property

12.4 WHEN processing integration responses THEN the system SHALL validate and transform data into normalized application formats
Thoughts: This is about data validation. We can verify responses are validated and transformed.
Testable: yes - property

12.5 WHEN integration data is cached THEN the system SHALL implement appropriate cache expiration policies with per-source TTL configuration
Thoughts: This is about caching. We can verify cache expiration works correctly.
Testable: yes - property

13.1 WHEN expert mode is enabled AND a user initiates an execution THEN the system SHALL display the complete command line that will be executed before the execution starts, allowing the user to review it
Thoughts: This is about UI display before execution. We can verify that the command line is shown in the UI when expert mode is enabled.
Testable: yes - property

13.2 WHEN expert mode is enabled AND an execution is in progress THEN the system SHALL keep the command line visible alongside the streaming output
Thoughts: This is about persistent UI display during execution. We can verify the command line remains visible.
Testable: yes - property

13.3 WHEN expert mode is enabled AND an execution completes THEN the system SHALL display the complete command line that was executed including all arguments and options
Thoughts: This is about post-execution display. We can verify the command line is shown after completion.
Testable: yes - property

13.4 WHEN expert mode is enabled AND viewing execution results THEN the system SHALL display the full stdout and stderr output without truncation or summarization
Thoughts: This is about output completeness. We can verify that no truncation occurs by comparing stored output with displayed output.
Testable: yes - property

13.5 WHEN expert mode is enabled AND viewing execution history THEN the system SHALL show the executed command line for each execution record
Thoughts: This is about historical display. We can verify command lines are shown in history views.
Testable: yes - property

13.6 WHEN expert mode is enabled AND viewing node detail execution history THEN the system SHALL display the command line alongside execution results
Thoughts: This is similar to 13.5 but in a different context. Can be combined.
Testable: yes - property

13.7 WHEN expert mode is disabled THEN the system SHALL display summarized output and hide technical command details to maintain a simplified user interface
Thoughts: This is about conditional display. We can verify that command details are hidden when expert mode is off.
Testable: yes - property

13.8 WHEN displaying command output in expert mode THEN the system SHALL preserve formatting, line breaks, and special characters exactly as received
Thoughts: This is about output fidelity. We can verify that formatting is preserved by comparing raw output with displayed output.
Testable: yes - property

13.9 WHEN displaying command lines THEN the system SHALL use monospace font and syntax highlighting to improve readability
Thoughts: This is about styling. We can verify the CSS classes or styles applied to command displays.
Testable: yes - property

13.10 WHEN command output is very long THEN the system SHALL provide scrolling and search capabilities while maintaining the complete output visible
Thoughts: This is about UI functionality for long output. We can verify scrolling and search features are present.
Testable: yes - property

### Property Reflection

After reviewing all properties, the following consolidations and eliminations are recommended:

**Redundancies identified:**

- Properties 2.1, 3.1, 4.1, 5.1, and 6.1 are all "example" properties about ensuring queries happen - these are integration points that should be tested once
- Properties 7.1 and 8.1 are similar (re-execute button display) - can be combined
- Properties 7.2 and 8.2 are similar (navigation with pre-filled parameters) - can be combined
- Properties 7.3 and 8.3 are similar (parameter preservation) - can be combined
- Properties 3.5 and 5.4 are similar (error highlighting) - can be combined into one comprehensive property

**Consolidated properties:**

- Combine query initiation examples into one integration test
- Combine re-execute button properties into context-aware properties
- Combine error highlighting properties
- Properties 13.1, 13.2, 13.3 are similar (command line display at different stages) - can be combined into one property about command line visibility throughout execution lifecycle
- Properties 13.5 and 13.6 are similar (command line in history views) - can be combined

This reduces redundancy while maintaining comprehensive coverage.

### Correctness Properties

Property 1: PuppetDB connection and node retrieval
*For any* valid PuppetDB configuration, connecting to PuppetDB and retrieving nodes should return a non-empty list of nodes or an appropriate error for invalid configurations
**Validates: Requirements 1.1**

Property 2: Node data transformation consistency
*For any* PuppetDB node response, transforming it to normalized inventory format should produce a valid Node object with all required fields
**Validates: Requirements 1.2**

Property 3: Multi-source inventory display
*For any* set of nodes from multiple sources, the inventory display should include source attribution for each node
**Validates: Requirements 1.3**

Property 4: PQL query filtering
*For any* valid PQL query, applying it to the node list should return only nodes matching the query criteria
**Validates: Requirements 1.4**

Property 5: Graceful degradation on connection failure
*For any* inventory source failure, the system should continue displaying nodes from other available sources
**Validates: Requirements 1.5, 2.5**

Property 6: Facts display with metadata
*For any* facts returned from PuppetDB, the display should include source attribution, timestamp, and proper categorization
**Validates: Requirements 2.2, 2.3, 2.4**

Property 7: Chronological ordering
*For any* list of reports or events with timestamps, they should be displayed in reverse chronological order (newest first)
**Validates: Requirements 3.2, 5.2**

Property 8: Required field display
*For any* report, catalog, or event, the display should include all required fields as specified in the requirements
**Validates: Requirements 3.3, 4.5, 5.3**

Property 9: Error highlighting consistency
*For any* data containing errors (reports, events), failed items should be visually highlighted with error details
**Validates: Requirements 3.5, 5.4**

Property 10: Resource organization and filtering
*For any* catalog or event list, resources should be organized by type and support filtering by multiple criteria
**Validates: Requirements 4.3, 5.5**

Property 11: SSL and authentication support
*For any* PuppetDB configuration with HTTPS and token auth, the system should successfully establish secure authenticated connections
**Validates: Requirements 6.2, 6.3**

Property 12: Configuration error handling
*For any* invalid PuppetDB configuration, the system should log detailed error messages and continue operating without PuppetDB features
**Validates: Requirements 6.4, 6.5**

Property 13: Re-execution parameter preservation
*For any* execution record, triggering re-execution should preserve all original parameters (nodes, action, parameters) while allowing modification
**Validates: Requirements 7.2, 7.3, 8.2, 8.3**

Property 14: Re-execution linkage
*For any* re-executed action, the new execution record should contain a reference to the original execution ID
**Validates: Requirements 7.5**

Property 15: Context-aware re-execution
*For any* re-execution triggered from a node detail page, the target node should be set to the currently viewed node
**Validates: Requirements 8.4**

Property 16: Multi-source data aggregation
*For any* home page display, summary statistics should aggregate data from all configured and healthy integration sources
**Validates: Requirements 9.2, 9.4**

Property 17: Integration status display
*For any* configured integration source, the home page should display its current connection status
**Validates: Requirements 9.5**

Property 18: Source attribution consistency
*For any* data displayed in the application, the source system (Bolt, PuppetDB, etc.) should be clearly indicated
**Validates: Requirements 10.2**

Property 19: Independent section loading
*For any* node detail page, each data section should load independently without blocking other sections
**Validates: Requirements 10.5**

Property 20: UI consistency across integrations
*For any* page or component, styling (colors, typography, spacing, status indicators, loading states) should be consistent across all integrated tools
**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

Property 21: PQL query format validation
*For any* PuppetDB query, it should use valid PQL syntax
**Validates: Requirements 12.2**

Property 22: Retry logic with exponential backoff
*For any* failed integration query, the system should retry with exponentially increasing delays up to a maximum number of attempts
**Validates: Requirements 12.3**

Property 23: Response validation and transformation
*For any* integration response, it should be validated against expected schema and transformed to normalized format
**Validates: Requirements 12.4**

Property 24: Cache expiration by source
*For any* cached integration data, it should expire according to the configured TTL for that specific source
**Validates: Requirements 12.5**

Property 25: Command line visibility in expert mode
*For any* execution when expert mode is enabled, the complete command line should be visible before, during, and after execution
**Validates: Requirements 13.1, 13.2, 13.3, 13.5, 13.6**

Property 26: Complete output display in expert mode
*For any* execution when expert mode is enabled, the full stdout and stderr output should be displayed without truncation or summarization
**Validates: Requirements 13.4**

Property 27: Simplified display when expert mode disabled
*For any* execution when expert mode is disabled, command details should be hidden and output should be summarized
**Validates: Requirements 13.7**

Property 28: Output formatting preservation
*For any* command output displayed in expert mode, formatting, line breaks, and special characters should be preserved exactly as received
**Validates: Requirements 13.8**

Property 29: Command display styling
*For any* command line display, monospace font and syntax highlighting should be applied
**Validates: Requirements 13.9**

Property 30: Long output handling
*For any* command output exceeding viewport size, scrolling and search capabilities should be provided while maintaining complete output visibility
**Validates: Requirements 13.10**

## Expert Mode Implementation

### Backend Changes

The backend will be enhanced to capture and store complete execution details:

```typescript
interface ExecutionOutput {
  stdout: string;      // Complete stdout, no truncation
  stderr: string;      // Complete stderr, no truncation
  exitCode: number;
  command: string;     // Full command line with all arguments
}

class BoltService {
  async executeCommand(
    nodes: string[],
    command: string,
    expertMode: boolean
  ): Promise<ExecutionResult> {
    // Capture full command line
    const fullCommand = this.buildBoltCommand(nodes, command);
    
    // Execute and capture all output
    const output = await this.captureFullOutput(fullCommand);
    
    // Store complete output in database
    await this.executionRepository.saveExecution({
      command: fullCommand,
      stdout: output.stdout,  // No truncation
      stderr: output.stderr,  // No truncation
      expertMode,
      // ... other fields
    });
    
    return output;
  }
  
  private async captureFullOutput(command: string): Promise<ExecutionOutput> {
    // Use streaming to capture all output without memory limits
    // Store in database as execution progresses
    // Return complete output
  }
}
```

### Frontend Changes

The frontend will conditionally display execution details based on expert mode:

```typescript
// Expert mode state management
interface ExpertModeState {
  enabled: boolean;
  showCommandLine: boolean;
  showFullOutput: boolean;
  syntaxHighlighting: boolean;
}

// Command display component
function CommandDisplay({ execution, expertMode }: CommandDisplayProps) {
  if (!expertMode) {
    return <SummaryView execution={execution} />;
  }
  
  return (
    <div className="expert-mode-display">
      {/* Command line with syntax highlighting */}
      <CommandLine 
        command={execution.command}
        highlight={true}
        monospace={true}
      />
      
      {/* Full output with search and scroll */}
      <OutputViewer
        stdout={execution.stdout}
        stderr={execution.stderr}
        preserveFormatting={true}
        searchable={true}
        scrollable={true}
      />
    </div>
  );
}
```

### Design Decisions

1. **Storage Strategy**: Store complete stdout/stderr in database without truncation. For very large outputs (>10MB), consider storing in separate blob storage with reference in database.

2. **Streaming Display**: Use streaming to display output as it arrives, maintaining complete history in scrollable buffer.

3. **Search Implementation**: Implement client-side search for command output using browser's native search or custom implementation with highlighting.

4. **Syntax Highlighting**: Use a lightweight syntax highlighting library (e.g., Prism.js or highlight.js) for command lines and shell output.

5. **Performance**: Use virtual scrolling for very long output to maintain UI responsiveness while keeping complete output accessible.

6. **Persistence**: Expert mode preference should be stored per-user and persist across sessions.

## Error Handling

### PuppetDB-Specific Errors

```typescript
class PuppetDBError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = 'PuppetDBError';
  }
}

class PuppetDBConnectionError extends PuppetDBError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETDB_CONNECTION_ERROR', details);
    this.name = 'PuppetDBConnectionError';
  }
}

class PuppetDBQueryError extends PuppetDBError {
  constructor(message: string, public query: string, details?: unknown) {
    super(message, 'PUPPETDB_QUERY_ERROR', details);
    this.name = 'PuppetDBQueryError';
  }
}

class PuppetDBAuthenticationError extends PuppetDBError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETDB_AUTH_ERROR', details);
    this.name = 'PuppetDBAuthenticationError';
  }
}
```

### Error Handling Strategy

1. **Connection Errors**: Retry with exponential backoff, fall back to cached data if available, continue with other sources
2. **Query Errors**: Log detailed error with query, return empty result set, show user-friendly error message
3. **Authentication Errors**: Log error, disable PuppetDB integration, show configuration guidance
4. **Timeout Errors**: Cancel request, use cached data if available, show timeout message
5. **Data Validation Errors**: Log validation failure, skip invalid records, continue processing valid data

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime?: number;
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

## Testing Strategy

### Unit Testing

Unit tests will cover:

- PuppetDBClient HTTP request/response handling
- PuppetDBService data transformation logic
- IntegrationManager plugin registration and routing
- ExecutionRepository re-execution linkage
- Configuration parsing and validation
- Error handling and retry logic
- Circuit breaker state transitions
- Cache expiration logic
- Expert mode command capture and storage
- Output formatting preservation
- Command line display with syntax highlighting

### Property-Based Testing

Property-based tests will use **fast-check** (JavaScript/TypeScript property testing library) to verify the correctness properties defined above. Each property will be implemented as a separate test with a minimum of 100 iterations.

**Configuration:**

```typescript
import fc from 'fast-check';

// Configure fast-check for all property tests
const propertyTestConfig = {
  numRuns: 100,  // Minimum iterations
  verbose: true,
  seed: Date.now(),
};
```

**Test Organization:**

- Property tests will be in `backend/test/properties/` directory
- Each property will have its own test file: `property-{number}.test.ts`
- Each test will be tagged with: `**Feature: puppetdb-integration, Property {number}: {description}**`
- Generators will be in `backend/test/generators/` for reuse

**Example Property Test Structure:**

```typescript
// backend/test/properties/property-02.test.ts
/**
 * Feature: puppetdb-integration, Property 2: Node data transformation consistency
 * Validates: Requirements 1.2
 */

import fc from 'fast-check';
import { transformPuppetDBNode } from '../../src/integrations/puppetdb/transforms';
import { puppetDBNodeArbitrary } from '../generators/puppetdb';

describe('Property 2: Node data transformation consistency', () => {
  it('should transform any PuppetDB node to valid normalized format', () => {
    fc.assert(
      fc.property(puppetDBNodeArbitrary(), (puppetDBNode) => {
        const normalized = transformPuppetDBNode(puppetDBNode);
        
        // Verify all required fields are present
        expect(normalized).toHaveProperty('id');
        expect(normalized).toHaveProperty('name');
        expect(normalized).toHaveProperty('uri');
        expect(normalized).toHaveProperty('transport');
        expect(normalized).toHaveProperty('source', 'puppetdb');
        
        // Verify types
        expect(typeof normalized.id).toBe('string');
        expect(typeof normalized.name).toBe('string');
        expect(typeof normalized.uri).toBe('string');
        expect(['ssh', 'winrm', 'docker', 'local']).toContain(normalized.transport);
      }),
      propertyTestConfig
    );
  });
});
```

### Integration Testing

Integration tests will verify:

- End-to-end PuppetDB API communication
- Multi-source inventory aggregation
- Re-execution workflow from UI to database
- Tab navigation and data loading
- Error handling across integration boundaries

### UI Component Testing

UI tests will verify:

- Component rendering with various data states
- Tab switching and state preservation
- Re-execution button behavior
- Source attribution display
- Loading and error states
- Responsive design

## API Endpoints

### New PuppetDB Endpoints

```
GET    /api/integrations/status
GET    /api/integrations/puppetdb/nodes
GET    /api/integrations/puppetdb/nodes/:certname
GET    /api/integrations/puppetdb/nodes/:certname/facts
GET    /api/integrations/puppetdb/nodes/:certname/reports
GET    /api/integrations/puppetdb/nodes/:certname/reports/:hash
GET    /api/integrations/puppetdb/nodes/:certname/catalog
GET    /api/integrations/puppetdb/nodes/:certname/events
POST   /api/integrations/puppetdb/query
```

### Enhanced Execution Endpoints

```
GET    /api/executions/:id/original          # Get original execution for re-execution
GET    /api/executions/:id/re-executions     # Get all re-executions of an execution
POST   /api/executions/:id/re-execute        # Trigger re-execution
GET    /api/executions/:id/output            # Get complete stdout/stderr for execution
GET    /api/executions/:id/command           # Get full command line for execution
```

**Note**: When expert mode is enabled, execution responses will include `command`, `stdout`, and `stderr` fields. When disabled, these fields will be omitted or summarized.

### Enhanced Inventory Endpoints

```
GET    /api/inventory?sources=bolt,puppetdb  # Get inventory from specific sources
GET    /api/inventory/sources                # Get available inventory sources and status
```

## Configuration

### Environment Variables

```bash
# PuppetDB Configuration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-token-here

# SSL Configuration
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_CERT=/path/to/cert.pem
PUPPETDB_SSL_KEY=/path/to/key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true

# Connection Configuration
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_RETRY_DELAY=1000

# Cache Configuration
PUPPETDB_CACHE_TTL=300000  # 5 minutes

# Circuit Breaker Configuration
PUPPETDB_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETDB_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Expert Mode Configuration
EXPERT_MODE_DEFAULT=false                    # Default expert mode state for new users
EXPERT_MODE_MAX_OUTPUT_SIZE=104857600       # Max output size to store (100MB)
EXPERT_MODE_SYNTAX_HIGHLIGHTING=true        # Enable syntax highlighting for commands
```

### Configuration File

```json
{
  "integrations": {
    "puppetdb": {
      "enabled": true,
      "serverUrl": "https://puppetdb.example.com",
      "port": 8081,
      "token": "${PUPPETDB_TOKEN}",
      "ssl": {
        "enabled": true,
        "ca": "/path/to/ca.pem",
        "cert": "/path/to/cert.pem",
        "key": "/path/to/key.pem",
        "rejectUnauthorized": true
      },
      "timeout": 30000,
      "retryAttempts": 3,
      "retryDelay": 1000,
      "cache": {
        "ttl": 300000
      },
      "circuitBreaker": {
        "threshold": 5,
        "timeout": 60000,
        "resetTimeout": 30000
      }
    }
  },
  "expertMode": {
    "default": false,
    "maxOutputSize": 104857600,
    "syntaxHighlighting": true,
    "preserveFormatting": true
  }
}
```

## Migration Strategy

### Phase 1: Foundation (Week 1)

- Implement plugin architecture and IntegrationManager
- Create PuppetDBClient and PuppetDBService
- Add configuration support
- Implement basic error handling

### Phase 2: Core Integration (Week 2)

- Implement inventory integration
- Implement facts integration
- Add caching and retry logic
- Implement circuit breaker pattern

### Phase 3: Extended Features (Week 3)

- Implement reports integration
- Implement catalog integration
- Implement events integration
- Add PQL query support

### Phase 4: Re-execution (Week 4)

- Enhance ExecutionRepository
- Add re-execution API endpoints
- Implement re-execution UI components
- Add execution linkage

### Phase 5: UI Enhancements (Week 5)

- Implement tabbed node detail page
- Add PuppetDB data viewers
- Enhance home page dashboard
- Add integration status display
- Apply consistent styling
- Implement expert mode command display
- Add output search and scrolling capabilities

### Phase 6: Testing & Polish (Week 6)

- Write property-based tests
- Write integration tests
- Performance optimization
- Documentation
- Bug fixes

## Performance Considerations

1. **Caching Strategy**: Implement multi-level caching (memory + Redis optional) with per-source TTL
2. **Lazy Loading**: Load tab data on demand, not all at once
3. **Pagination**: Implement pagination for reports, events, and catalog resources
4. **Query Optimization**: Use PQL efficiently, request only needed fields
5. **Connection Pooling**: Reuse HTTP connections to PuppetDB
6. **Parallel Requests**: Fetch data from multiple sources in parallel
7. **Debouncing**: Debounce search and filter operations
8. **Virtual Scrolling**: Use virtual scrolling for large lists
9. **Expert Mode Output**: Use streaming and virtual scrolling for large command outputs to prevent memory issues
10. **Output Storage**: For very large outputs (>100MB), consider storing in blob storage with database reference
11. **Syntax Highlighting**: Lazy-load syntax highlighting library only when expert mode is enabled

## Security Considerations

1. **Authentication**: Support token-based auth for PuppetDB
2. **SSL/TLS**: Enforce HTTPS for PuppetDB connections
3. **Certificate Validation**: Validate SSL certificates, support custom CAs
4. **Secrets Management**: Store tokens securely, never log sensitive data
5. **Input Validation**: Validate all PQL queries to prevent injection
6. **Rate Limiting**: Implement rate limiting for PuppetDB API calls
7. **Access Control**: Respect PuppetDB's access control policies
8. **Audit Logging**: Log all PuppetDB queries and configuration changes
9. **Expert Mode Access**: Consider role-based access control for expert mode to restrict visibility of sensitive command details
10. **Output Sanitization**: Sanitize command output in expert mode to prevent XSS attacks when displaying in browser
11. **Command Logging**: Ensure full command lines are logged securely for audit purposes when expert mode is used

## Monitoring and Observability

1. **Health Checks**: Regular health checks for all integrations
2. **Metrics**: Track query latency, error rates, cache hit rates
3. **Logging**: Structured logging with correlation IDs
4. **Alerts**: Alert on integration failures, high error rates
5. **Dashboards**: Grafana dashboards for integration health
6. **Tracing**: Distributed tracing for multi-source requests

## Future Enhancements

1. **Additional Integrations**: Ansible, Terraform, AWS CLI, Azure CLI, Kubernetes
2. **Advanced Querying**: Query builder UI for PQL
3. **Data Correlation**: Correlate data across multiple sources
4. **Scheduled Actions**: Schedule recurring executions
5. **Webhooks**: Trigger actions based on PuppetDB events
6. **Custom Dashboards**: User-configurable dashboards
7. **Export/Import**: Export execution history and configurations
8. **Multi-tenancy**: Support multiple PuppetDB instances
