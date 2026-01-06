/**
 * CatalogCompiler
 *
 * Compiles Puppet catalogs for nodes to extract code-defined variables
 * that can be used in Hiera resolution. This enables resolution of
 * Hiera keys that depend on variables defined in Puppet code.
 *
 * Requirements: 12.2, 12.3, 12.4, 12.6
 */

import type { IntegrationManager } from "../IntegrationManager";
import type { InformationSourcePlugin } from "../types";
import type { CatalogCompilationConfig, Facts } from "./types";

/**
 * Compiled catalog result with extracted variables
 */
export interface CompiledCatalogResult {
  /** Node identifier */
  nodeId: string;
  /** Environment used for compilation */
  environment: string;
  /** Variables extracted from the catalog */
  variables: Record<string, unknown>;
  /** Classes included in the catalog */
  classes: string[];
  /** Timestamp when catalog was compiled */
  compiledAt: string;
  /** Whether compilation was successful */
  success: boolean;
  /** Warning messages if any */
  warnings?: string[];
  /** Error message if compilation failed */
  error?: string;
}

/**
 * Cache entry for compiled catalogs
 */
interface CatalogCacheEntry {
  result: CompiledCatalogResult;
  cachedAt: number;
  expiresAt: number;
}

/**
 * CatalogCompiler
 *
 * Compiles catalogs using Puppetserver and extracts code-defined variables.
 * Implements caching to improve performance.
 */
export class CatalogCompiler {
  private integrationManager: IntegrationManager;
  private config: CatalogCompilationConfig;
  private cache: Map<string, CatalogCacheEntry> = new Map();

  constructor(
    integrationManager: IntegrationManager,
    config: CatalogCompilationConfig
  ) {
    this.integrationManager = integrationManager;
    this.config = config;
  }

  /**
   * Check if catalog compilation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Compile a catalog for a node and extract variables
   *
   * @param nodeId - Node identifier (certname)
   * @param environment - Puppet environment
   * @param facts - Node facts for compilation
   * @returns Compiled catalog result with extracted variables
   *
   * Requirements: 12.3
   */
  async compileCatalog(
    nodeId: string,
    environment: string,
    facts: Facts
  ): Promise<CompiledCatalogResult> {
    if (!this.config.enabled) {
      return this.createDisabledResult(nodeId, environment);
    }

    // Check cache first
    const cacheKey = this.buildCacheKey(nodeId, environment);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      this.log(`Returning cached catalog for node '${nodeId}' in environment '${environment}'`);
      return cached;
    }

    // Get Puppetserver service
    const puppetserver = this.getPuppetserverService();
    if (!puppetserver) {
      return this.createFailedResult(
        nodeId,
        environment,
        "Puppetserver integration not available for catalog compilation"
      );
    }

