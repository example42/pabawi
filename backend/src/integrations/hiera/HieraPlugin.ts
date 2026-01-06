/**
 * HieraPlugin
 *
 * Integration plugin for local Puppet control repository analysis.
 * Provides Hiera data lookup, key resolution, and code analysis capabilities.
 *
 * Implements InformationSourcePlugin interface to integrate with the
 * existing plugin architecture used by PuppetDB and Puppetserver integrations.
 *
 * Requirements: 1.2, 1.3, 1.4, 1.6, 13.2, 13.3, 13.5
 */

import * as fs from "fs";
import * as path from "path";
import { BasePlugin } from "../BasePlugin";
import type {
  InformationSourcePlugin,
  HealthStatus,
} from "../types";
import type { Node, Facts } from "../../bolt/types";
import type { IntegrationManager } from "../IntegrationManager";
import { HieraService } from "./HieraService";
import type { HieraServiceConfig } from "./HieraService";
import { CodeAnalyzer } from "./CodeAnalyzer";
import type {
  HieraPluginConfig,
  HieraHealthStatus,
  CodeAnalysisResult,
  HieraKeyIndex,
  HieraResolution,
  NodeHieraData,
  KeyNodeValues,
} from "./types";
import type { HieraConfig as SchemaHieraConfig } from "../../config/schema";

/**
 * Control repository validation result
 */
interface ControlRepoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  structure: {
    hasHieraYaml: boolean;
    hasHieradataDir: boolean;
    hasManifestsDir: boolean;
    hasSiteModulesDir: boolean;
    hasModulesDir: boolean;
    hasPuppetfile: boolean;
  };
}

/**
 * HieraPlugin class
 *
 * Extends BasePlugin and implements InformationSourcePlugin to provide
 * Hiera data lookup and code analysis capabilities.
 */
export class HieraPlugin extends BasePlugin implements InformationSourcePlugin {
  type = "information" as const;

  private hieraService: HieraService | null = null;
  private codeAnalyzer: CodeAnalyzer | null = null;
  private integrationManager: IntegrationManager | null = null;
  private hieraConfig: HieraPluginConfig | null = null;
  private validationResult: ControlRepoValidationResult | null = null;

  /**
   * Create a new HieraPlugin instance
   */
  constructor() {
    super("hiera", "information");
  }

  /**
   * Set the IntegrationManager for accessing other integrations
   *
   * @param manager - IntegrationManager instance
   */
  setIntegrationManager(manager: IntegrationManager): void {
    this.integrationManager = manager;
  }


  /**
   * Perform plugin-specific initialization
   *
   * Validates the control repository and initializes HieraService and CodeAnalyzer.
   *
   * Requirements: 1.2, 1.3, 1.4
   */
  protected async performInitialization(): Promise<void> {
    // Extract Hiera config from integration config
    this.hieraConfig = this.extractHieraConfig(this.config.config as SchemaHieraConfig);

    // Check if integration is disabled
    if (!this.config.enabled) {
      this.log("Hiera integration is disabled");
      return;
    }

    // Check if configuration is missing
    if (!this.hieraConfig.controlRepoPath) {
      this.log("Hiera integration is not configured (missing controlRepoPath)");
      return;
    }

    // Validate control repository structure
    this.validationResult = this.validateControlRepository(this.hieraConfig.controlRepoPath);

    if (!this.validationResult.valid) {
      const errorMsg = `Control repository validation failed: ${this.validationResult.errors.join(", ")}`;
      this.log(errorMsg, "error");
      throw new Error(errorMsg);
    }

    // Log warnings if any
    for (const warning of this.validationResult.warnings) {
      this.log(warning, "warn");
    }

    // Ensure IntegrationManager is set
    if (!this.integrationManager) {
      throw new Error("IntegrationManager must be set before initialization");
    }

    // Initialize HieraService
    const hieraServiceConfig: HieraServiceConfig = {
      controlRepoPath: this.hieraConfig.controlRepoPath,
      hieraConfigPath: this.hieraConfig.hieraConfigPath,
      factSources: this.hieraConfig.factSources,
      cache: this.hieraConfig.cache,
      catalogCompilation: this.hieraConfig.catalogCompilation,
    };

    this.hieraService = new HieraService(this.integrationManager, hieraServiceConfig);
    await this.hieraService.initialize();

    // Initialize CodeAnalyzer
    this.codeAnalyzer = new CodeAnalyzer(
      this.hieraConfig.controlRepoPath,
      this.hieraConfig.codeAnalysis
    );
    this.codeAnalyzer.setIntegrationManager(this.integrationManager);
    this.codeAnalyzer.setHieraScanner(this.hieraService.getScanner());
    await this.codeAnalyzer.initialize();

    this.log("Hiera plugin initialized successfully");
    this.log(`Control repo: ${this.hieraConfig.controlRepoPath}`);
    this.log(`Hiera config: ${this.hieraConfig.hieraConfigPath}`);
  }

