/**
 * Azure Integration Types
 *
 * Type definitions for the Azure VM integration plugin.
 */

import type { ProvisioningCapability } from "../types";

export type { ProvisioningCapability };

/**
 * Azure configuration parsed from environment variables.
 */
export interface AzureConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  subscriptionId: string;
  resourceGroups?: string[];
}

/**
 * Azure VM instance information.
 */
export interface AzureVMInfo {
  vmName: string;
  vmId: string;
  powerState: string;
  vmSize: string;
  resourceGroup: string;
  location: string;
  tags: Record<string, string>;
  provisioningState: string;
  osType: string;
}

/**
 * Azure location (region) information.
 */
export interface AzureLocationInfo {
  name: string;
  displayName: string;
}

/**
 * Azure VM size specification.
 */
export interface AzureVMSizeInfo {
  name: string;
  vCpus: number;
  memoryMB: number;
  osDiskSizeGB: number;
}

/**
 * Azure marketplace image information.
 */
export interface AzureImageInfo {
  publisher: string;
  offer: string;
  sku: string;
  version: string;
}

/**
 * Azure resource group information.
 */
export interface AzureResourceGroupInfo {
  name: string;
  location: string;
  tags: Record<string, string>;
}

/**
 * Azure authentication error.
 *
 * Thrown when Azure credentials are invalid, expired, or lack required RBAC permissions.
 */
export class AzureAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzureAuthenticationError";
  }
}
