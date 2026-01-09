/**
 * Puppetserver Client
 *
 * Low-level HTTP client for Puppetserver API communication.
 * Handles SSL configuration, authentication, and request/response processing.
 * Includes retry logic with exponential backoff and circuit breaker pattern.
 */

import https from "https";
import fs from "fs";
import type { PuppetserverClientConfig } from "./types";
import {
  PuppetserverConnectionError,
  PuppetserverAuthenticationError,
  PuppetserverError,
  PuppetserverTimeoutError,
} from "./errors";
import { CircuitBreaker } from "../puppetdb/CircuitBreaker";
import { withRetry, type RetryConfig } from "../puppetdb/RetryLogic";

/**
 * Query parameters for Puppetserver API requests
 */
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Error type categorization
 */
export type ErrorCategory =
  | "connection"
  | "timeout"
  | "authentication"
  | "server"
  | "client"
  | "unknown";

/**
 * Low-level HTTP client for Puppetserver API
 *
 * Provides methods for interacting with Puppetserver endpoints with:
 * - SSL/TLS support with custom certificates
 * - Token-based and certificate-based authentication
 * - Request/response handling
 * - Error handling and logging
 * - Timeout and connection management
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for fault tolerance
 */
export class PuppetserverClient {
  private baseUrl: string;
  private token?: string;
  private httpsAgent?: https.Agent;
  private timeout: number;
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig;

