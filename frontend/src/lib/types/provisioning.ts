/**
 * Type definitions for provisioning integrations and capabilities
 *
 * Validates Requirements: 2.1, 2.2, 13.1
 *
 * These types support dynamic integration discovery and are extensible
 * for future integrations (EC2, Azure, Terraform, etc.)
 */

/**
 * Parameter validation rules for capability parameters
 */
export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
}

/**
 * Defines a single parameter for a provisioning capability
 */
export interface CapabilityParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  validation?: ParameterValidation;
}

/**
 * Defines a specific capability (operation) that an integration can perform
 */
export interface ProvisioningCapability {
  name: string;
  description: string;
  operation: 'create' | 'destroy';
  parameters: CapabilityParameter[];
}

/**
 * Represents a provisioning integration (e.g., Proxmox, EC2, Azure)
 */
export interface ProvisioningIntegration {
  name: string;
  displayName: string;
  type: 'virtualization' | 'cloud' | 'container';
  status: 'connected' | 'degraded' | 'not_configured';
  capabilities: ProvisioningCapability[];
}

/**
 * Parameters for creating/managing Proxmox VMs
 */
export interface ProxmoxVMParams {
  vmid: number;
  name: string;
  node: string;
  cores?: number;
  memory?: number;
  sockets?: number;
  cpu?: string;
  scsi0?: string;
  ide2?: string;
  net0?: string;
  ostype?: string;
}

/**
 * Parameters for creating/managing Proxmox LXC containers
 */
export interface ProxmoxLXCParams {
  vmid: number;
  hostname: string;
  node: string;
  ostemplate: string;
  cores?: number;
  memory?: number;
  rootfs?: string;
  net0?: string;
  password?: string;
}

/**
 * Defines a lifecycle action that can be performed on a resource
 */
export interface LifecycleAction {
  name: string;
  displayName: string;
  description: string;
  requiresConfirmation: boolean;
  destructive: boolean;
  availableWhen: string[];
}

/**
 * Result of a provisioning operation
 */
export interface ProvisioningResult {
  success: boolean;
  taskId?: string;
  vmid?: number;
  nodeId?: string;
  message: string;
  error?: string;
}

/**
 * API response for listing available integrations
 */
export interface ListIntegrationsResponse {
  integrations: ProvisioningIntegration[];
}

/**
 * API response for getting a specific integration's details
 */
export interface GetIntegrationResponse {
  integration: ProvisioningIntegration;
}

/**
 * API request for executing a provisioning capability
 */
export interface ExecuteCapabilityRequest {
  integrationName: string;
  capabilityName: string;
  parameters: Record<string, unknown>;
}

/**
 * API response for executing a provisioning capability
 */
export interface ExecuteCapabilityResponse {
  result: ProvisioningResult;
}

/**
 * API response for listing lifecycle actions
 */
export interface ListLifecycleActionsResponse {
  actions: LifecycleAction[];
}

/**
 * API request for executing a lifecycle action
 */
export interface ExecuteLifecycleActionRequest {
  actionName: string;
  resourceId: string;
  parameters?: Record<string, unknown>;
}

/**
 * API response for executing a lifecycle action
 */
export interface ExecuteLifecycleActionResponse {
  result: ProvisioningResult;
}

/**
 * PVE node info from Proxmox cluster
 */
export interface PVENode {
  node: string;
  status: string;
  maxcpu?: number;
  maxmem?: number;
}

/**
 * ISO image or OS template from Proxmox storage
 */
export interface StorageContent {
  volid: string;
  format: string;
  size: number;
}
