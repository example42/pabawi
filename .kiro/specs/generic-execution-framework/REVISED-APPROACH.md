# Revised Approach: Generic Execution Framework

## Executive Summary

After analyzing the existing v1.0.0 plugin infrastructure, we've revised the implementation plan to **leverage what's already built** rather than creating a separate execution framework layer. The new approach focuses on defining **standardized capability interfaces** that plugins implement, using the existing CapabilityRegistry, ExecutionQueue, and StreamingExecutionManager.

## What Already Exists ✅

### Core Infrastructure

- **BasePlugin**: Abstract class with lifecycle methods (initialize, healthCheck, shutdown)
- **CapabilityRegistry**: Central registry for capability-based routing with priority support
- **IntegrationManager**: Plugin management, discovery, and initialization
- **PluginLoader**: Automatic plugin discovery from `plugins/native/`

### Execution Services

- **ExecutionQueue**: Concurrency control with queuing (already handles async execution)
- **StreamingExecutionManager**: SSE-based output streaming with buffering
- **LoggerService**: Structured logging with context
- **PerformanceMonitorService**: Metrics collection

### Plugin Architecture

- **PluginMetadata**: Versioning, dependencies, integration types
- **PluginCapability**: Capability definition with handlers, permissions, schemas
- **PluginWidget**: Frontend widget registration
- **ExecutionContext**: User context, correlation IDs, metadata

## What Needs to be Built 🔨

### Phase 1: Standardized Capability Interfaces (1-2 days)

Create TypeScript interfaces for plugin capability types:

**Core Capabilities (Phase 1):**

1. **InventoryCapability** (`inventory.list`, `inventory.get`, `inventory.groups`, `inventory.filter`)
2. **FactsCapability** (`info.facts`, `info.refresh`)
3. **RemoteExecutionCapability** (`command.execute`, `task.execute`, `script.execute`)
4. **ReportsCapability** (`reports.list`, `reports.get`, `reports.query`)
5. **EventsCapability** (`events.list`, `events.stream`, `events.query`)

**Future Capabilities (Phase 4+):**
6. **ProvisioningCapability** (`provision.create`, `provision.status`, `decommission.execute`, `decommission.status`)
7. **SoftwareInstallationCapability** (`package.install`, `package.uninstall`, `package.update`, `package.list`, `package.search`)
8. **DeploymentCapability** (`deploy.execute`, `deploy.status`, `deploy.rollback`, `deploy.history`)
9. **AlertCapability** (`alert.list`, `alert.get`, `alert.acknowledge`, `alert.resolve`, `alert.subscribe`)

Each interface includes:

- Capability names (e.g., `inventory.list`)
- Input/output types
- Zod schemas for validation
- Integration points (ExecutionQueue, StreamingExecutionManager)

### Phase 2: Bolt Plugin Implementation (3-5 days)

Implement Bolt as the first execution plugin:

```typescript
class BoltPlugin extends BasePlugin {
  metadata = {
    name: 'bolt',
    version: '1.0.0',
    integrationType: IntegrationType.RemoteExecution,
    // ...
  };

  capabilities = [
    {
      category: 'inventory',
      name: 'inventory.list',
      handler: async (params, context) => {
        // Use Bolt inventory command
        // Map to standard Node[] format
      },
      // ...
    },
    {
      category: 'command',
      name: 'command.execute',
      handler: async (params, context) => {
        // Acquire slot from ExecutionQueue
        // Execute Bolt command
        // Stream output via StreamingExecutionManager
        // Return ExecutionResult
      },
      // ...
    },
    // ... more capabilities
  ];
}
```

### Phase 3: Optional Helper Services (as needed)

Create optional helper services that plugins can use:

- **InventoryCache**: In-memory cache with TTL
- **FactsCache**: Per-node fact caching
- **ExecutionLogger**: Structured execution logging
- **ErrorHandler**: Error categorization and retry logic

These are **opt-in** - plugins can use them or implement their own logic.

## Key Architectural Decisions

### 1. No Separate Framework Layer

**Original Plan**: Create ExecutionService, TaskOrchestrator, InventoryService, FactService, LoggingService as separate framework components.

**Revised Plan**: Plugins implement standardized capability interfaces directly. The existing CapabilityRegistry routes requests to the appropriate plugin.

**Why**: The v1.0.0 infrastructure already provides everything needed. Adding another layer would be redundant.

### 2. Capability-Based, Not Service-Based

**Original Plan**: Framework services that plugins call into.

**Revised Plan**: Plugins register capabilities that the framework routes to.

