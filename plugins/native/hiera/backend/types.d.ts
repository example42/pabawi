/**
 * Types for Hiera service operations
 *
 * @module plugins/native/hiera/backend/types
 * @version 1.0.0
 */
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
/**
 * A Hiera key with all its locations
 */
export interface HieraKey {
    name: string;
    locations: HieraKeyLocation[];
    valueTypes: string[];
    firstSeen: string;
    lastModified: string;
    lookupOptions?: LookupOptions;
}
/**
 * Location where a Hiera key is defined
 */
export interface HieraKeyLocation {
    file: string;
    line: number;
    value: unknown;
    valueType: string;
    hierarchyLevel: string;
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
 * Information about a file in the Hiera hierarchy
 */
export interface HierarchyFileInfo {
    path: string;
    hierarchyLevel: string;
    interpolatedPath: string;
    exists: boolean;
    canResolve: boolean;
    unresolvedVariables?: string[];
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
    hierarchyFiles: HierarchyFileInfo[];
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
/**
 * Health status interface
 */
export interface HealthStatus {
    healthy: boolean;
    message?: string;
    lastCheck: string;
    details?: Record<string, unknown>;
    degraded?: boolean;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
}
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
/**
 * Hiera error codes
 */
export declare const HIERA_ERROR_CODES: {
    readonly NOT_CONFIGURED: "HIERA_NOT_CONFIGURED";
    readonly INVALID_PATH: "HIERA_INVALID_PATH";
    readonly PARSE_ERROR: "HIERA_PARSE_ERROR";
    readonly RESOLUTION_ERROR: "HIERA_RESOLUTION_ERROR";
    readonly FACTS_UNAVAILABLE: "HIERA_FACTS_UNAVAILABLE";
    readonly CATALOG_COMPILATION_FAILED: "HIERA_CATALOG_COMPILATION_FAILED";
    readonly ANALYSIS_ERROR: "HIERA_ANALYSIS_ERROR";
    readonly FORGE_UNAVAILABLE: "HIERA_FORGE_UNAVAILABLE";
};
export type HieraErrorCode = (typeof HIERA_ERROR_CODES)[keyof typeof HIERA_ERROR_CODES];
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
/**
 * Base error class for Hiera errors
 */
export declare class HieraServiceError extends Error {
    readonly code: HieraErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: HieraErrorCode, details?: Record<string, unknown>);
}
/**
 * Error for Hiera configuration issues
 */
export declare class HieraConfigurationError extends HieraServiceError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Error for Hiera parse failures
 */
export declare class HieraParseError extends HieraServiceError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Error for Hiera resolution failures
 */
export declare class HieraResolutionError extends HieraServiceError {
    constructor(message: string, details?: Record<string, unknown>);
}
