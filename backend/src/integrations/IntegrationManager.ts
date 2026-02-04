/**
 * Integration Manager Service
 *
 * Central service for managing all integration plugins in Pabawi.
 *
 * ## v1.0.0 Architecture
 *
 * This version uses capability-based plugin architecture:
 * - **CapabilityRegistry**: Central registry for capability-based routing
 * - **PluginLoader**: Automatic plugin discovery and loading
 * - **BasePluginInterface**: Unified plugin interface
 *
 * ### APIs (v1.0.0)
 *
 * - `executeCapability()` - Execute any capability by name
 * - `getInventoryViaCapability()` - Get inventory using capability routing
 * - `getNodeFactsViaCapability()` - Get facts using capability routing
 * - `getCapabilitiesByCategory()` - List capabilities by category
 * - `getAllCapabilities()` - List all registered capabilities
 *
 * @module integrations/IntegrationManager
 * @version 1.0.0
 */

import type {
  HealthStatus,
  PluginMetadata,
  BasePluginInterface,
  PluginRegistrationV1,
  Facts,
  Node,
  ExecutionResult,
} from "./types";
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
  private plugins = new Map<string, PluginRegistrationV1>();
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
        path: "direct-registration",
        source: "native",
        name: pluginName,
        hasManifest: false,
        hasPackageJson: false,
        entryPoint: "direct-registration",
      },
      loadedAt: new Date().toISOString(),
      loadDurationMs: 0,
      warnings: [],
    };

    this.v1Plugins.set(pluginName, loadedPlugin);

    // Also add to plugins map for health checks
    const registration: PluginRegistrationV1 = {
      plugin,
      registeredAt: new Date().toISOString(),
      initialized: false,
    };
    this.plugins.set(pluginName, registration);

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
   * Initializes v1.0.0 capability-based plugins (discovered via PluginLoader
   * or registered via registerCapabilityPlugin).
   *
   * @param options - Initialization options
   * @param options.loadV1Plugins - Whether to load v1.0.0 plugins from disk (default: true)
   * @returns Array of initialization errors (empty if all succeeded)
   */
  async initializePlugins(options?: {
    loadV1Plugins?: boolean;
  }): Promise<{ plugin: string; error: Error }[]> {
    const { loadV1Plugins = true } = options ?? {};
    const errors: { plugin: string; error: Error }[] = [];

    // Load and initialize v1.0.0 plugins from disk
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
      }
    }

    // Initialize directly registered plugins
    for (const [name, registration] of this.plugins) {
      if (!registration.initialized) {
        try {
          await registration.plugin.initialize();
          registration.initialized = true;
          this.logger.info(`Initialized plugin: ${name}`, {
            component: "IntegrationManager",
            operation: "initializePlugins",
            metadata: { pluginName: name },
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          registration.initError = err.message;
          errors.push({ plugin: name, error: err });
          this.logger.error(`Failed to initialize plugin '${name}'`, {
            component: "IntegrationManager",
            operation: "initializePlugins",
            metadata: { pluginName: name },
          }, err);
        }
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
          pluginCount: this.plugins.size,
          v1PluginCount: this.v1Plugins.size,
        },
      }
    );

    return errors;
  }

  /**
   * Get all registered plugins
   *
   * @returns Array of all plugin registrations
   */
  getAllPlugins(): PluginRegistrationV1[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin by name
   *
   * @param name - Plugin name
   * @returns Plugin registration or undefined if not found
   */
  getPlugin(name: string): PluginRegistrationV1 | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get plugins by integration type
   *
   * @param type - Integration type to filter by
   * @returns Array of plugin registrations matching the type
   */
  getPluginsByType(type: string): PluginRegistrationV1[] {
    return Array.from(this.plugins.values()).filter(
      (registration) => registration.plugin.metadata.integrationType === type
    );
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
  // Data Aggregation Methods
  // ============================================================================

  /**
   * Get linked inventory from all plugins
   *
   * Queries all plugins with inventory capability, links nodes across sources, and returns
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
   * Get aggregated inventory from all plugins with inventory capability
   *
   * Queries all plugins in parallel and combines results.
   * Continues even if some plugins fail.
   *
   * @returns Aggregated inventory with source attribution
   */
  async getAggregatedInventory(): Promise<AggregatedInventory> {
    this.logger.debug("Starting getAggregatedInventory", {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
    });

    const sources: AggregatedInventory["sources"] = {};
    const allNodes: Node[] = [];
    const now = new Date().toISOString();

    // Get all plugins providing inventory.list capability
    const inventoryProviders = this.capabilityRegistry.getProvidersForCapability("inventory.list");

    this.logger.debug(
      `Total inventory providers: ${String(inventoryProviders.length)}`,
      {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
        metadata: { providerCount: inventoryProviders.length },
      }
    );

    if (inventoryProviders.length === 0) {
      this.logger.warn("No plugins provide 'inventory.list' capability", {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
      });
      return { nodes: [], sources: {} };
    }

    // Create a system user for internal capability execution
    const systemUser: User = {
      id: "system",
      username: "system",
      roles: ["admin"],
    };

    // Get inventory from all providers in parallel
    const inventoryPromises = inventoryProviders.map(async (registered) => {
      const pluginName = registered.pluginName;
      this.logger.debug(`Processing provider: ${pluginName}`, {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
        metadata: { pluginName },
      });

      try {
        const result = await this.capabilityRegistry.executeCapability<Node[]>(
          systemUser,
          "inventory.list",
          {},
          undefined
        );

        if (result.success && result.data) {
          const nodes = result.data;
          this.logger.debug(`Provider '${pluginName}' returned ${String(nodes.length)} nodes`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { pluginName, nodeCount: nodes.length },
          });

          // Add source attribution to each node
          const nodesWithSource = nodes.map((node) => ({
            ...node,
            source: pluginName,
          }));

          sources[pluginName] = {
            nodeCount: nodes.length,
            lastSync: now,
            status: "healthy",
          };

          return nodesWithSource;
        } else {
          sources[pluginName] = {
            nodeCount: 0,
            lastSync: now,
            status: "unavailable",
          };
          return [];
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Failed to get inventory from '${pluginName}'`, {
          component: "IntegrationManager",
          operation: "getAggregatedInventory",
          metadata: { pluginName },
        }, err);
        sources[pluginName] = {
          nodeCount: 0,
          lastSync: now,
          status: "unavailable",
        };
        return [];
      }
    });

    const results = await Promise.all(inventoryPromises);
    this.logger.debug(`Received results from ${String(results.length)} providers`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { resultCount: results.length },
    });

    // Flatten all nodes
    for (const nodes of results) {
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
   * Queries all plugins for the node, links data across sources,
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
   * Queries all plugins for the node and combines results.
   *
   * @param nodeId - Node identifier
   * @returns Aggregated node data from all sources
   */
  async getNodeData(nodeId: string): Promise<AggregatedNodeData> {
    const facts: Record<string, Facts> = {};
    const additionalData: Record<string, Record<string, unknown>> = {};

    // Create a system user for internal capability execution
    const systemUser: User = {
      id: "system",
      username: "system",
      roles: ["admin"],
    };

    // Get inventory to find the node
    const inventory = await this.getAggregatedInventory();
    const node = inventory.nodes.find((n) => n.id === nodeId) ?? null;

    if (!node) {
      throw new Error(`Node '${nodeId}' not found in any source`);
    }

    // Get facts from all providers with info.facts capability
    const factsProviders = this.capabilityRegistry.getProvidersForCapability("info.facts");

    const factsPromises = factsProviders.map(async (registered) => {
      const pluginName = registered.pluginName;
      try {
        const result = await this.capabilityRegistry.executeCapability<Facts>(
          systemUser,
          "info.facts",
          { nodeId },
          undefined
        );

        if (result.success && result.data) {
          facts[pluginName] = result.data;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to get facts from '${pluginName}' for node '${nodeId}'`,
          {
            component: "IntegrationManager",
            operation: "getNodeData",
            metadata: { pluginName, nodeId },
          },
          err
        );
      }
    });

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
    this.v1Plugins.delete(name);
    this.capabilityRegistry.unregisterPlugin(name);

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

      // For now, keep the first node encountered (could be enhanced with priority logic)
      // Priority could be determined by plugin registration order or explicit priority setting
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
   * Get all v1.0.0 loaded plugins
   *
   * @returns Map of plugin name to LoadedPlugin
   */
  getAllV1Plugins(): Map<string, LoadedPlugin> {
    return new Map(this.v1Plugins);
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

    // Clear state
    this.v1Plugins.clear();
    this.capabilityRegistry.clear();
    this.v1Initialized = false;
    this.plugins.clear();
    this.healthCheckCache.clear();
    this.initialized = false;

    this.logger.info("IntegrationManager shutdown complete", {
      component: "IntegrationManager",
      operation: "shutdown",
    });
  }

}
