# Design Document: Version 0.3.0 - Bug Fixes and Plugin Architecture Completion

## Overview

This design document outlines the fixes and architectural improvements for version 0.3.0 of Pabawi. This is a **stabilization release** focused on fixing critical bugs and completing the plugin architecture migration for all integrations.

### Current State Problems

The current implementation has several critical issues:

1. **Inconsistent Architecture**: Bolt uses legacy 0.1.0 patterns while PuppetDB and Puppetserver use the plugin architecture
2. **Broken API Implementations**: Multiple API calls fail due to incorrect endpoints, authentication, or response parsing
3. **UI Integration Issues**: Frontend components don't properly handle backend responses
4. **Missing Data**: Inventory, certificates, facts, reports, catalogs, and events don't display correctly

### Version 0.3.0 Goals

1. **Complete Plugin Migration**: Migrate Bolt to use the plugin architecture consistently
2. **Fix API Implementations**: Correct all PuppetDB and Puppetserver API calls
3. **Fix UI Integration**: Ensure UI components properly call and handle backend responses
4. **Improve Observability**: Add comprehensive logging for debugging

### Key Principles

- **Fix First, Feature Later**: Focus on making existing functionality work before adding new features
- **Consistent Architecture**: All integrations follow the same plugin pattern
- **Comprehensive Logging**: Every API call is logged for debugging
- **Graceful Degradation**: Failures in one integration don't break others

## Architecture

### High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Inventory   │  │ Node Detail  │  │ Certificate  │     │
│  │    Page      │  │    Page      │  │  Management  │     │
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
│  │  │  - Bolt        │      │  - PuppetDB    │         │  │
│  │  │                │      │  - Puppetserver│         │  │
│  │  └────────────────┘      └────────────────┘         │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                           │                      │
│  ┌────────┴────────┐         ┌───────┴────────┐           │
│  │  BoltService    │         │ PuppetDBService │           │
│  │  (Existing)     │         │ (Existing)      │           │
│  └─────────────────┘         │                 │           │
│                               │ PuppetserverService         │
│                               │    (New)        │           │
│                               └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                                      │
                              ┌───────┴────────┐
                              │  Puppetserver  │
                              │   REST API     │
                              └────────────────┘
```

### Plugin Architecture Integration

The Puppetserver integration implements the `InformationSourcePlugin` interface:

```typescript
class PuppetserverService implements InformationSourcePlugin {
  name = 'puppetserver';
  type = 'information';
  
  // Plugin interface methods
  async initialize(config: IntegrationConfig): Promise<void>;
  async healthCheck(): Promise<HealthStatus>;
  
  // Information source methods
  async getInventory(): Promise<Node[]>;
  async getNodeFacts(nodeId: string): Promise<Facts>;
  async getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}
```

### Node Linking Strategy

When nodes exist in multiple sources (Puppetserver CA and PuppetDB), they are linked based on matching certname/hostname:

```text
Puppetserver CA Node (certname: "web01.example.com")
         │
         │ Link by certname/hostname match
         ↓
PuppetDB Node (certname: "web01.example.com")
         │
         ↓
Unified Node View (aggregated data from both sources)
```

## Components and Interfaces

### Backend Components

#### 1. PuppetserverService

Primary service for interacting with Puppetserver API.

```typescript
class PuppetserverService extends BasePlugin implements InformationSourcePlugin {
  private client: PuppetserverClient;
  private config: PuppetserverConfig;
  private cache: CacheManager;
  private circuitBreaker: CircuitBreaker;

  constructor(config: PuppetserverConfig, cacheConfig: CacheConfig);
  
  // Plugin interface
  async initialize(config: IntegrationConfig): Promise<void>;
  async healthCheck(): Promise<HealthStatus>;
  
  // Inventory operations
  async getInventory(): Promise<Node[]>;
  async getNode(certname: string): Promise<Node | null>;
  
  // Certificate operations
  async listCertificates(status?: CertificateStatus): Promise<Certificate[]>;
  async getCertificate(certname: string): Promise<Certificate | null>;
  async signCertificate(certname: string): Promise<void>;
  async revokeCertificate(certname: string): Promise<void>;
  async bulkSignCertificates(certnames: string[]): Promise<BulkOperationResult>;
  async bulkRevokeCertificates(certnames: string[]): Promise<BulkOperationResult>;
  
  // Node status operations
  async getNodeStatus(certname: string): Promise<NodeStatus>;
  async listNodeStatuses(): Promise<NodeStatus[]>;
  
  // Catalog operations
  async compileCatalog(certname: string, environment: string): Promise<Catalog>;
  async compareCatalogs(
    certname: string,
    environment1: string,
    environment2: string
  ): Promise<CatalogDiff>;
  
  // Facts operations
  async getNodeFacts(certname: string): Promise<Facts>;
  
