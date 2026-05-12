/**
 * AWS API functions
 *
 * Domain-specific API functions for AWS EC2 integration including
 * provisioning, lifecycle management, inventory, and resource discovery.
 */

import { get, post } from './api';

/**
 * AWS EC2 provisioning parameters
 */
export interface AWSProvisionParams {
  imageId: string;
  instanceType?: string;
  keyName?: string;
  securityGroupIds?: string[];
  subnetId?: string;
  region?: string;
  name?: string;
}

/**
 * AWS EC2 lifecycle action parameters
 */
export interface AWSLifecycleParams {
  instanceId: string;
  action: 'start' | 'stop' | 'reboot' | 'terminate';
  region?: string;
}

/**
 * AWS instance type info
 */
export interface AWSInstanceTypeInfo {
  instanceType: string;
  vCpus: number;
  memoryMiB: number;
  architecture: string;
  currentGeneration: boolean;
}

/**
 * AWS AMI info
 */
export interface AWSAMIInfo {
  imageId: string;
  name: string;
  description?: string;
  architecture: string;
  ownerId: string;
  state: string;
  platform?: string;
  creationDate?: string;
}

/**
 * AWS VPC info
 */
export interface AWSVPCInfo {
  vpcId: string;
  cidrBlock: string;
  state: string;
  isDefault: boolean;
  tags: Record<string, string>;
}

/**
 * AWS Subnet info
 */
export interface AWSSubnetInfo {
  subnetId: string;
  vpcId: string;
  cidrBlock: string;
  availabilityZone: string;
  availableIpAddressCount: number;
  tags: Record<string, string>;
}

/**
 * AWS Security Group info
 */
export interface AWSSecurityGroupInfo {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  tags: Record<string, string>;
}

/**
 * AWS Key Pair info
 */
export interface AWSKeyPairInfo {
  keyName: string;
  keyPairId: string;
  keyFingerprint: string;
  keyType?: string;
}

/**
 * AWS configuration for setup guide
 */
export interface AWSIntegrationConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

/**
 * Get AWS EC2 inventory
 * Validates Requirements: 9.1
 */
export async function getAWSInventory(): Promise<{ inventory: unknown[] }> {
  return get<{ inventory: unknown[] }>('/api/integrations/aws/inventory', {
    maxRetries: 2,
    retryDelay: 1000,
  });
}

/**
 * Provision a new AWS EC2 instance
 * Validates Requirements: 10.1
 */
export async function provisionAWSInstance(params: AWSProvisionParams): Promise<{ result: { status: string; output?: unknown; error?: string } }> {
  return post<{ result: { status: string; output?: unknown; error?: string } }>('/api/integrations/aws/provision', params, {
    maxRetries: 0,
    showRetryNotifications: false,
  });
}

/**
 * Execute AWS EC2 lifecycle action
 * Validates Requirements: 11.1
 */
export async function executeAWSLifecycle(params: AWSLifecycleParams): Promise<{ result: { status: string; output?: unknown; error?: string } }> {
  return post<{ result: { status: string; output?: unknown; error?: string } }>('/api/integrations/aws/lifecycle', params, {
    maxRetries: 0,
    showRetryNotifications: false,
  });
}

/**
 * Get available AWS regions
 * Validates Requirements: 13.1
 */
export async function getAWSRegions(): Promise<string[]> {
  const response = await get<{ regions: string[] }>('/api/integrations/aws/regions', {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.regions;
}

/**
 * Get available EC2 instance types for a region
 * Validates Requirements: 13.2
 */
export async function getAWSInstanceTypes(region?: string): Promise<AWSInstanceTypeInfo[]> {
  const params = region ? `?region=${encodeURIComponent(region)}` : '';
  const response = await get<{ instanceTypes: AWSInstanceTypeInfo[] }>(`/api/integrations/aws/instance-types${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.instanceTypes;
}

/**
 * Get available AMIs for a region
 * Validates Requirements: 13.3
 */
export async function getAWSAMIs(region: string, search?: string): Promise<AWSAMIInfo[]> {
  let url = `/api/integrations/aws/amis?region=${encodeURIComponent(region)}`;
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  const response = await get<{ amis: AWSAMIInfo[] }>(url, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.amis;
}

/**
 * Get available VPCs for a region
 * Validates Requirements: 13.4
 */
export async function getAWSVPCs(region: string): Promise<AWSVPCInfo[]> {
  const response = await get<{ vpcs: AWSVPCInfo[] }>(`/api/integrations/aws/vpcs?region=${encodeURIComponent(region)}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.vpcs;
}

/**
 * Get available subnets for a region and optional VPC
 * Validates Requirements: 13.5
 */
export async function getAWSSubnets(region: string, vpcId?: string): Promise<AWSSubnetInfo[]> {
  let params = `?region=${encodeURIComponent(region)}`;
  if (vpcId) params += `&vpcId=${encodeURIComponent(vpcId)}`;
  const response = await get<{ subnets: AWSSubnetInfo[] }>(`/api/integrations/aws/subnets${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.subnets;
}

/**
 * Get available security groups for a region and optional VPC
 * Validates Requirements: 13.6
 */
export async function getAWSSecurityGroups(region: string, vpcId?: string): Promise<AWSSecurityGroupInfo[]> {
  let params = `?region=${encodeURIComponent(region)}`;
  if (vpcId) params += `&vpcId=${encodeURIComponent(vpcId)}`;
  const response = await get<{ securityGroups: AWSSecurityGroupInfo[] }>(`/api/integrations/aws/security-groups${params}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.securityGroups;
}

/**
 * Get available key pairs for a region
 * Validates Requirements: 13.7
 */
export async function getAWSKeyPairs(region: string): Promise<AWSKeyPairInfo[]> {
  const response = await get<{ keyPairs: AWSKeyPairInfo[] }>(`/api/integrations/aws/key-pairs?region=${encodeURIComponent(region)}`, {
    maxRetries: 2,
    retryDelay: 1000,
  });
  return response.keyPairs;
}

/**
 * Test AWS connection using .env-sourced configuration
 * Validates Requirements: 12.5, 12.6, 12.7
 */
export async function testAWSConnection(): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/api/integrations/aws/test', undefined, {
    maxRetries: 0,
    showRetryNotifications: false,
  });
}
