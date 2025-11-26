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
} from "./types";
import type { Node, Facts, ExecutionResult } from "../bolt/types";

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
  private executionTools = new Map<string, ExecutionToolPlugin>();
  private informationSources = new Map<string, InformationSourcePlugin>();
  private initialized = false;

  // Health check scheduling
  private healthCheckCache = new Map<string, HealthCheckCacheEntry>();
  private healthCheckInterval?: NodeJS.Timeout;
  private healthCheckIntervalMs: number;
  private healthCheckCacheTTL: number;

  constructor(options?: {
    healthCheckIntervalMs?: number;
    healthCheckCacheTTL?: number;
  }) {
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs ?? 60000; // Default: 1 minute
    this.healthCheckCacheTTL = options?.healthCheckCacheTTL ?? 300000; // Default: 5 minutes
    this.log("IntegrationManager created");
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

    this.log(`Registered plugin: ${plugin.name} (${plugin.type})`);
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

    this.log(`Initializing ${String(this.plugins.size)} plugins...`);

    for (const [name, registration] of this.plugins) {
      try {
        await registration.plugin.initialize(registration.config);
        this.log(`Initialized plugin: ${name}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ plugin: name, error: err });
        this.logError(`Failed to initialize plugin '${name}'`, err);
      }
    }

    this.initialized = true;
    this.log(
      `Plugin initialization complete. ${String(errors.length)} errors.`,
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
   * Get aggregated inventory from all information sources
   *
   * Queries all information sources in parallel and combines results.
   * Continues even if some sources fail.
   *
   * @returns Aggregated inventory with source attribution
   */
  async getAggregatedInventory(): Promise<AggregatedInventory> {
    const sources: AggregatedInventory["sources"] = {};
    const allNodes: Node[] = [];
    const now = new Date().toISOString();

    // Get inventory from all sources in parallel
    const inventoryPromises = Array.from(this.informationSources.entries()).map(
      async ([name, source]) => {
        try {
          if (!source.isInitialized()) {
            sources[name] = {
              nodeCount: 0,
              lastSync: now,
              status: "unavailable",
            };
            return [];
          }

          const nodes = await source.getInventory();

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

          return nodesWithSource;
        } catch (error) {
          this.logError(`Failed to get inventory from '${name}'`, error);
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

    // Flatten all nodes
    for (const nodes of results) {
      allNodes.push(...nodes);
    }

    // Deduplicate nodes by ID (prefer higher priority sources)
    const uniqueNodes = this.deduplicateNodes(allNodes);

    return {
      nodes: uniqueNodes,
      sources,
    };
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
        this.logError(`Failed to get node from '${source.name}'`, error);
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
          this.logError(
            `Failed to get facts from '${name}' for node '${nodeId}'`,
            error,
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
        this.log("Returning cached health check results");
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
      this.log("Health check scheduler already running");
      return;
    }

    this.log(
      `Starting health check scheduler (interval: ${String(this.healthCheckIntervalMs)}ms, TTL: ${String(this.healthCheckCacheTTL)}ms)`,
    );

    // Run initial health check
    void this.healthCheckAll(false);

    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      void this.healthCheckAll(false);
    }, this.healthCheckIntervalMs);

    this.log("Health check scheduler started");
  }

  /**
   * Stop periodic health check scheduling
   */
  stopHealthCheckScheduler(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.log("Health check scheduler stopped");
    }
  }

  /**
   * Clear the health check cache
   */
  clearHealthCheckCache(): void {
    this.healthCheckCache.clear();
    this.log("Health check cache cleared");
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

    this.log(`Unregistered plugin: ${name}`);
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
   * Log a message with manager context
   *
   * @param message - Message to log
   */
  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log("[IntegrationManager]", message);
  }

  /**
   * Log an error with manager context
   *
   * @param message - Error message
   * @param error - Error object
   */
  private logError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[IntegrationManager]", `${message}: ${errorMessage}`);

    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}
