/**
 * Proxmox API Client
 *
 * Low-level HTTP client for communicating with the Proxmox VE API.
 * Handles authentication, request/response transformation, and error handling.
 */

import * as https from "https";
import * as fs from "fs";
import type { LoggerService } from "../../services/LoggerService";
import type {
  ProxmoxConfig,
  ProxmoxSSLConfig,
  ProxmoxTaskStatus,
  RetryConfig,
} from "./types";
import {
  ProxmoxError,
  ProxmoxAuthenticationError,
} from "./types";

/**
 * ProxmoxClient - HTTP client for Proxmox VE API
 *
 * Responsibilities:
 * - Manage authentication (ticket-based and token-based)
 * - Execute HTTP requests with proper headers
 * - Handle authentication ticket refresh
 * - Configure HTTPS agent with SSL options
 * - Transform HTTP errors into domain-specific exceptions
 */
export class ProxmoxClient {
  private baseUrl: string;
  private config: ProxmoxConfig;
  private logger: LoggerService;
  private ticket?: string;
  private csrfToken?: string;
  private httpsAgent?: https.Agent;
  private retryConfig: RetryConfig;

  /**
   * Create a new ProxmoxClient instance
   *
   * @param config - Proxmox configuration
   * @param logger - Logger service instance
   */
  constructor(config: ProxmoxConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
    this.baseUrl = `https://${config.host}:${String(config.port ?? 8006)}`;

    // Configure HTTPS agent
    if (config.ssl) {
      this.httpsAgent = this.createHttpsAgent(config.ssl);
    }

    // Configure retry logic
    this.retryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"],
    };

