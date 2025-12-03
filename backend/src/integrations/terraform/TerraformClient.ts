/**
 * Terraform Cloud/Enterprise API Client
 *
 * HTTP client for communicating with Terraform Cloud/Enterprise API
 */

import type {
  TerraformConfig,
  TerraformWorkspace,
  TerraformRun,
  TerraformPlan,
  TerraformApply,
  TerraformStateVersion,
  TerraformStateResource,
  TerraformOutput,
  TerraformVariable,
  TerraformOrganization,
  TerraformApiResponse,
  CreateRunRequest,
} from './types';

// Declare require for Node.js modules
declare const require: any;
// Node.js globals
declare const URL: any;
declare const URLSearchParams: any;

export class TerraformClient {
  private config: TerraformConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: TerraformConfig) {
    this.config = config;
    // Default to Terraform Cloud if not specified
    this.baseUrl = (config.url || 'https://app.terraform.io').replace(/\/$/, '');
    this.headers = {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    };
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
                `Terraform API error: ${res.statusCode} ${res.statusMessage} - ${data}`
              )
            );
          }
        });
      });

      req.on('error', (err: Error) => {
        reject(new Error(`Terraform API request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Terraform API request timed out'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: 'ok' | 'error'; error?: string }> {
    try {
      // Try to get account details to verify auth
      await this.request<unknown>('GET', '/account/details');
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Organizations
  async getOrganizations(): Promise<TerraformOrganization[]> {
    const response = await this.request<TerraformApiResponse<TerraformOrganization[]>>(
      'GET',
      '/organizations'
    );
    return response.data;
  }

  async getOrganization(name: string): Promise<TerraformOrganization> {
    const response = await this.request<TerraformApiResponse<TerraformOrganization>>(
      'GET',
      `/organizations/${encodeURIComponent(name)}`
    );
    return response.data;
  }

  // Workspaces
  async getWorkspaces(
    organizationName?: string,
    page?: number,
    pageSize?: number
  ): Promise<{ workspaces: TerraformWorkspace[]; totalCount: number }> {
    const org = organizationName || this.config.organization;
    if (!org) {
      throw new Error('Organization name is required');
    }

    const params = new URLSearchParams();
    if (page) params.set('page[number]', String(page));
    if (pageSize) params.set('page[size]', String(pageSize));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<TerraformApiResponse<TerraformWorkspace[]>>(
      'GET',
      `/organizations/${encodeURIComponent(org)}/workspaces${query}`
    );

    return {
      workspaces: response.data,
      totalCount: response.meta?.pagination?.['total-count'] || response.data.length,
    };
  }

  async getWorkspace(organizationName: string, workspaceName: string): Promise<TerraformWorkspace> {
    const response = await this.request<TerraformApiResponse<TerraformWorkspace>>(
      'GET',
      `/organizations/${encodeURIComponent(organizationName)}/workspaces/${encodeURIComponent(workspaceName)}`
    );
    return response.data;
  }

  async getWorkspaceById(workspaceId: string): Promise<TerraformWorkspace> {
    const response = await this.request<TerraformApiResponse<TerraformWorkspace>>(
      'GET',
      `/workspaces/${workspaceId}`
    );
    return response.data;
  }

  async lockWorkspace(workspaceId: string, reason?: string): Promise<TerraformWorkspace> {
    const response = await this.request<TerraformApiResponse<TerraformWorkspace>>(
      'POST',
      `/workspaces/${workspaceId}/actions/lock`,
      { reason }
    );
    return response.data;
  }

  async unlockWorkspace(workspaceId: string): Promise<TerraformWorkspace> {
    const response = await this.request<TerraformApiResponse<TerraformWorkspace>>(
      'POST',
      `/workspaces/${workspaceId}/actions/unlock`
    );
    return response.data;
  }

  // Runs
  async getRuns(
    workspaceId: string,
    page?: number,
    pageSize?: number
  ): Promise<{ runs: TerraformRun[]; totalCount: number }> {
    const params = new URLSearchParams();
    if (page) params.set('page[number]', String(page));
    if (pageSize) params.set('page[size]', String(pageSize));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<TerraformApiResponse<TerraformRun[]>>(
      'GET',
      `/workspaces/${workspaceId}/runs${query}`
    );

    return {
      runs: response.data,
      totalCount: response.meta?.pagination?.['total-count'] || response.data.length,
    };
  }

  async getRun(runId: string): Promise<TerraformRun> {
    const response = await this.request<TerraformApiResponse<TerraformRun>>(
      'GET',
      `/runs/${runId}`
    );
    return response.data;
  }

  async createRun(workspaceId: string, options?: CreateRunRequest): Promise<TerraformRun> {
    const body = {
      data: {
        type: 'runs',
        attributes: {
          message: options?.message || 'Triggered via Pabawi',
          'is-destroy': options?.['is-destroy'] || false,
          refresh: options?.refresh ?? true,
          'refresh-only': options?.['refresh-only'] || false,
          'auto-apply': options?.['auto-apply'] || false,
          'plan-only': options?.['plan-only'] || false,
          'target-addrs': options?.['target-addrs'] || null,
          'replace-addrs': options?.['replace-addrs'] || null,
        },
        relationships: {
          workspace: {
            data: {
              type: 'workspaces',
              id: workspaceId,
            },
          },
        },
      },
    };

    const response = await this.request<TerraformApiResponse<TerraformRun>>(
      'POST',
      '/runs',
      body
    );
    return response.data;
  }

  async applyRun(runId: string, comment?: string): Promise<void> {
    await this.request<void>('POST', `/runs/${runId}/actions/apply`, {
      comment: comment || 'Applied via Pabawi',
    });
  }

  async discardRun(runId: string, comment?: string): Promise<void> {
    await this.request<void>('POST', `/runs/${runId}/actions/discard`, {
      comment: comment || 'Discarded via Pabawi',
    });
  }

  async cancelRun(runId: string, comment?: string): Promise<void> {
    await this.request<void>('POST', `/runs/${runId}/actions/cancel`, {
      comment: comment || 'Cancelled via Pabawi',
    });
  }

  async forceUnlockRun(runId: string): Promise<void> {
    await this.request<void>('POST', `/runs/${runId}/actions/force-cancel`);
  }

  // Plans
  async getPlan(planId: string): Promise<TerraformPlan> {
    const response = await this.request<TerraformApiResponse<TerraformPlan>>(
      'GET',
      `/plans/${planId}`
    );
    return response.data;
  }

  async getPlanLogs(planId: string): Promise<string> {
    const plan = await this.getPlan(planId);
    if (!plan.attributes['log-read-url']) {
      return '';
    }
    // Fetch logs from the log URL
    return this.fetchExternalUrl(plan.attributes['log-read-url']);
  }

  // Applies
  async getApply(applyId: string): Promise<TerraformApply> {
    const response = await this.request<TerraformApiResponse<TerraformApply>>(
      'GET',
      `/applies/${applyId}`
    );
    return response.data;
  }

  async getApplyLogs(applyId: string): Promise<string> {
    const apply = await this.getApply(applyId);
    if (!apply.attributes['log-read-url']) {
      return '';
    }
    return this.fetchExternalUrl(apply.attributes['log-read-url']);
  }

  // State Versions
  async getCurrentStateVersion(workspaceId: string): Promise<TerraformStateVersion | null> {
    try {
      const response = await this.request<TerraformApiResponse<TerraformStateVersion>>(
        'GET',
        `/workspaces/${workspaceId}/current-state-version`
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async getStateVersions(
    workspaceId: string,
    page?: number,
    pageSize?: number
  ): Promise<{ stateVersions: TerraformStateVersion[]; totalCount: number }> {
    const params = new URLSearchParams();
    if (page) params.set('page[number]', String(page));
    if (pageSize) params.set('page[size]', String(pageSize));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<TerraformApiResponse<TerraformStateVersion[]>>(
      'GET',
      `/workspaces/${workspaceId}/state-versions${query}`
    );

    return {
      stateVersions: response.data,
      totalCount: response.meta?.pagination?.['total-count'] || response.data.length,
    };
  }

  async getStateVersion(stateVersionId: string): Promise<TerraformStateVersion> {
    const response = await this.request<TerraformApiResponse<TerraformStateVersion>>(
      'GET',
      `/state-versions/${stateVersionId}`
    );
    return response.data;
  }

  async getStateVersionResources(
    stateVersionId: string,
    page?: number,
    pageSize?: number
  ): Promise<{ resources: TerraformStateResource[]; totalCount: number }> {
    const params = new URLSearchParams();
    if (page) params.set('page[number]', String(page));
    if (pageSize) params.set('page[size]', String(pageSize));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<TerraformApiResponse<TerraformStateResource[]>>(
      'GET',
      `/state-versions/${stateVersionId}/resources${query}`
    );

    return {
      resources: response.data,
      totalCount: response.meta?.pagination?.['total-count'] || response.data.length,
    };
  }

  async getStateVersionOutputs(stateVersionId: string): Promise<TerraformOutput[]> {
    const response = await this.request<TerraformApiResponse<TerraformOutput[]>>(
      'GET',
      `/state-versions/${stateVersionId}/outputs`
    );
    return response.data;
  }

  // Variables
  async getWorkspaceVariables(workspaceId: string): Promise<TerraformVariable[]> {
    const response = await this.request<TerraformApiResponse<TerraformVariable[]>>(
      'GET',
      `/workspaces/${workspaceId}/vars`
    );
    return response.data;
  }

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
    const body = {
      data: {
        type: 'vars',
        attributes: {
          key,
          value,
          category: options?.category || 'terraform',
          hcl: options?.hcl || false,
          sensitive: options?.sensitive || false,
          description: options?.description || null,
        },
        relationships: {
          workspace: {
            data: {
              type: 'workspaces',
              id: workspaceId,
            },
          },
        },
      },
    };

    const response = await this.request<TerraformApiResponse<TerraformVariable>>(
      'POST',
      '/vars',
      body
    );
    return response.data;
  }

  async updateVariable(
    variableId: string,
    value: string,
    options?: {
      hcl?: boolean;
      sensitive?: boolean;
      description?: string;
    }
  ): Promise<TerraformVariable> {
    const body = {
      data: {
        type: 'vars',
        id: variableId,
        attributes: {
          value,
          hcl: options?.hcl,
          sensitive: options?.sensitive,
          description: options?.description,
        },
      },
    };

    const response = await this.request<TerraformApiResponse<TerraformVariable>>(
      'PATCH',
      `/vars/${variableId}`,
      body
    );
    return response.data;
  }

  async deleteVariable(variableId: string): Promise<void> {
    await this.request<void>('DELETE', `/vars/${variableId}`);
  }

  // Helper to fetch external URLs (like log URLs)
  private async fetchExternalUrl(url: string): Promise<string> {
    const https = require('https');
    const http = require('http');
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.token}`,
          },
          timeout: this.config.timeout || 30000,
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
        }
      );

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.end();
    });
  }
}
