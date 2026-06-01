import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

import type {
  CheckmkConfig,
  CheckmkHost,
  CheckmkServiceStatus,
  CheckmkEvent,
} from "../../src/integrations/checkmk/types";
import { SERVICE_STATE_NAMES } from "../../src/integrations/checkmk/types";
import type { LoggerService } from "../../src/services/LoggerService";

/**
 * Property-Based Tests for CheckmkPlugin Mappings
 *
 * **Validates: Requirements 5.2, 5.3, 6.1, 7.2, 7.6, 8.3, 8.5, 10.2, 12.1**
 *
 * Tests the following correctness properties from the design document:
 * - Property 6: Host-to-Node mapping
 * - Property 7: Service mapping and filtering
 * - Property 8: Event mapping and ordering
 * - Property 10: Journal entry mapping
 * - Property 11: Graceful degradation
 */

// ============================================================
// Arbitraries
// ============================================================

/** Valid service states: 0 (OK), 1 (WARN), 2 (CRIT), 3 (UNKNOWN) */
const serviceStateArb = fc.constantFrom(0, 1, 2, 3) as fc.Arbitrary<0 | 1 | 2 | 3>;

/** Arbitrary for non-empty hostnames */
const hostnameArb = fc.stringMatching(/^[a-z][a-z0-9\-.]{0,62}$/);

/** Arbitrary for optional IPv4 addresses */
const ipAddressArb = fc.oneof(
  fc.constant(undefined),
  fc.tuple(
    fc.integer({ min: 1, max: 254 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 }),
  ).map(([a, b, c, d]) => `${String(a)}.${String(b)}.${String(c)}.${String(d)}`),
);

/** Arbitrary for CheckmkHost objects */
const checkmkHostArb: fc.Arbitrary<CheckmkHost> = fc.record({
  hostname: hostnameArb,
  attributes: fc.record({
    ipaddress: ipAddressArb,
    folder: fc.option(fc.stringMatching(/^\/[a-z0-9/]{0,30}$/), { nil: undefined }),
    labels: fc.option(
      fc.dictionary(
        fc.stringMatching(/^[a-z_]{1,10}$/),
        fc.stringMatching(/^[a-z0-9_]{1,10}$/),
        { minKeys: 0, maxKeys: 5 },
      ),
      { nil: undefined },
    ),
  }),
});

/** Arbitrary for service descriptions */
const serviceDescriptionArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _\-/.]{0,60}$/);

/** Arbitrary for plugin output strings of varying length (including >4000 chars) */
const pluginOutputArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.string({ minLength: 3990, maxLength: 4010 }),
  fc.string({ minLength: 4050, maxLength: 5000 }),
);

/** Arbitrary for CheckmkServiceStatus objects */
const checkmkServiceStatusArb: fc.Arbitrary<CheckmkServiceStatus> = fc.record({
  description: serviceDescriptionArb,
  state: serviceStateArb,
  stateType: fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>,
  pluginOutput: pluginOutputArb,
  lastCheck: fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }),
  lastState: serviceStateArb,
  lastStateChange: fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }),
});

/** Arbitrary for event output strings (including >4096 chars) */
const eventOutputArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.string({ minLength: 4086, maxLength: 4100 }),
  fc.string({ minLength: 4100, maxLength: 5000 }),
);

/** Arbitrary for CheckmkEvent objects with valid ISO timestamps */
const checkmkEventArb: fc.Arbitrary<CheckmkEvent> = fc.record({
  timestamp: fc.integer({ min: 1_600_000_000_000, max: 1_800_000_000_000 })
    .map((ms) => new Date(ms).toISOString()),
  serviceDescription: serviceDescriptionArb,
  previousState: serviceStateArb,
  currentState: serviceStateArb,
  output: eventOutputArb,
});

// ============================================================
// Helpers
// ============================================================

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: function () { return this; },
    setLevel: vi.fn(),
  } as unknown as LoggerService;
}

// ============================================================
// Mock service instances — controlled per test via closures
// ============================================================

let mockGetHosts: ReturnType<typeof vi.fn>;
let mockGetServices: ReturnType<typeof vi.fn>;
let mockTestConnection: ReturnType<typeof vi.fn>;
let mockLivestatusIsEnabled: ReturnType<typeof vi.fn>;
let mockLivestatusGetEvents: ReturnType<typeof vi.fn>;
let mockLivestatusPing: ReturnType<typeof vi.fn>;

vi.mock("../../src/integrations/checkmk/CheckmkService", () => {
  // Must use a regular function (not arrow) so `new` works
  const MockService = vi.fn(function (this: Record<string, unknown>) {
    Object.defineProperty(this, "testConnection", { get: () => mockTestConnection });
    Object.defineProperty(this, "getHosts", { get: () => mockGetHosts });
    Object.defineProperty(this, "getServices", { get: () => mockGetServices });
  });
  return { CheckmkService: MockService };
});

