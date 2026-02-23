/**
 * HieraService
 *
 * Core service orchestrating Hiera operations including parsing, scanning,
 * resolution, and fact retrieval. Implements caching for performance optimization.
 * Supports optional catalog compilation for code-defined variable resolution.
 *
 * Requirements: 15.1, 15.5 - Cache parsed hieradata and resolved values
 * Requirements: 12.2, 12.3, 12.4 - Catalog compilation mode with fallback
 */

import * as fs from "fs";
import * as path from "path";
import type { IntegrationManager } from "../IntegrationManager";
import type { Resource } from "../puppetdb/types";
import { HieraParser } from "./HieraParser";
import { HieraScanner } from "./HieraScanner";
import { HieraResolver } from "./HieraResolver";
import type { CatalogAwareResolveOptions } from "./HieraResolver";
import { FactService } from "./FactService";
import { CatalogCompiler } from "./CatalogCompiler";
import { LoggerService } from "../../services/LoggerService";
import type {
  HieraConfig,
  HieraKey,
  HieraKeyIndex,
  HieraResolution,
  NodeHieraData,
  KeyNodeValues,
  ValueGroup,
  Facts,
  HieraCacheConfig,
  FactSourceConfig,
  CatalogCompilationConfig,
  HierarchyFileInfo,
  HierarchyLevel,
} from "./types";

/**
 * Cache entry for resolved values
 */
interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Configuration for HieraService
 */
export interface HieraServiceConfig {
  controlRepoPath: string;
  hieraConfigPath: string;
  hieradataPath?: string;
  factSources: FactSourceConfig;
  cache: HieraCacheConfig;
  catalogCompilation?: CatalogCompilationConfig;
}

/**
 * HieraService
 *
 * Orchestrates HieraParser, HieraScanner, HieraResolver, FactService, and CatalogCompiler
 * to provide unified Hiera data access with caching and optional catalog compilation.
 */
export class HieraService {
  private parser: HieraParser;
  private scanner: HieraScanner;
  private resolver: HieraResolver;
  private factService: FactService;
  private catalogCompiler: CatalogCompiler | null = null;
  private integrationManager: IntegrationManager;
  private logger: LoggerService;

  private config: HieraServiceConfig;
  private hieraConfig: HieraConfig | null = null;
  private initialized = false;

  // Cache storage
  private keyIndexCache: CacheEntry<HieraKeyIndex> | null = null;
  private resolutionCache = new Map<string, CacheEntry<HieraResolution>>();
  private nodeDataCache = new Map<string, CacheEntry<NodeHieraData>>();
  private hieraConfigCache: CacheEntry<HieraConfig> | null = null;

  // Cache configuration
  private cacheEnabled: boolean;
  private cacheTTL: number;
  private maxCacheEntries: number;

  constructor(
    integrationManager: IntegrationManager,
    config: HieraServiceConfig
  ) {
    this.integrationManager = integrationManager;
    this.config = config;
    this.logger = new LoggerService();

    // Initialize components
    this.parser = new HieraParser(config.controlRepoPath);

    // Parse hiera.yaml to get the actual datadir configuration
    const hieraParseResult = this.parser.parse(config.hieraConfigPath);
    const actualDatadir = hieraParseResult.success && hieraParseResult.config?.defaults?.datadir
      ? hieraParseResult.config.defaults.datadir
      : config.hieradataPath ?? "data";

    this.scanner = new HieraScanner(
      config.controlRepoPath,
      actualDatadir
    );
    this.resolver = new HieraResolver(config.controlRepoPath);
    this.factService = new FactService(integrationManager, config.factSources);

    // Initialize catalog compiler if configured
    if (config.catalogCompilation) {
      this.catalogCompiler = new CatalogCompiler(
        integrationManager,
        config.catalogCompilation
      );
      this.log(`CatalogCompiler initialized (enabled: ${String(config.catalogCompilation.enabled)})`);
    }

    // Cache configuration
    this.cacheEnabled = config.cache.enabled;
    this.cacheTTL = config.cache.ttl;
    this.maxCacheEntries = config.cache.maxEntries;

    this.log("HieraService created");
  }

