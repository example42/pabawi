/**
 * PuppetDB Service
 *
 * Primary service for interacting with PuppetDB API.
 * Implements InformationSourcePlugin interface to provide:
 * - Node inventory from PuppetDB
 * - Node facts
 * - Reports, catalogs, and events (via getNodeData)
 */

import { BasePlugin } from "../BasePlugin";
import type { InformationSourcePlugin, HealthStatus } from "../types";
import type { Node, Facts } from "../../bolt/types";
import type { PuppetDBConfig } from "../../config/schema";
import type { PuppetDBClient } from "./PuppetDBClient";
import {
  createPuppetDBClient,
  PuppetDBConnectionError,
  PuppetDBQueryError,
} from "./PuppetDBClient";
import type { CircuitBreaker } from "./CircuitBreaker";
import { createPuppetDBCircuitBreaker } from "./CircuitBreaker";
import {
  withRetry,
  createPuppetDBRetryConfig,
  type RetryConfig,
} from "./RetryLogic";
import type {
  Report,
  Catalog,
  Resource,
  Edge,
  Event,
  EventFilters,
} from "./types";

/**
 * PuppetDB Service
 *
 * Provides access to PuppetDB data through the plugin interface.
 * Includes retry logic and circuit breaker for resilience.
 */
/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * PuppetDB node response from API
 */
interface PuppetDBNode {
  certname: string;
  [key: string]: unknown;
}

/**
 * PuppetDB fact response from API
 */
interface PuppetDBFact {
  name: string;
  value: unknown;
}

/**
 * Simple in-memory cache with TTL
 */
