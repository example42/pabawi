/**
 * Integration Manager Service
 *
 * Central service for managing all integration plugins (execution tools and information sources).
 * Handles plugin registration, initialization, routing, health check aggregation,
 * and multi-source data aggregation.
 */

import type {
  IntegrationPlugin,
  ExecutionToolPlugin,
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
  PluginRegistration,
  Action,
  NodeGroup,
} from "./types";
import type { Node, Facts, ExecutionResult } from "./bolt/types";
import { NodeLinkingService, type LinkedNode } from "./NodeLinkingService";
import { LoggerService } from "../services/LoggerService";

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
  /** Groups aggregated from all sources */
  groups: NodeGroup[];
  sources: Record<
    string,
    {
      nodeCount: number;
      groupCount: number;
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
  private executionTools = new Map<string, ExecutionToolPlugin>();
  private informationSources = new Map<string, InformationSourcePlugin>();
  private initialized = false;
  private nodeLinkingService: NodeLinkingService;
  private logger: LoggerService;

  // Health check scheduling
  private healthCheckCache = new Map<string, HealthCheckCacheEntry>();
  private healthCheckInterval?: NodeJS.Timeout;
  private healthCheckIntervalMs: number;
  private healthCheckCacheTTL: number;

  // Inventory caching (nodes and groups)
  private inventoryCache: {
    data: AggregatedInventory;
    timestamp: number;
  } | null = null;
  private inventoryCacheTTL: number;

  constructor(options?: {
    healthCheckIntervalMs?: number;
    healthCheckCacheTTL?: number;
    inventoryCacheTTL?: number;
    logger?: LoggerService;
  }) {
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs ?? 60000; // Default: 1 minute
    this.healthCheckCacheTTL = options?.healthCheckCacheTTL ?? 300000; // Default: 5 minutes
    this.inventoryCacheTTL = options?.inventoryCacheTTL ?? 300000; // Default: 5 minutes (same as health check)
    this.logger = options?.logger ?? new LoggerService();
    this.nodeLinkingService = new NodeLinkingService(this);
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
   * Initialize all registered plugins
   *
   * Calls initialize() on each plugin with its configuration.
   * Continues initialization even if some plugins fail.
   *
   * @returns Array of initialization errors (empty if all succeeded)
   */
  async initializePlugins(): Promise<{ plugin: string; error: Error }[]> {
    const errors: { plugin: string; error: Error }[] = [];

    this.logger.info(`Initializing ${String(this.plugins.size)} plugins...`, {
      component: "IntegrationManager",
      operation: "initializePlugins",
      metadata: { pluginCount: this.plugins.size },
    });

    for (const [name, registration] of this.plugins) {
      try {
        await registration.plugin.initialize(registration.config);
        this.logger.info(`Initialized plugin: ${name}`, {
          component: "IntegrationManager",
          operation: "initializePlugins",
          metadata: { pluginName: name },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ plugin: name, error: err });
        this.logger.error(`Failed to initialize plugin '${name}'`, {
          component: "IntegrationManager",
          operation: "initializePlugins",
          metadata: { pluginName: name },
        }, err);
      }
    }

    this.initialized = true;
    this.logger.info(
      `Plugin initialization complete. ${String(errors.length)} errors.`,
      {
        component: "IntegrationManager",
        operation: "initializePlugins",
        metadata: { errorCount: errors.length },
      }
    );

    return errors;
  }

  /**
   * Get an execution tool plugin by name
   *
   * @param name - Plugin name
   * @returns Plugin instance or null if not found
   */
  getExecutionTool(name: string): ExecutionToolPlugin | null {
    return this.executionTools.get(name) ?? null;
  }

  /**
   * Get an information source plugin by name
   *
   * @param name - Plugin name
   * @returns Plugin instance or null if not found
   */
  getInformationSource(name: string): InformationSourcePlugin | null {
    return this.informationSources.get(name) ?? null;
  }

  /**
   * Get all registered execution tools
   *
   * @returns Array of execution tool plugins
   */
  getAllExecutionTools(): ExecutionToolPlugin[] {
    return Array.from(this.executionTools.values());
  }

  /**
   * Get all registered information sources
   *
   * @returns Array of information source plugins
   */
  getAllInformationSources(): InformationSourcePlugin[] {
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
   * Results are cached with configurable TTL for performance.
   *
   * @param useCache - If true, return cached results if available and not expired (default: true)
   * @returns Aggregated inventory with source attribution
   */
  async getAggregatedInventory(useCache = true): Promise<AggregatedInventory> {
    // Check cache first if requested
    if (useCache && this.inventoryCache) {
      const now = Date.now();
      const cacheAge = now - this.inventoryCache.timestamp;

      if (cacheAge < this.inventoryCacheTTL) {
        this.logger.debug(`Returning cached inventory (age: ${String(cacheAge)}ms, TTL: ${String(this.inventoryCacheTTL)}ms)`, {
          component: "IntegrationManager",
          operation: "getAggregatedInventory",
          metadata: { cacheAge, cacheTTL: this.inventoryCacheTTL },
        });
        return this.inventoryCache.data;
      } else {
        this.logger.debug(`Cache expired (age: ${String(cacheAge)}ms, TTL: ${String(this.inventoryCacheTTL)}ms), fetching fresh data`, {
          component: "IntegrationManager",
          operation: "getAggregatedInventory",
          metadata: { cacheAge, cacheTTL: this.inventoryCacheTTL },
        });
      }
    }

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
    const allGroups: NodeGroup[] = [];
    const now = new Date().toISOString();

    // Get inventory and groups from all sources in parallel
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
              groupCount: 0,
              lastSync: now,
              status: "unavailable",
            };
            return { nodes: [], groups: [] };
          }

          // Fetch nodes and groups in parallel
          this.logger.debug(`Calling getInventory() and getGroups() on source '${name}'`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name },
          });

          const [nodes, groups] = await Promise.all([
            source.getInventory(),
            source.getGroups().catch((error) => {
              const err = error instanceof Error ? error : new Error(String(error));
              this.logger.error(`Failed to get groups from '${name}', continuing with nodes only`, {
                component: "IntegrationManager",
                operation: "getAggregatedInventory",
                metadata: { sourceName: name },
              }, err);
              return [];
            }),
          ]);

          this.logger.debug(`Source '${name}' returned ${String(nodes.length)} nodes and ${String(groups.length)} groups`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name, nodeCount: nodes.length, groupCount: groups.length },
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

          // Create set of valid node IDs for validation
          const validNodeIds = new Set(nodesWithSource.map(node => node.id));

          // Add source attribution to each group
          const groupsWithSource = groups.map((group) => ({
            ...group,
            source: name,
          }));

          // Validate and sanitize groups
          const validatedGroups = this.validateGroups(groupsWithSource, name, validNodeIds);

          sources[name] = {
            nodeCount: nodes.length,
            groupCount: validatedGroups.length,
            lastSync: now,
            status: "healthy",
          };

          this.logger.debug(
            `Successfully processed ${String(nodes.length)} nodes and ${String(validatedGroups.length)} groups from '${name}'`,
            {
              component: "IntegrationManager",
              operation: "getAggregatedInventory",
              metadata: { sourceName: name, nodeCount: nodes.length, groupCount: validatedGroups.length },
            }
          );
          return { nodes: nodesWithSource, groups: validatedGroups };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Failed to get inventory from '${name}'`, {
            component: "IntegrationManager",
            operation: "getAggregatedInventory",
            metadata: { sourceName: name },
          }, err);
          sources[name] = {
            nodeCount: 0,
            groupCount: 0,
            lastSync: now,
            status: "unavailable",
          };
          return { nodes: [], groups: [] };
        }
      },
    );

    const results = await Promise.all(inventoryPromises);
    this.logger.debug(`Received results from ${String(results.length)} sources`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { resultCount: results.length },
    });

    // Flatten all nodes and groups
    for (const result of results) {
      this.logger.debug(`Adding ${String(result.nodes.length)} nodes and ${String(result.groups.length)} groups to aggregated arrays`, {
        component: "IntegrationManager",
        operation: "getAggregatedInventory",
        metadata: { nodeCount: result.nodes.length, groupCount: result.groups.length },
      });
      allNodes.push(...result.nodes);
      allGroups.push(...result.groups);
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

    // Link groups with same name across sources
    this.logger.debug(`Total groups before linking: ${String(allGroups.length)}`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { totalGroups: allGroups.length },
    });

    const linkedGroups = this.linkGroups(allGroups);

    this.logger.info(`Total groups after linking: ${String(linkedGroups.length)}`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { linkedGroups: linkedGroups.length },
    });

    this.logger.debug("Completed getAggregatedInventory", {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
    });

    const result: AggregatedInventory = {
      nodes: uniqueNodes,
      groups: linkedGroups,
      sources,
    };

    // Update cache
    this.inventoryCache = {
      data: result,
      timestamp: Date.now(),
    };
    this.logger.debug(`Cached inventory (${String(uniqueNodes.length)} nodes, ${String(linkedGroups.length)} groups) for ${String(this.inventoryCacheTTL)}ms`, {
      component: "IntegrationManager",
      operation: "getAggregatedInventory",
      metadata: { nodeCount: uniqueNodes.length, groupCount: linkedGroups.length, cacheTTL: this.inventoryCacheTTL },
    });

    return result;
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
   * Clear the inventory cache
   *
   * Forces the next call to getAggregatedInventory() to fetch fresh data
   * from all information sources.
   */
  clearInventoryCache(): void {
    this.inventoryCache = null;
    this.logger.debug("Inventory cache cleared", {
      component: "IntegrationManager",
      operation: "clearInventoryCache",
    });
  }

  /**
   * Clear all caches (health check and inventory)
   */
  clearAllCaches(): void {
    this.clearHealthCheckCache();
    this.clearInventoryCache();
    this.logger.info("All caches cleared", {
      component: "IntegrationManager",
      operation: "clearAllCaches",
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

  /**
   * Link groups with the same name across multiple sources
   *
   * Groups with identical names are merged into a single linked group entity
   * with the linked flag set to true, sources array populated, and nodes deduplicated.
   *
   * @param groups - Array of groups from all sources
   * @returns Array of linked groups
   */
  private linkGroups(groups: NodeGroup[]): NodeGroup[] {
    this.logger.debug("Starting group linking", {
      component: "IntegrationManager",
      operation: "linkGroups",
      metadata: { totalGroups: groups.length },
    });

    // Group all groups by name
    const groupsByName = new Map<string, NodeGroup[]>();

    for (const group of groups) {
      if (!groupsByName.has(group.name)) {
        groupsByName.set(group.name, []);
      }
      groupsByName.get(group.name)!.push(group);
    }

    this.logger.debug(`Grouped into ${String(groupsByName.size)} unique group names`, {
      component: "IntegrationManager",
      operation: "linkGroups",
      metadata: { uniqueNames: groupsByName.size },
    });

    // Create linked groups
    const linkedGroups: NodeGroup[] = [];

    for (const [name, groupsWithSameName] of groupsByName) {
      if (groupsWithSameName.length === 1) {
        // Single source group - keep as is
        linkedGroups.push(groupsWithSameName[0]);
      } else {
        // Multi-source group - merge
        this.logger.debug(`Linking group '${name}' from ${String(groupsWithSameName.length)} sources`, {
          component: "IntegrationManager",
          operation: "linkGroups",
          metadata: {
            groupName: name,
            sourceCount: groupsWithSameName.length,
            sources: groupsWithSameName.map(g => g.source),
          },
        });

        const sources = groupsWithSameName.map(g => g.source);

        // Merge and deduplicate node IDs from all sources
        const allNodeIds = groupsWithSameName.flatMap(g => g.nodes);
        const uniqueNodeIds = [...new Set(allNodeIds)];

        // Merge metadata from all sources
        const mergedMetadata = groupsWithSameName.reduce((acc, g) => {
          if (g.metadata) {
            return { ...acc, ...g.metadata };
          }
          return acc;
        }, {} as NodeGroup["metadata"]);

        linkedGroups.push({
          id: `linked:${name}`,
          name,
          source: groupsWithSameName[0].source, // Primary source
          sources,
          linked: true,
          nodes: uniqueNodeIds,
          metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
        });

        this.logger.debug(`Created linked group '${name}' with ${String(uniqueNodeIds.length)} unique nodes`, {
          component: "IntegrationManager",
          operation: "linkGroups",
          metadata: {
            groupName: name,
            nodeCount: uniqueNodeIds.length,
            originalNodeCount: allNodeIds.length,
          },
        });
      }
    }

    this.logger.debug("Completed group linking", {
      component: "IntegrationManager",
      operation: "linkGroups",
      metadata: { linkedGroupCount: linkedGroups.length },
    });

    return linkedGroups;
  }
  /**
   * Validate and sanitize groups
   *
   * Validates required fields, checks ID uniqueness, sanitizes names,
   * and logs warnings for invalid node references.
   *
   * @param groups - Groups to validate
   * @param sourceName - Name of the source providing the groups
   * @param validNodeIds - Set of valid node IDs from the same source
   * @returns Validated and sanitized groups
   */
  private validateGroups(
    groups: NodeGroup[],
    sourceName: string,
    validNodeIds: Set<string>
  ): NodeGroup[] {
    const validatedGroups: NodeGroup[] = [];
    const seenIds = new Set<string>();

    for (const group of groups) {
      // Validate required fields
      if (!group.id || typeof group.id !== 'string') {
        this.logger.warn(`Group from '${sourceName}' missing required field 'id' - rejecting group`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupName: group.name || 'unknown' },
        });
        continue;
      }

      if (!group.name || typeof group.name !== 'string') {
        this.logger.warn(`Group '${group.id}' from '${sourceName}' missing required field 'name' - rejecting group`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupId: group.id },
        });
        continue;
      }

      if (!group.source || typeof group.source !== 'string') {
        this.logger.warn(`Group '${group.id}' from '${sourceName}' missing required field 'source' - rejecting group`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupId: group.id, groupName: group.name },
        });
        continue;
      }

      if (!Array.isArray(group.nodes)) {
        this.logger.warn(`Group '${group.id}' from '${sourceName}' missing required field 'nodes' or nodes is not an array - rejecting group`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupId: group.id, groupName: group.name },
        });
        continue;
      }

      // Validate group ID uniqueness within source
      if (seenIds.has(group.id)) {
        this.logger.warn(`Duplicate group ID '${group.id}' in source '${sourceName}' - rejecting duplicate`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupId: group.id, groupName: group.name },
        });
        continue;
      }
      seenIds.add(group.id);

      // Sanitize group name to prevent injection attacks
      const sanitizedName = this.sanitizeGroupName(group.name);
      if (sanitizedName !== group.name) {
        this.logger.warn(`Group '${group.id}' from '${sourceName}' has potentially malicious name - sanitizing`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: { sourceName, groupId: group.id, originalName: group.name, sanitizedName },
        });
      }

      // Check for invalid node references
      const invalidNodeRefs = group.nodes.filter(nodeId => !validNodeIds.has(nodeId));
      if (invalidNodeRefs.length > 0) {
        this.logger.warn(`Group '${group.id}' from '${sourceName}' references ${String(invalidNodeRefs.length)} non-existent nodes`, {
          component: "IntegrationManager",
          operation: "validateGroups",
          metadata: {
            sourceName,
            groupId: group.id,
            groupName: group.name,
            invalidNodeCount: invalidNodeRefs.length,
            invalidNodeIds: invalidNodeRefs.slice(0, 5), // Log first 5 for debugging
          },
        });
      }

      // Add validated and sanitized group
      validatedGroups.push({
        ...group,
        name: sanitizedName,
      });
    }

    this.logger.debug(`Validated ${String(validatedGroups.length)} of ${String(groups.length)} groups from '${sourceName}'`, {
      component: "IntegrationManager",
      operation: "validateGroups",
      metadata: {
        sourceName,
        totalGroups: groups.length,
        validGroups: validatedGroups.length,
        rejectedGroups: groups.length - validatedGroups.length,
      },
    });

    return validatedGroups;
  }

  /**
   * Sanitize group name to prevent injection attacks
   *
   * Removes or escapes potentially malicious characters including:
   * - HTML tags
   * - SQL injection patterns
   * - Script injection attempts
   * - Control characters
   *
   * @param name - Group name to sanitize
   * @returns Sanitized group name
   */
  private sanitizeGroupName(name: string): string {
      // Remove HTML tags
      let sanitized = name.replace(/<[^>]*>/g, '');

      // Remove script-related keywords (case-insensitive) - more aggressive
      sanitized = sanitized.replace(/\b(script|javascript|onerror|onload|eval|expression|alert|prompt|confirm)\b/gi, '');

      // Remove SQL injection patterns (basic patterns)
      sanitized = sanitized.replace(/['";\\]/g, '');

      // Remove SQL comment patterns
      sanitized = sanitized.replace(/--/g, '');
      sanitized = sanitized.replace(/\/\*/g, '');
      sanitized = sanitized.replace(/\*\//g, '');

      // Remove control characters and non-printable characters
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

      // Remove parentheses that might be used in injection
      sanitized = sanitized.replace(/[()]/g, '');

      // Trim whitespace
      sanitized = sanitized.trim();

      // If sanitization resulted in empty string, use a placeholder
      if (sanitized.length === 0) {
        sanitized = 'sanitized_group';
      }

      return sanitized;
    }



}
