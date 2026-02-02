# Design Document: Pabawi v1.0.0 Plugin Architecture

## Overview

This design document describes the architecture for Pabawi v1.0.0, implementing a comprehensive modular plugin system. The architecture enables dynamic UI generation based on plugin capabilities, a unified Node Journal for tracking all node activities, standardized integration types, and a powerful debug mode for troubleshooting.

The design follows a capability-based approach where plugins declare what they can do, and the system automatically wires up the UI, API routes, and RBAC permissions. Native plugins (Bolt, PuppetDB, Puppetserver, Hiera) serve as reference implementations for external plugin development.

### Key Design Principles

1. **Capability-Driven**: Plugins declare capabilities; the system handles routing, permissions, and UI
2. **Dynamic UI Generation**: Pages and widgets are generated based on registered capabilities
3. **Unified Data Model**: Node Journal aggregates events from all plugins into a single timeline
4. **Standardized Interfaces**: Common patterns for Inventory, RemoteExecution, and Events
5. **Debug-First**: Comprehensive debugging support built into the architecture

### Migration Approach

**IMPORTANT: Codebase Migration Strategy**

The current codebase contains both v1.x and legacy 0.x code. The migration follows these rules:

#### Use and Adapt (v1.x Code)

- **Current v1.x infrastructure is already implemented** and should be used as the foundation
- Adapt existing v1.x code to add missing features (Node Journal, Events, etc.)
- Move plugin files to the new directory structure (`backend/src/plugins/native/`)
- The v1.x `CapabilityRegistry`, `BasePluginInterface`, and plugin implementations (BoltPlugin, PuppetDBPlugin, etc.) are the starting point

#### Reference Only (0.x Code)

- **Do NOT reuse legacy 0.x code directly** - it will be removed
- Use 0.x code as a **working reference** for:
  - API endpoints and data structures that need to be recreated in v1.x
  - Widget functionality that needs to be reimplemented
  - Integration behavior that currently works and must be preserved
- The 0.x routes, services, and widgets serve as documentation of expected behavior
- Recreate the functionality using v1.x patterns and interfaces

#### What Gets Removed

- All legacy interfaces: `ExecutionToolPlugin`, `InformationSourcePlugin`, `IntegrationPlugin`
- All unversioned routes (e.g., `/api/inventory`, `/api/nodes/:id/facts`)
- Legacy `IntegrationManager` methods for type-based plugin access
- Old widget implementations that don't follow the v1.x widget system

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Svelte)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  HomePage    │  IntegrationHomePage  │  NodeDetailPage  │  DebugPanel       │
│  (widgets)   │  (auto-generated tabs)│  (plugin tabs)   │  (API/tool logs)  │
├─────────────────────────────────────────────────────────────────────────────┤
│                           Widget Slot System                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │home-    │ │dashboard│ │node-    │ │sidebar  │ │node-    │               │
│  │summary  │ │         │ │detail   │ │         │ │journal  │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Layer (/api/v1/)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  /plugins     │  /capabilities  │  /nodes      │  /events    │  /journal   │
│  /widgets     │  /execute       │  /inventory  │  /health    │  /debug     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend Core Services                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  CapabilityRegistry  │  PluginLoader  │  NodeJournalService  │  DebugService│
│  InventoryAggregator │  EventBus      │  AuthService (RBAC)  │  HealthCheck │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Plugin Layer                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Native Plugins                                 │   │
│  │  ┌─────────┐  ┌───────────┐  ┌──────────────┐  ┌─────────┐          │   │
│  │  │  Bolt   │  │ PuppetDB  │  │ Puppetserver │  │  Hiera  │          │   │
│  │  └─────────┘  └───────────┘  └──────────────┘  └─────────┘          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       External Plugins                                │   │
│  │  (Future: Ansible, Terraform, AWS, Icinga, etc.)                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Layer                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  nodes  │  journal_entries  │  events  │  users  │  roles  │  permissions  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Plugin Directory Structure