vi.mock("../../src/integrations/checkmk/CheckmkLivestatusClient", () => {
  const MockClient = vi.fn(function (this: Record<string, unknown>) {
    Object.defineProperty(this, "isEnabled", { get: () => mockLivestatusIsEnabled });
    Object.defineProperty(this, "getEvents", { get: () => mockLivestatusGetEvents });
    Object.defineProperty(this, "ping", { get: () => mockLivestatusPing });
  });
  return { CheckmkLivestatusClient: MockClient };
});

/**
 * Creates a CheckmkPlugin instance with mocked service layer.
 */
async function createPluginWithMocks(options?: {
  getHostsResult?: CheckmkHost[];
  getServicesResult?: CheckmkServiceStatus[];
  getServicesFn?: (hostname: string) => Promise<CheckmkServiceStatus[]>;
  testConnectionResult?: { success: boolean; version?: string; error?: string };
  livestatusEnabled?: boolean;
  livestatusEvents?: CheckmkEvent[];
  serviceError?: boolean;
  hostsError?: boolean;
}): Promise<{ plugin: InstanceType<typeof import("../../src/integrations/checkmk/CheckmkPlugin").CheckmkPlugin> }> {
  const { CheckmkPlugin } = await import("../../src/integrations/checkmk/CheckmkPlugin");

  // Configure mock behaviors
  mockTestConnection = vi.fn().mockResolvedValue(
    options?.testConnectionResult ?? { success: true, version: "2.2.0" },
  );

  if (options?.hostsError) {
    mockGetHosts = vi.fn().mockRejectedValue(new Error("Connection refused"));
  } else {
    mockGetHosts = vi.fn().mockResolvedValue(options?.getHostsResult ?? []);
  }

  if (options?.serviceError) {
    mockGetServices = vi.fn().mockRejectedValue(new Error("Connection refused"));
  } else if (options?.getServicesFn) {
    mockGetServices = vi.fn().mockImplementation(options.getServicesFn);
  } else {
    mockGetServices = vi.fn().mockResolvedValue(options?.getServicesResult ?? []);
  }

  // Livestatus mocks
  mockLivestatusIsEnabled = vi.fn().mockReturnValue(options?.livestatusEnabled ?? false);
  mockLivestatusGetEvents = vi.fn().mockResolvedValue(options?.livestatusEvents ?? []);
  mockLivestatusPing = vi.fn().mockResolvedValue(true);

  const logger = createMockLogger();
  const plugin = new CheckmkPlugin(logger);

  const config: CheckmkConfig = {
    enabled: true,
    serverUrl: "https://monitoring.example.com",
    site: "mysite",
    username: "automation",
    password: "secret123", // pragma: allowlist secret
    sslVerify: true,
    healthCheckIntervalMs: 300_000,
    ...(options?.livestatusEnabled ? {
      livestatus: { host: "livestatus.example.com", port: 6557, tls: false, timeoutMs: 5000 },
    } : {}),
  };

  const integrationConfig = {
    enabled: true,
    name: "checkmk",
    type: "information" as const,
    config,
  };

  await plugin.initialize(integrationConfig);

  return { plugin };
}

// ============================================================
// Property Tests
// ============================================================

