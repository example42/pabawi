/**
 * Integration Manager Service
 *
 * Central service for managing all integration plugins in Pabawi.
 *
 * ## v1.0.0 Architecture
 *
 * This version introduces capability-based plugin architecture:
 * - **CapabilityRegistry**: Central registry for capability-based routing
 * - **PluginLoader**: Automatic plugin discovery and loading
 * - **BasePluginInterface**: New unified plugin interface
 *
 * ### Migration Path
 *
 * Legacy plugins (ExecutionToolPlugin, InformationSourcePlugin) are still supported
 * but deprecated. New plugins should implement BasePluginInterface and register
 * capabilities with the CapabilityRegistry.
 *
 * ### Preferred APIs (v1.0.0+)
 *
 * - `executeCapability()` - Execute any capability by name
 * - `getInventoryViaCapability()` - Get inventory using capability routing
 * - `getNodeFactsViaCapability()` - Get facts using capability routing
 * - `getCapabilitiesByCategory()` - List capabilities by category
 * - `getAllCapabilities()` - List all registered capabilities
 *
 * ### Deprecated APIs (will be removed in v2.0.0)
 *
 * - `getExecutionTool()` - Use executeCapability() with 'command.execute'
 * - `getInformationSource()` - Use executeCapability() with 'inventory.list'
 * - `getAllExecutionTools()` - Use getCapabilitiesByCategory('command')
 * - `getAllInformationSources()` - Use getCapabilitiesByCategory('inventory')
 *
 * @module integrations/IntegrationManager
 * @version 1.0.0
 */

import type {
  IntegrationPlugin,
  ExecutionToolPlugin,
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
  PluginRegistration,
  Action,
  PluginMetadata,
  BasePluginInterface,
} from "./types";
import type { Node, Facts, ExecutionResult } from "../bolt/types";
import { NodeLinkingService, type LinkedNode } from "./NodeLinkingService";
import { LoggerService } from "../services/LoggerService";
import {
  CapabilityRegistry,
  type User,
  type DebugContext,
  type CapabilityExecutionResult,
  type RegisteredCapability,
} from "./CapabilityRegistry";
import {
  PluginLoader,
  type LoadedPlugin,
  type PluginLoaderOptions,
} from "./PluginLoader";

/**
 * Health check cache entry
 */
export interface HealthCheckCacheEntry {
  status: HealthStatus;
  cachedAt: string;
}

/**
 * Aggregated inventory from multiple sources
 */
export interface AggregatedInventory {
  nodes: Node[];
  sources: Record<
    string,
    {
      nodeCount: number;
      lastSync: string;
      status: "healthy" | "degraded" | "unavailable";
    }
  >;
}

/**
 * Aggregated node data from multiple sources
 */
export interface AggregatedNodeData {
  node: Node;
  facts: Record<string, Facts>;
  executionHistory: ExecutionResult[];
  additionalData?: Record<string, Record<string, unknown>>;
}

/**
 * Integration Manager
 *
 * Manages all integration plugins and provides unified access to:
 * - Plugin registration and initialization
 * - Plugin routing (finding the right plugin for a task)
 * - Health check aggregation across all plugins
 * - Multi-source data aggregation (inventory, facts, etc.)
 * - Periodic health check scheduling with caching
 */
export class IntegrationManager {
  private plugins = new Map<string, PluginRegistration>();
  /**
   * @deprecated v1.0.0 - Use CapabilityRegistry with 'command.*' and 'task.*' capabilities instead.
   * Will be removed in v2.0.0.
   */
  private executionTools = new Map<string, ExecutionToolPlugin>();
  /**
   * @deprecated v1.0.0 - Use CapabilityRegistry with 'inventory.*' and 'info.*' capabilities instead.
   * Will be removed in v2.0.0.
   */
  private informationSources = new Map<string, InformationSourcePlugin>();
  private initialized = false;
  private nodeLinkingService: NodeLinkingService;
  private logger: LoggerService;

  // Health check scheduling
  private healthCheckCache = new Map<string, HealthCheckCacheEntry>();
  private healthCheckInterval?: NodeJS.Timeout;
  private healthCheckIntervalMs: number;
  private healthCheckCacheTTL: number;

  // v1.0.0 Plugin Infrastructure
  private capabilityRegistry: CapabilityRegistry;
  private pluginLoader: PluginLoader;
  private v1Plugins = new Map<string, LoadedPlugin>();
  private v1Initialized = false;

  constructor(options?: {
    healthCheckIntervalMs?: number;
    healthCheckCacheTTL?: number;
    logger?: LoggerService;
    // v1.0.0 options
    pluginLoaderOptions?: Partial<PluginLoaderOptions>;
  }) {
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs ?? 60000; // Default: 1 minute
    this.healthCheckCacheTTL = options?.healthCheckCacheTTL ?? 300000; // Default: 5 minutes
    this.logger = options?.logger ?? new LoggerService();
    this.nodeLinkingService = new NodeLinkingService(this);

    // Initialize v1.0.0 plugin infrastructure
    this.capabilityRegistry = new CapabilityRegistry(this.logger);
    this.pluginLoader = new PluginLoader({
      logger: this.logger,
      ...options?.pluginLoaderOptions,
    });

    this.logger.info("IntegrationManager created", { component: "IntegrationManager" });
  }

