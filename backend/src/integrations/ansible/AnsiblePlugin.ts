/**
 * Ansible AWX/Tower Integration Plugin
 *
 * Provides inventory and execution capabilities through Ansible AWX/Tower
 */

import { BasePlugin } from '../BasePlugin';
import type { InformationSourcePlugin, HealthStatus } from '../types';
import type { Node, Facts } from '../../bolt/types';
import { AnsibleClient } from './AnsibleClient';
import type {
  AnsibleConfig,
  AnsibleMappedNode,
  AnsibleHost,
  AnsibleJobTemplate,
  AnsibleJob,
  AnsibleInventory,
  AnsibleGroup,
  ParsedHostVariables,
  LaunchJobRequest,
} from './types';

export class AnsiblePlugin
  extends BasePlugin
  implements InformationSourcePlugin
{
  type = 'information' as const;
  private client?: AnsibleClient;
  private ansibleConfig?: AnsibleConfig;

  constructor() {
    super('ansible', 'information');
  }

  /**
   * Perform plugin-specific initialization
   */
  protected performInitialization(): Promise<void> {
    // Extract Ansible config from integration config
    this.ansibleConfig = this.config.config as unknown as AnsibleConfig;

    if (!this.config.enabled) {
      this.log('Ansible integration is disabled');
      return Promise.resolve();
    }

    if (!this.ansibleConfig.url) {
      this.log('Ansible integration is not configured (missing url)');
      return Promise.resolve();
    }

    // Create Ansible client
    this.client = new AnsibleClient(this.ansibleConfig);

    this.log('Ansible AWX/Tower service initialized successfully');
    return Promise.resolve();
  }

  /**
   * Perform plugin-specific health check
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, 'lastCheck'>> {
    if (!this.client) {
      return {
        healthy: false,
        message: 'Ansible client not initialized',
      };
    }

    try {
      const health = await this.client.healthCheck();
      if (health.status === 'ok') {
        return {
          healthy: true,
          message: `AWX/Tower v${health.version} is accessible`,
          details: {
            version: health.version,
          },
        };
      }

      return {
        healthy: false,
        message: health.error || 'Failed to connect to AWX/Tower',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        message: `AWX/Tower health check failed: ${errorMessage}`,
      };
    }
  }

  // InformationSourcePlugin implementation

  async getInventory(): Promise<Node[]> {
    if (!this.isEnabled() || !this.client) return [];

    try {
      const mappedNodes = await this.getMappedNodes();
      return mappedNodes.map((node) => ({
        id: node.id,
        name: node.name,
        uri: node.uri,
        transport: node.transport,
        config: node.config,
        source: 'ansible' as const,
      }));
    } catch (error) {
      this.logError('Failed to get inventory from Ansible', error);
      return [];
    }
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    const emptyFacts: Facts = {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: 'ansible',
      facts: {
        os: { family: 'unknown', name: 'unknown', release: { full: 'unknown', major: 'unknown' } },
        processors: { count: 0, models: [] },
        memory: { system: { total: '0', available: '0' } },
        networking: { hostname: nodeId, interfaces: {} },
      },
    };

    if (!this.isEnabled() || !this.client) {
      return emptyFacts;
    }

    try {
      // Find host by name
      const host = await this.client.getHostByName(nodeId);
      if (!host) {
        return emptyFacts;
      }

      // Get Ansible facts if available
      const ansibleFacts = await this.client.getHostFacts(host.id);
      const hostVariables = this.client.parseHostVariables(host.variables);

      // Get host groups
      const groups = await this.client.getHostGroups(host.id);

      // Extract OS info from ansible facts if available
      const af = ansibleFacts?.ansible_facts || {};

      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: 'ansible',
        facts: {
          os: {
            family: (af as any).ansible_os_family || 'unknown',
            name: (af as any).ansible_distribution || 'unknown',
            release: {
              full: (af as any).ansible_distribution_version || 'unknown',
              major: (af as any).ansible_distribution_major_version || 'unknown',
            },
          },
          processors: {
            count: (af as any).ansible_processor_vcpus || 0,
            models: (af as any).ansible_processor || [],
          },
          memory: {
            system: {
              total: `${(af as any).ansible_memtotal_mb || 0} MB`,
              available: `${(af as any).ansible_memfree_mb || 0} MB`,
            },
          },
          networking: {
            hostname: (af as any).ansible_hostname || nodeId,
            interfaces: (af as any).ansible_interfaces || {},
          },
          // Ansible-specific data
          ansible_host_id: host.id,
          ansible_host_enabled: host.enabled,
          ansible_has_active_failures: host.has_active_failures,
          ansible_inventory_id: host.inventory,
          ansible_groups: groups.map((g) => g.name),
          ansible_host_variables: hostVariables,
          // Spread remaining ansible facts
          ...af,
        },
      };
    } catch (error) {
      this.logError(`Error getting Ansible facts for ${nodeId}`, error);
      return emptyFacts;
    }
  }

  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    if (!this.isEnabled() || !this.client) return null;

    try {
      switch (dataType) {
        case 'host':
          return await this.client.getHostByName(nodeId);
        case 'jobs':
          return await this.getHostJobHistory(nodeId);
        case 'groups': {
          const host = await this.client.getHostByName(nodeId);
          if (!host) return [];
          return await this.client.getHostGroups(host.id);
        }
        default:
          return null;
      }
    } catch (error) {
      this.logError(`Error getting Ansible data for ${nodeId}`, error);
      return null;
    }
  }

  // Ansible-specific methods

  /**
   * Get all inventories
   */
  async getInventories(): Promise<AnsibleInventory[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getInventories(this.ansibleConfig?.organizationId);
  }

  /**
   * Get hosts from a specific inventory
   */
  async getInventoryHosts(inventoryId: number): Promise<AnsibleHost[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getInventoryHosts(inventoryId);
  }

  /**
   * Get groups from a specific inventory
   */
  async getInventoryGroups(inventoryId: number): Promise<AnsibleGroup[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getInventoryGroups(inventoryId);
  }

  /**
   * Map Ansible hosts to Pabawi nodes
   */
  async getMappedNodes(inventoryId?: number): Promise<AnsibleMappedNode[]> {
    if (!this.isEnabled() || !this.client) return [];

    try {
      let hosts: AnsibleHost[];

      if (inventoryId) {
        hosts = await this.client.getInventoryHosts(inventoryId);
      } else {
        hosts = await this.client.getHosts();
      }

      const mappedNodes: AnsibleMappedNode[] = [];

      for (const host of hosts) {
        const groups = await this.client.getHostGroups(host.id);
        const variables = this.client.parseHostVariables(
          host.variables
        ) as ParsedHostVariables;

        // Determine transport type from ansible_connection or default to ssh
        let transport: 'ssh' | 'winrm' | 'docker' | 'local' = 'ssh';
        if (variables.ansible_connection === 'winrm') {
          transport = 'winrm';
        } else if (variables.ansible_connection === 'docker') {
          transport = 'docker';
        } else if (variables.ansible_connection === 'local') {
          transport = 'local';
        }

        // Build URI
        const hostAddress = variables.ansible_host || host.name;
        const port = variables.ansible_port;
        const uri =
          transport === 'local'
            ? 'localhost'
            : port
              ? `${hostAddress}:${port}`
              : hostAddress;

        mappedNodes.push({
          id: `ansible-${host.id}`,
          name: host.name,
          uri,
          transport,
          config: {
            user: variables.ansible_user,
            port: variables.ansible_port,
            ...variables,
          },
          source: 'ansible',
          ansibleHostId: host.id,
          ansibleInventoryId: host.inventory,
          groups: groups.map((g) => g.name),
          enabled: host.enabled,
          hasActiveFailures: host.has_active_failures,
          lastJobId: host.last_job || undefined,
        });
      }

      return mappedNodes;
    } catch (error) {
      this.logError('Error mapping Ansible hosts', error);
      return [];
    }
  }

  /**
   * Get job templates
   */
  async getJobTemplates(): Promise<AnsibleJobTemplate[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getJobTemplates(this.ansibleConfig?.organizationId);
  }

  /**
   * Get a specific job template
   */
  async getJobTemplate(id: number): Promise<AnsibleJobTemplate | null> {
    if (!this.isEnabled() || !this.client) return null;
    try {
      return await this.client.getJobTemplate(id);
    } catch {
      return null;
    }
  }

  /**
   * Launch a job template
   */
  async launchJobTemplate(
    templateId: number,
    options?: LaunchJobRequest
  ): Promise<AnsibleJob> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Ansible plugin is disabled or not initialized');
    }
    return this.client.launchJobTemplate(templateId, options);
  }

  /**
   * Get jobs
   */
  async getJobs(
    templateId?: number,
    status?: string,
    limit?: number
  ): Promise<AnsibleJob[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getJobs(templateId, status, limit);
  }

  /**
   * Get a specific job
   */
  async getJob(id: number): Promise<AnsibleJob | null> {
    if (!this.isEnabled() || !this.client) return null;
    try {
      return await this.client.getJob(id);
    } catch {
      return null;
    }
  }

  /**
   * Get job stdout
   */
  async getJobStdout(jobId: number): Promise<string> {
    if (!this.isEnabled() || !this.client) return '';
    return this.client.getJobStdout(jobId);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: number): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Ansible plugin is disabled or not initialized');
    }
    return this.client.cancelJob(jobId);
  }

  /**
   * Relaunch a job
   */
  async relaunchJob(jobId: number): Promise<AnsibleJob> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Ansible plugin is disabled or not initialized');
    }
    return this.client.relaunchJob(jobId);
  }

  /**
   * Run an ad-hoc command
   */
  async runAdHocCommand(
    inventoryId: number,
    command: string,
    limit?: string,
    credentialId?: number
  ): Promise<AnsibleJob> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Ansible plugin is disabled or not initialized');
    }
    return this.client.runAdHocCommand(
      inventoryId,
      command,
      'shell',
      limit,
      credentialId
    );
  }

  /**
   * Get host's recent job history
   */
  async getHostJobHistory(
    hostName: string,
    limit: number = 10
  ): Promise<AnsibleJob[]> {
    if (!this.isEnabled() || !this.client) return [];

    try {
      const host = await this.client.getHostByName(hostName);
      if (!host) return [];

      const jobSummaries = await this.client.getHostJobSummaries(host.id);
      const jobs: AnsibleJob[] = [];

      for (const summary of jobSummaries.slice(0, limit)) {
        try {
          const job = await this.client.getJob(summary.job);
          jobs.push(job);
        } catch {
          // Job may have been deleted
        }
      }

      return jobs;
    } catch (error) {
      this.logError(`Error getting job history for ${hostName}`, error);
      return [];
    }
  }

  /**
   * Sync a project
   */
  async syncProject(projectId: number): Promise<{ id: number }> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Ansible plugin is disabled or not initialized');
    }
    return this.client.syncProject(projectId);
  }

  /**
   * Get projects
   */
  async getProjects(): Promise<unknown[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getProjects(this.ansibleConfig?.organizationId);
  }

  /**
   * Get credentials
   */
  async getCredentials(): Promise<unknown[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getCredentials(this.ansibleConfig?.organizationId);
  }
}