```
plugins/                             # Plugin root at project level
├── native/                          # Native plugins shipped with Pabawi
│   ├── bolt/
│   │   ├── plugin.json              # Plugin manifest
│   │   ├── backend/
│   │   │   ├── BoltPlugin.ts        # Main plugin class
│   │   │   ├── capabilities/        # Capability handlers
│   │   │   │   ├── command.ts
│   │   │   │   ├── task.ts
│   │   │   │   ├── inventory.ts
│   │   │   │   └── facts.ts
│   │   │   └── services/            # Internal services
│   │   │       └── BoltService.ts
│   │   ├── frontend/                # Frontend widget components
│   │   │   ├── HomeWidget.svelte
│   │   │   ├── CommandExecutor.svelte
│   │   │   ├── TaskRunner.svelte
│   │   │   └── InventoryViewer.svelte
│   │   ├── cli/                     # CLI command definitions
│   │   │   └── commands.ts
│   │   ├── config/                  # Default configuration
│   │   │   └── defaults.yaml
│   │   └── README.md
│   ├── puppetdb/
│   │   ├── plugin.json
│   │   ├── backend/
│   │   ├── frontend/
│   │   ├── cli/
│   │   └── README.md
│   ├── puppetserver/
│   │   ├── plugin.json
│   │   ├── backend/
│   │   ├── frontend/
│   │   ├── cli/
│   │   └── README.md
│   └── hiera/
│       ├── plugin.json
│       ├── backend/
│       ├── frontend/
│       ├── cli/
│       └── README.md
├── external/                        # External plugins (loaded dynamically)
│   └── .gitkeep
└── README.md                        # Plugin development guide
```

## Components and Interfaces

### Core Interfaces

#### BasePluginInterface (Enhanced)

```typescript
interface BasePluginInterface {
  // Metadata
  metadata: PluginMetadata;
  
  // Capabilities this plugin provides
  capabilities: PluginCapability[];
  
  // Frontend widgets
  widgets: PluginWidget[];
  
  // CLI commands
  cliCommands?: PluginCLICommand[];
  
  // Configuration schema (Zod)
  configSchema?: ZodSchema;
  
  // Default RBAC permissions
  defaultPermissions?: Record<string, string[]>;
  
  // Lifecycle methods
  initialize(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  shutdown?(): Promise<void>;
  
  // Configuration
  getConfig(): Record<string, unknown>;
  isInitialized(): boolean;
}
```

#### PluginMetadata (Enhanced)

```typescript
interface PluginMetadata {
  name: string;                      // Unique plugin identifier
  version: string;                   // Semantic version
  author: string;
  description: string;
  integrationType: IntegrationType;  // Primary integration type
  integrationTypes?: IntegrationType[]; // Additional types
  homepage?: string;
  color: string;                     // Hex color for UI theming
  icon: string;                      // Icon name
  tags: string[];
  minPabawiVersion?: string;
  dependencies?: string[];           // Other plugins this depends on
}
```

#### IntegrationType (Extended)

```typescript
enum IntegrationType {
  Inventory = "Inventory",
  RemoteExecution = "RemoteExecution",
  Info = "Info",
  ConfigurationManagement = "ConfigurationManagement",
  Events = "Events",
  Monitoring = "Monitoring",
  Provisioning = "Provisioning",
  Deployment = "Deployment",
  SecretManagement = "SecretManagement", //pragma: allowlist secret
}
```

### Node Journal System

#### JournalEntry Interface

