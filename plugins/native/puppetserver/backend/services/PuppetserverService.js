"use strict";
/**
 * Puppetserver Service
 *
 * Service for interacting with Puppetserver API.
 * Provides catalog compilation, environment management, and facts retrieval.
 *
 * @module plugins/native/puppetserver/backend/services/PuppetserverService
 * @version 1.0.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppetserverService = void 0;
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const types_js_1 = require("../types.js");
/**
 * Simple cache implementation
 */
class SimpleCache {
    cache = new Map();
    defaultTtl;
    constructor(ttl = 300000) {
        this.defaultTtl = ttl;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.data;
    }
    set(key, data, ttl) {
        this.cache.set(key, {
            data,
            expires: Date.now() + (ttl ?? this.defaultTtl),
        });
    }
    clear() {
        this.cache.clear();
    }
}
/**
 * Puppetserver Service
 *
 * Provides access to Puppetserver data through HTTP API.
 */
class PuppetserverService {
    baseUrl;
    httpsAgent;
    timeout;
    cache;
    logger;
    _initialized = false;
    constructor(serverUrl, certPath, keyPath, caPath, timeout = 30000, logger) {
        // Parse and validate server URL
        const url = new URL(serverUrl);
        const port = url.port || (url.protocol === "https:" ? "8140" : "8080");
        this.baseUrl = `${url.protocol}//${url.hostname}:${port}`;
        this.timeout = timeout;
        this.cache = new SimpleCache();
        // Use provided logger or create a simple console logger
        this.logger = logger ?? {
            info: (message, context) => {
                console.log(`[INFO] ${message}`, context ?? "");
            },
            warn: (message, context) => {
                console.warn(`[WARN] ${message}`, context ?? "");
            },
            debug: (message, context) => {
                if (process.env.DEBUG) {
                    console.debug(`[DEBUG] ${message}`, context ?? "");
                }
            },
            error: (message, context, error) => {
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
    createHttpsAgent(certPath, keyPath, caPath) {
        const agentOptions = {
            rejectUnauthorized: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
        };
        if (caPath) {
            try {
                agentOptions.ca = fs_1.default.readFileSync(caPath);
            }
            catch (error) {
                throw new types_js_1.PuppetserverConnectionError(`Failed to load CA certificate from ${caPath}`, error);
            }
        }
        if (certPath) {
            try {
                agentOptions.cert = fs_1.default.readFileSync(certPath);
            }
            catch (error) {
                throw new types_js_1.PuppetserverConnectionError(`Failed to load client certificate from ${certPath}`, error);
            }
        }
        if (keyPath) {
            try {
                agentOptions.key = fs_1.default.readFileSync(keyPath);
            }
            catch (error) {
                throw new types_js_1.PuppetserverConnectionError(`Failed to load client key from ${keyPath}`, error);
            }
        }
        return new https_1.default.Agent(agentOptions);
    }
    /**
     * Initialize the service
     */
    async initialize(_config) {
        this.logger.info("Initializing PuppetserverService", {
            component: "PuppetserverService",
            operation: "initialize",
        });
        this._initialized = true;
    }
    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this._initialized;
    }
    /**
     * Perform health check
     */
    async healthCheck() {
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
        }
        catch (error) {
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
    async request(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.baseUrl}${path}`);
            const headers = {
                Accept: "application/json",
                "Content-Type": "application/json",
            };
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method,
                headers,
                agent: this.httpsAgent,
            };
            const timeoutId = setTimeout(() => {
                req.destroy();
                reject(new types_js_1.PuppetserverError(`Request timeout after ${this.timeout}ms`, "TIMEOUT", { path, timeout: this.timeout }));
            }, this.timeout);
            const req = https_1.default.request(options, (res) => {
                clearTimeout(timeoutId);
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk.toString();
                });
                res.on("end", () => {
                    // Handle authentication errors
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        reject(new types_js_1.PuppetserverAuthenticationError("Authentication failed. Check your Puppetserver credentials.", { status: res.statusCode, statusText: res.statusMessage }));
                        return;
                    }
                    // Handle not found
                    if (res.statusCode === 404) {
                        resolve(null);
                        return;
                    }
                    // Handle other errors
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        reject(new types_js_1.PuppetserverError(`Puppetserver API error: ${res.statusMessage}`, `HTTP_${res.statusCode}`, { status: res.statusCode, statusText: res.statusMessage, body: data }));
                        return;
                    }
                    // Parse JSON response
                    try {
                        const parsed = data ? JSON.parse(data) : null;
                        resolve(parsed);
                    }
                    catch (parseError) {
                        reject(new types_js_1.PuppetserverError("Failed to parse Puppetserver response as JSON", "PARSE_ERROR", parseError));
                    }
                });
            });
            req.on("error", (error) => {
                clearTimeout(timeoutId);
                if (error.message.includes("ECONNREFUSED")) {
                    reject(new types_js_1.PuppetserverConnectionError(`Cannot connect to Puppetserver at ${this.baseUrl}. Is Puppetserver running?`, error));
                }
                else if (error.message.includes("certificate")) {
                    reject(new types_js_1.PuppetserverConnectionError("SSL certificate validation failed. Check your SSL configuration.", error));
                }
                else {
                    reject(new types_js_1.PuppetserverConnectionError("Failed to connect to Puppetserver", error));
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
    async get(path) {
        return this.request("GET", path);
    }
    /**
     * POST request
     */
    async post(path, body) {
        return this.request("POST", path, body);
    }
    /**
     * DELETE request
     */
    async delete(path) {
        return this.request("DELETE", path);
    }
    /**
     * Get simple status
     */
    async getSimpleStatus() {
        return this.get("/status/v1/simple");
    }
    /**
     * Get services status
     */
    async getServicesStatus() {
        return this.get("/status/v1/services");
    }
    /**
     * Get metrics
     */
    async getMetrics(mbean) {
        const path = mbean
            ? `/metrics/v2/read/${encodeURIComponent(mbean)}`
            : "/metrics/v2/list";
        return this.get(path);
    }
    /**
     * Get admin API info
     */
    async getAdminApiInfo() {
        return this.get("/puppet-admin-api/v1");
    }
    /**
     * Compile catalog for a node
     */
    async compileCatalog(certname, environment) {
        const cacheKey = `catalog:${certname}:${environment}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const result = await this.post(`/puppet/v3/catalog/${certname}?environment=${encodeURIComponent(environment)}`);
            if (!result) {
                throw new types_js_1.CatalogCompilationError(`Failed to compile catalog for '${certname}' in environment '${environment}'`, certname, environment);
            }
            const catalog = this.transformCatalog(result, certname, environment);
            this.cache.set(cacheKey, catalog);
            return catalog;
        }
        catch (error) {
            if (error instanceof types_js_1.CatalogCompilationError) {
                throw error;
            }
            throw new types_js_1.CatalogCompilationError(`Failed to compile catalog for '${certname}' in environment '${environment}'`, certname, environment, undefined, error);
        }
    }
    /**
     * Get catalog for a node (uses default environment)
     */
    async getNodeCatalog(certname) {
        try {
            return await this.compileCatalog(certname, "production");
        }
        catch {
            return null;
        }
    }
    /**
     * Compare catalogs between two environments
     */
    async compareCatalogs(certname, env1, env2) {
        const catalog1 = await this.compileCatalog(certname, env1);
        const catalog2 = await this.compileCatalog(certname, env2);
        return this.diffCatalogs(catalog1, catalog2, env1, env2);
    }
    /**
     * List environments
     */
    async listEnvironments() {
        const cacheKey = "environments:all";
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
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
    async getEnvironment(name) {
        const result = await this.get(`/puppet/v3/environment/${name}`);
        if (!result) {
            return null;
        }
        return result;
    }
    /**
     * Deploy an environment
     */
    async deployEnvironment(name) {
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
        }
        catch (error) {
            throw new types_js_1.EnvironmentDeploymentError(`Failed to deploy environment '${name}'`, name, error);
        }
    }
    /**
     * Flush environment cache
     */
    async flushEnvironmentCache(name) {
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
        }
        catch (error) {
            throw new types_js_1.EnvironmentDeploymentError(name
                ? `Failed to flush cache for environment '${name}'`
                : "Failed to flush cache for all environments", name ?? "all", error);
        }
    }
    /**
     * Get facts for a node
     */
    async getNodeFacts(nodeId) {
        const cacheKey = `facts:${nodeId}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
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
    clearCache() {
        this.cache.clear();
    }
    // ==========================================================================
    // Transform methods
    // ==========================================================================
    transformCatalog(result, certname, environment) {
        const data = result;
        return {
            certname,
            version: String(data.version ?? ""),
            environment,
            transaction_uuid: data.transaction_uuid,
            producer_timestamp: data.producer_timestamp,
            resources: this.transformResources(data.resources),
            edges: this.transformEdges(data.edges),
        };
    }
    transformResources(resources) {
        if (!Array.isArray(resources)) {
            return [];
        }
        return resources.map((r) => ({
            type: String(r.type ?? ""),
            title: String(r.title ?? ""),
            tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
            exported: Boolean(r.exported),
            file: r.file,
            line: r.line,
            parameters: r.parameters ?? {},
        }));
    }
    transformEdges(edges) {
        if (!Array.isArray(edges)) {
            return [];
        }
        return edges.map((e) => ({
            source: {
                type: String(e.source?.type ?? ""),
                title: String(e.source?.title ?? ""),
            },
            target: {
                type: String(e.target?.type ?? ""),
                title: String(e.target?.title ?? ""),
            },
            relationship: e.relationship ?? "require",
        }));
    }
    transformEnvironments(result) {
        const data = result;
        const environments = data.environments;
        if (!environments || typeof environments !== "object") {
            return [];
        }
        return Object.entries(environments).map(([name, settings]) => ({
            name,
            settings: settings,
        }));
    }
    transformFacts(nodeId, result) {
        const data = result;
        return {
            nodeId,
            gatheredAt: new Date().toISOString(),
            source: "puppetserver",
            facts: data.values ?? data,
        };
    }
    diffCatalogs(catalog1, catalog2, env1, env2) {
        const resources1 = new Map(catalog1.resources.map((r) => [`${r.type}[${r.title}]`, r]));
        const resources2 = new Map(catalog2.resources.map((r) => [`${r.type}[${r.title}]`, r]));
        const added = [];
        const removed = [];
        const modified = [];
        const unchanged = [];
        // Find added and modified resources
        for (const [key, r2] of resources2) {
            const r1 = resources1.get(key);
            if (!r1) {
                added.push(r2);
            }
            else {
                const paramChanges = this.diffParameters(r1.parameters, r2.parameters);
                if (paramChanges.length > 0) {
                    modified.push({
                        type: r2.type,
                        title: r2.title,
                        parameterChanges: paramChanges,
                    });
                }
                else {
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
    diffParameters(params1, params2) {
        const changes = [];
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
exports.PuppetserverService = PuppetserverService;
//# sourceMappingURL=PuppetserverService.js.map
