/**
 * Proxmox API functions
 *
 * Domain-specific API functions for Proxmox integration including
 * provisioning, lifecycle management, and connection testing.
 */

import { get, post, del } from './api';
import type {
  ListIntegrationsResponse,
  ProxmoxVMParams,
  ProxmoxLXCParams,
  ProvisioningResult,
  LifecycleAction,
  PVENode,
  StorageContent,
  PVEStorage,
  PVENetwork,
} from './types/provisioning';

/**
 * Configuration for Proxmox integration
 */
export interface ProxmoxConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  realm?: string;
  token?: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
}

/**
 * Response from Proxmox connection test
 */
export interface ProxmoxTestResponse {
  success: boolean;
  message: string;
}

/**
 * Get available provisioning integrations
 * Validates Requirements: 2.1
 *
 * Retry logic: 2 retries with 1000ms delay for status queries
 */
export async function getProvisioningIntegrations(): Promise<ListIntegrationsResponse> {
  return get<ListIntegrationsResponse>('/api/integrations/provisioning', {
    maxRetries: 2,
    retryDelay: 1000,
  });
}

/**
 * Create a Proxmox VM
 * Validates Requirements: 3.3
 *
 * Retry logic: No retries for provisioning operations (user-initiated)
 */
export async function createProxmoxVM(params: ProxmoxVMParams): Promise<ProvisioningResult> {
  const response = await post<{ result: { id: string; status: string; error?: string; results?: { output?: { stdout?: string } }[] } }>(
    '/api/integrations/proxmox/provision/vm',
    params,
    {
      maxRetries: 0,
      showRetryNotifications: false,
    },
  );

  const success = response.result.status === 'success';
  const message = success
    ? response.result.results?.[0]?.output?.stdout ?? `VM ${String(params.vmid)} created successfully`
    : response.result.error ?? 'Failed to create VM';

  return {
    success,
    message,
    vmid: params.vmid,
    taskId: response.result.id,
  };
}

/**
 * Create a Proxmox LXC container
 * Validates Requirements: 4.3
 *
 * Retry logic: No retries for provisioning operations (user-initiated)
 */
export async function createProxmoxLXC(params: ProxmoxLXCParams): Promise<ProvisioningResult> {
  const response = await post<{ result: { id: string; status: string; error?: string; results?: { output?: { stdout?: string } }[] } }>(
    '/api/integrations/proxmox/provision/lxc',
    params,
    {
      maxRetries: 0,
      showRetryNotifications: false,
    },
  );

  const success = response.result.status === 'success';
  const message = success
    ? response.result.results?.[0]?.output?.stdout ?? `LXC ${String(params.vmid)} created successfully`
    : response.result.error ?? 'Failed to create LXC container';

  return {
    success,
    message,
    vmid: params.vmid,
    taskId: response.result.id,
  };
}

/**
 * Get list of PVE nodes in the Proxmox cluster
 * Retry logic: 2 retries for read operations
 */
