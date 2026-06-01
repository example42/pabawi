import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpDependencies, McpServerInstance } from '../../../src/mcp/McpServer';
import { TOOL_PERMISSIONS } from '../../../src/mcp/McpServer';
import { registerAllTools } from '../../../src/mcp/McpToolHandlers';

/**
 * Unit tests for Checkmk MCP tools: monitoring_services_get and monitoring_events_get.
 *
 * Validates: Requirements 14.2, 14.3, 14.4, 14.5
 */

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

const registeredTools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();

function createMockServer(): McpServerInstance {
  return {
    registerTool: (
      name: string,
      config: Record<string, unknown>,
      cb: ToolHandler,
    ) => {
      registeredTools.set(name, { config, handler: cb });
    },
    connect: vi.fn(),
    close: vi.fn(),
  } as unknown as McpServerInstance;
}

function createMockCheckmkPlugin(overrides?: {
  initialized?: boolean;
  services?: object[];
  events?: object[];
  inventory?: { id: string; name: string }[];
}): { isInitialized: ReturnType<typeof vi.fn>; getNodeData: ReturnType<typeof vi.fn>; getInventory: ReturnType<typeof vi.fn> } {
  const initialized = overrides?.initialized ?? true;
  const services = overrides?.services ?? [];
  const events = overrides?.events ?? [];
  const inventory = overrides?.inventory ?? [
    { id: 'web01.example.com', name: 'web01.example.com' },
    { id: 'db01.example.com', name: 'db01.example.com' },
  ];

  return {
    isInitialized: vi.fn().mockReturnValue(initialized),
    getNodeData: vi.fn().mockImplementation((_nodeId: string, dataType: string) => {
      if (dataType === 'services') return Promise.resolve(services);
      if (dataType === 'events') return Promise.resolve(events);
      return Promise.resolve([]);
    }),
    getInventory: vi.fn().mockResolvedValue(inventory),
  };
}

