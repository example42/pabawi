/**
 * AWS Integration Types
 *
 * Type definitions for the AWS EC2 integration plugin.
 */

import type { ProvisioningCapability } from "../types";

export type { ProvisioningCapability };

/**
 * AWS configuration
 */
export interface AWSConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  regions?: string[];
  sessionToken?: string;
  profile?: string;
  endpoint?: string;
}

/**
 * EC2 instance type information
 */
export interface InstanceTypeInfo {
  instanceType: string;
  vCpus: number;
  memoryMiB: number;
  architecture: string;
  currentGeneration: boolean;
}

/**
 * AMI (Amazon Machine Image) information
 */
export interface AMIInfo {
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
 * AMI filter for querying AMIs
 */
export interface AMIFilter {
  name: string;
  values: string[];
}

/**
 * VPC information
 */
export interface VPCInfo {
  vpcId: string;
  cidrBlock: string;
  state: string;
  isDefault: boolean;
  tags: Record<string, string>;
}

/**
 * Subnet information
 */
export interface SubnetInfo {
  subnetId: string;
  vpcId: string;
  cidrBlock: string;
  availabilityZone: string;
  availableIpAddressCount: number;
  tags: Record<string, string>;
}

/**
 * Security group information
 */
export interface SecurityGroupInfo {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
  tags: Record<string, string>;
}

/**
 * Key pair information
 */
export interface KeyPairInfo {
  keyName: string;
  keyPairId: string;
  keyFingerprint: string;
  keyType?: string;
}

/**
 * AWS authentication error
 *
 * Thrown when AWS credentials are invalid, expired, or lack required IAM permissions.
 */
export class AWSAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AWSAuthenticationError";
  }
}