```typescript
interface JournalEntry {
  id: string;                        // Unique entry ID
  nodeId: string;                    // Node this entry belongs to
  timestamp: string;                 // ISO 8601 timestamp
  type: JournalEntryType;            // Entry type
  source: {
    plugin: string;                  // Plugin that created this entry
    capability?: string;             // Capability that triggered it
    color: string;                   // Plugin color for UI
  };
  title: string;                     // Short title
  description?: string;              // Detailed description
  severity?: 'info' | 'warning' | 'error' | 'critical';
  user?: {                           // User who triggered (if applicable)
    id: string;
    username: string;
  };
  metadata?: Record<string, unknown>; // Plugin-specific data
  relatedEntries?: string[];         // IDs of related entries
}

type JournalEntryType = 
  | 'event'        // Something happened (alert, change)
  | 'action'       // User-initiated action (command, task)
  | 'provisioning' // Node lifecycle (created, decommissioned)
  | 'installation' // Software installed/removed
  | 'deployment'   // Deployment activity
  | 'note'         // Manual user note
  | 'alert';       // Monitoring alert
```

#### NodeJournalService

```typescript
interface NodeJournalService {
  // Create a new journal entry
  createEntry(entry: Omit<JournalEntry, 'id'>): Promise<JournalEntry>;
  
  // Get entries for a node
  getNodeEntries(nodeId: string, options?: JournalQueryOptions): Promise<JournalEntry[]>;
  
  // Get a specific entry
  getEntry(entryId: string): Promise<JournalEntry | null>;
  
  // Query entries across all nodes
  queryEntries(options: JournalQueryOptions): Promise<JournalEntry[]>;
  
  // Subscribe to new entries (for real-time updates)
  subscribe(nodeId: string, callback: (entry: JournalEntry) => void): () => void;
}

interface JournalQueryOptions {
  nodeId?: string;
  types?: JournalEntryType[];
  plugins?: string[];
  severity?: string[];
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'severity';
  orderDirection?: 'asc' | 'desc';
}
```

### Inventory Aggregation System

#### InventoryAggregator

```typescript
interface InventoryAggregator {
  // Get unified inventory from all sources
  getUnifiedInventory(): Promise<UnifiedNode[]>;
  
  // Get a specific node with data from all sources
  getNode(nodeId: string): Promise<UnifiedNode | null>;
  
  // Correlate nodes across plugins
  correlateNodes(): Promise<NodeCorrelation[]>;
  
  // Register an inventory source
  registerSource(pluginName: string, capability: string): void;
}

interface UnifiedNode {
  id: string;                        // Primary identifier
  identifiers: {                     // All known identifiers
    hostname?: string;
    fqdn?: string;
    certname?: string;
    ipAddresses?: string[];
    customIds?: Record<string, string>;
  };
  sources: NodeSource[];             // Data from each plugin
  mergedData: {                      // Consolidated data
    os?: { family: string; name: string; version: string };
    hardware?: { cpu: string; memory: string };
    network?: { interfaces: NetworkInterface[] };
    status?: 'active' | 'inactive' | 'unknown';
    lastSeen?: string;
  };
  conflicts?: DataConflict[];        // Fields with conflicting values
}

interface NodeSource {
  plugin: string;
  capability: string;
  lastUpdated: string;
  data: Record<string, unknown>;
  priority: number;                  // For conflict resolution
}
```

### Debug System

#### DebugService

```typescript
interface DebugService {
  // Check if debug mode is enabled
  isEnabled(): boolean;
  
  // Enable/disable debug mode
  setEnabled(enabled: boolean): void;
  
  // Log an API request
  logRequest(request: DebugRequest): void;
  
  // Log a capability execution
  logCapabilityExecution(execution: DebugCapabilityExecution): void;
  
  // Log tool output
  logToolOutput(output: DebugToolOutput): void;
  
  // Get debug logs
  getLogs(options?: DebugLogOptions): DebugLogEntry[];
  
  // Clear logs
  clearLogs(): void;
  
  // Subscribe to new logs (for real-time updates)
  subscribe(callback: (entry: DebugLogEntry) => void): () => void;
}

interface DebugLogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'capability' | 'tool_output' | 'error';
  correlationId: string;
  data: DebugRequest | DebugResponse | DebugCapabilityExecution | DebugToolOutput | DebugError;
}

interface DebugCapabilityExecution {
  capability: string;
  plugin: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration: number;
  toolOutput?: string;               // Raw output from underlying tool
}

interface DebugToolOutput {
  tool: string;                      // e.g., 'bolt', 'puppetdb-api'
  command?: string;                  // Command executed (if applicable)
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  rawResponse?: unknown;             // Raw API response
}
```

