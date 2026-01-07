/**
 * CodeAnalyzer
 *
 * Performs static analysis of Puppet code in a control repository.
 * Detects unused code, lint issues, and provides usage statistics.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 15.3
 */

import * as fs from "fs";
import * as path from "path";
import type {
  CodeAnalysisResult,
  UnusedCodeReport,
  UnusedItem,
  LintIssue,
  LintSeverity,
  ModuleUpdate,
  UsageStatistics,
  ClassUsage,
  ResourceUsage,
  CodeAnalysisConfig,
} from "./types";
import type { IntegrationManager } from "../IntegrationManager";
import type { HieraScanner } from "./HieraScanner";
import { PuppetfileParser } from "./PuppetfileParser";
import type { PuppetfileParseResult } from "./PuppetfileParser";
import { ForgeClient } from "./ForgeClient";
import type { ModuleUpdateCheckResult } from "./ForgeClient";

/**
 * Cache entry for analysis results
 */
interface AnalysisCacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Parsed Puppet class information
 */
interface PuppetClass {
  name: string;
  file: string;
  line: number;
  parameters: string[];
}

/**
 * Parsed Puppet defined type information
 */
interface PuppetDefinedType {
  name: string;
  file: string;
  line: number;
  parameters: string[];
}

/**
 * Parsed Puppet manifest information
 */
interface ManifestInfo {
  file: string;
  classes: PuppetClass[];
  definedTypes: PuppetDefinedType[];
  resources: ResourceInfo[];
  includes: string[];
  hieraLookups: string[];
  linesOfCode: number;
}

/**
 * Resource information from manifest
 */
interface ResourceInfo {
  type: string;
  title: string;
  file: string;
  line: number;
}

/**
 * Filter options for lint issues
 */
export interface LintFilterOptions {
  severity?: LintSeverity[];
  types?: string[];
}

/**
 * Issue counts by category
 */
export interface IssueCounts {
  bySeverity: Record<LintSeverity, number>;
  byRule: Record<string, number>;
  total: number;
}

/**
 * CodeAnalyzer class for static analysis of Puppet code
 */
export class CodeAnalyzer {
  private controlRepoPath: string;
  private config: CodeAnalysisConfig;
  private hieraScanner: HieraScanner | null = null;
  private integrationManager: IntegrationManager | null = null;

  // Cache storage
  private analysisCache: AnalysisCacheEntry<CodeAnalysisResult> | null = null;
  private manifestCache = new Map<string, ManifestInfo>();
  private lastPuppetfileParseResult: PuppetfileParseResult | null = null;
  private lastModuleUpdateResults: ModuleUpdateCheckResult[] | null = null;
  private forgeClient: ForgeClient;

  // Parsed data
  private classes = new Map<string, PuppetClass>();
  private definedTypes = new Map<string, PuppetDefinedType>();
  private manifests: ManifestInfo[] = [];
  private initialized = false;

  constructor(controlRepoPath: string, config: CodeAnalysisConfig) {
    this.controlRepoPath = controlRepoPath;
    this.config = config;
    this.forgeClient = new ForgeClient();
  }

  /**
   * Set the IntegrationManager for accessing PuppetDB data
   */
  setIntegrationManager(manager: IntegrationManager): void {
    this.integrationManager = manager;
  }

  /**
   * Set the HieraScanner for Hiera key analysis
   */
  setHieraScanner(scanner: HieraScanner): void {
    this.hieraScanner = scanner;
  }

