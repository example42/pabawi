/**
 * MCP Tool Handler Registrations
 *
 * Registers all 8 read-only MCP tools with permission checks.
 * Each tool checks RBAC permissions before calling the underlying service.
 *
 * Requirements: 11–18, 19.1–19.4
 */

import { z } from 'zod';
import type { McpDependencies, McpServerInstance } from './McpServer';
import { TOOL_PERMISSIONS } from './McpServer';

function permissionError(resource: string, action: string): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return {
    content: [{ type: 'text' as const, text: `Insufficient permissions: requires ${resource}/${action}` }],
    isError: true,
  };
}

function errorResult(message: string): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function jsonResult(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

async function checkPermission(
  deps: McpDependencies,
  toolName: string,
): Promise<{ resource: string; action: string } | null> {
  const perm = TOOL_PERMISSIONS[toolName];
  const allowed = await deps.permissionService.hasPermission(
    deps.mcpUserId, perm.resource, perm.action,
  );
  return allowed ? null : perm;
}

export function registerAllTools(server: McpServerInstance, deps: McpDependencies): void {
  registerInventoryList(server, deps);
  registerFactsGet(server, deps);
  registerReportsQuery(server, deps);
  registerCatalogsGet(server, deps);
  registerHieraLookup(server, deps);
  registerExecutionsList(server, deps);
  registerIntegrationsList(server, deps);
  registerJournalQuery(server, deps);
}

function registerInventoryList(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('inventory_list', {
    description: 'List aggregated node inventory from all active integrations',
    inputSchema: { search: z.string().optional().describe('Filter nodes by name or certname') },
    annotations: { readOnlyHint: true },
  }, async ({ search }: { search?: string }) => {
    const denied = await checkPermission(deps, 'inventory_list');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const inventory = await deps.integrationManager.getAggregatedInventory();
      let nodes = inventory.nodes;
      if (search) {
        const q = search.toLowerCase();
        nodes = nodes.filter((n) =>
          n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
        );
      }
      return jsonResult(nodes);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerFactsGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('facts_get', {
    description: 'Retrieve facts for a specified node',
    inputSchema: { certname: z.string().describe('Node certname to retrieve facts for') },
    annotations: { readOnlyHint: true },
  }, async ({ certname }: { certname: string }) => {
    const denied = await checkPermission(deps, 'facts_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const data = await deps.integrationManager.getNodeData(certname);
      return jsonResult(data.facts);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerReportsQuery(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('reports_query', {
    description: 'Query Puppet reports with optional filtering',
    inputSchema: {
      certname: z.string().optional().describe('Filter by node certname'),
      limit: z.number().optional().describe('Maximum number of reports to return'),
      status: z.string().optional().describe('Filter by report status'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ certname, limit, status }: { certname?: string; limit?: number; status?: string }) => {
    const denied = await checkPermission(deps, 'reports_query');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.puppetDBService) return errorResult('PuppetDB service is not available');
      if (certname) {
        const reports = await deps.puppetDBService.getNodeReports(certname, limit ?? 10);
        return jsonResult(status ? reports.filter((r) => r.status === status) : reports);
      }
      const reports = await deps.puppetDBService.getAllReports(limit ?? 10);
      return jsonResult(status ? reports.filter((r) => r.status === status) : reports);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerCatalogsGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('catalogs_get', {
    description: 'Retrieve the Puppet catalog for a specified node',
    inputSchema: { certname: z.string().describe('Node certname to retrieve catalog for') },
    annotations: { readOnlyHint: true },
  }, async ({ certname }: { certname: string }) => {
    const denied = await checkPermission(deps, 'catalogs_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.puppetDBService) return errorResult('PuppetDB service is not available');
      const catalog = await deps.puppetDBService.getNodeCatalog(certname);
      if (!catalog) return errorResult(`No catalog found for node: ${certname}`);
      return jsonResult(catalog);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerHieraLookup(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('hiera_lookup', {
    description: 'Look up a Hiera key value for a given environment',
    inputSchema: {
      key: z.string().describe('Hiera key to look up'),
      environment: z.string().optional().describe('Puppet environment (defaults to production)'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ key, environment }: { key: string; environment?: string }) => {
    const denied = await checkPermission(deps, 'hiera_lookup');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.hieraPlugin) return errorResult('Hiera plugin is not available');
      const result = await deps.hieraPlugin.resolveKey('default', key, environment ?? 'production');
      return jsonResult(result);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerExecutionsList(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('executions_list', {
    description: 'List execution history with optional filtering',
    inputSchema: {
      limit: z.number().optional().describe('Maximum number of executions to return'),
      status: z.string().optional().describe('Filter by execution status'),
      tool: z.string().optional().describe('Filter by execution tool type'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ limit, status, tool }: { limit?: number; status?: string; tool?: string }) => {
    const denied = await checkPermission(deps, 'executions_list');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const filters: Record<string, unknown> = {};
      if (status) filters.status = status;
      if (tool) filters.type = tool;
      const executions = await deps.executionRepository.findAll(
        filters, { page: 1, pageSize: limit ?? 50 },
      );
      return jsonResult(executions);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerIntegrationsList(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('integrations_list', {
    description: 'List all configured integrations with their health status',
    annotations: { readOnlyHint: true },
  }, async () => {
    const denied = await checkPermission(deps, 'integrations_list');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const healthMap = await deps.integrationManager.healthCheckAll();
      const result: Record<string, unknown> = {};
      for (const [name, status] of healthMap.entries()) {
        result[name] = status;
      }
      return jsonResult(result);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerJournalQuery(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('journal_query', {
    description: 'Search journal entries with optional filtering',
    inputSchema: {
      nodeId: z.string().optional().describe('Filter by node ID'),
      eventType: z.string().optional().describe('Filter by event type'),
      limit: z.number().optional().describe('Maximum number of entries to return'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ nodeId, eventType, limit }: { nodeId?: string; eventType?: string; limit?: number }) => {
    const denied = await checkPermission(deps, 'journal_query');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (nodeId) {
        const entries = await deps.journalService.getNodeTimeline(nodeId, {
          limit: limit ?? 50,
          eventType: eventType as never,
        });
        return jsonResult(entries);
      }
      const entries = await deps.journalService.searchEntries('', { limit: limit ?? 50 });
      const filtered = eventType ? entries.filter((e) => e.eventType === eventType) : entries;
      return jsonResult(filtered);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}
