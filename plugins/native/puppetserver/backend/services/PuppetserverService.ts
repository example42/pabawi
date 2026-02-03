/**
 * Puppetserver Service
 *
 * Service for interacting with Puppetserver API.
 * Provides catalog compilation, environment management, and facts retrieval.
 *
 * @module plugins/native/puppetserver/backend/services/PuppetserverService
 * @version 1.0.0
 */

import https from "https";
import fs from "fs";
import type {
  Catalog,
  CatalogResource,
  CatalogEdge,
  CatalogDiff,
  ResourceDiff,
  Environment,
  DeploymentResult,
  Facts,
  HealthStatus,
} from "../types.js";
import {
  PuppetserverConnectionError,
  PuppetserverAuthenticationError,
  PuppetserverError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "../types.js";

/**
 * Logger interface - minimal interface for logging
 */
interface LoggerInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/**
 * Simple cache implementation
 */
class SimpleCache {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private defaultTtl: number;

  constructor(ttl = 300000) {
    this.defaultTtl = ttl;
  }

  get(key: string): unknown {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: unknown, ttl?: number): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Puppetserver Service
 *
 * Provides access to Puppetserver data through HTTP API.
 */
export class PuppetserverService {
  private baseUrl: string;
  private httpsAgent?: https.Agent;
  private timeout: number;
  private cache: SimpleCache;
  private logger: LoggerInterface;
  private _initialized = false;

  constructor(
    serverUrl: string,
    certPath?: string,
    keyPath?: string,
    caPath?: string,
    timeout = 30000,
    logger?: LoggerInterface,
  ) {
    // Parse and validate server URL
    const url = new URL(serverUrl);
    const port = url.port || (url.protocol === "https:" ? "8140" : "8080");
    this.baseUrl = `${url.protocol}//${url.hostname}:${port}`;
    this.timeout = timeout;
    this.cache = new SimpleCache();

    // Use provided logger or create a simple console logger
    this.logger = logger ?? {
      info: (message: string, context?: Record<string, unknown>) => {
        console.log(`[INFO] ${message}`, context ?? "");
      },
      warn: (message: string, context?: Record<string, unknown>) => {
        console.warn(`[WARN] ${message}`, context ?? "");
      },
      debug: (message: string, context?: Record<string, unknown>) => {
        if (process.env.DEBUG) {
          console.debug(`[DEBUG] ${message}`, context ?? "");
        }
      },
      error: (message: string, context?: Record<string, unknown>, error?: Error) => {
        console.error(`[ERROR] ${message}`, context ?? "", error ?? "");
      },
    };

    // Configure HTTPS agent if certificates are provided
    if (url.protocol === "https:") {
      this.httpsAgent = this.createHttpsAgent(certPath, keyPath, caPath);
    }
  }

  /**
   * Create HTTPS agent with SSL configuration
   */
  private createHttpsAgent(
    certPath?: string,
    keyPath?: string,
    caPath?: string,
  ): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.3",
    };

    if (caPath) {
      try {
        agentOptions.ca = fs.readFileSync(caPath);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load CA certificate from ${caPath}`,
          error,
        );
      }
    }

    if (certPath) {
      try {
        agentOptions.cert = fs.readFileSync(certPath);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load client certificate from ${certPath}`,
          error,
        );
      }
    }

    if (keyPath) {
      try {
        agentOptions.key = fs.readFileSync(keyPath);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load client key from ${keyPath}`,
          error,
        );
      }
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Initialize the service
   */
  async initialize(_config: unknown): Promise<void> {
    this.logger.info("Initializing PuppetserverService", {
      component: "PuppetserverService",
      operation: "initialize",
    });
    this._initialized = true;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthStatus> {
    const now = new Date().toISOString();

    try {
      await this.getSimpleStatus();
      return {
        healthy: true,
        message: "Puppetserver is reachable",
        lastCheck: now,
        details: {
          baseUrl: this.baseUrl,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Puppetserver health check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: now,
        details: {
          baseUrl: this.baseUrl,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Make HTTP request to Puppetserver
   */
  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        agent: this.httpsAgent,
      };

      const timeoutId = setTimeout(() => {
        req.destroy();
        reject(new PuppetserverError(
          `Request timeout after ${this.timeout}ms`,
          "TIMEOUT",
          { path, timeout: this.timeout },
        ));
      }, this.timeout);

      const req = https.request(options, (res) => {
        clearTimeout(timeoutId);

        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on("end", () => {
          // Handle authentication errors
          if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new PuppetserverAuthenticationError(
              "Authentication failed. Check your Puppetserver credentials.",
              { status: res.statusCode, statusText: res.statusMessage },
            ));
            return;
          }

          // Handle not found
          if (res.statusCode === 404) {
            resolve(null);
            return;
          }

          // Handle other errors
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new PuppetserverError(
              `Puppetserver API error: ${res.statusMessage}`,
              `HTTP_${res.statusCode}`,
              { status: res.statusCode, statusText: res.statusMessage, body: data },
            ));
            return;
          }

          // Parse JSON response
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve(parsed);
          } catch (parseError) {
            reject(new PuppetserverError(
              "Failed to parse Puppetserver response as JSON",
              "PARSE_ERROR",
              parseError,
            ));
          }
        });
      });

      req.on("error", (error) => {
        clearTimeout(timeoutId);

        if (error.message.includes("ECONNREFUSED")) {
          reject(new PuppetserverConnectionError(
            `Cannot connect to Puppetserver at ${this.baseUrl}. Is Puppetserver running?`,
            error,
          ));
        } else if (error.message.includes("certificate")) {
          reject(new PuppetserverConnectionError(
            "SSL certificate validation failed. Check your SSL configuration.",
            error,
          ));
        } else {
          reject(new PuppetserverConnectionError(
            "Failed to connect to Puppetserver",
            error,
          ));
        }
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * GET request
   */
  private async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  /**
   * POST request
   */
  private async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  /**
   * DELETE request
   */
  private async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path);
  }

  /**
   * Get simple status
   */
  async getSimpleStatus(): Promise<unknown> {
    return this.get("/status/v1/simple");
  }

  /**
   * Get services status
   */
  async getServicesStatus(): Promise<unknown> {
    return this.get("/status/v1/services");
  }

  /**
   * Get metrics
   */
  async getMetrics(mbean?: string): Promise<unknown> {
    const path = mbean
      ? `/metrics/v2/read/${encodeURIComponent(mbean)}`
      : "/metrics/v2/list";
    return this.get(path);
  }

  /**
   * Get admin API info
   */
  async getAdminApiInfo(): Promise<unknown> {
    return this.get("/puppet-admin-api/v1");
  }

  /**
   * Compile catalog for a node
   */
  async compileCatalog(certname: string, environment: string): Promise<Catalog> {
    const cacheKey = `catalog:${certname}:${environment}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as Catalog;
    }

    try {
      const result = await this.post(
        `/puppet/v3/catalog/${certname}?environment=${encodeURIComponent(environment)}`,
      );

      if (!result) {
        throw new CatalogCompilationError(
          `Failed to compile catalog for '${certname}' in environment '${environment}'`,
          certname,
          environment,
        );
      }

      const catalog = this.transformCatalog(result, certname, environment);
      this.cache.set(cacheKey, catalog);
      return catalog;
    } catch (error) {
      if (error instanceof CatalogCompilationError) {
        throw error;
      }
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
   */
  async getNodeCatalog(certname: string): Promise<Catalog | null> {
    try {
      return await this.compileCatalog(certname, "production");
    } catch {
      return null;
    }
  }

  /**
   * Compare catalogs between two environments
   */
  async compareCatalogs(
    certname: string,
    env1: string,
    env2: string,
  ): Promise<CatalogDiff> {
    const catalog1 = await this.compileCatalog(certname, env1);
    const catalog2 = await this.compileCatalog(certname, env2);
    return this.diffCatalogs(catalog1, catalog2, env1, env2);
  }

  /**
   * List environments
   */
  async listEnvironments(): Promise<Environment[]> {
    const cacheKey = "environments:all";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as Environment[];
    }

    const result = await this.get("/puppet/v3/environments");
    if (!result) {
      return [];
    }

    const environments = this.transformEnvironments(result);
    this.cache.set(cacheKey, environments);
    return environments;
  }

  /**
   * Get a specific environment
   */
  async getEnvironment(name: string): Promise<Environment | null> {
    const result = await this.get(`/puppet/v3/environment/${name}`);
    if (!result) {
      return null;
    }
    return result as Environment;
  }

  /**
   * Deploy an environment
   */
  async deployEnvironment(name: string): Promise<DeploymentResult> {
    try {
      await this.post("/puppet-admin-api/v1/environment-cache", {
        environment: name,
      });
      this.cache.clear();
      return {
        environment: name,
        status: "success",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new EnvironmentDeploymentError(
        `Failed to deploy environment '${name}'`,
        name,
        error,
      );
    }
  }

  /**
   * Flush environment cache
   */
  async flushEnvironmentCache(name?: string): Promise<DeploymentResult> {
    try {
      const path = name
        ? `/puppet-admin-api/v1/environment-cache?environment=${encodeURIComponent(name)}`
        : "/puppet-admin-api/v1/environment-cache";
      await this.delete(path);
      this.cache.clear();
      return {
        environment: name ?? "all",
        status: "success",
        timestamp: new Date().toISOString(),
        message: name
          ? `Flushed cache for environment '${name}'`
          : "Flushed cache for all environments",
      };
    } catch (error) {
      throw new EnvironmentDeploymentError(
        name
          ? `Failed to flush cache for environment '${name}'`
          : "Failed to flush cache for all environments",
        name ?? "all",
        error,
      );
    }
  }

  /**
   * Get facts for a node
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    const cacheKey = `facts:${nodeId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as Facts;
    }

    const result = await this.get(`/puppet/v3/facts/${nodeId}`);
    if (!result) {
      // Return empty facts structure
      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: "puppetserver",
        facts: {},
      };
    }

    const facts = this.transformFacts(nodeId, result);
    this.cache.set(cacheKey, facts);
    return facts;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ==========================================================================
  // Transform methods
  // ==========================================================================

  private transformCatalog(
    result: unknown,
    certname: string,
    environment: string,
  ): Catalog {
    const data = result as Record<string, unknown>;
    return {
      certname,
      version: String(data.version ?? ""),
      environment,
      transaction_uuid: data.transaction_uuid as string | undefined,
      producer_timestamp: data.producer_timestamp as string | undefined,
      resources: this.transformResources(data.resources),
      edges: this.transformEdges(data.edges),
    };
  }

  private transformResources(resources: unknown): CatalogResource[] {
    if (!Array.isArray(resources)) {
      return [];
    }
    return resources.map((r: Record<string, unknown>) => ({
      type: String(r.type ?? ""),
      title: String(r.title ?? ""),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      exported: Boolean(r.exported),
      file: r.file as string | undefined,
      line: r.line as number | undefined,
      parameters: (r.parameters as Record<string, unknown>) ?? {},
    }));
  }

  private transformEdges(edges: unknown): CatalogEdge[] {
    if (!Array.isArray(edges)) {
      return [];
    }
    return edges.map((e: Record<string, unknown>) => ({
      source: {
        type: String((e.source as Record<string, unknown>)?.type ?? ""),
        title: String((e.source as Record<string, unknown>)?.title ?? ""),
      },
      target: {
        type: String((e.target as Record<string, unknown>)?.type ?? ""),
        title: String((e.target as Record<string, unknown>)?.title ?? ""),
      },
      relationship: (e.relationship as CatalogEdge["relationship"]) ?? "require",
    }));
  }

  private transformEnvironments(result: unknown): Environment[] {
    const data = result as Record<string, unknown>;
    const environments = data.environments as Record<string, unknown> | undefined;

    if (!environments || typeof environments !== "object") {
      return [];
    }

    return Object.entries(environments).map(([name, settings]) => ({
      name,
      settings: settings as Record<string, unknown> | undefined,
    }));
  }

  private transformFacts(nodeId: string, result: unknown): Facts {
    const data = result as Record<string, unknown>;
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: "puppetserver",
      facts: (data.values as Record<string, unknown>) ?? data,
    };
  }

  private diffCatalogs(
    catalog1: Catalog,
    catalog2: Catalog,
    env1: string,
    env2: string,
  ): CatalogDiff {
    const resources1 = new Map(
      catalog1.resources.map((r) => [`${r.type}[${r.title}]`, r]),
    );
    const resources2 = new Map(
      catalog2.resources.map((r) => [`${r.type}[${r.title}]`, r]),
    );

    const added: CatalogResource[] = [];
    const removed: CatalogResource[] = [];
    const modified: ResourceDiff[] = [];
    const unchanged: CatalogResource[] = [];

    // Find added and modified resources
    for (const [key, r2] of resources2) {
      const r1 = resources1.get(key);
      if (!r1) {
        added.push(r2);
      } else {
        const paramChanges = this.diffParameters(r1.parameters, r2.parameters);
        if (paramChanges.length > 0) {
          modified.push({
            type: r2.type,
            title: r2.title,
            parameterChanges: paramChanges,
          });
        } else {
          unchanged.push(r2);
        }
      }
    }

    // Find removed resources
    for (const [key, r1] of resources1) {
      if (!resources2.has(key)) {
        removed.push(r1);
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

  private diffParameters(
    params1: Record<string, unknown>,
    params2: Record<string, unknown>,
  ): { parameter: string; oldValue: unknown; newValue: unknown }[] {
    const changes: { parameter: string; oldValue: unknown; newValue: unknown }[] = [];
    const allKeys = new Set([...Object.keys(params1), ...Object.keys(params2)]);

    for (const key of allKeys) {
      const v1 = params1[key];
      const v2 = params2[key];
      if (JSON.stringify(v1) !== JSON.stringify(v2)) {
        changes.push({ parameter: key, oldValue: v1, newValue: v2 });
      }
    }

    return changes;
  }
}