class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  /**
   * Get cached value if not expired
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): unknown {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Set cached value with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Time to live in milliseconds
   */
  set(key: string, value: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export class PuppetDBService
  extends BasePlugin
  implements InformationSourcePlugin
{
  type = "information" as const;
  private client?: PuppetDBClient;
  private circuitBreaker?: CircuitBreaker;
  private retryConfig?: RetryConfig;
  private puppetDBConfig?: PuppetDBConfig;
  private cache = new SimpleCache();
  private cacheTTL = 300000; // Default 5 minutes

  /**
   * Create a new PuppetDB service
   */
  constructor() {
    super("puppetdb", "information");
  }

  /**
   * Perform plugin-specific initialization
   *
   * Creates PuppetDB client, circuit breaker, and retry configuration.
   */
  protected performInitialization(): Promise<void> {
    // Extract PuppetDB config from integration config
    this.puppetDBConfig = this.config.config as PuppetDBConfig;

    // Check if integration is disabled
    if (!this.config.enabled) {
      this.log("PuppetDB integration is disabled");
      return Promise.resolve();
    }

    // Check if configuration is missing
    if (!this.puppetDBConfig.serverUrl) {
      this.log("PuppetDB integration is not configured (missing serverUrl)");
      return Promise.resolve();
    }

    // Create PuppetDB client
    this.client = createPuppetDBClient(this.puppetDBConfig);

    // Create circuit breaker
    this.circuitBreaker = createPuppetDBCircuitBreaker(
      5, // failure threshold
      60000, // reset timeout (60 seconds)
      this.puppetDBConfig.timeout,
    );

    // Create retry configuration (defaults are set in schema)
    this.retryConfig = createPuppetDBRetryConfig(
      this.puppetDBConfig.retryAttempts,
      this.puppetDBConfig.retryDelay,
    );

    // Set cache TTL from config
    if (this.puppetDBConfig.cache?.ttl) {
      this.cacheTTL = this.puppetDBConfig.cache.ttl;
    }

    this.log("PuppetDB service initialized successfully");
    this.log(`Cache TTL set to ${String(this.cacheTTL)}ms`);

    return Promise.resolve();
  }

  /**
   * Perform plugin-specific health check
   *
   * Queries PuppetDB status endpoint to verify connectivity.
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    if (!this.client || !this.circuitBreaker) {
      return {
        healthy: false,
        message: "PuppetDB client not initialized",
      };
    }

    try {
      // Query status endpoint
      const client = this.client;
      const circuitBreaker = this.circuitBreaker;

      await this.executeWithResilience(async () => {
        return await client.get("/status/v1/services/puppetdb-status");
      });

      return {
        healthy: true,
        message: "PuppetDB is reachable",
        details: {
          baseUrl: client.getBaseUrl(),
          hasAuth: client.hasAuthentication(),
          hasSSL: client.hasSSL(),
          circuitState: circuitBreaker.getState(),
        } as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        message: `PuppetDB health check failed: ${errorMessage}`,
        details: {
          baseUrl: this.client.getBaseUrl(),
          circuitState: this.circuitBreaker.getState(),
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Get inventory of nodes from PuppetDB
   *
   * Queries the nodes endpoint and transforms results to normalized format.
   * Results are cached with TTL to reduce load on PuppetDB.
   *
   * @param pqlQuery - Optional PQL query to filter nodes
   * @returns Array of nodes
   */
  async getInventory(pqlQuery?: string): Promise<Node[]> {
    this.ensureInitialized();

    try {
      // Validate PQL query if provided (including empty strings)
      if (pqlQuery !== undefined) {
        this.validatePQLQuery(pqlQuery);
      }

      // Generate cache key based on query
      const cacheKey = `inventory:${pqlQuery ?? "all"}`;

      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(`Returning cached inventory (${String(cached.length)} nodes)`);
        return cached as Node[];
      }

      // Query PuppetDB
      const client = this.client;
      if (!client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      const result = await this.executeWithResilience(async () => {
        return await client.query("pdb/query/v4/nodes", pqlQuery);
      });

      // Transform PuppetDB nodes to normalized format
      if (!Array.isArray(result)) {
        this.log(
          "Unexpected response format from PuppetDB nodes endpoint",
          "warn",
        );
        return [];
      }

      const nodes = result.map((node) =>
        this.transformNode(node as PuppetDBNode),
      );

      // Cache the result
      this.cache.set(cacheKey, nodes, this.cacheTTL);
      this.log(
        `Cached inventory (${String(nodes.length)} nodes) for ${String(this.cacheTTL)}ms`,
      );

      return nodes;
    } catch (error) {
      this.logError("Failed to get inventory from PuppetDB", error);
      throw error;
    }
  }

  /**
   * Query inventory with PQL
   *
   * Provides a more explicit method for querying with PQL.
   *
   * @param pqlQuery - PQL query string
   * @returns Array of nodes matching the query
   */
  async queryInventory(pqlQuery: string): Promise<Node[]> {
    return await this.getInventory(pqlQuery);
  }

  /**
   * Get facts for a specific node
   *
   * Queries the facts endpoint for a node and returns structured facts.
   * Results are cached with TTL to reduce load on PuppetDB.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Facts for the node
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cacheKey = `facts:${nodeId}`;
      const cached = this.cache.get(cacheKey);
      if (
        cached !== undefined &&
        typeof cached === "object" &&
        cached !== null
      ) {
        this.log(`Returning cached facts for node '${nodeId}'`);
        return cached as Facts;
      }

      // Query node to verify it exists
      const client = this.client;
      if (!client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      const result = await this.executeWithResilience(async () => {
        return await client.query(
          "pdb/query/v4/nodes",
          `["=", "certname", "${nodeId}"]`,
        );
      });

      if (!Array.isArray(result) || result.length === 0) {
        throw new PuppetDBQueryError(
          `Node '${nodeId}' not found in PuppetDB`,
          `["=", "certname", "${nodeId}"]`,
          { nodeId, resultType: typeof result },
        );
      }

      // Get detailed facts
      const factsResult = await this.executeWithResilience(async () => {
        return await client.query(
          "pdb/query/v4/facts",
          `["=", "certname", "${nodeId}"]`,
        );
      });

      const facts = this.transformFacts(nodeId, factsResult);

      // Cache the result
      this.cache.set(cacheKey, facts, this.cacheTTL);
      this.log(
        `Cached facts for node '${nodeId}' for ${String(this.cacheTTL)}ms`,
      );

      return facts;
    } catch (error) {
      this.logError(`Failed to get facts for node '${nodeId}'`, error);
      throw error;
    }
  }

  /**
   * Get arbitrary data for a node
   *
   * Supports data types: 'reports', 'catalog', 'events'
   *
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve
   * @returns Data of the requested type
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    this.ensureInitialized();

    switch (dataType) {
      case "reports":
        return await this.getNodeReports(nodeId);
      case "catalog":
        return await this.getNodeCatalog(nodeId);
      case "events":
        return await this.getNodeEvents(nodeId);
      default:
        throw new PuppetDBQueryError(
          `Unsupported data type: ${dataType}. Supported types are: reports, catalog, events`,
          "",
          {
            nodeId,
            dataType,
            supportedTypes: ["reports", "catalog", "events"],
          },
        );
    }
  }

  /**
   * Query events with filters
   *
   * Provides a more explicit method for querying events with filters.
   * Implements requirement 5.5: Support filtering by status, resource type, and time range.
   *
   * @param nodeId - Node identifier (certname)
   * @param filters - Event filters
   * @returns Array of events matching the filters
   */
  async queryEvents(
    nodeId: string,
    filters: EventFilters,
  ): Promise<Event[]> {
    return await this.getNodeEvents(nodeId, filters);
  }

  /**
   * Get a specific report by hash
   *
   * Queries PuppetDB for a specific report and includes full details.
   * Implements requirement 3.4.
   *
   * @param reportHash - Report hash identifier
   * @returns Report with full details or null if not found
   */
  async getReport(reportHash: string): Promise<Report | null> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cacheKey = `report:${reportHash}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        this.log(`Returning cached report '${reportHash}'`);
        return cached as Report;
      }

      // Query PuppetDB for specific report
      const client = this.client;
      if (!client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      // Build PQL query to get report by hash
      const pqlQuery = `["=", "hash", "${reportHash}"]`;

      const result = await this.executeWithResilience(async () => {
        return await client.query("pdb/query/v4/reports", pqlQuery);
      });

      if (!Array.isArray(result) || result.length === 0) {
        this.log(`Report '${reportHash}' not found in PuppetDB`, "warn");
        return null;
      }

      const firstResult = result[0] as Record<string, unknown>;
      const hasMetrics = Boolean(firstResult.metrics);
      this.log(`Fetched report '${reportHash}', has metrics: ${String(hasMetrics)}`);

      // Transform the report
      const report = this.transformReport(result[0]);

      // Cache the result
      this.cache.set(cacheKey, report, this.cacheTTL);
      this.log(`Cached report '${reportHash}' for ${String(this.cacheTTL)}ms`);

      return report;
    } catch (error) {
      this.logError(`Failed to get report '${reportHash}'`, error);
      throw error;
    }
  }

  /**
   * Get reports for a node
   *
   * Queries PuppetDB reports endpoint and returns reports in reverse chronological order.
   * Implements requirements 3.1, 3.2, 3.3.
   *
   * @param nodeId - Node identifier (certname)
   * @param limit - Maximum number of reports to return (default: 10)
   * @returns Array of reports sorted by timestamp (newest first)
   */
  async getNodeReports(nodeId: string, limit = 10): Promise<Report[]> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cacheKey = `reports:${nodeId}:${String(limit)}`;
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(`Returning cached reports for node '${nodeId}'`);
        return cached as Report[];
      }

      // Query PuppetDB for reports
      const client = this.client;
      if (!client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      // Build PQL query to get reports for this node
      // Order by producer_timestamp descending to get newest first
      const pqlQuery = `["=", "certname", "${nodeId}"]`;

      const result = await this.executeWithResilience(async () => {
        return await client.query("pdb/query/v4/reports", pqlQuery, {
          limit: limit,
          order_by: '[{"field": "producer_timestamp", "order": "desc"}]',
        });
      });

      if (!Array.isArray(result)) {
        this.log(
          `Unexpected response format from PuppetDB reports endpoint for node '${nodeId}'`,
          "warn",
        );
        return [];
      }

      const reportCount = result.length;
      this.log(`Fetched ${String(reportCount)} reports for node '${nodeId}'`);

      // Transform reports
      const reports = result.map((report) => this.transformReport(report));

      // Sort by producer_timestamp in reverse chronological order (requirement 3.2)
      // This ensures newest reports are first
      reports.sort((a, b) => {
        const timeA = new Date(a.producer_timestamp).getTime();
        const timeB = new Date(b.producer_timestamp).getTime();
        return timeB - timeA; // Descending order (newest first)
      });

      // Cache the result
      this.cache.set(cacheKey, reports, this.cacheTTL);
      this.log(
        `Cached ${String(reports.length)} reports for node '${nodeId}' for ${String(this.cacheTTL)}ms`,
      );

      return reports;
    } catch (error) {
      this.logError(`Failed to get reports for node '${nodeId}'`, error);
      throw error;
    }
  }

  /**
   * Get catalog for a node
   *
   * Queries PuppetDB catalog endpoint and returns the latest catalog.
   * Implements requirements 4.1, 4.2, 4.5.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Catalog with resources and metadata, or null if not found
   */
  async getNodeCatalog(nodeId: string): Promise<Catalog | null> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cacheKey = `catalog:${nodeId}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        this.log(`Returning cached catalog for node '${nodeId}'`);
        return cached as Catalog;
      }

      // Query PuppetDB for catalog
      const client = this.client;
      if (!client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      // Build PQL query to get catalog for this node
      const pqlQuery = `["=", "certname", "${nodeId}"]`;

      const result = await this.executeWithResilience(async () => {
        return await client.query("pdb/query/v4/catalogs", pqlQuery);
      });

      if (!Array.isArray(result) || result.length === 0) {
        this.log(`Catalog not found for node '${nodeId}'`, "warn");
        return null;
      }

      // Transform the catalog
      const catalog = this.transformCatalog(result[0]);

      // Cache the result
      this.cache.set(cacheKey, catalog, this.cacheTTL);
      this.log(
        `Cached catalog for node '${nodeId}' for ${String(this.cacheTTL)}ms`,
      );

      return catalog;
    } catch (error) {
      this.logError(`Failed to get catalog for node '${nodeId}'`, error);
      throw error;
    }
  }

  /**
   * Get catalog resources organized by type with filtering
   *
   * Extracts resources from catalog and organizes them by type.
   * Implements requirement 4.3.
   *
   * @param nodeId - Node identifier (certname)
   * @param resourceType - Optional filter by resource type
   * @returns Resources organized by type
   */
  async getCatalogResources(
    nodeId: string,
    resourceType?: string,
  ): Promise<Record<string, Resource[]>> {
    this.ensureInitialized();

    try {
      // Get the catalog first
      const catalog = await this.getNodeCatalog(nodeId);

      if (!catalog) {
        this.log(`No catalog found for node '${nodeId}'`, "warn");
        return {};
      }

      // Organize resources by type
      const resourcesByType: Record<string, Resource[]> = {};

      for (const resource of catalog.resources) {
        // Apply filter if specified
        if (resourceType && resource.type !== resourceType) {
          continue;
        }

        // Initialize array for this type if not exists
        if (!(resource.type in resourcesByType)) {
          resourcesByType[resource.type] = [];
        }

        // Add resource to its type group
        resourcesByType[resource.type].push(resource);
      }

      const resourceCount = catalog.resources.length;
      const typeCount = Object.keys(resourcesByType).length;
      this.log(
        `Organized ${String(resourceCount)} resources into ${String(typeCount)} types for node '${nodeId}'`,
      );

      return resourcesByType;
    } catch (error) {
      this.logError(
        `Failed to get catalog resources for node '${nodeId}'`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get events for a node
   *
   * Queries PuppetDB events endpoint and returns events in reverse chronological order.
   * Implements requirements 5.1, 5.2, 5.3.
   *
   * @param nodeId - Node identifier (certname)
   * @param filters - Optional filters for status, resource type, time range
   * @returns Array of events sorted by timestamp (newest first)
   */
  async getNodeEvents(
    nodeId: string,
    filters?: EventFilters,
  ): Promise<Event[]> {
    this.ensureInitialized();

    try {
      // Build cache key based on node and filters
      const filterKey = filters
        ? `${filters.status ?? "all"}:${filters.resourceType ?? "all"}:${filters.startTime ?? ""}:${filters.endTime ?? ""}:${String(filters.limit ?? 100)}`
        : "all";
      const cacheKey = `events:${nodeId}:${filterKey}`;

      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(`Returning cached events for node '${nodeId}'`);
        return cached as Event[];
      }

      // Query PuppetDB for events
      if (!this.client) {
        throw new PuppetDBConnectionError(
          "PuppetDB client not initialized. Ensure initialize() was called successfully.",
        );
      }

      // Build PQL query to get events for this node
      // Start with certname filter
      const queryParts: string[] = [`["=", "certname", "${nodeId}"]`];

      // Add status filter if specified (requirement 5.5)
      if (filters?.status) {
        queryParts.push(`["=", "status", "${filters.status}"]`);
      }

      // Add resource type filter if specified (requirement 5.5)
      if (filters?.resourceType) {
        queryParts.push(`["=", "resource_type", "${filters.resourceType}"]`);
      }

      // Add time range filters if specified (requirement 5.5)
      if (filters?.startTime) {
        queryParts.push(`[">=", "timestamp", "${filters.startTime}"]`);
      }

      if (filters?.endTime) {
        queryParts.push(`["<=", "timestamp", "${filters.endTime}"]`);
      }

      // Combine query parts with AND operator
      const pqlQuery =
        queryParts.length > 1
          ? `["and", ${queryParts.join(", ")}]`
          : queryParts[0];

      // Set limit (default to 100 if not specified)
      const limit = filters?.limit ?? 100;

      const client = this.client;
      const result = await this.executeWithResilience(async () => {
        return await client.query("pdb/query/v4/events", pqlQuery, {
          limit: limit,
          order_by: '[{"field": "timestamp", "order": "desc"}]',
        });
      });

      if (!Array.isArray(result)) {
        this.log(
          `Unexpected response format from PuppetDB events endpoint for node '${nodeId}'`,
          "warn",
        );
        return [];
      }

      // Transform events
      const events = result.map((event) => this.transformEvent(event));

      // Sort by timestamp in reverse chronological order (requirement 5.2)
      // This ensures newest events are first
      events.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA; // Descending order (newest first)
      });

      // Cache the result
      this.cache.set(cacheKey, events, this.cacheTTL);
      this.log(
        `Cached ${String(events.length)} events for node '${nodeId}' for ${String(this.cacheTTL)}ms`,
      );

      return events;
    } catch (error) {
      this.logError(`Failed to get events for node '${nodeId}'`, error);
      throw error;
    }
  }

  /**
   * Execute an operation with retry logic and circuit breaker
   *
   * @param operation - Operation to execute
   * @returns Result of operation
   */
  private async executeWithResilience(
    operation: () => Promise<unknown>,
  ): Promise<unknown> {
    const circuitBreaker = this.circuitBreaker;
    const retryConfig = this.retryConfig;

    if (!circuitBreaker || !retryConfig) {
      throw new PuppetDBConnectionError(
        "PuppetDB service not properly initialized. Circuit breaker or retry config missing.",
        {
          hasCircuitBreaker: !!circuitBreaker,
          hasRetryConfig: !!retryConfig,
        },
      );
    }

    // Wrap operation with circuit breaker
    const protectedOperation = async (): Promise<unknown> => {
      return await circuitBreaker.execute(operation);
    };

    // Wrap with retry logic
    return await withRetry(protectedOperation, retryConfig);
  }

  /**
   * Transform PuppetDB node to normalized format
   *
   * Adds source attribution to indicate the node came from PuppetDB.
   *
   * @param puppetDBNode - Raw node from PuppetDB
   * @returns Normalized node with source attribution
   */
  private transformNode(puppetDBNode: PuppetDBNode): Node {
    const certname = puppetDBNode.certname;

    return {
      id: certname,
      name: certname,
      uri: `ssh://${certname}`,
      transport: "ssh",
      config: {
        // PuppetDB doesn't provide transport config, use defaults
      },
      // Add source attribution as per requirement 1.3
      source: "puppetdb",
    };
  }

  /**
   * Get interfaces from facts map
   *
   * @param value - Value from facts map
   * @returns Interfaces object or empty object
   */
  private getInterfaces(value: unknown): Record<string, unknown> {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  /**
   * Transform PuppetDB catalog to application format
   *
   * Ensures all required fields are present as per requirements 4.1, 4.2, 4.5:
   * - Catalog resources in structured format
   * - Metadata (timestamp, environment)
   *
   * @param catalogData - Raw catalog from PuppetDB
   * @returns Transformed catalog
   */
  private transformCatalog(catalogData: unknown): Catalog {
    // Type assertion - PuppetDB returns catalogs with these fields
    const raw = catalogData as Record<string, unknown>;

    // Transform resources
    const resources: Resource[] = [];
    if (Array.isArray(raw.resources)) {
      for (const resourceData of raw.resources) {
        const res = resourceData as Record<string, unknown>;
        const resType = typeof res.type === "string" ? res.type : "";
        const resTitle = typeof res.title === "string" ? res.title : "";
        const resFile = typeof res.file === "string" ? res.file : undefined;

        resources.push({
          type: resType,
          title: resTitle,
          tags: Array.isArray(res.tags) ? res.tags.map(String) : [],
          exported: Boolean(res.exported),
          file: resFile,
          line: typeof res.line === "number" ? res.line : undefined,
          parameters:
            typeof res.parameters === "object" && res.parameters !== null
              ? (res.parameters as Record<string, unknown>)
              : {},
        });
      }
    }

    // Transform edges
    const edges: Edge[] = [];
    if (Array.isArray(raw.edges)) {
      for (const edgeData of raw.edges) {
        const edge = edgeData as Record<string, unknown>;
        const source = edge.source as Record<string, unknown> | undefined;
        const target = edge.target as Record<string, unknown> | undefined;

        if (source && target) {
          const sourceType = typeof source.type === "string" ? source.type : "";
          const sourceTitle = typeof source.title === "string" ? source.title : "";
          const targetType = typeof target.type === "string" ? target.type : "";
          const targetTitle = typeof target.title === "string" ? target.title : "";
          const edgeRel = typeof edge.relationship === "string" ? edge.relationship : "contains";

          edges.push({
            source: {
              type: sourceType,
              title: sourceTitle,
            },
            target: {
              type: targetType,
              title: targetTitle,
            },
            relationship: this.normalizeRelationship(edgeRel),
          });
        }
      }
    }

    // Return catalog with all required fields (requirements 4.1, 4.2, 4.5)
    const certname = typeof raw.certname === "string" ? raw.certname : "";
    const version = typeof raw.version === "string" ? raw.version : "";
    const transactionUuid = typeof raw.transaction_uuid === "string" ? raw.transaction_uuid : "";
    const environment = typeof raw.environment === "string" ? raw.environment : "production";
    const producerTimestamp = typeof raw.producer_timestamp === "string" ? raw.producer_timestamp : "";
    const hash = typeof raw.hash === "string" ? raw.hash : "";

    return {
      certname,
      version,
      transaction_uuid: transactionUuid,
      environment,
      producer_timestamp: producerTimestamp,
      hash,
      resources,
      edges,
    };
  }

  /**
   * Normalize relationship type to expected values
   *
   * @param relationship - Raw relationship from PuppetDB
   * @returns Normalized relationship
   */
  private normalizeRelationship(
    relationship: string,
  ): "contains" | "before" | "require" | "subscribe" | "notify" {
    const normalized = relationship.toLowerCase();
    if (normalized === "before") return "before";
    if (normalized === "require") return "require";
    if (normalized === "subscribe") return "subscribe";
    if (normalized === "notify") return "notify";
    return "contains";
  }

  /**
   * Transform PuppetDB report to application format
   *
   * Ensures all required fields are present as per requirement 3.3:
   * - Run timestamp
   * - Status (success, failure, unchanged)
   * - Resource change summary
   *
   * @param reportData - Raw report from PuppetDB
   * @returns Transformed report
   */
  private transformReport(reportData: unknown): Report {
    // Type assertion - PuppetDB returns reports with these fields
    const raw = reportData as Record<string, unknown>;

    // Define interface for PuppetDB metric structure
    interface PuppetDBMetric {
      category: unknown;
      name: unknown;
      value: unknown;
    }

    // PuppetDB returns metrics as an array of objects with category, name, and value
    // Example: [{"category": "resources", "name": "total", "value": 2153}, ...]
    const metricsArray = Array.isArray(raw.metrics)
      ? (raw.metrics as PuppetDBMetric[])
      : [];

    // Debug logging to understand the metrics structure
    if (metricsArray.length > 0) {
      this.log(`First metric sample: ${JSON.stringify(metricsArray[0])}`);
      const metricsCount = metricsArray.length;
      this.log(`Total metrics count: ${String(metricsCount)}`);
    } else {
      this.log(
        `No metrics array found. Raw metrics type: ${typeof raw.metrics}`,
      );
      if (raw.metrics) {
        this.log(
          `Raw metrics sample: ${JSON.stringify(raw.metrics).substring(0, 200)}`,
        );
      }
    }

    // Helper to extract metric value from array
    const getMetricValue = (
      category: string,
      name: string,
      fallback = 0,
    ): number => {
      const metric = metricsArray.find(
        (m) => m.category === category && m.name === name,
      );
      const value =
        metric && typeof metric.value === "number" ? metric.value : fallback;
      if (category === "resources" && value === 0 && metricsArray.length > 0) {
        const metricFound = Boolean(metric);
        this.log(
          `Warning: ${category}.${name} returned 0, metric found: ${String(metricFound)}`,
        );
      }
      return value;
    };

    // Build time metrics object
    const timeMetrics: Record<string, number> = {};
    metricsArray
      .filter((m) => m.category === "time")
      .forEach((m) => {
        if (typeof m.name === "string" && typeof m.value === "number") {
          timeMetrics[m.name] = m.value;
        }
      });

    // Transform to Report type with all required fields (requirement 3.3)
    const certname = typeof raw.certname === "string" ? raw.certname : "";
    const hash = typeof raw.hash === "string" ? raw.hash : "";
    const environment = typeof raw.environment === "string" ? raw.environment : "production";
    const statusStr = typeof raw.status === "string" ? raw.status : "unchanged";
    const puppetVersion = typeof raw.puppet_version === "string" ? raw.puppet_version : "";
    const reportFormat = typeof raw.report_format === "number" ? raw.report_format : 0;
    const configVersion = typeof raw.configuration_version === "string" ? raw.configuration_version : "";
    const startTime = typeof raw.start_time === "string" ? raw.start_time : "";
    const endTime = typeof raw.end_time === "string" ? raw.end_time : "";
    const producerTimestamp = typeof raw.producer_timestamp === "string" ? raw.producer_timestamp : "";
    const receiveTime = typeof raw.receive_time === "string" ? raw.receive_time : "";
    const transactionUuid = typeof raw.transaction_uuid === "string" ? raw.transaction_uuid : "";

    return {
      certname,
      hash,
      environment,
      status: this.normalizeReportStatus(statusStr),
      noop: Boolean(raw.noop),
      puppet_version: puppetVersion,
      report_format: reportFormat,
      configuration_version: configVersion,
      start_time: startTime,
      end_time: endTime,
      producer_timestamp: producerTimestamp,
      receive_time: receiveTime,
      transaction_uuid: transactionUuid,
      metrics: {
        resources: {
          total: getMetricValue("resources", "total"),
          skipped: getMetricValue("resources", "skipped"),
          failed: getMetricValue("resources", "failed"),
          failed_to_restart: getMetricValue("resources", "failed_to_restart"),
          restarted: getMetricValue("resources", "restarted"),
          changed: getMetricValue("resources", "changed"),
          out_of_sync: getMetricValue("resources", "out_of_sync"),
          scheduled: getMetricValue("resources", "scheduled"),
        },
        time: timeMetrics,
        changes: {
          total: getMetricValue("changes", "total"),
        },
        events: {
          success: getMetricValue("events", "success"),
          failure: getMetricValue("events", "failure"),
          total: getMetricValue("events", "total"),
        },
      },
      logs: Array.isArray(raw.logs)
        ? (raw.logs as {
            level: string;
            message: string;
            source: string;
            tags: string[];
            time: string;
            file?: string;
            line?: number;
          }[])
        : [],
      resource_events: Array.isArray(raw.resource_events)
        ? (raw.resource_events as {
            resource_type: string;
            resource_title: string;
            property: string;
            timestamp: string;
            status: "success" | "failure" | "noop" | "skipped";
            old_value?: unknown;
            new_value?: unknown;
            message?: string;
            file?: string;
            line?: number;
            containment_path: string[];
          }[])
        : [],
    };
  }

  /**
   * Normalize report status to expected values
   *
   * @param status - Raw status from PuppetDB
   * @returns Normalized status
   */
  private normalizeReportStatus(
    status: string,
  ): "unchanged" | "changed" | "failed" {
    const normalized = status.toLowerCase();
    if (normalized === "changed" || normalized === "success") {
      return "changed";
    }
    if (normalized === "failed" || normalized === "failure") {
      return "failed";
    }
    return "unchanged";
  }

  /**
   * Transform PuppetDB event to application format
   *
   * Ensures all required fields are present as per requirement 5.3:
   * - Event timestamp
   * - Resource
   * - Status (success, failure, noop)
   * - Message
   *
   * @param eventData - Raw event from PuppetDB
   * @returns Transformed event
   */
  private transformEvent(eventData: unknown): Event {
    // Type assertion - PuppetDB returns events with these fields
    const raw = eventData as Record<string, unknown>;

    // Return event with all required fields (requirement 5.3)
    const certname = typeof raw.certname === "string" ? raw.certname : "";
    const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";
    const report = typeof raw.report === "string" ? raw.report : "";
    const resourceType = typeof raw.resource_type === "string" ? raw.resource_type : "";
    const resourceTitle = typeof raw.resource_title === "string" ? raw.resource_title : "";
    const property = typeof raw.property === "string" ? raw.property : "";
    const statusStr = typeof raw.status === "string" ? raw.status : "success";
    const message = typeof raw.message === "string" ? raw.message : undefined;
    const file = typeof raw.file === "string" ? raw.file : undefined;

    return {
      certname,
      timestamp,
      report,
      resource_type: resourceType,
      resource_title: resourceTitle,
      property,
      status: this.normalizeEventStatus(statusStr),
      old_value: raw.old_value,
      new_value: raw.new_value,
      message,
      file,
      line: typeof raw.line === "number" ? raw.line : undefined,
    };
  }

  /**
   * Normalize event status to expected values
   *
   * @param status - Raw status from PuppetDB
   * @returns Normalized status
   */
  private normalizeEventStatus(
    status: string,
  ): "success" | "failure" | "noop" | "skipped" {
    const normalized = status.toLowerCase();
    if (normalized === "failure" || normalized === "failed") {
      return "failure";
    }
    if (normalized === "noop") {
      return "noop";
    }
    if (normalized === "skipped") {
      return "skipped";
    }
    return "success";
  }

  /**
   * Transform PuppetDB facts to normalized format with categorization
   *
   * Organizes facts into categories as per requirement 2.3:
   * - system: OS, kernel, architecture
   * - network: hostname, interfaces, IP addresses
   * - hardware: processors, memory, disks
   * - custom: all other facts
   *
   * @param nodeId - Node identifier
   * @param factsResult - Raw facts from PuppetDB
   * @returns Normalized facts with categorization, timestamp, and source
   */
  private transformFacts(nodeId: string, factsResult: unknown): Facts {
    const factsMap: Record<string, unknown> = {};

    // PuppetDB returns facts as array of {name, value} objects
    if (Array.isArray(factsResult)) {
      for (const fact of factsResult) {
        const puppetFact = fact as PuppetDBFact;
        factsMap[puppetFact.name] = puppetFact.value;
      }
    }

    // Helper to safely get string value
    const getString = (key: string, fallback = "unknown"): string => {
      const value = factsMap[key];
      return typeof value === "string" ? value : fallback;
    };

    // Helper to safely get number value
    const getNumber = (key: string, fallback = 0): number => {
      const value = factsMap[key];
      return typeof value === "number" ? value : fallback;
    };

    // Categorize facts as per requirement 2.3
    const systemFacts: Record<string, unknown> = {};
    const networkFacts: Record<string, unknown> = {};
    const hardwareFacts: Record<string, unknown> = {};
    const customFacts: Record<string, unknown> = {};

    // System category: OS, kernel, architecture
    const systemKeys = [
      "os",
      "osfamily",
      "operatingsystem",
      "operatingsystemrelease",
      "operatingsystemmajrelease",
      "kernel",
      "kernelversion",
      "kernelrelease",
      "kernelmajversion",
      "architecture",
      "hardwaremodel",
      "platform",
      "virtual",
      "is_virtual",
      "timezone",
      "uptime",
      "uptime_seconds",
      "uptime_days",
      "uptime_hours",
    ];

    // Network category: hostname, interfaces, IPs
    const networkKeys = [
      "networking",
      "hostname",
      "fqdn",
      "domain",
      "interfaces",
      "ipaddress",
      "ipaddress6",
      "macaddress",
      "netmask",
      "network",
    ];

    // Hardware category: processors, memory, disks
    const hardwareKeys = [
      "processors",
      "processorcount",
      "physicalprocessorcount",
      "processor",
      "memory",
      "memorysize",
      "memoryfree",
      "memorysize_mb",
      "memoryfree_mb",
      "swapsize",
      "swapfree",
      "swapsize_mb",
      "swapfree_mb",
      "blockdevices",
      "disks",
      "partitions",
      "manufacturer",
      "productname",
      "serialnumber",
      "uuid",
      "boardmanufacturer",
      "boardproductname",
      "boardserialnumber",
      "bios_vendor",
      "bios_version",
      "bios_release_date",
    ];

    // Categorize each fact
    for (const [key, value] of Object.entries(factsMap)) {
      // Check if key starts with any system prefix
      if (
        systemKeys.some(
          (prefix) => key === prefix || key.startsWith(`${prefix}.`),
        )
      ) {
        systemFacts[key] = value;
      } else if (
        networkKeys.some(
          (prefix) => key === prefix || key.startsWith(`${prefix}.`),
        )
      ) {
        networkFacts[key] = value;
      } else if (
        hardwareKeys.some(
          (prefix) => key === prefix || key.startsWith(`${prefix}.`),
        )
      ) {
        hardwareFacts[key] = value;
      } else {
        customFacts[key] = value;
      }
    }

    // Build structured facts object with categories
    // Also maintain backward compatibility with existing structure
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: "puppetdb", // Add source attribution as per requirement 2.2
      facts: {
        // Maintain existing structure for backward compatibility
        os: {
          family: getString("os.family", getString("osfamily", "unknown")),
          name: getString("os.name", getString("operatingsystem", "unknown")),
          release: {
            full: getString(
              "os.release.full",
              getString("operatingsystemrelease", "unknown"),
            ),
            major: getString(
              "os.release.major",
              getString("operatingsystemmajrelease", "unknown"),
            ),
          },
        },
        processors: {
          count: getNumber("processors.count", getNumber("processorcount", 0)),
          models: Array.isArray(factsMap["processors.models"])
            ? (factsMap["processors.models"] as string[])
            : [],
        },
        memory: {
          system: {
            total: getString(
              "memory.system.total",
              getString("memorysize", "0 MB"),
            ),
            available: getString("memory.system.available", "0 MB"),
          },
        },
        networking: {
          hostname: getString(
            "networking.hostname",
            getString("hostname", nodeId),
          ),
          interfaces: this.getInterfaces(factsMap["networking.interfaces"]),
        },
        // Add categorized facts as per requirement 2.3
        categories: {
          system: systemFacts,
          network: networkFacts,
          hardware: hardwareFacts,
          custom: customFacts,
        },
        // Include all other facts for backward compatibility
        ...factsMap,
      },
    };
  }

  /**
   * Validate PQL query syntax
   *
   * Performs basic validation to ensure the query is well-formed.
   * This is a simple check - PuppetDB will perform full validation.
   *
   * @param pqlQuery - PQL query to validate
   * @throws Error if query is invalid
   */
  private validatePQLQuery(pqlQuery: string): void {
    if (!pqlQuery || pqlQuery.trim().length === 0) {
      throw new PuppetDBQueryError("PQL query cannot be empty", pqlQuery, {
        reason: "empty_query",
      });
    }

    // Basic syntax validation
    // PQL queries should be valid JSON arrays starting with an operator
    try {
      const parsed: unknown = JSON.parse(pqlQuery);

      // PQL queries are arrays with operator as first element
      if (!Array.isArray(parsed)) {
        const parsedType = typeof parsed;
        throw new PuppetDBQueryError(
          "PQL query must be a JSON array",
          pqlQuery,
          { reason: "not_array", parsedType },
        );
      }

      if (parsed.length === 0) {
        throw new PuppetDBQueryError(
          "PQL query array cannot be empty",
          pqlQuery,
          { reason: "empty_array" },
        );
      }

      // First element should be an operator (string)
      if (typeof parsed[0] !== "string") {
        const firstElement = parsed[0] as unknown;
        throw new PuppetDBQueryError(
          "PQL query must start with an operator",
          pqlQuery,
          { reason: "invalid_operator", firstElement },
        );
      }

      // Common PQL operators
      const validOperators = [
        "=",
        "!=",
        ">",
        ">=",
        "<",
        "<=",
        "~",
        "!~", // regex operators
        "and",
        "or",
        "not",
        "in",
        "extract",
        "null?",
      ];

      if (!validOperators.includes(parsed[0])) {
        this.log(`Warning: Unknown PQL operator '${parsed[0]}'`, "warn");
      }
    } catch (error) {
      if (error instanceof PuppetDBQueryError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new PuppetDBQueryError(
          `Invalid PQL query syntax: ${error.message}`,
          pqlQuery,
          { reason: "syntax_error", originalError: error.message },
        );
      }
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   *
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client || !this.circuitBreaker) {
      throw new PuppetDBConnectionError(
        "PuppetDB service is not initialized. Call initialize() before using the service.",
        {
          initialized: this.initialized,
          hasClient: !!this.client,
          hasCircuitBreaker: !!this.circuitBreaker,
        },
      );
    }
  }

  /**
   * Get circuit breaker statistics
   *
   * @returns Circuit breaker stats or undefined
   */
  getCircuitBreakerStats(): ReturnType<CircuitBreaker["getStats"]> | undefined {
    return this.circuitBreaker?.getStats();
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.log("Cache cleared");
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    this.cache.clearExpired();
  }
}
