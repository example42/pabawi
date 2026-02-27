/**
 * SSH Integration Plugin
 *
 * Provides native SSH integration for Pabawi, enabling remote command execution,
 * package management, and inventory management via SSH without external tools.
 *
 * Features:
 * - Remote command execution with connection pooling
 * - Package management across multiple Linux distributions
 * - SSH config file parsing and watching
 * - Concurrent execution with configurable limits
 * - Integration with Pabawi's plugin architecture
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 8.1-8.5, 9.1-9.7, 10.11
 */

import { BasePlugin } from '../BasePlugin';
import type {
  ExecutionToolPlugin,
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
  Action,
  Capability,
  NodeGroup,
} from '../types';
import type { Node, Facts, ExecutionResult } from '../bolt/types';
import { SSHService } from './SSHService';
import { loadSSHConfig } from './config';
import { parseSSHConfig } from './sshConfigParser';
import { SSHConfigWatcher } from './sshConfigWatcher';
import type { SSHConfig, SSHHost, CommandResult } from './types';
import { LoggerService } from '../../services/LoggerService';
import { PerformanceMonitorService } from '../../services/PerformanceMonitorService';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * SSH Integration Plugin
 *
 * Implements both ExecutionToolPlugin and InformationSourcePlugin interfaces
 * to provide SSH-based remote execution and inventory management.
 */
export class SSHPlugin extends BasePlugin implements ExecutionToolPlugin, InformationSourcePlugin {
  public readonly type = 'both' as const;

  private sshService?: SSHService;
  private sshConfig?: SSHConfig;
  private configWatcher?: SSHConfigWatcher;
  private inventory: Node[] = [];