**Why**: This is how the v1.0.0 architecture works. CapabilityRegistry already handles routing, priority, permissions, and execution.

### 3. Self-Composing Plugin Types

Plugins declare their type via capabilities:

- **Inventory Source**: Provides `inventory.*` capabilities
- **Facts Provider**: Provides `info.facts` capability
- **Remote Execution**: Provides `command.execute`, `task.execute` capabilities
- **Reports Provider**: Provides `reports.*` capabilities
- **Events Provider**: Provides `events.*` capabilities
- **Provisioning Tool**: Provides `provision.*`, `decommission.*` capabilities
- **Package Manager**: Provides `package.*` capabilities
- **Deployment Tool**: Provides `deploy.*` capabilities
- **Monitoring/Alerting**: Provides `alert.*` capabilities

A single plugin can provide multiple types (e.g., Bolt provides inventory + facts + remote execution).

### 4. Integration Points, Not Implementations

The standardized interfaces define **how** to integrate with existing services:

```typescript
// Remote execution capability integrates with ExecutionQueue
async handler(params, context) {
  const executionId = generateId();
  
  // Acquire slot from ExecutionQueue
  await executionQueue.acquire({
    id: executionId,
    type: 'command',
    nodeId: params.targets[0],
    action: params.command,
    enqueuedAt: new Date()
  });
  
  try {
    // Execute command
    const result = await this.executeCommand(params);
    
    // Stream output if expert mode
    if (context.expertMode) {
      streamingManager.emitStdout(executionId, result.stdout);
    }
    
    return result;
  } finally {
    // Release slot
    executionQueue.release(executionId);
  }
}
```

## Migration Path

### For Existing Plugins

Existing v1.0.0 plugins continue to work as-is. They can optionally adopt the standardized interfaces for better interoperability.

### For New Plugins

New plugins should implement the standardized capability interfaces to ensure consistency across the system.

### For Bolt Plugin

Bolt will be the first plugin to fully implement the standardized interfaces, serving as a reference implementation.

## Benefits of Revised Approach

1. **Faster Implementation**: Leverage existing infrastructure instead of rebuilding
2. **Less Code**: No duplicate services, just interface definitions
3. **Better Integration**: Uses existing CapabilityRegistry, ExecutionQueue, StreamingExecutionManager
4. **Incremental Adoption**: Existing plugins continue working, new plugins adopt standards
5. **Simpler Architecture**: One routing layer (CapabilityRegistry) instead of two
6. **Proven Patterns**: Uses the v1.0.0 architecture that's already working

## Comparison: Original vs Revised

| Aspect | Original Plan | Revised Plan |
|--------|--------------|--------------|
| **Framework Layer** | New ExecutionService, TaskOrchestrator, etc. | Use existing CapabilityRegistry |
| **Execution Queue** | New integration | Use existing ExecutionQueue |
| **Output Streaming** | New implementation | Use existing StreamingExecutionManager |
| **Plugin Interface** | New ExecutionPluginInterface | Extend existing BasePluginInterface |
| **Routing** | Framework routes to plugins | CapabilityRegistry routes to plugins |
| **Caching** | Framework-level services | Optional plugin-level helpers |
| **Lines of Code** | ~5000+ new lines | ~1000 new lines (interfaces + Bolt) |
| **Time to MVP** | 3-4 weeks | 1-2 weeks |

## Next Steps

1. **Review and approve** this revised approach
2. **Phase 1**: Define standardized capability interfaces (1-2 days)
   - Core: Inventory, Facts, Remote Execution, Reports, Events
   - Future: Provisioning, Software Installation, Deployment, Alerts
3. **Phase 2**: Implement Bolt plugin (3-5 days)
4. **Test end-to-end**: Verify Bolt works with existing infrastructure
5. **Phase 3+**: Implement additional plugins incrementally
   - PuppetDB, Puppetserver (Puppet ecosystem)
   - Terraform (provisioning/decommissioning)
   - Package managers (apt, yum, chocolatey)
   - CI/CD tools (Jenkins, GitLab CI, GitHub Actions)
   - Monitoring tools (Prometheus, Grafana, Nagios, Datadog)

## Questions to Address

1. **Caching Strategy**: Should we provide optional cache helpers, or let each plugin implement their own?
   - **Recommendation**: Provide optional helpers that plugins can use

2. **Error Handling**: Standardize error types across plugins?
   - **Recommendation**: Define standard error categories in capability interfaces

3. **Logging**: Should execution logging be mandatory or optional?
   - **Recommendation**: Optional but recommended, with helper service available

4. **Node Journal**: When to integrate?
   - **Recommendation**: Phase 5, after core plugins are working