  // Environment operations
  async listEnvironments(): Promise<Environment[]>;
  async getEnvironment(name: string): Promise<Environment | null>;
  async deployEnvironment(name: string): Promise<DeploymentResult>;
  
  // Generic data retrieval
  async getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}
```

#### 2. PuppetserverClient

Low-level HTTP client for Puppetserver API communication.

```typescript
class PuppetserverClient {
  private baseUrl: string;
  private token?: string;
  private cert?: string;
  private key?: string;
  private ca?: string;
  private httpsAgent?: https.Agent;
  
  constructor(config: PuppetserverClientConfig);
  
  // Certificate API
  async getCertificates(state?: 'signed' | 'requested' | 'revoked'): Promise<unknown>;
  async getCertificate(certname: string): Promise<unknown>;
  async signCertificate(certname: string): Promise<unknown>;
  async revokeCertificate(certname: string): Promise<unknown>;
  
  // Status API
  async getStatus(certname: string): Promise<unknown>;
  
  // Catalog API
  async compileCatalog(certname: string, environment: string): Promise<unknown>;
  
  // Facts API
  async getFacts(certname: string): Promise<unknown>;
  
  // Environment API
  async getEnvironments(): Promise<unknown>;
  async getEnvironment(name: string): Promise<unknown>;
  async deployEnvironment(name: string): Promise<unknown>;
  
  // Generic request methods
  private async get(path: string, params?: Record<string, string>): Promise<unknown>;
  private async post(path: string, body?: unknown): Promise<unknown>;
  private async put(path: string, body?: unknown): Promise<unknown>;
  private async delete(path: string): Promise<unknown>;
  
  private buildUrl(path: string, params?: Record<string, string>): string;
  private handleResponse(response: Response): Promise<unknown>;
  private handleError(error: Error): never;
}
```

#### 3. NodeLinkingService

Service for linking nodes across multiple sources.

```typescript
class NodeLinkingService {
  constructor(private integrationManager: IntegrationManager);
  
  /**
   * Link nodes from multiple sources based on matching identifiers
   * @param nodes - Nodes from all sources
   * @returns Linked nodes with source attribution
   */
  linkNodes(nodes: Node[]): LinkedNode[];
  
  /**
   * Get all data for a linked node from all sources
   * @param nodeId - Node identifier
   * @returns Aggregated node data from all linked sources
   */
  async getLinkedNodeData(nodeId: string): Promise<LinkedNodeData>;
  
  /**
   * Find matching nodes across sources
   * @param identifier - Node identifier (certname, hostname, etc.)
   * @returns Nodes matching the identifier from all sources
   */
  async findMatchingNodes(identifier: string): Promise<Node[]>;
  
  private matchNodes(node1: Node, node2: Node): boolean;
  private extractIdentifiers(node: Node): string[];
}
```

#### 4. CatalogDiffService

Service for comparing catalogs between environments.

```typescript
class CatalogDiffService {
  /**
   * Compare two catalogs and generate a diff
   * @param catalog1 - First catalog
   * @param catalog2 - Second catalog
   * @returns Catalog diff showing changes
   */
  compareCatalogs(catalog1: Catalog, catalog2: Catalog): CatalogDiff;
  
  /**
   * Compare resources between catalogs
   * @param resources1 - Resources from first catalog
   * @param resources2 - Resources from second catalog
   * @returns Resource diff
   */
  private compareResources(
    resources1: Resource[],
    resources2: Resource[]
  ): ResourceDiff[];
  
  /**
   * Compare resource parameters
   * @param params1 - Parameters from first resource
   * @param params2 - Parameters from second resource
   * @returns Parameter diff
   */
  private compareParameters(
    params1: Record<string, unknown>,
    params2: Record<string, unknown>
  ): ParameterDiff[];
}
```

### UI Navigation Structure

The application navigation is restructured to better organize Puppet-related functionality:

```text
Top Navigation:
├── Home
│   └── Puppet Reports Summary (if PuppetDB active)
├── Inventory
│   └── Node list with certificate status indicators
├── Executions
│   └── Execution history and management
└── Puppet (NEW)
    ├── Environments (moved from node detail)
    ├── Reports (all nodes)
    ├── Certificates (moved from top nav)
    ├── Puppetserver Status (if active)
    │   ├── Services (/status/v1/services)
    │   ├── Simple Status (/status/v1/simple)
    │   ├── Admin API (/puppet-admin-api/v1)
    │   └── Metrics (/metrics/v2 via Jolokia)
    └── PuppetDB Admin (if active)
        ├── Archive (/pdb/admin/v1/archive)
        └── Summary Stats (/pdb/admin/v1/summary-stats)