  /**
   * Extract and normalize HieraPluginConfig from schema config
   *
   * @param schemaConfig - Configuration from schema
   * @returns Normalized HieraPluginConfig
   */
  private extractHieraConfig(schemaConfig: SchemaHieraConfig): HieraPluginConfig {
    return {
      enabled: schemaConfig.enabled ?? false,
      controlRepoPath: schemaConfig.controlRepoPath ?? "",
      hieraConfigPath: schemaConfig.hieraConfigPath ?? "hiera.yaml",
      environments: schemaConfig.environments ?? ["production"],
      factSources: {
        preferPuppetDB: schemaConfig.factSources?.preferPuppetDB ?? true,
        localFactsPath: schemaConfig.factSources?.localFactsPath,
      },
      catalogCompilation: {
        enabled: schemaConfig.catalogCompilation?.enabled ?? false,
        timeout: schemaConfig.catalogCompilation?.timeout ?? 60000,
        cacheTTL: schemaConfig.catalogCompilation?.cacheTTL ?? 300000,
      },
      cache: {
        enabled: schemaConfig.cache?.enabled ?? true,
        ttl: schemaConfig.cache?.ttl ?? 300000,
        maxEntries: schemaConfig.cache?.maxEntries ?? 10000,
      },
      codeAnalysis: {
        enabled: schemaConfig.codeAnalysis?.enabled ?? true,
        lintEnabled: schemaConfig.codeAnalysis?.lintEnabled ?? true,
        moduleUpdateCheck: schemaConfig.codeAnalysis?.moduleUpdateCheck ?? true,
        analysisInterval: schemaConfig.codeAnalysis?.analysisInterval ?? 3600000,
        exclusionPatterns: schemaConfig.codeAnalysis?.exclusionPatterns ?? [],
      },
    };
  }


  /**
   * Validate control repository structure
   *
   * Checks that the path exists, is accessible, and contains expected Puppet structure.
   *
   * Requirements: 1.2, 1.3
   *
   * @param controlRepoPath - Path to the control repository
   * @returns Validation result with errors and warnings
   */
  validateControlRepository(controlRepoPath: string): ControlRepoValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const structure = {
      hasHieraYaml: false,
      hasHieradataDir: false,
      hasManifestsDir: false,
      hasSiteModulesDir: false,
      hasModulesDir: false,
      hasPuppetfile: false,
    };

    // Check if path exists
    if (!fs.existsSync(controlRepoPath)) {
      errors.push(`Control repository path does not exist: ${controlRepoPath}`);
      return { valid: false, errors, warnings, structure };
    }

    // Check if path is a directory
    try {
      const stats = fs.statSync(controlRepoPath);
      if (!stats.isDirectory()) {
        errors.push(`Control repository path is not a directory: ${controlRepoPath}`);
        return { valid: false, errors, warnings, structure };
      }
    } catch (error) {
      errors.push(`Cannot access control repository path: ${controlRepoPath} - ${this.getErrorMessage(error)}`);
      return { valid: false, errors, warnings, structure };
    }

