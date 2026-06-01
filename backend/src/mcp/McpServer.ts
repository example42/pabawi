/**
 * MCP Server Module
 *
 * Creates and configures the Model Context Protocol server with read-only
 * infrastructure tools, gated by RBAC permission checks.
 *
 * Requirements: 10.3, 10.4, 11–18, 19.1–19.4
 */

import type { IntegrationManager } from '../integrations/IntegrationManager';
import type { ExecutionRepository } from '../database/ExecutionRepository';
import type { JournalService } from '../services/journal/JournalService';
import type { PermissionService } from '../services/PermissionService';
import type { HieraPlugin } from '../integrations/hiera/HieraPlugin';
import type { PuppetDBService } from '../integrations/puppetdb/PuppetDBService';
import type { PuppetRunHistoryService } from '../services/PuppetRunHistoryService';
import type { LoggerService } from '../services/LoggerService';
import type { ZodTypeAny } from 'zod';
import { registerAllTools } from './McpToolHandlers';

// MCP SDK uses package.json "exports" which requires moduleResolution >= node16.
// The backend uses moduleResolution: "node", so we use require() for runtime compat.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { McpServer: McpServerClass } = require('@modelcontextprotocol/sdk/server/mcp.js') as {
  McpServer: new (info: { name: string; version: string }, opts: { capabilities: { tools: Record<string, unknown> } }) => McpServerInstance;
};

const LOG_COMPONENT = 'McpServer';

export interface McpServerInstance {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: ZodTypeAny;
      annotations?: { readOnlyHint?: boolean };
    },
    // The MCP SDK passes parsed Zod output to the callback; the exact shape
    // depends on the inputSchema provided above. We use a permissive signature
    // here to avoid coupling the interface to every possible schema shape.
    cb: (args: never) => Promise<unknown>,
  ) => void;
  connect: (transport: unknown) => Promise<void>;
  close: () => Promise<void>;
}

export interface McpDependencies {
  integrationManager: IntegrationManager;
  executionRepository: ExecutionRepository;
  journalService: JournalService;
  permissionService: PermissionService;
  hieraPlugin: HieraPlugin | undefined;
  puppetDBService: PuppetDBService | undefined;
  puppetRunHistoryService: PuppetRunHistoryService | undefined;
  mcpUserId: string;
  logger: LoggerService;
  version: string;
}

interface PermissionCheck {
  resource: string;
  action: string;
}

export const TOOL_PERMISSIONS: Record<string, PermissionCheck> = {
  inventory_list: { resource: 'ansible', action: 'read' },
  facts_get: { resource: 'puppetdb', action: 'read' },
  facts_bulk: { resource: 'puppetdb', action: 'read' },
  reports_query: { resource: 'puppetdb', action: 'read' },
  catalogs_get: { resource: 'puppetdb', action: 'read' },
  hiera_lookup: { resource: 'hiera', action: 'read' },
  executions_list: { resource: 'bolt', action: 'read' },
  integrations_list: { resource: 'integration_config', action: 'read' },
  journal_query: { resource: 'journal', action: 'read' },
  monitoring_services_get: { resource: 'checkmk', action: 'read' },
  monitoring_events_get: { resource: 'checkmk', action: 'read' },
};

/**
 * Creates and configures the MCP server with all read-only tools.
 */
export function createMcpServer(deps: McpDependencies): McpServerInstance {
  const server = new McpServerClass(
    { name: 'pabawi', version: deps.version },
    { capabilities: { tools: {} } },
  );

  registerAllTools(server, deps);

  deps.logger.info('MCP server created with 11 tools', {
    component: LOG_COMPONENT,
    operation: 'createMcpServer',
  });

  return server;
}
