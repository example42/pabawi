# Pabawi Architecture Documentation

Version: 0.5.0

## Table of Contents

- [Overview](#overview)
- [Plugin Architecture](#plugin-architecture)
- [Integration Registration](#integration-registration)
- [Data Flow](#data-flow)
- [Component Diagrams](#component-diagrams)
- [Key Components](#key-components)
- [Multi-Source Data Aggregation](#multi-source-data-aggregation)
- [Health Monitoring](#health-monitoring)
- [Error Handling](#error-handling)
- [Security](#security)

## Overview

Pabawi is a unified remote execution interface that orchestrates multiple infrastructure management tools through a consistent plugin-based architecture. The system provides a common abstraction layer and REST API for executing commands, tasks, and workflows across heterogeneous automation backends.

### Design Principles

1. **Plugin-Based Architecture**: All integrations follow a consistent plugin pattern
2. **Multi-Source Aggregation**: Data from multiple sources is combined and linked
3. **Graceful Degradation**: Failures in one integration don't break others
4. **Consistent Interfaces**: All plugins implement standard interfaces
5. **Priority-Based Routing**: Higher priority sources take precedence for duplicate data

### Current Integrations

- **Bolt**: Execution tool and information source (priority: 10)
- **PuppetDB**: Information source for Puppet infrastructure data (priority: 10)
- **Puppetserver**: Information source for node management and catalog compilation (priority: 20)
- **Hiera**: Information source for hierarchical configuration data (priority: 6)

## Plugin Architecture

### Plugin Types

Pabawi supports three types of plugins:

1. **Execution Tool Plugins**: Execute actions on target nodes (commands, tasks, plans)
2. **Information Source Plugins**: Provide inventory, facts, and node data
3. **Both**: Plugins that provide both execution and information capabilities

### Plugin Interface Hierarchy

```
IntegrationPlugin (base interface)
├── ExecutionToolPlugin
│   ├── executeAction()
│   └── listCapabilities()
├── InformationSourcePlugin
│   ├── getInventory()
│   ├── getNodeFacts()
│   └── getNodeData()
└── Both (implements both interfaces)
```

### Base Plugin Class

All plugins extend `BasePlugin` which provides:

- Configuration management
- Initialization state tracking
- Health check framework
- Logging helpers
- Common validation logic

```typescript
abstract class BasePlugin implements IntegrationPlugin {
  protected config: IntegrationConfig;
  protected initialized: boolean;
  
  // Lifecycle methods
  async initialize(config: IntegrationConfig): Promise<void>
  async healthCheck(): Promise<HealthStatus>
  
  // Abstract methods for subclasses
  protected abstract performInitialization(): Promise<void>
  protected abstract performHealthCheck(): Promise<HealthStatus>
  
  // State management
  isInitialized(): boolean
  isEnabled(): boolean
  getPriority(): number
}
```

### Plugin Configuration

Each plugin is configured with:

```typescript
interface IntegrationConfig {
  enabled: boolean;           // Enable/disable the integration
  name: string;              // Unique plugin identifier
  type: "execution" | "information" | "both";
  config: Record<string, unknown>;  // Plugin-specific configuration
  priority?: number;         // Priority for data source ordering
}
```

## Integration Registration

### Registration Process

1. **Plugin Creation**: Instantiate plugin with specific configuration
2. **Registration**: Register plugin with IntegrationManager
3. **Initialization**: Manager calls initialize() on all plugins
4. **Health Check**: Periodic health checks verify plugin status
5. **Ready**: Plugin is available for use

### Registration Flow

```
Application Startup
    │
    ├─> Create IntegrationManager
    │
    ├─> Create Plugin Instances
    │   ├─> BoltPlugin
    │   ├─> PuppetDBService
    │   └─> PuppetserverService
    │
    ├─> Register Plugins
    │   └─> integrationManager.registerPlugin(plugin, config)
    │       ├─> Validate plugin name is unique
    │       ├─> Store in plugins map
    │       ├─> Add to type-specific maps
    │       │   ├─> executionTools (if type = execution or both)
    │       │   └─> informationSources (if type = information or both)
    │       └─> Log registration
    │
    ├─> Initialize All Plugins
    │   └─> integrationManager.initializePlugins()
    │       ├─> For each registered plugin:
    │       │   ├─> Call plugin.initialize(config)
    │       │   ├─> Plugin performs setup
    │       │   │   ├─> Validate configuration
    │       │   │   ├─> Establish connections
    │       │   │   ├─> Load resources
    │       │   │   └─> Set initialized = true
    │       │   └─> Continue even if some fail
    │       └─> Return array of errors
    │
    ├─> Start Health Check Scheduler
    │   └─> integrationManager.startHealthCheckScheduler()
    │       ├─> Run initial health check
    │       └─> Schedule periodic checks
    │
    └─> Ready for Requests
```

### Example Registration Code

```typescript
// server.ts
const integrationManager = new IntegrationManager({
  healthCheckIntervalMs: 60000,  // 1 minute
  healthCheckCacheTTL: 300000    // 5 minutes
});

// Register Bolt plugin
const boltPlugin = new BoltPlugin(boltService);
integrationManager.registerPlugin(boltPlugin, {
  enabled: true,
  name: 'bolt',
  type: 'both',
  priority: 10,
  config: {}
});

// Register PuppetDB plugin
const puppetdbService = new PuppetDBService(puppetdbConfig);
integrationManager.registerPlugin(puppetdbService, {
  enabled: config.puppetdb.enabled,
  name: 'puppetdb',
  type: 'information',
  priority: 10,
  config: puppetdbConfig
});

// Register Puppetserver plugin
const puppetserverService = new PuppetserverService(puppetserverConfig);
integrationManager.registerPlugin(puppetserverService, {
  enabled: config.puppetserver.enabled,
  name: 'puppetserver',
  type: 'information',
  priority: 20,
  config: puppetserverConfig
});

// Initialize all plugins
const errors = await integrationManager.initializePlugins();

// Start health monitoring
integrationManager.startHealthCheckScheduler();
```

## Data Flow

### Inventory Retrieval Flow

```
Client Request: GET /api/inventory
    │
    ├─> API Route Handler
    │   └─> integrationManager.getLinkedInventory()
    │
    ├─> IntegrationManager.getAggregatedInventory()
    │   │
    │   ├─> Query All Information Sources (parallel)
    │   │   ├─> bolt.getInventory()
    │   │   │   └─> Returns nodes from Bolt inventory
    │   │   │
    │   │   ├─> puppetdb.getInventory()
    │   │   │   └─> Returns nodes from PuppetDB
    │   │   │
    │   │   └─> puppetserver.getInventory()
    │   │       └─> Returns nodes from Puppetserver
    │   │
    │   ├─> Add Source Attribution
    │   │   └─> Each node tagged with source name
    │   │
    │   ├─> Deduplicate by Node ID
    │   │   └─> Prefer higher priority sources
    │   │
    │   └─> Return aggregated inventory
    │
    ├─> NodeLinkingService.linkNodes()
    │   │
    │   ├─> Group nodes by identifier
    │   │   └─> Match on certname, hostname, IP
    │   │
    │   ├─> Create LinkedNode objects
    │   │   ├─> Combine data from all sources
    │   │   ├─> Add sources array
    │   │   └─> Set linked flag
    │   │
    │   └─> Return linked nodes
    │
    └─> Response to Client
        └─> JSON with linked nodes and source metadata
```

### Command Execution Flow

```
Client Request: POST /api/executions
    │
    ├─> API Route Handler
    │   └─> integrationManager.executeAction(toolName, action)
    │
    ├─> IntegrationManager
    │   ├─> Get execution tool by name
    │   ├─> Verify tool is initialized
    │   └─> Call tool.executeAction(action)
    │
    ├─> Execution Tool Plugin (e.g., BoltPlugin)
    │   ├─> Validate action parameters
    │   ├─> Transform to tool-specific format
    │   ├─> Execute via tool's API/CLI
    │   ├─> Parse results
    │   └─> Return normalized ExecutionResult
    │
    ├─> Store Execution Result
    │   └─> ExecutionRepository.create()
    │
    └─> Response to Client
        └─> JSON with execution result
```

### Node Facts Retrieval Flow

```
Client Request: GET /api/inventory/:nodeId/facts
    │
    ├─> API Route Handler
    │   └─> integrationManager.getNodeData(nodeId)
    │
    ├─> IntegrationManager.getNodeData()
    │   │
    │   ├─> Query All Information Sources (parallel)
    │   │   ├─> bolt.getNodeFacts(nodeId)
    │   │   ├─> puppetdb.getNodeFacts(nodeId)
    │   │   └─> puppetserver.getNodeFacts(nodeId)
    │   │
    │   ├─> Aggregate Facts by Source
    │   │   └─> facts = { bolt: {...}, puppetdb: {...}, puppetserver: {...} }
    │   │
    │   └─> Return aggregated data
    │
    └─> Response to Client
        └─> JSON with facts from all sources
```

### Health Check Flow

```
Periodic Health Check (every 60 seconds)
    │
    ├─> IntegrationManager.healthCheckAll()
    │   │
    │   ├─> For Each Registered Plugin (parallel)
    │   │   ├─> plugin.healthCheck()
    │   │   │   ├─> Check if initialized
    │   │   │   ├─> Check if enabled
    │   │   │   ├─> Perform plugin-specific check
    │   │   │   │   ├─> Ping API endpoint
    │   │   │   │   ├─> Verify authentication
    │   │   │   │   └─> Test basic query
    │   │   │   └─> Return HealthStatus
    │   │   │
    │   │   └─> Update health check cache
    │   │
    │   └─> Return Map<pluginName, HealthStatus>
    │
    └─> Cache Results (TTL: 5 minutes)

Client Request: GET /api/integrations/status
    │
    ├─> API Route Handler
    │   └─> integrationManager.healthCheckAll(useCache: true)
    │
    ├─> Check Cache
    │   ├─> If cache valid (< 5 minutes old)
    │   │   └─> Return cached results
    │   └─> If cache expired
    │       └─> Perform fresh health checks
    │
    └─> Response to Client
        └─> JSON with health status for all integrations
```

## Component Diagrams

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Svelte)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Inventory │  │   Node   │  │Execution │  │  Puppet  │   │
│  │   Page   │  │  Detail  │  │  History │  │   Page   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │              │             │          │
│       └─────────────┴──────────────┴─────────────┘          │
│                     │ HTTP/REST                             │
└─────────────────────┼───────────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────────┐
│                     │  Backend (Node.js/Express)            │
│                     ▼                                        │
│            ┌─────────────────┐                              │
│            │  API Routes     │                              │
│            │  /api/*         │                              │
│            └────────┬────────┘                              │
│                     │                                        │
│            ┌────────▼────────┐                              │
│            │ Integration     │                              │
│            │   Manager       │                              │
│            │                 │                              │
│            │ ┌─────────────┐ │                              │
│            │ │  Plugin     │ │                              │
│            │ │ Registry    │ │                              │
│            │ └─────────────┘ │                              │
│            │                 │                              │
│            │ ┌─────────────┐ │                              │
│            │ │  Health     │ │                              │
│            │ │  Monitor    │ │                              │
│            │ └─────────────┘ │                              │
│            │                 │                              │
│            │ ┌─────────────┐ │                              │
│            │ │   Node      │ │                              │
│            │ │  Linking    │ │                              │
│            │ └─────────────┘ │                              │
│            └────────┬────────┘                              │
│                     │                                        │
│        ┌────────────┼────────────┐                          │
│        │            │            │                          │
│   ┌────▼────┐  ┌───▼────┐  ┌───▼────┐                     │
│   │  Bolt   │  │PuppetDB│  │Puppet  │                     │
│   │ Plugin  │  │Service │  │server  │                     │
│   │         │  │        │  │Service │                     │
│   │ (both)  │  │ (info) │  │ (info) │                     │
│   └────┬────┘  └───┬────┘  └───┬────┘                     │
│        │           │           │                            │
└────────┼───────────┼───────────┼────────────────────────────┘
         │           │           │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
    │  Bolt   │ │PuppetDB│ │Puppet  │
    │  CLI    │ │  API   │ │server  │
    │         │ │        │ │  API   │
    └─────────┘ └────────┘ └────────┘
```

### Plugin Architecture Detail

```
┌──────────────────────────────────────────────────────────┐
│              IntegrationManager                          │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │           Plugin Registry                       │    │
│  │  Map<name, PluginRegistration>                 │    │
│  │    - plugin: IntegrationPlugin                 │    │
│  │    - config: IntegrationConfig                 │    │
│  │    - registeredAt: timestamp                   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │      Type-Specific Maps                        │    │
│  │  executionTools: Map<name, ExecutionToolPlugin>│    │
│  │  informationSources: Map<name, InfoSourcePlugin>│   │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │      Health Check Cache                        │    │
│  │  Map<name, HealthCheckCacheEntry>             │    │
│  │    - status: HealthStatus                      │    │
│  │    - cachedAt: timestamp                       │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │      Node Linking Service                      │    │
│  │  - linkNodes()                                 │    │
│  │  - getLinkedNodeData()                         │    │
│  │  - findMatchingNodes()                         │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Plugin Inheritance Hierarchy

```
┌──────────────────────────────────────┐
│      IntegrationPlugin               │
│  (interface)                         │
│  - name: string                      │
│  - type: string                      │
│  - initialize()                      │
│  - healthCheck()                     │
│  - getConfig()                       │
│  - isInitialized()                   │
└──────────────┬───────────────────────┘
               │
               │ implements
               │
┌──────────────▼───────────────────────┐
│         BasePlugin                   │
│  (abstract class)                    │
│  + config: IntegrationConfig         │
│  + initialized: boolean              │
│  + initialize()                      │
│  + healthCheck()                     │
│  # performInitialization()           │
│  # performHealthCheck()              │
│  # validateConfig()                  │
│  # log()                             │
└──────────────┬───────────────────────┘
               │
               │ extends
               │
       ┌───────┴────────┬──────────────────┐
       │                │                   │
┌──────▼──────┐  ┌─────▼──────┐  ┌────────▼────────┐
│ BoltPlugin  │  │ PuppetDB   │  │ Puppetserver    │
│             │  │ Service    │  │ Service         │
│ (both)      │  │ (info)     │  │ (info)          │
│             │  │            │  │                 │
│ implements: │  │ implements:│  │ implements:     │
│ - Execution │  │ - Info     │  │ - Info          │
│ - Info      │  │   Source   │  │   Source        │
└─────────────┘  └────────────┘  └─────────────────┘
```

## Key Components

### IntegrationManager

Central orchestrator for all plugins.

**Responsibilities:**

- Plugin registration and lifecycle management
- Plugin routing (finding the right plugin for a task)
- Multi-source data aggregation
- Health check scheduling and caching
- Node linking across sources

**Key Methods:**

- `registerPlugin(plugin, config)`: Register a new plugin
- `initializePlugins()`: Initialize all registered plugins
- `executeAction(toolName, action)`: Execute action via specific tool
- `getAggregatedInventory()`: Get inventory from all sources
- `getLinkedInventory()`: Get inventory with node linking
- `getNodeData(nodeId)`: Get node data from all sources
- `healthCheckAll(useCache)`: Check health of all plugins
- `startHealthCheckScheduler()`: Start periodic health checks

### BasePlugin

Abstract base class for all plugins.

**Responsibilities:**

- Configuration management
- Initialization state tracking
- Health check framework
- Common validation logic
- Logging helpers

**Lifecycle:**

1. Construction: Create plugin instance
2. Registration: Register with IntegrationManager
3. Initialization: Call initialize() with config
4. Ready: Plugin available for use
5. Health Checks: Periodic verification

### NodeLinkingService

Links nodes across multiple information sources.

**Responsibilities:**

- Match nodes by identifier (certname, hostname, IP)
- Create LinkedNode objects with multi-source data
- Aggregate data from all sources for a node
- Handle conflicts between sources

**Matching Strategy:**

1. Primary: Match on certname (exact match)
2. Secondary: Match on hostname (case-insensitive)
3. Tertiary: Match on IP address
4. Create LinkedNode with all matching sources

### Plugin-Specific Services

#### BoltPlugin

- Wraps BoltService
- Implements both ExecutionToolPlugin and InformationSourcePlugin
- Provides inventory from Bolt inventory files
- Executes commands, tasks, and plans via Bolt CLI

#### PuppetDBService

- Implements InformationSourcePlugin
- Provides inventory from PuppetDB nodes
- Retrieves facts, reports, catalogs, events
- Uses PuppetDB REST API

#### PuppetserverService

- Implements InformationSourcePlugin
- Provides inventory from registered nodes
- Retrieves node status, facts, catalogs
- Uses Puppetserver REST API

## Multi-Source Data Aggregation

### Inventory Aggregation

When multiple sources provide inventory:

1. **Query All Sources**: Parallel queries to all information sources
2. **Source Attribution**: Tag each node with its source
3. **Deduplication**: Remove duplicates by node ID, prefer higher priority
4. **Node Linking**: Link nodes across sources by identifier
5. **Return**: Unified inventory with source metadata

### Facts Aggregation

When multiple sources provide facts:

1. **Query All Sources**: Parallel queries for node facts
2. **Organize by Source**: `{ bolt: {...}, puppetdb: {...}, puppetserver: {...} }`
3. **Timestamp**: Include timestamp for each source
4. **Return**: Facts from all sources with attribution

### Priority-Based Selection

When duplicate data exists:

- Higher priority sources take precedence
- Default priorities:
  - Bolt: 10
  - PuppetDB: 10
  - Puppetserver: 20
- Configurable per integration

## Health Monitoring

### Health Check System

**Components:**

1. **Plugin Health Checks**: Each plugin implements healthCheck()
2. **Health Check Scheduler**: Periodic checks every 60 seconds
3. **Health Check Cache**: Results cached for 5 minutes
4. **Health Status API**: Expose status via REST API

**Health Status:**

```typescript
interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: string;
  details?: Record<string, unknown>;
  degraded?: boolean;
  workingCapabilities?: string[];
  failingCapabilities?: string[];
}
```

**States:**

- **Healthy**: All checks pass, full functionality
- **Degraded**: Partial functionality, some features work
- **Unhealthy**: Integration not working
- **Unavailable**: Integration not configured or disabled

### Graceful Degradation

When an integration fails:

1. **Continue Operation**: Other integrations continue working
2. **Cache Fallback**: Use cached data if available
3. **User Notification**: Display error message in UI
4. **Retry Logic**: Automatic retry with exponential backoff
5. **Circuit Breaker**: Prevent cascading failures

## Error Handling

### Error Handling Strategy

1. **Plugin-Level**: Each plugin handles its own errors
2. **Manager-Level**: IntegrationManager catches and logs errors
3. **API-Level**: Routes return appropriate HTTP status codes
4. **UI-Level**: Frontend displays user-friendly error messages

### Error Types

- **Connection Errors**: Cannot reach integration endpoint
- **Authentication Errors**: Invalid credentials or tokens
- **Timeout Errors**: Request took too long
- **Validation Errors**: Invalid request parameters
- **Not Found Errors**: Resource doesn't exist
- **Internal Errors**: Unexpected errors in plugin logic

### Retry Logic

- Exponential backoff for transient errors
- Configurable retry attempts per integration
- Circuit breaker to prevent cascading failures
- Detailed logging of retry attempts

## Security

### Authentication

- **Token-Based**: PuppetDB, Puppetserver support API tokens
- **SSH Keys**: Bolt uses SSH keys for node access
- **SSL/TLS**: Secure communication with client certificates for API access

### Secrets Management

- Environment variables for sensitive configuration
- Automatic obfuscation in expert mode logs
- Never log sensitive data (tokens, passwords, keys)
- SSL certificates stored securely on filesystem
- Audit logging for execution history

### Access Control

- Role-based access control (future)
- Operation-level permissions (future)
- Audit trail for all operations

### Network Security

- HTTPS for all API communications
- Certificate validation
- Configurable SSL/TLS settings
- Network isolation options

## Performance Considerations

### Caching

- Health check results cached for 5 minutes
- Inventory data cached per source
- Facts cached with configurable TTL
- Cache invalidation on updates

### Parallel Execution

- Multi-source queries execute in parallel
- Health checks run concurrently
- Independent plugin failures don't block others

### Connection Pooling

- Reuse HTTP connections to integrations
- Configurable connection limits
- Connection timeout handling

### Optimization

- Lazy loading of node details
- Pagination for large datasets
- Efficient node linking algorithms
- Minimal data transfer

## Future Enhancements

### Potential Features (Not Currently Planned)

The following are potential future enhancements, not committed roadmap items:

1. **Additional Execution Tools**: Ansible, Salt, or other automation frameworks
2. **Multi-Tenancy**: Support multiple organizations with isolation
3. **Advanced RBAC**: Fine-grained role-based access control
4. **Webhooks**: Event-driven automation triggers
5. **Enhanced Monitoring**: Prometheus metrics, OpenTelemetry tracing
6. **Plugin Marketplace**: Community-contributed plugin ecosystem

### Extensibility

The plugin architecture is designed for easy extension:

1. Implement IntegrationPlugin interface
2. Extend BasePlugin for common functionality
3. Register with IntegrationManager
4. Configure via environment variables or config file

## Related Documentation

- [API Documentation](./api.md)
- [Integrations API](./integrations-api.md)
- [Configuration Guide](./configuration.md)
- [PuppetDB Integration Setup](./puppetdb-integration-setup.md)
- [Puppetserver Setup](./uppetserver-integration-setup.md)
- [Troubleshooting Guide](./troubleshooting.md)