Node Detail Page:
├── Overview Tab
│   ├── General Info (OS, IP from facts)
│   ├── Latest Puppet Runs (if PuppetDB active)
│   └── Latest Executions
├── Facts Tab
│   ├── Facts from all sources
│   ├── Source attribution
│   └── YAML export option
├── Actions Tab
│   ├── Install Software (renamed from Install packages)
│   ├── Execute Commands
│   ├── Execute Task
│   └── Execution History (moved from separate tab)
└── Puppet Tab
    ├── Certificate Status
    ├── Node Status
    ├── Catalog Compilation
    ├── Puppet Reports
    ├── Catalog (from PuppetDB)
    ├── Events
    └── Managed Resources (NEW)
        ├── Resources by type
        └── Catalog view
```

### Frontend Components

#### 1. Certificate Management Component

Interface for viewing and managing certificates.

```typescript
interface CertificateManagementProps {
  certificates: Certificate[];
  onSign: (certname: string) => Promise<void>;
  onRevoke: (certname: string) => Promise<void>;
  onBulkSign: (certnames: string[]) => Promise<void>;
  onBulkRevoke: (certnames: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}

interface Certificate {
  certname: string;
  status: 'signed' | 'requested' | 'revoked';
  fingerprint: string;
  dns_alt_names?: string[];
  authorization_extensions?: Record<string, unknown>;
  not_before?: string;
  not_after?: string;
}
```

#### 2. Node Status Component

Display node status information from Puppetserver.

```typescript
interface NodeStatusProps {
  status: NodeStatus;
  threshold?: number; // Inactivity threshold in seconds
}

interface NodeStatus {
  certname: string;
  latest_report_hash?: string;
  latest_report_status?: 'unchanged' | 'changed' | 'failed';
  latest_report_noop?: boolean;
  latest_report_noop_pending?: boolean;
  cached_catalog_status?: string;
  catalog_timestamp?: string;
  facts_timestamp?: string;
  report_timestamp?: string;
  catalog_environment?: string;
  report_environment?: string;
}
```

#### 3. Environment Selector Component

Interface for selecting and managing environments.

```typescript
interface EnvironmentSelectorProps {
  environments: Environment[];
  selectedEnvironment?: string;
  onSelect: (environment: string) => void;
  onDeploy?: (environment: string) => Promise<void>;
}

interface Environment {
  name: string;
  last_deployed?: string;
  status?: 'deployed' | 'deploying' | 'failed';
}
```

#### 4. Catalog Comparison Component

Interface for comparing catalogs between environments.

```typescript
interface CatalogComparisonProps {
  node: Node;
  environments: Environment[];
  onCompare: (env1: string, env2: string) => Promise<CatalogDiff>;
}

interface CatalogDiff {
  environment1: string;
  environment2: string;
  added: Resource[];
  removed: Resource[];
  modified: ResourceDiff[];
  unchanged: Resource[];
}

interface ResourceDiff {
  type: string;
  title: string;
  parameterChanges: ParameterDiff[];
}

interface ParameterDiff {
  parameter: string;
  oldValue: unknown;
  newValue: unknown;
}
```

#### 5. Enhanced Inventory Page

Updated inventory page with certificate status indicators.

```typescript
interface InventoryNodeDisplay extends Node {
  certificateStatus?: 'signed' | 'requested' | 'revoked';
  lastCheckIn?: string;
  sources: string[]; // ['puppetserver', 'puppetdb', 'bolt']
  linked: boolean; // true if node exists in multiple sources
}
```

#### 6. Enhanced Node Detail Page

Updated node detail page with restructured tabs.

```typescript
interface NodeDetailPageProps {
  node: Node;
  activeTab: 'overview' | 'facts' | 'actions' | 'puppet';
}

// Overview Tab
interface OverviewTabProps {
  node: Node;
  generalInfo: {
    os: string;
    ip: string;
    // ... other facts
  };
  latestRuns?: PuppetRun[];
  latestExecutions: Execution[];
}

// Facts Tab
interface FactsTabProps {
  facts: FactsBySource;
  onExportYaml: () => void;
}

interface FactsBySource {
  [source: string]: {
    facts: Record<string, unknown>;
    timestamp: string;
  };
}

// Actions Tab
interface ActionsTabProps {
  node: Node;
  onInstallSoftware: (packages: string[]) => Promise<void>;
  onExecuteCommand: (command: string) => Promise<void>;
  onExecuteTask: (task: string, params: Record<string, unknown>) => Promise<void>;
  executionHistory: Execution[];
}

// Puppet Tab
interface PuppetTabProps {
  node: Node;
  activeSubTab: 'certificate' | 'status' | 'compilation' | 'reports' | 'catalog' | 'events' | 'resources';
}

// Managed Resources Sub-tab
interface ManagedResourcesProps {
  certname: string;
  resources: ResourcesByType;
  catalog: Catalog;
}

interface ResourcesByType {
  [resourceType: string]: Resource[];
}
```

#### 7. Puppet Page Components

New dedicated Puppet page with multiple sections.

```typescript
interface PuppetPageProps {
  puppetdbActive: boolean;
  puppetserverActive: boolean;
}

// Puppetserver Status Components
interface PuppetserverStatusProps {
  services: ServiceStatus[];
  simpleStatus: SimpleStatus;
  adminApi: AdminApiInfo;
  metrics: MetricsData;
}

interface ServiceStatus {
  name: string;
  state: 'running' | 'stopped' | 'error';
  status: string;
}

interface SimpleStatus {
  state: 'running' | 'error';
  status: string;
}

// PuppetDB Admin Components
interface PuppetDBAdminProps {
  archive: ArchiveInfo;
  summaryStats: SummaryStats;
}

interface ArchiveInfo {
  // Archive endpoint data
}

interface SummaryStats {
  // Summary stats with performance warning
  nodes: number;
  resources: number;
  // ... other stats
}
```

#### 8. Expert Mode Component

Global expert mode toggle and display enhancements.

```typescript
interface ExpertModeProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

interface ExpertModeDisplay {
  // When expert mode is enabled, components show:
  commandUsed?: string;
  apiEndpoint?: string;
  requestDetails?: {
    method: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  responseDetails?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
  troubleshootingHints?: string[];
  setupInstructions?: string[];
  debugInfo?: Record<string, unknown>;
}
```

#### 9. Home Page Puppet Reports Component

Summary component for home page.

```typescript
interface PuppetReportsSummaryProps {
  reports: {
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  };
  onViewDetails: () => void; // Navigate to Puppet page
}
```

## Data Models

### Puppetserver Data Types

```typescript
interface Certificate {
  certname: string;
  status: 'signed' | 'requested' | 'revoked';
  fingerprint: string;
  dns_alt_names?: string[];
  authorization_extensions?: Record<string, unknown>;
  not_before?: string;
  not_after?: string;
}

interface NodeStatus {
  certname: string;
  latest_report_hash?: string;
  latest_report_status?: 'unchanged' | 'changed' | 'failed';
  latest_report_noop?: boolean;
  latest_report_noop_pending?: boolean;
  cached_catalog_status?: string;
  catalog_timestamp?: string;
  facts_timestamp?: string;
  report_timestamp?: string;
  catalog_environment?: string;
  report_environment?: string;
}

interface Environment {
  name: string;
  last_deployed?: string;
  status?: 'deployed' | 'deploying' | 'failed';
}

interface DeploymentResult {
  environment: string;
  status: 'success' | 'failed';
  message?: string;
  timestamp: string;
}

interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    certname: string;
    error: string;
  }>;
  total: number;
  successCount: number;
  failureCount: number;
}