  /**
   * Initialize the service
   *
   * Parses hiera.yaml and performs initial scan of hieradata.
   */
  async initialize(): Promise<void> {
    this.log("Initializing HieraService...");

    // Parse hiera.yaml
    const parseResult = this.parser.parse(this.config.hieraConfigPath);
    if (!parseResult.success || !parseResult.config) {
      throw new Error(
        `Failed to parse hiera.yaml: ${parseResult.error?.message ?? "Unknown error"}`
      );
    }

    this.hieraConfig = parseResult.config;

    // Check if the datadir from hiera.yaml differs from what the scanner is using
    const configuredDatadir = this.hieraConfig.defaults?.datadir;
    if (configuredDatadir) {
      // Get all unique datadirs from the hierarchy
      const allDatadirs = this.getAllDatadirs(this.hieraConfig);

      // Always use scanMultipleDatadirs to handle all datadirs properly
      await this.scanner.scanMultipleDatadirs(allDatadirs);
      this.log(`Updated scanner to use datadirs: ${allDatadirs.join(', ')}`);
    } else {
      // Perform initial scan with the fallback path
      await this.scanner.scan();
      this.log(`Using fallback hieradata path: ${this.config.hieradataPath ?? "data"}`);
    }

    // Cache the parsed config
    if (this.cacheEnabled) {
      this.hieraConfigCache = this.createCacheEntry(this.hieraConfig);
    }

    // Set up file watching for cache invalidation
    this.scanner.watchForChanges((changedFiles) => {
      this.handleFileChanges(changedFiles);
    });

    this.initialized = true;
    this.log("HieraService initialized successfully");
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Key Discovery Methods
  // ============================================================================

  /**
   * Get all discovered Hiera keys
   *
   * @returns Key index with all discovered keys
   */
  getAllKeys(): Promise<HieraKeyIndex> {
    this.ensureInitialized();

    // Check cache
    if (this.cacheEnabled && this.keyIndexCache && !this.isCacheExpired(this.keyIndexCache)) {
      return Promise.resolve(this.keyIndexCache.value);
    }

    // Get the current key index from the scanner (don't rescan)
    const keyIndex = this.scanner.getKeyIndex();

    // Update cache
    if (this.cacheEnabled) {
      this.keyIndexCache = this.createCacheEntry(keyIndex);
    }

    return Promise.resolve(keyIndex);
  }

  /**
   * Search for keys matching a query
   *
   * @param query - Search query (partial key name, case-insensitive)
   * @returns Array of matching keys
   */
  async searchKeys(query: string): Promise<HieraKey[]> {
    this.ensureInitialized();

    // Ensure key index is loaded
    await this.getAllKeys();

    return this.scanner.searchKeys(query);
  }

  /**
   * Get a specific key by name
   *
   * @param keyName - Full key name
   * @returns Key details or undefined if not found
   */
  async getKey(keyName: string): Promise<HieraKey | undefined> {
    this.ensureInitialized();

    // Ensure key index is loaded
    await this.getAllKeys();

    return this.scanner.getKey(keyName);
  }

  // ============================================================================
  // Key Resolution Methods
  // ============================================================================

  /**
   * Resolve a Hiera key for a specific node
   *
   * When catalog compilation is enabled, attempts to compile a catalog to extract
   * code-defined variables. Falls back to fact-only resolution if compilation fails.
   *
   * @param nodeId - Node identifier (certname)
   * @param key - Hiera key to resolve
   * @param environment - Optional Puppet environment (defaults to "production")
   * @returns Resolution result with value and metadata
   *
   * Requirements: 12.2, 12.3, 12.4
   */
  async resolveKey(
    nodeId: string,
    key: string,
    environment = "production"
  ): Promise<HieraResolution> {
    this.ensureInitialized();

    // Check cache
    const cacheKey = this.buildResolutionCacheKey(nodeId, key);
    if (this.cacheEnabled) {
      const cached = this.resolutionCache.get(cacheKey);
      if (cached && !this.isCacheExpired(cached)) {
        return cached.value;
      }
    }

    // Get facts for the node
    const factResult = await this.factService.getFacts(nodeId);
    const facts = factResult.facts;

    // Build resolve options with catalog variables if compilation is enabled
    const resolveOptions = await this.buildResolveOptions(nodeId, environment, facts);

    // Resolve the key with catalog variables (or empty if compilation disabled/failed)
    if (!this.hieraConfig) {
      throw new Error("Hiera configuration not loaded");
    }

    const resolution = await this.resolver.resolve(
      key,
      facts,
      this.hieraConfig,
      resolveOptions
    );

    // Update cache
    if (this.cacheEnabled) {
      this.addToResolutionCache(cacheKey, resolution);
    }

    return resolution;
  }

  /**
   * Build resolve options with catalog variables if compilation is enabled
   *
   * Implements fallback behavior: if catalog compilation fails, returns empty
   * variables with a warning message.
   *
   * @param nodeId - Node identifier
   * @param environment - Puppet environment
   * @param facts - Node facts
   * @returns Resolve options with catalog variables and warnings
   *
   * Requirements: 12.3, 12.4
   */
  private async buildResolveOptions(
    nodeId: string,
    environment: string,
    facts: Facts
  ): Promise<CatalogAwareResolveOptions> {
    // If catalog compilation is not configured or disabled, return empty options
    if (!this.catalogCompiler?.isEnabled()) {
      return {};
    }

    // Attempt catalog compilation
    const { variables, warnings } = await this.catalogCompiler.getVariables(
      nodeId,
      environment,
      facts
    );

    // Log warnings if any (fallback occurred)
    if (warnings && warnings.length > 0) {
      for (const warning of warnings) {
        this.log(warning, "warn");
      }
    }

    return {
      catalogVariables: variables,
      catalogWarnings: warnings,
    };
  }

  /**
   * Resolve all keys for a specific node
   *
   * @param nodeId - Node identifier
   * @param environment - Optional Puppet environment (defaults to "production")
   * @returns Map of key names to resolution results
   */
  async resolveAllKeys(
    nodeId: string,
    environment = "production"
  ): Promise<Map<string, HieraResolution>> {
    this.ensureInitialized();

    const results = new Map<string, HieraResolution>();

    // Get all keys
    const keyIndex = await this.getAllKeys();

    // Get facts for the node
    const factResult = await this.factService.getFacts(nodeId);
    const facts = factResult.facts;

    // Build resolve options once for all keys (catalog compilation is expensive)
    const resolveOptions = await this.buildResolveOptions(nodeId, environment, facts);

    // Resolve each key
    for (const keyName of keyIndex.keys.keys()) {
      const cacheKey = this.buildResolutionCacheKey(nodeId, keyName);

      // Check cache first
      if (this.cacheEnabled) {
        const cached = this.resolutionCache.get(cacheKey);
        if (cached && !this.isCacheExpired(cached)) {
          results.set(keyName, cached.value);
          continue;
        }
      }

      // Resolve the key with catalog variables
      if (!this.hieraConfig) {
        throw new Error("Hiera configuration not loaded");
      }

      const resolution = await this.resolver.resolve(
        keyName,
        facts,
        this.hieraConfig,
        resolveOptions
      );

      results.set(keyName, resolution);

      // Update cache
      if (this.cacheEnabled) {
        this.addToResolutionCache(cacheKey, resolution);
      }
    }

    return results;
  }

  // ============================================================================
  // Node-Specific Data Methods
  // ============================================================================

  /**
   * Get all Hiera data for a specific node
   *
   * Includes used/unused key classification based on catalog analysis.
   * Keys are classified as "used" if they match patterns associated with
   * classes included in the node's catalog.
   *
   * @param nodeId - Node identifier
   * @returns Node Hiera data including all keys and usage classification
   *
   * Requirements: 6.2, 6.6
   */
  async getNodeHieraData(nodeId: string): Promise<NodeHieraData> {
    this.ensureInitialized();

    // Check cache
    if (this.cacheEnabled) {
      const cached = this.nodeDataCache.get(nodeId);
      if (cached && !this.isCacheExpired(cached)) {
        return cached.value;
      }
    }

    // Get facts
    const factResult = await this.factService.getFacts(nodeId);
    const facts = factResult.facts;

    // Resolve all keys
    const keys = await this.resolveAllKeys(nodeId);

    // Classify keys as used/unused based on catalog analysis
    const { usedKeys, unusedKeys, classes } = await this.classifyKeyUsage(nodeId, keys);

    // Generate hierarchy file information
    const hierarchyFiles = await this.getHierarchyFiles(nodeId, facts);

    const nodeData: NodeHieraData = {
      nodeId,
      facts,
      keys,
      usedKeys,
      unusedKeys,
      hierarchyFiles,
      classes,
    };

    // Update cache
    if (this.cacheEnabled) {
      this.addToNodeDataCache(nodeId, nodeData);
    }

    return nodeData;
  }

  /**
   * Classify Hiera keys as used or unused based on catalog analysis
   *
   * Keys are classified as "used" if:
   * 1. They match a class name pattern from the catalog (e.g., "profile::nginx::*")
   * 2. They are referenced by a class included in the catalog
   *
   * @param nodeId - Node identifier
   * @param keys - Map of resolved keys
   * @returns Object with usedKeys, unusedKeys sets, and classes array
   *
   * Requirements: 6.6
   */
  private async classifyKeyUsage(
    nodeId: string,
    keys: Map<string, HieraResolution>
  ): Promise<{ usedKeys: Set<string>; unusedKeys: Set<string>; classes: string[] }> {
    const usedKeys = new Set<string>();
    const unusedKeys = new Set<string>();

    // Try to get included classes from PuppetDB catalog
    const includedClasses = await this.getIncludedClasses(nodeId);

    // If no catalog data available, mark all keys as unused since we can't determine usage
    if (includedClasses.length === 0) {
      this.log(`No catalog classes found for node ${nodeId}, marking all keys as unused`);
      for (const keyName of keys.keys()) {
        unusedKeys.add(keyName);
      }
      this.log(`No-catalog classification: ${String(usedKeys.size)} used keys, ${String(unusedKeys.size)} unused keys`);
      return { usedKeys, unusedKeys, classes: [] };
    }

    // Build class prefixes for matching
    // e.g., "profile::nginx" -> ["profile::nginx::", "profile::nginx"]
    const classPrefixes = this.buildClassPrefixes(includedClasses);
    this.log(`Built ${String(classPrefixes.size)} class prefixes from ${String(includedClasses.length)} classes`);

    // Classify each key
    for (const keyName of keys.keys()) {
      if (this.isKeyUsedByClasses(keyName, classPrefixes)) {
        usedKeys.add(keyName);
      } else {
        unusedKeys.add(keyName);
      }
    }

    this.log(`Class-based classification: ${String(usedKeys.size)} used keys, ${String(unusedKeys.size)} unused keys`);
    return { usedKeys, unusedKeys, classes: includedClasses };
  }

  /**
   * Get list of classes included in a node's catalog
   *
   * Attempts to retrieve catalog from PuppetDB and extract class names.
   *
   * @param nodeId - Node identifier
   * @returns Array of class names
   */
  private async getIncludedClasses(nodeId: string): Promise<string[]> {
    try {
      // Try to get PuppetDB service from integration manager
      const puppetdb = this.integrationManager.getInformationSource("puppetdb");

      if (!puppetdb?.isInitialized()) {
        this.log("PuppetDB not available for catalog analysis");
        return [];
      }

      // Use getNodeResources to get all resources including Class resources
      // This is more reliable than using the catalog endpoint
      const resourcesByType = await (puppetdb as unknown as { getNodeResources: (nodeId: string) => Promise<Record<string, Resource[]>> }).getNodeResources(nodeId);

      // Get Class resources specifically
      const classResources = resourcesByType.Class;

      this.log(`Found ${String(classResources.length)} Class resources for node: ${nodeId}`);

      // Extract class titles and convert to lowercase
      const classes = classResources.map(resource => resource.title.toLowerCase());

      // Log all classes for debugging
      if (classes.length > 0) {
        this.log(`All classes: ${classes.join(", ")}`);
      } else {
        this.log(`WARNING: No Class resources found. This may indicate the node has no catalog or no classes included.`);
      }

      return classes;
    } catch (error) {
      this.log(`Failed to get resources for key usage analysis: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Build class prefixes for key matching
   *
   * Converts class names to prefixes that can be used to match Hiera keys.
   * e.g., "profile::nginx" -> ["profile::nginx::", "profile::nginx"]
   *
   * @param classes - Array of class names
   * @returns Set of prefixes
   */
  private buildClassPrefixes(classes: string[]): Set<string> {
    const prefixes = new Set<string>();

    for (const className of classes) {
      // Add the class name itself as a prefix
      prefixes.add(className.toLowerCase());

      // Add with trailing :: for nested keys
      prefixes.add(`${className.toLowerCase()}::`);

      // Also add parent namespaces
      // e.g., "profile::nginx::config" -> "profile::nginx", "profile"
      const parts = className.split("::");
      for (let i = 1; i < parts.length; i++) {
        const parentPrefix = parts.slice(0, i).join("::").toLowerCase();
        prefixes.add(parentPrefix);
        prefixes.add(`${parentPrefix}::`);
      }
    }

    return prefixes;
  }

  /**
   * Check if a key is used by any of the included classes
   *
   * A key is considered "used" if:
   * 1. It starts with a class prefix (e.g., "profile::nginx::port" matches "profile::nginx")
   * 2. It exactly matches a class name
   *
   * @param keyName - Hiera key name
   * @param classPrefixes - Set of class prefixes
   * @returns True if key is used
   */
  private isKeyUsedByClasses(keyName: string, classPrefixes: Set<string>): boolean {
    const lowerKey = keyName.toLowerCase();

    // Check if key starts with any class prefix
    for (const prefix of classPrefixes) {
      if (lowerKey.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // Global Query Methods
  // ============================================================================

  /**
   * Get key values across all nodes
   *
   * @param key - Hiera key to look up
   * @returns Array of key values for each node
   */
  async getKeyValuesAcrossNodes(key: string): Promise<KeyNodeValues[]> {
    this.ensureInitialized();

    const results: KeyNodeValues[] = [];

    // Get all available nodes
    const nodes = await this.factService.listAvailableNodes();

    // Resolve the key for each node
    for (const nodeId of nodes) {
      const resolution = await this.resolveKey(nodeId, key);

      results.push({
        nodeId,
        value: resolution.resolvedValue,
        sourceFile: resolution.sourceFile,
        hierarchyLevel: resolution.hierarchyLevel,
        found: resolution.found,
      });
    }

    return results;
  }

  /**
   * Group nodes by their resolved value for a key
   *
   * Groups nodes that have the same resolved value together.
   * Nodes where the key is not found are grouped separately.
   *
   * @param keyNodeValues - Array of key values for each node
   * @returns Array of value groups
   *
   * Requirements: 7.5
   */
  groupNodesByValue(keyNodeValues: KeyNodeValues[]): ValueGroup[] {
    const valueMap = new Map<string, { value: unknown; nodes: string[] }>();

    for (const result of keyNodeValues) {
      // Use JSON.stringify to create a consistent key for the value
      // Handle undefined/not found separately
      const valueKey = result.found
        ? JSON.stringify(result.value)
        : "__NOT_FOUND__";

      if (!valueMap.has(valueKey)) {
        valueMap.set(valueKey, {
          value: result.found ? result.value : undefined,
          nodes: [],
        });
      }

      const valueEntry = valueMap.get(valueKey);
      if (valueEntry) {
        valueEntry.nodes.push(result.nodeId);
      }
    }

    // Convert to array of ValueGroup
    const groups: ValueGroup[] = [];
    for (const [, group] of valueMap) {
      groups.push({
        value: group.value,
        nodes: group.nodes,
      });
    }

    return groups;
  }

  /**
   * Get hierarchy files information for a node
   *
   * Generates information about all files in the Hiera hierarchy for troubleshooting,
   * including which files exist, which can be resolved, and which variables are unresolved.
   *
   * @param nodeId - Node identifier
   * @param facts - Node facts for interpolation
   * @returns Array of hierarchy file information
   */
  private async getHierarchyFiles(nodeId: string, facts: Facts): Promise<HierarchyFileInfo[]> {
    if (!this.hieraConfig) {
      return [];
    }

    const hierarchyFiles: HierarchyFileInfo[] = [];

    // Get catalog variables if catalog compilation is enabled
    let catalogVariables: Record<string, unknown> = {};
    if (this.catalogCompiler) {
      try {
        const catalogResult = await this.catalogCompiler.compileCatalog(nodeId, "production", facts);
        catalogVariables = catalogResult.variables;
      } catch (error) {
        this.log(`Failed to get catalog variables for ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Process each hierarchy level
    for (const level of this.hieraConfig.hierarchy) {
      const datadir = level.datadir ?? this.hieraConfig.defaults?.datadir ?? "data";
      const paths = this.getLevelPaths(level);

      for (const pathTemplate of paths) {
        try {
          // Try to interpolate the path
          const interpolationResult = this.parser.interpolatePathWithDetails(
            pathTemplate,
            facts,
            catalogVariables
          );

          const fullPath = this.resolvePath(path.join(datadir, interpolationResult.interpolatedPath));
          const exists = fs.existsSync(fullPath);

          hierarchyFiles.push({
            path: pathTemplate,
            hierarchyLevel: level.name,
            interpolatedPath: path.join(datadir, interpolationResult.interpolatedPath),
            exists,
            canResolve: interpolationResult.canResolve,
            unresolvedVariables: interpolationResult.unresolvedVariables,
          });
        } catch {
          // If interpolation fails completely, still show the template
          hierarchyFiles.push({
            path: pathTemplate,
            hierarchyLevel: level.name,
            interpolatedPath: `${datadir}/${pathTemplate}`,
            exists: false,
            canResolve: false,
            unresolvedVariables: this.extractVariablesFromPath(pathTemplate),
          });
        }
      }
    }

    return hierarchyFiles;
  }

  /**
   * Get all paths from a hierarchy level
   */
  private getLevelPaths(level: HierarchyLevel): string[] {
    const paths: string[] = [];

    if (level.path) {
      paths.push(level.path);
    }
    if (level.paths) {
      paths.push(...level.paths);
    }
    if (level.glob) {
      paths.push(level.glob);
    }
    if (level.globs) {
      paths.push(...level.globs);
    }

    return paths;
  }

  /**
   * Extract variable names from a path template
   */
  private extractVariablesFromPath(pathTemplate: string): string[] {
    const variables: string[] = [];
    const regex = /%\{([^}]+)\}/g;
    let match;

    while ((match = regex.exec(pathTemplate)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  /**
   * Resolve a relative path to an absolute path
   */
  private resolvePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.resolve(this.config.controlRepoPath, relativePath);
  }

  // ============================================================================
  // Cache Management Methods
  // ============================================================================

  /**
   * Invalidate all caches
   */
  invalidateCache(): void {
    this.keyIndexCache = null;
    this.resolutionCache.clear();
    this.nodeDataCache.clear();
    this.hieraConfigCache = null;
    this.resolver.clearCache();
    this.log("All caches invalidated");
  }

  /**
   * Invalidate cache for a specific node
   *
   * @param nodeId - Node identifier
   */
  invalidateNodeCache(nodeId: string): void {
    // Remove node data cache
    this.nodeDataCache.delete(nodeId);

    // Remove all resolution cache entries for this node
    const keysToDelete: string[] = [];
    for (const cacheKey of this.resolutionCache.keys()) {
      if (cacheKey.startsWith(`${nodeId}:`)) {
        keysToDelete.push(cacheKey);
      }
    }
    for (const key of keysToDelete) {
      this.resolutionCache.delete(key);
    }

    this.log(`Cache invalidated for node: ${nodeId}`);
  }

  /**
   * Reload the control repository data
   *
   * Re-parses hiera.yaml and rescans hieradata.
   */
  async reloadControlRepo(): Promise<void> {
    this.log("Reloading control repository...");

    // Invalidate all caches
    this.invalidateCache();

    // Re-parse hiera.yaml
    const parseResult = this.parser.parse(this.config.hieraConfigPath);
    if (!parseResult.success || !parseResult.config) {
      throw new Error(
        `Failed to parse hiera.yaml: ${parseResult.error?.message ?? "Unknown error"}`
      );
    }

    this.hieraConfig = parseResult.config;

    // Check if the datadir from hiera.yaml differs from what the scanner is using
    const configuredDatadir = this.hieraConfig.defaults?.datadir;
    if (configuredDatadir) {
      // Get all unique datadirs from the hierarchy
      const allDatadirs = this.getAllDatadirs(this.hieraConfig);

      // Always use scanMultipleDatadirs to handle all datadirs properly
      await this.scanner.scanMultipleDatadirs(allDatadirs);
      this.log(`Updated scanner to use datadirs: ${allDatadirs.join(', ')}`);
    } else {
      // Rescan with the current path
      await this.scanner.scan();
      this.log(`Using fallback hieradata path: ${this.config.hieradataPath ?? "data"}`);
    }

    // Cache the parsed config
    if (this.cacheEnabled) {
      this.hieraConfigCache = this.createCacheEntry(this.hieraConfig);
    }

    this.log("Control repository reloaded successfully");
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getCacheStats(): {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    resolutionCacheSize: number;
    nodeDataCacheSize: number;
    keyIndexCached: boolean;
    hieraConfigCached: boolean;
  } {
    return {
      enabled: this.cacheEnabled,
      ttl: this.cacheTTL,
      maxEntries: this.maxCacheEntries,
      resolutionCacheSize: this.resolutionCache.size,
      nodeDataCacheSize: this.nodeDataCache.size,
      keyIndexCached: this.keyIndexCache !== null,
      hieraConfigCached: this.hieraConfigCache !== null,
    };
  }

  // ============================================================================
  // Component Accessors
  // ============================================================================

  /**
   * Get the HieraParser instance
   */
  getParser(): HieraParser {
    return this.parser;
  }

  /**
   * Get the HieraScanner instance
   */
  getScanner(): HieraScanner {
    return this.scanner;
  }

  /**
   * Get the HieraResolver instance
   */
  getResolver(): HieraResolver {
    return this.resolver;
  }

  /**
   * Get the FactService instance
   */
  getFactService(): FactService {
    return this.factService;
  }

  /**
   * Get the parsed Hiera configuration
   */
  getHieraConfig(): HieraConfig | null {
    return this.hieraConfig;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("HieraService is not initialized. Call initialize() first.");
    }
  }

  /**
   * Get all unique datadirs from the hiera configuration
   *
   * @param config - Hiera configuration
   * @returns Array of unique datadir paths
   */
  private getAllDatadirs(config: HieraConfig): string[] {
    const datadirs = new Set<string>();
    const defaultDatadir = config.defaults?.datadir ?? this.config.hieradataPath ?? "data";

    // Add the default datadir
    datadirs.add(defaultDatadir);

    // Add level-specific datadirs
    for (const level of config.hierarchy) {
      if (level.datadir) {
        datadirs.add(level.datadir);
      }
    }

    return Array.from(datadirs);
  }

  /**
   * Handle file changes from the scanner
   *
   * @param changedFiles - Array of changed file paths
   */
  private handleFileChanges(changedFiles: string[]): void {
    this.log(`File changes detected: ${changedFiles.join(", ")}`);

    // Invalidate key index cache
    this.keyIndexCache = null;

    // Invalidate all resolution caches (values may have changed)
    this.resolutionCache.clear();

    // Invalidate all node data caches
    this.nodeDataCache.clear();

    // Clear resolver's lookup options cache
    this.resolver.clearCache();

    this.log("Caches invalidated due to file changes");
  }

  /**
   * Create a cache entry with expiration
   *
   * @param value - Value to cache
   * @returns Cache entry
   */
  private createCacheEntry<T>(value: T): CacheEntry<T> {
    const now = Date.now();
    return {
      value,
      cachedAt: now,
      expiresAt: now + this.cacheTTL,
    };
  }

  /**
   * Check if a cache entry is expired
   *
   * @param entry - Cache entry to check
   * @returns True if expired
   */
  private isCacheExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Build a cache key for resolution results
   *
   * @param nodeId - Node identifier
   * @param key - Hiera key
   * @returns Cache key string
   */
  private buildResolutionCacheKey(nodeId: string, key: string): string {
    return `${nodeId}:${key}`;
  }

  /**
   * Add a resolution to the cache with LRU eviction
   *
   * @param cacheKey - Cache key
   * @param resolution - Resolution to cache
   */
  private addToResolutionCache(cacheKey: string, resolution: HieraResolution): void {
    // Evict oldest entries if at capacity
    if (this.resolutionCache.size >= this.maxCacheEntries) {
      this.evictOldestCacheEntries(this.resolutionCache, Math.floor(this.maxCacheEntries * 0.1));
    }

    this.resolutionCache.set(cacheKey, this.createCacheEntry(resolution));
  }

  /**
   * Add node data to the cache with LRU eviction
   *
   * @param nodeId - Node identifier
   * @param nodeData - Node data to cache
   */
  private addToNodeDataCache(nodeId: string, nodeData: NodeHieraData): void {
    // Evict oldest entries if at capacity (use 10% of max for node data)
    const maxNodeEntries = Math.floor(this.maxCacheEntries * 0.1);
    if (this.nodeDataCache.size >= maxNodeEntries) {
      this.evictOldestCacheEntries(this.nodeDataCache, Math.floor(maxNodeEntries * 0.1));
    }

    this.nodeDataCache.set(nodeId, this.createCacheEntry(nodeData));
  }

  /**
   * Evict oldest cache entries
   *
   * @param cache - Cache map to evict from
   * @param count - Number of entries to evict
   */
  private evictOldestCacheEntries<T>(cache: Map<string, CacheEntry<T>>, count: number): void {
    // Sort entries by cachedAt and remove oldest
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      cache.delete(entries[i][0]);
    }
  }

  /**
   * Log a message with service context
   *
   * @param message - Message to log
   * @param level - Log level (info, warn, error)
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const metadata = { component: "HieraService", operation: "log" };
    switch (level) {
      case "warn":
        this.logger.warn(message, metadata);
        break;
      case "error":
        this.logger.error(message, metadata);
        break;
      default:
        this.logger.info(message, metadata);
    }
  }

  /**
   * Get the CatalogCompiler instance
   */
  getCatalogCompiler(): CatalogCompiler | null {
    return this.catalogCompiler;
  }

  /**
   * Check if catalog compilation is enabled
   */
  isCatalogCompilationEnabled(): boolean {
    return this.catalogCompiler?.isEnabled() ?? false;
  }

  /**
   * Stop the service and clean up resources
   */
  shutdown(): void {
    this.log("Shutting down HieraService...");

    // Stop file watching
    this.scanner.stopWatching();

    // Clear all caches
    this.invalidateCache();

    // Clear catalog compiler cache
    if (this.catalogCompiler) {
      this.catalogCompiler.clearCache();
    }

    this.initialized = false;
    this.log("HieraService shut down");
  }
}
