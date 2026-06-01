/**
 * Checkmk REST API Client
 *
 * HTTP client layer for communicating with the Checkmk REST API v1.
 * Handles authentication, request/response transformation, and error handling.
 * Never exposes the password in logs or error messages.
 */

import * as https from "node:https";
import * as http from "node:http";

import type { LoggerService } from "../../services/LoggerService";
import type { CheckmkConfig, CheckmkHost, CheckmkServiceStatus } from "./types";

/** Default request timeout in milliseconds (Requirement 12.2) */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Connection test timeout in milliseconds */
const TEST_CONNECTION_TIMEOUT_MS = 10_000;

/** Service columns required for the services endpoint */
const SERVICE_COLUMNS = [
  "description",
  "state",
  "state_type",
  "plugin_output",
  "last_check",
  "last_state",
  "last_state_change",
] as const;

export class CheckmkService {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly httpsAgent?: https.Agent;
  private readonly logger: LoggerService;
  private readonly config: CheckmkConfig;
  private readonly passwordPattern: RegExp | null;

  constructor(config: CheckmkConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;

    // Build base URL: {serverUrl}[/{site}]/check_mk/api/1.0
    this.baseUrl = config.site
      ? `${config.serverUrl}/${config.site}/check_mk/api/1.0`
      : `${config.serverUrl}/check_mk/api/1.0`;

    // Build auth header: Bearer {username} {password}
    this.authHeader = `Bearer ${config.username} ${config.password}`; // pragma: allowlist secret

    // Configure HTTPS agent only for https:// URLs
    const isHttps = config.serverUrl.startsWith("https://");
    if (isHttps) {
      this.httpsAgent = new https.Agent({
        keepAlive: true,
        rejectUnauthorized: config.sslVerify,
      });
    }

    // Build password pattern for sanitization (never log the password)
    this.passwordPattern = config.password ? new RegExp(
      config.password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    ) : null;

    // Log warning if SSL verification is disabled
    if (!config.sslVerify) {
      this.logger.warn(
        "Checkmk TLS certificate verification is disabled (sslVerify=false). " +
          "This exposes connections to man-in-the-middle attacks.",
        {
          component: "CheckmkService",
          integration: "checkmk",
          operation: "constructor",
          metadata: { serverUrl: config.serverUrl },
        },
      );
    }

    this.logger.debug("CheckmkService initialized", {
      component: "CheckmkService",
      integration: "checkmk",
      operation: "constructor",
      metadata: { serverUrl: config.serverUrl, site: config.site ?? "(none)" },
    });
  }

  /**
   * Test connectivity to the Checkmk API by hitting the /version endpoint.
   * Uses a shorter 10s timeout.
   */
  async testConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const response = await this.request("GET", "/version", TEST_CONNECTION_TIMEOUT_MS);
      const data = response as { versions?: { checkmk?: string }; site?: string };
      const version = data.versions?.checkmk ?? "unknown";

      this.logger.info("Checkmk connection test successful", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "testConnection",
        metadata: { serverUrl: this.config.serverUrl, version },
      });

      return { success: true, version };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Checkmk connection test failed", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "testConnection",
        metadata: { serverUrl: this.config.serverUrl, errorMessage },
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch all hosts from Checkmk inventory.
   * Returns empty array on error.
   */
  async getHosts(): Promise<CheckmkHost[]> {
    try {
      const response = await this.request(
        "GET",
        "/domain-types/host_config/collections/all",
      );

      const data = response as {
        value?: {
          id?: string;
          extensions?: {
            attributes?: Record<string, unknown>;
            folder?: string;
          };
        }[];
      };

      if (!Array.isArray(data.value)) {
        return [];
      }

      return data.value.map((host) => ({
        hostname: host.id ?? "",
        attributes: {
          ipaddress: host.extensions?.attributes?.ipaddress as string | undefined,
          folder: host.extensions?.folder,
          labels: host.extensions?.attributes?.labels as Record<string, string> | undefined,
          ...host.extensions?.attributes,
        },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to fetch hosts from Checkmk", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getHosts",
        metadata: { serverUrl: this.config.serverUrl, errorMessage },
      });

      return [];
    }
  }

  /**
   * Fetch services for a specific host.
   * Requests explicit columns required for monitoring and event derivation.
   * Returns empty array on error.
   */
  async getServices(hostname: string): Promise<CheckmkServiceStatus[]> {
    try {
      // Build query string with repeated columns= parameters
      const columnsQuery = SERVICE_COLUMNS.map((col) => `columns=${col}`).join("&");
      const path = `/objects/host/${encodeURIComponent(hostname)}/collections/services?${columnsQuery}`;

      const response = await this.request("GET", path);

      const data = response as {
        value?: {
          extensions?: {
            description?: string;
            state?: number;
            state_type?: number;
            plugin_output?: string;
            last_check?: number;
            last_state?: number;
            last_state_change?: number;
          };
        }[];
      };

      if (!Array.isArray(data.value)) {
        return [];
      }

      return data.value
        .map((entry) => {
          const ext = entry.extensions;
          if (!ext) return null;

          return {
            description: ext.description ?? "",
            state: (ext.state ?? 3) as 0 | 1 | 2 | 3,
            stateType: (ext.state_type ?? 1) as 0 | 1,
            pluginOutput: ext.plugin_output ?? "",
            lastCheck: ext.last_check ?? 0,
            lastState: (ext.last_state ?? 0) as 0 | 1 | 2 | 3,
            lastStateChange: ext.last_state_change ?? 0,
          };
        })
        .filter((s): s is CheckmkServiceStatus => s !== null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to fetch services from Checkmk", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getServices",
        metadata: { serverUrl: this.config.serverUrl, hostname, errorMessage },
      });

      return [];
    }
  }

  /**
   * Sanitize a string to ensure the password never appears in log output.
   */
  private sanitize(text: string): string {
    if (!this.passwordPattern) return text;
    return text.replace(this.passwordPattern, "[REDACTED]");
  }

  /**
   * Execute an HTTP request against the Checkmk REST API.
   * Uses node:https/http for per-client TLS configuration.
   */
  private async request(
    method: string,
    path: string,
    timeout: number = DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    return new Promise<unknown>((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;

      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? "443" : "80"),
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
        timeout,
        ...(isHttps && this.httpsAgent ? { agent: this.httpsAgent } : {}),
      };

      const req = transport.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf-8");
          const statusCode = res.statusCode ?? 500;

          if (statusCode >= 400) {
            reject(
              new Error(
                `Checkmk API returned HTTP ${String(statusCode)}: ${this.sanitize(bodyText.slice(0, 500))}`,
              ),
            );
            return;
          }

          try {
            const json: unknown = JSON.parse(bodyText);
            resolve(json);
          } catch {
            reject(new Error("Failed to parse Checkmk API response as JSON"));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Checkmk API request timed out after ${String(timeout)}ms`));
      });

      req.on("error", (err) => {
        reject(new Error(`Checkmk API request failed: ${err.message}`));
      });

      req.end();
    });
  }
}