    // Check for hiera.yaml (required)
    const hieraYamlPath = path.join(controlRepoPath, this.hieraConfig?.hieraConfigPath ?? "hiera.yaml");
    if (fs.existsSync(hieraYamlPath)) {
      structure.hasHieraYaml = true;
    } else {
      errors.push(`hiera.yaml not found at: ${hieraYamlPath}`);
    }

    // Check for hieradata directory (common locations)
    const hieradataPaths = ["data", "hieradata", "hiera"];
    for (const hieradataDir of hieradataPaths) {
      const hieradataPath = path.join(controlRepoPath, hieradataDir);
      if (fs.existsSync(hieradataPath) && fs.statSync(hieradataPath).isDirectory()) {
        structure.hasHieradataDir = true;
        break;
      }
    }
    if (!structure.hasHieradataDir) {
      warnings.push("No hieradata directory found (checked: data, hieradata, hiera)");
    }

    // Check for manifests directory (optional but common)
    const manifestsPath = path.join(controlRepoPath, "manifests");
    if (fs.existsSync(manifestsPath) && fs.statSync(manifestsPath).isDirectory()) {
      structure.hasManifestsDir = true;
    }

    // Check for site-modules directory (optional)
    const siteModulesPath = path.join(controlRepoPath, "site-modules");
    if (fs.existsSync(siteModulesPath) && fs.statSync(siteModulesPath).isDirectory()) {
      structure.hasSiteModulesDir = true;
    }

    // Check for modules directory (optional)
    const modulesPath = path.join(controlRepoPath, "modules");
    if (fs.existsSync(modulesPath) && fs.statSync(modulesPath).isDirectory()) {
      structure.hasModulesDir = true;
    }

    // Check for Puppetfile (optional)
    const puppetfilePath = path.join(controlRepoPath, "Puppetfile");
    if (fs.existsSync(puppetfilePath)) {
      structure.hasPuppetfile = true;
    }

    // Add warnings for missing optional components
    if (!structure.hasManifestsDir && !structure.hasSiteModulesDir) {
      warnings.push("No manifests or site-modules directory found - code analysis may be limited");
    }