function createMockDeps(overrides?: Partial<McpDependencies> & {
  checkmkPlugin?: ReturnType<typeof createMockCheckmkPlugin> | null;
}): McpDependencies {
  const { checkmkPlugin, ...depsOverrides } = overrides ?? {};
  const mockPlugin = checkmkPlugin === undefined
    ? createMockCheckmkPlugin()
    : checkmkPlugin;

  return {
    integrationManager: {
      getAggregatedInventory: vi.fn().mockResolvedValue({ nodes: [], groups: [], sources: {} }),
      getNodeData: vi.fn().mockResolvedValue({ node: {}, facts: {}, executionHistory: [] }),
      healthCheckAll: vi.fn().mockResolvedValue(new Map()),
      getInformationSource: vi.fn().mockImplementation((name: string) => {
        if (name === 'checkmk') return mockPlugin;
        return null;
      }),
    } as unknown as McpDependencies['integrationManager'],
    executionRepository: {
      findAll: vi.fn().mockResolvedValue([]),
    } as unknown as McpDependencies['executionRepository'],
    journalService: {
      getNodeTimeline: vi.fn().mockResolvedValue([]),
      searchEntries: vi.fn().mockResolvedValue([]),
    } as unknown as McpDependencies['journalService'],
    permissionService: {
      hasPermission: vi.fn().mockResolvedValue(true),
    } as unknown as McpDependencies['permissionService'],
    hieraPlugin: undefined,
    puppetDBService: undefined,
    puppetRunHistoryService: undefined,
    mcpUserId: 'mcp-user-id',
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as McpDependencies['logger'],
    version: '1.4.0',
    ...depsOverrides,
  };
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = registeredTools.get(name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

describe('Checkmk MCP Tools', () => {
  beforeEach(() => {
    registeredTools.clear();
    vi.clearAllMocks();
  });

  describe('TOOL_PERMISSIONS', () => {
    it('monitoring_services_get requires checkmk:read', () => {
      expect(TOOL_PERMISSIONS.monitoring_services_get).toEqual({ resource: 'checkmk', action: 'read' });
    });

    it('monitoring_events_get requires checkmk:read', () => {
      expect(TOOL_PERMISSIONS.monitoring_events_get).toEqual({ resource: 'checkmk', action: 'read' });
    });
  });

  describe('monitoring_services_get', () => {
    describe('permission denied', () => {
      it('returns error when user lacks checkmk:read', async () => {
        const deps = createMockDeps({
          permissionService: {
            hasPermission: vi.fn().mockResolvedValue(false),
          } as unknown as McpDependencies['permissionService'],
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('checkmk/read');
      });
    });

    describe('plugin not configured', () => {
      it('returns error when plugin is not initialized', async () => {
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ initialized: false }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not configured or not initialized');
      });

      it('returns error when plugin is null (not registered)', async () => {
        const deps = createMockDeps({ checkmkPlugin: null });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not configured or not initialized');
      });
    });

    describe('node unknown', () => {
      it('returns error when node is not known to Checkmk', async () => {
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({
            services: [],
            inventory: [{ id: 'other-host', name: 'other-host' }],
          }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'unknown-host' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("'unknown-host' is not known to Checkmk");
      });
    });

    describe('success', () => {
      it('returns summarised service data with correct shape', async () => {
        const mockServices = [
          {
            description: 'CPU load',
            state: 0,
            stateType: 1,
            pluginOutput: 'OK - 15min load: 0.42',
            lastCheck: 1700000000,
            lastState: 0,
            lastStateChange: 1699999000,
          },
          {
            description: 'Memory',
            state: 2,
            stateType: 1,
            pluginOutput: 'CRIT - 95% used',
            lastCheck: 1700000100,
            lastState: 1,
            lastStateChange: 1700000050,
          },
        ];
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ services: mockServices }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text) as Record<string, unknown>[];
        expect(data).toHaveLength(2);

        // Verify summarised shape: description, state name, pluginOutput, lastCheck
        expect(data[0]).toEqual({
          description: 'CPU load',
          state: 'OK',
          pluginOutput: 'OK - 15min load: 0.42',
          lastCheck: 1700000000,
        });
        expect(data[1]).toEqual({
          description: 'Memory',
          state: 'CRIT',
          pluginOutput: 'CRIT - 95% used',
          lastCheck: 1700000100,
        });
      });

      it('returns empty array for known node with no services', async () => {
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({
            services: [],
            inventory: [{ id: 'web01.example.com', name: 'web01.example.com' }],
          }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_services_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text) as unknown[];
        expect(data).toHaveLength(0);
      });
    });
  });

  describe('monitoring_events_get', () => {
    describe('permission denied', () => {
      it('returns error when user lacks checkmk:read', async () => {
        const deps = createMockDeps({
          permissionService: {
            hasPermission: vi.fn().mockResolvedValue(false),
          } as unknown as McpDependencies['permissionService'],
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('checkmk/read');
      });
    });

    describe('plugin disabled', () => {
      it('returns error when plugin is not initialized', async () => {
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ initialized: false }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not configured or not initialized');
      });

      it('returns error when plugin is null (not registered)', async () => {
        const deps = createMockDeps({ checkmkPlugin: null });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not configured or not initialized');
      });
    });

    describe('node unknown', () => {
      it('returns error when node is not known to Checkmk', async () => {
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({
            events: [],
            inventory: [{ id: 'other-host', name: 'other-host' }],
          }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'unknown-host' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("'unknown-host' is not known to Checkmk");
      });
    });

    describe('success', () => {
      it('returns summarised events on success', async () => {
        const mockEvents = [
          {
            id: 'evt-1',
            nodeId: 'web01.example.com',
            nodeUri: 'checkmk:web01.example.com',
            eventType: 'state_change',
            source: 'checkmk',
            action: 'state_change',
            summary: 'HTTP: OK → CRIT',
            details: { previousState: 0, currentState: 2 },
            timestamp: '2024-01-15T10:30:00Z',
            isLive: true,
          },
          {
            id: 'evt-2',
            nodeId: 'web01.example.com',
            nodeUri: 'checkmk:web01.example.com',
            eventType: 'state_change',
            source: 'checkmk',
            action: 'state_change',
            summary: 'CPU load: OK → WARN',
            details: { previousState: 0, currentState: 1 },
            timestamp: '2024-01-15T09:15:00Z',
            isLive: true,
          },
        ];
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ events: mockEvents }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text) as Record<string, unknown>[];
        expect(data).toHaveLength(2);

        // Verify summarised journal entry shape (details stripped, status extracted)
        expect(data[0]).toHaveProperty('eventType', 'state_change');
        expect(data[0]).toHaveProperty('source', 'checkmk');
        expect(data[0]).toHaveProperty('summary', 'HTTP: OK → CRIT');
        expect(data[0]).toHaveProperty('timestamp', '2024-01-15T10:30:00Z');
        expect(data[0]).toHaveProperty('isLive', true);
        // details should be stripped by summariseJournalEntry
        expect(data[0]).not.toHaveProperty('details');
      });

      it('respects limit parameter', async () => {
        const mockEvents = Array.from({ length: 10 }, (_, i) => ({
          id: `evt-${i}`,
          nodeId: 'web01.example.com',
          eventType: 'state_change',
          source: 'checkmk',
          summary: `Event ${i}`,
          timestamp: `2024-01-15T${String(10 + i).padStart(2, '0')}:00:00Z`,
          isLive: true,
        }));
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ events: mockEvents }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com', limit: 3 });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text) as unknown[];
        expect(data).toHaveLength(3);
      });

      it('defaults to 200 limit when not specified', async () => {
        // Create 5 events — all should be returned since 5 < 200
        const mockEvents = Array.from({ length: 5 }, (_, i) => ({
          id: `evt-${i}`,
          nodeId: 'web01.example.com',
          eventType: 'state_change',
          source: 'checkmk',
          summary: `Event ${i}`,
          timestamp: `2024-01-15T${String(10 + i).padStart(2, '0')}:00:00Z`,
          isLive: true,
        }));
        const deps = createMockDeps({
          checkmkPlugin: createMockCheckmkPlugin({ events: mockEvents }),
        });
        registerAllTools(createMockServer(), deps);

        const result = await callTool('monitoring_events_get', { nodeId: 'web01.example.com' });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text) as unknown[];
        expect(data).toHaveLength(5);
      });
    });
  });
});
