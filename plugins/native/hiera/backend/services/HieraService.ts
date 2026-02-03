/**
 * Hiera Service
 *
 * Service for Hiera data lookup, key resolution, and hierarchy management.
 *
 * @module plugins/native/hiera/backend/services/HieraService
 * @version 1.0.0
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type {
  HieraConfig,
  HieraKey,
  HieraKeyIndex,
  HieraKeyLocation,
  HierarchyFileInfo,
  HealthStatus,
} from "../types.js";
import {
  HieraConfigurationError,
  HieraParseError,
  HieraResolutionError,
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
class SimpleCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();
  private defaultTtl: number;

  constructor(ttl = 300000) {
    this.defaultTtl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T, ttl?: number): void {
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
 * Hiera Service
 *
 * Provides Hiera data lookup and key resolution.
 */
export class HieraService {
  private hieraConfigPath: string;
  private controlRepoPath: string;
  private hieraConfig: HieraConfig | null = null;
  private keyIndex: HieraKeyIndex | null = null;
  private cache: SimpleCache<unknown>;
  private logger: LoggerInterface;
  private _initialized = false;

  constructor(
    hieraConfigPath: string,
    controlRepoPath: string,
    logger?: LoggerInterface,
  ) {
    this.hieraConfigPath = hieraConfigPath;
    this.controlRepoPath = controlRepoPath;
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
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing HieraService", {
      component: "HieraService",
      operation: "initialize",
    });

    try {
      // Load Hiera configuration
      this.hieraConfig = await this.loadHieraConfig();

      // Scan hieradata files
      this.keyIndex = await this.scanHieradata();

      this._initialized = true;

      this.logger.info("HieraService initialized successfully", {
        component: "HieraService",
        operation: "initialize",
        metadata: {
          keyCount: this.keyIndex?.totalKeys ?? 0,
          fileCount: this.keyIndex?.totalFiles ?? 0,
        },
      });
    } catch (error) {
      this.logger.warn("HieraService initialization completed with issues", {
        component: "HieraService",
        operation: "initialize",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      // Don't throw - allow service to start in degraded mode
      this._initialized = true;
    }
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

    if (!this._initialized) {
      return {
        healthy: false,
        message: "Service is not initialized",
        lastCheck: now,
      };
    }

    try {
      // Check if hiera config is loaded
      if (!this.hieraConfig) {
        return {
          healthy: false,
          message: "Hiera configuration not loaded",
          lastCheck: now,
        };
      }

      return {
        healthy: true,
        message: "Hiera service is healthy",
        lastCheck: now,
        details: {
          keyCount: this.keyIndex?.totalKeys ?? 0,
          fileCount: this.keyIndex?.totalFiles ?? 0,
          lastScan: this.keyIndex?.lastScan,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: now,
      };
    }
  }

  /**
   * Load Hiera configuration from file
   */
  private async loadHieraConfig(): Promise<HieraConfig> {
    const configPath = path.isAbsolute(this.hieraConfigPath)
      ? this.hieraConfigPath
      : path.join(this.controlRepoPath, this.hieraConfigPath);

    if (!fs.existsSync(configPath)) {
      throw new HieraConfigurationError(
        `Hiera configuration file not found: ${configPath}`,
        { path: configPath },
      );
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = yaml.load(content) as HieraConfig;

      if (!config || config.version !== 5) {
        throw new HieraConfigurationError(
          "Invalid Hiera configuration: must be version 5",
          { path: configPath },
        );
      }

      return config;
    } catch (error) {
      if (error instanceof HieraConfigurationError) {
        throw error;
      }
      throw new HieraParseError(
        `Failed to parse Hiera configuration: ${error instanceof Error ? error.message : String(error)}`,
        { path: configPath },
      );
    }
  }

  /**
   * Scan hieradata files and build key index
   */
  private async scanHieradata(): Promise<HieraKeyIndex> {
    const keys = new Map<string, HieraKey>();
    const files = new Map<string, { path: string; hierarchyLevel: string; keys: string[]; lastModified: string }>();
    const now = new Date().toISOString();

    if (!this.hieraConfig) {
      return {
        keys,
        files,
        lastScan: now,
        totalKeys: 0,
        totalFiles: 0,
      };
    }

    const datadir = this.hieraConfig.defaults?.datadir ?? "data";
    const basePath = path.join(this.controlRepoPath, datadir);

    if (!fs.existsSync(basePath)) {
      this.logger.warn("Hieradata directory not found", {
        component: "HieraService",
        operation: "scanHieradata",
        metadata: { path: basePath },
      });
      return {
        keys,
        files,
        lastScan: now,
        totalKeys: 0,
        totalFiles: 0,
      };
    }

    // Scan each hierarchy level
    for (const level of this.hieraConfig.hierarchy) {
      const paths = level.paths ?? (level.path ? [level.path] : []);

      for (const hieraPath of paths) {
        // Handle glob patterns and static paths
        const resolvedPaths = this.resolveHieraPath(hieraPath, basePath);

        for (const filePath of resolvedPaths) {
          if (fs.existsSync(filePath)) {
            try {
              const fileKeys = await this.scanFile(filePath, level.name);
              const fileLastModified = fs.statSync(filePath).mtime.toISOString();
              const fileInfo = {
                path: filePath,
                hierarchyLevel: level.name,
                keys: [] as string[],
                lastModified: fileLastModified,
              };

              for (const [keyName, locations] of fileKeys) {
                fileInfo.keys.push(keyName);

                const existingKey = keys.get(keyName);
                if (existingKey) {
                  // Add new locations to existing key
                  existingKey.locations.push(...locations);
                  // Update valueTypes with any new types
                  for (const loc of locations) {
                    if (!existingKey.valueTypes.includes(loc.valueType)) {
                      existingKey.valueTypes.push(loc.valueType);
                    }
                  }
                  // Update lastModified if this file is newer
                  if (fileLastModified > existingKey.lastModified) {
                    existingKey.lastModified = fileLastModified;
                  }
                } else {
                  // Create new key with all required fields
                  const valueTypes = [...new Set(locations.map(loc => loc.valueType))];
                  keys.set(keyName, {
                    name: keyName,
                    locations,
                    valueTypes,
                    firstSeen: now,
                    lastModified: fileLastModified,
                  });
                }
              }

              files.set(filePath, fileInfo);
            } catch (error) {
              this.logger.warn("Failed to scan file", {
                component: "HieraService",
                operation: "scanHieradata",
                metadata: {
                  file: filePath,
                  error: error instanceof Error ? error.message : String(error),
                },
              });
            }
          }
        }
      }
    }

    return {
      keys,
      files,
      lastScan: now,
      totalKeys: keys.size,
      totalFiles: files.size,
    };
  }

  /**
   * Resolve Hiera path patterns
   */
  private resolveHieraPath(hieraPath: string, basePath: string): string[] {
    // For now, just handle static paths
    // TODO: Add glob pattern support
    const fullPath = path.join(basePath, hieraPath);

    // Check for .yaml and .yml extensions
    const paths: string[] = [];
    if (fullPath.endsWith(".yaml") || fullPath.endsWith(".yml")) {
      paths.push(fullPath);
    } else {
      paths.push(`${fullPath}.yaml`);
      paths.push(`${fullPath}.yml`);
    }

    return paths.filter(p => fs.existsSync(p));
  }

  /**
   * Scan a single YAML file for keys
   */
  private async scanFile(
    filePath: string,
    hierarchyLevel: string,
  ): Promise<Map<string, HieraKeyLocation[]>> {
    const keys = new Map<string, HieraKeyLocation[]>();

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      if (!data || typeof data !== "object") {
        return keys;
      }

      // Extract keys from the YAML data
      this.extractKeys(data, "", filePath, hierarchyLevel, keys);
    } catch (error) {
      this.logger.warn("Failed to parse YAML file", {
        component: "HieraService",
        operation: "scanFile",
        metadata: {
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    return keys;
  }

  /**
   * Extract keys from YAML data recursively
   */
  private extractKeys(
    data: Record<string, unknown>,
    prefix: string,
    filePath: string,
    hierarchyLevel: string,
    keys: Map<string, HieraKeyLocation[]>,
  ): void {
    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}::${key}` : key;

      const location: HieraKeyLocation = {
        file: filePath,
        line: 0, // TODO: Track line numbers
        value,
        valueType: typeof value,
        hierarchyLevel,
      };

      const existing = keys.get(fullKey);
      if (existing) {
        existing.push(location);
      } else {
        keys.set(fullKey, [location]);
      }
    }
  }

  /**
   * Get all keys from the index
   */
  async getAllKeys(): Promise<HieraKeyIndex> {
    if (!this.keyIndex) {
      this.keyIndex = await this.scanHieradata();
    }
    return this.keyIndex;
  }

  /**
   * Search keys by query
   */
  async searchKeys(query: string): Promise<HieraKey[]> {
    const index = await this.getAllKeys();
    const results: HieraKey[] = [];
    const regex = new RegExp(query, "i");

    for (const [name, key] of index.keys) {
      if (regex.test(name)) {
        results.push(key);
      }
    }

    return results;
  }

  /**
   * Resolve a key for a specific node
   *
   * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
   */
  async resolveKey(
    node: string,
    key: string,
    _environment?: string,
  ): Promise<{
    found: boolean;
    key: string;
    value?: unknown;
    source?: string;
    hierarchyLevel?: string;
    interpolated?: boolean;
    lookupPath?: string[];
  }> {
    const index = await this.getAllKeys();
    const hieraKey = index.keys.get(key);

    if (!hieraKey || hieraKey.locations.length === 0) {
      return {
        found: false,
        key,
      };
    }

    // Return the first value (first lookup method)
    const firstLocation = hieraKey.locations[0];
    return {
      found: true,
      key,
      value: firstLocation.value,
      source: firstLocation.file,
      hierarchyLevel: firstLocation.hierarchyLevel,
      interpolated: false,
    };
  }

  /**
   * Get Hiera data for a specific node
   *
   * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
   */
  async getNodeHieraData(node: string): Promise<{
    node: string;
    keys: Map<string, unknown>;
    hierarchyFiles: HierarchyFileInfo[];
    usedKeys: string[];
    unusedKeys: string[];
  }> {
    const index = await this.getAllKeys();
    const keys = new Map<string, unknown>();
    const usedKeys: string[] = [];
    const unusedKeys: string[] = [];

    for (const [keyName] of index.keys) {
      const resolution = await this.resolveKey(node, keyName);
      keys.set(keyName, resolution);

      if (resolution.found) {
        usedKeys.push(keyName);
      } else {
        unusedKeys.push(keyName);
      }
    }

    return {
      node,
      keys,
      usedKeys,
      unusedKeys,
      hierarchyFiles: [],
    };
  }

  /**
   * Get key values across all nodes
   *
   * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
   */
  async getKeyValuesAcrossNodes(key: string): Promise<Array<{
    node: string;
    value: unknown;
    source: string;
    hierarchyLevel: string;
  }>> {
    // This would require a list of nodes from PuppetDB
    // For now, return empty array
    return [];
  }

  /**
   * Get Hiera configuration
   */
  getHieraConfig(): HieraConfig | null {
    return this.hieraConfig;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cache.clear();
    this.keyIndex = null;
  }

  /**
   * Shutdown service
   */
  shutdown(): void {
    this.cache.clear();
    this._initialized = false;
  }
}
