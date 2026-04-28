import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpDependencies, McpServerInstance } from '../../../src/mcp/McpServer';
import { TOOL_PERMISSIONS } from '../../../src/mcp/McpServer';
import { registerAllTools } from '../../../src/mcp/McpToolHandlers';

/**
 * Unit tests for MCP tool handlers.
 *
 * For each tool:
 * - Mock permission denied → verify error response and service not called
 * - Mock permission granted → verify correct data returned
 * - For inventory_list: test search filtering with specific examples
 *
 * Requirements: 11.1, 11.2, 12.1, 13.1, 14.1, 15.1, 16.1, 17.1, 18.1, 19.1, 19.2
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

function createMockDeps(overrides?: Partial<McpDependencies>): McpDependencies {
  return {
    integrationManager: {
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'node1.example.com', name: 'node1.example.com', uri: 'ssh://node1', transport: 'ssh', config: {}, sources: ['bolt'], linked: false, sourceData: {} },
          { id: 'web-server-01', name: 'web-server-01', uri: 'ssh://web1', transport: 'ssh', config: {}, sources: ['ansible'], linked: false, sourceData: {} },
          { id: 'db-primary', name: 'db-primary', uri: 'ssh://db1', transport: 'ssh', config: {}, sources: ['puppetdb'], linked: false, sourceData: {} },
        ],
        groups: [],
        sources: {},
      }),
      getNodeData: vi.fn().mockResolvedValue({
        node: { id: 'node1', name: 'node1' },
        facts: { bolt: { nodeId: 'node1', gatheredAt: '2024-01-01', facts: {} } },
        executionHistory: [],
      }),
      healthCheckAll: vi.fn().mockResolvedValue(new Map([
        ['bolt', { healthy: true, lastCheck: '2024-01-01' }],
        ['puppetdb', { healthy: false, message: 'Connection refused', lastCheck: '2024-01-01' }],
      ])),
    } as unknown as McpDependencies['integrationManager'],
    executionRepository: {
      findAll: vi.fn().mockResolvedValue([
        { id: 'exec-1', type: 'command', status: 'success', startedAt: '2024-01-01' },
      ]),
    } as unknown as McpDependencies['executionRepository'],
    journalService: {
      getNodeTimeline: vi.fn().mockResolvedValue([
        { id: 'j1', nodeId: 'node1', eventType: 'puppet_run', summary: 'Run completed' },
      ]),
      searchEntries: vi.fn().mockResolvedValue([
        { id: 'j1', nodeId: 'node1', eventType: 'puppet_run', summary: 'Run completed' },
        { id: 'j2', nodeId: 'node2', eventType: 'note', summary: 'Manual note' },
      ]),
    } as unknown as McpDependencies['journalService'],
    permissionService: {
      hasPermission: vi.fn().mockResolvedValue(true),
    } as unknown as McpDependencies['permissionService'],
    hieraPlugin: {
      resolveKey: vi.fn().mockResolvedValue({
        key: 'ntp::servers', found: true, resolvedValue: ['0.pool.ntp.org'],
      }),
    } as unknown as McpDependencies['hieraPlugin'],
    puppetDBService: {
      getNodeReports: vi.fn().mockResolvedValue([
        { certname: 'node1', hash: 'abc', status: 'changed', environment: 'production' },
      ]),
      getAllReports: vi.fn().mockResolvedValue([
        { certname: 'node1', hash: 'abc', status: 'changed', environment: 'production' },
        { certname: 'node2', hash: 'def', status: 'unchanged', environment: 'production' },
      ]),
      getNodeCatalog: vi.fn().mockResolvedValue({
        certname: 'node1', version: '1.0', resources: [], edges: [],
      }),
    } as unknown as McpDependencies['puppetDBService'],
    puppetRunHistoryService: undefined,
    mcpUserId: 'mcp-user-id',
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as McpDependencies['logger'],
    version: '1.1.0',
    ...overrides,
  };
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = registeredTools.get(name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

describe('MCP Tool Handlers', () => {
  let deps: McpDependencies;

  beforeEach(() => {
    registeredTools.clear();
    vi.clearAllMocks();
    deps = createMockDeps();
    const server = createMockServer();
    registerAllTools(server, deps);
  });

  it('registers all 8 tools', () => {
    const expectedTools = Object.keys(TOOL_PERMISSIONS);
    for (const name of expectedTools) {
      expect(registeredTools.has(name)).toBe(true);
    }
    expect(registeredTools.size).toBe(8);
  });

  it('all tools have readOnlyHint annotation', () => {
    for (const [, { config }] of registeredTools) {
      const annotations = config.annotations as { readOnlyHint?: boolean } | undefined;
      expect(annotations?.readOnlyHint).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Permission denied tests
  // -----------------------------------------------------------------------
  describe('permission denied', () => {
    beforeEach(() => {
      registeredTools.clear();
      vi.clearAllMocks();
      deps = createMockDeps({
        permissionService: {
          hasPermission: vi.fn().mockResolvedValue(false),
        } as unknown as McpDependencies['permissionService'],
      });
      registerAllTools(createMockServer(), deps);
    });

    it('inventory_list returns error when denied', async () => {
      const r = await callTool('inventory_list', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('ansible/read');
      expect(deps.integrationManager.getAggregatedInventory).not.toHaveBeenCalled();
    });

    it('facts_get returns error when denied', async () => {
      const r = await callTool('facts_get', { certname: 'node1' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('puppetdb/read');
      expect(deps.integrationManager.getNodeData).not.toHaveBeenCalled();
    });

    it('reports_query returns error when denied', async () => {
      const r = await callTool('reports_query', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('puppetdb/read');
    });

    it('catalogs_get returns error when denied', async () => {
      const r = await callTool('catalogs_get', { certname: 'node1' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('puppetdb/read');
    });

    it('hiera_lookup returns error when denied', async () => {
      const r = await callTool('hiera_lookup', { key: 'ntp::servers' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('hiera/read');
      expect(deps.hieraPlugin!.resolveKey).not.toHaveBeenCalled();
    });

    it('executions_list returns error when denied', async () => {
      const r = await callTool('executions_list', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('bolt/read');
      expect(deps.executionRepository.findAll).not.toHaveBeenCalled();
    });

    it('integrations_list returns error when denied', async () => {
      const r = await callTool('integrations_list', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('integration_config/read');
      expect(deps.integrationManager.healthCheckAll).not.toHaveBeenCalled();
    });

    it('journal_query returns error when denied', async () => {
      const r = await callTool('journal_query', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('journal/read');
      expect(deps.journalService.searchEntries).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Permission granted tests
  // -----------------------------------------------------------------------
  describe('permission granted', () => {
    it('inventory_list returns all nodes', async () => {
      const r = await callTool('inventory_list', {});
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(3);
    });

    it('facts_get returns node facts', async () => {
      const r = await callTool('facts_get', { certname: 'node1' });
      expect(r.isError).toBeUndefined();
      expect(deps.integrationManager.getNodeData).toHaveBeenCalledWith('node1');
    });

    it('reports_query returns reports', async () => {
      const r = await callTool('reports_query', {});
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(2);
    });

    it('reports_query filters by certname', async () => {
      await callTool('reports_query', { certname: 'node1', limit: 5 });
      expect(deps.puppetDBService!.getNodeReports).toHaveBeenCalledWith('node1', 5);
    });

    it('reports_query filters by status', async () => {
      const r = await callTool('reports_query', { status: 'changed' });
      const data = JSON.parse(r.content[0].text) as { status: string }[];
      expect(data.every((x) => x.status === 'changed')).toBe(true);
    });

    it('catalogs_get returns catalog', async () => {
      const r = await callTool('catalogs_get', { certname: 'node1' });
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as { certname: string };
      expect(data.certname).toBe('node1');
    });

    it('hiera_lookup returns resolved key', async () => {
      const r = await callTool('hiera_lookup', { key: 'ntp::servers' });
      expect(r.isError).toBeUndefined();
      expect(deps.hieraPlugin!.resolveKey).toHaveBeenCalledWith('default', 'ntp::servers', 'production');
    });

    it('hiera_lookup uses custom environment', async () => {
      await callTool('hiera_lookup', { key: 'ntp::servers', environment: 'staging' });
      expect(deps.hieraPlugin!.resolveKey).toHaveBeenCalledWith('default', 'ntp::servers', 'staging');
    });

    it('executions_list returns executions', async () => {
      const r = await callTool('executions_list', {});
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(1);
    });

    it('integrations_list returns health status', async () => {
      const r = await callTool('integrations_list', {});
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as Record<string, unknown>;
      expect(data).toHaveProperty('bolt');
      expect(data).toHaveProperty('puppetdb');
    });

    it('journal_query returns entries', async () => {
      const r = await callTool('journal_query', {});
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(2);
    });

    it('journal_query filters by nodeId', async () => {
      await callTool('journal_query', { nodeId: 'node1' });
      expect(deps.journalService.getNodeTimeline).toHaveBeenCalledWith('node1', expect.objectContaining({ limit: 50 }));
    });

    it('journal_query filters by eventType', async () => {
      const r = await callTool('journal_query', { eventType: 'puppet_run' });
      const data = JSON.parse(r.content[0].text) as { eventType: string }[];
      expect(data.every((e) => e.eventType === 'puppet_run')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // inventory_list search filtering
  // -----------------------------------------------------------------------
  describe('inventory_list search filtering', () => {
    it('filters by name substring', async () => {
      const r = await callTool('inventory_list', { search: 'web' });
      const data = JSON.parse(r.content[0].text) as { name: string }[];
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('web-server-01');
    });

    it('filters by id substring', async () => {
      const r = await callTool('inventory_list', { search: 'db-primary' });
      const data = JSON.parse(r.content[0].text) as { id: string }[];
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('db-primary');
    });

    it('search is case-insensitive', async () => {
      const r = await callTool('inventory_list', { search: 'WEB' });
      const data = JSON.parse(r.content[0].text) as { name: string }[];
      expect(data).toHaveLength(1);
    });

    it('returns empty when no match', async () => {
      const r = await callTool('inventory_list', { search: 'nonexistent' });
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(0);
    });

    it('returns all when search omitted', async () => {
      const r = await callTool('inventory_list', {});
      const data = JSON.parse(r.content[0].text) as unknown[];
      expect(data).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Service unavailability
  // -----------------------------------------------------------------------
  describe('service unavailability', () => {
    it('reports_query errors when PuppetDB unavailable', async () => {
      registeredTools.clear();
      vi.clearAllMocks();
      deps = createMockDeps({ puppetDBService: undefined });
      registerAllTools(createMockServer(), deps);
      const r = await callTool('reports_query', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('PuppetDB service is not available');
    });

    it('catalogs_get errors when PuppetDB unavailable', async () => {
      registeredTools.clear();
      vi.clearAllMocks();
      deps = createMockDeps({ puppetDBService: undefined });
      registerAllTools(createMockServer(), deps);
      const r = await callTool('catalogs_get', { certname: 'node1' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('PuppetDB service is not available');
    });

    it('hiera_lookup errors when Hiera unavailable', async () => {
      registeredTools.clear();
      vi.clearAllMocks();
      deps = createMockDeps({ hieraPlugin: undefined });
      registerAllTools(createMockServer(), deps);
      const r = await callTool('hiera_lookup', { key: 'test' });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('Hiera plugin is not available');
    });
  });
});