  /**
   * Register a plugin with the manager
   *
   * @param plugin - Plugin instance to register
   * @param config - Configuration for the plugin
   * @throws Error if plugin with same name already registered
   */
  registerPlugin(plugin: IntegrationPlugin, config: IntegrationConfig): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    const registration: PluginRegistration = {
      plugin,
      config,
      registeredAt: new Date().toISOString(),
    };

    this.plugins.set(plugin.name, registration);

    // Add to type-specific maps
    if (plugin.type === "execution" || plugin.type === "both") {
      this.executionTools.set(plugin.name, plugin as ExecutionToolPlugin);
    }

    if (plugin.type === "information" || plugin.type === "both") {
      this.informationSources.set(
        plugin.name,
        plugin as InformationSourcePlugin,
      );
    }

    this.logger.info(`Registered plugin: ${plugin.name} (${plugin.type})`, {
      component: "IntegrationManager",
      operation: "registerPlugin",
      metadata: { pluginName: plugin.name, pluginType: plugin.type },
    });
  }

  /**
   * Register a v1.0.0 capability-based plugin
   *
   * This method registers plugins that implement BasePluginInterface.
   * Capabilities and widgets are automatically registered with the CapabilityRegistry.
   *
   * @param plugin - Plugin instance implementing BasePluginInterface
   * @param options - Registration options
   * @param options.priority - Priority for capability routing (default: 10)
   * @throws Error if plugin with same name already registered
   */
  registerCapabilityPlugin(
    plugin: BasePluginInterface,
    options?: { priority?: number }
  ): void {
    const pluginName = plugin.metadata.name;
    const priority = options?.priority ?? 10;

    if (this.v1Plugins.has(pluginName)) {
      throw new Error(`Plugin '${pluginName}' is already registered`);
    }

    // Create LoadedPlugin wrapper for the v1Plugins map
    const loadedPlugin: LoadedPlugin = {
      instance: plugin,
      discovery: {
        path: "builtin",
        source: "builtin",
        name: pluginName,
        hasPackageJson: false,
        entryPoint: "direct-registration",
      },
      loadedAt: new Date().toISOString(),
      loadDurationMs: 0,
      warnings: [],
    };

    this.v1Plugins.set(pluginName, loadedPlugin);

    // Register capabilities with the registry
    for (const capability of plugin.capabilities) {
      this.capabilityRegistry.registerCapability(pluginName, capability, priority);
    }

    // Register widgets if present
    if (plugin.widgets) {
      for (const widget of plugin.widgets) {
        this.capabilityRegistry.registerWidget(pluginName, widget);
      }
    }

    this.logger.info(`Registered capability plugin: ${pluginName}`, {
      component: "IntegrationManager",
      operation: "registerCapabilityPlugin",
      metadata: {
        pluginName,
        priority,
        capabilityCount: plugin.capabilities.length,
        widgetCount: plugin.widgets?.length ?? 0,
        integrationType: plugin.metadata.integrationType,
      },
    });
  }

  /**
   * Initialize all registered plugins
   *
   * Initializes both legacy plugins (registered via registerPlugin) and
   * v1.0.0 capability-based plugins (discovered via PluginLoader).
   *
   * In v1.0.0+, this method:
   * 1. Initializes legacy plugins for backward compatibility
   * 2. Loads and initializes v1.0.0 plugins via PluginLoader
   * 3. Registers all capabilities with CapabilityRegistry
   *
   * @param options - Initialization options
   * @param options.loadV1Plugins - Whether to load v1.0.0 plugins (default: true)
   * @param options.skipLegacy - Skip legacy plugin initialization (default: false)
   * @returns Array of initialization errors (empty if all succeeded)
   */
  async initializePlugins(options?: {
    loadV1Plugins?: boolean;
    skipLegacy?: boolean;
  }): Promise<{ plugin: string; error: Error }[]> {
    const { loadV1Plugins = true, skipLegacy = false } = options ?? {};
    const errors: { plugin: string; error: Error }[] = [];

    // Initialize legacy plugins unless skipped
    if (!skipLegacy && this.plugins.size > 0) {
      this.logger.info(`Initializing ${String(this.plugins.size)} legacy plugins...`, {
        component: "IntegrationManager",
        operation: "initializePlugins",
        metadata: { pluginCount: this.plugins.size, mode: "legacy" },
      });

      for (const [name, registration] of this.plugins) {
        try {
          await registration.plugin.initialize(registration.config);
          this.logger.info(`Initialized legacy plugin: ${name}`, {
            component: "IntegrationManager",
            operation: "initializePlugins",
            metadata: { pluginName: name, mode: "legacy" },
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push({ plugin: name, error: err });
          this.logger.error(`Failed to initialize legacy plugin '${name}'`, {
            component: "IntegrationManager",
            operation: "initializePlugins",
            metadata: { pluginName: name, mode: "legacy" },
          }, err);
        }
      }
    }

    // Load and initialize v1.0.0 plugins
    if (loadV1Plugins) {
      this.logger.info("Loading v1.0.0 capability-based plugins...", {
        component: "IntegrationManager",
        operation: "initializePlugins",
        metadata: { mode: "v1.0.0" },
      });

      try {
        const loadResult = await this.loadPluginsV1();
        if (loadResult.errors.length > 0) {
          errors.push(...loadResult.errors);
        }

        const initErrors = await this.initializePluginsV1();
        errors.push(...initErrors);

        this.logger.info(
          `v1.0.0 plugins loaded: ${String(loadResult.loaded.length)}, capabilities registered: ${String(this.capabilityRegistry.getAllCapabilities().length)}`,
          {
            component: "IntegrationManager",
            operation: "initializePlugins",
            metadata: {
              loadedCount: loadResult.loaded.length,
              capabilityCount: this.capabilityRegistry.getAllCapabilities().length,
              mode: "v1.0.0",
            },
          }
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error("Failed to load v1.0.0 plugins", {
          component: "IntegrationManager",
          operation: "initializePlugins",
          metadata: { mode: "v1.0.0" },
        }, err);
        // Don't add to errors - v1.0.0 loading failure shouldn't block legacy
      }
    }

    this.initialized = true;
    this.logger.info(
      `Plugin initialization complete. ${String(errors.length)} errors.`,
      {
        component: "IntegrationManager",
        operation: "initializePlugins",
        metadata: {
          errorCount: errors.length,
          legacyPluginCount: this.plugins.size,
          v1PluginCount: this.v1Plugins.size,
        },
      }
    );

    return errors;
  }

  /**
   * Get an execution tool plugin by name
   *
   * @deprecated v1.0.0 - Use `executeCapability()` with capability names like 'command.execute' or 'task.execute'.
   * Will be removed in v2.0.0.
   *
   * @param name - Plugin name
   * @returns Plugin instance or null if not found
   */
  getExecutionTool(name: string): ExecutionToolPlugin | null {
    this.logger.warn(
      `getExecutionTool('${name}') is deprecated. Use executeCapability() instead.`,
      { component: "IntegrationManager", operation: "getExecutionTool" }
    );
    return this.executionTools.get(name) ?? null;
  }

  /**
   * Get an information source plugin by name
   *
   * @deprecated v1.0.0 - Use `executeCapability()` with capability names like 'inventory.list' or 'info.facts'.
   * Will be removed in v2.0.0.
   *
   * @param name - Plugin name
   * @returns Plugin instance or null if not found
   */
  getInformationSource(name: string): InformationSourcePlugin | null {
    this.logger.warn(
      `getInformationSource('${name}') is deprecated. Use executeCapability() instead.`,
      { component: "IntegrationManager", operation: "getInformationSource" }
    );
    return this.informationSources.get(name) ?? null;
  }

  /**
   * Get all registered execution tools
   *
   * @deprecated v1.0.0 - Use `getCapabilitiesByCategory('command')` or `getCapabilitiesByCategory('task')` instead.
   * Will be removed in v2.0.0.
   *
   * @returns Array of execution tool plugins
   */
  getAllExecutionTools(): ExecutionToolPlugin[] {
    this.logger.warn(
      "getAllExecutionTools() is deprecated. Use getCapabilitiesByCategory() instead.",
      { component: "IntegrationManager", operation: "getAllExecutionTools" }
    );
    return Array.from(this.executionTools.values());
  }

  /**
   * Get all registered information sources
   *
   * @deprecated v1.0.0 - Use `getCapabilitiesByCategory('inventory')` or `getCapabilitiesByCategory('info')` instead.
   * Will be removed in v2.0.0.
   *
   * @returns Array of information source plugins
   */
  getAllInformationSources(): InformationSourcePlugin[] {
    this.logger.warn(
      "getAllInformationSources() is deprecated. Use getCapabilitiesByCategory() instead.",
      { component: "IntegrationManager", operation: "getAllInformationSources" }
    );
    return Array.from(this.informationSources.values());
  }

  /**
   * Get all registered plugins
   *
   * @returns Array of all plugin registrations
   */
  getAllPlugins(): PluginRegistration[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Execute an action using the specified execution tool
   *
   * @param toolName - Name of the execution tool to use
   * @param action - Action to execute
   * @returns Execution result
   * @throws Error if tool not found or not initialized
   */
  async executeAction(
    toolName: string,
    action: Action,
  ): Promise<ExecutionResult> {
    const tool = this.getExecutionTool(toolName);

    if (!tool) {
      throw new Error(`Execution tool '${toolName}' not found`);
    }

    if (!tool.isInitialized()) {
      throw new Error(`Execution tool '${toolName}' is not initialized`);
    }

    return await tool.executeAction(action);
  }

  // ============================================================================
  // v1.0.0 Capability-Based Data Access Methods
  // ============================================================================

  /**
   * Get inventory using capability-based routing
   *
   * This is the v1.0.0 way to retrieve inventory data. It queries all plugins
   * that provide the 'inventory.list' capability and aggregates results by priority.
   *
   * @param user - User context for permission checking
   * @param debugContext - Optional debug context for tracing
   * @returns Aggregated inventory from all capable plugins
   */
  async getInventoryViaCapability(
    user: User,
    debugContext?: DebugContext
  ): Promise<AggregatedInventory> {
    const startTime = Date.now();
    const sources: AggregatedInventory["sources"] = {};
    const allNodes: Node[] = [];
    const now = new Date().toISOString();

    // Get all plugins providing inventory.list capability
    const inventoryProviders = this.capabilityRegistry.getProvidersForCapability("inventory.list");

    if (inventoryProviders.length === 0) {
      this.logger.warn("No plugins provide 'inventory.list' capability, falling back to legacy", {
        component: "IntegrationManager",
        operation: "getInventoryViaCapability",
      });
      // Fall back to legacy method
      return this.getAggregatedInventory();
    }

    this.logger.debug(`Found ${String(inventoryProviders.length)} inventory providers`, {
      component: "IntegrationManager",
      operation: "getInventoryViaCapability",
      metadata: { providerCount: inventoryProviders.length },
    });

    // Query all providers in parallel
    const inventoryPromises = inventoryProviders.map(async (registered) => {
      try {
        const result = await this.capabilityRegistry.executeCapability<Node[]>(
          user,
          "inventory.list",
          {},
          debugContext
        );

        if (result.success && result.data) {
          const nodesWithSource = result.data.map((node) => ({
            ...node,
            source: registered.pluginName,
          }));

          sources[registered.pluginName] = {
            nodeCount: result.data.length,
            lastSync: now,
            status: "healthy" as const,
          };

          return nodesWithSource;
        } else {
          sources[registered.pluginName] = {
            nodeCount: 0,
            lastSync: now,
            status: "unavailable" as const,
          };
          return [];
        }
      } catch (error) {
        this.logger.error(`Failed to get inventory from '${registered.pluginName}'`, {
          component: "IntegrationManager",
          operation: "getInventoryViaCapability",
          metadata: { pluginName: registered.pluginName },
        }, error instanceof Error ? error : new Error(String(error)));

        sources[registered.pluginName] = {
          nodeCount: 0,
          lastSync: now,
          status: "unavailable" as const,
        };
        return [];
      }
    });

    const results = await Promise.all(inventoryPromises);

    // Flatten all nodes
    for (const nodes of results) {
      allNodes.push(...nodes);
    }

    // Deduplicate nodes by ID (prefer higher priority sources)
    const uniqueNodes = this.deduplicateNodes(allNodes);

    this.logger.info(
      `Capability-based inventory: ${String(uniqueNodes.length)} unique nodes from ${String(inventoryProviders.length)} providers (${String(Date.now() - startTime)}ms)`,
      {
        component: "IntegrationManager",
        operation: "getInventoryViaCapability",
        metadata: {
          uniqueNodes: uniqueNodes.length,
          providers: inventoryProviders.length,
          durationMs: Date.now() - startTime,
        },
      }
    );

    return {
      nodes: uniqueNodes,
      sources,
    };
  }

  /**
   * Get facts for a node using capability-based routing
   *
   * Queries plugins providing 'info.facts' capability for the specified node.
   *
   * @param user - User context for permission checking
   * @param nodeId - Node identifier
   * @param debugContext - Optional debug context
   * @returns Facts from the highest priority provider
   * @throws Error if no facts available or capability execution fails
   */
  async getNodeFactsViaCapability(
    user: User,
    nodeId: string,
    debugContext?: DebugContext
  ): Promise<Facts> {
    const result = await this.capabilityRegistry.executeCapability<Facts>(
      user,
      "info.facts",
      { nodeId },
      debugContext
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? `Failed to get facts for node '${nodeId}'`);
    }

    return result.data;
  }

  // ============================================================================
  // Legacy Data Aggregation Methods (for backward compatibility)
  // ============================================================================

  /**
   * Get linked inventory from all information sources
   *
   * Queries all information sources, links nodes across sources, and returns
   * nodes with source attribution and multi-source indicators.
   *
   * @returns Linked inventory with source attribution
   */
  async getLinkedInventory(): Promise<{
    nodes: LinkedNode[];
    sources: AggregatedInventory["sources"];
  }> {
    // Get aggregated inventory
    const aggregated = await this.getAggregatedInventory();

    // Link nodes across sources
    const linkedNodes = this.nodeLinkingService.linkNodes(aggregated.nodes);

    return {
      nodes: linkedNodes,
      sources: aggregated.sources,
    };
  }

  /**
   * Get aggregated inventory from all information sources
   *
   * Queries all information sources in parallel and combines results.
   * Continues even if some sources fail.
   *
   * @returns Aggregated inventory with source attribution
   */
  async getAggregatedInventory(): Promise<AggregatedInventory> {
    this.logger.debug("Starting getAggregatedInventory", {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
    });
    this.logger.debug(
      `Total information sources registered: ${String(this.informationSources.size)}`,
      {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
        metadata: { sourceCount: this.informationSources.size },
      }
    );

    // Log all registered information sources
    for (const [name, source] of this.informationSources.entries()) {
      this.logger.debug(
        `Source: ${name}, Type: ${source.type}, Initialized: ${String(source.isInitialized())}`,
        {
          component: "IntegrationManager",
          operation: "getAggregatedInventory",
          metadata: { sourceName: name, sourceType: source.type, initialized: source.isInitialized() },
        }
      );
    }

    const sources: AggregatedInventory["sources"] = {};
    const allNodes: Node[] = [];
    const now = new Date().toISOString();

    // Get inventory from all sources in parallel
    const inventoryPromises = Array.from(this.informationSources.entries()).map(
      async ([name, source]) => {
        this.logger.debug(`Processing source: ${name}`, {
          component: "IntegrationManager",
          operation: "getAggregatedInventory",
          metadata: { sourceName: name },
        });

        try {
          if (!source.isInitialized()) {
            this.logger.warn(`Source '${name}' is not initialized - skipping`, {
              component: "IntegrationManager",
              operation: "getAggregatedInventory",
              metadata: { sourceName: name },
            });
            sources[name] = {
              nodeCount: 0,
              lastSync: now,
              status: "unavailable",
            };
            return [];
          }

          this.logger.debug(`Calling getInventory() on source '${name}'`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name },
          });
          const nodes = await source.getInventory();
          this.logger.debug(`Source '${name}' returned ${String(nodes.length)} nodes`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name, nodeCount: nodes.length },
          });

          // Log sample of nodes for debugging
          if (nodes.length > 0) {
            const sampleNode = nodes[0];
            this.logger.debug(
              `Sample node from '${name}': ${JSON.stringify(sampleNode).substring(0, 200)}`,
              {
                component: "IntegrationManager",
                operation: "getAggregatedInventory",
                metadata: { sourceName: name },
              }
            );
          }

          // Add source attribution to each node
          const nodesWithSource = nodes.map((node) => ({
            ...node,
            source: name,
          }));

          sources[name] = {
            nodeCount: nodes.length,
            lastSync: now,
            status: "healthy",
          };

          this.logger.debug(
            `Successfully processed ${String(nodes.length)} nodes from '${name}'`,
            {
              component: "IntegrationManager",
              operation: "getAggregatedInventory",
              metadata: { sourceName: name, nodeCount: nodes.length },
            }
          );
          return nodesWithSource;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Failed to get inventory from '${name}'`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name },
          }, err);
          sources[name] = {
            nodeCount: 0,
            lastSync: now,
            status: "unavailable",
          };
          return [];
        }
      },
    );

    const results = await Promise.all(inventoryPromises);
    this.logger.debug(`Received results from ${String(results.length)} sources`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { resultCount: results.length },
    });

    // Flatten all nodes
    for (const nodes of results) {
      this.logger.debug(`Adding ${String(nodes.length)} nodes to allNodes array`, {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
        metadata: { nodeCount: nodes.length },
      });
      allNodes.push(...nodes);
    }

    this.logger.debug(`Total nodes before deduplication: ${String(allNodes.length)}`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { totalNodes: allNodes.length },
    });

    // Deduplicate nodes by ID (prefer higher priority sources)
    const uniqueNodes = this.deduplicateNodes(allNodes);
    this.logger.info(`Total nodes after deduplication: ${String(uniqueNodes.length)}`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { uniqueNodes: uniqueNodes.length },
    });

    // Log source breakdown
    const sourceBreakdown: Record<string, number> = {};
    for (const node of uniqueNodes) {
      const nodeSource =
        (node as Node & { source?: string }).source ?? "unknown";
      sourceBreakdown[nodeSource] = (sourceBreakdown[nodeSource] ?? 0) + 1;
    }
    this.logger.debug("Node breakdown by source", {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { sourceBreakdown },
    });

    this.logger.debug("Completed getAggregatedInventory", {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
    });

    return {
      nodes: uniqueNodes,
      sources,
    };
  }

  /**
   * Get linked data for a specific node
   *
   * Queries all information sources for the node, links data across sources,
   * and returns aggregated data with source attribution.
   *
   * @param nodeId - Node identifier
   * @returns Linked node data from all sources
   */
  async getLinkedNodeData(nodeId: string): Promise<{
    node: LinkedNode;
    dataBySource: Record<string, unknown>;
  }> {
    return await this.nodeLinkingService.getLinkedNodeData(nodeId);
  }

  /**
   * Get aggregated data for a specific node
   *
   * Queries all information sources for the node and combines results.
   *
   * @param nodeId - Node identifier
   * @returns Aggregated node data from all sources
   */
  async getNodeData(nodeId: string): Promise<AggregatedNodeData> {
    const facts: Record<string, Facts> = {};
    const additionalData: Record<string, Record<string, unknown>> = {};

    // Get node from first available source
    let node: Node | null = null;
    for (const source of this.informationSources.values()) {
      if (!source.isInitialized()) continue;

      try {
        const inventory = await source.getInventory();
        node = inventory.find((n) => n.id === nodeId) ?? null;
        if (node) break;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Failed to get node from '${source.name}'`, {
          component: "IntegrationManager",
          operation: "getNodeData",
          metadata: { sourceName: source.name, nodeId },
        }, err);
      }
    }

    if (!node) {
      throw new Error(`Node '${nodeId}' not found in any source`);
    }

    // Get facts from all sources in parallel
    const factsPromises = Array.from(this.informationSources.entries()).map(
      async ([name, source]) => {
        try {
          if (!source.isInitialized()) return;

          const nodeFacts = await source.getNodeFacts(nodeId);
          facts[name] = nodeFacts;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `Failed to get facts from '${name}' for node '${nodeId}'`,
            {
              component: "IntegrationManager",
              operation: "getNodeData",
              metadata: { sourceName: name, nodeId },
            },
            err
          );
        }
      },
    );

    await Promise.all(factsPromises);

    return {
      node,
      facts,
      executionHistory: [], // Will be populated by execution history service
      additionalData,
    };
  }

  /**
   * Perform health checks on all plugins
   *
   * @param useCache - If true, return cached results if available and not expired
   * @returns Map of plugin names to health status
   */
  async healthCheckAll(useCache = false): Promise<Map<string, HealthStatus>> {
    // If cache is requested, check for valid cached results
    if (useCache && this.healthCheckCache.size > 0) {
      const now = Date.now();
      const allCached = Array.from(this.plugins.keys()).every((name) => {
        const cached = this.healthCheckCache.get(name);
        if (!cached) return false;

        const cacheAge = now - new Date(cached.cachedAt).getTime();
        return cacheAge < this.healthCheckCacheTTL;
      });

      if (allCached) {
        this.logger.debug("Returning cached health check results", {
          component: "IntegrationManager",
          operation: "healthCheckAll",
        });
        const cachedResults = new Map<string, HealthStatus>();
        for (const [name, entry] of this.healthCheckCache) {
          cachedResults.set(name, entry.status);
        }
        return cachedResults;
      }
    }

    const healthStatuses = new Map<string, HealthStatus>();

    const healthCheckPromises = Array.from(this.plugins.entries()).map(
      async ([name, registration]) => {
        try {
          const status = await registration.plugin.healthCheck();
          healthStatuses.set(name, status);

          // Update cache
          this.healthCheckCache.set(name, {
            status,
            cachedAt: new Date().toISOString(),
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const status: HealthStatus = {
            healthy: false,
            message: `Health check failed: ${errorMessage}`,
            lastCheck: new Date().toISOString(),
          };
          healthStatuses.set(name, status);

          // Update cache with error status
          this.healthCheckCache.set(name, {
            status,
            cachedAt: new Date().toISOString(),
          });
        }
      },
    );

    await Promise.all(healthCheckPromises);

    return healthStatuses;
  }

  /**
   * Start periodic health check scheduling
   *
   * Health checks will run at the configured interval and results will be cached.
   * Subsequent calls to healthCheckAll(true) will return cached results if not expired.
   */
  startHealthCheckScheduler(): void {
    if (this.healthCheckInterval) {
      this.logger.info("Health check scheduler already running", {
        component: "IntegrationManager",
        operation: "startHealthCheckScheduler",
      });
      return;
    }

    this.logger.info(
      `Starting health check scheduler (interval: ${String(this.healthCheckIntervalMs)}ms, TTL: ${String(this.healthCheckCacheTTL)}ms)`,
      {
        component: "IntegrationManager",
        operation: "startHealthCheckScheduler",
        metadata: {
          intervalMs: this.healthCheckIntervalMs,
          cacheTTL: this.healthCheckCacheTTL,
        },
      }
    );

    // Run initial health check
    void this.healthCheckAll(false);

    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      void this.healthCheckAll(false);
    }, this.healthCheckIntervalMs);

    this.logger.info("Health check scheduler started", {
      component: "IntegrationManager",
      operation: "startHealthCheckScheduler",
    });
  }

  /**
   * Stop periodic health check scheduling
   */
  stopHealthCheckScheduler(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info("Health check scheduler stopped", {
        component: "IntegrationManager",
        operation: "stopHealthCheckScheduler",
      });
    }
  }

  /**
   * Clear the health check cache
   */
  clearHealthCheckCache(): void {
    this.healthCheckCache.clear();
    this.logger.debug("Health check cache cleared", {
      component: "IntegrationManager",
      operation: "clearHealthCheckCache",
    });
  }

  /**
   * Get the current health check cache
   *
   * @returns Map of plugin names to cached health check entries
   */
  getHealthCheckCache(): Map<string, HealthCheckCacheEntry> {
    return new Map(this.healthCheckCache);
  }

  /**
   * Check if the manager is initialized
   *
   * @returns true if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the number of registered plugins
   *
   * @returns Plugin count
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Unregister a plugin
   *
   * @param name - Plugin name
   * @returns true if plugin was unregistered, false if not found
   */
  unregisterPlugin(name: string): boolean {
    const registration = this.plugins.get(name);
    if (!registration) {
      return false;
    }

    this.plugins.delete(name);
    this.executionTools.delete(name);
    this.informationSources.delete(name);

    this.logger.info(`Unregistered plugin: ${name}`, {
      component: "IntegrationManager",
      operation: "unregisterPlugin",
      metadata: { pluginName: name },
    });
    return true;
  }

  /**
   * Deduplicate nodes by ID, preferring nodes from higher priority sources
   *
   * @param nodes - Array of nodes potentially with duplicates
   * @returns Deduplicated array of nodes
   */
  private deduplicateNodes(nodes: Node[]): Node[] {
    const nodeMap = new Map<string, Node>();

    for (const node of nodes) {
      const existing = nodeMap.get(node.id);

      if (!existing) {
        nodeMap.set(node.id, node);
        continue;
      }

      // Get priority for both nodes
      const existingSource = (existing as Node & { source?: string }).source;
      const newSource = (node as Node & { source?: string }).source;

      const existingPriority = existingSource
        ? (this.plugins.get(existingSource)?.config.priority ?? 0)
        : 0;
      const newPriority = newSource
        ? (this.plugins.get(newSource)?.config.priority ?? 0)
        : 0;

      // Keep node from higher priority source
      if (newPriority > existingPriority) {
        nodeMap.set(node.id, node);
      }
    }

    return Array.from(nodeMap.values());
  }

  // ============================================================================
  // v1.0.0 Plugin Infrastructure APIs
  // ============================================================================

  /**
   * Load and initialize v1.0.0 plugins
   *
   * Discovers, loads, and initializes plugins using the new capability-based
   * architecture. Can be called independently of legacy plugin initialization.
   *
   * @returns Results of plugin loading
   */
  async loadPluginsV1(): Promise<{
    loaded: string[];
    errors: { plugin: string; error: Error }[];
  }> {
    this.logger.info("Loading v1.0.0 plugins...", {
      component: "IntegrationManager",
      operation: "loadPluginsV1",
    });

    const loadedPlugins: string[] = [];
    const errors: { plugin: string; error: Error }[] = [];

    try {
      // Load all discovered plugins
      const loadResults = await this.pluginLoader.loadAll();

      for (const loadedPlugin of loadResults) {
        try {
          this.v1Plugins.set(loadedPlugin.discovery.name, loadedPlugin);
          loadedPlugins.push(loadedPlugin.discovery.name);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push({
            plugin: loadedPlugin.discovery.name,
            error: err,
          });
        }
      }

      this.logger.info(
        `Loaded ${String(loadedPlugins.length)} v1.0.0 plugin(s)`,
        {
          component: "IntegrationManager",
          operation: "loadPluginsV1",
          metadata: { loadedCount: loadedPlugins.length, errorCount: errors.length },
        }
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Failed to load v1.0.0 plugins", {
        component: "IntegrationManager",
        operation: "loadPluginsV1",
      }, err);
      throw err;
    }

    return { loaded: loadedPlugins, errors };
  }

  /**
   * Initialize all loaded v1.0.0 plugins
   *
   * Calls initialize() on each loaded plugin and registers their capabilities
   * with the CapabilityRegistry.
   *
   * @returns Array of initialization errors
   */
  async initializePluginsV1(): Promise<{ plugin: string; error: Error }[]> {
    const errors: { plugin: string; error: Error }[] = [];

    this.logger.info(`Initializing ${String(this.v1Plugins.size)} v1.0.0 plugins...`, {
      component: "IntegrationManager",
      operation: "initializePluginsV1",
      metadata: { pluginCount: this.v1Plugins.size },
    });

    for (const [name, loadedPlugin] of this.v1Plugins) {
      try {
        // Initialize the plugin
        await loadedPlugin.instance.initialize();

        // Get priority from plugin if available, or use default
        const priority = 10; // Default priority

        // Register plugin capabilities
        if (loadedPlugin.instance.capabilities) {
          for (const capability of loadedPlugin.instance.capabilities) {
            this.capabilityRegistry.registerCapability(
              name,
              capability,
              priority
            );
          }
        }

        // Register plugin widgets
        if (loadedPlugin.instance.widgets) {
          for (const widget of loadedPlugin.instance.widgets) {
            this.capabilityRegistry.registerWidget(name, widget);
          }
        }

        this.logger.info(`Initialized v1.0.0 plugin: ${name}`, {
          component: "IntegrationManager",
          operation: "initializePluginsV1",
          metadata: {
            pluginName: name,
            capabilityCount: loadedPlugin.instance.capabilities?.length ?? 0,
            widgetCount: loadedPlugin.instance.widgets?.length ?? 0,
          },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ plugin: name, error: err });
        this.logger.error(`Failed to initialize v1.0.0 plugin '${name}'`, {
          component: "IntegrationManager",
          operation: "initializePluginsV1",
          metadata: { pluginName: name },
        }, err);
      }
    }

    this.v1Initialized = true;

    this.logger.info(
      `v1.0.0 plugin initialization complete. ${String(errors.length)} errors.`,
      {
        component: "IntegrationManager",
        operation: "initializePluginsV1",
        metadata: { errorCount: errors.length },
      }
    );

    return errors;
  }

  /**
   * Execute a capability
   *
   * Routes the capability execution to the appropriate plugin(s) based on
   * priority and availability.
   *
   * @param user - User executing the capability (for permission checking)
   * @param capabilityId - ID of the capability to execute
   * @param input - Input data for the capability
   * @param debugContext - Optional debug context
   * @returns Capability execution result
   */
  async executeCapability<T = unknown>(
    user: User,
    capabilityId: string,
    input: Record<string, unknown>,
    debugContext?: DebugContext
  ): Promise<CapabilityExecutionResult<T>> {
    return this.capabilityRegistry.executeCapability<T>(
      user,
      capabilityId,
      input,
      debugContext
    );
  }

  /**
   * Get all registered capabilities
   *
   * @returns Array of registered capabilities
   */
  getAllCapabilities(): RegisteredCapability[] {
    return this.capabilityRegistry.getAllCapabilities();
  }

  /**
   * Check if a capability is registered
   *
   * @param capabilityId - ID of the capability
   * @returns true if capability exists
   */
  hasCapability(capabilityId: string): boolean {
    return this.capabilityRegistry.hasCapability(capabilityId);
  }

  /**
   * Get capabilities by category
   *
   * @param category - Category to filter by
   * @returns Array of capabilities in the category
   */
  getCapabilitiesByCategory(category: string): RegisteredCapability[] {
    return this.capabilityRegistry.getAllCapabilities(undefined, { category });
  }

  /**
   * Get metadata for a v1.0.0 plugin
   *
   * @param pluginName - Name of the plugin
   * @returns Plugin metadata or undefined if not found
   */
  getPluginMetadata(pluginName: string): PluginMetadata | undefined {
    return this.v1Plugins.get(pluginName)?.instance.metadata;
  }

  /**
   * Reload a specific v1.0.0 plugin
   *
   * Unloads and reloads a plugin, useful for development or updating plugins.
   *
   * @param pluginName - Name of the plugin to reload
   * @returns The reloaded plugin or throws if reload fails
   */
  async reloadPlugin(pluginName: string): Promise<LoadedPlugin> {
    const loadedPlugin = this.v1Plugins.get(pluginName);
    if (!loadedPlugin) {
      throw new Error(`Plugin '${pluginName}' not found`);
    }

    this.logger.info(`Reloading plugin: ${pluginName}`, {
      component: "IntegrationManager",
      operation: "reloadPlugin",
      metadata: { pluginName },
    });

    // Unregister capabilities
    this.capabilityRegistry.unregisterPlugin(pluginName);

    // Shutdown the plugin if it supports it
    if (loadedPlugin.instance.shutdown) {
      await loadedPlugin.instance.shutdown();
    }

    // Reload via PluginLoader (takes plugin name, not manifest)
    const reloaded = await this.pluginLoader.reloadPlugin(pluginName);

    if (!reloaded) {
      throw new Error(`Failed to reload plugin '${pluginName}'`);
    }

    // Update our map
    this.v1Plugins.set(pluginName, reloaded);

    // Re-initialize
    await reloaded.instance.initialize();

    // Get priority (default 10)
    const priority = 10;

    // Re-register capabilities
    if (reloaded.instance.capabilities) {
      for (const capability of reloaded.instance.capabilities) {
        this.capabilityRegistry.registerCapability(
          pluginName,
          capability,
          priority
        );
      }
    }

    // Re-register widgets
    if (reloaded.instance.widgets) {
      for (const widget of reloaded.instance.widgets) {
        this.capabilityRegistry.registerWidget(pluginName, widget);
      }
    }

    this.logger.info(`Reloaded plugin: ${pluginName}`, {
      component: "IntegrationManager",
      operation: "reloadPlugin",
      metadata: {
        pluginName,
        capabilityCount: reloaded.instance.capabilities?.length ?? 0,
      },
    });

    return reloaded;
  }

  /**
   * Get the CapabilityRegistry instance
   *
   * Provides direct access to the registry for advanced use cases.
   *
   * @returns CapabilityRegistry instance
   */
  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry;
  }

  /**
   * Get the PluginLoader instance
   *
   * Provides direct access to the loader for advanced use cases.
   *
   * @returns PluginLoader instance
   */
  getPluginLoader(): PluginLoader {
    return this.pluginLoader;
  }

  /**
   * Check if v1.0.0 plugins are initialized
   *
   * @returns true if v1.0.0 plugins have been initialized
   */
  isV1Initialized(): boolean {
    return this.v1Initialized;
  }

  /**
   * Get count of v1.0.0 plugins
   *
   * @returns Number of loaded v1.0.0 plugins
   */
  getV1PluginCount(): number {
    return this.v1Plugins.size;
  }

  /**
   * Get list of v1.0.0 plugin names
   *
   * @returns Array of plugin names
   */
  getV1PluginNames(): string[] {
    return Array.from(this.v1Plugins.keys());
  }

  /**
   * Shutdown the manager and all plugins
   *
   * Stops health checks and shuts down all plugins cleanly.
   */
  async shutdown(): Promise<void> {
    this.logger.info("Shutting down IntegrationManager...", {
      component: "IntegrationManager",
      operation: "shutdown",
    });

    // Stop health checks
    this.stopHealthCheckScheduler();

    // Shutdown v1.0.0 plugins
    for (const [name, loadedPlugin] of this.v1Plugins) {
      try {
        if (loadedPlugin.instance.shutdown) {
          await loadedPlugin.instance.shutdown();
          this.logger.info(`Shutdown v1.0.0 plugin: ${name}`, {
            component: "IntegrationManager",
            operation: "shutdown",
            metadata: { pluginName: name },
          });
        }
      } catch (error) {
        this.logger.error(`Error shutting down plugin '${name}'`, {
          component: "IntegrationManager",
          operation: "shutdown",
          metadata: { pluginName: name },
        }, error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Clear v1.0.0 state
    this.v1Plugins.clear();
    this.capabilityRegistry.clear();
    this.v1Initialized = false;

    // Clear legacy state
    this.plugins.clear();
    this.executionTools.clear();
    this.informationSources.clear();
    this.healthCheckCache.clear();
    this.initialized = false;

    this.logger.info("IntegrationManager shutdown complete", {
      component: "IntegrationManager",
      operation: "shutdown",
    });
  }

}