### Widget System

#### WidgetSlot (Extended)

```typescript
type WidgetSlot =
  | 'home-summary'      // Home page integration tiles
  | 'dashboard'         // Dashboard widgets
  | 'node-detail'       // Node detail page widgets
  | 'node-journal'      // Node journal timeline
  | 'inventory-panel'   // Inventory list panel
  | 'standalone-page'   // Full-page widgets
  | 'sidebar'           // Sidebar widgets
  | 'modal';            // Modal dialogs
```

#### PluginWidget (Enhanced)

```typescript
interface PluginWidget {
  id: string;                        // Unique widget ID
  name: string;                      // Display name
  component: string;                 // Path to Svelte component
  slots: WidgetSlot[];               // Where this widget can render
  size: 'small' | 'medium' | 'large' | 'full';
  requiredCapabilities: string[];    // Capabilities needed
  icon?: string;
  priority?: number;                 // Ordering within slot
  config?: Record<string, unknown>;  // Widget-specific config
  
  // New fields for v1.0
  category?: string;                 // For tab grouping
  nodeScoped?: boolean;              // Requires node context
  refreshInterval?: number;          // Auto-refresh in ms
}
```

### API Routes Structure

```typescript
// /api/v1/plugins
GET  /api/v1/plugins                 // List all plugins
GET  /api/v1/plugins/:name           // Get plugin details
GET  /api/v1/plugins/:name/capabilities  // Get plugin capabilities
GET  /api/v1/plugins/:name/widgets   // Get plugin widgets
GET  /api/v1/plugins/:name/health    // Get plugin health

// /api/v1/capabilities
GET  /api/v1/capabilities            // List all capabilities
GET  /api/v1/capabilities/:name      // Get capability details
POST /api/v1/capabilities/:name/execute  // Execute capability

// /api/v1/nodes
GET  /api/v1/nodes                   // List unified inventory
GET  /api/v1/nodes/:id               // Get node details
GET  /api/v1/nodes/:id/journal       // Get node journal
POST /api/v1/nodes/:id/journal       // Add journal entry (note)
GET  /api/v1/nodes/:id/sources       // Get node data sources

// /api/v1/events
GET  /api/v1/events                  // List all events
GET  /api/v1/nodes/:id/events        // Get node events

// /api/v1/widgets
GET  /api/v1/widgets                 // List all widgets
GET  /api/v1/widgets/slot/:slot      // Get widgets for slot

// /api/v1/debug
GET  /api/v1/debug/logs              // Get debug logs
DELETE /api/v1/debug/logs            // Clear debug logs
GET  /api/v1/debug/status            // Get debug mode status
POST /api/v1/debug/toggle            // Toggle debug mode
```

## Data Models

### Database Schema

