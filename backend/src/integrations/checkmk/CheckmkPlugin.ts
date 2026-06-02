/**
 * Checkmk Integration Plugin
 *
 * Extends BasePlugin as an InformationSourcePlugin. Fetches host inventory,
 * live service status, and state-change events from the Checkmk REST API
 * and optionally from the Livestatus log table.
 *
 * Key behaviors:
 * - Non-fatal initialization: connectivity failure logs a warning and marks
 *   unhealthy but does NOT throw, enabling auto-recovery via health checks.
 * - Throttled health probes: caches testConnection result for
 *   healthCheckIntervalMs (default 5 min) to bound external API impact.
 * - Livestatus fallback: events try Livestatus first, fall back to REST
 *   derivation silently; Livestatus health never affects overall plugin health.
 * - Graceful degradation: all upstream errors return empty arrays, logged
 *   with structured metadata.
 */

import { randomUUID } from "node:crypto";

import { BasePlugin } from "../BasePlugin";
import type {
  HealthStatus,
  InformationSourcePlugin,
  NodeGroup,
} from "../types";
import type { Node, Facts } from "../bolt/types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import { CheckmkService } from "./CheckmkService";
import { CheckmkLivestatusClient } from "./CheckmkLivestatusClient";
import type { JournalEntry } from "../../services/journal/types";
import type {
  CheckmkConfig,
  CheckmkFailingService,
  CheckmkEvent,
  CheckmkHostEvent,
  CheckmkServiceStatus,
} from "./types";
import { SERVICE_STATE_NAMES } from "./types";

/** Maximum plugin output length for services (Requirement 7.2) */
const MAX_SERVICE_OUTPUT_LENGTH = 4000;

/** Maximum output length for events (Requirement 8.3) */
const MAX_EVENT_OUTPUT_LENGTH = 4096;

/** Default health check throttle interval in ms (5 minutes) */
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 300_000;

interface CachedHealthResult {
  status: Omit<HealthStatus, "lastCheck">;
  timestamp: number;
}

interface LivestatusProbeState {
  reachable: boolean;
  lastProbeTimestamp: number;
}

