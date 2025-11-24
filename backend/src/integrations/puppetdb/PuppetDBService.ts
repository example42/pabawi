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
import type {
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
} from "../types";
import type { Node, Facts } from "../../bolt/types";
import type { PuppetDBConfig } from "../../config/schema";
import { PuppetDBClient, createPuppetDBClient } from "./PuppetDBClient";
import { CircuitBreaker, createPuppetDBCircuitBreaker } from "./CircuitBreaker";
import { withRetry, createPuppetDBRetryConfig, type RetryConfig } from "./RetryLogic";

/**
 * PuppetDB Service
 *
 * Provides access to PuppetDB data through the plugin interface.
 * Includes retry logic and circuit breaker for resilience.
 */
export class PuppetDBService
  extends BasePlugin
  implements InformationSourcePlugin
{
  type: "information" = "information";
  private client?: PuppetDBClient;
  private circuitBreaker?: CircuitBreaker;
  private retryConfig?: RetryConfig;
  private puppetDBConfig?: PuppetDBConfig;

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
  protected async performInitialization(): Promise<void> {
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

    // Create retry configuration
    this.retryConfig = createPuppetDBRetryConfig(
      this.puppetDBConfig.retryAttempts ?? 3,
      this.puppetDBConfig.retryDelay ?? 1000,
    );

    this.log("PuppetDB service initialized successfully");
  }

  /**
   * Perform plugin-specific health check
   *
   * Queries PuppetDB status endpoint to verify connectivity.
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    if (!this.client || !this.circuitBreaker) {
      return {
        healthy: false,
        message: "PuppetDB client not initialized",
      };
    }

    try {
      // Query status endpoint
      await this.executeWithResilience(async () => {
        return await this.client!.get("/status/v1/services/puppetdb-status");
      });

      return {
        healthy: true,
        message: "PuppetDB is reachable",
        details: {
          baseUrl: this.client.getBaseUrl(),
          hasAuth: this.client.hasAuthentication(),
          hasSSL: this.client.hasSSL(),
          circuitState: this.circuitBreaker!.getState(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        message: `PuppetDB health check failed: ${errorMessage}`,
        details: {
          baseUrl: this.client.getBaseUrl(),
          circuitState: this.circuitBreaker!.getState(),
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Get inventory of nodes from PuppetDB
   *
   * Queries the nodes endpoint and transforms results to normalized format.
   *
   * @returns Array of nodes
   */
  async getInventory(): Promise<Node[]> {
    this.ensureInitialized();

    try {
      const result = await this.executeWithResilience(async () => {
        return await this.client!.query("pdb/query/v4/nodes");
      });

      // Transform PuppetDB nodes to normalized format
      if (!Array.isArray(result)) {
        this.log("Unexpected response format from PuppetDB nodes endpoint", "warn");
        return [];
      }

      return result.map((node: any) => this.transformNode(node));
    } catch (error) {
      this.logError("Failed to get inventory from PuppetDB", error);
      throw error;
    }
  }

  /**
   * Get facts for a specific node
   *
   * Queries the facts endpoint for a node and returns structured facts.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Facts for the node
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    try {
      const result = await this.executeWithResilience(async () => {
        return await this.client!.query(
          "pdb/query/v4/nodes",
          `["=", "certname", "${nodeId}"]`,
        );
      });

      if (!Array.isArray(result) || result.length === 0) {
        throw new Error(`Node '${nodeId}' not found in PuppetDB`);
      }

      const node = result[0] as any;

      // Get detailed facts
      const factsResult = await this.executeWithResilience(async () => {
        return await this.client!.query(
          "pdb/query/v4/facts",
          `["=", "certname", "${nodeId}"]`,
        );
      });

      return this.transformFacts(nodeId, factsResult);
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
  private async getNodeReports(nodeId: string): Promise<unknown[]> {
    // Placeholder - will be implemented in task 5
    this.log(`getNodeReports not yet implemented for ${nodeId}`, "warn");
    return [];
  }

  /**
   * Get catalog for a node (placeholder for future implementation)
   *
   * @param nodeId - Node identifier
   * @returns Catalog or null
   */
  private async getNodeCatalog(nodeId: string): Promise<unknown> {
    // Placeholder - will be implemented in task 6
    this.log(`getNodeCatalog not yet implemented for ${nodeId}`, "warn");
    return null;
  }

  /**
   * Get events for a node (placeholder for future implementation)
   *
   * @param nodeId - Node identifier
   * @returns Events array
   */
  private async getNodeEvents(nodeId: string): Promise<unknown[]> {
    // Placeholder - will be implemented in task 7
    this.log(`getNodeEvents not yet implemented for ${nodeId}`, "warn");
    return [];
  }

  /**
   * Execute an operation with retry logic and circuit breaker
   *
   * @param operation - Operation to execute
   * @returns Result of operation
   */
  private async executeWithResilience<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!this.circuitBreaker || !this.retryConfig) {
      throw new Error("PuppetDB service not properly initialized");
    }

    // Wrap operation with circuit breaker
    const protectedOperation = async () => {
      return await this.circuitBreaker!.execute(operation);
    };

    // Wrap with retry logic
    return await withRetry(protectedOperation, this.retryConfig);
  }

  /**
   * Transform PuppetDB node to normalized format
   *
   * @param puppetDBNode - Raw node from PuppetDB
   * @returns Normalized node
   */
  private transformNode(puppetDBNode: any): Node {
    const certname = puppetDBNode.certname as string;

    return {
      id: certname,
      name: certname,
      uri: `ssh://${certname}`,
      transport: "ssh",
      config: {
        // PuppetDB doesn't provide transport config, use defaults
      },
    };
  }

  /**
   * Transform PuppetDB facts to normalized format
   *
   * @param nodeId - Node identifier
   * @param factsResult - Raw facts from PuppetDB
   * @returns Normalized facts
   */
  private transformFacts(nodeId: string, factsResult: any): Facts {
    const factsMap: Record<string, any> = {};

    // PuppetDB returns facts as array of {name, value} objects
    if (Array.isArray(factsResult)) {
      for (const fact of factsResult) {
        factsMap[fact.name] = fact.value;
      }
    }

    // Build structured facts object
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts: {
        os: {
          family: factsMap["os.family"] ?? factsMap["osfamily"] ?? "unknown",
          name: factsMap["os.name"] ?? factsMap["operatingsystem"] ?? "unknown",
          release: {
            full: factsMap["os.release.full"] ?? factsMap["operatingsystemrelease"] ?? "unknown",
            major: factsMap["os.release.major"] ?? factsMap["operatingsystemmajrelease"] ?? "unknown",
          },
        },
        processors: {
          count: factsMap["processors.count"] ?? factsMap["processorcount"] ?? 0,
          models: factsMap["processors.models"] ?? [],
        },
        memory: {
          system: {
            total: factsMap["memory.system.total"] ?? factsMap["memorysize"] ?? "0 MB",
            available: factsMap["memory.system.available"] ?? "0 MB",
          },
        },
        networking: {
          hostname: factsMap["networking.hostname"] ?? factsMap["hostname"] ?? nodeId,
          interfaces: factsMap["networking.interfaces"] ?? {},
        },
        // Include all other facts
        ...factsMap,
      },
    };
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
  getCircuitBreakerStats() {
    return this.circuitBreaker?.getStats();
  }
}
