/**
 * Terraform Cloud/Enterprise Integration Types
 *
 * Defines types for Terraform Cloud/Enterprise API integration
 */

// Configuration for Terraform Cloud/Enterprise connection
export interface TerraformConfig {
  enabled: boolean;
  url: string; // Terraform Cloud/Enterprise API URL (default: https://app.terraform.io)
  token: string; // API token
  organization?: string; // Default organization name
  timeout?: number; // Request timeout in ms
}

// Terraform Workspace
export interface TerraformWorkspace {
  id: string;
  type: 'workspaces';
  attributes: {
    name: string;
    description: string | null;
    environment: string;
    'auto-apply': boolean;
    'allow-destroy-plan': boolean;
    locked: boolean;
    'queue-all-runs': boolean;
    'speculative-enabled': boolean;
    'terraform-version': string;
    'working-directory': string | null;
    'global-remote-state': boolean;
    'created-at': string;
    'updated-at': string;
    'resource-count': number;
    'execution-mode': 'remote' | 'local' | 'agent';
    'vcs-repo': {
      identifier: string;
      branch: string;
      'display-identifier': string;
      'ingress-submodules': boolean;
    } | null;
    'latest-change-at': string | null;
  };
  relationships: {
    organization: { data: { id: string; type: string } };
    'current-run': { data: { id: string; type: string } | null };
    'latest-run': { data: { id: string; type: string } | null };
    'current-state-version': { data: { id: string; type: string } | null };
  };
}

// Terraform Run
export interface TerraformRun {
  id: string;
  type: 'runs';
  attributes: {
    status:
      | 'pending'
      | 'plan_queued'
      | 'planning'
      | 'planned'
      | 'cost_estimating'
      | 'cost_estimated'
      | 'policy_checking'
      | 'policy_override'
      | 'policy_soft_failed'
      | 'policy_checked'
      | 'confirmed'
      | 'planned_and_finished'
      | 'apply_queued'
      | 'applying'
      | 'applied'
      | 'discarded'
      | 'errored'
      | 'canceled'
      | 'force_canceled';
    'is-destroy': boolean;
    message: string;
    'created-at': string;
    'has-changes': boolean;
    'auto-apply': boolean;
    source: 'tfe-ui' | 'tfe-api' | 'tfe-configuration-version';
    'trigger-reason': string;
    'plan-only': boolean;
    'status-timestamps': {
      'plan-queued-at'?: string;
      'planning-at'?: string;
      'planned-at'?: string;
      'apply-queued-at'?: string;
      'applying-at'?: string;
      'applied-at'?: string;
      'errored-at'?: string;
      'discarded-at'?: string;
      'canceled-at'?: string;
    };
  };
  relationships: {
    workspace: { data: { id: string; type: string } };
    plan: { data: { id: string; type: string } | null };
    apply: { data: { id: string; type: string } | null };
    'configuration-version': { data: { id: string; type: string } | null };
    'created-by': { data: { id: string; type: string } | null };
  };
}

// Terraform Plan
export interface TerraformPlan {
  id: string;
  type: 'plans';
  attributes: {
    status: 'pending' | 'queued' | 'running' | 'finished' | 'errored' | 'canceled' | 'unreachable';
    'has-changes': boolean;
    'resource-additions': number;
    'resource-changes': number;
    'resource-destructions': number;
    'log-read-url': string;
  };
}

// Terraform Apply
export interface TerraformApply {
  id: string;
  type: 'applies';
  attributes: {
    status: 'pending' | 'queued' | 'running' | 'finished' | 'errored' | 'canceled' | 'unreachable';
    'resource-additions': number;
    'resource-changes': number;
    'resource-destructions': number;
    'log-read-url': string;
  };
}

// Terraform State Version
export interface TerraformStateVersion {
  id: string;
  type: 'state-versions';
  attributes: {
    'created-at': string;
    serial: number;
    'hosted-state-download-url': string;
    'hosted-json-state-download-url': string;
    status: 'pending' | 'finalized' | 'discarded';
    size: number;
    'terraform-version': string;
    'resources-processed': boolean;
  };
  relationships: {
    run: { data: { id: string; type: string } | null };
    'created-by': { data: { id: string; type: string } | null };
    outputs: { data: { id: string; type: string }[] };
  };
}

// Terraform State Resource
export interface TerraformStateResource {
  id: string;
  type: 'state-version-resources';
  attributes: {
    address: string;
    name: string;
    type: string;
    module: string | null;
    mode: 'managed' | 'data';
    'provider-name': string;
    'name-index': string | null;
  };
}

// Terraform Output
export interface TerraformOutput {
  id: string;
  type: 'state-version-outputs';
  attributes: {
    name: string;
    sensitive: boolean;
    type: string;
    value: unknown;
    'detailed-type': unknown;
  };
}

// Terraform Variable
export interface TerraformVariable {
  id: string;
  type: 'vars';
  attributes: {
    key: string;
    value: string | null;
    description: string | null;
    category: 'terraform' | 'env';
    hcl: boolean;
    sensitive: boolean;
  };
  relationships: {
    workspace: { data: { id: string; type: string } };
  };
}

// Terraform Organization
export interface TerraformOrganization {
  id: string;
  type: 'organizations';
  attributes: {
    name: string;
    email: string;
    'created-at': string;
    'external-id': string;
    'two-factor-conformant': boolean;
    'workspace-limit': number | null;
    'workspace-count': number;
    'run-task-limit': number | null;
    'run-task-count': number;
    'is-disabled': boolean;
    'managed-resource-count': number;
    cost_estimation_enabled: boolean;
    send_passing_statuses_for_untriggered_speculative_plans: boolean;
  };
}

// Terraform Team
export interface TerraformTeam {
  id: string;
  type: 'teams';
  attributes: {
    name: string;
    'users-count': number;
    visibility: 'secret' | 'organization';
    'organization-access': {
      'manage-policies': boolean;
      'manage-workspaces': boolean;
      'manage-vcs-settings': boolean;
      'manage-policy-overrides': boolean;
    };
  };
}

// Terraform API response wrapper
export interface TerraformApiResponse<T> {
  data: T;
  included?: unknown[];
  links?: {
    self: string;
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
  meta?: {
    pagination?: {
      'current-page': number;
      'page-size': number;
      'prev-page': number | null;
      'next-page': number | null;
      'total-pages': number;
      'total-count': number;
    };
  };
}

// Create run request
export interface CreateRunRequest {
  message?: string;
  'is-destroy'?: boolean;
  'refresh'?: boolean;
  'refresh-only'?: boolean;
  'auto-apply'?: boolean;
  'plan-only'?: boolean;
  'target-addrs'?: string[];
  'replace-addrs'?: string[];
  variables?: Array<{
    key: string;
    value: string;
  }>;
}

// Mapped infrastructure resource for Pabawi
export interface TerraformMappedResource {
  id: string;
  address: string;
  name: string;
  type: string;
  provider: string;
  module: string | null;
  mode: 'managed' | 'data';
  workspaceId: string;
  workspaceName: string;
  organizationName: string;
}

// Workspace summary for dashboard
export interface WorkspaceSummary {
  id: string;
  name: string;
  organization: string;
  environment: string;
  terraformVersion: string;
  resourceCount: number;
  locked: boolean;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  hasChanges: boolean;
  executionMode: string;
  vcsRepo: string | null;
}
