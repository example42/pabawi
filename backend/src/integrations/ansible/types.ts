/**
 * Ansible Integration Types
 *
 * Defines types for Ansible AWX/Tower API integration
 */

// Configuration for Ansible AWX/Tower connection
export interface AnsibleConfig {
  enabled: boolean;
  url: string; // AWX/Tower base URL
  token?: string; // API token for authentication
  username?: string; // Basic auth username
  password?: string; // Basic auth password
  timeout?: number; // Request timeout in ms
  verifySsl?: boolean; // Whether to verify SSL certificates
  organizationId?: number; // Default organization ID
}

// AWX/Tower Inventory
export interface AnsibleInventory {
  id: number;
  name: string;
  description: string;
  organization: number;
  kind: string;
  host_filter: string | null;
  variables: string;
  has_active_failures: boolean;
  total_hosts: number;
  hosts_with_active_failures: number;
  total_groups: number;
  has_inventory_sources: boolean;
  total_inventory_sources: number;
  inventory_sources_with_failures: number;
  pending_deletion: boolean;
  created: string;
  modified: string;
}

// AWX/Tower Host
export interface AnsibleHost {
  id: number;
  name: string;
  description: string;
  inventory: number;
  enabled: boolean;
  instance_id: string;
  variables: string;
  has_active_failures: boolean;
  has_inventory_sources: boolean;
  last_job: number | null;
  last_job_host_summary: number | null;
  created: string;
  modified: string;
}

// AWX/Tower Group
export interface AnsibleGroup {
  id: number;
  name: string;
  description: string;
  inventory: number;
  variables: string;
  has_active_failures: boolean;
  total_hosts: number;
  hosts_with_active_failures: number;
  total_groups: number;
  has_inventory_sources: boolean;
  created: string;
  modified: string;
}

// AWX/Tower Job Template
export interface AnsibleJobTemplate {
  id: number;
  type: string;
  name: string;
  description: string;
  job_type: 'run' | 'check';
  inventory: number | null;
  project: number;
  playbook: string;
  scm_branch: string;
  forks: number;
  limit: string;
  verbosity: number;
  extra_vars: string;
  job_tags: string;
  skip_tags: string;
  timeout: number;
  ask_scm_branch_on_launch: boolean;
  ask_diff_mode_on_launch: boolean;
  ask_variables_on_launch: boolean;
  ask_limit_on_launch: boolean;
  ask_tags_on_launch: boolean;
  ask_skip_tags_on_launch: boolean;
  ask_job_type_on_launch: boolean;
  ask_verbosity_on_launch: boolean;
  ask_inventory_on_launch: boolean;
  ask_credential_on_launch: boolean;
  survey_enabled: boolean;
  become_enabled: boolean;
  diff_mode: boolean;
  allow_simultaneous: boolean;
  status: string;
  last_job_run: string | null;
  last_job_failed: boolean;
  next_job_run: string | null;
  created: string;
  modified: string;
}

// AWX/Tower Job
export interface AnsibleJob {
  id: number;
  type: string;
  name: string;
  description: string;
  unified_job_template: number;
  launch_type: string;
  status: 'new' | 'pending' | 'waiting' | 'running' | 'successful' | 'failed' | 'error' | 'canceled';
  failed: boolean;
  started: string | null;
  finished: string | null;
  canceled_on: string | null;
  elapsed: number;
  job_explanation: string;
  execution_node: string;
  controller_node: string;
  job_type: string;
  inventory: number | null;
  project: number | null;
  playbook: string;
  scm_branch: string;
  forks: number;
  limit: string;
  verbosity: number;
  extra_vars: string;
  job_tags: string;
  skip_tags: string;
  artifacts: Record<string, unknown>;
  scm_revision: string;
  created: string;
  modified: string;
}

// AWX/Tower Job Event
export interface AnsibleJobEvent {
  id: number;
  type: string;
  created: string;
  modified: string;
  job: number;
  event: string;
  counter: number;
  event_display: string;
  event_data: Record<string, unknown>;
  event_level: number;
  failed: boolean;
  changed: boolean;
  uuid: string;
  parent_uuid: string;
  host: number | null;
  host_name: string;
  playbook: string;
  play: string;
  task: string;
  role: string;
  stdout: string;
  start_line: number;
  end_line: number;
  verbosity: number;
}

// AWX/Tower Project
export interface AnsibleProject {
  id: number;
  type: string;
  name: string;
  description: string;
  organization: number;
  scm_type: string;
  scm_url: string;
  scm_branch: string;
  scm_refspec: string;
  scm_clean: boolean;
  scm_track_submodules: boolean;
  scm_delete_on_update: boolean;
  scm_update_on_launch: boolean;
  scm_update_cache_timeout: number;
  allow_override: boolean;
  timeout: number;
  status: string;
  last_job_run: string | null;
  last_job_failed: boolean;
  next_job_run: string | null;
  last_update_failed: boolean;
  last_updated: string | null;
  created: string;
  modified: string;
}

// AWX/Tower Credential
export interface AnsibleCredential {
  id: number;
  type: string;
  name: string;
  description: string;
  organization: number | null;
  credential_type: number;
  managed: boolean;
  created: string;
  modified: string;
}

// AWX/Tower Organization
export interface AnsibleOrganization {
  id: number;
  type: string;
  name: string;
  description: string;
  max_hosts: number;
  created: string;
  modified: string;
}

// Launch job request
export interface LaunchJobRequest {
  inventory?: number;
  credential?: number;
  limit?: string;
  job_tags?: string;
  skip_tags?: string;
  extra_vars?: Record<string, unknown>;
  verbosity?: number;
  diff_mode?: boolean;
  job_type?: 'run' | 'check';
  scm_branch?: string;
}

// AWX API response wrapper
export interface AWXApiResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Host facts from AWX
export interface AnsibleHostFacts {
  ansible_facts: Record<string, unknown>;
  module_setup: boolean;
}

// Job summary for a host
export interface AnsibleJobHostSummary {
  id: number;
  created: string;
  modified: string;
  job: number;
  host: number;
  host_name: string;
  changed: number;
  dark: number;
  failures: number;
  ok: number;
  processed: number;
  skipped: number;
  failed: boolean;
  ignored: number;
  rescued: number;
}

// Workflow job template
export interface AnsibleWorkflowJobTemplate {
  id: number;
  type: string;
  name: string;
  description: string;
  organization: number;
  survey_enabled: boolean;
  allow_simultaneous: boolean;
  ask_variables_on_launch: boolean;
  inventory: number | null;
  limit: string;
  scm_branch: string;
  ask_inventory_on_launch: boolean;
  ask_scm_branch_on_launch: boolean;
  ask_limit_on_launch: boolean;
  status: string;
  last_job_run: string | null;
  last_job_failed: boolean;
  next_job_run: string | null;
  created: string;
  modified: string;
}

// Parsed host variables
export interface ParsedHostVariables {
  ansible_host?: string;
  ansible_port?: number;
  ansible_user?: string;
  ansible_connection?: string;
  ansible_ssh_private_key_file?: string;
  [key: string]: unknown;
}

// Mapped node from Ansible
export interface AnsibleMappedNode {
  id: string;
  name: string;
  uri: string;
  transport: 'ssh' | 'winrm' | 'docker' | 'local';
  config: {
    user?: string;
    port?: number;
    [key: string]: unknown;
  };
  source: 'ansible';
  ansibleHostId: number;
  ansibleInventoryId: number;
  groups: string[];
  enabled: boolean;
  hasActiveFailures: boolean;
  lastJobId?: number;
}
