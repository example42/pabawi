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

    // Initialize retry configuration
    this.retryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      shouldRetry: (error: unknown): boolean => this.isRetryableError(error),
      onRetry: (attempt, delay, error): void => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const category = this.categorizeError(error);
        console.warn(
          `[Puppetserver] Retry attempt ${String(attempt)} after ${String(delay)}ms due to ${category} error: ${errorMessage}`,
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
   * Certificate API: Get all certificates with optional status filter
   *
   * @param state - Optional certificate state filter ('signed', 'requested', 'revoked')
   * @returns Certificate list
   */
  async getCertificates(
    state?: "signed" | "requested" | "revoked",
  ): Promise<unknown> {
    const params: QueryParams = {};
    if (state) {
      params.state = state;
    }
    return this.get("/puppet-ca/v1/certificate_statuses", params);
  }

  /**
   * Certificate API: Get a specific certificate
   *
   * @param certname - Certificate name
   * @returns Certificate details
   */
  async getCertificate(certname: string): Promise<unknown> {
    if (!certname || certname.trim() === "") {
      throw new PuppetserverError(
        "Certificate name is required",
        "INVALID_CERTNAME",
        { certname },
      );
    }
    return this.get(`/puppet-ca/v1/certificate_status/${certname}`);
  }

  /**
   * Certificate API: Sign a certificate request
   *
   * @param certname - Certificate name to sign
   * @returns Sign operation result
   */
  async signCertificate(certname: string): Promise<unknown> {
    if (!certname || certname.trim() === "") {
      throw new PuppetserverError(
        "Certificate name is required",
        "INVALID_CERTNAME",
        { certname },
      );
    }
    return this.put(`/puppet-ca/v1/certificate_status/${certname}`, {
      desired_state: "signed",
    });
  }

  /**
   * Certificate API: Revoke a certificate
   *
   * @param certname - Certificate name to revoke
   * @returns Revoke operation result
   */
  async revokeCertificate(certname: string): Promise<unknown> {
    if (!certname || certname.trim() === "") {
      throw new PuppetserverError(
        "Certificate name is required",
        "INVALID_CERTNAME",
        { certname },
      );
    }
    return this.put(`/puppet-ca/v1/certificate_status/${certname}`, {
      desired_state: "revoked",
    });
  }

  /**
   * Status API: Get node status
   *
   * @param certname - Node certname
   * @returns Node status
   */
  async getStatus(certname: string): Promise<unknown> {
    return this.get(`/puppet/v3/status/${certname}`);
  }

  /**
   * Catalog API: Compile a catalog for a node in a specific environment
   *
   * @param certname - Node certname
   * @param environment - Environment name
   * @returns Compiled catalog
   */
  async compileCatalog(
    certname: string,
    environment: string,
  ): Promise<unknown> {
    return this.post(`/puppet/v3/catalog/${certname}`, {
      environment,
    });
  }

  /**
   * Facts API: Get facts for a node
   *
   * @param certname - Node certname
   * @returns Node facts
   */
  async getFacts(certname: string): Promise<unknown> {
    return this.get(`/puppet/v3/facts/${certname}`);
  }

  /**
   * Environment API: Get all environments
   *
   * @returns List of environments
   */
  async getEnvironments(): Promise<unknown> {
    return this.get("/puppet/v3/environments");
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

      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        agent: this.httpsAgent,
      };

      const timeoutId = setTimeout(() => {
        req.destroy();
        reject(new Error(`Request timeout after ${String(this.timeout)}ms`));
      }, this.timeout);

      const req = https.request(options, (res) => {
        clearTimeout(timeoutId);

        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on("end", () => {
          // Create a Response-like object
          const response = {
            ok: res.statusCode
              ? res.statusCode >= 200 && res.statusCode < 300
              : false,
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? "Unknown",
            headers: res.headers,
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data) as unknown),
          } as unknown as Response;

          resolve(response);
        });
      });

      req.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

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

    // Parse JSON response
    try {
      const data = await response.json();
      return data;
    } catch (error) {
      // If response is empty or not JSON, return null
      const text = await response.text();
      if (!text || text.trim() === "") {
        return null;
      }
      console.error(
        `[Puppetserver] Failed to parse response for ${method} ${url}:`,
        {
          error: error instanceof Error ? error.message : String(error),
          responseText: text.substring(0, 500),
        },
      );
      throw new PuppetserverError(
        "Failed to parse Puppetserver response as JSON",
        "PARSE_ERROR",
        { error, responseText: text, url, method },
      );
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