describe("CheckmkPlugin Properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 6: Host-to-Node mapping
   *
   * **Validates: Requirements 5.2, 5.3, 6.1**
   *
   * For any valid Checkmk host object, the mapping SHALL produce a Pabawi
   * Node where: id equals the hostname, name equals the hostname, transport
   * equals "ssh", uri equals the IP address if present or the hostname
   * otherwise, source equals "checkmk", and config contains all Checkmk
   * host attributes.
   */
  describe("Property 6: Host-to-Node mapping", () => {
    it("any valid CheckmkHost maps to correct Node fields", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(checkmkHostArb, { minLength: 1, maxLength: 20 }),
          async (hosts) => {
            mockGetHosts = vi.fn().mockResolvedValue(hosts);
            const { plugin } = await createPluginWithMocks({ getHostsResult: hosts });

            const nodes = await plugin.getInventory();

            expect(nodes).toHaveLength(hosts.length);

            for (let i = 0; i < hosts.length; i++) {
              const host = hosts[i];
              const node = nodes[i];

              // id equals hostname
              expect(node.id).toBe(host.hostname);
              // name equals hostname
              expect(node.name).toBe(host.hostname);
              // transport equals "ssh"
              expect(node.transport).toBe("ssh");
              // uri equals IP address if present, hostname otherwise
              expect(node.uri).toBe(host.attributes.ipaddress ?? host.hostname);
              // source equals "checkmk"
              expect(node.source).toBe("checkmk");
              // config contains host attributes
              expect(node.config).toBeDefined();
              if (host.attributes.ipaddress) {
                expect(node.config.ipaddress).toBe(host.attributes.ipaddress);
              }
              if (host.attributes.folder) {
                expect(node.config.folder).toBe(host.attributes.folder);
              }
              if (host.attributes.labels) {
                expect(node.config.labels).toEqual(host.attributes.labels);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 7: Service mapping and filtering
   *
   * **Validates: Requirements 7.2, 7.6**
   *
   * For any array of service objects, the plugin SHALL return only services
   * that have both a description and state field present, and each returned
   * service SHALL have pluginOutput truncated to 4000 characters with
   * ellipsis if longer.
   */
  describe("Property 7: Service mapping and filtering", () => {
    it("pluginOutput is truncated to 4000 chars with ellipsis when longer", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(checkmkServiceStatusArb, { minLength: 1, maxLength: 20 }),
          async (services) => {
            const { plugin } = await createPluginWithMocks({
              getServicesResult: services,
            });

            const result = await plugin.getNodeData("testhost", "services") as CheckmkServiceStatus[];

            expect(result).toHaveLength(services.length);

            for (let i = 0; i < result.length; i++) {
              const mapped = result[i];
              const original = services[i];

              // pluginOutput must be at most 4000 chars
              expect(mapped.pluginOutput.length).toBeLessThanOrEqual(4000);

              // If original was longer than 4000, output ends with "..."
              if (original.pluginOutput.length > 4000) {
                expect(mapped.pluginOutput).toHaveLength(4000);
                expect(mapped.pluginOutput.endsWith("...")).toBe(true);
                // First 3997 chars match original
                expect(mapped.pluginOutput.slice(0, 3997)).toBe(
                  original.pluginOutput.slice(0, 3997),
                );
              } else {
                // Unchanged
                expect(mapped.pluginOutput).toBe(original.pluginOutput);
              }

              // Other fields preserved
              expect(mapped.description).toBe(original.description);
              expect(mapped.state).toBe(original.state);
              expect(mapped.stateType).toBe(original.stateType);
              expect(mapped.lastCheck).toBe(original.lastCheck);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 8: Event mapping and ordering
   *
   * **Validates: Requirements 8.3, 8.5**
   *
   * For any array of state-change events, the plugin SHALL return events
   * with timestamp in ISO 8601 format, and output truncated to 4096
   * characters. The returned array SHALL be sorted by timestamp in
   * descending order.
   */
  describe("Property 8: Event mapping and ordering", () => {
    it("events sorted descending by timestamp, output truncated to 4096 chars (Livestatus source)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(checkmkEventArb, { minLength: 2, maxLength: 30 }),
          async (rawEvents) => {
            // Pre-sort events descending (simulates Livestatus returning sorted data)
            const events = [...rawEvents].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
            const { plugin } = await createPluginWithMocks({
              livestatusEnabled: true,
              livestatusEvents: events,
            });

            const result = await plugin.getNodeData("testhost", "events") as Array<{
              timestamp: string;
              details: { output: string; timestamp: string };
            }>;

            // Result should have same count as input events
            expect(result).toHaveLength(events.length);

            // Verify descending timestamp order
            for (let i = 1; i < result.length; i++) {
              const prevTs = new Date(result[i - 1].timestamp).getTime();
              const currTs = new Date(result[i].timestamp).getTime();
              expect(prevTs).toBeGreaterThanOrEqual(currTs);
            }

            // Verify timestamps are valid ISO 8601
            for (const entry of result) {
              expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
            }

            // Verify output truncation to 4096 chars
            for (const entry of result) {
              const output = entry.details.output as string;
              expect(output.length).toBeLessThanOrEqual(4096);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("events sorted descending by timestamp, output truncated to 4096 chars (REST fallback source)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            checkmkServiceStatusArb.filter((s) => s.lastState !== s.state && s.lastStateChange > 0),
            { minLength: 2, maxLength: 20 },
          ),
          async (services) => {
            const { plugin } = await createPluginWithMocks({
              getServicesResult: services,
            });

            const result = await plugin.getNodeData("testhost", "events") as Array<{
              timestamp: string;
              details: { output: string };
            }>;

            // REST fallback only emits events where lastState != state
            expect(result.length).toBeLessThanOrEqual(services.length);
            expect(result.length).toBeGreaterThan(0);

            // Verify descending timestamp order
            for (let i = 1; i < result.length; i++) {
              const prevTs = new Date(result[i - 1].timestamp).getTime();
              const currTs = new Date(result[i].timestamp).getTime();
              expect(prevTs).toBeGreaterThanOrEqual(currTs);
            }

            // Verify output truncation
            for (const entry of result) {
              const output = entry.details.output as string;
              expect(output.length).toBeLessThanOrEqual(4096);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 10: Journal entry mapping
   *
   * **Validates: Requirements 10.2**
   *
   * For any Checkmk state-change event, the journal entry mapping SHALL
   * produce an object with: source equal to "checkmk", eventType equal to
   * "state_change", summary containing the service description and a state
   * transition in the format "{service}: {previousStateName} →
   * {currentStateName}", timestamp in ISO 8601 format, isLive equal to
   * true, and details containing the full event data.
   */
  describe("Property 10: Journal entry mapping", () => {
    it("each event produces correct journal entry shape", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(checkmkEventArb, { minLength: 1, maxLength: 20 }),
          async (rawEvents) => {
            // Pre-sort events descending (simulates Livestatus returning sorted data)
            const events = [...rawEvents].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
            const { plugin } = await createPluginWithMocks({
              livestatusEnabled: true,
              livestatusEvents: events,
            });

            const result = await plugin.getNodeData("testhost", "events") as Array<{
              id: string;
              nodeId: string;
              nodeUri: string;
              eventType: string;
              source: string;
              action: string;
              summary: string;
              details: Record<string, unknown>;
              timestamp: string;
              isLive: boolean;
            }>;

            expect(result).toHaveLength(events.length);

            for (const entry of result) {
              // source equals "checkmk"
              expect(entry.source).toBe("checkmk");

              // eventType equals "state_change"
              expect(entry.eventType).toBe("state_change");

              // summary format: "{service}: {prevName} → {currName}"
              // Verify it matches the pattern
              expect(entry.summary).toMatch(/^.+: (OK|WARN|CRIT|UNKNOWN) → (OK|WARN|CRIT|UNKNOWN)$/);

              // timestamp in ISO 8601 format
              expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);

              // isLive equals true
              expect(entry.isLive).toBe(true);

              // details contains event data
              expect(entry.details).toBeDefined();
              expect(typeof entry.details.serviceDescription).toBe("string");
              expect([0, 1, 2, 3]).toContain(entry.details.previousState);
              expect([0, 1, 2, 3]).toContain(entry.details.currentState);

              // action equals "state_change"
              expect(entry.action).toBe("state_change");

              // nodeId and nodeUri are set
              expect(entry.nodeId).toBe("testhost");
              expect(entry.nodeUri).toBe("checkmk:testhost");

              // id is a non-empty string (UUID)
              expect(entry.id).toBeTruthy();
              expect(typeof entry.id).toBe("string");
            }

            // Verify summary format matches input events (by finding corresponding event)
            for (const entry of result) {
              const svcDesc = entry.details.serviceDescription as string;
              const prevState = entry.details.previousState as number;
              const currState = entry.details.currentState as number;
              const prevName = SERVICE_STATE_NAMES[prevState];
              const currName = SERVICE_STATE_NAMES[currState];
              expect(entry.summary).toBe(`${svcDesc}: ${prevName} → ${currName}`);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 11: Graceful degradation
   *
   * **Validates: Requirements 12.1**
   *
   * For any data fetch operation where the upstream source is unreachable
   * or returns an error, the plugin SHALL return an empty array without
   * throwing an exception.
   */
  describe("Property 11: Graceful degradation", () => {
    it("getInventory returns empty array on service error without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(hostnameArb, async (_hostname) => {
          const { plugin } = await createPluginWithMocks({ hostsError: true });

          const result = await plugin.getInventory();

          expect(Array.isArray(result)).toBe(true);
          expect(result).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    it("getNodeData('services') returns empty array on service error without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(hostnameArb, async (hostname) => {
          const { plugin } = await createPluginWithMocks({ serviceError: true });

          const result = await plugin.getNodeData(hostname, "services");

          expect(Array.isArray(result)).toBe(true);
          expect(result).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    it("getNodeData('events') returns empty array on all-sources error without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(hostnameArb, async (hostname) => {
          // Both Livestatus and REST fail
          const { plugin } = await createPluginWithMocks({ serviceError: true });

          const result = await plugin.getNodeData(hostname, "events");

          expect(Array.isArray(result)).toBe(true);
          expect(result).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    it("unknown dataType returns empty array without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(
          hostnameArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => s !== "services" && s !== "events",
          ),
          async (hostname, dataType) => {
            const { plugin } = await createPluginWithMocks();

            const result = await plugin.getNodeData(hostname, dataType);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