    if (!structure.hasPuppetfile) {
      warnings.push("No Puppetfile found - module update checking will be unavailable");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      structure,
    };
  }


  /**
   * Perform plugin-specific health check
   *
   * Checks control repo accessibility and hiera.yaml validity.
   *
   * Requirements: 13.2, 13.3
   *
   * @returns Health status
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    // Check if not configured
    if (!this.hieraConfig?.controlRepoPath) {
      return {
        healthy: false,
        message: "Hiera integration is not configured",
        details: {
          status: "not_configured",
        },
      };
    }

    // Check if disabled
    if (!this.config.enabled) {
      return {
        healthy: false,
        message: "Hiera integration is disabled",
        details: {
          status: "disabled",
          controlRepoPath: this.hieraConfig.controlRepoPath,
        },
      };
    }

    // Validate control repository
    const validation = this.validateControlRepository(this.hieraConfig.controlRepoPath);

    if (!validation.valid) {
      return {
        healthy: false,
        message: `Control repository validation failed: ${validation.errors.join(", ")}`,
        details: {
          status: "error",
          controlRepoPath: this.hieraConfig.controlRepoPath,
          errors: validation.errors,
          warnings: validation.warnings,
          structure: validation.structure,
        },
      };
    }

    // Check HieraService health
    if (!this.hieraService?.isInitialized()) {
      return {
        healthy: false,
        message: "HieraService is not initialized",
        details: {
          status: "error",
          controlRepoPath: this.hieraConfig.controlRepoPath,
        },
      };
    }

    // Get key index stats
    let keyCount = 0;
    let fileCount = 0;
    let lastScanTime: string | undefined;

    try {
      const keyIndex = await this.hieraService.getAllKeys();
      keyCount = keyIndex.totalKeys;
      fileCount = keyIndex.totalFiles;
      lastScanTime = keyIndex.lastScan;
    } catch (error) {
      return {
        healthy: false,
        message: `Failed to get Hiera key index: ${this.getErrorMessage(error)}`,
        details: {
          status: "error",
          controlRepoPath: this.hieraConfig.controlRepoPath,
          error: this.getErrorMessage(error),
        },
      };
    }

    // Check hiera.yaml validity
    const hieraConfigValid = this.hieraService.getHieraConfig() !== null;

    // Build health status
    const healthStatus: HieraHealthStatus = {
      healthy: true,
      status: "connected",
      message: "Hiera integration is healthy",
      details: {
        controlRepoAccessible: true,
        hieraConfigValid,
        factSourceAvailable: true, // Will be checked via FactService
        lastScanTime,
        keyCount,
        fileCount,
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };

    return {
      healthy: healthStatus.healthy,
      message: healthStatus.message,
      details: healthStatus.details as Record<string, unknown>,
    };
  }


  // ============================================================================
  // InformationSourcePlugin Interface Implementation
  // ============================================================================

  /**
   * Get inventory of nodes
   *
   * Delegates to PuppetDB integration if available, otherwise returns empty array.
   * The Hiera integration doesn't maintain its own node inventory.
   *
   * @returns Array of nodes
   */
  async getInventory(): Promise<Node[]> {
    // Hiera integration doesn't maintain its own inventory
    // Delegate to PuppetDB if available
    if (this.integrationManager) {
      const puppetdb = this.integrationManager.getInformationSource("puppetdb");
      if (puppetdb?.isInitialized()) {
        return puppetdb.getInventory();
      }
    }

    // Return empty array if no PuppetDB
    this.log("No PuppetDB integration available for inventory", "warn");
    return [];
  }

  /**
   * Get facts for a specific node
   *
   * Delegates to the FactService which handles PuppetDB and local fact sources.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Facts for the node
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    if (!this.hieraService) {
      throw new Error("HieraService is not initialized");
    }

    const factResult = await this.hieraService.getFactService().getFacts(nodeId);

    // Convert to Facts format expected by interface
    return {
      nodeId: factResult.facts.nodeId,
      gatheredAt: factResult.facts.gatheredAt,
      facts: factResult.facts.facts,
    } as Facts;
  }

  /**
   * Get arbitrary data for a node
   *
   * Supports data types:
   * - 'hiera': All Hiera data for the node
   * - 'hiera-key': Resolve a specific Hiera key (requires key in options)
   * - 'analysis': Code analysis results
   *
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve
   * @returns Data of the requested type
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    this.ensureInitialized();

    switch (dataType) {
      case "hiera":
        return this.getNodeHieraData(nodeId);
      case "analysis":
        return this.getCodeAnalysis();
      default:
        throw new Error(
          `Unsupported data type: ${dataType}. Supported types are: hiera, analysis`
        );
    }
  }

  // ============================================================================
  // Hiera-Specific Methods
  // ============================================================================

  /**
   * Get the HieraService instance
   *
   * @returns HieraService instance
   */
  getHieraService(): HieraService {
    if (!this.hieraService) {
      throw new Error("HieraService is not initialized");
    }
    return this.hieraService;
  }

  /**
   * Get the CodeAnalyzer instance
   *
   * @returns CodeAnalyzer instance
   */
  getCodeAnalyzer(): CodeAnalyzer {
    if (!this.codeAnalyzer) {
      throw new Error("CodeAnalyzer is not initialized");
    }
    return this.codeAnalyzer;
  }

  /**
   * Get all Hiera keys
   *
   * @returns Key index with all discovered keys
   */
  async getAllKeys(): Promise<HieraKeyIndex> {
    this.ensureInitialized();
    return this.hieraService!.getAllKeys();
  }

  /**
   * Search for Hiera keys
   *
   * @param query - Search query
   * @returns Array of matching keys
   */
  async searchKeys(query: string): Promise<HieraKeyIndex["keys"]> {
    this.ensureInitialized();
    const keys = await this.hieraService!.searchKeys(query);
    // Convert array to Map for consistency
    const keyMap = new Map<string, typeof keys[0]>();
    for (const key of keys) {
      keyMap.set(key.name, key);
    }
    return keyMap;
  }

  /**
   * Resolve a Hiera key for a node
   *
   * @param nodeId - Node identifier
   * @param key - Hiera key to resolve
   * @param environment - Optional Puppet environment
   * @returns Resolution result
   */
  async resolveKey(
    nodeId: string,
    key: string,
    environment?: string
  ): Promise<HieraResolution> {
    this.ensureInitialized();
    return this.hieraService!.resolveKey(nodeId, key, environment);
  }

  /**
   * Get all Hiera data for a node
   *
   * @param nodeId - Node identifier
   * @returns Node Hiera data
   */
  async getNodeHieraData(nodeId: string): Promise<NodeHieraData> {
    this.ensureInitialized();
    return this.hieraService!.getNodeHieraData(nodeId);
  }

  /**
   * Get key values across all nodes
   *
   * @param key - Hiera key to look up
   * @returns Array of key values for each node
   */
  async getKeyValuesAcrossNodes(key: string): Promise<KeyNodeValues[]> {
    this.ensureInitialized();
    return this.hieraService!.getKeyValuesAcrossNodes(key);
  }

  /**
   * Get code analysis results
   *
   * @returns Code analysis result
   */
  async getCodeAnalysis(): Promise<CodeAnalysisResult> {
    this.ensureInitialized();
    if (!this.codeAnalyzer) {
      throw new Error("CodeAnalyzer is not initialized");
    }
    return this.codeAnalyzer.analyze();
  }


  // ============================================================================
  // Enable/Disable Functionality
  // ============================================================================

  /**
   * Enable the Hiera integration
   *
   * Re-initializes the plugin with the existing configuration.
   *
   * Requirements: 13.5
   */
  async enable(): Promise<void> {
    if (this.config.enabled) {
      this.log("Hiera integration is already enabled");
      return;
    }

    this.config.enabled = true;
    await this.performInitialization();
    this.initialized = true;
    this.log("Hiera integration enabled");
  }

  /**
   * Disable the Hiera integration
   *
   * Stops the plugin without removing configuration.
   *
   * Requirements: 13.5
   */
  async disable(): Promise<void> {
    if (!this.config.enabled) {
      this.log("Hiera integration is already disabled");
      return;
    }

    // Shutdown services
    await this.shutdown();

    this.config.enabled = false;
    this.initialized = false;
    this.log("Hiera integration disabled");
  }

  /**
   * Check if the integration is enabled
   *
   * @returns true if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ============================================================================
  // Hot Reload Functionality
  // ============================================================================

  /**
   * Reload control repository data
   *
   * Re-parses hiera.yaml and rescans hieradata without requiring restart.
   *
   * Requirements: 1.6
   */
  async reload(): Promise<void> {
    this.ensureInitialized();

    this.log("Reloading control repository data...");

    // Reload HieraService
    if (this.hieraService) {
      await this.hieraService.reloadControlRepo();
    }

    // Reload CodeAnalyzer
    if (this.codeAnalyzer) {
      await this.codeAnalyzer.reload();
    }

    this.log("Control repository data reloaded successfully");
  }

  /**
   * Invalidate all caches
   */
  invalidateCache(): void {
    if (this.hieraService) {
      this.hieraService.invalidateCache();
    }
    if (this.codeAnalyzer) {
      this.codeAnalyzer.clearCache();
    }
    this.log("All caches invalidated");
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Shutdown the plugin and clean up resources
   */
  async shutdown(): Promise<void> {
    this.log("Shutting down Hiera plugin...");

    if (this.hieraService) {
      await this.hieraService.shutdown();
      this.hieraService = null;
    }

    if (this.codeAnalyzer) {
      this.codeAnalyzer.clearCache();
      this.codeAnalyzer = null;
    }

    this.log("Hiera plugin shut down");
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Ensure the plugin is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config.enabled) {
      throw new Error("Hiera plugin is not initialized or is disabled");
    }
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Get the current Hiera configuration
   *
   * @returns Hiera plugin configuration
   */
  getHieraConfig(): HieraPluginConfig | null {
    return this.hieraConfig;
  }

  /**
   * Get the control repository validation result
   *
   * @returns Validation result
   */
  getValidationResult(): ControlRepoValidationResult | null {
    return this.validationResult;
  }
}
