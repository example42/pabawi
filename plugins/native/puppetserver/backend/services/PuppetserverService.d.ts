/**
 * Puppetserver Service
 *
 * Service for interacting with Puppetserver API.
 * Provides catalog compilation, environment management, and facts retrieval.
 *
 * @module plugins/native/puppetserver/backend/services/PuppetserverService
 * @version 1.0.0
 */
import type { Catalog, CatalogDiff, Environment, DeploymentResult, Facts, HealthStatus } from "../types.js";
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
 * Puppetserver Service
 *
 * Provides access to Puppetserver data through HTTP API.
 */
export declare class PuppetserverService {
    private baseUrl;
    private httpsAgent?;
    private timeout;
    private cache;
    private logger;
    private _initialized;
    constructor(serverUrl: string, certPath?: string, keyPath?: string, caPath?: string, timeout?: number, logger?: LoggerInterface);
    /**
     * Create HTTPS agent with SSL configuration
     */
    private createHttpsAgent;
    /**
     * Initialize the service
     */
    initialize(_config: unknown): Promise<void>;
    /**
     * Check if service is initialized
     */
    isInitialized(): boolean;
    /**
     * Perform health check
     */
    healthCheck(): Promise<HealthStatus>;
    /**
     * Make HTTP request to Puppetserver
     */
    private request;
    /**
     * GET request
     */
    private get;
    /**
     * POST request
     */
    private post;
    /**
     * DELETE request
     */
    private delete;
    /**
     * Get simple status
     */
    getSimpleStatus(): Promise<unknown>;
    /**
     * Get services status
     */
    getServicesStatus(): Promise<unknown>;
    /**
     * Get metrics
     */
    getMetrics(mbean?: string): Promise<unknown>;
    /**
     * Get admin API info
     */
    getAdminApiInfo(): Promise<unknown>;
    /**
     * Compile catalog for a node
     */
    compileCatalog(certname: string, environment: string): Promise<Catalog>;
    /**
     * Get catalog for a node (uses default environment)
     */
    getNodeCatalog(certname: string): Promise<Catalog | null>;
    /**
     * Compare catalogs between two environments
     */
    compareCatalogs(certname: string, env1: string, env2: string): Promise<CatalogDiff>;
    /**
     * List environments
     */
    listEnvironments(): Promise<Environment[]>;
    /**
     * Get a specific environment
     */
    getEnvironment(name: string): Promise<Environment | null>;
    /**
     * Deploy an environment
     */
    deployEnvironment(name: string): Promise<DeploymentResult>;
    /**
     * Flush environment cache
     */
    flushEnvironmentCache(name?: string): Promise<DeploymentResult>;
    /**
     * Get facts for a node
     */
    getNodeFacts(nodeId: string): Promise<Facts>;
    /**
     * Clear cache
     */
    clearCache(): void;
    private transformCatalog;
    private transformResources;
    private transformEdges;
    private transformEnvironments;
    private transformFacts;
    private diffCatalogs;
    private diffParameters;
}
export {};
//# sourceMappingURL=PuppetserverService.d.ts.map