export class CheckmkPlugin
  extends BasePlugin
  implements InformationSourcePlugin
{
  type = "information" as const;
  private service!: CheckmkService;
  private livestatusClient?: CheckmkLivestatusClient;
  private healthCheckIntervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS;
  private cachedHealth?: CachedHealthResult;
  private livestatusProbe: LivestatusProbeState = {
    reachable: false,
    lastProbeTimestamp: 0,
  };

  /** Type-safe accessor for the Checkmk-specific config */
  private get checkmkConfig(): CheckmkConfig {
    return this.config.config as unknown as CheckmkConfig;
  }

  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
  ) {
    super("checkmk", "information", logger, performanceMonitor);
  }

  /**
   * Perform plugin-specific initialization.
   *
   * - Validates config (throws on config errors only).
   * - Instantiates CheckmkService and optionally CheckmkLivestatusClient.
   * - Tests REST connectivity with 10s timeout.
   * - On connectivity failure: logs warning, marks unhealthy, completes
   *   init without throwing (enables auto-recovery).
   */
  protected async performInitialization(): Promise<void> {
    const config = this.checkmkConfig;

    // Validate required config fields — throw on config errors
    if (!config.serverUrl) {
      throw new Error(
        "Checkmk configuration error: serverUrl is required",
      );
    }
    if (!config.username) {
      throw new Error(
        "Checkmk configuration error: username is required",
      );
    }
    if (!config.password) { // pragma: allowlist secret
      throw new Error(
        "Checkmk configuration error: password is required", // pragma: allowlist secret
      );
    }

    // Parse throttle interval
    this.healthCheckIntervalMs = config.healthCheckIntervalMs;

    // Instantiate REST client
    this.service = new CheckmkService(config, this.logger);

    // Instantiate Livestatus client if configured
    if (config.livestatus?.host) {
      this.livestatusClient = new CheckmkLivestatusClient(
        config.livestatus,
        config.sslVerify,
        this.logger,
      );

      // Log warning if Livestatus is enabled without TLS
      if (!config.livestatus.tls) {
        this.logger.warn(
          "Checkmk Livestatus is configured without TLS — traffic is unencrypted",
          {
            component: "CheckmkPlugin",
            integration: "checkmk",
            operation: "performInitialization",
            metadata: {
              host: config.livestatus.host,
              port: config.livestatus.port,
            },
          },
        );
      }
    }

    // Test REST connectivity — do NOT throw on failure
    const result = await this.service.testConnection();

    if (!result.success) {
      this.logger.warn(
        `Checkmk initialization: REST connectivity failed — ${result.error ?? "unknown error"}. Plugin will remain unhealthy until recovery.`,
        {
          component: "CheckmkPlugin",
          integration: "checkmk",
          operation: "performInitialization",
          metadata: {
            serverUrl: config.serverUrl,
            error: result.error,
          },
        },
      );

      // Cache unhealthy status so first healthCheck returns immediately
      this.cachedHealth = {
        status: {
          healthy: false,
          message: `Checkmk REST API unreachable: ${result.error ?? "unknown"}`,
        },
        timestamp: Date.now(),
      };
    } else {
      this.logger.info(
        `Checkmk plugin initialized — REST API version ${result.version ?? "unknown"}`,
        {
          component: "CheckmkPlugin",
          integration: "checkmk",
          operation: "performInitialization",
          metadata: {
            serverUrl: config.serverUrl,
            version: result.version,
          },
        },
      );

      // Cache healthy status
      this.cachedHealth = {
        status: {
          healthy: true,
          message: `Connected to Checkmk ${result.version ?? "unknown"}`,
        },
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Throttled health check.
   *
   * Returns cached result if re-invoked within healthCheckIntervalMs.
   * On a real probe: tests REST connectivity; when Livestatus is
   * enabled-but-down, probes it too and logs transitions without
   * affecting overall health.
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    const now = Date.now();

    // Return cached result if within throttle window
    if (
      this.cachedHealth &&
      now - this.cachedHealth.timestamp < this.healthCheckIntervalMs
    ) {
      return this.cachedHealth.status;
    }

    // Real REST probe
    const result = await this.service.testConnection();

    let status: Omit<HealthStatus, "lastCheck">;
    if (result.success) {
      status = {
        healthy: true,
        message: `Connected to Checkmk ${result.version ?? "unknown"}`,
      };
    } else {
      status = {
        healthy: false,
        message: `Checkmk REST API unreachable: ${result.error ?? "unknown"}`,
      };
    }

    // Livestatus probe (same throttle window, does not affect overall health)
    if (this.livestatusClient?.isEnabled()) {
      await this.probeLivestatus(now);
    }

    // Cache the result
    this.cachedHealth = { status, timestamp: now };
    return status;
  }

  /**
   * Probe Livestatus reachability and log down↔up transitions.
   * Never affects overall plugin health.
   */
  private async probeLivestatus(now: number): Promise<void> {
    if (!this.livestatusClient) return;

    // Respect the same throttle window
    if (
      now - this.livestatusProbe.lastProbeTimestamp <
      this.healthCheckIntervalMs
    ) {
      return;
    }

    const wasReachable = this.livestatusProbe.reachable;

    try {
      const reachable = await this.livestatusClient.ping();
      this.livestatusProbe = { reachable, lastProbeTimestamp: now };

      // Log transitions
      if (reachable && !wasReachable) {
        this.logger.info("Checkmk Livestatus is now reachable", {
          component: "CheckmkPlugin",
          integration: "checkmk",
          operation: "probeLivestatus",
        });
      } else if (!reachable && wasReachable) {
        this.logger.warn("Checkmk Livestatus is now unreachable", {
          component: "CheckmkPlugin",
          integration: "checkmk",
          operation: "probeLivestatus",
        });
      }
    } catch {
      if (wasReachable) {
        this.logger.warn(
          "Checkmk Livestatus is now unreachable (probe error)",
          {
            component: "CheckmkPlugin",
            integration: "checkmk",
            operation: "probeLivestatus",
          },
        );
      }
      this.livestatusProbe = { reachable: false, lastProbeTimestamp: now };
    }
  }

  // ========================================
  // InformationSourcePlugin Interface
  // ========================================

  /**
   * Get inventory of hosts from Checkmk.
   * Maps each Checkmk host to a Pabawi Node.
   */
  async getInventory(): Promise<Node[]> {
    try {
      const hosts = await this.service.getHosts();

      return hosts.map((host) => ({
        id: host.hostname,
        name: host.hostname,
        transport: "ssh",
        uri: host.attributes.ipaddress ?? host.hostname,
        source: "checkmk",
        config: { ...host.attributes },
      }));
    } catch (error) {
      this.logger.error("Failed to get Checkmk inventory", {
        component: "CheckmkPlugin",
        integration: "checkmk",
        operation: "getInventory",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return [];
    }
  }

  /**
   * Get groups — Checkmk does not provide group data through this integration.
   */
  getGroups(): Promise<NodeGroup[]> {
    return Promise.resolve([]);
  }

  /**
   * Get node facts for a monitored host.
   *
   * Checkmk does not provide OS/hardware facts like Puppet/SSH sources.
   * Instead, we expose monitoring facts so the Facts tab can surface
   * useful Checkmk context for the node.
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    const gatheredAt = new Date().toISOString();
    const services = await this.service.getServices(nodeId);

    let latestLastCheck = 0;
    let latestStateChange = 0;
    let worstState: 0 | 1 | 2 | 3 = 0;

    const stateCounts = {
      ok: 0,
      warn: 0,
      crit: 0,
      unknown: 0,
    };

    for (const service of services) {
      latestLastCheck = Math.max(latestLastCheck, service.lastCheck);
      latestStateChange = Math.max(latestStateChange, service.lastStateChange);
      if (service.state > worstState) {
        worstState = service.state;
      }

      if (service.state === 0) {
        stateCounts.ok += 1;
      } else if (service.state === 1) {
        stateCounts.warn += 1;
      } else if (service.state === 2) {
        stateCounts.crit += 1;
      } else {
        stateCounts.unknown += 1;
      }
    }

    const nonOkCount =
      stateCounts.warn + stateCounts.crit + stateCounts.unknown;

    const topIssues = services
      .filter((service) => service.state !== 0)
      .sort((a, b) => {
        if (a.state !== b.state) {
          return b.state - a.state;
        }
        return b.lastStateChange - a.lastStateChange;
      })
      .slice(0, 10)
      .map((service) => ({
        description: service.description,
        state: service.state,
        stateName: SERVICE_STATE_NAMES[service.state] ?? "UNKNOWN",
        stateType: service.stateType,
        lastCheck:
          service.lastCheck > 0
            ? new Date(service.lastCheck * 1000).toISOString()
            : null,
        lastStateChange:
          service.lastStateChange > 0
            ? new Date(service.lastStateChange * 1000).toISOString()
            : null,
        pluginOutput: this.truncateString(
          service.pluginOutput,
          MAX_SERVICE_OUTPUT_LENGTH,
        ),
      }));

    return {
      nodeId,
      source: "checkmk",
      gatheredAt,
      facts: {
        checkmk: {
          hostname: nodeId,
          serviceSummary: {
            total: services.length,
            ...stateCounts,
            nonOk: nonOkCount,
            worstState,
            worstStateName: SERVICE_STATE_NAMES[worstState] ?? "UNKNOWN",
            latestCheck:
              latestLastCheck > 0
                ? new Date(latestLastCheck * 1000).toISOString()
                : null,
            latestStateChange:
              latestStateChange > 0
                ? new Date(latestStateChange * 1000).toISOString()
                : null,
          },
          topIssues,
          note:
            services.length === 0
              ? "No Checkmk services were returned for this node"
              : undefined,
        },
      },
    } as unknown as Facts;
  }

  /**
   * Get node data by type.
   *
   * Routes:
   * - "services" → mapped service array (filtered, truncated)
   * - "events" → journal entries (Livestatus primary, REST fallback)
   * - anything else → empty array
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    switch (dataType) {
      case "services":
        return this.getServicesData(nodeId);
      case "events":
        return this.getEventsData(nodeId);
      default:
        return [];
    }
  }

  /**
   * Get global Checkmk monitoring events without per-node polling.
   * - Livestatus primary: latest state-change events from log table
   * - REST fallback: currently failing checks snapshot
   */
  async getGlobalEvents(nodeIds?: string[]): Promise<JournalEntry[]> {
    const limit = 500;

    if (this.livestatusClient?.isEnabled()) {
      try {
        const events = await this.livestatusClient.getGlobalEvents({
          hostnames: nodeIds,
          limit,
        });
        return this.mapGlobalEventsToJournalEntries(events);
      } catch (error) {
        this.logger.debug(
          "Global Livestatus event fetch failed, falling back to REST failing-services snapshot",
          {
            component: "CheckmkPlugin",
            integration: "checkmk",
            operation: "getGlobalEvents",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        );
      }
    }

    const failing = await this.service.getFailingServices(nodeIds, limit);
    return this.mapFailingServicesToJournalEntries(failing);
  }

  // ========================================
  // Private Data Methods
  // ========================================

  /**
   * Fetch and map services for a node.
   * Truncates pluginOutput to 4000 chars.
   */
  private async getServicesData(
    nodeId: string,
  ): Promise<CheckmkServiceStatus[]> {
    try {
      const services = await this.service.getServices(nodeId);

      return services.map((s) => ({
        ...s,
        pluginOutput: this.truncateString(
          s.pluginOutput,
          MAX_SERVICE_OUTPUT_LENGTH,
        ),
      }));
    } catch (error) {
      this.logger.error("Failed to get services for node", {
        component: "CheckmkPlugin",
        integration: "checkmk",
        operation: "getServicesData",
        metadata: {
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return [];
    }
  }

  /**
   * Fetch events for a node.
   * Tries Livestatus first (when enabled+reachable), falls back to REST derivation.
   * Returns journal-formatted entries.
   */
  private async getEventsData(nodeId: string): Promise<JournalEntry[]> {
    // Try Livestatus first
    if (this.livestatusClient?.isEnabled()) {
      try {
        const events = await this.livestatusClient.getEvents(nodeId);
        return this.mapEventsToJournalEntries(nodeId, events);
      } catch (error) {
        // Livestatus failed — fall back to REST silently
        this.logger.debug(
          "Livestatus event fetch failed, falling back to REST derivation",
          {
            component: "CheckmkPlugin",
            integration: "checkmk",
            operation: "getEventsData",
            metadata: {
              nodeId,
              error:
                error instanceof Error ? error.message : String(error),
            },
          },
        );
      }
    }

    // REST fallback: derive events from service status
    return this.deriveEventsFromRest(nodeId);
  }

  /**
   * Derive state-change events from REST service status.
   * Produces one event per service where last_state != state AND
   * lastStateChange > 0.
   */
  private async deriveEventsFromRest(
    nodeId: string,
  ): Promise<JournalEntry[]> {
    try {
      const services = await this.service.getServices(nodeId);

      const events: CheckmkEvent[] = [];
      for (const svc of services) {
        // Only emit events for real transitions
        if (svc.lastState === svc.state) continue;
        if (!svc.lastStateChange || svc.lastStateChange <= 0) continue;

        events.push({
          timestamp: new Date(svc.lastStateChange * 1000).toISOString(),
          serviceDescription: svc.description,
          previousState: svc.lastState,
          currentState: svc.state,
          output: this.truncateString(
            svc.pluginOutput,
            MAX_EVENT_OUTPUT_LENGTH,
          ),
        });
      }

      // Sort descending by timestamp
      events.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      return this.mapEventsToJournalEntries(nodeId, events);
    } catch (error) {
      this.logger.error(
        "Failed to derive events from REST for node",
        {
          component: "CheckmkPlugin",
          integration: "checkmk",
          operation: "deriveEventsFromRest",
          metadata: {
            nodeId,
            error:
              error instanceof Error ? error.message : String(error),
          },
        },
      );
      return [];
    }
  }

  /**
   * Map CheckmkEvent[] to journal entry objects.
   */
  private mapEventsToJournalEntries(
    nodeId: string,
    events: CheckmkEvent[],
  ): JournalEntry[] {
    return events.map((event) => {
      const prevName = SERVICE_STATE_NAMES[event.previousState];
      const currName = SERVICE_STATE_NAMES[event.currentState];

      return {
        id: randomUUID(),
        nodeId,
        nodeUri: `checkmk:${nodeId}`,
        eventType: "state_change",
        source: "checkmk",
        action: "state_change",
        summary: `${event.serviceDescription}: ${prevName} → ${currName}`,
        details: {
          serviceDescription: event.serviceDescription,
          previousState: event.previousState,
          currentState: event.currentState,
          output: this.truncateString(
            event.output,
            MAX_EVENT_OUTPUT_LENGTH,
          ),
          timestamp: event.timestamp,
        },
        timestamp: event.timestamp,
        isLive: true,
      };
    });
  }

  /**
   * Map host-scoped Checkmk events to journal entries.
   */
  private mapGlobalEventsToJournalEntries(
    events: CheckmkHostEvent[],
  ): JournalEntry[] {
    return events.map((event) => {
      const prevName = SERVICE_STATE_NAMES[event.previousState];
      const currName = SERVICE_STATE_NAMES[event.currentState];

      return {
        id: randomUUID(),
        nodeId: event.hostname,
        nodeUri: `checkmk:${event.hostname}`,
        eventType: "state_change",
        source: "checkmk",
        action: "state_change",
        summary: `${event.serviceDescription}: ${prevName} → ${currName}`,
        details: {
          serviceDescription: event.serviceDescription,
          previousState: event.previousState,
          currentState: event.currentState,
          output: this.truncateString(event.output, MAX_EVENT_OUTPUT_LENGTH),
          timestamp: event.timestamp,
        },
        timestamp: event.timestamp,
        isLive: true,
      };
    });
  }

  /**
   * Map failing-service snapshots to journal entries when event log data is unavailable.
   */
  private mapFailingServicesToJournalEntries(
    services: CheckmkFailingService[],
  ): JournalEntry[] {
    const nowIso = new Date().toISOString();

    return services.map((svc) => {
      const prevName = SERVICE_STATE_NAMES[svc.lastState];
      const currName = SERVICE_STATE_NAMES[svc.state];
      const ts = svc.lastStateChange > 0
        ? new Date(svc.lastStateChange * 1000).toISOString()
        : nowIso;

      return {
        id: randomUUID(),
        nodeId: svc.hostname,
        nodeUri: `checkmk:${svc.hostname}`,
        eventType: "state_change",
        source: "checkmk",
        action: "state_change",
        summary: `${svc.serviceDescription}: ${prevName} → ${currName}`,
        details: {
          serviceDescription: svc.serviceDescription,
          previousState: svc.lastState,
          currentState: svc.state,
          output: this.truncateString(svc.output, MAX_EVENT_OUTPUT_LENGTH),
          timestamp: ts,
          snapshot: true,
        },
        timestamp: ts,
        isLive: true,
      };
    });
  }

  /**
   * Truncate a string to maxLength chars with ellipsis if longer.
   */
  private truncateString(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength - 3) + "...";
  }
}