interface LinkedNode extends Node {
  sources: string[];
  certificateStatus?: 'signed' | 'requested' | 'revoked';
  lastCheckIn?: string;
  linked: boolean;
}

interface LinkedNodeData {
  node: LinkedNode;
  dataBySource: Record<string, {
    facts?: Facts;
    status?: NodeStatus;
    certificate?: Certificate;
    reports?: Report[];
    catalog?: Catalog;
    events?: Event[];
  }>;
}
```

### Configuration Types

```typescript
interface PuppetserverConfig {
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
  inactivityThreshold?: number; // Seconds before node considered inactive
}

interface AppConfig {
  // Existing config...
  integrations: {
    puppetdb?: PuppetDBConfig;
    puppetserver?: PuppetserverConfig;
    // Future: ansible, terraform, etc.
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all acceptance criteria, the following consolidations are recommended:

**Redundancies identified:**

- Properties about "ensuring queries happen" (4.1, 6.1, 7.1, 8.1, 9.1, 10.1) are integration points that should be tested as examples, not separate properties
- Properties about required field display (1.3, 4.2, 5.4) can be combined into one comprehensive property about data completeness
- Properties about error handling and graceful degradation (1.5, 4.5, 6.5) can be combined
- Properties about filtering functionality (1.4, 2.5, 11.4, 13.3) can be combined into one comprehensive filtering property
- Properties about source attribution (2.2, 6.2, 10.2) can be combined

**Consolidated properties:**

- Combine query initiation examples into integration tests
- Combine required field display properties
- Combine error handling properties
- Combine filtering properties
- Combine source attribution properties

This reduces redundancy while maintaining comprehensive coverage.

### Correctness Properties

Property 1: Puppetserver connection and certificate retrieval
*For any* valid Puppetserver configuration, connecting to Puppetserver and retrieving certificates should return a list of certificates or an appropriate error for invalid configurations
**Validates: Requirements 1.1**

Property 2: Certificate data transformation
*For any* certificate returned from Puppetserver, transforming it to normalized inventory format should produce a valid Node object with all required fields including source attribution
**Validates: Requirements 2.1**

Property 3: Required field display completeness
*For any* data object (certificate, node status, catalog, facts), the display should include all required fields as specified in the requirements
**Validates: Requirements 1.3, 4.2, 5.4**

Property 4: Multi-source filtering
*For any* list of items (certificates, inventory nodes), filtering by any supported criteria should return only items matching the filter criteria
**Validates: Requirements 1.4, 2.5, 11.4, 13.3**

Property 5: Graceful degradation on source failure
*For any* information source failure, the system should continue displaying data from other available sources without blocking functionality
**Validates: Requirements 1.5, 4.5, 6.5**

Property 6: Source attribution consistency
*For any* data displayed from multiple sources, the source system should be clearly indicated for each piece of data
**Validates: Requirements 2.2, 6.2, 10.2**

Property 7: Node linking by identifier
*For any* two nodes with matching certname or hostname, the system should link them and indicate they represent the same physical node
**Validates: Requirements 2.3**

Property 8: Multi-source indicator display
*For any* node that exists in multiple sources, the display should indicate that data is available from multiple sources
**Validates: Requirements 2.4**

Property 9: Conditional button display
*For any* certificate, the available operations (sign, revoke) should be displayed based on the certificate's current status
**Validates: Requirements 3.1, 3.3**

Property 10: Post-operation refresh and feedback
*For any* certificate operation (sign, revoke), completion should trigger a list refresh and display appropriate success or error messages
**Validates: Requirements 3.5**

Property 11: Node status categorization
*For any* node with a last check-in timestamp, the system should correctly categorize it as active, inactive, or never checked in based on the configured threshold
**Validates: Requirements 4.3, 4.4**

Property 12: Catalog display structure
*For any* compiled catalog, the display should show resources in a structured, browsable format with all required metadata
**Validates: Requirements 5.3, 5.4**

Property 13: Compilation error detail
*For any* failed catalog compilation, the error display should include detailed error messages with line numbers when available
**Validates: Requirements 5.5**

Property 14: Multi-source fact display
*For any* node with facts from multiple sources, all fact sources should be displayed with timestamps to indicate recency
**Validates: Requirements 6.3**

Property 15: Fact categorization
*For any* set of facts, they should be organized by category (system, network, hardware, custom) for easier navigation
**Validates: Requirements 6.4**

Property 16: Environment metadata display
*For any* environment, the display should show available metadata including deployment timestamp and status
**Validates: Requirements 7.2, 7.5**

Property 17: SSL and authentication support
*For any* Puppetserver configuration with HTTPS and authentication (token or certificate), the system should successfully establish secure authenticated connections
**Validates: Requirements 8.2, 8.3**

Property 18: Configuration error handling
*For any* invalid Puppetserver configuration, the system should log detailed error messages and continue operating without Puppetserver features
**Validates: Requirements 8.4, 8.5**

Property 19: REST API usage
*For any* Puppetserver query, it should use the correct Puppetserver REST API endpoint with proper parameters
**Validates: Requirements 9.2**

Property 20: Retry logic with exponential backoff
*For any* failed integration query, the system should retry with exponentially increasing delays up to a maximum number of attempts before reporting failure
**Validates: Requirements 9.3, 14.5**

Property 21: Response validation and transformation
*For any* integration response, it should be validated against expected schema and transformed to normalized format
**Validates: Requirements 9.4**

Property 22: Cache expiration by source
*For any* cached integration data, it should expire according to the configured TTL for that specific source
**Validates: Requirements 9.5**

Property 23: Unified multi-source view
*For any* node that exists in multiple sources, the node detail page should display a unified view with data from all sources
**Validates: Requirements 10.3**

Property 24: Conflict resolution display
*For any* data that conflicts between sources, both values should be displayed with timestamps to indicate which is more recent
**Validates: Requirements 10.4**

Property 25: Independent section loading
*For any* node detail page, each data section should load independently without blocking other sections
**Validates: Requirements 10.5**

Property 26: Certificate status indicators
*For any* node from Puppetserver CA, the inventory display should show appropriate visual indicators for certificate status
**Validates: Requirements 11.1, 11.2, 11.3**

Property 27: Inventory sorting
*For any* inventory list, sorting by certificate status or last check-in time should order nodes correctly
**Validates: Requirements 11.5**

Property 28: Bulk operation conditional display
*For any* certificate selection state, bulk action buttons should be displayed only when multiple certificates are selected
**Validates: Requirements 12.2**

Property 29: Bulk operation execution
*For any* bulk operation, certificates should be processed sequentially with progress display and a final summary showing successes and failures
**Validates: Requirements 12.4, 12.5**

Property 30: Search functionality
*For any* search query on certificates, the system should support partial matching and case-insensitive search
**Validates: Requirements 13.2**

Property 31: Real-time filter updates
*For any* filter application, the list should update in real-time without page reload
**Validates: Requirements 13.4**

Property 32: Active filter display
*For any* active filter, it should be displayed with the ability to clear it
**Validates: Requirements 13.5**

Property 33: Detailed error logging
*For any* failed API call, the system should log detailed error information including endpoint, status code, and response body
**Validates: Requirements 14.1**

Property 34: Actionable error messages
*For any* error displayed to users, it should include actionable guidance for troubleshooting
**Validates: Requirements 14.2**

Property 35: Specific error messages
*For any* certificate operation failure, the error message should be specific to the failure type
**Validates: Requirements 14.3**

Property 36: Network error categorization
*For any* network error, the system should distinguish between connection failures, timeouts, and authentication errors
**Validates: Requirements 14.4**

Property 37: Catalog diff display
*For any* catalog comparison, the diff should show added, removed, and modified resources with parameter changes highlighted
**Validates: Requirements 15.3, 15.4**

Property 38: Comparison error display
*For any* failed catalog compilation during comparison, detailed error messages should be displayed for each failed compilation
**Validates: Requirements 15.5**

## Error Handling

### Puppetserver-Specific Errors

```typescript
class PuppetserverError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = 'PuppetserverError';
  }
}

class PuppetserverConnectionError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_CONNECTION_ERROR', details);
    this.name = 'PuppetserverConnectionError';
  }
}

class PuppetserverAuthenticationError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_AUTH_ERROR', details);
    this.name = 'PuppetserverAuthenticationError';
  }
}

class CertificateOperationError extends PuppetserverError {
  constructor(
    message: string,
    public operation: 'sign' | 'revoke',
    public certname: string,
    details?: unknown
  ) {
    super(message, 'CERTIFICATE_OPERATION_ERROR', details);
    this.name = 'CertificateOperationError';
  }
}

class CatalogCompilationError extends PuppetserverError {
  constructor(
    message: string,
    public certname: string,
    public environment: string,
    public compilationErrors?: string[],
    details?: unknown
  ) {
    super(message, 'CATALOG_COMPILATION_ERROR', details);
    this.name = 'CatalogCompilationError';
  }
}

class EnvironmentDeploymentError extends PuppetserverError {
  constructor(
    message: string,
    public environment: string,
    details?: unknown
  ) {
    super(message, 'ENVIRONMENT_DEPLOYMENT_ERROR', details);
    this.name = 'EnvironmentDeploymentError';
  }
}
```

### Error Handling Strategy

1. **Connection Errors**: Retry with exponential backoff, fall back to cached data if available, continue with other sources
2. **Authentication Errors**: Log error, disable Puppetserver integration, show configuration guidance
3. **Certificate Operation Errors**: Display specific error message, do not retry, allow user to correct and retry manually
4. **Catalog Compilation Errors**: Display detailed compilation errors with line numbers, do not retry automatically
5. **Timeout Errors**: Cancel request, use cached data if available, show timeout message
6. **Data Validation Errors**: Log validation failure, skip invalid records, continue processing valid data

### Circuit Breaker Pattern

Reuse the existing `CircuitBreaker` class from PuppetDB integration:

```typescript
// Use existing CircuitBreaker from backend/src/integrations/puppetdb/CircuitBreaker.ts
// Configure with Puppetserver-specific thresholds
const circuitBreaker = new CircuitBreaker({
  threshold: 5,
  timeout: 60000,
  resetTimeout: 30000
});
```

## Testing Strategy

### Unit Testing

Unit tests will cover:

- PuppetserverClient HTTP request/response handling
- PuppetserverService data transformation logic
- NodeLinkingService node matching and linking logic
- CatalogDiffService catalog comparison logic
- Certificate operation workflows
- Configuration parsing and validation
- Error handling and retry logic
- Circuit breaker state transitions
- Cache expiration logic
- Bulk operation processing

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

- Property tests will be in `backend/test/properties/puppetserver/` directory
- Each property will have its own test file: `property-{number}.test.ts`
- Each test will be tagged with: `**Feature: puppetserver-integration, Property {number}: {description}**`
- Generators will be in `backend/test/generators/puppetserver/` for reuse

**Example Property Test Structure:**

```typescript
// backend/test/properties/puppetserver/property-02.test.ts
/**
 * Feature: puppetserver-integration, Property 2: Certificate data transformation
 * Validates: Requirements 2.1
 */

import fc from 'fast-check';
import { transformCertificateToNode } from '../../../src/integrations/puppetserver/transforms';
import { certificateArbitrary } from '../../generators/puppetserver';

describe('Property 2: Certificate data transformation', () => {
  it('should transform any certificate to valid normalized node format', () => {
    fc.assert(
      fc.property(certificateArbitrary(), (certificate) => {
        const node = transformCertificateToNode(certificate);
        
        // Verify all required fields are present
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('uri');
        expect(node).toHaveProperty('transport');
        expect(node).toHaveProperty('source', 'puppetserver');
        
        // Verify types
        expect(typeof node.id).toBe('string');
        expect(typeof node.name).toBe('string');
        expect(typeof node.uri).toBe('string');
        expect(['ssh', 'winrm', 'docker', 'local']).toContain(node.transport);
        
        // Verify certificate-specific fields
        if (certificate.status) {
          expect(node).toHaveProperty('certificateStatus', certificate.status);
        }
      }),
      propertyTestConfig
    );
  });
});
```

**Generators:**

```typescript
// backend/test/generators/puppetserver/index.ts
import fc from 'fast-check';

export const certificateArbitrary = () => fc.record({
  certname: fc.domain(),
  status: fc.constantFrom('signed', 'requested', 'revoked'),
  fingerprint: fc.hexaString({ minLength: 64, maxLength: 64 }),
  dns_alt_names: fc.option(fc.array(fc.domain())),
  not_before: fc.option(fc.date().map(d => d.toISOString())),
  not_after: fc.option(fc.date().map(d => d.toISOString())),
});

export const nodeStatusArbitrary = () => fc.record({
  certname: fc.domain(),
  latest_report_hash: fc.option(fc.hexaString({ minLength: 40, maxLength: 40 })),
  latest_report_status: fc.option(fc.constantFrom('unchanged', 'changed', 'failed')),
  catalog_timestamp: fc.option(fc.date().map(d => d.toISOString())),
  facts_timestamp: fc.option(fc.date().map(d => d.toISOString())),
  report_timestamp: fc.option(fc.date().map(d => d.toISOString())),
});

export const environmentArbitrary = () => fc.record({
  name: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')), { minLength: 3, maxLength: 20 }),
  last_deployed: fc.option(fc.date().map(d => d.toISOString())),
  status: fc.option(fc.constantFrom('deployed', 'deploying', 'failed')),
});
```

### Integration Testing

Integration tests will verify:

- End-to-end Puppetserver API communication
- Certificate signing and revocation workflows
- Catalog compilation and comparison
- Node linking across Puppetserver and PuppetDB
- Multi-source data aggregation
- Error handling across integration boundaries
- Bulk operations

### UI Component Testing

UI tests will verify:

- Certificate management component rendering and operations
- Node status display with various states
- Environment selector and deployment interface
- Catalog comparison diff display
- Inventory page with certificate status indicators
- Search and filter functionality
- Bulk operation UI and confirmation dialogs

## API Endpoints

### New Puppetserver Endpoints

```http
# Certificates
GET    /api/integrations/puppetserver/certificates
GET    /api/integrations/puppetserver/certificates/:certname
POST   /api/integrations/puppetserver/certificates/:certname/sign
DELETE /api/integrations/puppetserver/certificates/:certname
POST   /api/integrations/puppetserver/certificates/bulk-sign
POST   /api/integrations/puppetserver/certificates/bulk-revoke

# Nodes
GET    /api/integrations/puppetserver/nodes
GET    /api/integrations/puppetserver/nodes/:certname
GET    /api/integrations/puppetserver/nodes/:certname/status
GET    /api/integrations/puppetserver/nodes/:certname/facts

# Catalogs
GET    /api/integrations/puppetserver/catalog/:certname/:environment
POST   /api/integrations/puppetserver/catalog/compare

# Environments
GET    /api/integrations/puppetserver/environments
GET    /api/integrations/puppetserver/environments/:name
POST   /api/integrations/puppetserver/environments/:name/deploy

# Status and Metrics
GET    /api/integrations/puppetserver/status/services
GET    /api/integrations/puppetserver/status/simple
GET    /api/integrations/puppetserver/admin-api
GET    /api/integrations/puppetserver/metrics
```

### Enhanced PuppetDB Endpoints

```http
# Resources
GET    /api/integrations/puppetdb/resources/:certname
GET    /api/integrations/puppetdb/resources/:certname/by-type

# Admin
GET    /api/integrations/puppetdb/admin/archive
GET    /api/integrations/puppetdb/admin/summary-stats

# Reports Summary
GET    /api/integrations/puppetdb/reports/summary
```

### Enhanced Inventory Endpoints

```http
GET    /api/inventory/linked                    # Get inventory with node linking
GET    /api/inventory/nodes/:id/linked-data     # Get all data for a linked node
```

## Configuration

### Environment Variables

```bash
# Puppetserver Configuration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppetserver.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=your-token-here

# SSL Configuration
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true

# Connection Configuration
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000

# Cache Configuration
PUPPETSERVER_CACHE_TTL=300000  # 5 minutes

# Circuit Breaker Configuration
PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Node Status Configuration
PUPPETSERVER_INACTIVITY_THRESHOLD=3600  # 1 hour in seconds
```

### Configuration File

```json
{
  "integrations": {
    "puppetdb": {
      "enabled": true,
      "priority": 10,
      // ... existing PuppetDB config
    },
    "puppetserver": {
      "enabled": true,
      "priority": 20,
      "serverUrl": "https://puppetserver.example.com",
      "port": 8140,
      "token": "${PUPPETSERVER_TOKEN}",
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
      },
      "inactivityThreshold": 3600
    }
  }
}
```

## Migration Strategy

### Phase 1: Foundation (Week 1)

- Implement PuppetserverClient for API communication
- Create PuppetserverService implementing InformationSourcePlugin
- Add configuration support
- Implement basic error handling and circuit breaker

### Phase 2: Certificate Management (Week 2)

- Implement certificate listing and retrieval
- Add certificate signing and revocation
- Implement bulk operations
- Create certificate management UI component

### Phase 3: Inventory Integration (Week 3)

- Implement inventory retrieval from CA
- Create NodeLinkingService for cross-source linking
- Update inventory page with certificate status indicators
- Add search and filter functionality

### Phase 4: Node Status and Facts (Week 4)

- Implement node status retrieval
- Add facts retrieval from Puppetserver
- Update node detail page with Puppetserver tabs
- Implement multi-source fact display

### Phase 5: Catalog and Environment Management (Week 5)

- Implement catalog compilation
- Create CatalogDiffService for comparison
- Add environment listing and management
- Implement catalog comparison UI

### Phase 6: Testing & Polish (Week 6)

- Write property-based tests
- Write integration tests
- Performance optimization
- Documentation
- Bug fixes

## Performance Considerations

1. **Caching Strategy**: Implement multi-level caching with per-source TTL, cache certificates and node status
2. **Lazy Loading**: Load certificate details on demand, not all at once
3. **Pagination**: Implement pagination for large certificate lists
4. **Parallel Requests**: Fetch data from Puppetserver and PuppetDB in parallel
5. **Connection Pooling**: Reuse HTTP connections to Puppetserver
6. **Debouncing**: Debounce search and filter operations
7. **Virtual Scrolling**: Use virtual scrolling for large certificate lists
8. **Bulk Operation Optimization**: Process bulk operations in batches to avoid overwhelming the API
9. **Node Linking Optimization**: Cache linked node mappings to avoid repeated matching
10. **Catalog Comparison Optimization**: Use efficient diff algorithms for large catalogs

## Security Considerations

1. **Authentication**: Support both token-based and certificate-based auth for Puppetserver
2. **SSL/TLS**: Enforce HTTPS for Puppetserver connections
3. **Certificate Validation**: Validate SSL certificates, support custom CAs
4. **Secrets Management**: Store tokens and certificates securely, never log sensitive data
5. **Access Control**: Implement role-based access control for certificate operations
6. **Audit Logging**: Log all certificate operations (sign, revoke) for audit purposes
7. **Confirmation Dialogs**: Require confirmation for destructive operations (revoke, bulk operations)
8. **Rate Limiting**: Implement rate limiting for Puppetserver API calls
9. **Input Validation**: Validate all certnames and parameters to prevent injection attacks
10. **Bulk Operation Limits**: Limit the number of certificates that can be processed in a single bulk operation

## Monitoring and Observability

1. **Health Checks**: Regular health checks for Puppetserver integration
2. **Metrics**: Track API latency, error rates, cache hit rates, certificate operation counts
3. **Logging**: Structured logging with correlation IDs for all Puppetserver operations
4. **Alerts**: Alert on integration failures, high error rates, certificate operation failures
5. **Dashboards**: Grafana dashboards for Puppetserver integration health
6. **Tracing**: Distributed tracing for multi-source requests involving Puppetserver

## Future Enhancements

1. **Ansible Integration (v0.4.0)**: Add Ansible as an execution tool following the same plugin pattern
2. **Certificate Auto-Signing**: Implement policy-based auto-signing for certificate requests
3. **Certificate Renewal**: Add certificate renewal workflows
4. **Environment Promotion**: Implement environment promotion workflows (dev → staging → production)
5. **Catalog Validation**: Validate catalogs before deployment
6. **Node Grouping**: Group nodes by environment, certificate status, or custom criteria
7. **Scheduled Operations**: Schedule certificate operations and environment deployments
8. **Webhooks**: Trigger actions based on Puppetserver events (new certificate requests, etc.)
9. **Multi-Puppetserver Support**: Support multiple Puppetserver instances
10. **Advanced Catalog Diff**: Show visual diff with syntax highlighting and resource relationships
