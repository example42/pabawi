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
import { createPuppetDBClient } from "./PuppetDBClient";
import type { CircuitBreaker } from "./CircuitBreaker";
import { createPuppetDBCircuitBreaker } from "./CircuitBreaker";
import {
  withRetry,
  createPuppetDBRetryConfig,
  type RetryConfig,
} from "./RetryLogic";

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

    if (!this.puppetDBConfig.serverUrl) {
      throw new Error("PuppetDB serverUrl is required");
    }

    // Create client
    this.client = createPuppetDBClient(this.puppetDBConfig);
    this.log(`Created PuppetDB client for ${this.client.getBaseUrl()}`);

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
      // Validate PQL query if provided
      if (pqlQuery) {
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
        throw new Error("PuppetDB client not initialized");
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
        throw new Error("PuppetDB client not initialized");
      }

      const result = await this.executeWithResilience(async () => {
        return await client.query(
          "pdb/query/v4/nodes",
          `["=", "certname", "${nodeId}"]`,
        );
      });

      if (!Array.isArray(result) || result.length === 0) {
        throw new Error(`Node '${nodeId}' not found in PuppetDB`);
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
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  /**
   * Get reports for a node (placeholder for future implementation)
   *
   * @param nodeId - Node identifier
   * @returns Reports array
   */
  private getNodeReports(nodeId: string): Promise<unknown[]> {
    // Placeholder - will be implemented in task 5
    this.log(`getNodeReports not yet implemented for ${nodeId}`, "warn");
    return Promise.resolve([]);
  }

  /**
   * Get catalog for a node (placeholder for future implementation)
   *
   * @param nodeId - Node identifier
   * @returns Catalog or null
   */
  private getNodeCatalog(nodeId: string): Promise<unknown> {
    // Placeholder - will be implemented in task 6
    this.log(`getNodeCatalog not yet implemented for ${nodeId}`, "warn");
    return Promise.resolve(null);
  }

  /**
   * Get events for a node (placeholder for future implementation)
   *
   * @param nodeId - Node identifier
   * @returns Events array
   */
  private getNodeEvents(nodeId: string): Promise<unknown[]> {
    // Placeholder - will be implemented in task 7
    this.log(`getNodeEvents not yet implemented for ${nodeId}`, "warn");
    return Promise.resolve([]);
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
      throw new Error("PuppetDB service not properly initialized");
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
   * Transform PuppetDB facts to normalized format
   *
   * @param nodeId - Node identifier
   * @param factsResult - Raw facts from PuppetDB
   * @returns Normalized facts
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

    // Build structured facts object
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts: {
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
        // Include all other facts
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
      throw new Error("PQL query cannot be empty");
    }

    // Basic syntax validation
    // PQL queries should be valid JSON arrays starting with an operator
    try {
      const parsed: unknown = JSON.parse(pqlQuery);

      // PQL queries are arrays with operator as first element
      if (!Array.isArray(parsed)) {
        throw new Error("PQL query must be a JSON array");
      }

      if (parsed.length === 0) {
        throw new Error("PQL query array cannot be empty");
      }

      // First element should be an operator (string)
      if (typeof parsed[0] !== "string") {
        throw new Error("PQL query must start with an operator");
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
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid PQL query syntax: ${error.message}`);
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
      throw new Error("PuppetDB service is not initialized");
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
