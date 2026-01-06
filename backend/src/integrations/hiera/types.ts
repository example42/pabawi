/**
 * Hiera Integration Data Types
 *
 * Type definitions for Hiera data lookup, resolution, and code analysis.
 */

// ============================================================================
// Hiera Configuration Types
// ============================================================================

/**
 * Hiera 5 configuration structure
 */
export interface HieraConfig {
  version: 5;
  defaults?: HieraDefaults;
  hierarchy: HierarchyLevel[];
}

/**
 * Default settings for Hiera hierarchy
 */
export interface HieraDefaults {
  datadir?: string;
  data_hash?: string;
  lookup_key?: string;
  options?: Record<string, unknown>;
}

/**
 * A single level in the Hiera hierarchy
 */
export interface HierarchyLevel {
  name: string;
  path?: string;
  paths?: string[];
  glob?: string;
  globs?: string[];
  datadir?: string;
  data_hash?: string;
  lookup_key?: string;
  mapped_paths?: [string, string, string];
  options?: Record<string, unknown>;
}

/**
 * Lookup options for Hiera keys
 */
export interface LookupOptions {
  merge?: LookupMethod;
  convert_to?: "Array" | "Hash";
  knockout_prefix?: string;
}

/**
 * Hiera lookup methods
 */
export type LookupMethod = "first" | "unique" | "hash" | "deep";

// ============================================================================
// Hiera Key Types
// ============================================================================

/**
 * A Hiera key with all its locations
 */
export interface HieraKey {
  name: string;
  locations: HieraKeyLocation[];
  lookupOptions?: LookupOptions;
}

/**
 * Location where a Hiera key is defined
 */
export interface HieraKeyLocation {
  file: string;
  hierarchyLevel: string;
  lineNumber: number;
  value: unknown;
}

/**
 * Index of all discovered Hiera keys
 */
export interface HieraKeyIndex {
  keys: Map<string, HieraKey>;
  files: Map<string, HieraFileInfo>;
  lastScan: string;
  totalKeys: number;
  totalFiles: number;
}

/**
 * Information about a scanned hieradata file
 */
export interface HieraFileInfo {
  path: string;
  hierarchyLevel: string;
  keys: string[];
  lastModified: string;
}

// ============================================================================
// Hiera Resolution Types
// ============================================================================

/**
 * Result of resolving a Hiera key
 */
export interface HieraResolution {
  key: string;
  resolvedValue: unknown;
  lookupMethod: LookupMethod;
  sourceFile: string;
  hierarchyLevel: string;
  allValues: HieraKeyLocation[];
  interpolatedVariables?: Record<string, unknown>;
  found: boolean;
}

/**
 * Options for resolving Hiera keys
 */
export interface ResolveOptions {
  lookupMethod?: LookupMethod;
  defaultValue?: unknown;
  mergeOptions?: MergeOptions;
}

/**
 * Options for merge operations
 */
export interface MergeOptions {
  strategy: LookupMethod;
  knockoutPrefix?: string;
  sortMergedArrays?: boolean;
  mergeHashArrays?: boolean;
}

/**
 * Hiera data for a specific node
 */
export interface NodeHieraData {
  nodeId: string;
  facts: Facts;
  keys: Map<string, HieraResolution>;
  usedKeys: Set<string>;
  unusedKeys: Set<string>;
}

/**
 * Key values across multiple nodes
 */
export interface KeyNodeValues {
  nodeId: string;
  value: unknown;
  sourceFile: string;
  hierarchyLevel: string;
  found: boolean;
}

/**
 * Map of key usage by node
 */
export type KeyUsageMap = Map<string, boolean>;

// ============================================================================
// Fact Types
// ============================================================================

/**
 * Facts for a node
 */
export interface Facts {
  nodeId: string;
  gatheredAt: string;
  facts: Record<string, unknown>;
}

/**
 * Result of fetching facts
 */
export interface FactResult {
  facts: Facts;
  source: "puppetdb" | "local";
  warnings?: string[];
}

/**
 * Local fact file format (Puppetserver format)
 */
export interface LocalFactFile {
  name: string;
  values: Record<string, unknown>;
}

// ============================================================================
// Code Analysis Types
// ============================================================================

/**
 * Complete code analysis result
 */
export interface CodeAnalysisResult {
  unusedCode: UnusedCodeReport;
  lintIssues: LintIssue[];
  moduleUpdates: ModuleUpdate[];
  statistics: UsageStatistics;
  analyzedAt: string;
}

/**
 * Report of unused code items
 */
export interface UnusedCodeReport {
  unusedClasses: UnusedItem[];
  unusedDefinedTypes: UnusedItem[];
  unusedHieraKeys: UnusedItem[];
}

/**
 * An unused code item
 */
export interface UnusedItem {
  name: string;
  file: string;
  line: number;
  type: "class" | "defined_type" | "hiera_key";
}

/**
 * A lint issue found in Puppet code
 */
export interface LintIssue {
  file: string;
  line: number;
  column: number;
  severity: LintSeverity;
  message: string;
  rule: string;
  fixable: boolean;
}

/**
 * Lint issue severity levels
 */
export type LintSeverity = "error" | "warning" | "info";

/**
 * Module update information
 */