export async function getProxmoxNodes(): Promise<PVENode[]> {
  const response = await get<{ nodes: PVENode[] }>('/api/integrations/proxmox/nodes', {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.nodes;
}

/**
 * Get the next available VMID from Proxmox
 * Retry logic: 2 retries for read operations
 */
export async function getProxmoxNextVMID(): Promise<number> {
  const response = await get<{ vmid: number }>('/api/integrations/proxmox/nextid', {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.vmid;
}

/**
 * Get ISO images available on a Proxmox node
 * Retry logic: 2 retries for read operations
 *
 * @param node - PVE node name
 * @param storage - Storage name (optional)
 */
export async function getProxmoxISOs(node: string, storage?: string): Promise<StorageContent[]> {
  const params = storage ? `?storage=${encodeURIComponent(storage)}` : '';
  const response = await get<{ isos: StorageContent[] }>(`/api/integrations/proxmox/nodes/${encodeURIComponent(node)}/isos${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.isos;
}

/**
 * Get OS templates available on a Proxmox node
 * Retry logic: 2 retries for read operations
 *
 * @param node - PVE node name
 * @param storage - Storage name (optional)
 */
export async function getProxmoxTemplates(node: string, storage?: string): Promise<StorageContent[]> {
  const params = storage ? `?storage=${encodeURIComponent(storage)}` : '';
  const response = await get<{ templates: StorageContent[] }>(`/api/integrations/proxmox/nodes/${encodeURIComponent(node)}/templates${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.templates;
}

/**
 * Get available storages on a Proxmox node
 *
 * Retry logic: 2 retries for read operations
 *
 * @param node - PVE node name
 * @param content - Content type filter (optional, e.g. 'rootdir', 'images')
 */
export async function getProxmoxStorages(node: string, content?: string): Promise<PVEStorage[]> {
  const params = content ? `?content=${encodeURIComponent(content)}` : '';
  const response = await get<{ storages: PVEStorage[] }>(`/api/integrations/proxmox/nodes/${encodeURIComponent(node)}/storages${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.storages;
}

/**
 * Get available network bridges on a Proxmox node
 *
 * Retry logic: 2 retries for read operations
 *
 * @param node - PVE node name
 * @param type - Network type filter (optional, defaults to 'bridge' on backend)
 */
export async function getProxmoxNetworks(node: string, type?: string): Promise<PVENetwork[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : '';
  const response = await get<{ networks: PVENetwork[] }>(`/api/integrations/proxmox/nodes/${encodeURIComponent(node)}/networks${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.networks;
}

/**
 * Fetch available lifecycle actions for a node from its provider.
 * The backend resolves the provider from the node ID prefix and returns
 * the actions that integration supports.
 *
 * @param nodeId - The ID of the node (e.g. "proxmox:node:vmid", "aws:region:instanceId")
 */
export async function fetchLifecycleActions(
  nodeId: string,
): Promise<{ provider: string; actions: LifecycleAction[] }> {
  const response = await get<{ provider: string; actions: LifecycleAction[] }>(
    `/api/inventory/${nodeId}/lifecycle-actions`,
    { maxRetries: 2 },
  );

  return response;
}

/**
 * Execute a lifecycle action on a node
 * Validates Requirements: 6.4
 *
 * Retry logic: No retries for provisioning operations (user-initiated)
 *
 * @param nodeId - The ID of the node to perform the action on
 * @param action - The action to perform (start, stop, reboot, etc.)
 * @param parameters - Optional parameters for the action
 */
export async function executeNodeAction(
  nodeId: string,
  action: string,
  parameters?: Record<string, unknown>
): Promise<ProvisioningResult> {
  const response = await post<{ result: { status: string; error?: string; results?: { output?: { stdout?: string } }[] } }>(
    `/api/integrations/proxmox/action`,
    { nodeId, action, parameters },
    {
      maxRetries: 0,
      showRetryNotifications: false,
    }
  );

  const success = response.result.status === 'success';
  const message = success
    ? response.result.results?.[0]?.output?.stdout ?? `Action ${action} completed successfully`
    : response.result.error ?? `Action ${action} failed`;

  return {
    success,
    message,
    nodeId,
  };
}

/**
 * Destroy a node (VM or LXC)
 * Validates Requirements: 7.3, 8.3
 *
 * Retry logic: No retries for provisioning operations (user-initiated)
 *
 * @param nodeId - The ID of the node to destroy
 */
export async function destroyNode(nodeId: string): Promise<ProvisioningResult> {
  // Parse proxmox node ID format: proxmox:{node}:{vmid}
  const parts = nodeId.split(':');
  const proxmoxNode = parts.length >= 3 ? parts[1] : '';
  const vmid = parts.length >= 3 ? parts[2] : nodeId;

  const response = await del<{ result: { status: string; error?: string; results?: { output?: { stdout?: string } }[] } }>(
    `/api/integrations/proxmox/provision/${vmid}?node=${encodeURIComponent(proxmoxNode)}`,
    {
      maxRetries: 0,
      showRetryNotifications: false,
    }
  );

  const success = response.result.status === 'success';
  const message = success
    ? response.result.results?.[0]?.output?.stdout ?? 'Guest destroyed successfully'
    : response.result.error ?? 'Failed to destroy guest';

  return {
    success,
    message,
    nodeId,
  };
}

/**
 * Test Proxmox connection using .env-sourced configuration
 * Validates Requirements: 12.2, 12.3, 12.7
 *
 * Retry logic: No retries for test operations (user-initiated)
 */
export async function testProxmoxConnection(): Promise<ProxmoxTestResponse> {
  return post<ProxmoxTestResponse>('/api/integrations/proxmox/test', undefined, {
    maxRetries: 0,
    showRetryNotifications: false,
  });
}
