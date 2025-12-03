/**
 * Ansible AWX/Tower API Client
 *
 * HTTP client for communicating with Ansible AWX/Tower API
 */

import type {
  AnsibleConfig,
  AnsibleInventory,
  AnsibleHost,
  AnsibleGroup,
  AnsibleJobTemplate,
  AnsibleJob,
  AnsibleJobEvent,
  AnsibleProject,
  AnsibleCredential,
  AnsibleOrganization,
  AnsibleHostFacts,
  AnsibleJobHostSummary,
  AnsibleWorkflowJobTemplate,
  AWXApiResponse,
  LaunchJobRequest,
} from './types';

// Declare require for Node.js modules
declare const require: any;

export class AnsibleClient {
  private config: AnsibleConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: AnsibleConfig) {
    this.config = config;
    this.baseUrl = config.url.replace(/\/$/, '');
    this.headers = this.buildHeaders();
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    } else if (this.config.username && this.config.password) {
      const credentials = Buffer.from(
        `${this.config.username}:${this.config.password}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`/api/v2${path}`, this.baseUrl);
    
    const https = require('https');
    const http = require('http');
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: this.headers,
        timeout: this.config.timeout || 30000,
        rejectUnauthorized: this.config.verifySsl !== false,
      };

      const req = client.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : ({} as T));
            } catch {
              resolve(data as unknown as T);
            }
          } else {
            reject(
              new Error(
                `AWX API error: ${res.statusCode} ${res.statusMessage} - ${data}`
              )
            );
          }
        });
      });

      req.on('error', (err: Error) => {
        reject(new Error(`AWX API request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('AWX API request timed out'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: 'ok' | 'error'; version?: string; error?: string }> {
    try {
      const response = await this.request<{ version: string }>('GET', '/ping/');
      return { status: 'ok', version: response.version };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Organizations
  async getOrganizations(): Promise<AnsibleOrganization[]> {
    const response = await this.request<AWXApiResponse<AnsibleOrganization>>(
      'GET',
      '/organizations/'
    );
    return response.results;
  }

  async getOrganization(id: number): Promise<AnsibleOrganization> {
    return this.request<AnsibleOrganization>('GET', `/organizations/${id}/`);
  }

  // Inventories
  async getInventories(organizationId?: number): Promise<AnsibleInventory[]> {
    let path = '/inventories/';
    if (organizationId) {
      path += `?organization=${organizationId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleInventory>>(
      'GET',
      path
    );
    return response.results;
  }

  async getInventory(id: number): Promise<AnsibleInventory> {
    return this.request<AnsibleInventory>('GET', `/inventories/${id}/`);
  }

  async getInventoryHosts(inventoryId: number): Promise<AnsibleHost[]> {
    const response = await this.request<AWXApiResponse<AnsibleHost>>(
      'GET',
      `/inventories/${inventoryId}/hosts/`
    );
    return response.results;
  }

  async getInventoryGroups(inventoryId: number): Promise<AnsibleGroup[]> {
    const response = await this.request<AWXApiResponse<AnsibleGroup>>(
      'GET',
      `/inventories/${inventoryId}/groups/`
    );
    return response.results;
  }

  // Hosts
  async getHosts(inventoryId?: number): Promise<AnsibleHost[]> {
    let path = '/hosts/';
    if (inventoryId) {
      path += `?inventory=${inventoryId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleHost>>('GET', path);
    return response.results;
  }

  async getHost(id: number): Promise<AnsibleHost> {
    return this.request<AnsibleHost>('GET', `/hosts/${id}/`);
  }

  async getHostByName(name: string, inventoryId?: number): Promise<AnsibleHost | null> {
    let path = `/hosts/?name=${encodeURIComponent(name)}`;
    if (inventoryId) {
      path += `&inventory=${inventoryId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleHost>>('GET', path);
    return response.results[0] || null;
  }

  async getHostGroups(hostId: number): Promise<AnsibleGroup[]> {
    const response = await this.request<AWXApiResponse<AnsibleGroup>>(
      'GET',
      `/hosts/${hostId}/groups/`
    );
    return response.results;
  }

  async getHostFacts(hostId: number): Promise<AnsibleHostFacts | null> {
    try {
      return await this.request<AnsibleHostFacts>(
        'GET',
        `/hosts/${hostId}/ansible_facts/`
      );
    } catch {
      return null;
    }
  }

  async getHostJobSummaries(hostId: number): Promise<AnsibleJobHostSummary[]> {
    const response = await this.request<AWXApiResponse<AnsibleJobHostSummary>>(
      'GET',
      `/hosts/${hostId}/job_host_summaries/`
    );
    return response.results;
  }

  // Groups
  async getGroups(inventoryId?: number): Promise<AnsibleGroup[]> {
    let path = '/groups/';
    if (inventoryId) {
      path += `?inventory=${inventoryId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleGroup>>('GET', path);
    return response.results;
  }

  async getGroup(id: number): Promise<AnsibleGroup> {
    return this.request<AnsibleGroup>('GET', `/groups/${id}/`);
  }

  async getGroupHosts(groupId: number): Promise<AnsibleHost[]> {
    const response = await this.request<AWXApiResponse<AnsibleHost>>(
      'GET',
      `/groups/${groupId}/hosts/`
    );
    return response.results;
  }

  // Projects
  async getProjects(organizationId?: number): Promise<AnsibleProject[]> {
    let path = '/projects/';
    if (organizationId) {
      path += `?organization=${organizationId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleProject>>(
      'GET',
      path
    );
    return response.results;
  }

  async getProject(id: number): Promise<AnsibleProject> {
    return this.request<AnsibleProject>('GET', `/projects/${id}/`);
  }

  async syncProject(id: number): Promise<{ id: number }> {
    return this.request<{ id: number }>('POST', `/projects/${id}/update/`);
  }

  // Credentials
  async getCredentials(organizationId?: number): Promise<AnsibleCredential[]> {
    let path = '/credentials/';
    if (organizationId) {
      path += `?organization=${organizationId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleCredential>>(
      'GET',
      path
    );
    return response.results;
  }

  async getCredential(id: number): Promise<AnsibleCredential> {
    return this.request<AnsibleCredential>('GET', `/credentials/${id}/`);
  }

  // Job Templates
  async getJobTemplates(organizationId?: number): Promise<AnsibleJobTemplate[]> {
    let path = '/job_templates/';
    if (organizationId) {
      path += `?organization=${organizationId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleJobTemplate>>(
      'GET',
      path
    );
    return response.results;
  }

  async getJobTemplate(id: number): Promise<AnsibleJobTemplate> {
    return this.request<AnsibleJobTemplate>('GET', `/job_templates/${id}/`);
  }

  async launchJobTemplate(
    id: number,
    request?: LaunchJobRequest
  ): Promise<AnsibleJob> {
    return this.request<AnsibleJob>(
      'POST',
      `/job_templates/${id}/launch/`,
      request || {}
    );
  }

  // Workflow Job Templates
  async getWorkflowJobTemplates(
    organizationId?: number
  ): Promise<AnsibleWorkflowJobTemplate[]> {
    let path = '/workflow_job_templates/';
    if (organizationId) {
      path += `?organization=${organizationId}`;
    }
    const response = await this.request<AWXApiResponse<AnsibleWorkflowJobTemplate>>(
      'GET',
      path
    );
    return response.results;
  }

  async getWorkflowJobTemplate(id: number): Promise<AnsibleWorkflowJobTemplate> {
    return this.request<AnsibleWorkflowJobTemplate>(
      'GET',
      `/workflow_job_templates/${id}/`
    );
  }

  async launchWorkflowJobTemplate(
    id: number,
    request?: LaunchJobRequest
  ): Promise<{ id: number; workflow_job: number }> {
    return this.request<{ id: number; workflow_job: number }>(
      'POST',
      `/workflow_job_templates/${id}/launch/`,
      request || {}
    );
  }

  // Jobs
  async getJobs(
    templateId?: number,
    status?: string,
    limit?: number
  ): Promise<AnsibleJob[]> {
    const params: string[] = [];
    if (templateId) params.push(`unified_job_template=${templateId}`);
    if (status) params.push(`status=${status}`);
    if (limit) params.push(`page_size=${limit}`);

    const path = '/jobs/' + (params.length > 0 ? `?${params.join('&')}` : '');
    const response = await this.request<AWXApiResponse<AnsibleJob>>('GET', path);
    return response.results;
  }

  async getJob(id: number): Promise<AnsibleJob> {
    return this.request<AnsibleJob>('GET', `/jobs/${id}/`);
  }

  async getJobEvents(jobId: number): Promise<AnsibleJobEvent[]> {
    const response = await this.request<AWXApiResponse<AnsibleJobEvent>>(
      'GET',
      `/jobs/${jobId}/job_events/`
    );
    return response.results;
  }

  async getJobStdout(jobId: number): Promise<string> {
    return this.request<string>('GET', `/jobs/${jobId}/stdout/?format=txt`);
  }

  async cancelJob(id: number): Promise<void> {
    await this.request<void>('POST', `/jobs/${id}/cancel/`);
  }

  async relaunchJob(id: number): Promise<AnsibleJob> {
    return this.request<AnsibleJob>('POST', `/jobs/${id}/relaunch/`);
  }

  // Ad-hoc commands
  async runAdHocCommand(
    inventoryId: number,
    moduleArgs: string,
    moduleName: string = 'shell',
    limit?: string,
    credentialId?: number
  ): Promise<AnsibleJob> {
    const body: Record<string, unknown> = {
      inventory: inventoryId,
      module_name: moduleName,
      module_args: moduleArgs,
      job_type: 'run',
    };
    if (limit) body.limit = limit;
    if (credentialId) body.credential = credentialId;

    return this.request<AnsibleJob>('POST', '/ad_hoc_commands/', body);
  }

  // Utility methods
  parseHostVariables(variablesString: string): Record<string, unknown> {
    if (!variablesString || variablesString.trim() === '') {
      return {};
    }
    try {
      // Try JSON first
      return JSON.parse(variablesString);
    } catch {
      // Try YAML-like key: value format
      const vars: Record<string, unknown> = {};
      const lines = variablesString.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          vars[match[1]] = match[2].trim();
        }
      }
      return vars;
    }
  }

  // Get all hosts across all inventories with their groups
  async getAllHostsWithGroups(): Promise<
    Array<AnsibleHost & { groups: AnsibleGroup[]; inventory_name: string }>
  > {
    const inventories = await this.getInventories(this.config.organizationId);
    const hostsWithGroups: Array<
      AnsibleHost & { groups: AnsibleGroup[]; inventory_name: string }
    > = [];

    for (const inventory of inventories) {
      const hosts = await this.getInventoryHosts(inventory.id);
      for (const host of hosts) {
        const groups = await this.getHostGroups(host.id);
        hostsWithGroups.push({
          ...host,
          groups,
          inventory_name: inventory.name,
        });
      }
    }

    return hostsWithGroups;
  }
}