```sql
-- Unified nodes table (aggregated from all sources)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  hostname TEXT,
  fqdn TEXT,
  certname TEXT,
  ip_addresses TEXT,                 -- JSON array
  status TEXT DEFAULT 'unknown',
  last_seen TEXT,
  merged_data TEXT,                  -- JSON object
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Node sources (data from each plugin)
CREATE TABLE node_sources (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  plugin TEXT NOT NULL,
  capability TEXT NOT NULL,
  data TEXT NOT NULL,                -- JSON object
  priority INTEGER DEFAULT 10,
  last_updated TEXT,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(node_id, plugin, capability)
);

-- Journal entries
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  plugin TEXT NOT NULL,
  capability TEXT,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'info',
  user_id TEXT,
  username TEXT,
  metadata TEXT,                     -- JSON object
  related_entries TEXT,              -- JSON array of IDs
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Events (from plugins)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  timestamp TEXT NOT NULL,
  plugin TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata TEXT,                     -- JSON object
  journal_entry_id TEXT,             -- Link to journal
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL
);

-- Debug logs (session-based, can be in-memory or persisted)
CREATE TABLE debug_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  correlation_id TEXT,
  data TEXT NOT NULL,                -- JSON object
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_journal_node_id ON journal_entries(node_id);
CREATE INDEX idx_journal_timestamp ON journal_entries(timestamp);
CREATE INDEX idx_journal_type ON journal_entries(type);
CREATE INDEX idx_journal_plugin ON journal_entries(plugin);
CREATE INDEX idx_events_node_id ON events(node_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_node_sources_node_id ON node_sources(node_id);
CREATE INDEX idx_debug_logs_session ON debug_logs(session_id);
CREATE INDEX idx_debug_logs_correlation ON debug_logs(correlation_id);
```

### TypeScript Data Models

```typescript
// Node model
interface Node {
  id: string;
  hostname?: string;
  fqdn?: string;
  certname?: string;
  ipAddresses: string[];
  status: 'active' | 'inactive' | 'unknown';
  lastSeen?: string;
  mergedData: MergedNodeData;
  createdAt: string;
  updatedAt: string;
}

interface MergedNodeData {
  os?: {
    family: string;
    name: string;
    version: string;
    architecture?: string;
  };
  hardware?: {
    processors: number;
    memory: string;
    disk?: string;
  };
  puppet?: {
    environment?: string;
    lastRun?: string;
    lastRunStatus?: string;
  };
  bolt?: {
    transport?: string;
    lastExecution?: string;
  };
}

// Event model
interface Event {
  id: string;
  nodeId?: string;
  timestamp: string;
  plugin: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  journalEntryId?: string;
  createdAt: string;
}
```

## Error Handling

### Error Categories

```typescript
enum ErrorCategory {
  PLUGIN_ERROR = 'PLUGIN_ERROR',           // Plugin-specific errors
  CAPABILITY_ERROR = 'CAPABILITY_ERROR',   // Capability execution errors
  PERMISSION_ERROR = 'PERMISSION_ERROR',   // RBAC permission denied
  VALIDATION_ERROR = 'VALIDATION_ERROR',   // Input validation errors
  NOT_FOUND = 'NOT_FOUND',                 // Resource not found
  HEALTH_ERROR = 'HEALTH_ERROR',           // Plugin health issues
  TOOL_ERROR = 'TOOL_ERROR',               // Underlying tool errors
}

interface PabawiError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  plugin?: string;
  capability?: string;
  toolOutput?: string;                     // Raw tool error output
  stack?: string;
}
```

### Error Handling Strategy

1. **Plugin Errors**: Caught at capability execution, logged to debug, returned with context
2. **Tool Errors**: Raw output captured and included in debug logs
3. **Permission Errors**: Clear message about required permissions
4. **Health Errors**: Graceful degradation with partial functionality

## Testing Strategy

### Unit Testing

- Test each capability handler in isolation
- Mock underlying services (BoltService, PuppetDBService, etc.)
- Test RBAC permission checks
- Test widget registration and slot queries

### Integration Testing

- Test plugin lifecycle (initialize, healthCheck, shutdown)
- Test capability execution through CapabilityRegistry
- Test Node Journal entry creation from capability execution
- Test inventory aggregation from multiple sources

### Property-Based Testing

- Test inventory correlation with various node identifier combinations
- Test journal entry filtering with various query options
- Test debug log filtering and pagination

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the acceptance criteria analysis, the following correctness properties have been identified for property-based testing:

### Property 1: Widget Rendering Correctness