    try {
      this.log(`Compiling catalog for node '${nodeId}' in environment '${environment}'`);

      // Compile catalog with timeout
      const catalog = await this.compileWithTimeout(
        puppetserver,
        nodeId,
        environment
      );

      if (!catalog) {
        return this.createFailedResult(
          nodeId,
          environment,
          "Catalog compilation returned null"
        );
      }

      // Extract variables and classes from catalog
      const variables = this.extractVariables(catalog);
      const classes = this.extractClasses(catalog);

      const result: CompiledCatalogResult = {
        nodeId,
        environment,
        variables,
        classes,
        compiledAt: new Date().toISOString(),
        success: true,
      };

      // Cache the result
      this.cacheResult(cacheKey, result);

      this.log(
        `Successfully compiled catalog for node '${nodeId}': ` +
        `${Object.keys(variables).length} variables, ${classes.length} classes`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Catalog compilation failed for node '${nodeId}': ${errorMessage}`, "warn");

      return this.createFailedResult(nodeId, environment, errorMessage);
    }
  }

  /**
   * Get variables for a node from compiled catalog
   *
   * Returns cached variables if available, otherwise compiles the catalog.
   *
   * @param nodeId - Node identifier
   * @param environment - Puppet environment
   * @param facts - Node facts
   * @returns Variables extracted from catalog, or empty object if compilation fails
   *
   * Requirements: 12.3, 12.4
   */
  async getVariables(
    nodeId: string,
    environment: string,
    facts: Facts
  ): Promise<{ variables: Record<string, unknown>; warnings?: string[] }> {
    const result = await this.compileCatalog(nodeId, environment, facts);

    if (!result.success) {
      // Return empty variables with warning (fallback behavior)
      return {
        variables: {},
        warnings: [
          `Catalog compilation failed for node '${nodeId}': ${result.error ?? "Unknown error"}. ` +
          "Using fact-only resolution."
        ],
      };
    }

    return {
      variables: result.variables,
      warnings: result.warnings,
    };
  }

  /**
   * Compile catalog with timeout
   *
   * @param puppetserver - Puppetserver service
   * @param nodeId - Node identifier
   * @param environment - Puppet environment
   * @returns Compiled catalog or null
   */
  private async compileWithTimeout(
    puppetserver: InformationSourcePlugin,
    nodeId: string,
    environment: string
  ): Promise<unknown> {
    const timeoutMs = this.config.timeout;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Catalog compilation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Use getNodeData with 'catalog' type to get compiled catalog
      // The Puppetserver service's compileCatalog method is accessed via getNodeData
      this.compileCatalogViaService(puppetserver, nodeId, environment)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Compile catalog via Puppetserver service
   *
   * @param puppetserver - Puppetserver service
   * @param nodeId - Node identifier
   * @param environment - Puppet environment
   * @returns Compiled catalog
   */
  private async compileCatalogViaService(
    puppetserver: InformationSourcePlugin,
    nodeId: string,
    environment: string
  ): Promise<unknown> {
    // Check if the service has a compileCatalog method
    const service = puppetserver as unknown as {
      compileCatalog?: (certname: string, environment: string) => Promise<unknown>;
    };

    if (typeof service.compileCatalog === "function") {
      return service.compileCatalog(nodeId, environment);
    }

    // Fallback to getNodeData with 'catalog' type
    return puppetserver.getNodeData(nodeId, "catalog");
  }

  /**
   * Extract variables from a compiled catalog
   *
   * Extracts class parameters and resource parameters that can be used
   * as variables in Hiera resolution.
   *
   * @param catalog - Compiled catalog
   * @returns Extracted variables
   */
  private extractVariables(catalog: unknown): Record<string, unknown> {
    const variables: Record<string, unknown> = {};

    if (!catalog || typeof catalog !== "object") {
      return variables;
    }

    const catalogObj = catalog as {
      resources?: Array<{
        type: string;
        title: string;
        parameters?: Record<string, unknown>;
      }>;
      classes?: string[];
      environment?: string;
    };

    // Extract class parameters from Class resources
    if (Array.isArray(catalogObj.resources)) {
      for (const resource of catalogObj.resources) {
        if (resource.type === "Class" && resource.parameters) {
          // Store class parameters as variables
          // Format: classname::parameter
          const className = resource.title.toLowerCase();
          for (const [paramName, paramValue] of Object.entries(resource.parameters)) {
            const varName = `${className}::${paramName}`;
            variables[varName] = paramValue;
          }
        }
      }
    }

    // Add environment as a variable
    if (catalogObj.environment) {
      variables["environment"] = catalogObj.environment;
    }

    return variables;
  }

  /**
   * Extract class names from a compiled catalog
   *
   * @param catalog - Compiled catalog
   * @returns Array of class names
   */
  private extractClasses(catalog: unknown): string[] {
    const classes: string[] = [];

    if (!catalog || typeof catalog !== "object") {
      return classes;
    }

    const catalogObj = catalog as {
      resources?: Array<{
        type: string;
        title: string;
      }>;
      classes?: string[];
    };

    // Extract from classes array if present
    if (Array.isArray(catalogObj.classes)) {
      classes.push(...catalogObj.classes.map((c) => c.toLowerCase()));
    }

    // Extract from Class resources
    if (Array.isArray(catalogObj.resources)) {
      for (const resource of catalogObj.resources) {
        if (resource.type === "Class") {
          const className = resource.title.toLowerCase();
          if (!classes.includes(className)) {
            classes.push(className);
          }
        }
      }
    }

    return classes;
  }

  /**
   * Get Puppetserver service from integration manager
   */
  private getPuppetserverService(): InformationSourcePlugin | null {
    return this.integrationManager.getInformationSource("puppetserver");
  }

  /**
   * Build cache key for a node and environment
   */
  private buildCacheKey(nodeId: string, environment: string): string {
    return `${nodeId}:${environment}`;
  }

  /**
   * Get cached result if not expired
   */
  private getCachedResult(cacheKey: string): CompiledCatalogResult | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.result;
  }

  /**
   * Cache a compilation result
   */
  private cacheResult(cacheKey: string, result: CompiledCatalogResult): void {
    const now = Date.now();
    this.cache.set(cacheKey, {
      result,
      cachedAt: now,
      expiresAt: now + this.config.cacheTTL,
    });
  }

  /**
   * Create a result for when compilation is disabled
   */
  private createDisabledResult(
    nodeId: string,
    environment: string
  ): CompiledCatalogResult {
    return {
      nodeId,
      environment,
      variables: {},
      classes: [],
      compiledAt: new Date().toISOString(),
      success: false,
      error: "Catalog compilation is disabled",
    };
  }

  /**
   * Create a failed result
   */
  private createFailedResult(
    nodeId: string,
    environment: string,
    error: string
  ): CompiledCatalogResult {
    return {
      nodeId,
      environment,
      variables: {},
      classes: [],
      compiledAt: new Date().toISOString(),
      success: false,
      error,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.log("Catalog cache cleared");
  }

  /**
   * Invalidate cache for a specific node
   */
  invalidateNode(nodeId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${nodeId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    if (keysToDelete.length > 0) {
      this.log(`Invalidated ${keysToDelete.length} cache entries for node '${nodeId}'`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    enabled: boolean;
    cacheTTL: number;
  } {
    return {
      size: this.cache.size,
      enabled: this.config.enabled,
      cacheTTL: this.config.cacheTTL,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: CatalogCompilationConfig): void {
    this.config = config;
    // Clear cache when config changes
    this.clearCache();
    this.log(`Configuration updated: enabled=${config.enabled}, timeout=${config.timeout}ms, cacheTTL=${config.cacheTTL}ms`);
  }

  /**
   * Log a message
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const prefix = "[CatalogCompiler]";
    switch (level) {
      case "warn":
        console.warn(prefix, message);
        break;
      case "error":
        console.error(prefix, message);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(prefix, message);
    }
  }
}
