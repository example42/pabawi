/**
 * PuppetDB Client
 *
 * Low-level HTTP client for PuppetDB API communication.
 * Handles SSL configuration, authentication, and request/response processing.
 */

import https from "https";
import fs from "fs";
import type { PuppetDBConfig } from "../../config/schema";

/**
 * Query parameters for PuppetDB API requests
 */
export interface QueryParams {
  query?: string;
  limit?: number;
  offset?: number;
  order_by?: string;
  include_total?: boolean;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Configuration for PuppetDB client
 */
export interface PuppetDBClientConfig {
  serverUrl: string;
  port?: number;
  token?: string;
  ssl?: {
    enabled: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  timeout?: number;
}

/**
 * PuppetDB API error
 */
export class PuppetDBError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PuppetDBError";
  }
}

/**
 * PuppetDB connection error
 */
export class PuppetDBConnectionError extends PuppetDBError {
  constructor(message: string, details?: unknown) {
    super(message, "PUPPETDB_CONNECTION_ERROR", details);
    this.name = "PuppetDBConnectionError";
  }
}

/**
 * PuppetDB query error
 */
export class PuppetDBQueryError extends PuppetDBError {
  constructor(message: string, public query: string, details?: unknown) {
    super(message, "PUPPETDB_QUERY_ERROR", details);
    this.name = "PuppetDBQueryError";
  }
}

/**
 * PuppetDB authentication error
 */
export class PuppetDBAuthenticationError extends PuppetDBError {
  constructor(message: string, details?: unknown) {
    super(message, "PUPPETDB_AUTH_ERROR", details);
    this.name = "PuppetDBAuthenticationError";
  }
}

/**
 * Low-level HTTP client for PuppetDB API
 *
 * Provides methods for querying PuppetDB endpoints with:
 * - SSL/TLS support with custom certificates
 * - Token-based authentication
 * - Request/response handling
 * - Error handling and logging
 */
export class PuppetDBClient {
  private baseUrl: string;
  private token?: string;
  private httpsAgent?: https.Agent;
  private timeout: number;

  /**
   * Create a new PuppetDB client
   *
   * @param config - Client configuration
   */
  constructor(config: PuppetDBClientConfig) {
    // Parse and validate server URL
    const url = new URL(config.serverUrl);
    const port = config.port ?? (url.protocol === "https:" ? 8081 : 8080);

    this.baseUrl = `${url.protocol}//${url.hostname}:${String(port)}`;
    this.token = config.token;
    this.timeout = config.timeout ?? 30000;

    // Configure HTTPS agent if SSL is enabled
    if (config.ssl?.enabled) {
      this.httpsAgent = this.createHttpsAgent(config.ssl);
    }
  }

  /**
   * Create HTTPS agent with SSL configuration
   *
   * @param sslConfig - SSL configuration
   * @returns Configured HTTPS agent
   */
  private createHttpsAgent(sslConfig: NonNullable<PuppetDBClientConfig["ssl"]>): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: sslConfig.rejectUnauthorized ?? true,
    };

    // Load CA certificate if provided
    if (sslConfig.ca) {
      try {
        agentOptions.ca = fs.readFileSync(sslConfig.ca);
      } catch (error) {
        throw new PuppetDBConnectionError(
          `Failed to load CA certificate from ${sslConfig.ca}`,
          error,
        );
      }
    }

    // Load client certificate if provided
    if (sslConfig.cert) {
      try {
        agentOptions.cert = fs.readFileSync(sslConfig.cert);
      } catch (error) {
        throw new PuppetDBConnectionError(
          `Failed to load client certificate from ${sslConfig.cert}`,
          error,
        );
      }
    }

    // Load client key if provided
    if (sslConfig.key) {
      try {
        agentOptions.key = fs.readFileSync(sslConfig.key);
      } catch (error) {
        throw new PuppetDBConnectionError(
          `Failed to load client key from ${sslConfig.key}`,
          error,
        );
      }
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Query a PuppetDB endpoint
   *
   * @param endpoint - API endpoint (e.g., 'pdb/query/v4/nodes')
   * @param pql - Optional PQL query string
   * @param params - Optional query parameters
   * @returns Query results
   */
  async query(
    endpoint: string,
    pql?: string,
    params?: QueryParams,
  ): Promise<unknown> {
    const url = this.buildQueryUrl(endpoint, pql, params);

    try {
      const response = await this.fetchWithTimeout(url);
      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof PuppetDBError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        if (error.message.includes("ECONNREFUSED")) {
          throw new PuppetDBConnectionError(
            `Cannot connect to PuppetDB at ${this.baseUrl}. Is PuppetDB running?`,
            error,
          );
        }

        if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
          throw new PuppetDBConnectionError(
            `Connection to PuppetDB timed out after ${String(this.timeout)}ms`,
            error,
          );
        }

        if (error.message.includes("certificate")) {
          throw new PuppetDBConnectionError(
            "SSL certificate validation failed. Check your SSL configuration.",
            error,
          );
        }
      }

      throw new PuppetDBConnectionError(
        "Failed to query PuppetDB",
        error,
      );
    }
  }

  /**
   * GET request to a PuppetDB path
   *
   * @param path - API path (e.g., '/pdb/query/v4/nodes/node1.example.com')
   * @returns Response data
   */
  async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await this.fetchWithTimeout(url);
      return await this.handleResponse(response);
    } catch (error) {
      if (error instanceof PuppetDBError) {
        throw error;
      }

      throw new PuppetDBConnectionError(
        `Failed to GET ${path}`,
        error,
      );
    }
  }

  /**
   * Build query URL with PQL and parameters
   *
   * @param endpoint - API endpoint
   * @param pql - Optional PQL query
   * @param params - Optional query parameters
   * @returns Complete URL
   */
  private buildQueryUrl(
    endpoint: string,
    pql?: string,
    params?: QueryParams,
  ): string {
    const url = new URL(`${this.baseUrl}/${endpoint}`);

    // Add PQL query if provided
    if (pql) {
      url.searchParams.set("query", pql);
    }

    // Add additional parameters
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
   * Fetch with timeout support
   *
   * @param url - URL to fetch
   * @returns Response
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => { controller.abort(); }, this.timeout);

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
      };

      // Add authentication token if provided
      if (this.token) {
        headers["X-Authentication"] = this.token;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        // @ts-expect-error - Node.js fetch supports agent option
        agent: this.httpsAgent,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle HTTP response
   *
   * @param response - HTTP response
   * @returns Parsed response data
   */
  private async handleResponse(response: Response): Promise<unknown> {
    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new PuppetDBAuthenticationError(
        "Authentication failed. Check your PuppetDB token.",
        {
          status: response.status,
          statusText: response.statusText,
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
      throw new PuppetDBError(
        `PuppetDB API error: ${response.statusText}`,
        `HTTP_${String(response.status)}`,
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        },
      );
    }

    // Parse JSON response
    try {
      const data = await response.json();
      return data;
    } catch (error) {
      throw new PuppetDBError(
        "Failed to parse PuppetDB response as JSON",
        "PARSE_ERROR",
        error,
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
   * Check if authentication is configured
   *
   * @returns true if token is configured
   */
  hasAuthentication(): boolean {
    return !!this.token;
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

/**
 * Create a PuppetDB client from application config
 *
 * @param config - PuppetDB configuration
 * @returns Configured client
 */
export function createPuppetDBClient(config: PuppetDBConfig): PuppetDBClient {
  return new PuppetDBClient({
    serverUrl: config.serverUrl,
    port: config.port,
    token: config.token,
    ssl: config.ssl,
    timeout: config.timeout,
  });
}
