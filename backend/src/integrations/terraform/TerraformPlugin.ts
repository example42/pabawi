/**
 * Terraform Cloud/Enterprise Integration Plugin
 *
 * Provides infrastructure state visibility through Terraform Cloud/Enterprise
 */

import { BasePlugin } from '../BasePlugin';
import type { InformationSourcePlugin, HealthStatus } from '../types';
import type { Node, Facts } from '../../bolt/types';
import { TerraformClient } from './TerraformClient';
import type {
  TerraformConfig,
  TerraformWorkspace,
  TerraformRun,
  TerraformStateVersion,
  TerraformStateResource,
  TerraformOutput,
  TerraformVariable,
  WorkspaceSummary,
  TerraformMappedResource,
  CreateRunRequest,
} from './types';

export class TerraformPlugin
  extends BasePlugin
  implements InformationSourcePlugin
{
  type = 'information' as const;
  private client?: TerraformClient;
  private terraformConfig?: TerraformConfig;

  constructor() {
    super('terraform', 'information');
  }

  /**
   * Perform plugin-specific initialization
   */
  protected performInitialization(): Promise<void> {
    this.terraformConfig = this.config.config as TerraformConfig;

    if (!this.config.enabled) {
      this.log('Terraform integration is disabled');
      return Promise.resolve();
    }

    if (!this.terraformConfig.token) {
      this.log('Terraform integration is not configured (missing token)');
      return Promise.resolve();
    }

    this.client = new TerraformClient(this.terraformConfig);
    this.log('Terraform Cloud/Enterprise service initialized successfully');
    return Promise.resolve();
  }

  /**
   * Perform plugin-specific health check
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, 'lastCheck'>> {
    if (!this.client) {
      return {
        healthy: false,
        message: 'Terraform client not initialized',
      };
    }

    try {
      const health = await this.client.healthCheck();
      if (health.status === 'ok') {
        return {
          healthy: true,
          message: 'Terraform Cloud/Enterprise API is accessible',
        };
      }

      return {
        healthy: false,
        message: health.error || 'Failed to connect to Terraform API',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        message: `Terraform health check failed: ${errorMessage}`,
      };
    }
  }

  // InformationSourcePlugin implementation

  async getInventory(): Promise<Node[]> {
    // Terraform doesn't provide traditional node inventory
    // Instead, we could map compute resources to nodes
    // For now, return empty array
    return [];
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    const emptyFacts: Facts = {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: 'terraform',
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

    // Terraform doesn't have traditional node facts
    // Could potentially extract from state resources
    return emptyFacts;
  }

  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    if (!this.isEnabled() || !this.client) return null;

    // Could map resources to nodes
    return null;
  }

  // Terraform-specific methods

  /**
   * Get all workspaces for the configured organization
   */
  async getWorkspaces(page?: number, pageSize?: number): Promise<{ workspaces: TerraformWorkspace[]; totalCount: number }> {
    if (!this.isEnabled() || !this.client) {
      return { workspaces: [], totalCount: 0 };
    }
    return this.client.getWorkspaces(this.terraformConfig?.organization, page, pageSize);
  }

  /**
   * Get workspace summaries for dashboard display
   */
  async getWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
    if (!this.isEnabled() || !this.client) return [];

    try {
      const { workspaces } = await this.client.getWorkspaces(this.terraformConfig?.organization);
      
      const summaries: WorkspaceSummary[] = [];
      for (const ws of workspaces) {
        let lastRunStatus: string | null = null;
        let lastRunAt: string | null = null;
        let hasChanges = false;

        // Get latest run info if available
        if (ws.relationships['latest-run']?.data?.id) {
          try {
            const run = await this.client.getRun(ws.relationships['latest-run'].data.id);
            lastRunStatus = run.attributes.status;
            lastRunAt = run.attributes['created-at'];
            hasChanges = run.attributes['has-changes'];
          } catch {
            // Run may have been deleted
          }
        }

        summaries.push({
          id: ws.id,
          name: ws.attributes.name,
          organization: this.terraformConfig?.organization || '',
          environment: ws.attributes.environment,
          terraformVersion: ws.attributes['terraform-version'],
          resourceCount: ws.attributes['resource-count'],
          locked: ws.attributes.locked,
          lastRunStatus,
          lastRunAt,
          hasChanges,
          executionMode: ws.attributes['execution-mode'],
          vcsRepo: ws.attributes['vcs-repo']?.identifier || null,
        });
      }

      return summaries;
    } catch (error) {
      this.logError('Error getting workspace summaries', error);
      return [];
    }
  }

  /**
   * Get a specific workspace
   */
  async getWorkspace(workspaceName: string): Promise<TerraformWorkspace | null> {
    if (!this.isEnabled() || !this.client || !this.terraformConfig?.organization) {
      return null;
    }
    try {
      return await this.client.getWorkspace(this.terraformConfig.organization, workspaceName);
    } catch {
      return null;
    }
  }

  /**
   * Get workspace by ID
   */
  async getWorkspaceById(workspaceId: string): Promise<TerraformWorkspace | null> {
    if (!this.isEnabled() || !this.client) return null;
    try {
      return await this.client.getWorkspaceById(workspaceId);
    } catch {
      return null;
    }
  }

  /**
   * Lock a workspace
   */
  async lockWorkspace(workspaceId: string, reason?: string): Promise<TerraformWorkspace> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.lockWorkspace(workspaceId, reason);
  }

  /**
   * Unlock a workspace
   */
  async unlockWorkspace(workspaceId: string): Promise<TerraformWorkspace> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.unlockWorkspace(workspaceId);
  }

  /**
   * Get runs for a workspace
   */
  async getRuns(workspaceId: string, page?: number, pageSize?: number): Promise<{ runs: TerraformRun[]; totalCount: number }> {
    if (!this.isEnabled() || !this.client) {
      return { runs: [], totalCount: 0 };
    }
    return this.client.getRuns(workspaceId, page, pageSize);
  }

  /**
   * Get a specific run
   */
  async getRun(runId: string): Promise<TerraformRun | null> {
    if (!this.isEnabled() || !this.client) return null;
    try {
      return await this.client.getRun(runId);
    } catch {
      return null;
    }
  }

  /**
   * Create a new run (plan)
   */
  async createRun(workspaceId: string, options?: CreateRunRequest): Promise<TerraformRun> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.createRun(workspaceId, options);
  }

  /**
   * Apply a run
   */
  async applyRun(runId: string, comment?: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.applyRun(runId, comment);
  }

  /**
   * Discard a run
   */
  async discardRun(runId: string, comment?: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.discardRun(runId, comment);
  }

  /**
   * Cancel a run
   */
  async cancelRun(runId: string, comment?: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.cancelRun(runId, comment);
  }

  /**
   * Get plan logs
   */
  async getPlanLogs(planId: string): Promise<string> {
    if (!this.isEnabled() || !this.client) return '';
    return this.client.getPlanLogs(planId);
  }

  /**
   * Get apply logs
   */
  async getApplyLogs(applyId: string): Promise<string> {
    if (!this.isEnabled() || !this.client) return '';
    return this.client.getApplyLogs(applyId);
  }

  /**
   * Get current state version for a workspace
   */
  async getCurrentState(workspaceId: string): Promise<TerraformStateVersion | null> {
    if (!this.isEnabled() || !this.client) return null;
    return this.client.getCurrentStateVersion(workspaceId);
  }

  /**
   * Get state version history
   */
  async getStateVersions(workspaceId: string, page?: number, pageSize?: number): Promise<{ stateVersions: TerraformStateVersion[]; totalCount: number }> {
    if (!this.isEnabled() || !this.client) {
      return { stateVersions: [], totalCount: 0 };
    }
    return this.client.getStateVersions(workspaceId, page, pageSize);
  }

  /**
   * Get resources from state
   */
  async getStateResources(stateVersionId: string, page?: number, pageSize?: number): Promise<{ resources: TerraformStateResource[]; totalCount: number }> {
    if (!this.isEnabled() || !this.client) {
      return { resources: [], totalCount: 0 };
    }
    return this.client.getStateVersionResources(stateVersionId, page, pageSize);
  }

  /**
   * Get state outputs
   */
  async getStateOutputs(stateVersionId: string): Promise<TerraformOutput[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getStateVersionOutputs(stateVersionId);
  }

  /**
   * Get workspace variables
   */
  async getVariables(workspaceId: string): Promise<TerraformVariable[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getWorkspaceVariables(workspaceId);
  }

  /**
   * Create a variable
   */
  async createVariable(
    workspaceId: string,
    key: string,
    value: string,
    options?: {
      category?: 'terraform' | 'env';
      hcl?: boolean;
      sensitive?: boolean;
      description?: string;
    }
  ): Promise<TerraformVariable> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.createVariable(workspaceId, key, value, options);
  }

  /**
   * Update a variable
   */
  async updateVariable(
    variableId: string,
    value: string,
    options?: {
      hcl?: boolean;
      sensitive?: boolean;
      description?: string;
    }
  ): Promise<TerraformVariable> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.updateVariable(variableId, value, options);
  }

  /**
   * Delete a variable
   */
  async deleteVariable(variableId: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      throw new Error('Terraform plugin is disabled or not initialized');
    }
    return this.client.deleteVariable(variableId);
  }

  /**
   * Get all resources across workspaces as mapped resources
   */
  async getMappedResources(): Promise<TerraformMappedResource[]> {
    if (!this.isEnabled() || !this.client) return [];

    try {
      const { workspaces } = await this.client.getWorkspaces(this.terraformConfig?.organization);
      const mappedResources: TerraformMappedResource[] = [];

      for (const ws of workspaces) {
        const currentState = await this.client.getCurrentStateVersion(ws.id);
        if (!currentState) continue;

        const { resources } = await this.client.getStateVersionResources(currentState.id);
        
        for (const resource of resources) {
          mappedResources.push({
            id: resource.id,
            address: resource.attributes.address,
            name: resource.attributes.name,
            type: resource.attributes.type,
            provider: resource.attributes['provider-name'],
            module: resource.attributes.module,
            mode: resource.attributes.mode,
            workspaceId: ws.id,
            workspaceName: ws.attributes.name,
            organizationName: this.terraformConfig?.organization || '',
          });
        }
      }

      return mappedResources;
    } catch (error) {
      this.logError('Error getting mapped resources', error);
      return [];
    }
  }

  /**
   * Get organizations
   */
  async getOrganizations(): Promise<unknown[]> {
    if (!this.isEnabled() || !this.client) return [];
    return this.client.getOrganizations();
  }
}