export interface ModuleUpdate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  source: "forge" | "git";
  hasSecurityAdvisory: boolean;
  changelog?: string;
}

/**
 * Usage statistics for the codebase
 */
export interface UsageStatistics {
  totalManifests: number;
  totalClasses: number;
  totalDefinedTypes: number;
  totalFunctions: number;
  linesOfCode: number;
  mostUsedClasses: ClassUsage[];
  mostUsedResources: ResourceUsage[];
}

/**
 * Class usage information
 */
export interface ClassUsage {
  name: string;
  usageCount: number;
  nodes: string[];
}

/**
 * Resource usage information
 */
export interface ResourceUsage {
  type: string;
  count: number;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * API response for key list
 */
export interface KeyListResponse {
  keys: HieraKeyInfo[];
  total: number;
  page?: number;
  pageSize?: number;
}

/**
 * Simplified key info for API responses
 */
export interface HieraKeyInfo {
  name: string;
  locationCount: number;
  hasLookupOptions: boolean;
}

/**
 * API response for key search
 */
export interface KeySearchResponse {
  keys: HieraKeyInfo[];
  query: string;
  total: number;
}

/**
 * API response for key details
 */
export interface KeyDetailResponse {
  key: HieraKey;
}

/**
 * API response for node Hiera data
 */
export interface NodeHieraDataResponse {
  nodeId: string;
  keys: HieraResolutionInfo[];
  usedKeys: string[];
  unusedKeys: string[];
  factSource: "puppetdb" | "local";
  warnings?: string[];
}

/**
 * Simplified resolution info for API responses
 */
export interface HieraResolutionInfo {
  key: string;
  resolvedValue: unknown;
  lookupMethod: LookupMethod;
  sourceFile: string;
  hierarchyLevel: string;
  found: boolean;
}

/**
 * API response for global key lookup
 */
export interface GlobalKeyLookupResponse {
  key: string;
  nodes: KeyNodeValues[];
  groupedByValue: ValueGroup[];
}

/**
 * Group of nodes with the same value
 */
export interface ValueGroup {
  value: unknown;
  nodes: string[];
}

/**
 * API response for code analysis
 */
export interface CodeAnalysisResponse {
  unusedCode: UnusedCodeReport;
  lintIssues: LintIssue[];
  moduleUpdates: ModuleUpdate[];
  statistics: UsageStatistics;
  analyzedAt: string;
}

/**
 * API response for integration status
 */
export interface HieraStatusResponse {
  enabled: boolean;
  configured: boolean;
  healthy: boolean;
  controlRepoPath?: string;
  lastScan?: string;
  keyCount?: number;
  fileCount?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Hiera error codes
 */
export const HIERA_ERROR_CODES = {
  NOT_CONFIGURED: "HIERA_NOT_CONFIGURED",
  INVALID_PATH: "HIERA_INVALID_PATH",
  PARSE_ERROR: "HIERA_PARSE_ERROR",
  RESOLUTION_ERROR: "HIERA_RESOLUTION_ERROR",
  FACTS_UNAVAILABLE: "HIERA_FACTS_UNAVAILABLE",
  CATALOG_COMPILATION_FAILED: "HIERA_CATALOG_COMPILATION_FAILED",
  ANALYSIS_ERROR: "HIERA_ANALYSIS_ERROR",
  FORGE_UNAVAILABLE: "HIERA_FORGE_UNAVAILABLE",
} as const;

export type HieraErrorCode =
  (typeof HIERA_ERROR_CODES)[keyof typeof HIERA_ERROR_CODES];

/**
 * Hiera error structure
 */
export interface HieraError {
  code: HieraErrorCode;
  message: string;
  details?: {
    file?: string;
    line?: number;
    suggestion?: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Fact source configuration
 */
export interface FactSourceConfig {
  preferPuppetDB: boolean;
  localFactsPath?: string;
}

/**
 * Catalog compilation configuration
 */
export interface CatalogCompilationConfig {
  enabled: boolean;
  timeout: number;
  cacheTTL: number;
}

/**
 * Hiera cache configuration
 */
export interface HieraCacheConfig {
  enabled: boolean;
  ttl: number;
  maxEntries: number;
}

/**
 * Code analysis configuration
 */
export interface CodeAnalysisConfig {
  enabled: boolean;
  lintEnabled: boolean;
  moduleUpdateCheck: boolean;
  analysisInterval: number;
  exclusionPatterns?: string[];
}

/**
 * Complete Hiera plugin configuration
 */
export interface HieraPluginConfig {
  enabled: boolean;
  controlRepoPath: string;
  hieraConfigPath: string;
  environments: string[];
  factSources: FactSourceConfig;
  catalogCompilation: CatalogCompilationConfig;
  cache: HieraCacheConfig;
  codeAnalysis: CodeAnalysisConfig;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health status for the Hiera integration
 */
export interface HieraHealthStatus {
  healthy: boolean;
  status: "connected" | "error" | "not_configured";
  message?: string;
  details?: {
    controlRepoAccessible: boolean;
    hieraConfigValid: boolean;
    factSourceAvailable: boolean;
    lastScanTime?: string;
    keyCount?: number;
    fileCount?: number;
  };
  errors?: string[];
  warnings?: string[];
}
