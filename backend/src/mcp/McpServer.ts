/* eslint-disable @typescript-eslint/no-require-imports */
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
import { registerAllTools } from './McpToolHandlers';

// MCP SDK uses package.json "exports" which requires moduleResolution >= node16.
// The backend uses moduleResolution: "node", so we use require() for runtime compat.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const LOG_COMPONENT = 'McpServer';

export interface McpServerInstance {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (...args: any[]) => Promise<unknown>,
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
  reports_query: { resource: 'puppetdb', action: 'read' },
  catalogs_get: { resource: 'puppetdb', action: 'read' },
  hiera_lookup: { resource: 'hiera', action: 'read' },
  executions_list: { resource: 'bolt', action: 'read' },
  integrations_list: { resource: 'integration_config', action: 'read' },
  journal_query: { resource: 'journal', action: 'read' },
};

/**
 * Creates and configures the MCP server with all read-only tools.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMcpServer(deps: McpDependencies) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const server = new McpServer(
    { name: 'pabawi', version: deps.version },
    { capabilities: { tools: {} } },
  ) as McpServerInstance;

  registerAllTools(server, deps);

  deps.logger.info('MCP server created with 8 tools', {
    component: LOG_COMPONENT,
    operation: 'createMcpServer',
  });

  return server;
}