  /**
   * Initialize the analyzer by scanning the control repository
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.log("Initializing CodeAnalyzer...");

    // Scan manifests directory
    const manifestsPath = this.resolvePath("manifests");
    if (fs.existsSync(manifestsPath)) {
      await this.scanManifestsDirectory(manifestsPath, "manifests");
    }

    // Scan site-modules directory (common in control repos)
    const siteModulesPath = this.resolvePath("site-modules");
    if (fs.existsSync(siteModulesPath)) {
      await this.scanModulesDirectory(siteModulesPath);
    }

    // Scan site directory (alternative structure)
    const sitePath = this.resolvePath("site");
    if (fs.existsSync(sitePath)) {
      await this.scanModulesDirectory(sitePath);
    }

    // Scan modules directory
    const modulesPath = this.resolvePath("modules");
    if (fs.existsSync(modulesPath)) {
      await this.scanModulesDirectory(modulesPath);
    }

    this.initialized = true;
    this.log(`CodeAnalyzer initialized: ${String(this.classes.size)} classes, ${String(this.definedTypes.size)} defined types`);
  }

  /**
   * Check if the analyzer is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }


  // ============================================================================
  // Main Analysis Methods
  // ============================================================================

  /**
   * Perform complete code analysis
   *
   * @returns Complete analysis result
   */
  async analyze(): Promise<CodeAnalysisResult> {
    this.ensureInitialized();

    // Check cache
    if (this.analysisCache && !this.isCacheExpired(this.analysisCache)) {
      return this.analysisCache.value;
    }

    const result: CodeAnalysisResult = {
      unusedCode: this.getUnusedCode(),
      lintIssues: this.config.lintEnabled ? this.getLintIssues() : [],
      moduleUpdates: this.config.moduleUpdateCheck ? await this.getModuleUpdates() : [],
      statistics: await this.getUsageStatistics(),
      analyzedAt: new Date().toISOString(),
    };

    // Cache the result
    if (this.config.enabled) {
      this.analysisCache = this.createCacheEntry(result);
    }

    return result;
  }

  /**
   * Get unused code report
   *
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  getUnusedCode(): UnusedCodeReport {
    this.ensureInitialized();

    const unusedClasses = this.detectUnusedClasses();
    const unusedDefinedTypes = this.detectUnusedDefinedTypes();
    const unusedHieraKeys = this.detectUnusedHieraKeys();

    return {
      unusedClasses,
      unusedDefinedTypes,
      unusedHieraKeys,
    };
  }

  /**
   * Get lint issues
   *
   * Requirements: 9.1, 9.2, 9.3
   */
  getLintIssues(): LintIssue[] {
    this.ensureInitialized();

    const issues: LintIssue[] = [];

    // Scan all manifest files for issues
    for (const manifest of this.manifests) {
      const fileIssues = this.lintManifest(manifest.file);
      issues.push(...fileIssues);
    }

    return issues;
  }

  /**
   * Get module updates
   *
   * Requirements: 10.1, 10.2, 10.5
   */
  async getModuleUpdates(): Promise<ModuleUpdate[]> {
    // Parse Puppetfile if it exists
    const puppetfilePath = this.resolvePath("Puppetfile");
    if (!fs.existsSync(puppetfilePath)) {
      return [];
    }

    const parser = new PuppetfileParser();
    const parseResult = parser.parseFile(puppetfilePath);

    // Store parse result for error reporting
    this.lastPuppetfileParseResult = parseResult;

    if (!parseResult.success) {
      this.log(`Puppetfile parse errors: ${parseResult.errors.map(e => e.message).join(", ")}`, "warn");
    }

    // Check for updates from Puppet Forge
    if (this.config.moduleUpdateCheck && parseResult.modules.length > 0) {
      try {
        const updateResults = await this.forgeClient.checkForUpdates(parseResult.modules);
        this.lastModuleUpdateResults = updateResults;
        return this.forgeClient.toModuleUpdates(updateResults);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`Failed to check for module updates: ${errorMessage}`, "warn");
          // Fall back to basic module info without update check
          return parser.toModuleUpdates(parseResult.modules);
        }
    }