  /**
   * Create a new Puppetserver client
   *
   * @param config - Client configuration
   */
  constructor(config: PuppetserverClientConfig) {
    // Parse and validate server URL
    const url = new URL(config.serverUrl);
    const port = config.port ?? (url.protocol === "https:" ? 8140 : 8080);

    this.baseUrl = `${url.protocol}//${url.hostname}:${String(port)}`;
    this.token = config.token;
    this.timeout = config.timeout ?? 30000;

    // Configure HTTPS agent for SSL/TLS and certificate-based auth
    if (url.protocol === "https:") {
      this.httpsAgent = this.createHttpsAgent(config);
    }

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      timeout: this.timeout,
      onStateChange: (oldState, newState): void => {
        console.warn(
          `[Puppetserver] Circuit breaker: ${oldState} -> ${newState}`,
        );
      },
      onOpen: (failureCount): void => {
        console.error(
          `[Puppetserver] Circuit breaker opened after ${String(failureCount)} failures`,
        );
      },
      onClose: (): void => {
        console.warn(
          "[Puppetserver] Circuit breaker closed - service recovered",
        );
      },
    });

    // Initialize retry configuration from config or use defaults
    const retryAttempts = config.retryAttempts ?? 3;
    const retryDelay = config.retryDelay ?? 1000;

    this.retryConfig = {
      maxAttempts: retryAttempts,
      initialDelay: retryDelay,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      shouldRetry: (error: unknown): boolean => this.isRetryableError(error),
      onRetry: (attempt, delay, error): void => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const category = this.categorizeError(error);
        console.warn(
          `[Puppetserver] Retry attempt ${String(attempt)}/${String(retryAttempts)} after ${String(delay)}ms due to ${category} error: ${errorMessage}`,
        );
      },
    };
  }

  /**
   * Create HTTPS agent with SSL configuration
   *
   * @param config - Client configuration
   * @returns Configured HTTPS agent
   */
  private createHttpsAgent(config: PuppetserverClientConfig): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: config.rejectUnauthorized ?? true,
      // Fix for ERR_OSSL_UNSUPPORTED with OpenSSL 3.0+
      // Allow legacy TLS versions and cipher suites for compatibility with older Puppetserver versions
      minVersion: "TLSv1.2", // Support TLS 1.2 and above
      maxVersion: "TLSv1.3", // Support up to TLS 1.3
      // Enable legacy cipher suites for compatibility
      secureOptions: 0, // Disable all secure options to allow legacy algorithms
    };

    // Load CA certificate if provided
    if (config.ca) {
      try {
        agentOptions.ca = fs.readFileSync(config.ca);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load CA certificate from ${config.ca}`,
          error,
        );
      }
    }

    // Load client certificate if provided (for certificate-based auth)
    if (config.cert) {
      try {
        agentOptions.cert = fs.readFileSync(config.cert);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load client certificate from ${config.cert}`,
          error,
        );
      }
    }

    // Load client key if provided (for certificate-based auth)
    if (config.key) {
      try {
        agentOptions.key = fs.readFileSync(config.key);
      } catch (error) {
        throw new PuppetserverConnectionError(
          `Failed to load client key from ${config.key}`,
          error,
        );
      }
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Status API: Get node status
   *
   * Implements requirements 5.1, 5.2, 5.3, 5.4, 5.5:
   * - Queries Puppetserver status API using correct endpoint
   * - Parses and returns node status data
   * - Handles missing status gracefully
   * - Provides detailed logging for debugging
   *
   * @param certname - Node certname
   * @returns Node status or null if not found
   */
  async getStatus(certname: string): Promise<unknown> {
    // Debug logging for status retrieval
    if (process.env.LOG_LEVEL === "debug") {
      console.warn("[Puppetserver] getStatus() called", {
        certname,
        endpoint: `/puppet/v3/status/${certname}`,
        baseUrl: this.baseUrl,
        hasToken: !!this.token,
        hasCertAuth: !!this.httpsAgent,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate certname (requirement 5.2)
    if (!certname || certname.trim() === "") {
      const error = new PuppetserverError(
        "Certificate name is required for status retrieval",
        "INVALID_CERTNAME",
        { certname },
      );
      console.error("[Puppetserver] getStatus() validation failed", {
        error: error.message,
        certname,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    try {
      // Call Puppetserver API (requirement 5.1, 5.2)
      const result = await this.get(`/puppet/v3/status/${certname}`);

      // Log successful response (requirement 5.5)
      if (result === null) {
        console.warn(
          "[Puppetserver] getStatus() returned null - node not found (requirement 5.4)",
          {
            certname,
            endpoint: `/puppet/v3/status/${certname}`,
            message:
              "Node has not checked in with Puppetserver yet or status data is not available",
            timestamp: new Date().toISOString(),
          },
        );
      } else if (process.env.LOG_LEVEL === "debug") {
        console.warn(
          "[Puppetserver] getStatus() response received successfully (requirement 5.3)",
          {
            certname,
            resultType: typeof result,
            hasReportTimestamp:
              result &&
              typeof result === "object" &&
              "report_timestamp" in result,
            hasLatestReportHash:
              result &&
              typeof result === "object" &&
              "latest_report_hash" in result,
            hasCatalogEnvironment:
              result &&
              typeof result === "object" &&
              "catalog_environment" in result,
            sampleKeys:
              result && typeof result === "object"
                ? Object.keys(result).slice(0, 10)
                : undefined,
            timestamp: new Date().toISOString(),
          },
        );
      }

      return result;
    } catch (error) {
      // Log detailed error information (requirement 5.5)
      console.error("[Puppetserver] getStatus() failed", {
        certname,
        endpoint: `/puppet/v3/status/${certname}`,
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorDetails:
          error instanceof PuppetserverError ? error.details : undefined,
        statusCode:
          error instanceof PuppetserverError
            ? (error.details as { status?: number }).status
            : undefined,
        timestamp: new Date().toISOString(),
      });

      // Handle 404 gracefully - node may not have status yet (requirement 5.4)
      if (
        error instanceof PuppetserverError &&
        (error.details as { status?: number }).status === 404
      ) {
        console.warn(
          `[Puppetserver] Status not found for node '${certname}' (404) - node may not have checked in yet (requirement 5.4)`,
          {
            certname,
            suggestion:
              "The node needs to run 'puppet agent -t' at least once to generate status data",
            timestamp: new Date().toISOString(),
          },
        );
        return null;
      }

      throw error;
    }
  }

  /**
   * Catalog API: Compile a catalog for a node in a specific environment
   *
   * Implements requirements 6.1, 6.2, 6.3, 6.4, 6.5:
   * - Uses correct API endpoint (/puppet/v3/catalog/{certname})
   * - Compiles catalogs for real environments (not fake ones)
   * - Parses and returns catalog resources
   * - Provides detailed logging for debugging
   * - Handles compilation errors with detailed messages
   *
   * @param certname - Node certname
   * @param environment - Environment name
   * @returns Compiled catalog
   */
  async compileCatalog(
    certname: string,
    environment: string,
    facts?: Record<string, unknown>,
  ): Promise<unknown> {
    console.warn("[Puppetserver] compileCatalog() called", {
      certname,
      environment,
      hasFacts: !!facts,
      factCount: facts ? Object.keys(facts).length : 0,
      endpoint: `/puppet/v3/catalog/${certname}`,
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    // Validate inputs
    if (!certname || certname.trim() === "") {
      const error = new PuppetserverError(
        "Certificate name is required for catalog compilation",
        "INVALID_CERTNAME",
        { certname, environment },
      );
      console.error("[Puppetserver] compileCatalog() validation failed", {
        error: error.message,
        certname,
        environment,
      });
      throw error;
    }

    if (!environment || environment.trim() === "") {
      const error = new PuppetserverError(
        "Environment name is required for catalog compilation",
        "INVALID_ENVIRONMENT",
        { certname, environment },
      );
      console.error("[Puppetserver] compileCatalog() validation failed", {
        error: error.message,
        certname,
        environment,
      });
      throw error;
    }

    try {
      // Environment must be passed as a query parameter
      // Facts must be sent in the request body in the format Puppet expects
      const requestBody = facts ? {
        certname,
        facts: {
          name: certname,
          values: facts,
        },
        trusted_facts: {
          authenticated: "remote",
          certname,
        },
      } : undefined;

      const result = await this.post(
        `/puppet/v3/catalog/${certname}?environment=${encodeURIComponent(environment)}`,
        requestBody,
      );

      // Log successful response
      if (result === null) {
        console.warn(
          "[Puppetserver] compileCatalog() returned null - catalog compilation may have failed",
          {
            certname,
            environment,
            endpoint: `/puppet/v3/catalog/${certname}`,
          },
        );
      } else {
        console.warn("[Puppetserver] compileCatalog() response received", {
          certname,
          environment,
          resultType: typeof result,
          hasResources:
            result &&
            typeof result === "object" &&
            "resources" in result &&
            Array.isArray((result as { resources?: unknown[] }).resources),
          resourceCount:
            result &&
            typeof result === "object" &&
            "resources" in result &&
            Array.isArray((result as { resources?: unknown[] }).resources)
              ? (result as { resources: unknown[] }).resources.length
              : undefined,
          hasEdges:
            result &&
            typeof result === "object" &&
            "edges" in result &&
            Array.isArray((result as { edges?: unknown[] }).edges),
          edgeCount:
            result &&
            typeof result === "object" &&
            "edges" in result &&
            Array.isArray((result as { edges?: unknown[] }).edges)
              ? (result as { edges: unknown[] }).edges.length
              : undefined,
          catalogVersion:
            result && typeof result === "object" && "version" in result
              ? (result as { version?: string }).version
              : undefined,
          catalogEnvironment:
            result && typeof result === "object" && "environment" in result
              ? (result as { environment?: string }).environment
              : undefined,
          sampleKeys:
            result && typeof result === "object" && !Array.isArray(result)
              ? Object.keys(result).slice(0, 10)
              : undefined,
        });
      }

      return result;
    } catch (error) {
      // Log detailed error information
      console.error("[Puppetserver] compileCatalog() failed", {
        certname,
        environment,
        endpoint: `/puppet/v3/catalog/${certname}`,
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorDetails:
          error instanceof PuppetserverError ? error.details : undefined,
      });

      // Handle 404 gracefully - node may not exist
      if (
        error instanceof PuppetserverError &&
        (error.details as { status?: number }).status === 404
      ) {
        console.warn(
          `[Puppetserver] Catalog compilation failed for node '${certname}' in environment '${environment}' (404) - node may not exist or environment may not be configured`,
        );
        return null;
      }

      throw error;
    }
  }

  /**
   * Facts API: Get facts for a node
   *
   * Implements requirements 4.1, 4.2, 4.3, 4.4, 4.5:
   * - Queries Puppetserver facts API using correct endpoint
   * - Parses and returns facts data
   * - Handles missing facts gracefully
   * - Provides detailed logging for debugging
   *
   * @param certname - Node certname
   * @returns Node facts or null if not found
   */
  async getFacts(certname: string): Promise<unknown> {
    console.warn("[Puppetserver] getFacts() called", {
      certname,
      endpoint: `/puppet/v3/facts/${certname}`,
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    // Validate certname
    if (!certname || certname.trim() === "") {
      const error = new PuppetserverError(
        "Certificate name is required for facts retrieval",
        "INVALID_CERTNAME",
        { certname },
      );
      console.error("[Puppetserver] getFacts() validation failed", {
        error: error.message,
        certname,
      });
      throw error;
    }

    try {
      const result = await this.get(`/puppet/v3/facts/${certname}`);

      // Log successful response
      if (result === null) {
        console.warn(
          "[Puppetserver] getFacts() returned null - node not found",
          {
            certname,
            endpoint: `/puppet/v3/facts/${certname}`,
          },
        );
      } else {
        console.warn("[Puppetserver] getFacts() response received", {
          certname,
          resultType: typeof result,
          hasValues: result && typeof result === "object" && "values" in result,
          valuesCount:
            result &&
            typeof result === "object" &&
            "values" in result &&
            typeof (result as { values?: unknown }).values === "object" &&
            (result as { values?: unknown }).values !== null
              ? Object.keys(
                  (result as { values: Record<string, unknown> }).values,
                ).length
              : undefined,
          sampleKeys:
            result &&
            typeof result === "object" &&
            "values" in result &&
            typeof (result as { values?: unknown }).values === "object" &&
            (result as { values?: unknown }).values !== null
              ? Object.keys(
                  (result as { values: Record<string, unknown> }).values,
                ).slice(0, 10)
              : undefined,
        });
      }

      return result;
    } catch (error) {
      // Log detailed error information
      console.error("[Puppetserver] getFacts() failed", {
        certname,
        endpoint: `/puppet/v3/facts/${certname}`,
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorDetails:
          error instanceof PuppetserverError ? error.details : undefined,
      });

      // Handle 404 gracefully - node may not have facts yet
      if (
        error instanceof PuppetserverError &&
        (error.details as { status?: number }).status === 404
      ) {
        console.warn(
          `[Puppetserver] Facts not found for node '${certname}' (404) - node may not have checked in yet`,
        );
        return null;
      }

      throw error;
    }
  }

  /**
   * Environment API: Get all environments
   *
   * Implements requirements 7.1, 7.2, 7.3, 7.4, 7.5:
   * - Queries Puppetserver environments API using correct endpoint
   * - Parses and returns environments data
   * - Handles empty environments list gracefully
   * - Provides detailed logging for debugging
   *
   * @returns List of environments
   */
  async getEnvironments(): Promise<unknown> {
    console.warn("[Puppetserver] getEnvironments() called", {
      endpoint: "/puppet/v3/environments",
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    try {
      const result = await this.get("/puppet/v3/environments");

      // Log successful response
      if (result === null) {
        console.warn(
          "[Puppetserver] getEnvironments() returned null - no environments configured",
          {
            endpoint: "/puppet/v3/environments",
          },
        );
      } else {
        console.warn("[Puppetserver] getEnvironments() response received", {
          resultType: Array.isArray(result) ? "array" : typeof result,
          arrayLength: Array.isArray(result) ? result.length : undefined,
          hasEnvironmentsProperty:
            result && typeof result === "object" && "environments" in result,
          environmentsCount:
            result &&
            typeof result === "object" &&
            "environments" in result &&
            Array.isArray((result as { environments?: unknown[] }).environments)
              ? (result as { environments: unknown[] }).environments.length
              : undefined,
          sampleKeys:
            result && typeof result === "object" && !Array.isArray(result)
              ? Object.keys(result).slice(0, 10)
              : undefined,
          sampleData:
            Array.isArray(result) && result.length > 0
              ? JSON.stringify(result[0]).substring(0, 200)
              : result &&
                  typeof result === "object" &&
                  "environments" in result &&
                  Array.isArray(
                    (result as { environments?: unknown[] }).environments,
                  ) &&
                  (result as { environments: unknown[] }).environments.length >
                    0
                ? JSON.stringify(
                    (result as { environments: unknown[] }).environments[0],
                  ).substring(0, 200)
                : undefined,
        });
      }

      return result;
    } catch (error) {
      // Log detailed error information
      console.error("[Puppetserver] getEnvironments() failed", {
        endpoint: "/puppet/v3/environments",
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorDetails:
          error instanceof PuppetserverError ? error.details : undefined,
      });

      // Handle 404 gracefully - no environments configured
      if (
        error instanceof PuppetserverError &&
        (error.details as { status?: number }).status === 404
      ) {
        console.warn(
          "[Puppetserver] Environments endpoint not found (404) - Puppetserver may not have environments configured or endpoint may not be available",
        );
        return null;
      }

      throw error;
    }
  }

  /**
   * Environment API: Get a specific environment
   *
   * @param name - Environment name
   * @returns Environment details
   */
  async getEnvironment(name: string): Promise<unknown> {
    return this.get(`/puppet/v3/environment/${name}`);
  }

  /**
   * Environment API: Deploy an environment
   *
   * @param name - Environment name
   * @returns Deployment result
   */
  async deployEnvironment(name: string): Promise<unknown> {
    return this.post(`/puppet-admin-api/v1/environment-cache`, {
      environment: name,
    });
  }

  /**
   * Generic GET request
   *
   * @param path - API path
   * @param params - Optional query parameters
   * @returns Response data
   */
  async get(path: string, params?: QueryParams): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.request("GET", url);
  }

  /**
   * Generic POST request
   *
   * @param path - API path
   * @param body - Request body
   * @returns Response data
   */
  async post(path: string, body?: unknown): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.request("POST", url, body);
  }

  /**
   * Generic PUT request
   *
   * @param path - API path
   * @param body - Request body
   * @returns Response data
   */
  async put(path: string, body?: unknown): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.request("PUT", url, body);
  }

  /**
   * Generic DELETE request
   *
   * @param path - API path
   * @returns Response data
   */
  async delete(path: string): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.request("DELETE", url);
  }

  /**
   * Build full URL with query parameters
   *
   * @param path - API path
   * @param params - Optional query parameters
   * @returns Complete URL
   */
  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Execute HTTP request with timeout, retry logic, and circuit breaker
   *
   * @param method - HTTP method
   * @param url - Full URL
   * @param body - Optional request body
   * @returns Response data
   */
  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    // Log request details
    console.warn(`[Puppetserver] ${method} ${url}`, {
      method,
      url,
      hasBody: !!body,
      bodyPreview: body ? JSON.stringify(body).substring(0, 200) : undefined,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
      timeout: this.timeout,
    });

    // Wrap the request in circuit breaker and retry logic
    return this.circuitBreaker.execute(async () => {
      return withRetry(async () => {
        try {
          const response = await this.fetchWithTimeout(method, url, body);
          return await this.handleResponse(response, url, method);
        } catch (error) {
          // Log detailed error information
          this.logError(error, method, url);

          // Transform and categorize error
          const transformedError = this.transformError(error, url, method);
          throw transformedError;
        }
      }, this.retryConfig);
    });
  }

  /**
   * Transform raw errors into typed Puppetserver errors
   *
   * @param error - Raw error
   * @param url - Request URL
   * @param method - HTTP method
   * @returns Typed Puppetserver error
   */
  private transformError(
    error: unknown,
    url: string,
    method: string,
  ): PuppetserverError {
    // If already a PuppetserverError, return as-is
    if (error instanceof PuppetserverError) {
      return error;
    }

    // Handle network errors
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        return new PuppetserverConnectionError(
          `Cannot connect to Puppetserver at ${this.baseUrl}. Is Puppetserver running?`,
          { error, url, method },
        );
      }

      if (
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("timeout")
      ) {
        return new PuppetserverTimeoutError(
          `Connection to Puppetserver timed out after ${String(this.timeout)}ms`,
          { error, url, method },
        );
      }

      if (error.message.includes("certificate")) {
        return new PuppetserverConnectionError(
          "SSL certificate validation failed. Check your SSL configuration.",
          { error, url, method },
        );
      }

      if (
        error.message.includes("ECONNRESET") ||
        error.message.includes("socket")
      ) {
        return new PuppetserverConnectionError(
          "Connection to Puppetserver was reset. The server may be overloaded or restarting.",
          { error, url, method },
        );
      }
    }

    return new PuppetserverConnectionError(
      "Failed to connect to Puppetserver",
      { error, url, method },
    );
  }

  /**
   * Categorize error type for logging and retry decisions
   *
   * @param error - Error to categorize
   * @returns Error category
   */
  private categorizeError(error: unknown): ErrorCategory {
    if (error instanceof PuppetserverAuthenticationError) {
      return "authentication";
    }

    if (error instanceof PuppetserverTimeoutError) {
      return "timeout";
    }

    if (error instanceof PuppetserverConnectionError) {
      return "connection";
    }

    if (error instanceof PuppetserverError) {
      // Check HTTP status code in details
      const details = error.details as { status?: number } | undefined;
      if (details?.status) {
        if (details.status >= 500) {
          return "server";
        }
        if (details.status >= 400) {
          return "client";
        }
      }
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("socket")
      ) {
        return "connection";
      }

      if (message.includes("timeout") || message.includes("etimedout")) {
        return "timeout";
      }

      if (
        message.includes("unauthorized") ||
        message.includes("forbidden") ||
        message.includes("authentication")
      ) {
        return "authentication";
      }
    }

    return "unknown";
  }

  /**
   * Check if an error should trigger a retry
   *
   * @param error - Error to check
   * @returns true if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Don't retry authentication errors
    if (error instanceof PuppetserverAuthenticationError) {
      return false;
    }

    // Retry connection errors
    if (error instanceof PuppetserverConnectionError) {
      return true;
    }

    // Retry timeout errors
    if (error instanceof PuppetserverTimeoutError) {
      return true;
    }

    // Check for retryable HTTP status codes
    if (error instanceof PuppetserverError) {
      const details = error.details as { status?: number } | undefined;
      if (details?.status) {
        // Retry 5xx server errors
        if (details.status >= 500) {
          return true;
        }
        // Retry 429 rate limit
        if (details.status === 429) {
          return true;
        }
        // Don't retry 4xx client errors (except 429)
        if (details.status >= 400) {
          return false;
        }
      }
    }

    // Check error message for retryable patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("socket")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Log detailed error information
   *
   * @param error - Error to log
   * @param method - HTTP method
   * @param url - Request URL
   */
  private logError(error: unknown, method: string, url: string): void {
    const category = this.categorizeError(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Extract additional details
    let statusCode: number | undefined;
    let responseBody: string | undefined;

    if (error instanceof PuppetserverError) {
      const details = error.details as
        | {
            status?: number;
            body?: string;
          }
        | undefined;
      statusCode = details?.status;
      responseBody = details?.body;
    }

    // Log error with all available information
    console.error(`[Puppetserver] ${category} error during ${method} ${url}:`, {
      message: errorMessage,
      category,
      statusCode,
      responseBody: responseBody ? responseBody.substring(0, 500) : undefined,
      endpoint: url,
      method,
    });
  }

  /**
   * Fetch with timeout support
   *
   * @param method - HTTP method
   * @param url - URL to fetch
   * @param body - Optional request body
   * @returns Response
   */
  private async fetchWithTimeout(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      // Add authentication token if provided (token-based auth)
      if (this.token) {
        headers["X-Authentication"] = this.token;
      }

      // Log request headers (without sensitive data)
      console.warn(`[Puppetserver] Request headers for ${method} ${url}`, {
        Accept: headers.Accept,
        "Content-Type": headers["Content-Type"],
        hasAuthToken: !!headers["X-Authentication"],
        authTokenLength: headers["X-Authentication"]
          ? headers["X-Authentication"].length
          : undefined,
      });

      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        agent: this.httpsAgent,
      };

      // eslint-disable-next-line prefer-const
      let timeoutId: NodeJS.Timeout | undefined;

      const req = https.request(options, (res) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on("end", () => {
          // Create a Response-like object with proper headers interface
          const headersMap = new Map<string, string>();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) {
              headersMap.set(
                key.toLowerCase(),
                Array.isArray(value) ? value[0] : value,
              );
            }
          }

          const response = {
            ok: res.statusCode
              ? res.statusCode >= 200 && res.statusCode < 300
              : false,
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? "Unknown",
            headers: {
              get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
              has: (name: string) => headersMap.has(name.toLowerCase()),
              forEach: (callback: (value: string, key: string) => void) => {
                headersMap.forEach((value, key) => {
                  callback(value, key);
                });
              },
            },
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data) as unknown),
          } as unknown as Response;

          resolve(response);
        });
      });

      req.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });

      // Set up timeout after request is created
      timeoutId = setTimeout(() => {
        req.destroy();
        reject(new Error(`Request timeout after ${String(this.timeout)}ms`));
      }, this.timeout);

      // Write request body if provided
      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Handle HTTP response
   *
   * @param response - HTTP response
   * @param url - Request URL (for error logging)
   * @param method - HTTP method (for error logging)
   * @returns Parsed response data
   */
  private async handleResponse(
    response: Response,
    url: string,
    method: string,
  ): Promise<unknown> {
    // Log response status
    console.warn(`[Puppetserver] Response ${method} ${url}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      },
    });

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text();
      console.error(
        `[Puppetserver] Authentication error (${String(response.status)}) for ${method} ${url}:`,
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText.substring(0, 500),
        },
      );
      throw new PuppetserverAuthenticationError(
        "Authentication failed. Check your Puppetserver token or certificate configuration.",
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          url,
          method,
        },
      );
    }

    // Handle not found
    if (response.status === 404) {
      console.warn(
        `[Puppetserver] Resource not found (404) for ${method} ${url}`,
      );
      return null;
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Puppetserver] HTTP error (${String(response.status)}) for ${method} ${url}:`,
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText.substring(0, 500),
        },
      );
      throw new PuppetserverError(
        `Puppetserver API error: ${response.statusText}`,
        `HTTP_${String(response.status)}`,
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          url,
          method,
        },
      );
    }

    // Check content type to determine how to parse response
    const contentType = response.headers.get("content-type") ?? "";

    // Handle text responses (like /status/v1/simple)
    if (contentType.includes("text/plain") || url.includes("/status/v1/simple")) {
      const text = await response.text();

      console.warn(
        `[Puppetserver] Successfully parsed text response for ${method} ${url}`,
        {
          dataType: "text",
          responseText: text.substring(0, 100),
        },
      );

      return text;
    }

    // Parse JSON response for other endpoints
    try {
      const data = await response.json();

      // Log successful response data summary
      console.warn(
        `[Puppetserver] Successfully parsed JSON response for ${method} ${url}`,
        {
          dataType: Array.isArray(data) ? "array" : typeof data,
          arrayLength: Array.isArray(data) ? data.length : undefined,
          objectKeys:
            data && typeof data === "object" && !Array.isArray(data)
              ? Object.keys(data).slice(0, 10)
              : undefined,
        },
      );

      return data;
    } catch (error) {
      // Fallback: try to get as text if JSON parsing fails
      try {
        const text = await response.text();
        if (!text || text.trim() === "") {
          console.warn(
            `[Puppetserver] Empty response for ${method} ${url}, returning null`,
          );
          return null;
        }

        console.warn(
          `[Puppetserver] JSON parsing failed, returning as text for ${method} ${url}`,
          {
            responseText: text.substring(0, 100),
          },
        );

        return text;
      } catch (textError) {
        console.error(
          `[Puppetserver] Failed to parse response for ${method} ${url}:`,
          {
            jsonError: error instanceof Error ? error.message : String(error),
            textError: textError instanceof Error ? textError.message : String(textError),
          },
        );
        throw new PuppetserverError(
          "Failed to parse Puppetserver response",
          "PARSE_ERROR",
          { error, url, method },
        );
      }
    }
  }

  /**
   * Status API: Get services status
   *
   * Queries /status/v1/services endpoint to get status of all Puppetserver services.
   * This endpoint provides detailed information about each service's state.
   *
   * @returns Services status information
   */
  async getServicesStatus(): Promise<unknown> {
    console.warn("[Puppetserver] getServicesStatus() called", {
      endpoint: "/status/v1/services",
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    try {
      const result = await this.get("/status/v1/services");

      console.warn("[Puppetserver] getServicesStatus() response received", {
        resultType: typeof result,
        hasServices:
          result && typeof result === "object" && Object.keys(result).length > 0,
        serviceCount:
          result && typeof result === "object"
            ? Object.keys(result).length
            : undefined,
        sampleKeys:
          result && typeof result === "object"
            ? Object.keys(result).slice(0, 5)
            : undefined,
      });

      return result;
    } catch (error) {
      console.error("[Puppetserver] getServicesStatus() failed", {
        endpoint: "/status/v1/services",
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }
  }

  /**
   * Status API: Get simple status
   *
   * Queries /status/v1/simple endpoint to get a simple running/error status.
   * This is a lightweight endpoint for basic health checks.
   *
   * @returns Simple status (typically "running" or error message)
   */
  async getSimpleStatus(): Promise<unknown> {
    console.warn("[Puppetserver] getSimpleStatus() called", {
      endpoint: "/status/v1/simple",
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    try {
      const result = await this.get("/status/v1/simple");

      console.warn("[Puppetserver] getSimpleStatus() response received", {
        resultType: typeof result,
        result: result,
      });

      return result;
    } catch (error) {
      console.error("[Puppetserver] getSimpleStatus() failed", {
        endpoint: "/status/v1/simple",
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }
  }

  /**
   * Admin API: Get admin API information
   *
   * Queries /puppet-admin-api/v1 endpoint to get information about the admin API.
   * This endpoint provides metadata about available admin operations.
   *
   * @returns Admin API information
   */
  async getAdminApiInfo(): Promise<unknown> {
    console.warn("[Puppetserver] getAdminApiInfo() called", {
      endpoint: "/puppet-admin-api/v1",
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
    });

    try {
      const result = await this.get("/puppet-admin-api/v1");

      console.warn("[Puppetserver] getAdminApiInfo() response received", {
        resultType: typeof result,
        hasInfo: result && typeof result === "object",
        sampleKeys:
          result && typeof result === "object"
            ? Object.keys(result).slice(0, 10)
            : undefined,
      });

      return result;
    } catch (error) {
      console.error("[Puppetserver] getAdminApiInfo() failed", {
        endpoint: "/puppet-admin-api/v1",
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }
  }

  /**
   * Metrics API: Get metrics via Jolokia
   *
   * Queries /metrics/v2 endpoint (via Jolokia) to get JMX metrics.
   * WARNING: This endpoint can be resource-intensive on the Puppetserver.
   * Use sparingly and consider caching results.
   *
   * @param mbean - Optional MBean name to query specific metrics
   * @returns Metrics data
   */
  async getMetrics(mbean?: string): Promise<unknown> {
    console.warn("[Puppetserver] getMetrics() called", {
      endpoint: "/metrics/v2",
      mbean,
      baseUrl: this.baseUrl,
      hasToken: !!this.token,
      hasCertAuth: !!this.httpsAgent,
      warning: "This endpoint can be resource-intensive",
    });

    try {
      // If no specific mbean is requested, get common system metrics
      if (!mbean) {
        // Request multiple common MBeans for comprehensive metrics
        const commonMBeans = [
          "java.lang:type=Memory",
          "java.lang:type=Threading",
          "java.lang:type=Runtime",
          "java.lang:type=OperatingSystem",
          "java.lang:type=GarbageCollector,name=*",
          "puppetlabs.puppetserver:*"
        ];

        const metricsData: Record<string, unknown> = {};

        for (const mbeanPattern of commonMBeans) {
          try {
            const params: QueryParams = { mbean: mbeanPattern };
            const result = await this.get("/metrics/v2", params);
            metricsData[mbeanPattern] = result;
          } catch (error) {
            console.warn(`[Puppetserver] Failed to get metrics for ${mbeanPattern}:`, error);
            metricsData[mbeanPattern] = { error: error instanceof Error ? error.message : String(error) };
          }
        }

        console.warn("[Puppetserver] getMetrics() comprehensive response received", {
          mbeanCount: Object.keys(metricsData).length,
          mbeans: Object.keys(metricsData),
        });

        return metricsData;
      } else {
        // Request specific mbean
        const params: QueryParams = { mbean };
        const result = await this.get("/metrics/v2", params);

        console.warn("[Puppetserver] getMetrics() response received", {
          resultType: typeof result,
          mbean,
          hasMetrics: result && typeof result === "object",
          sampleKeys:
            result && typeof result === "object"
              ? Object.keys(result).slice(0, 10)
              : undefined,
        });

        return result;
      }
    } catch (error) {
      console.error("[Puppetserver] getMetrics() failed", {
        endpoint: "/metrics/v2",
        mbean,
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }
  }

  /**
   * Get the base URL
   *
   * @returns Base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if token authentication is configured
   *
   * @returns true if token is configured
   */
  hasTokenAuthentication(): boolean {
    return !!this.token;
  }

  /**
   * Check if certificate authentication is configured
   *
   * @returns true if client certificate is configured
   */
  hasCertificateAuthentication(): boolean {
    return !!this.httpsAgent;
  }

  /**
   * Check if SSL is configured
   *
   * @returns true if HTTPS agent is configured
   */
  hasSSL(): boolean {
    return !!this.httpsAgent;
  }

  /**
   * Get circuit breaker instance
   *
   * @returns Circuit breaker
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get retry configuration
   *
   * @returns Retry configuration
   */
  getRetryConfig(): RetryConfig {
    return this.retryConfig;
  }

  /**
   * Update retry configuration
   *
   * @param config - New retry configuration
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = {
      ...this.retryConfig,
      ...config,
    };
  }
}
