/**
 * Puppetserver Service
 *
 * Primary service for interacting with Puppetserver API.
 * Implements InformationSourcePlugin interface to provide:
 * - Node inventory from Puppetserver CA
 * - Certificate management operations
 * - Node status tracking
 * - Catalog compilation
 * - Facts retrieval
 * - Environment management
 */

import { BasePlugin } from "../BasePlugin";
import type { InformationSourcePlugin, HealthStatus } from "../types";
import type { Node, Facts } from "../../bolt/types";
import type { PuppetserverConfig } from "../../config/schema";
import { PuppetserverClient } from "./PuppetserverClient";
import type {
  Certificate,
  CertificateStatus,
  NodeStatus,
  NodeActivityCategory,
  Environment,
  DeploymentResult,
  BulkOperationResult,
  Catalog,
  CatalogDiff,
  CatalogResource,
  CatalogEdge,
} from "./types";
import {
  PuppetserverError,
  PuppetserverConnectionError,
  PuppetserverConfigurationError,
  CertificateOperationError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "./errors";

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL
 */
class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get(key: string): unknown {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Puppetserver Service
 *
 * Provides access to Puppetserver data through the plugin interface.
 * Includes retry logic and circuit breaker for resilience.
 */
export class PuppetserverService
  extends BasePlugin
  implements InformationSourcePlugin
{
  type = "information" as const;
  private client?: PuppetserverClient;
  private puppetserverConfig?: PuppetserverConfig;
  private cache = new SimpleCache();
  private cacheTTL = 300000; // Default 5 minutes

  /**
   * Create a new Puppetserver service
   */
  constructor() {
    super("puppetserver", "information");
  }

  /**
   * Perform plugin-specific initialization
   *
   * Creates Puppetserver client with configuration validation.
   */
  protected performInitialization(): Promise<void> {
    this.performInitializationSync();
    return Promise.resolve();
  }

  /**
   * Synchronous initialization logic
   */
  private performInitializationSync(): void {
    // Extract Puppetserver config from integration config
    this.puppetserverConfig = this.config.config as PuppetserverConfig;

    // Check if integration is disabled
    if (!this.config.enabled) {
      this.log("Puppetserver integration is disabled");
      return;
    }

    // Check if configuration is missing
    if (!this.puppetserverConfig.serverUrl) {
      this.log(
        "Puppetserver integration is not configured (missing serverUrl)",
      );
      return;
    }

    // Validate configuration
    this.validatePuppetserverConfig(this.puppetserverConfig);

    // Create Puppetserver client
    this.client = new PuppetserverClient({
      serverUrl: this.puppetserverConfig.serverUrl,
      port: this.puppetserverConfig.port,
      token: this.puppetserverConfig.token,
      cert: this.puppetserverConfig.ssl?.cert,
      key: this.puppetserverConfig.ssl?.key,
      ca: this.puppetserverConfig.ssl?.ca,
      timeout: this.puppetserverConfig.timeout,
      rejectUnauthorized: this.puppetserverConfig.ssl?.rejectUnauthorized,
    });

    // Set cache TTL from config
    if (this.puppetserverConfig.cache?.ttl) {
      this.cacheTTL = this.puppetserverConfig.cache.ttl;
    }

    this.log("Puppetserver service initialized successfully");
    this.log(`Cache TTL set to ${String(this.cacheTTL)}ms`);
  }

  /**
   * Validate Puppetserver configuration
   *
   * @param config - Configuration to validate
   * @throws PuppetserverConfigurationError if configuration is invalid
   */
  private validatePuppetserverConfig(config: PuppetserverConfig): void {
    if (!config.serverUrl) {
      throw new PuppetserverConfigurationError(
        "Puppetserver serverUrl is required",
        { config },
      );
    }

    // Validate URL format
    try {
      new URL(config.serverUrl);
    } catch (error) {
      throw new PuppetserverConfigurationError(
        `Invalid Puppetserver serverUrl: ${config.serverUrl}`,
        { config, error },
      );
    }

    // Validate port if provided
    if (config.port !== undefined && (config.port < 1 || config.port > 65535)) {
      throw new PuppetserverConfigurationError(
        `Invalid port number: ${String(config.port)}. Must be between 1 and 65535.`,
        { config },
      );
    }

    // Validate SSL configuration
    if (config.ssl?.enabled) {
      // If cert is provided, key must also be provided
      if (config.ssl.cert && !config.ssl.key) {
        throw new PuppetserverConfigurationError(
          "SSL key is required when cert is provided",
          { config },
        );
      }

      // If key is provided, cert must also be provided
      if (config.ssl.key && !config.ssl.cert) {
        throw new PuppetserverConfigurationError(
          "SSL cert is required when key is provided",
          { config },
        );
      }
    }

    // Validate timeout
    if (config.timeout && config.timeout <= 0) {
      throw new PuppetserverConfigurationError(
        `Invalid timeout: ${String(config.timeout)}. Must be positive.`,
        { config },
      );
    }

    // Validate retry configuration
    if (config.retryAttempts && config.retryAttempts < 0) {
      throw new PuppetserverConfigurationError(
        `Invalid retryAttempts: ${String(config.retryAttempts)}. Must be non-negative.`,
        { config },
      );
    }

    if (config.retryDelay && config.retryDelay <= 0) {
      throw new PuppetserverConfigurationError(
        `Invalid retryDelay: ${String(config.retryDelay)}. Must be positive.`,
        { config },
      );
    }

    // Validate cache TTL
    if (config.cache?.ttl && config.cache.ttl <= 0) {
      throw new PuppetserverConfigurationError(
        `Invalid cache TTL: ${String(config.cache.ttl)}. Must be positive.`,
        { config },
      );
    }

    this.log("Puppetserver configuration validated successfully");
  }

  /**
   * Perform plugin-specific health check
   *
   * Queries Puppetserver certificate status endpoint to verify connectivity.
   * Tests multiple capabilities to detect partial functionality.
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    if (!this.client) {
      return {
        healthy: false,
        message: "Puppetserver client not initialized",
      };
    }

    // Test multiple capabilities to detect partial functionality
    const capabilities = {
      certificates: false,
      environments: false,
      status: false,
    };

    const errors: string[] = [];

    // Test certificates endpoint
    try {
      await this.client.getCertificates();
      capabilities.certificates = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Certificates: ${errorMessage}`);
    }

    // Test environments endpoint
    try {
      await this.client.getEnvironments();
      capabilities.environments = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Environments: ${errorMessage}`);
    }

    // Determine overall health status
    const workingCount = Object.values(capabilities).filter(Boolean).length;
    const totalCount = Object.keys(capabilities).length;

    const workingCapabilities = Object.entries(capabilities)
      .filter(([, works]) => works)
      .map(([name]) => name);

    const failingCapabilities = Object.entries(capabilities)
      .filter(([, works]) => !works)
      .map(([name]) => name);

    // All working - healthy
    if (workingCount === totalCount) {
      return {
        healthy: true,
        message: "Puppetserver is reachable",
        details: {
          baseUrl: this.client.getBaseUrl(),
          hasTokenAuth: this.client.hasTokenAuthentication(),
          hasCertAuth: this.client.hasCertificateAuthentication(),
          hasSSL: this.client.hasSSL(),
        } as Record<string, unknown>,
      };
    }

    // Some working - degraded
    if (workingCount > 0) {
      return {
        healthy: false,
        degraded: true,
        message: `Puppetserver partially functional. ${String(workingCount)}/${String(totalCount)} capabilities working`,
        workingCapabilities,
        failingCapabilities,
        details: {
          baseUrl: this.client.getBaseUrl(),
          errors,
        },
      };
    }

    // None working - error
    return {
      healthy: false,
      message: `Puppetserver health check failed: ${errors.join("; ")}`,
      details: {
        baseUrl: this.client.getBaseUrl(),
        errors,
      },
    };
  }

  /**
   * Get inventory of nodes from Puppetserver CA
   *
   * Queries the certificates endpoint and transforms results to normalized format.
   * Results are cached with TTL to reduce load on Puppetserver.
   *
   * @returns Array of nodes
   */
  async getInventory(): Promise<Node[]> {
    this.log("=== PuppetserverService.getInventory() called ===");

    this.ensureInitialized();
    this.log("Service is initialized");

    try {
      // Check cache first
      const cacheKey = "inventory:all";
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(`Returning cached inventory (${String(cached.length)} nodes)`);
        return cached as Node[];
      }

      this.log("No cached inventory found, querying Puppetserver");

      // Query Puppetserver for all certificates
      const client = this.client;
      if (!client) {
        this.log("ERROR: Puppetserver client is null!", "error");
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized. Ensure initialize() was called successfully.",
        );
      }

      this.log("Calling client.getCertificates()");
      const result = await client.getCertificates();
      this.log(
        `Received result from getCertificates(): ${typeof result}, isArray: ${String(Array.isArray(result))}`,
      );

      // Transform certificates to normalized format
      if (!Array.isArray(result)) {
        this.log(
          `Unexpected response format from Puppetserver certificates endpoint: ${JSON.stringify(result).substring(0, 200)}`,
          "warn",
        );
        return [];
      }

      this.log(`Transforming ${String(result.length)} certificates to nodes`);

      // Log sample certificate for debugging
      if (result.length > 0) {
        this.log(
          `Sample certificate: ${JSON.stringify(result[0]).substring(0, 200)}`,
        );
      }

      const nodes = result.map((cert) =>
        this.transformCertificateToNode(cert as Certificate),
      );

      this.log(
        `Successfully transformed ${String(nodes.length)} certificates to nodes`,
      );

      // Log sample node for debugging
      if (nodes.length > 0) {
        this.log(`Sample node: ${JSON.stringify(nodes[0])}`);
      }

      // Cache the result
      this.cache.set(cacheKey, nodes, this.cacheTTL);
      this.log(
        `Cached inventory (${String(nodes.length)} nodes) for ${String(this.cacheTTL)}ms`,
      );

      this.log(
        "=== PuppetserverService.getInventory() completed successfully ===",
      );
      return nodes;
    } catch (error) {
      this.logError("Failed to get inventory from Puppetserver", error);
      this.log("=== PuppetserverService.getInventory() failed ===");
      throw error;
    }
  }

  /**
   * Get a single node from inventory
   *
   * Retrieves a specific node by certname from the Puppetserver CA.
   * Results are cached with TTL to reduce load on Puppetserver.
   *
   * @param certname - Node certname
   * @returns Node or null if not found
   */
  async getNode(certname: string): Promise<Node | null> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cacheKey = `node:${certname}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.log(`Returning cached node '${certname}'`);
        return cached as Node | null;
      }

      // Get the certificate for this node
      const certificate = await this.getCertificate(certname);

      if (!certificate) {
        this.log(`Node '${certname}' not found in Puppetserver CA`, "warn");
        this.cache.set(cacheKey, null, this.cacheTTL);
        return null;
      }

      // Transform certificate to node
      const node = this.transformCertificateToNode(certificate);

      // Cache the result
      this.cache.set(cacheKey, node, this.cacheTTL);
      this.log(`Cached node '${certname}' for ${String(this.cacheTTL)}ms`);

      return node;
    } catch (error) {
      this.logError(`Failed to get node '${certname}'`, error);
      throw error;
    }
  }

  /**
   * Get facts for a specific node
   *
   * Implements requirements 4.1, 4.2, 4.3, 4.4, 4.5:
   * - Queries Puppetserver facts API using correct endpoint
   * - Parses and displays facts correctly
   * - Handles missing facts gracefully
   * - Provides detailed error logging
   * - Displays facts from multiple sources with timestamps
   *
   * Queries the facts endpoint for a node and returns structured facts.
   * Results are cached with TTL to reduce load on Puppetserver.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Facts for the node
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    this.log(`Getting facts for node '${nodeId}'`);

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

      // Query Puppetserver for facts
      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized. Ensure initialize() was called successfully.",
        );
      }

      this.log(`Querying Puppetserver for facts for node '${nodeId}'`);
      const result = await client.getFacts(nodeId);

      // Handle missing facts gracefully (requirement 4.4, 4.5)
      if (!result) {
        this.log(
          `No facts found for node '${nodeId}' - node may not have checked in yet`,
          "warn",
        );

        // Return empty facts structure instead of throwing error
        const emptyFacts: Facts = {
          nodeId,
          gatheredAt: new Date().toISOString(),
          source: "puppetserver",
          facts: {
            os: {
              family: "unknown",
              name: "unknown",
              release: {
                full: "unknown",
                major: "unknown",
              },
            },
            processors: {
              count: 0,
              models: [],
            },
            memory: {
              system: {
                total: "0 MB",
                available: "0 MB",
              },
            },
            networking: {
              hostname: nodeId,
              interfaces: {},
            },
            categories: {
              system: {},
              network: {},
              hardware: {},
              custom: {},
            },
          },
        };

        // Cache the empty result with shorter TTL
        this.cache.set(cacheKey, emptyFacts, Math.min(this.cacheTTL, 60000)); // Max 1 minute for empty facts
        return emptyFacts;
      }

      this.log(`Transforming facts for node '${nodeId}'`);
      const facts = this.transformFacts(nodeId, result);

      this.log(
        `Successfully retrieved and transformed facts for node '${nodeId}'`,
      );

      // Cache the result
      this.cache.set(cacheKey, facts, this.cacheTTL);
      this.log(
        `Cached facts for node '${nodeId}' for ${String(this.cacheTTL)}ms`,
      );

      return facts;
    } catch (error) {
      // Enhanced error logging (requirement 4.5)
      this.logError(`Failed to get facts for node '${nodeId}'`, error);

      // Log additional context for debugging
      if (error instanceof PuppetserverError) {
        this.log(
          `Puppetserver error details: ${JSON.stringify(error.details)}`,
          "error",
        );
      }

      throw error;
    }
  }

  /**
   * Get arbitrary data for a node
   *
   * Supports data types: 'status', 'catalog', 'certificate', 'facts'
   *
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve
   * @returns Data of the requested type
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    this.ensureInitialized();

    switch (dataType) {
      case "status":
        return await this.getNodeStatus(nodeId);
      case "catalog":
        return await this.getNodeCatalog(nodeId);
      case "certificate":
        return await this.getCertificate(nodeId);
      case "facts":
        return await this.getNodeFacts(nodeId);
      default:
        throw new Error(
          `Unsupported data type: ${dataType}. Supported types are: status, catalog, certificate, facts`,
        );
    }
  }

  /**
   * List certificates with optional status filter
   *
   * @param status - Optional certificate status filter
   * @returns Array of certificates
   */
  async listCertificates(status?: CertificateStatus): Promise<Certificate[]> {
    this.ensureInitialized();

    try {
      const cacheKey = `certificates:${status ?? "all"}`;
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(
          `Returning cached certificates (${String(cached.length)} certs)`,
        );
        return cached as Certificate[];
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      const result = await client.getCertificates(status);

      if (!Array.isArray(result)) {
        this.log(
          "Unexpected response format from certificates endpoint",
          "warn",
        );
        return [];
      }

      const certificates = result as Certificate[];

      this.cache.set(cacheKey, certificates, this.cacheTTL);
      this.log(
        `Cached ${String(certificates.length)} certificates for ${String(this.cacheTTL)}ms`,
      );

      return certificates;
    } catch (error) {
      this.logError("Failed to list certificates", error);
      throw error;
    }
  }

  /**
   * Get a specific certificate
   *
   * @param certname - Certificate name
   * @returns Certificate or null if not found
   */
  async getCertificate(certname: string): Promise<Certificate | null> {
    this.ensureInitialized();

    try {
      const cacheKey = `certificate:${certname}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.log(`Returning cached certificate for '${certname}'`);
        return cached as Certificate | null;
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      const result = await client.getCertificate(certname);

      if (!result) {
        return null;
      }

      const certificate = result as Certificate;

      this.cache.set(cacheKey, certificate, this.cacheTTL);
      this.log(
        `Cached certificate for '${certname}' for ${String(this.cacheTTL)}ms`,
      );

      return certificate;
    } catch (error) {
      this.logError(`Failed to get certificate for '${certname}'`, error);
      throw error;
    }
  }

  /**
   * Sign a certificate request
   *
   * @param certname - Certificate name to sign
   */
  async signCertificate(certname: string): Promise<void> {
    this.ensureInitialized();

    try {
      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      await client.signCertificate(certname);

      // Clear cache for this certificate and inventory
      this.cache.clear();
      this.log(`Signed certificate for '${certname}' and cleared cache`);
    } catch (error) {
      this.logError(`Failed to sign certificate for '${certname}'`, error);
      throw new CertificateOperationError(
        `Failed to sign certificate for '${certname}'`,
        "sign",
        certname,
        error,
      );
    }
  }

  /**
   * Revoke a certificate
   *
   * @param certname - Certificate name to revoke
   */
  async revokeCertificate(certname: string): Promise<void> {
    this.ensureInitialized();

    try {
      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      await client.revokeCertificate(certname);

      // Clear cache for this certificate and inventory
      this.cache.clear();
      this.log(`Revoked certificate for '${certname}' and cleared cache`);
    } catch (error) {
      this.logError(`Failed to revoke certificate for '${certname}'`, error);
      throw new CertificateOperationError(
        `Failed to revoke certificate for '${certname}'`,
        "revoke",
        certname,
        error,
      );
    }
  }

  /**
   * Bulk sign certificates
   *
   * @param certnames - Array of certificate names to sign
   * @returns Bulk operation result
   */
  async bulkSignCertificates(
    certnames: string[],
  ): Promise<BulkOperationResult> {
    this.ensureInitialized();

    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      total: certnames.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const certname of certnames) {
      try {
        await this.signCertificate(certname);
        result.successful.push(certname);
        result.successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.failed.push({ certname, error: errorMessage });
        result.failureCount++;
      }
    }

    this.log(
      `Bulk sign completed: ${String(result.successCount)} successful, ${String(result.failureCount)} failed`,
    );

    return result;
  }

  /**
   * Bulk revoke certificates
   *
   * @param certnames - Array of certificate names to revoke
   * @returns Bulk operation result
   */
  async bulkRevokeCertificates(
    certnames: string[],
  ): Promise<BulkOperationResult> {
    this.ensureInitialized();

    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      total: certnames.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const certname of certnames) {
      try {
        await this.revokeCertificate(certname);
        result.successful.push(certname);
        result.successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.failed.push({ certname, error: errorMessage });
        result.failureCount++;
      }
    }

    this.log(
      `Bulk revoke completed: ${String(result.successCount)} successful, ${String(result.failureCount)} failed`,
    );

    return result;
  }

  /**
   * Get node status
   *
   * Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5:
   * - Queries Puppetserver status API using correct endpoint
   * - Parses and displays node status correctly
   * - Handles missing status gracefully without blocking other functionality
   * - Provides detailed error logging for debugging
   * - Returns status with activity categorization
   *
   * @param certname - Node certname
   * @returns Node status or minimal status if not found
   */
  async getNodeStatus(certname: string): Promise<NodeStatus> {
    this.ensureInitialized();

    this.log(`Getting status for node '${certname}'`);

    try {
      const cacheKey = `status:${certname}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        this.log(`Returning cached status for node '${certname}'`);
        return cached as NodeStatus;
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      this.log(
        `Querying Puppetserver for status for node '${certname}' (requirement 5.2)`,
      );
      const result = await client.getStatus(certname);

      // Handle missing status gracefully (requirement 5.4, 5.5)
      if (!result) {
        this.log(
          `No status found for node '${certname}' - node may not have checked in yet (requirement 5.4)`,
          "warn",
        );

        // Return minimal status structure instead of throwing error (requirement 5.4)
        const minimalStatus: NodeStatus = {
          certname,
          // All other fields are optional and will be undefined
        };

        // Cache the minimal result with shorter TTL
        this.cache.set(cacheKey, minimalStatus, Math.min(this.cacheTTL, 60000)); // Max 1 minute for missing status

        this.log(
          `Returning minimal status for node '${certname}' - node has not reported to Puppetserver yet`,
          "info",
        );

        return minimalStatus;
      }

      this.log(`Transforming status for node '${certname}' (requirement 5.3)`);
      const status = result as NodeStatus;

      this.log(
        `Successfully retrieved status for node '${certname}' with ${status.report_timestamp ? "report timestamp" : "no report timestamp"} (requirement 5.3)`,
      );

      // Cache the result
      this.cache.set(cacheKey, status, this.cacheTTL);
      this.log(
        `Cached status for node '${certname}' for ${String(this.cacheTTL)}ms`,
      );

      return status;
    } catch (error) {
      // Enhanced error logging (requirement 5.5)
      this.logError(
        `Failed to get status for node '${certname}' (requirement 5.5)`,
        error,
      );

      // Log additional context for debugging (requirement 5.5)
      if (error instanceof PuppetserverError) {
        this.log(
          `Puppetserver error details: ${JSON.stringify(error.details)}`,
          "error",
        );
        this.log(
          `Error code: ${error.code}, Message: ${error.message}`,
          "error",
        );
      }

      // Return minimal status instead of throwing to prevent blocking other functionality (requirement 5.4)
      this.log(
        `Returning minimal status for node '${certname}' due to error - graceful degradation (requirement 5.4)`,
        "warn",
      );

      const minimalStatus: NodeStatus = {
        certname,
      };

      return minimalStatus;
    }
  }

  /**
   * Categorize node activity status based on last check-in time
   *
   * @param status - Node status
   * @returns Activity category: 'active', 'inactive', or 'never_checked_in'
   */
  categorizeNodeActivity(status: NodeStatus): NodeActivityCategory {
    // If no report timestamp, node has never checked in
    if (!status.report_timestamp) {
      return "never_checked_in";
    }

    // Get inactivity threshold from config (default 1 hour = 3600 seconds)
    const thresholdSeconds =
      this.puppetserverConfig?.inactivityThreshold ?? 3600;

    // Parse the report timestamp
    const reportTime = new Date(status.report_timestamp).getTime();
    const now = Date.now();
    const secondsSinceReport = (now - reportTime) / 1000;

    // Check if node is inactive based on threshold
    if (secondsSinceReport > thresholdSeconds) {
      return "inactive";
    }

    return "active";
  }

  /**
   * Check if a node should be highlighted as problematic
   *
   * @param status - Node status
   * @returns true if node should be highlighted (inactive or never checked in)
   */
  shouldHighlightNode(status: NodeStatus): boolean {
    const activity = this.categorizeNodeActivity(status);
    return activity === "inactive" || activity === "never_checked_in";
  }

  /**
   * Get time since last check-in in seconds
   *
   * @param status - Node status
   * @returns Seconds since last check-in, or null if never checked in
   */
  getSecondsSinceLastCheckIn(status: NodeStatus): number | null {
    if (!status.report_timestamp) {
      return null;
    }

    const reportTime = new Date(status.report_timestamp).getTime();
    const now = Date.now();
    return (now - reportTime) / 1000;
  }

  /**
   * List all node statuses
   *
   * @returns Array of node statuses
   */
  async listNodeStatuses(): Promise<NodeStatus[]> {
    this.ensureInitialized();

    // Get all certificates first
    const certificates = await this.listCertificates();

    // Get status for each certificate
    const statuses: NodeStatus[] = [];
    for (const cert of certificates) {
      try {
        const status = await this.getNodeStatus(cert.certname);
        statuses.push(status);
      } catch {
        this.log(
          `Failed to get status for '${cert.certname}', skipping`,
          "warn",
        );
      }
    }

    return statuses;
  }

  /**
   * Compile catalog for a node in a specific environment
   *
   * Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5:
   * - Compiles catalogs for specific environments
   * - Parses and transforms catalog resources
   * - Extracts catalog metadata (environment, timestamp, version)
   * - Provides detailed compilation error handling with line numbers
   *
   * @param certname - Node certname
   * @param environment - Environment name
   * @returns Compiled catalog
   * @throws CatalogCompilationError with detailed error information including line numbers
   */
  async compileCatalog(
    certname: string,
    environment: string,
  ): Promise<Catalog> {
    this.ensureInitialized();

    try {
      const cacheKey = `catalog:${certname}:${environment}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        this.log(
          `Returning cached catalog for node '${certname}' in environment '${environment}'`,
        );
        return cached as Catalog;
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      // Try to get facts for the node to improve catalog compilation
      let facts: Record<string, unknown> | undefined;
      try {
        this.log(`Fetching facts for node '${certname}' to include in catalog compilation`);
        const factsResult = await client.getFacts(certname);
        if (factsResult && typeof factsResult === "object") {
          // Extract facts from the response
          const factsData = factsResult as { name?: string; values?: Record<string, unknown> };
          if (factsData.values) {
            facts = factsData.values;
            this.log(`Retrieved ${Object.keys(facts).length} facts for node '${certname}'`);
          }
        }
      } catch (error) {
        // Log but don't fail - catalog compilation can work without facts in some cases
        this.log(`Warning: Could not retrieve facts for node '${certname}': ${error instanceof Error ? error.message : String(error)}`, "warn");
      }

      const result = await client.compileCatalog(certname, environment, facts);

      if (!result) {
        throw new CatalogCompilationError(
          `Failed to compile catalog for '${certname}' in environment '${environment}'`,
          certname,
          environment,
        );
      }

      // Transform and validate catalog
      const catalog = this.transformCatalog(result, certname, environment);

      this.cache.set(cacheKey, catalog, this.cacheTTL);
      this.log(
        `Cached catalog for node '${certname}' in environment '${environment}' for ${String(this.cacheTTL)}ms`,
      );

      return catalog;
    } catch (error) {
      // If already a CatalogCompilationError, re-throw as-is
      if (error instanceof CatalogCompilationError) {
        throw error;
      }

      // Extract compilation errors from Puppetserver response
      const compilationErrors = this.extractCompilationErrors(error);

      if (compilationErrors.length > 0) {
        this.logError(
          `Catalog compilation failed for '${certname}' in environment '${environment}' with ${String(compilationErrors.length)} error(s)`,
          error,
        );
        throw new CatalogCompilationError(
          `Failed to compile catalog for '${certname}' in environment '${environment}': ${compilationErrors[0]}`,
          certname,
          environment,
          compilationErrors,
          error,
        );
      }

      // If no compilation errors extracted, wrap in CatalogCompilationError
      this.logError(
        `Failed to compile catalog for node '${certname}' in environment '${environment}'`,
        error,
      );
      throw new CatalogCompilationError(
        `Failed to compile catalog for '${certname}' in environment '${environment}'`,
        certname,
        environment,
        undefined,
        error,
      );
    }
  }

  /**
   * Get catalog for a node (uses default environment)
   *
   * @param certname - Node certname
   * @returns Compiled catalog or null if not found
   */
  async getNodeCatalog(certname: string): Promise<Catalog | null> {
    try {
      // Try to get node status first to determine environment
      const status = await this.getNodeStatus(certname);
      const environment = status.catalog_environment ?? "production";

      return await this.compileCatalog(certname, environment);
    } catch {
      this.log(
        `Failed to get catalog for node '${certname}', trying production environment`,
        "warn",
      );

      try {
        return await this.compileCatalog(certname, "production");
      } catch (fallbackError) {
        this.logError(
          `Failed to get catalog for node '${certname}' in production environment`,
          fallbackError,
        );
        return null;
      }
    }
  }

  /**
   * Compare catalogs between two environments
   *
   * @param certname - Node certname
   * @param environment1 - First environment
   * @param environment2 - Second environment
   * @returns Catalog diff
   */
  async compareCatalogs(
    certname: string,
    environment1: string,
    environment2: string,
  ): Promise<CatalogDiff> {
    this.ensureInitialized();

    try {
      // Compile catalogs for both environments
      const catalog1 = await this.compileCatalog(certname, environment1);
      const catalog2 = await this.compileCatalog(certname, environment2);

      // Compare catalogs
      return this.diffCatalogs(catalog1, catalog2, environment1, environment2);
    } catch (err) {
      this.logError(
        `Failed to compare catalogs for node '${certname}' between '${environment1}' and '${environment2}'`,
        err,
      );
      throw err;
    }
  }

  /**
   * List available environments
   *
   * Implements requirements 7.1, 7.2, 7.3, 7.4, 7.5:
   * - Queries Puppetserver environments API using correct endpoint
   * - Parses and displays environments correctly
   * - Handles empty environments list gracefully
   * - Provides detailed error logging for debugging
   * - Shows environment metadata when available
   *
   * @returns Array of environments
   */
  async listEnvironments(): Promise<Environment[]> {
    this.ensureInitialized();

    this.log("Listing environments from Puppetserver");

    try {
      const cacheKey = "environments:all";
      const cached = this.cache.get(cacheKey);
      if (Array.isArray(cached)) {
        this.log(
          `Returning cached environments (${String(cached.length)} envs)`,
        );
        return cached as Environment[];
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      this.log("Querying Puppetserver for environments");
      const result = await client.getEnvironments();

      // Handle empty/null response gracefully (requirement 7.4)
      if (!result) {
        this.log(
          "No environments returned from Puppetserver - may not be configured or endpoint not available",
          "warn",
        );

        // Cache empty result with shorter TTL
        const emptyEnvironments: Environment[] = [];
        this.cache.set(
          cacheKey,
          emptyEnvironments,
          Math.min(this.cacheTTL, 60000),
        ); // Max 1 minute for empty result
        return emptyEnvironments;
      }

      this.log("Transforming environments response");
      // Transform result to Environment array
      const environments = this.transformEnvironments(result);

      // Log if no environments were found after transformation
      if (environments.length === 0) {
        this.log(
          "No environments found after transformation - Puppetserver may not have any environments configured",
          "warn",
        );
      } else {
        this.log(
          `Successfully retrieved ${String(environments.length)} environment(s): ${environments.map((e) => e.name).join(", ")}`,
        );
      }

      // Cache the result
      this.cache.set(cacheKey, environments, this.cacheTTL);
      this.log(
        `Cached ${String(environments.length)} environments for ${String(this.cacheTTL)}ms`,
      );

      return environments;
    } catch (err) {
      // Enhanced error logging (requirement 7.5)
      this.logError("Failed to list environments", err);

      // Log additional context for debugging
      if (err instanceof PuppetserverError) {
        this.log(
          `Puppetserver error details: ${JSON.stringify(err.details)}`,
          "error",
        );
      }

      throw err;
    }
  }

  /**
   * Get a specific environment
   *
   * @param name - Environment name
   * @returns Environment or null if not found
   */
  async getEnvironment(name: string): Promise<Environment | null> {
    this.ensureInitialized();

    try {
      const cacheKey = `environment:${name}`;
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.log(`Returning cached environment '${name}'`);
        return cached as Environment | null;
      }

      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      const result = await client.getEnvironment(name);

      if (!result) {
        return null;
      }

      const environment = result as Environment;

      this.cache.set(cacheKey, environment, this.cacheTTL);
      this.log(`Cached environment '${name}' for ${String(this.cacheTTL)}ms`);

      return environment;
    } catch (error) {
      this.logError(`Failed to get environment '${name}'`, error);
      throw error;
    }
  }

  /**
   * Deploy an environment
   *
   * @param name - Environment name
   * @returns Deployment result
   */
  async deployEnvironment(name: string): Promise<DeploymentResult> {
    this.ensureInitialized();

    try {
      const client = this.client;
      if (!client) {
        throw new PuppetserverConnectionError(
          "Puppetserver client not initialized",
        );
      }

      await client.deployEnvironment(name);

      // Clear cache for environments
      this.cache.clear();
      this.log(`Deployed environment '${name}' and cleared cache`);

      return {
        environment: name,
        status: "success",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logError(`Failed to deploy environment '${name}'`, error);
      throw new EnvironmentDeploymentError(
        `Failed to deploy environment '${name}'`,
        name,
        error,
      );
    }
  }

  /**
   * Transform certificate to normalized node format
   *
   * Implements requirements 3.2: Transform Puppetserver certificates to normalized Node format
   *
   * @param certificate - Certificate from Puppetserver
   * @returns Normalized node
   */
  private transformCertificateToNode(certificate: Certificate): Node {
    const certname = certificate.certname;

    this.log(
      `Transforming certificate '${certname}' with status '${certificate.status}' to node`,
    );

    const node: Node = {
      id: certname,
      name: certname,
      uri: `ssh://${certname}`,
      transport: "ssh",
      config: {},
      source: "puppetserver",
      certificateStatus: certificate.status,
    };

    this.log(`Transformed node: ${JSON.stringify(node)}`);

    return node;
  }

  /**
   * Transform facts from Puppetserver to normalized format
   *
   * Implements requirements 4.2, 4.3:
   * - Correctly parses Puppetserver facts response format
   * - Transforms to normalized Facts structure
   * - Handles missing or malformed data gracefully
   *
   * @param nodeId - Node identifier
   * @param factsResult - Raw facts from Puppetserver
   * @returns Normalized facts
   */
  private transformFacts(nodeId: string, factsResult: unknown): Facts {
    this.log(`Transforming facts for node '${nodeId}'`);

    // Puppetserver returns facts in a different format than PuppetDB
    // Expected format: { name: "certname", values: { "fact.name": "value", ... } }
    // Extract the facts object from the response
    const factsData = factsResult as {
      name?: string;
      values?: Record<string, unknown>;
      environment?: string;
      timestamp?: string;
    };

    const factsMap = factsData.values ?? {};

    this.log(
      `Extracted ${String(Object.keys(factsMap).length)} facts from response for node '${nodeId}'`,
    );

    // Log sample of facts for debugging
    const sampleKeys = Object.keys(factsMap).slice(0, 5);
    if (sampleKeys.length > 0) {
      this.log(`Sample fact keys: ${sampleKeys.join(", ")}`);
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

    // Categorize facts into system, network, hardware, and custom
    const categories = this.categorizeFacts(factsMap);

    // Build structured facts object
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: "puppetserver",
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
          interfaces:
            typeof factsMap["networking.interfaces"] === "object" &&
            factsMap["networking.interfaces"] !== null
              ? (factsMap["networking.interfaces"] as Record<string, unknown>)
              : {},
        },
        categories,
        ...factsMap,
      },
    };
  }

  /**
   * Categorize facts into system, network, hardware, and custom categories
   *
   * Implements requirement 6.4: organize facts by category
   *
   * @param factsMap - Raw facts map
   * @returns Categorized facts
   */
  private categorizeFacts(factsMap: Record<string, unknown>): {
    system: Record<string, unknown>;
    network: Record<string, unknown>;
    hardware: Record<string, unknown>;
    custom: Record<string, unknown>;
  } {
    const system: Record<string, unknown> = {};
    const network: Record<string, unknown> = {};
    const hardware: Record<string, unknown> = {};
    const custom: Record<string, unknown> = {};

    // System fact patterns
    const systemPatterns = [
      /^os\./,
      /^osfamily$/,
      /^operatingsystem/,
      /^kernel/,
      /^system_uptime/,
      /^timezone/,
      /^path$/,
      /^ruby/,
      /^puppet/,
      /^facter/,
      /^selinux/,
      /^augeas/,
    ];

    // Network fact patterns
    const networkPatterns = [
      /^networking\./,
      /^hostname$/,
      /^fqdn$/,
      /^domain$/,
      /^ipaddress/,
      /^macaddress/,
      /^netmask/,
      /^network/,
      /^dhcp_servers/,
      /^interfaces$/,
    ];

    // Hardware fact patterns
    const hardwarePatterns = [
      /^processors\./,
      /^processorcount$/,
      /^processor\d+$/,
      /^physicalprocessorcount$/,
      /^memory\./,
      /^memorysize/,
      /^memoryfree/,
      /^swapsize/,
      /^swapfree/,
      /^blockdevices/,
      /^blockdevice_/,
      /^partitions/,
      /^mountpoints/,
      /^disks/,
      /^virtual$/,
      /^is_virtual$/,
      /^manufacturer$/,
      /^productname$/,
      /^serialnumber$/,
      /^uuid$/,
      /^bios/,
      /^dmi/,
    ];

    // Categorize each fact
    for (const [key, value] of Object.entries(factsMap)) {
      let categorized = false;

      // Check system patterns
      for (const pattern of systemPatterns) {
        if (pattern.test(key)) {
          system[key] = value;
          categorized = true;
          break;
        }
      }

      if (categorized) continue;

      // Check network patterns
      for (const pattern of networkPatterns) {
        if (pattern.test(key)) {
          network[key] = value;
          categorized = true;
          break;
        }
      }

      if (categorized) continue;

      // Check hardware patterns
      for (const pattern of hardwarePatterns) {
        if (pattern.test(key)) {
          hardware[key] = value;
          categorized = true;
          break;
        }
      }

      // If not categorized, it's custom
      if (!categorized) {
        custom[key] = value;
      }
    }

    return { system, network, hardware, custom };
  }

  /**
   * Transform environments response to Environment array
   *
   * Handles multiple response formats from Puppetserver:
   * - Array of environment objects
   * - Array of environment strings
   * - Object with 'environments' property
   *
   * @param result - Raw environments response
   * @returns Array of environments
   */
  private transformEnvironments(result: unknown): Environment[] {
    this.log("Transforming environments response");
    this.log(
      `Response type: ${Array.isArray(result) ? "array" : typeof result}`,
    );

    // Puppetserver returns environments in different formats
    // Handle both array and object responses
    if (Array.isArray(result)) {
      this.log(`Processing array of ${String(result.length)} environment(s)`);

      const environments = result.map((env, index) => {
        if (typeof env === "string") {
          this.log(`Environment ${String(index)}: string format - "${env}"`);
          return { name: env };
        }

        const envObj = env as Record<string, unknown>;
        this.log(
          `Environment ${String(index)}: object format - ${JSON.stringify(envObj).substring(0, 100)}`,
        );

        return {
          name: typeof envObj.name === "string" ? envObj.name : "",
          last_deployed:
            typeof envObj.last_deployed === "string"
              ? envObj.last_deployed
              : undefined,
          status:
            typeof envObj.status === "string"
              ? (envObj.status as "deployed" | "deploying" | "failed")
              : undefined,
        };
      });

      this.log(
        `Transformed ${String(environments.length)} environment(s) from array`,
      );
      return environments;
    }

    // Handle object response with environments property as array
    const envData = result as { environments?: unknown };
    if (typeof envData === "object" && envData.environments) {
      // Check if environments is an array
      if (Array.isArray(envData.environments)) {
        this.log(
          `Processing object with 'environments' array containing ${String(envData.environments.length)} environment(s)`,
        );
        return this.transformEnvironments(envData.environments);
      }

      // Handle environments as object (Puppetserver v3 API format)
      // Format: { environments: { "env1": {...}, "env2": {...} } }
      if (typeof envData.environments === "object") {
        this.log("Processing object with 'environments' as object map");
        const envMap = envData.environments as Record<string, unknown>;
        const envNames = Object.keys(envMap);
        this.log(`Found ${String(envNames.length)} environment(s) in object map`);

        const environments = envNames.map((name) => {
          const envDetails = envMap[name];
          this.log(`Environment "${name}": ${JSON.stringify(envDetails).substring(0, 100)}`);

          // Extract any available metadata from the environment details
          if (typeof envDetails === "object" && envDetails !== null) {
            const details = envDetails as Record<string, unknown>;
            return {
              name,
              last_deployed:
                typeof details.last_deployed === "string"
                  ? details.last_deployed
                  : undefined,
              status:
                typeof details.status === "string"
                  ? (details.status as "deployed" | "deploying" | "failed")
                  : undefined,
            };
          }

          return { name };
        });

        this.log(
          `Transformed ${String(environments.length)} environment(s) from object map`,
        );
        return environments;
      }
    }

    // If we get here, the response format is unexpected
    this.log(
      `Unexpected environments response format: ${JSON.stringify(result).substring(0, 200)}`,
      "warn",
    );
    return [];
  }

  /**
   * Diff two catalogs
   *
   * @param catalog1 - First catalog
   * @param catalog2 - Second catalog
   * @param env1 - First environment name
   * @param env2 - Second environment name
   * @returns Catalog diff
   */
  private diffCatalogs(
    catalog1: Catalog,
    catalog2: Catalog,
    env1: string,
    env2: string,
  ): CatalogDiff {
    const added: typeof catalog1.resources = [];
    const removed: typeof catalog1.resources = [];
    const modified: {
      type: string;
      title: string;
      parameterChanges: {
        parameter: string;
        oldValue: unknown;
        newValue: unknown;
      }[];
    }[] = [];
    const unchanged: typeof catalog1.resources = [];

    // Create maps for quick lookup
    const resources1Map = new Map(
      catalog1.resources.map((r) => [`${r.type}[${r.title}]`, r]),
    );
    const resources2Map = new Map(
      catalog2.resources.map((r) => [`${r.type}[${r.title}]`, r]),
    );

    // Find added and modified resources
    for (const [key, resource2] of resources2Map) {
      const resource1 = resources1Map.get(key);

      if (!resource1) {
        // Resource exists in catalog2 but not in catalog1 - it's added
        added.push(resource2);
      } else {
        // Resource exists in both - check if modified
        const paramChanges = this.compareParameters(
          resource1.parameters,
          resource2.parameters,
        );

        if (paramChanges.length > 0) {
          modified.push({
            type: resource2.type,
            title: resource2.title,
            parameterChanges: paramChanges,
          });
        } else {
          unchanged.push(resource2);
        }
      }
    }

    // Find removed resources
    for (const [key, resource1] of resources1Map) {
      if (!resources2Map.has(key)) {
        removed.push(resource1);
      }
    }

    return {
      environment1: env1,
      environment2: env2,
      added,
      removed,
      modified,
      unchanged,
    };
  }

  /**
   * Compare parameters between two resources
   *
   * @param params1 - Parameters from first resource
   * @param params2 - Parameters from second resource
   * @returns Array of parameter differences
   */
  private compareParameters(
    params1: Record<string, unknown>,
    params2: Record<string, unknown>,
  ): {
    parameter: string;
    oldValue: unknown;
    newValue: unknown;
  }[] {
    const changes: {
      parameter: string;
      oldValue: unknown;
      newValue: unknown;
    }[] = [];

    // Check all parameters in params2
    for (const [key, value2] of Object.entries(params2)) {
      const value1 = params1[key];

      // Compare values (simple comparison, could be enhanced)
      if (JSON.stringify(value1) !== JSON.stringify(value2)) {
        changes.push({
          parameter: key,
          oldValue: value1,
          newValue: value2,
        });
      }
    }

    // Check for removed parameters
    for (const key of Object.keys(params1)) {
      if (!(key in params2)) {
        changes.push({
          parameter: key,
          oldValue: params1[key],
          newValue: undefined,
        });
      }
    }

    return changes;
  }

  /**
   * Transform raw catalog response to typed Catalog
   *
   * Implements requirement 5.3: Parse and transform catalog resources
   * Implements requirement 5.4: Extract catalog metadata
   *
   * @param result - Raw catalog response from Puppetserver
   * @param certname - Node certname
   * @param environment - Environment name
   * @returns Transformed catalog
   */
  private transformCatalog(
    result: unknown,
    certname: string,
    environment: string,
  ): Catalog {
    const catalogData = result as {
      name?: string;
      version?: string;
      environment?: string;
      transaction_uuid?: string;
      producer_timestamp?: string;
      resources?: unknown[];
      edges?: unknown[];
    };

    // Extract resources and transform them
    const resources: CatalogResource[] = [];
    if (Array.isArray(catalogData.resources)) {
      for (const resource of catalogData.resources) {
        const resourceData = resource as {
          type?: string;
          title?: string;
          tags?: string[];
          exported?: boolean;
          file?: string;
          line?: number;
          parameters?: Record<string, unknown>;
        };

        resources.push({
          type: resourceData.type ?? "Unknown",
          title: resourceData.title ?? "Unknown",
          tags: resourceData.tags ?? [],
          exported: resourceData.exported ?? false,
          file: resourceData.file,
          line: resourceData.line,
          parameters: resourceData.parameters ?? {},
        });
      }
    }

    // Extract edges (resource relationships)
    const edges: CatalogEdge[] = [];
    if (Array.isArray(catalogData.edges)) {
      for (const edge of catalogData.edges) {
        const edgeData = edge as {
          source?: { type?: string; title?: string };
          target?: { type?: string; title?: string };
          relationship?: string;
        };

        if (edgeData.source && edgeData.target) {
          edges.push({
            source: {
              type: edgeData.source.type ?? "Unknown",
              title: edgeData.source.title ?? "Unknown",
            },
            target: {
              type: edgeData.target.type ?? "Unknown",
              title: edgeData.target.title ?? "Unknown",
            },
            relationship: (edgeData.relationship ??
              "contains") as CatalogEdge["relationship"],
          });
        }
      }
    }

    return {
      certname: catalogData.name ?? certname,
      version: catalogData.version ?? "unknown",
      environment: catalogData.environment ?? environment,
      transaction_uuid: catalogData.transaction_uuid,
      producer_timestamp: catalogData.producer_timestamp,
      resources,
      edges: edges.length > 0 ? edges : undefined,
    };
  }

  /**
   * Extract compilation errors from Puppetserver error response
   *
   * Implements requirement 5.5: Detailed compilation error handling with line numbers
   *
   * Puppetserver returns compilation errors in various formats:
   * - Error messages may include file paths and line numbers
   * - Format: "Error: <message> at <file>:<line>"
   * - Format: "Error: <message> (file: <file>, line: <line>)"
   * - Format: "Syntax error at line <line>"
   *
   * @param error - Error from Puppetserver
   * @returns Array of formatted error messages with line numbers
   */
  private extractCompilationErrors(error: unknown): string[] {
    const errors: string[] = [];

    if (!error) {
      return errors;
    }

    // Extract error message
    let errorMessage = "";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      errorMessage = (error as { message: string }).message;
    }

    if (!errorMessage) {
      return errors;
    }

    // Check if error is a PuppetserverError with details
    if (error instanceof PuppetserverError && error.details) {
      const details = error.details as {
        body?: string;
        error?: unknown;
      };

      // Try to parse error body as JSON
      if (details.body) {
        try {
          const bodyData = JSON.parse(details.body) as {
            message?: string;
            msg?: string;
            error?: string;
            errors?: string[];
            details?: string;
          };

          // Extract error messages from various fields
          if (bodyData.message) {
            errors.push(bodyData.message);
          }
          if (bodyData.msg) {
            errors.push(bodyData.msg);
          }
          if (bodyData.error) {
            errors.push(bodyData.error);
          }
          if (Array.isArray(bodyData.errors)) {
            errors.push(...bodyData.errors);
          }
          if (bodyData.details) {
            errors.push(bodyData.details);
          }
        } catch {
          // If not JSON, treat as plain text error
          errors.push(details.body);
        }
      }

      // Check for nested error
      if (details.error) {
        const nestedErrors = this.extractCompilationErrors(details.error);
        errors.push(...nestedErrors);
      }
    }

    // If no errors extracted from details, use the main error message
    if (errors.length === 0 && errorMessage) {
      errors.push(errorMessage);
    }

    // Format errors to highlight line numbers
    return errors.map((err) => {
      // Pattern 1: "at <file>:<line>"
      const pattern1 = /at\s+([^\s:]+):(\d+)/g;
      let formatted = err.replace(pattern1, "at $1:$2 (line $2)");

      // Pattern 2: "(file: <file>, line: <line>)"
      const pattern2 = /\(file:\s*([^,]+),\s*line:\s*(\d+)\)/g;
      formatted = formatted.replace(pattern2, "(file: $1, line: $2)");

      // Pattern 3: "line <line>"
      const pattern3 = /line\s+(\d+)/gi;
      if (!formatted.includes("line:") && !formatted.includes("(line")) {
        formatted = formatted.replace(pattern3, "line $1");
      }

      return formatted;
    });
  }

  /**
   * Ensure service is initialized
   *
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new PuppetserverConnectionError(
        "Puppetserver service is not initialized. Call initialize() before using the service.",
        {
          initialized: this.initialized,
          hasClient: !!this.client,
        },
      );
    }
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

  /**
   * Get circuit breaker statistics
   *
   * @returns Circuit breaker stats or undefined
   */
  getCircuitBreakerStats():
    | ReturnType<PuppetserverClient["getCircuitBreaker"]>
    | undefined {
    return this.client?.getCircuitBreaker();
  }
}