    this.logger.debug("ProxmoxClient initialized", {
      component: "ProxmoxClient",
      operation: "constructor",
      metadata: { host: config.host, port: config.port ?? 8006 },
    });
  }

  /**
   * Authenticate with the Proxmox API
   *
   * For token authentication: stores the token for use in Authorization header
   * For password authentication: fetches and stores authentication ticket and CSRF token
   *
   * @throws {ProxmoxAuthenticationError} If authentication fails
   */
  async authenticate(): Promise<void> {
    if (this.config.token) {
      // Token authentication - no need to fetch ticket
      this.logger.info("Using token authentication", {
        component: "ProxmoxClient",
        operation: "authenticate",
      });
      return;
    }

    // Password authentication - fetch ticket
    const endpoint = "/api2/json/access/ticket";
    const params = {
      username: `${this.config.username ?? ""}@${this.config.realm ?? ""}`,
      password: this.config.password,
    };

    try {
      this.logger.debug("Authenticating with password", {
        component: "ProxmoxClient",
        operation: "authenticate",
        metadata: {
          username: this.config.username,
          realm: this.config.realm,
        },
      });

      const response = (await this.request(
        "POST",
        endpoint,
        params,
        false
      )) as { ticket: string; CSRFPreventionToken: string };
      this.ticket = response.ticket;
      this.csrfToken = response.CSRFPreventionToken;

      this.logger.info("Authentication successful", {
        component: "ProxmoxClient",
        operation: "authenticate",
      });
    } catch (error) {
      this.logger.error(
        "Failed to authenticate with Proxmox API",
        {
          component: "ProxmoxClient",
          operation: "authenticate",
        },
        error instanceof Error ? error : undefined
      );

      throw new ProxmoxAuthenticationError(
        "Failed to authenticate with Proxmox API",
        error
      );
    }
  }

  /**
   * Execute a GET request
   *
   * @param endpoint - API endpoint path
   * @returns Response data
   */
  async get(endpoint: string): Promise<unknown> {
    return await this.requestWithRetry("GET", endpoint);
  }

  /**
   * Execute a POST request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @returns Task ID (UPID) for async operations
   */
  async post(endpoint: string, data: unknown): Promise<string> {
    const response = await this.requestWithRetry("POST", endpoint, data);
    // Proxmox returns task ID (UPID) for async operations
    return response as string;
  }

  /**
   * Execute a DELETE request
   *
   * @param endpoint - API endpoint path
   * @returns Task ID (UPID) for async operations
   */
  async delete(endpoint: string): Promise<string> {
    const response = await this.requestWithRetry("DELETE", endpoint);
    return response as string;
  }

  /**
   * Wait for a Proxmox task to complete
   *
   * Polls the task status endpoint until the task completes or times out.
   *
   * @param node - Node name where the task is running
   * @param taskId - Task ID (UPID)
   * @param timeout - Timeout in milliseconds (default: 300000 = 5 minutes)
   * @throws {ProxmoxError} If task fails or times out
   */
  async waitForTask(
    node: string,
    taskId: string,
    timeout = 300000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    this.logger.debug("Waiting for task to complete", {
      component: "ProxmoxClient",
      operation: "waitForTask",
      metadata: { node, taskId, timeout },
    });

    while (Date.now() - startTime < timeout) {
      const endpoint = `/api2/json/nodes/${node}/tasks/${taskId}/status`;
      const status = (await this.get(endpoint)) as ProxmoxTaskStatus;

      if (status.status === "stopped") {
        if (status.exitstatus === "OK") {
          this.logger.info("Task completed successfully", {
            component: "ProxmoxClient",
            operation: "waitForTask",
            metadata: { node, taskId },
          });
          return;
        } else {
          this.logger.error("Task failed", {
            component: "ProxmoxClient",
            operation: "waitForTask",
            metadata: { node, taskId, exitstatus: status.exitstatus },
          });

          throw new ProxmoxError(
            `Task failed: ${status.exitstatus ?? "unknown"}`,
            "TASK_FAILED",
            status
          );
        }
      }

      await this.sleep(pollInterval);
    }

    this.logger.error("Task timeout", {
      component: "ProxmoxClient",
      operation: "waitForTask",
      metadata: { node, taskId, timeout },
    });

    throw new ProxmoxError(
      `Task timeout after ${String(timeout)}ms`,
      "TASK_TIMEOUT",
      { taskId, node }
    );
  }

  /**
   * Execute a request with retry logic
   *
   * @param method - HTTP method
   * @param endpoint - API endpoint path
   * @param data - Optional request body data
   * @returns Response data
   */
  private async requestWithRetry(
    method: string,
    endpoint: string,
    data?: unknown
  ): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await this.request(method, endpoint, data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry authentication errors
        if (error instanceof ProxmoxAuthenticationError) {
          throw error;
        }

        // Don't retry 4xx errors except 429
        if (error instanceof ProxmoxError && error.code.startsWith("HTTP_4")) {
          if (error.code !== "HTTP_429") {
            throw error;
          }
          // Handle rate limiting
          const details = error.details as { retryAfter?: number } | undefined;
          const retryAfter = details?.retryAfter ?? 5000;
          await this.sleep(retryAfter);
          continue;
        }

        // Check if error is retryable
        const isRetryable = this.retryConfig.retryableErrors.some((errCode) =>
          lastError?.message.includes(errCode)
        );

        if (!isRetryable || attempt === this.retryConfig.maxAttempts) {
          throw error;
        }

        // Calculate backoff delay
        const delay = Math.min(
          this.retryConfig.initialDelay *
            Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        this.logger.warn(
          `Request failed, retrying (attempt ${String(attempt)}/${String(this.retryConfig.maxAttempts)})`,
          {
            component: "ProxmoxClient",
            operation: "requestWithRetry",
            metadata: { endpoint, attempt, delay },
          }
        );

        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  /**
   * Execute an HTTP request
   *
   * @param method - HTTP method
   * @param endpoint - API endpoint path
   * @param data - Optional request body data
   * @param useAuth - Whether to include authentication (default: true)
   * @returns Response data
   */
  private async request(
    method: string,
    endpoint: string,
    data?: unknown,
    useAuth = true
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authentication
    if (useAuth) {
      if (this.config.token) {
        headers.Authorization = `PVEAPIToken=${this.config.token}`;
      } else if (this.ticket) {
        headers.Cookie = `PVEAuthCookie=${this.ticket}`;
        if (method !== "GET" && this.csrfToken) {
          headers.CSRFPreventionToken = this.csrfToken;
        }
      }
    }

    try {
      const response = await this.fetchWithTimeout(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        agent: this.httpsAgent,
      });

      return await this.handleResponse(response);
    } catch (error) {
      // Handle ticket expiration
      if (error instanceof ProxmoxAuthenticationError && this.ticket) {
        this.logger.info("Authentication ticket expired, re-authenticating", {
          component: "ProxmoxClient",
          operation: "request",
        });
        await this.authenticate();
        // Retry request with new ticket
        return await this.request(method, endpoint, data, useAuth);
      }
      throw error;
    }
  }

  /**
   * Handle HTTP response
   *
   * @param response - Fetch response object
   * @returns Response data
   * @throws {ProxmoxError} For HTTP errors
   * @throws {ProxmoxAuthenticationError} For authentication errors
   */
  private async handleResponse(response: Response): Promise<unknown> {
    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new ProxmoxAuthenticationError("Authentication failed", {
        status: response.status,
      });
    }

    // Handle not found
    if (response.status === 404) {
      throw new ProxmoxError("Resource not found", "HTTP_404", {
        status: response.status,
      });
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new ProxmoxError(
        `Proxmox API error: ${response.statusText}`,
        `HTTP_${String(response.status)}`,
        {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        }
      );
    }

    // Parse JSON response
    const json = (await response.json()) as { data: unknown };
    return json.data; // Proxmox wraps responses in {data: ...}
  }

  /**
   * Create HTTPS agent with SSL configuration
   *
   * @param sslConfig - SSL configuration
   * @returns HTTPS agent
   */
  private createHttpsAgent(sslConfig: ProxmoxSSLConfig): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: sslConfig.rejectUnauthorized ?? true,
    };

    if (sslConfig.ca) {
      agentOptions.ca = fs.readFileSync(sslConfig.ca);
    }

    if (sslConfig.cert) {
      agentOptions.cert = fs.readFileSync(sslConfig.cert);
    }

    if (sslConfig.key) {
      agentOptions.key = fs.readFileSync(sslConfig.key);
    }

    this.logger.debug("Created HTTPS agent", {
      component: "ProxmoxClient",
      operation: "createHttpsAgent",
      metadata: {
        rejectUnauthorized: agentOptions.rejectUnauthorized,
        hasCa: !!sslConfig.ca,
        hasCert: !!sslConfig.cert,
        hasKey: !!sslConfig.key,
      },
    });

    return new https.Agent(agentOptions);
  }

  /**
   * Fetch with timeout
   *
   * @param url - Request URL
   * @param options - Fetch options with agent
   * @param timeout - Timeout in milliseconds (default: 30000)
   * @returns Fetch response
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit & { agent?: https.Agent },
    timeout = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep for a specified duration
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
