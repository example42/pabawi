import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { TOOL_PERMISSIONS } from '../../../src/mcp/McpServer';
import { registerAllTools } from '../../../src/mcp/McpToolHandlers';
import type { McpDependencies, McpServerInstance } from '../../../src/mcp/McpServer';

/**
 * Property 4: Universal MCP tool permission enforcement
 *
 * For each MCP tool × {true, false} permission state, verify:
 * - When permission denied, error response returned and service not called
 * - When granted, service called and data returned
 *
 * **Validates: Requirements 19.1, 19.2**
 *
 * Feature: rbac-and-mcp-server, Property 4: Universal MCP tool permission enforcement
 */

const TOOL_NAMES = Object.keys(TOOL_PERMISSIONS);

/** Minimal valid input args for each tool handler. */
const TOOL_DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  inventory_list: {},
  facts_get: { certname: 'test.example.com' },
  facts_bulk: { fact_names: ['os', 'memory'] },
  reports_query: {},
  catalogs_get: { certname: 'test.example.com' },
  hiera_lookup: { key: 'test::key' },
  executions_list: {},
  integrations_list: {},
  journal_query: {},
};

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

/**
 * Creates a capturing McpServerInstance that stores registered handlers so
 * they can be invoked directly in tests.
 */
function createCapturingServer(): {
  server: McpServerInstance;
  handlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResult>>;
} {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<ToolResult>>();
  const server: McpServerInstance = {
    registerTool: (name, _config, cb) => {
      handlers.set(name, cb as (args: Record<string, unknown>) => Promise<ToolResult>);
    },
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { server, handlers };
}

/**
 * Creates mock dependencies with controllable permission responses.
 * All service methods are tracked via vi.fn() spies.
 */
function createMockDeps(permissionGranted: boolean) {
  const hasPermission = vi.fn().mockResolvedValue(permissionGranted);
  const getAggregatedInventory = vi.fn().mockResolvedValue({ nodes: [] });
  const getNodeData = vi.fn().mockResolvedValue({ facts: {} });
  const healthCheckAll = vi.fn().mockResolvedValue(new Map());
  const getNodeReports = vi.fn().mockResolvedValue([]);
  const getAllReports = vi.fn().mockResolvedValue([]);
  const getNodeCatalog = vi.fn().mockResolvedValue({ certname: 'test', resources: [], edges: [] });
  const resolveKey = vi.fn().mockResolvedValue({ key: 'test', found: true });
  const findAll = vi.fn().mockResolvedValue([]);
  const getNodeTimeline = vi.fn().mockResolvedValue([]);
  const searchEntries = vi.fn().mockResolvedValue([]);

  return {
    permissionService: { hasPermission },
    integrationManager: { getAggregatedInventory, getNodeData, healthCheckAll },
    puppetDBService: { getNodeReports, getAllReports, getNodeCatalog, getBulkFacts: vi.fn().mockResolvedValue({}) },
    hieraPlugin: { resolveKey },
    executionRepository: { findAll },
    journalService: { getNodeTimeline, searchEntries },
    puppetRunHistoryService: undefined,
    mcpUserId: 'test-user-id',
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    version: '1.0.0',
  };
}

type MockDeps = ReturnType<typeof createMockDeps>;

/**
 * Returns the primary service spy for a given tool so we can assert it was
 * (or was not) called depending on permission state.
 */
function getServiceSpy(toolName: string, deps: MockDeps): ReturnType<typeof vi.fn> | undefined {
  switch (toolName) {
    case 'inventory_list': return deps.integrationManager.getAggregatedInventory;
    case 'facts_get': return deps.integrationManager.getNodeData;
    case 'facts_bulk': return deps.puppetDBService.getBulkFacts;
    case 'reports_query': return deps.puppetDBService.getAllReports;
    case 'catalogs_get': return deps.puppetDBService.getNodeCatalog;
    case 'hiera_lookup': return deps.hieraPlugin.resolveKey;
    case 'executions_list': return deps.executionRepository.findAll;
    case 'integrations_list': return deps.integrationManager.healthCheckAll;
    case 'journal_query': return deps.journalService.searchEntries;
    default: return undefined;
  }
}

const toolNameArb = fc.constantFrom(...TOOL_NAMES);
const permissionArb = fc.boolean();

describe('Property 4: Universal MCP tool permission enforcement', () => {
  it('denied permission returns error and does not call service', async () => {
    await fc.assert(
      fc.asyncProperty(toolNameArb, async (toolName) => {
        const deps = createMockDeps(false);
        const { server, handlers } = createCapturingServer();
        registerAllTools(server, deps as unknown as McpDependencies);

        const handler = handlers.get(toolName);
        expect(handler).toBeDefined();

        const result = await handler!(TOOL_DEFAULT_ARGS[toolName] ?? {});

        // hasPermission MUST have been called by the real handler
        expect(deps.permissionService.hasPermission).toHaveBeenCalledWith(
          'test-user-id',
          TOOL_PERMISSIONS[toolName].resource,
          TOOL_PERMISSIONS[toolName].action,
        );

        // Error response with permission message
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Insufficient permissions');

        // Underlying service method must NOT have been called
        const spy = getServiceSpy(toolName, deps);
        if (spy) {
          expect(spy).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 20 },
    );
  });

  it('for each tool × permission state, enforcement is consistent', async () => {
    await fc.assert(
      fc.asyncProperty(toolNameArb, permissionArb, async (toolName, granted) => {
        const deps = createMockDeps(granted);
        const { server, handlers } = createCapturingServer();
        registerAllTools(server, deps as unknown as McpDependencies);

        const handler = handlers.get(toolName)!;
        const result = await handler(TOOL_DEFAULT_ARGS[toolName] ?? {});

        // hasPermission MUST always be called with the correct arguments
        expect(deps.permissionService.hasPermission).toHaveBeenCalledWith(
          'test-user-id',
          TOOL_PERMISSIONS[toolName].resource,
          TOOL_PERMISSIONS[toolName].action,
        );

        const spy = getServiceSpy(toolName, deps);

        if (!granted) {
          // Permission denied: error response, service not called
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain('Insufficient permissions');
          if (spy) expect(spy).not.toHaveBeenCalled();
        } else {
          // Permission granted: service called, no error
          expect(result.isError).toBeUndefined();
          if (spy) expect(spy).toHaveBeenCalled();
        }
      }),
      { numRuns: 20 },
    );
  });

  it('every tool has a permission mapping', () => {
    fc.assert(
      fc.property(toolNameArb, (toolName) => {
        const perm = TOOL_PERMISSIONS[toolName];
        expect(perm).toBeDefined();
        expect(perm.resource).toBeTruthy();
        expect(perm.action).toBe('read');
      }),
      { numRuns: 20 },
    );
  });
});