*For any* set of enabled plugins with widgets registered for a given slot, the WidgetSlot component SHALL render exactly those widgets, each displaying with its plugin's configured color and containing the required information (name, health status, metrics).

**Validates: Requirements 1.1, 1.2, 1.3, 1.5**

### Property 2: Tab Generation from Capabilities

*For any* plugin with registered capabilities, the IntegrationHomePage SHALL generate exactly one tab per unique capability category, where each tab contains all capabilities belonging to that category.

**Validates: Requirements 2.2, 2.3, 7.1, 7.2**

### Property 3: RBAC Permission Filtering

*For any* user with a given set of permissions and any set of capabilities/widgets, the system SHALL return only those capabilities/widgets for which the user has at least one of the required permissions, and SHALL hide tabs where the user lacks permission for all capabilities in that category.

**Validates: Requirements 2.6, 6.4, 7.3**

### Property 4: Automatic Journal Entry Creation

*For any* RemoteExecution capability invocation targeting N nodes, the system SHALL create exactly N journal entries (one per target node), and *for any* Event reported by a plugin, the system SHALL create exactly one corresponding journal entry for the affected node.

**Validates: Requirements 3.4, 3.5, 4.7, 11.4**

### Property 5: Inventory Node Consolidation

*For any* set of inventory sources reporting nodes, when multiple sources report nodes with matching identifiers (hostname, FQDN, IP, certname), the system SHALL merge them into a single unified node record with a `sources` field listing all contributing plugins.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

### Property 6: Debug Information Capture

*For any* API request when debug mode is enabled, the DebugPanel SHALL capture and display: URL, method, headers, request body, response status, response body, timing, and (for capability executions) the raw tool output.

**Validates: Requirements 16.2, 16.3, 16.4, 16.5**

### Property 7: Widget Priority Sorting

*For any* slot query returning multiple widgets, the widgets SHALL be sorted by priority in descending order (highest priority first).

**Validates: Requirements 6.3**

### Property 8: Journal Entry Filtering

*For any* journal query with filter criteria (entry type, source plugin, date range, user), the returned entries SHALL match all specified filter criteria, and entries not matching any criterion SHALL be excluded.

**Validates: Requirements 3.8**

### Property 9: Event-to-Journal Linking

*For any* event created by a plugin, there SHALL exist a corresponding journal entry with matching timestamp, source plugin, and node, and the event SHALL contain a reference to its journal entry ID.

**Validates: Requirements 4.7**

### Property 10: API Versioning Compliance

*For any* registered API route in the v1.0.0 system, the route path SHALL begin with `/api/v1/`, and no unversioned routes (matching legacy patterns) SHALL exist.

**Validates: Requirements 4.1, 4.3**

### Property 11: Widget Registration Validation

*For any* widget registered by a plugin, all capabilities listed in `requiredCapabilities` SHALL also be registered by the same plugin, and registration SHALL fail if any required capability is missing.

**Validates: Requirements 6.2**

### Property 12: Plugin Health State Display

*For any* plugin with a health check result, the UI SHALL display a health indicator matching the health state: green for healthy, yellow for degraded, red for unhealthy.

**Validates: Requirements 9.1, 9.2**

### Property 13: Node Detail Tab Generation

*For any* set of plugins providing `node-detail` slot widgets, the NodeDetailPage SHALL generate exactly one tab per plugin, grouping all widgets from that plugin under its tab.

**Validates: Requirements 3.2, 3.3**

### Property 14: Capability Category Label Transformation

*For any* capability category string, the tab label SHALL be the category with the first letter capitalized (e.g., "command" → "Commands", "info" → "Info").

**Validates: Requirements 7.4**

### Property 15: Debug Response Metadata

*For any* API response when debug mode is enabled, the response SHALL include a `_debug` field containing: correlation ID, execution time, capability name (if applicable), plugin name (if applicable), and raw tool output (if applicable).

**Validates: Requirements 16.8, 16.9**
