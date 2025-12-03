/**
 * Puppetserver Client
 *
 * Low-level HTTP client for Puppetserver API communication.
 * Handles SSL configuration, authentication, and request/response processing.
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

/**
 * Query parameters for Puppetserver API requests
 */
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Low-level HTTP client for Puppetserver API
 *
 * Provides methods for interacting with Puppetserver endpoints with:
 * - SSL/TLS support with custom certificates
 * - Token-based and certificate-based authentication
 * - Request/response handling
 * - Error handling and logging
 * - Timeout and connection management
 */
export class PuppetserverClient {
  private baseUrl: string;
  private token?: string;
  private httpsAgent?: https.Agent;
  private timeout: number;

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
    return this.get(`/puppet-ca/v1/certificate_status/${certname}`);
  }

  /**
   * Certificate API: Sign a certificate request
   *
   * @param certname - Certificate name to sign
   * @returns Sign operation result
   */
  async signCertificate(certname: string): Promise<unknown> {
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
   * Execute HTTP request with timeout and error handling
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
    try {
      const response = await this.fetchWithTimeout(method, url, body);
      return await this.handleResponse(response, url, method);
    } catch (error) {
      if (error instanceof PuppetserverError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        if (error.message.includes("ECONNREFUSED")) {
          throw new PuppetserverConnectionError(
            `Cannot connect to Puppetserver at ${this.baseUrl}. Is Puppetserver running?`,
            error,
          );
        }

        if (
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("timeout")
        ) {
          throw new PuppetserverTimeoutError(
            `Connection to Puppetserver timed out after ${String(this.timeout)}ms`,
            error,
          );
        }

        if (error.message.includes("certificate")) {
          throw new PuppetserverConnectionError(
            "SSL certificate validation failed. Check your SSL configuration.",
            error,
          );
        }
      }

      throw new PuppetserverConnectionError(
        "Failed to connect to Puppetserver",
        error,
      );
    }
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
      throw new PuppetserverAuthenticationError(
        "Authentication failed. Check your Puppetserver token or certificate configuration.",
        {
          status: response.status,
          statusText: response.statusText,
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
      throw new PuppetserverError(
        "Failed to parse Puppetserver response as JSON",
        "PARSE_ERROR",
        { error, responseText: text },
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
}
