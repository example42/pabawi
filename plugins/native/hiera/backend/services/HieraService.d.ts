/**
 * Hiera Service
 *
 * Service for Hiera data lookup, key resolution, and hierarchy management.
 *
 * @module plugins/native/hiera/backend/services/HieraService
 * @version 1.0.0
 */
import type { HieraConfig, HieraKey, HieraKeyIndex, HierarchyFileInfo, HealthStatus } from "../types.js";
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
 * Hiera Service
 *
 * Provides Hiera data lookup and key resolution.
 */
export declare class HieraService {
    private hieraConfigPath;
    private controlRepoPath;
    private hieraConfig;
    private keyIndex;
    private cache;
    private logger;
    private _initialized;
    constructor(hieraConfigPath: string, controlRepoPath: string, logger?: LoggerInterface);
    /**
     * Initialize the service
     */
    initialize(): Promise<void>;
    /**
     * Check if service is initialized
     */
    isInitialized(): boolean;
    /**
     * Perform health check
     */
    healthCheck(): Promise<HealthStatus>;
    /**
     * Load Hiera configuration from file
     */
    private loadHieraConfig;
    /**
     * Scan hieradata files and build key index
     */
    private scanHieradata;
    /**
     * Resolve Hiera path patterns
     */
    private resolveHieraPath;
    /**
     * Scan a single YAML file for keys
     */
    private scanFile;
    /**
     * Extract keys from YAML data recursively
     */
    private extractKeys;
    /**
     * Get all keys from the index
     */
    getAllKeys(): Promise<HieraKeyIndex>;
    /**
     * Search keys by query
     */
    searchKeys(query: string): Promise<HieraKey[]>;
    /**
     * Resolve a key for a specific node
     *
     * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
     */
    resolveKey(node: string, key: string, _environment?: string): Promise<{
        found: boolean;
        key: string;
        value?: unknown;
        source?: string;
        hierarchyLevel?: string;
        interpolated?: boolean;
        lookupPath?: string[];
    }>;
    /**
     * Get Hiera data for a specific node
     *
     * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
     */
    getNodeHieraData(node: string): Promise<{
        node: string;
        keys: Map<string, unknown>;
        hierarchyFiles: HierarchyFileInfo[];
        usedKeys: string[];
        unusedKeys: string[];
    }>;
    /**
     * Get key values across all nodes
     *
     * Note: Returns data matching the HieraServiceInterface expected by HieraPlugin
     */
    getKeyValuesAcrossNodes(key: string): Promise<Array<{
        node: string;
        value: unknown;
        source: string;
        hierarchyLevel: string;
    }>>;
    /**
     * Get Hiera configuration
     */
    getHieraConfig(): HieraConfig | null;
    /**
     * Invalidate cache
     */
    invalidateCache(): void;
    /**
     * Shutdown service
     */
    shutdown(): void;
}
export {};