    // Convert to ModuleUpdate format without update check
    return parser.toModuleUpdates(parseResult.modules);
  }

  /**
   * Get the last Puppetfile parse result (for error reporting)
   */
  getPuppetfileParseResult(): PuppetfileParseResult | null {
    return this.lastPuppetfileParseResult;
  }

  /**
   * Get the last module update check results (for detailed info)
   */
  getModuleUpdateResults(): ModuleUpdateCheckResult[] | null {
    return this.lastModuleUpdateResults;
  }

  /**
   * Get usage statistics
   *
   * Requirements: 11.1, 11.2, 11.3, 11.5
   */
  async getUsageStatistics(): Promise<UsageStatistics> {
    this.ensureInitialized();

    // Calculate lines of code
    let totalLinesOfCode = 0;
    for (const manifest of this.manifests) {
      totalLinesOfCode += manifest.linesOfCode;
    }

    // Count resources by type
    const resourceCounts = new Map<string, number>();
    for (const manifest of this.manifests) {
      for (const resource of manifest.resources) {
        const count = resourceCounts.get(resource.type) ?? 0;
        resourceCounts.set(resource.type, count + 1);
      }
    }

    // Build most used resources list (ranked by count)
    const mostUsedResources: ResourceUsage[] = Array.from(resourceCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get class usage across nodes (from PuppetDB catalogs if available)
    const mostUsedClasses = await this.getClassUsageAcrossNodes();

    return {
      totalManifests: this.manifests.length,
      totalClasses: this.classes.size,
      totalDefinedTypes: this.definedTypes.size,
      totalFunctions: this.countFunctions(),
      linesOfCode: totalLinesOfCode,
      mostUsedClasses,
      mostUsedResources,
    };
  }

  /**
   * Get class usage across nodes from PuppetDB catalogs
   *
   * Counts how many nodes include each class and ranks by frequency.
   *
   * Requirements: 11.1, 11.5
   */
  async getClassUsageAcrossNodes(): Promise<ClassUsage[]> {
    // Track class usage: className -> Set of nodeIds
    const classUsageCounts = new Map<string, Set<string>>();

    // Try to get class usage from PuppetDB catalogs
    if (this.integrationManager) {
      const puppetdb = this.integrationManager.getInformationSource("puppetdb");

      if (puppetdb?.isInitialized()) {
        try {
          // Get all nodes from PuppetDB
          const inventory = await puppetdb.getInventory();

          for (const node of inventory) {
            const nodeId = String(node.certname ?? node.id);

            try {
              // Get catalog for each node
              const catalogData = await puppetdb.getNodeData(nodeId, "catalog");

              if (catalogData && typeof catalogData === "object") {
                const catalog = catalogData as { resources?: { type: string; title: string }[] };

                if (catalog.resources && Array.isArray(catalog.resources)) {
                  // Extract Class resources
                  for (const resource of catalog.resources) {
                    if (resource.type === "Class") {
                      const className = resource.title.toLowerCase();

                      if (!classUsageCounts.has(className)) {
                        classUsageCounts.set(className, new Set());
                      }
                      const classSet = classUsageCounts.get(className);
                      if (classSet) {
                        classSet.add(nodeId);
                      }
                    }
                  }
                }
              }
        } catch (error) {
          // Skip nodes where catalog retrieval fails
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`Failed to get catalog for node ${nodeId}: ${errorMessage}`, "warn");
        }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`Failed to get nodes from PuppetDB: ${errorMessage}`, "warn");
        }
      }
    }

    // Check if no PuppetDB data, fall back to manifest-based analysis
    if (classUsageCounts.size === 0) {
      return this.getClassUsageFromManifests();
    }

    // Build most used classes list (ranked by usage count)
    const mostUsedClasses: ClassUsage[] = Array.from(classUsageCounts.entries())
      .map(([name, nodes]) => ({
        name,
        usageCount: nodes.size,
        nodes: Array.from(nodes),
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return mostUsedClasses;
  }

  /**
   * Get class usage from manifest includes (fallback when PuppetDB unavailable)
   *
   * Counts class usage based on include statements in manifests.
   */
  private getClassUsageFromManifests(): ClassUsage[] {
    const classUsageCounts = new Map<string, Set<string>>();

    for (const manifest of this.manifests) {
      for (const includedClass of manifest.includes) {
        if (!classUsageCounts.has(includedClass)) {
          classUsageCounts.set(includedClass, new Set());
        }
        const classSet = classUsageCounts.get(includedClass);
        if (classSet) {
          classSet.add(manifest.file);
        }
      }
    }

    // Build most used classes list (ranked by usage count)
    const mostUsedClasses: ClassUsage[] = Array.from(classUsageCounts.entries())
      .map(([name, files]) => ({
        name,
        usageCount: files.size,
        nodes: [], // No node data available from manifest analysis
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return mostUsedClasses;
  }

  /**
   * Count functions in the control repository
   *
   * Scans lib/puppet/functions directories for function definitions.
   *
   * Requirements: 11.2
   */
  private countFunctions(): number {
    let functionCount = 0;

    // Check common function locations
    const functionPaths = [
      "lib/puppet/functions",
      "site-modules/*/lib/puppet/functions",
      "modules/*/lib/puppet/functions",
    ];

    for (const pattern of functionPaths) {
      const basePath = pattern.split("*")[0];
      const fullBasePath = this.resolvePath(basePath);

      if (fs.existsSync(fullBasePath)) {
        functionCount += this.countRubyFilesRecursive(fullBasePath);
      }
    }

    return functionCount;
  }

  /**
   * Count Ruby files recursively in a directory
   */
  private countRubyFilesRecursive(dirPath: string): number {
    let count = 0;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          count += this.countRubyFilesRecursive(entryPath);
        } else if (entry.isFile() && entry.name.endsWith(".rb")) {
          count++;
        }
      }
    } catch {
      // Ignore errors reading directories
    }

    return count;
  }


  // ============================================================================
  // Unused Code Detection
  // ============================================================================

  /**
   * Detect unused classes
   *
   * A class is considered unused if it's not included by any other manifest.
   *
   * Requirements: 8.1, 8.4
   */
  private detectUnusedClasses(): UnusedItem[] {
    const unusedClasses: UnusedItem[] = [];

    // Collect all included classes
    const includedClasses = new Set<string>();
    for (const manifest of this.manifests) {
      for (const includedClass of manifest.includes) {
        includedClasses.add(includedClass.toLowerCase());
      }
    }

    // Find classes that are never included
    for (const [className, classInfo] of this.classes) {
      const lowerName = className.toLowerCase();

      // Check exclusion patterns
      if (this.isExcluded(className)) {
        continue;
      }

      // Skip main classes (e.g., role::*, profile::*) as they're typically included from node definitions
      // which may not be in the control repo
      if (!includedClasses.has(lowerName)) {
        unusedClasses.push({
          name: className,
          file: classInfo.file,
          line: classInfo.line,
          type: "class",
        });
      }
    }

    return unusedClasses;
  }

  /**
   * Detect unused defined types
   *
   * A defined type is considered unused if it's not instantiated anywhere.
   *
   * Requirements: 8.2, 8.4
   */
  private detectUnusedDefinedTypes(): UnusedItem[] {
    const unusedDefinedTypes: UnusedItem[] = [];

    // Collect all instantiated defined types
    const instantiatedTypes = new Set<string>();
    for (const manifest of this.manifests) {
      for (const resource of manifest.resources) {
        // Defined types are used as resource types
        instantiatedTypes.add(resource.type.toLowerCase());
      }
    }

    // Find defined types that are never instantiated
    for (const [typeName, typeInfo] of this.definedTypes) {
      const lowerName = typeName.toLowerCase();

      // Check exclusion patterns
      if (this.isExcluded(typeName)) {
        continue;
      }

      if (!instantiatedTypes.has(lowerName)) {
        unusedDefinedTypes.push({
          name: typeName,
          file: typeInfo.file,
          line: typeInfo.line,
          type: "defined_type",
        });
      }
    }

    return unusedDefinedTypes;
  }

  /**
   * Detect unused Hiera keys
   *
   * A Hiera key is considered unused if it's not referenced in any manifest.
   *
   * Requirements: 8.3, 8.4
   */
  private detectUnusedHieraKeys(): UnusedItem[] {
    const unusedHieraKeys: UnusedItem[] = [];

    if (!this.hieraScanner) {
      return unusedHieraKeys;
    }

    // Collect all Hiera lookups from manifests
    const referencedKeys = new Set<string>();
    for (const manifest of this.manifests) {
      for (const key of manifest.hieraLookups) {
        referencedKeys.add(key.toLowerCase());
      }
    }

    // Get all Hiera keys from scanner
    const allKeys = this.hieraScanner.getAllKeys();

    // Find keys that are never referenced
    for (const key of allKeys) {
      const lowerName = key.name.toLowerCase();

      // Check exclusion patterns
      if (this.isExcluded(key.name)) {
        continue;
      }

      if (!referencedKeys.has(lowerName)) {
        // Get the first location for file/line info
        const location = key.locations.length > 0 ? key.locations[0] : undefined;
        unusedHieraKeys.push({
          name: key.name,
          file: location?.file ?? "unknown",
          line: location?.lineNumber ?? 0,
          type: "hiera_key",
        });
      }
    }

    return unusedHieraKeys;
  }

  /**
   * Check if a name matches any exclusion pattern
   *
   * Requirements: 8.5
   */
  private isExcluded(name: string): boolean {
    const patterns = this.config.exclusionPatterns ?? [];

    for (const pattern of patterns) {
      // Support glob-like patterns with * wildcard
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
        "i"
      );
      if (regex.test(name)) {
        return true;
      }
    }

    return false;
  }


  // ============================================================================
  // Lint Issue Detection
  // ============================================================================

  /**
   * Lint a single manifest file
   *
   * Detects syntax errors and common style violations.
   *
   * Requirements: 9.1, 9.2
   */
  private lintManifest(filePath: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const fullPath = this.resolvePath(filePath);

    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      return issues;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for trailing whitespace
      if (/\s+$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: line.length - line.trimEnd().length + 1,
          severity: "warning",
          message: "Trailing whitespace detected",
          rule: "trailing_whitespace",
          fixable: true,
        });
      }

      // Check for tabs (prefer spaces)
      const tabMatch = /\t/.exec(line);
      if (tabMatch) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: tabMatch.index + 1,
          severity: "warning",
          message: "Tab character found, use spaces for indentation",
          rule: "no_tabs",
          fixable: true,
        });
      }

      // Check for lines over 140 characters
      if (line.length > 140) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: 141,
          severity: "warning",
          message: `Line exceeds 140 characters (${String(line.length)})`,
          rule: "line_length",
          fixable: false,
        });
      }

      // Check for deprecated syntax: import statement
      if (/^\s*import\s+/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: 1,
          severity: "warning",
          message: "The 'import' statement is deprecated, use 'include' instead",
          rule: "deprecated_import",
          fixable: true,
        });
      }

      // Check for unquoted resource titles
      const unquotedTitleMatch = /^\s*(\w+)\s*{\s*([^'":\s][^:]*)\s*:/.exec(line);
      if (unquotedTitleMatch && !["class", "define", "node"].includes(unquotedTitleMatch[1])) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: unquotedTitleMatch.index + unquotedTitleMatch[1].length + 3,
          severity: "warning",
          message: "Resource title should be quoted",
          rule: "unquoted_resource_title",
          fixable: true,
        });
      }

      // Check for double-quoted strings that could be single-quoted
      const doubleQuoteMatch = /"([^"$\\]*)"/.exec(line);
      if (doubleQuoteMatch && !doubleQuoteMatch[1].includes("'")) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: doubleQuoteMatch.index + 1,
          severity: "info",
          message: "Use single quotes for strings without interpolation",
          rule: "single_quote_string_with_variables",
          fixable: true,
        });
      }

      // Check for ensure => present/absent not being first attribute
      if (/^\s+\w+\s*=>\s*/.test(line) && !/^\s+ensure\s*=>/.test(line)) {
        // Look back to see if this is a resource block without ensure first
        const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
        if (/{\s*$/.test(prevLines) && !/ensure\s*=>/.test(prevLines)) {
          // This is a heuristic - ensure should typically be first
        }
      }

      // Check for syntax errors: unmatched braces
      // This is a simple check - real syntax validation would need a parser

      // Check for empty class/define bodies
      if (/^\s*(class|define)\s+[\w:]+\s*{\s*}\s*$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNumber,
          column: 1,
          severity: "info",
          message: "Empty class or defined type body",
          rule: "empty_class_body",
          fixable: false,
        });
      }
    }

    // Check for missing documentation
    if (!content.includes("# @summary") && !content.includes("# @description")) {
      const classMatch = /^\s*class\s+([\w:]+)/m.exec(content);
      if (classMatch) {
        issues.push({
          file: filePath,
          line: 1,
          column: 1,
          severity: "info",
          message: `Class '${classMatch[1]}' is missing documentation (@summary)`,
          rule: "missing_documentation",
          fixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Filter lint issues by criteria
   *
   * Requirements: 9.4
   */
  filterIssues(issues: LintIssue[], options: LintFilterOptions): LintIssue[] {
    let filtered = issues;

    if (options.severity && options.severity.length > 0) {
      filtered = filtered.filter((issue) => options.severity.includes(issue.severity));
    }

    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((issue) => options.types.includes(issue.rule));
    }

    return filtered;
  }

  /**
   * Count issues by category
   *
   * Requirements: 9.5
   */
  countIssues(issues: LintIssue[]): IssueCounts {
    const bySeverity: Record<LintSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };

    const byRule: Record<string, number> = {};

    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
    }

    return {
      bySeverity,
      byRule,
      total: issues.length,
    };
  }


  // ============================================================================
  // Manifest Scanning
  // ============================================================================

  /**
   * Scan a manifests directory
   */
  private async scanManifestsDirectory(dirPath: string, relativePath: string): Promise<void> {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      this.log(`Failed to read directory ${dirPath}: ${this.getErrorMessage(error)}`, "warn");
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await this.scanManifestsDirectory(entryPath, entryRelativePath);
      } else if (entry.isFile() && entry.name.endsWith(".pp")) {
        this.scanManifestFile(entryPath, entryRelativePath);
      }
    }
  }

  /**
   * Scan a modules directory
   */
  private async scanModulesDirectory(modulesPath: string): Promise<void> {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(modulesPath, { withFileTypes: true });
    } catch (error) {
      this.log(`Failed to read modules directory ${modulesPath}: ${this.getErrorMessage(error)}`, "warn");
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modulePath = path.join(modulesPath, entry.name);
        const manifestsPath = path.join(modulePath, "manifests");

        if (fs.existsSync(manifestsPath)) {
          const relativePath = path.relative(this.controlRepoPath, manifestsPath);
          await this.scanManifestsDirectory(manifestsPath, relativePath);
        }
      }
    }
  }

  /**
   * Scan a single manifest file
   */
  private scanManifestFile(filePath: string, relativePath: string): void {
    // Check cache
    if (this.manifestCache.has(relativePath)) {
      const cached = this.manifestCache.get(relativePath);
      if (!cached) {
        return;
      }
      this.manifests.push(cached);
      this.addManifestToIndex(cached);
      return;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      this.log(`Failed to read manifest ${relativePath}: ${this.getErrorMessage(error)}`, "warn");
      return;
    }

    const manifestInfo = this.parseManifest(content, relativePath);
    this.manifests.push(manifestInfo);
    this.manifestCache.set(relativePath, manifestInfo);
    this.addManifestToIndex(manifestInfo);
  }

  /**
   * Add manifest info to the class/defined type indexes
   */
  private addManifestToIndex(manifest: ManifestInfo): void {
    for (const classInfo of manifest.classes) {
      this.classes.set(classInfo.name, classInfo);
    }

    for (const typeInfo of manifest.definedTypes) {
      this.definedTypes.set(typeInfo.name, typeInfo);
    }
  }

  /**
   * Parse a Puppet manifest file
   */
  private parseManifest(content: string, filePath: string): ManifestInfo {
    const classes: PuppetClass[] = [];
    const definedTypes: PuppetDefinedType[] = [];
    const resources: ResourceInfo[] = [];
    const includes: string[] = [];
    const hieraLookups: string[] = [];

    const lines = content.split("\n");
    const linesOfCode = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    }).length;

    // Parse class definitions
    const classRegex = /^\s*class\s+([\w:]+)\s*(?:\(([\s\S]*?)\))?\s*(?:inherits\s+[\w:]+\s*)?{/gm;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const lineNumber = this.getLineNumber(content, match.index);
      const parameters = this.parseParameters(match[2] || "");

      classes.push({
        name: className,
        file: filePath,
        line: lineNumber,
        parameters,
      });
    }

    // Parse defined type definitions
    const defineRegex = /^\s*define\s+([\w:]+)\s*(?:\(([\s\S]*?)\))?\s*{/gm;

    while ((match = defineRegex.exec(content)) !== null) {
      const typeName = match[1];
      const lineNumber = this.getLineNumber(content, match.index);
      const parameters = this.parseParameters(match[2] || "");

      definedTypes.push({
        name: typeName,
        file: filePath,
        line: lineNumber,
        parameters,
      });
    }

    // Parse resource declarations
    const resourceRegex = /^\s*([\w:]+)\s*{\s*['"]?([^'":\s][^:]*?)['"]?\s*:/gm;

    while ((match = resourceRegex.exec(content)) !== null) {
      const resourceType = match[1];
      const resourceTitle = match[2].trim();
      const lineNumber = this.getLineNumber(content, match.index);

      // Skip class, define, node declarations
      if (!["class", "define", "node"].includes(resourceType.toLowerCase())) {
        resources.push({
          type: resourceType,
          title: resourceTitle,
          file: filePath,
          line: lineNumber,
        });
      }
    }

    // Parse include statements
    const includeRegex = /^\s*(?:include|contain|require)\s+(?:['"]?([\w:]+)['"]?|[\w:]+)/gm;

    while ((match = includeRegex.exec(content)) !== null) {
      const includedClass = match[1] || match[0].split(/\s+/)[1].replace(/['"]/g, "");
      includes.push(includedClass);
    }

    // Parse Hiera lookups
    const hieraRegex = /(?:hiera|lookup)\s*\(\s*['"]([^'"]+)['"]/g;

    while ((match = hieraRegex.exec(content)) !== null) {
      hieraLookups.push(match[1]);
    }

    // Also look for automatic parameter lookups (class parameters)
    for (const classInfo of classes) {
      for (const param of classInfo.parameters) {
        // Class parameters are automatically looked up as classname::paramname
        hieraLookups.push(`${classInfo.name}::${param}`);
      }
    }

    return {
      file: filePath,
      classes,
      definedTypes,
      resources,
      includes,
      hieraLookups,
      linesOfCode,
    };
  }

  /**
   * Parse parameter list from class/define declaration
   */
  private parseParameters(paramString: string): string[] {
    if (!paramString.trim()) {
      return [];
    }

    const params: string[] = [];
    // Simple parameter extraction - looks for $paramname
    const paramRegex = /\$(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(paramString)) !== null) {
      params.push(match[1]);
    }

    return params;
  }

  /**
   * Get line number for a position in content
   */
  private getLineNumber(content: string, position: number): number {
    const beforeMatch = content.substring(0, position);
    return (beforeMatch.match(/\n/g) ?? []).length + 1;
  }


  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.analysisCache = null;
    this.manifestCache.clear();
    this.log("Analysis cache cleared");
  }

  /**
   * Reload the analyzer
   */
  async reload(): Promise<void> {
    this.clearCache();
    this.classes.clear();
    this.definedTypes.clear();
    this.manifests = [];
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Create a cache entry
   */
  private createCacheEntry<T>(value: T): AnalysisCacheEntry<T> {
    const now = Date.now();
    const ttl = this.config.analysisInterval * 1000; // Convert to ms
    return {
      value,
      cachedAt: now,
      expiresAt: now + ttl,
    };
  }

  /**
   * Check if a cache entry is expired
   */
  private isCacheExpired<T>(entry: AnalysisCacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Ensure the analyzer is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("CodeAnalyzer is not initialized. Call initialize() first.");
    }
  }

  /**
   * Resolve a path relative to the control repository
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.controlRepoPath, filePath);
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Log a message with analyzer context
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const prefix = "[CodeAnalyzer]";
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

  // ============================================================================
  // Accessors
  // ============================================================================

  /**
   * Get the control repository path
   */
  getControlRepoPath(): string {
    return this.controlRepoPath;
  }

  /**
   * Get all discovered classes
   */
  getClasses(): Map<string, PuppetClass> {
    return this.classes;
  }

  /**
   * Get all discovered defined types
   */
  getDefinedTypes(): Map<string, PuppetDefinedType> {
    return this.definedTypes;
  }

  /**
   * Get all scanned manifests
   */
  getManifests(): ManifestInfo[] {
    return this.manifests;
  }

  /**
   * Get the configuration
   */
  getConfig(): CodeAnalysisConfig {
    return this.config;
  }
}
