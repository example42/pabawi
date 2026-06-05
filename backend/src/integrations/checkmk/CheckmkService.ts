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
import type {
  CheckmkConfig,
  CheckmkFailingService,
  CheckmkHost,
  CheckmkHostStateSummary,
  CheckmkHostSummary,
  CheckmkServiceStatus,
} from "./types";

/** Default request timeout in milliseconds (Requirement 12.2) */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Connection test timeout in milliseconds */
const TEST_CONNECTION_TIMEOUT_MS = 10_000;

/** Host inventory request timeout in milliseconds */
const HOSTS_TIMEOUT_MS = 60_000;

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

const FAILING_SERVICE_COLUMNS = [
  "host_name",
  "description",
  "state",
  "last_state",
  "last_state_change",
  "plugin_output",
  "acknowledged",
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
        "/domain-types/host_config/collections/all?effective_attributes=true",
        HOSTS_TIMEOUT_MS,
      );
      let hosts = this.parseHostCollection(response);

      // Some Checkmk setups expose monitored hosts through `host` while
      // `host_config` may be empty depending on permissions.
      if (hosts.length === 0) {
        this.logger.warn("Checkmk host_config endpoint returned no hosts, trying host endpoint fallback", {
          component: "CheckmkService",
          integration: "checkmk",
          operation: "getHosts",
          metadata: { serverUrl: this.config.serverUrl },
        });

        const fallbackResponse = await this.request(
          "GET",
          "/domain-types/host/collections/all",
          HOSTS_TIMEOUT_MS,
        );
        hosts = this.parseHostCollection(fallbackResponse);
      }

      this.logger.info(`Checkmk getHosts: received ${String(hosts.length)} hosts`, {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getHosts",
        metadata: { serverUrl: this.config.serverUrl, hostCount: hosts.length },
      });

      return hosts;
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
   * Parse Checkmk host collection responses into Pabawi host objects.
   * Supports both `host_config` and `host` domain-type collection shapes.
   */
  private parseHostCollection(response: unknown): CheckmkHost[] {
    const data = response as {
      value?: {
        id?: string;
        title?: string;
        extensions?: {
          attributes?: Record<string, unknown>;
          effective_attributes?: Record<string, unknown>;
          folder?: string;
        };
      }[];
      items?: {
        id?: string;
        title?: string;
        extensions?: {
          attributes?: Record<string, unknown>;
          effective_attributes?: Record<string, unknown>;
          folder?: string;
        };
      }[];
    };

    const records = Array.isArray(data.value)
      ? data.value
      : (Array.isArray(data.items) ? data.items : []);

    if (records.length === 0) {
      this.logger.warn("Checkmk host collection response contained no host records", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "parseHostCollection",
        metadata: {
          serverUrl: this.config.serverUrl,
          responseKeys: response !== null && typeof response === "object" ? Object.keys(response) : [],
        },
      });
      return [];
    }

    const hosts: CheckmkHost[] = [];
    for (const host of records) {
      const hostname = host.id ?? host.title ?? "";
      if (!hostname) continue;

      // Prefer effective_attributes (resolved) over raw attributes.
      const attrs = host.extensions?.effective_attributes ?? host.extensions?.attributes ?? {};
      hosts.push({
        hostname,
        attributes: {
          ipaddress: attrs.ipaddress as string | undefined,
          folder: host.extensions?.folder,
          labels: attrs.labels as Record<string, string> | undefined,
          ...attrs,
        },
      });
    }

    return hosts;
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
   * Fetch currently failing services globally (single request, no per-host polling).
   * Uses the monitoring service collection endpoint with a query filter state != 0.
   *
   * @param hostnames - Optional list of hostnames to restrict results to
   * @param limit - Maximum number of results (default 500)
   * @param unhandledOnly - When true, excludes acknowledged services (default false)
   */
  async getFailingServices(
    hostnames?: string[],
    limit = 500,
    unhandledOnly = false,
  ): Promise<CheckmkFailingService[]> {
    try {
      const query = unhandledOnly
        ? {
          op: "and",
          expr: [
            { op: "!=", left: "state", right: "0" },
            { op: "=", left: "acknowledged", right: "0" },
          ],
        }
        : {
          op: "!=",
          left: "state",
          right: "0",
        };

      const response = await this.request(
        "POST",
        "/domain-types/service/collections/all",
        DEFAULT_TIMEOUT_MS,
        {
          columns: [...FAILING_SERVICE_COLUMNS],
          query,
        },
      );

      const data = response as {
        value?: {
          extensions?: {
            host_name?: string;
            description?: string;
            state?: number;
            last_state?: number;
            last_state_change?: number;
            plugin_output?: string;
            acknowledged?: number;
          };
        }[];
      };

      if (!Array.isArray(data.value)) {
        return [];
      }

      const allowedHosts = hostnames && hostnames.length > 0
        ? new Set(hostnames)
        : null;

      const failingServices: CheckmkFailingService[] = [];
      for (const entry of data.value) {
        const ext = entry.extensions;
        if (!ext) continue;

        const state = (ext.state ?? 3) as 0 | 1 | 2 | 3;
        if (state === 0) continue;

        const hostname = ext.host_name ?? "";
        if (!hostname) continue;
        if (allowedHosts && !allowedHosts.has(hostname)) continue;

        failingServices.push({
          hostname,
          serviceDescription: ext.description ?? "",
          state,
          lastState: (ext.last_state ?? 0) as 0 | 1 | 2 | 3,
          lastStateChange: ext.last_state_change ?? 0,
          output: ext.plugin_output ?? "",
          acknowledged: (ext.acknowledged ?? 0) !== 0,
        });
      }

      return failingServices
        .sort((a, b) => b.lastStateChange - a.lastStateChange)
        .slice(0, Math.max(1, limit));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to fetch failing services from Checkmk", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getFailingServices",
        metadata: { serverUrl: this.config.serverUrl, errorMessage },
      });

      return [];
    }
  }

  /**
   * Fetch a per-host summary of service states (total, ok, warn, crit, unknown).
   * Uses the same bulk service endpoint as getFailingServices but without a state filter.
   * Returns an array sorted by worst-state-count descending.
   */
  async getHostServiceSummary(): Promise<CheckmkHostSummary[]> {
    try {
      const response = await this.request(
        "POST",
        "/domain-types/service/collections/all",
        DEFAULT_TIMEOUT_MS,
        {
          columns: ["host_name", "state"],
        },
      );

      const data = response as {
        value?: {
          extensions?: {
            host_name?: string;
            state?: number;
          };
        }[];
      };

      if (!Array.isArray(data.value)) {
        return [];
      }

      const hostMap = new Map<string, CheckmkHostSummary>();

      for (const entry of data.value) {
        const ext = entry.extensions;
        if (!ext) continue;

        const hostname = ext.host_name ?? "";
        if (!hostname) continue;

        let summary = hostMap.get(hostname);
        if (!summary) {
          summary = { hostname, total: 0, ok: 0, warn: 0, crit: 0, unknown: 0 };
          hostMap.set(hostname, summary);
        }

        summary.total += 1;
        const state = ext.state ?? 3;
        if (state === 0) summary.ok += 1;
        else if (state === 1) summary.warn += 1;
        else if (state === 2) summary.crit += 1;
        else summary.unknown += 1;
      }

      // Sort: hosts with CRIT first, then WARN, then by total descending
      return [...hostMap.values()].sort((a, b) => {
        if (a.crit !== b.crit) return b.crit - a.crit;
        if (a.warn !== b.warn) return b.warn - a.warn;
        return b.total - a.total;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to fetch host service summary from Checkmk", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getHostServiceSummary",
        metadata: { serverUrl: this.config.serverUrl, errorMessage },
      });

      return [];
    }
  }

  /**
   * Fetch host state summary from Checkmk.
   *
   * Queries the host collection for state and scheduled_downtime_depth columns,
   * then aggregates into up/down/unreachable/inDowntime/total counts.
   *
   * Host states: 0 = UP, 1 = DOWN, 2 = UNREACHABLE.
   * A host with scheduled_downtime_depth > 0 is counted as "in downtime"
   * regardless of its current state.
   */
  async getHostStateSummary(): Promise<CheckmkHostStateSummary> {
    try {
      const response = await this.request(
        "POST",
        "/domain-types/host/collections/all",
        DEFAULT_TIMEOUT_MS,
        {
          columns: ["name", "state", "scheduled_downtime_depth"],
        },
      );

      const data = response as {
        value?: {
          extensions?: {
            name?: string;
            state?: number;
            scheduled_downtime_depth?: number;
          };
        }[];
      };

      if (!Array.isArray(data.value)) {
        return { up: 0, down: 0, unreachable: 0, inDowntime: 0, total: 0 };
      }

      const summary: CheckmkHostStateSummary = {
        up: 0,
        down: 0,
        unreachable: 0,
        inDowntime: 0,
        total: 0,
      };

      for (const entry of data.value) {
        const ext = entry.extensions;
        if (!ext) continue;

        summary.total += 1;
        const downtimeDepth = ext.scheduled_downtime_depth ?? 0;

        if (downtimeDepth > 0) {
          summary.inDowntime += 1;
        } else {
          const state = ext.state ?? 0;
          if (state === 0) summary.up += 1;
          else if (state === 1) summary.down += 1;
          else summary.unreachable += 1;
        }
      }

      return summary;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to fetch host state summary from Checkmk", {
        component: "CheckmkService",
        integration: "checkmk",
        operation: "getHostStateSummary",
        metadata: { serverUrl: this.config.serverUrl, errorMessage },
      });

      return { up: 0, down: 0, unreachable: 0, inDowntime: 0, total: 0 };
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
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    return new Promise<unknown>((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;

      const hasBody = body !== undefined;
      const payload = hasBody ? JSON.stringify(body) : "";

      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? "443" : "80"),
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(hasBody
            ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload).toString(),
            }
            : {}),
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

      if (hasBody) {
        req.write(payload);
      }

      req.end();
    });
  }
}
