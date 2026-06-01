/**
 * MCP Tool Handler Registrations
 *
 * Registers all 11 read-only MCP tools with permission checks.
 * Each tool checks RBAC permissions before calling the underlying service.
 *
 * Tool outputs are optimised for LLM consumption — verbose fields like raw
 * logs, resource events, full catalog parameters, and duplicated facts are
 * stripped by default.  Callers can opt-in to detail via boolean flags.
 *
 * Requirements: 11–18, 19.1–19.4, 14.1–14.6
 */

import { z } from 'zod';
import type { McpDependencies, McpServerInstance } from './McpServer';
import { TOOL_PERMISSIONS } from './McpServer';
import {
  deduplicateFactSources,
  summariseCatalog,
  summariseExecution,
  summariseJournalEntry,
  summariseNode,
  summariseReport,
  summariseService,
} from './McpOutputSummariser';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

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

/** Compact JSON — no pretty-printing to save tokens. */
function jsonResult(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
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

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

export function registerAllTools(server: McpServerInstance, deps: McpDependencies): void {
  registerInventoryList(server, deps);
  registerFactsGet(server, deps);
  registerFactsBulk(server, deps);
  registerReportsQuery(server, deps);
  registerCatalogsGet(server, deps);
  registerHieraLookup(server, deps);
  registerExecutionsList(server, deps);
  registerIntegrationsList(server, deps);
  registerJournalQuery(server, deps);
  registerMonitoringServicesGet(server, deps);
  registerMonitoringEventsGet(server, deps);
}

function registerInventoryList(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('inventory_list', {
    description: 'List aggregated node inventory. Returns id, name, uri, transport, and source per node.',
    inputSchema: z.object({
      search: z.string().optional().describe('Filter nodes by name or certname'),
    }),
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
      return jsonResult(nodes.map((n) => summariseNode(n)));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerFactsGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('facts_get', {
    description: 'Retrieve facts for a node. Returns essential facts (OS, CPU, memory, networking, uptime) by default. Use include_all=true for extended facts.',
    inputSchema: z.object({
      certname: z.string().describe('Node certname to retrieve facts for'),
      include_all: z.boolean().optional().describe('Include extended facts beyond the essential set (default: false)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ certname, include_all }: { certname: string; include_all?: boolean }) => {
    const denied = await checkPermission(deps, 'facts_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const data = await deps.integrationManager.getNodeData(certname);
      const summarised = deduplicateFactSources(
        data.facts as Record<string, { facts: Record<string, unknown> }>,
        include_all === true,
      );
      return jsonResult(summarised);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerFactsBulk(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('facts_bulk', {
    description: 'Retrieve specific facts across all nodes in a single query. Returns a map of certname to fact values. Much more efficient than calling facts_get per node.',
    inputSchema: z.object({
      fact_names: z.array(z.string()).min(1).max(50).describe('Top-level fact names to retrieve (e.g. ["os", "networking", "memory"]). Max 50.'),
      include_all: z.boolean().optional().describe('Include all sub-keys of each fact (default: true for bulk). Set false to get only essential keys.'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ fact_names, include_all }: { fact_names: string[]; include_all?: boolean }) => {
    const denied = await checkPermission(deps, 'facts_bulk');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.puppetDBService) return errorResult('PuppetDB service is not available');
      const factsMap = await deps.puppetDBService.getBulkFacts(fact_names);
      const nodeCount = Object.keys(factsMap).length;

      // If include_all is explicitly false, filter to essential keys only
      if (include_all === false) {
        const essentialKeys = new Set([
          'os', 'processors', 'memory', 'networking', 'kernel',
          'system_uptime', 'virtual', 'is_virtual', 'identity',
          'timezone', 'architecture', 'fqdn', 'hostname',
        ]);
        for (const certname of Object.keys(factsMap)) {
          const nodeFacts = factsMap[certname];
          const filtered: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(nodeFacts)) {
            if (essentialKeys.has(key)) {
              filtered[key] = value;
            }
          }
          factsMap[certname] = filtered;
        }
      }

      return jsonResult({ facts: factsMap, nodeCount, factNames: fact_names });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerReportsQuery(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('reports_query', {
    description: 'Query Puppet reports. Returns summary by default (no logs/events). Use include_details=true for full data.',
    inputSchema: z.object({
      certname: z.string().optional().describe('Filter by node certname'),
      limit: z.number().optional().describe('Maximum reports to return (default: 10)'),
      status: z.string().optional().describe('Filter by status (changed, failed, unchanged)'),
      include_details: z.boolean().optional().describe('Include full logs and resource_events (default: false)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ certname, limit, status, include_details }: {
    certname?: string; limit?: number; status?: string; include_details?: boolean;
  }) => {
    const denied = await checkPermission(deps, 'reports_query');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.puppetDBService) return errorResult('PuppetDB service is not available');
      const reports = certname
        ? await deps.puppetDBService.getNodeReports(certname, limit ?? 10)
        : await deps.puppetDBService.getAllReports(limit ?? 10);
      const filtered = status ? reports.filter((r) => r.status === status) : reports;
      const summarised = filtered.map((r) =>
        summariseReport(r, include_details === true),
      );
      return jsonResult(summarised);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerCatalogsGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('catalogs_get', {
    description: 'Retrieve Puppet catalog for a node. Returns resource type/title/file/line by default. Use include_parameters=true for full parameters.',
    inputSchema: z.object({
      certname: z.string().describe('Node certname to retrieve catalog for'),
      include_parameters: z.boolean().optional().describe('Include full resource parameters (default: false)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ certname, include_parameters }: { certname: string; include_parameters?: boolean }) => {
    const denied = await checkPermission(deps, 'catalogs_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.puppetDBService) return errorResult('PuppetDB service is not available');
      const catalog = await deps.puppetDBService.getNodeCatalog(certname);
      if (!catalog) return errorResult(`No catalog found for node: ${certname}`);
      const summarised = summariseCatalog(
        catalog,
        include_parameters === true,
      );
      return jsonResult(summarised);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerHieraLookup(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('hiera_lookup', {
    description: 'Look up a Hiera key value for a node. Uses node facts to resolve hierarchy paths (e.g. os/%{facts.os.family}.yaml). Without a node, only common.yaml and static hierarchy levels are checked.',
    inputSchema: z.object({
      key: z.string().describe('Hiera key to look up'),
      node: z.string().optional().describe('Node certname for fact-based hierarchy resolution (e.g. web01.example.com). Omit to resolve without node facts.'),
      environment: z.string().optional().describe('Puppet environment (defaults to production)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ key, node, environment }: { key: string; node?: string; environment?: string }) => {
    const denied = await checkPermission(deps, 'hiera_lookup');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (!deps.hieraPlugin) return errorResult('Hiera plugin is not available');
      const result = await deps.hieraPlugin.resolveKey(node ?? 'default', key, environment ?? 'production');
      return jsonResult(result);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerExecutionsList(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('executions_list', {
    description: 'List execution history. Returns summary by default. Use include_output=true for full per-node results.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Maximum executions to return (default: 50)'),
      status: z.string().optional().describe('Filter by execution status'),
      type: z.string().optional().describe('Filter by execution type (for example: command, task, or plan)'),
      include_output: z.boolean().optional().describe('Include full per-node results and stdout/stderr (default: false)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ limit, status, type, include_output }: {
    limit?: number; status?: string; type?: string; include_output?: boolean;
  }) => {
    const denied = await checkPermission(deps, 'executions_list');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const filters: Record<string, unknown> = {};
      if (status) filters.status = status;
      if (type) filters.type = type;
      const executions = await deps.executionRepository.findAll(
        filters, { page: 1, pageSize: limit ?? 50 },
      );
      const summarised = executions.map((e) =>
        summariseExecution(e, include_output === true),
      );
      return jsonResult(summarised);
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
    description: 'Search journal entries. Returns compact entries without verbose details.',
    inputSchema: z.object({
      nodeId: z.string().optional().describe('Filter by node ID'),
      eventType: z.string().optional().describe('Filter by event type'),
      limit: z.number().optional().describe('Maximum entries to return (default: 50)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ nodeId, eventType, limit }: { nodeId?: string; eventType?: string; limit?: number }) => {
    const denied = await checkPermission(deps, 'journal_query');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      if (nodeId) {
        const entries = await deps.journalService.getNodeTimeline(nodeId, {
          limit: limit ?? 50,
        });
        const filtered = eventType ? entries.filter((e) => e.eventType === eventType) : entries;
        return jsonResult(filtered.map((e) =>
          summariseJournalEntry(e),
        ));
      }
      const entries = await deps.journalService.searchEntries('', { limit: limit ?? 50 });
      const filtered = eventType ? entries.filter((e) => e.eventType === eventType) : entries;
      return jsonResult(filtered.map((e) =>
        summariseJournalEntry(e),
      ));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerMonitoringServicesGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('monitoring_services_get', {
    description: 'Get live Checkmk service monitoring status for a node. Returns description, state, plugin output, and last check per service.',
    inputSchema: z.object({
      nodeId: z.string().describe('Node ID (hostname) to retrieve service status for'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ nodeId }: { nodeId: string }) => {
    const denied = await checkPermission(deps, 'monitoring_services_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const plugin = deps.integrationManager.getInformationSource('checkmk');
      if (!plugin?.isInitialized()) {
        return errorResult('Checkmk plugin is not configured or not initialized');
      }
      const services = await plugin.getNodeData(nodeId, 'services') as object[];
      if (Array.isArray(services) && services.length === 0) {
        const inventory = await plugin.getInventory();
        const nodeExists = inventory.some(
          (n) => n.id.toLowerCase() === nodeId.toLowerCase() ||
                 n.name.toLowerCase() === nodeId.toLowerCase(),
        );
        if (!nodeExists) {
          return errorResult(`Node '${nodeId}' is not known to Checkmk`);
        }
      }
      const summarised = Array.isArray(services)
        ? services.map((s) => summariseService(s))
        : [];
      return jsonResult(summarised);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

function registerMonitoringEventsGet(server: McpServerInstance, deps: McpDependencies): void {
  server.registerTool('monitoring_events_get', {
    description: 'Get Checkmk state-change events for a node. Returns timestamp, service, state transition, and output per event.',
    inputSchema: z.object({
      nodeId: z.string().describe('Node ID (hostname) to retrieve events for'),
      limit: z.number().min(1).max(1000).optional().describe('Maximum events to return (default: 200)'),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ nodeId, limit }: { nodeId: string; limit?: number }) => {
    const denied = await checkPermission(deps, 'monitoring_events_get');
    if (denied) return permissionError(denied.resource, denied.action);
    try {
      const plugin = deps.integrationManager.getInformationSource('checkmk');
      if (!plugin?.isInitialized()) {
        return errorResult('Checkmk plugin is not configured or not initialized');
      }
      const events = await plugin.getNodeData(nodeId, 'events') as object[];
      if (Array.isArray(events) && events.length === 0) {
        const inventory = await plugin.getInventory();
        const nodeExists = inventory.some(
          (n) => n.id.toLowerCase() === nodeId.toLowerCase() ||
                 n.name.toLowerCase() === nodeId.toLowerCase(),
        );
        if (!nodeExists) {
          return errorResult(`Node '${nodeId}' is not known to Checkmk`);
        }
      }
      const effectiveLimit = limit ?? 200;
      const limited = Array.isArray(events) ? events.slice(0, effectiveLimit) : [];
      const summarised = limited.map((e) => summariseJournalEntry(e));
      return jsonResult(summarised);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}