  /**
   * Create a new SSH plugin instance
   *
   * @param logger - Logger service instance
   * @param performanceMonitor - Performance monitor service instance
   */
  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService
  ) {
    super('ssh', 'both', logger, performanceMonitor);
  }

  /**
   * Perform plugin-specific initialization
   *
   * Loads SSH configuration from environment variables, initializes SSHService,
   * loads SSH config file, and starts file watching.
   *
   * Validates: Requirements 1.1, 1.5, 10.11
   */
  protected async performInitialization(): Promise<void> {
    this.logger.info('Initializing SSH plugin', {
      component: 'SSHPlugin',
      integration: 'ssh',
      operation: 'performInitialization',
    });

    try {
      // Load SSH configuration from environment variables
      this.sshConfig = loadSSHConfig(process.env);

      // Check if SSH is enabled
      if (!this.sshConfig.enabled) {
        this.logger.info('SSH plugin is disabled', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'performInitialization',
        });
        // Don't set initialized flag - let BasePlugin handle it
        return;
      }

      // Validate required configuration
      if (!this.sshConfig.defaultUser) {
        throw new Error('SSH_DEFAULT_USER is required when SSH is enabled');
      }

      // Initialize SSH service
      this.sshService = new SSHService(this.sshConfig, this.logger);

      // Load SSH config file if configured
      if (this.sshConfig.configPath) {
        await this.loadInventory();

        // Start watching SSH config file for changes
        this.startConfigWatcher();
      } else {
        this.logger.info('No SSH config path configured, inventory will be empty', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'performInitialization',
        });
      }

      this.logger.info('SSH plugin initialized successfully', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'performInitialization',
        metadata: {
          inventorySize: this.inventory.length,
          configPath: this.sshConfig.configPath,
        },
      });

    } catch (error) {
      this.logger.error('Failed to initialize SSH plugin', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'performInitialization',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      // Re-throw to prevent BasePlugin from setting initialized = true
      throw error;
    }
  }

  /**
   * Perform plugin-specific health check
   *
   * Verifies SSH config file accessibility and tests connections to a subset
   * of hosts to determine overall health status.
   *
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, 'lastCheck'>> {
    if (!this.sshService || !this.sshConfig) {
      return {
        healthy: false,
        message: 'SSH service not initialized',
      };
    }

    const startTime = Date.now();
    const healthCheckTimeout = 30000; // 30 seconds

    try {
      // Check if SSH config file is accessible (if configured)
      if (this.sshConfig.configPath) {
        if (!existsSync(this.sshConfig.configPath)) {
          return {
            healthy: false,
            message: `SSH config file not found: ${this.sshConfig.configPath}`,
          };
        }
      }

      // If no inventory, return healthy but with warning
      if (this.inventory.length === 0) {
        return {
          healthy: true,
          message: 'SSH plugin is healthy but inventory is empty',
          details: {
            configPath: this.sshConfig.configPath,
            nodeCount: 0,
            hasConfig: this.sshConfig.configPath ? existsSync(this.sshConfig.configPath) : false,
          },
        };
      }

      // Test connections to a subset of hosts (max 5)
      const hostsToTest = this.inventory.slice(0, 5);
      const testResults = await Promise.race([
        this.testConnections(hostsToTest),
        new Promise<{ successful: number; failed: number }>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), healthCheckTimeout)
        ),
      ]);

      const duration = Date.now() - startTime;

      // Determine health status based on test results
      if (testResults.successful === hostsToTest.length) {
        return {
          healthy: true,
          message: `All ${testResults.successful} tested hosts are reachable`,
          details: {
            configPath: this.sshConfig.configPath,
            nodeCount: this.inventory.length,
            hasConfig: this.sshConfig.configPath ? existsSync(this.sshConfig.configPath) : false,
            testedHosts: hostsToTest.length,
            successfulConnections: testResults.successful,
            failedConnections: testResults.failed,
            duration,
          },
        };
      } else if (testResults.successful > 0) {
        return {
          healthy: true,
          degraded: true,
          message: `${testResults.successful} of ${hostsToTest.length} tested hosts are reachable`,
          details: {
            configPath: this.sshConfig.configPath,
            nodeCount: this.inventory.length,
            hasConfig: this.sshConfig.configPath ? existsSync(this.sshConfig.configPath) : false,
            testedHosts: hostsToTest.length,
            successfulConnections: testResults.successful,
            failedConnections: testResults.failed,
            duration,
          },
        };
      } else {
        return {
          healthy: false,
          message: `None of ${hostsToTest.length} tested hosts are reachable`,
          details: {
            configPath: this.sshConfig.configPath,
            nodeCount: this.inventory.length,
            hasConfig: this.sshConfig.configPath ? existsSync(this.sshConfig.configPath) : false,
            testedHosts: hostsToTest.length,
            successfulConnections: testResults.successful,
            failedConnections: testResults.failed,
            duration,
          },
        };
      }

    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Health check failed',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Execute an action on target nodes
   *
   * Validates: Requirements 5.1-5.9, 14.1-14.5
   */
  async executeAction(action: Action): Promise<ExecutionResult> {
    if (!this.sshService) {
      throw new Error('SSH service not initialized');
    }

    const startTime = new Date().toISOString();
    const executionId = `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Parse target nodes
      const targets = Array.isArray(action.target) ? action.target : [action.target];

      // Find SSH hosts for targets
      const hosts = this.findHostsByNames(targets);

      if (hosts.length === 0) {
        return {
          id: executionId,
          type: action.type,
          targetNodes: targets,
          action: action.action,
          parameters: action.parameters,
          status: 'failed',
          startedAt: startTime,
          completedAt: new Date().toISOString(),
          results: [],
          error: 'No matching hosts found in inventory',
        };
      }

      // Execute command based on action type
      let results: Map<string, CommandResult>;

      if (action.type === 'command') {
        results = await this.sshService.executeOnMultipleHosts(
          hosts,
          action.action,
          {
            timeout: action.timeout,
            sudo: action.parameters?.sudo as boolean,
          }
        );
      } else {
        throw new Error(`Unsupported action type: ${action.type}`);
      }

      // Convert results to ExecutionResult format
      const nodeResults = Array.from(results.entries()).map(([hostName, result]) => ({
        nodeId: hostName,
        status: result.success ? 'success' as const : 'failed' as const,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        error: result.error?.message,
        duration: result.duration,
      }));

      // Determine overall status
      const successCount = nodeResults.filter(r => r.status === 'success').length;
      const status = successCount === nodeResults.length ? 'success'
        : successCount > 0 ? 'partial'
        : 'failed';

      return {
        id: executionId,
        type: action.type,
        targetNodes: targets,
        action: action.action,
        parameters: action.parameters,
        status,
        startedAt: startTime,
        completedAt: new Date().toISOString(),
        results: nodeResults,
        command: action.action,
      };

    } catch (error) {
      return {
        id: executionId,
        type: action.type,
        targetNodes: Array.isArray(action.target) ? action.target : [action.target],
        action: action.action,
        parameters: action.parameters,
        status: 'failed',
        startedAt: startTime,
        completedAt: new Date().toISOString(),
        results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List capabilities supported by this execution tool
   *
   * Validates: Requirements 1.2
   */
  listCapabilities(): Capability[] {
    return [
      {
        name: 'command',
        description: 'Execute shell commands on remote hosts via SSH',
        parameters: [
          {
            name: 'command',
            type: 'string',
            required: true,
            description: 'Shell command to execute',
          },
          {
            name: 'sudo',
            type: 'boolean',
            required: false,
            description: 'Execute command with sudo',
            default: false,
          },
          {
            name: 'timeout',
            type: 'number',
            required: false,
            description: 'Command timeout in seconds',
          },
        ],
      },
      {
        name: 'package',
        description: 'Manage packages on remote hosts',
        parameters: [
          {
            name: 'operation',
            type: 'string',
            required: true,
            description: 'Package operation: install, remove, or update',
          },
          {
            name: 'package',
            type: 'string',
            required: true,
            description: 'Package name',
          },
        ],
      },
    ];
  }

  /**
   * Get inventory of nodes from SSH config
   *
   * Validates: Requirements 8.1, 8.2, 8.3, 8.5
   */
  async getInventory(): Promise<Node[]> {
    return this.inventory.map(node => ({
      ...node,
      source: 'ssh',
    }));
  }

  /**
   * Get facts for a specific node
   *
   * Validates: Requirements 8.4
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (!this.sshService) {
      throw new Error('SSH service not initialized');
    }

    // Find the host
    const node = this.inventory.find(n => n.name === nodeId || n.id === nodeId);
    if (!node) {
      throw new Error(`Node '${nodeId}' not found in inventory`);
    }

    const host = this.convertNodesToHosts([node])[0];

    try {
      // Gather facts using SSH commands
      const commands = {
        hostname: 'hostname',
        os_release: 'cat /etc/os-release 2>/dev/null || echo "ID=unknown"',
        kernel: 'uname -r',
        architecture: 'uname -m',
        cpu_info: 'nproc && cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2',
        memory: 'free -m | grep Mem | awk \'{print $2,$7}\'',
        uptime: 'cat /proc/uptime | cut -d. -f1',
        interfaces: 'ip -j addr show 2>/dev/null || ip addr show',
      };

      const results = await this.sshService.executeOnMultipleHosts(
        [host],
        Object.entries(commands).map(([key, cmd]) => `echo "====${key}====" && ${cmd}`).join(' && '),
        { timeout: 30000 }
      );

      const result = results.get(host.name);
      if (!result || !result.success) {
        throw new Error(result?.error?.message || 'Failed to gather facts');
      }

      // Parse the output
      const output = result.stdout;
      const sections: Record<string, string> = {};

      const sectionRegex = /====(\w+)====\n([\s\S]*?)(?=====\w+====|$)/g;
      let match;
      while ((match = sectionRegex.exec(output)) !== null) {
        sections[match[1]] = match[2].trim();
      }

      // Parse OS info
      const osRelease = sections.os_release || '';
      const osId = osRelease.match(/^ID=(.+)$/m)?.[1]?.replace(/"/g, '') || 'unknown';
      const osName = osRelease.match(/^NAME=(.+)$/m)?.[1]?.replace(/"/g, '') || osId;
      const osVersion = osRelease.match(/^VERSION_ID=(.+)$/m)?.[1]?.replace(/"/g, '') || 'unknown';
      const osVersionMajor = osVersion.split('.')[0] || 'unknown';

      // Parse CPU info
      const cpuLines = sections.cpu_info?.split('\n') || [];
      const cpuCount = parseInt(cpuLines[0]) || 0;
      const cpuModel = cpuLines[1]?.trim() || 'unknown';

      // Parse memory info
      const memParts = sections.memory?.split(' ') || [];
      const memTotal = memParts[0] ? `${memParts[0]} MB` : 'unknown';
      const memAvailable = memParts[1] ? `${memParts[1]} MB` : 'unknown';

      // Parse uptime
      const uptimeSeconds = parseInt(sections.uptime || '0');

      // Parse network interfaces
      const interfacesData: Record<string, any> = {};
      try {
        // Try to parse JSON output first
        const ifacesJson = JSON.parse(sections.interfaces || '[]');
        if (Array.isArray(ifacesJson)) {
          for (const iface of ifacesJson) {
            if (iface.ifname) {
              interfacesData[iface.ifname] = {
                addresses: iface.addr_info?.map((a: any) => a.local) || [],
                mac: iface.address,
              };
            }
          }
        }
      } catch {
        // Fallback to text parsing if JSON fails
        const ifaceLines = sections.interfaces?.split('\n') || [];
        let currentIface = '';
        for (const line of ifaceLines) {
          const ifaceMatch = line.match(/^\d+:\s+(\S+):/);
          if (ifaceMatch) {
            currentIface = ifaceMatch[1];
            interfacesData[currentIface] = { addresses: [] };
          } else if (currentIface) {
            const inetMatch = line.match(/inet6?\s+([^\s/]+)/);
            if (inetMatch) {
              interfacesData[currentIface].addresses.push(inetMatch[1]);
            }
          }
        }
      }

      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: 'ssh',
        facts: {
          os: {
            family: osId,
            name: osName,
            release: {
              full: osVersion,
              major: osVersionMajor,
            },
          },
          kernel: {
            release: sections.kernel || 'unknown',
          },
          architecture: sections.architecture || 'unknown',
          processors: {
            count: cpuCount,
            models: cpuModel ? [cpuModel] : [],
          },
          memory: {
            system: {
              total: memTotal,
              available: memAvailable,
            },
          },
          networking: {
            hostname: sections.hostname || nodeId,
            interfaces: interfacesData,
          },
          system_uptime: {
            seconds: uptimeSeconds,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to gather facts via SSH', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'getNodeFacts',
        metadata: {
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      throw error;
    }
  }
  /**
   * Get groups from SSH config
   *
   * @returns Array of node groups
   * @todo Implement group extraction from SSH config Host patterns (Task 5)
   */
  /**
     * Get groups from SSH config
     *
     * Extracts groups from SSH config Host patterns and Match directives.
     * Creates groups from patterns (e.g., "web-prod-*" → "web-prod") and
     * matches nodes against patterns using glob matching.
     *
     * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
     */
    async getGroups(): Promise<NodeGroup[]> {
      if (!this.initialized) {
        throw new Error('SSH plugin not initialized');
      }

      if (!this.sshConfig?.configPath) {
        return [];
      }

      try {
        // Read SSH config file
        const content = await readFile(this.sshConfig.configPath, 'utf-8');

        // Extract Host patterns from config
        const patterns = this.extractHostPatterns(content);

        // Create groups from patterns
        const groups = this.createGroupsFromPatterns(patterns);

        return groups;
      } catch (error) {
        this.logger.error('Failed to extract groups from SSH config', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'getGroups',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        }, error instanceof Error ? error : undefined);

        return [];
      }
    }


  /**
   * Get arbitrary data for a node
   *
   * Validates: Requirements 8.4
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    // Placeholder implementation - node data retrieval not yet implemented
    return null;
  }

  /**
   * Cleanup resources when plugin is destroyed
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up SSH plugin', {
      component: 'SSHPlugin',
      integration: 'ssh',
      operation: 'cleanup',
    });

    // Stop config watcher
    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = undefined;
    }

    // Cleanup SSH service
    if (this.sshService) {
      await this.sshService.cleanup();
      this.sshService = undefined;
    }
  }
  /**
   * Extract Host patterns from SSH config content
   *
   * Parses SSH config to find Host and Match directives with patterns.
   * Returns array of patterns that contain wildcards (* or ?).
   */
  private extractHostPatterns(content: string): string[] {
    const patterns: string[] = [];
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      // Parse Host directive
      const hostMatch = line.match(/^Host(\s+(.+))?$/i);
      if (hostMatch) {
        const hostLine = hostMatch[2] || '';
        const hostPatterns = hostLine.split(/\s+/).filter(p => p.length > 0);

        // Only include patterns with wildcards
        for (const pattern of hostPatterns) {
          if (pattern.includes('*') || pattern.includes('?')) {
            patterns.push(pattern);
          }
        }
        continue;
      }

      // Parse Match directive with Host patterns
      const matchMatch = line.match(/^Match\s+.*Host\s+([^\s]+)/i);
      if (matchMatch) {
        const pattern = matchMatch[1];
        if (pattern.includes('*') || pattern.includes('?')) {
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  /**
   * Create groups from Host patterns
   *
   * Converts patterns into groups and matches nodes against them.
   * Handles multi-host patterns and environment-based patterns.
   */
  private createGroupsFromPatterns(patterns: string[]): NodeGroup[] {
    const groups: NodeGroup[] = [];
    const groupMap = new Map<string, Set<string>>();

    // Process each pattern
    for (const pattern of patterns) {
      // Extract group name from pattern
      const groupName = this.extractGroupNameFromPattern(pattern);

      if (!groupName) {
        continue;
      }

      // Find nodes matching this pattern
      const matchingNodes = this.inventory.filter(node =>
        this.matchesPattern(node.name, pattern)
      );

      // Add nodes to group
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, new Set());
      }

      for (const node of matchingNodes) {
        groupMap.get(groupName)!.add(node.id);
      }
    }

    // Also detect environment-based patterns
    const envGroups = this.detectEnvironmentGroups();
    for (const [groupName, nodeIds] of envGroups) {
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, new Set());
      }
      for (const nodeId of nodeIds) {
        groupMap.get(groupName)!.add(nodeId);
      }
    }

    // Convert map to NodeGroup array
    for (const [groupName, nodeIds] of groupMap) {
      if (nodeIds.size > 0) {
        groups.push({
          id: `ssh:${groupName}`,
          name: groupName,
          source: 'ssh',
          sources: ['ssh'],
          linked: false,
          nodes: Array.from(nodeIds),
          metadata: {
            description: `SSH config pattern-based group: ${groupName}`,
          },
        });
      }
    }

    return groups;
  }

  /**
   * Extract group name from a Host pattern
   *
   * Examples:
   * - "web-prod-*" → "web-prod"
   * - "app-*" → "app"
   * - "*.example.com" → "example.com"
   */
  /**
     * Extract group name from a Host pattern
     *
     * Examples:
     * - "web-prod-*" → "web-prod"
     * - "app-*" → "app"
     * - "*.example.com" → "example.com"
     */
    private extractGroupNameFromPattern(pattern: string): string | null {
      // Remove wildcards and extract meaningful prefix/suffix

      // Pattern like "web-prod-*" or "app-*"
      // Match everything before the wildcard, removing trailing dash if present
      const prefixMatch = pattern.match(/^([a-zA-Z0-9_-]+?)-?\*+/);
      if (prefixMatch) {
        return prefixMatch[1];
      }

      // Pattern like "*.example.com"
      const suffixMatch = pattern.match(/^\*+\.?([a-zA-Z0-9_.-]+)$/);
      if (suffixMatch) {
        return suffixMatch[1];
      }

      // Pattern like "*-prod" or "*-staging"
      const endMatch = pattern.match(/^\*+-?([a-zA-Z0-9_-]+)$/);
      if (endMatch) {
        return endMatch[1];
      }

      return null;
    }

  /**
   * Check if a node name matches a glob pattern
   *
   * Supports * (matches any characters) and ? (matches single character)
   */
  private matchesPattern(nodeName: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*')                  // * matches any characters
      .replace(/\?/g, '.');                  // ? matches single character

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(nodeName);
  }

  /**
   * Detect environment-based groups from node names
   *
   * Looks for common environment patterns like -prod-, -stg-, -dev-
   */
  private detectEnvironmentGroups(): Map<string, string[]> {
    const envGroups = new Map<string, string[]>();
    const envPatterns = [
      { pattern: /-prod-|^prod-|-prod$/, name: 'production' },
      { pattern: /-stg-|^stg-|-stg$|-staging-|^staging-|-staging$/, name: 'staging' },
      { pattern: /-dev-|^dev-|-dev$|-development-|^development-|-development$/, name: 'development' },
      { pattern: /-test-|^test-|-test$/, name: 'test' },
      { pattern: /-qa-|^qa-|-qa$/, name: 'qa' },
    ];

    for (const node of this.inventory) {
      for (const { pattern, name } of envPatterns) {
        if (pattern.test(node.name)) {
          if (!envGroups.has(name)) {
            envGroups.set(name, []);
          }
          envGroups.get(name)!.push(node.id);
        }
      }
    }

    return envGroups;
  }



  /**
   * Load inventory from SSH config file
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
   */
  private async loadInventory(): Promise<void> {
    if (!this.sshConfig?.configPath) {
      return;
    }

    try {
      this.logger.info('Loading SSH config file', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'loadInventory',
        metadata: {
          configPath: this.sshConfig.configPath,
        },
      });

      // Read SSH config file
      const content = await readFile(this.sshConfig.configPath, 'utf-8');

      // Parse SSH config
      const parseResult = parseSSHConfig(content);

      // Log any parse errors but continue with valid hosts
      if (parseResult.errors.length > 0) {
        this.logger.warn('SSH config parse errors encountered', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'loadInventory',
          metadata: {
            errors: parseResult.errors,
            validHosts: parseResult.hosts.length,
          },
        });
      }

      // Convert SSH hosts to Node format
      this.inventory = this.convertHostsToNodes(parseResult.hosts);

      this.logger.info('SSH config loaded successfully', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'loadInventory',
        metadata: {
          hostCount: this.inventory.length,
        },
      });

    } catch (error) {
      this.logger.error('Failed to load SSH config file', {
        component: 'SSHPlugin',
        integration: 'ssh',
        operation: 'loadInventory',
        metadata: {
          configPath: this.sshConfig.configPath,
          error: error instanceof Error ? error.message : String(error),
        },
      }, error instanceof Error ? error : undefined);

      // Don't throw - maintain last valid inventory
    }
  }

  /**
   * Start watching SSH config file for changes
   *
   * Validates: Requirements 2.4, 2.7
   */
  private startConfigWatcher(): void {
    if (!this.sshConfig?.configPath) {
      return;
    }

    this.configWatcher = new SSHConfigWatcher({
      filePath: this.sshConfig.configPath,
      debounceDelay: 1000,
      logger: this.logger,
      onReload: (hosts) => {
        this.logger.info('SSH config reloaded from file watcher', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'startConfigWatcher',
          metadata: {
            hostCount: hosts.length,
          },
        });

        // Update inventory with new hosts
        this.inventory = this.convertHostsToNodes(hosts);
      },
      onError: (error) => {
        this.logger.error('SSH config reload failed', {
          component: 'SSHPlugin',
          integration: 'ssh',
          operation: 'startConfigWatcher',
          metadata: {
            error: error.message,
          },
        }, error);
      },
    });

    // Start watching with current inventory as initial state
    this.configWatcher.start(this.convertNodesToHosts(this.inventory));
  }

  /**
   * Convert SSH hosts to Node format for inventory
   */
  private convertHostsToNodes(hosts: SSHHost[]): Node[] {
    return hosts.map(host => {
      // Parse hostname from URI
      const hostname = host.uri.replace(/^ssh:\/\//, '');

      return {
        id: host.name,
        name: host.name,
        uri: host.uri,
        transport: 'ssh' as const,
        config: {
          user: host.user,
          port: host.port,
          privateKeyPath: host.privateKeyPath,
          groups: host.groups,
          alias: host.alias,
        },
        source: 'ssh',
      };
    });
  }

  /**
   * Convert Nodes back to SSH hosts
   */
  private convertNodesToHosts(nodes: Node[]): SSHHost[] {
    return nodes.map(node => ({
      name: node.name,
      uri: node.uri,
      alias: node.config.alias as string | undefined,
      user: node.config.user as string | undefined,
      port: node.config.port as number | undefined,
      privateKeyPath: node.config.privateKeyPath as string | undefined,
      groups: node.config.groups as string[] | undefined,
    }));
  }

  /**
   * Find SSH hosts by node names
   */
  private findHostsByNames(names: string[]): SSHHost[] {
    const hosts: SSHHost[] = [];

    for (const name of names) {
      const node = this.inventory.find(n => n.name === name || n.id === name);
      if (node) {
        hosts.push({
          name: node.name,
          uri: node.uri,
          alias: node.config.alias as string | undefined,
          user: node.config.user as string | undefined,
          port: node.config.port as number | undefined,
          privateKeyPath: node.config.privateKeyPath as string | undefined,
          groups: node.config.groups as string[] | undefined,
        });
      }
    }

    return hosts;
  }

  /**
   * Test connections to multiple hosts
   */
  private async testConnections(nodes: Node[]): Promise<{ successful: number; failed: number }> {
    if (!this.sshService) {
      return { successful: 0, failed: nodes.length };
    }

    const hosts = this.convertNodesToHosts(nodes);
    let successful = 0;
    let failed = 0;

    // Test connections in parallel
    const results = await Promise.allSettled(
      hosts.map(host => this.sshService!.testConnection(host))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        successful++;
      } else {
        failed++;
      }
    }

    return { successful, failed };
  }
}
