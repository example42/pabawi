/**
 * Checkmk Livestatus Client
 *
 * Hand-rolled raw LQL client over node:net (plaintext) or node:tls (encrypted).
 * No third-party Livestatus dependency.
 *
 * Connects to the Checkmk Livestatus socket, writes LQL queries, reads JSON
 * responses, and maps rows to CheckmkEvent objects.
 */

import * as net from "node:net";
import * as tls from "node:tls";
import type { CheckmkLivestatusConfig, CheckmkEvent } from "./types";
import type { LoggerService } from "../../services/LoggerService";

const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 500;
const MAX_OUTPUT_LENGTH = 4096;

export class CheckmkLivestatusClient {
  private readonly config: CheckmkLivestatusConfig;
  private readonly sslVerify: boolean;
  private readonly logger: LoggerService;

  constructor(
    config: CheckmkLivestatusConfig,
    sslVerify: boolean,
    logger: LoggerService,
  ) {
    this.config = config;
    this.sslVerify = sslVerify;
    this.logger = logger;
  }

  /**
   * Returns true iff livestatus.host is configured (non-empty).
   */
  isEnabled(): boolean {
    return Boolean(this.config.host);
  }

  /**
   * Sends a GET status query to verify connectivity.
   * Returns true if the Livestatus endpoint responds with at least one row.
   */
  async ping(): Promise<boolean> {
    const query =
      "GET status\nColumns: program_version\nOutputFormat: json\n\n";

    try {
      const response = await this.executeQuery(query);
      const parsed = JSON.parse(response) as unknown[][];
      return Array.isArray(parsed) && parsed.length > 0;
    } catch (error) {
      this.logger.debug("Livestatus ping failed", {
        component: "CheckmkLivestatusClient",
        integration: "checkmk",
        operation: "ping",
        metadata: {
          host: this.config.host,
          port: this.config.port,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return false;
    }
  }

  /**
   * Fetches state-change events from the Livestatus log table.
   *
   * Queries: GET log with class=1 (alerts), filtered by hostname and time window.
   * Maps raw rows to CheckmkEvent objects with previousState derived from
   * consecutive entries per service.
   *
   * Throws on connect/timeout/parse error so the plugin can fall back to REST.
   */
  async getEvents(
    hostname: string,
    options?: { days?: number; limit?: number },
  ): Promise<CheckmkEvent[]> {
    const days = options?.days ?? DEFAULT_DAYS;
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - days * 86400;

    const query = [
      "GET log",
      "Columns: time host_name service_description state state_type plugin_output",
      "Filter: class = 1",
      `Filter: host_name = ${hostname}`,
      `Filter: time >= ${String(cutoffTimestamp)}`,
      `Limit: ${String(limit)}`,
      "OutputFormat: json",
      "",
      "",
    ].join("\n");

    this.logger.debug("Executing Livestatus log query", {
      component: "CheckmkLivestatusClient",
      integration: "checkmk",
      operation: "getEvents",
      metadata: {
        host: this.config.host,
        port: this.config.port,
        hostname,
        days,
        limit,
      },
    });

    const response = await this.executeQuery(query);
    const rows = this.parseResponse(response);
    return this.mapRowsToEvents(rows);
  }

  /**
   * Opens a socket connection, writes the LQL query, reads the full response,
   * and returns the raw response string.
   *
   * Throws on connect error, timeout, or socket error.
   */
  private executeQuery(query: string): Promise<string> {
    const timeoutMs = this.config.timeoutMs;

    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;

      const settle = (
        fn: typeof resolve | typeof reject,
        value: string | Error,
      ): void => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value as string & Error);
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        socket.removeAllListeners();
        socket.destroy();
      };

      const timer = setTimeout(() => {
        settle(
          reject,
          new Error(
            `Livestatus query timed out after ${String(timeoutMs)}ms (${this.config.host}:${String(this.config.port)})`,
          ),
        );
      }, timeoutMs);

      let socket: net.Socket;

      if (this.config.tls) {
        socket = tls.connect(
          {
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: this.sslVerify,
          },
          () => {
            socket.write(query);
          },
        );
      } else {
        socket = net.createConnection(
          { host: this.config.host, port: this.config.port },
          () => {
            socket.write(query);
          },
        );
      }

      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      socket.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf-8");
        settle(resolve, data);
      });

      socket.on("close", () => {
        if (!settled) {
          const data = Buffer.concat(chunks).toString("utf-8");
          settle(resolve, data);
        }
      });

      socket.on("error", (err: Error) => {
        settle(
          reject,
          new Error(
            `Livestatus connection error (${this.config.host}:${String(this.config.port)}): ${err.message}`,
          ),
        );
      });
    });
  }

  /**
   * Parses the raw JSON response from Livestatus.
   * Expects an array of arrays (rows).
   * Throws on parse error.
   */
  private parseResponse(response: string): unknown[][] {
    const trimmed = response.trim();
    if (!trimmed) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(
        `Livestatus response parse error (${this.config.host}:${String(this.config.port)}): invalid JSON`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Livestatus response parse error (${this.config.host}:${String(this.config.port)}): expected array, got ${typeof parsed}`,
      );
    }

    return parsed as unknown[][];
  }

  /**
   * Maps raw Livestatus log rows to CheckmkEvent objects.
   *
   * Row format: [time, host_name, service_description, state, state_type, plugin_output]
   *
   * previousState is derived from consecutive entries for the same service
   * (sorted ascending by time). If no prior entry exists for a service,
   * previousState is set equal to currentState.
   */
  private mapRowsToEvents(rows: unknown[][]): CheckmkEvent[] {
    // Sort rows ascending by time for previousState derivation
    const sorted = [...rows].sort((a, b) => {
      const timeA = Number(a[0]) || 0;
      const timeB = Number(b[0]) || 0;
      return timeA - timeB;
    });

    // Track last known state per service for previousState derivation
    const lastStateByService = new Map<string, 0 | 1 | 2 | 3>();
    const events: CheckmkEvent[] = [];

    for (const row of sorted) {
      if (!Array.isArray(row) || row.length < 6) continue;

      const time = Number(row[0]);
      const serviceDescription = this.toSafeString(row[2]);
      const state = this.clampState(Number(row[3]));
      const output = this.truncateOutput(this.toSafeString(row[5]));

      if (!serviceDescription || isNaN(time) || time <= 0) continue;

      const previousState =
        lastStateByService.get(serviceDescription) ?? state;
      lastStateByService.set(serviceDescription, state);

      events.push({
        timestamp: new Date(time * 1000).toISOString(),
        serviceDescription,
        previousState,
        currentState: state,
        output,
      });
    }

    // Return descending by timestamp (most recent first)
    return events.reverse();
  }

  /**
   * Safely converts an unknown value to a string without triggering
   * no-base-to-string lint errors.
   */
  private toSafeString(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return value.toString();
    }
    if (value == null) return "";
    return JSON.stringify(value);
  }

  /**
   * Clamps a numeric state value to the valid range 0-3.
   */
  private clampState(value: number): 0 | 1 | 2 | 3 {
    if (isNaN(value) || value < 0) return 3; // UNKNOWN
    if (value > 3) return 3;
    return value as 0 | 1 | 2 | 3;
  }

  /**
   * Truncates output to MAX_OUTPUT_LENGTH characters with ellipsis.
   */
  private truncateOutput(output: string): string {
    if (output.length <= MAX_OUTPUT_LENGTH) return output;
    return output.slice(0, MAX_OUTPUT_LENGTH - 3) + "...";
  }
}
