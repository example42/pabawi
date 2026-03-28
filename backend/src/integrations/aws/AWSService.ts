/**
 * AWS Service
 *
 * Wraps the AWS SDK EC2 client to provide inventory discovery,
 * grouping, facts retrieval, and resource discovery for EC2 instances.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 13.1-13.7
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  DescribeInstanceTypesCommand,
  DescribeImagesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  DescribeKeyPairsCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
  type Instance,
  type Tag,
  type Filter,
  type RunInstancesCommandInput,
} from "@aws-sdk/client-ec2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { AWSAuthenticationError } from "./types";
import type { Node, Facts } from "../bolt/types";
import type { NodeGroup } from "../types";
import type { LoggerService } from "../../services/LoggerService";
import type {
  AWSConfig,
  InstanceTypeInfo,
  AMIInfo,
  AMIFilter,
  VPCInfo,
  SubnetInfo,
  SecurityGroupInfo,
  KeyPairInfo,
} from "./types";

/**
 * Extract a tag value from an array of AWS tags
 */
function getTagValue(tags: Tag[] | undefined, key: string): string | undefined {
  return tags?.find((t) => t.Key === key)?.Value;
}

/**
 * Convert AWS tags array to a plain Record
 */
function tagsToRecord(tags: Tag[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (tags) {
    for (const tag of tags) {
      if (tag.Key && tag.Value !== undefined) {
        result[tag.Key] = tag.Value;
      }
    }
  }
  return result;
}

/**
 * AWSService - Wraps AWS SDK EC2 client for inventory and resource discovery
 */
export class AWSService {
  private client: EC2Client;
  private readonly clientConfig: Record<string, unknown>;
  private readonly region: string;
  private readonly regions: string[];
  private readonly logger: LoggerService;

  constructor(config: AWSConfig, logger: LoggerService) {
    this.logger = logger;
    this.region = config.region || "us-east-1";
    this.regions = config.regions && config.regions.length > 0
      ? config.regions
      : [this.region];

    const clientConfig: Record<string, unknown> = {
      region: this.region,
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
      };
    }

    this.clientConfig = clientConfig;
    this.client = new EC2Client(clientConfig);

    this.logger.debug("AWSService created", {
      component: "AWSService",
      operation: "constructor",
      metadata: { region: this.region, regions: this.regions },
    });
  }

  /**
   * Create an EC2Client for a specific region (used by resource discovery methods)
   */
  private getClientForRegion(region: string): EC2Client {
    if (region === this.region) {
      return this.client;
    }
    // Build a new client with the same credentials but different region
    return new EC2Client({
      ...this.clientConfig,
      region,
    });
  }

  // ========================================
  // Credential Validation
  // ========================================

  /**
   * Validate AWS credentials using STS GetCallerIdentity
   *
   * Validates: Requirements 12.1, 12.2
   *
   * @returns Account details (account, arn, userId) on success
   * @throws AWSAuthenticationError on invalid credentials
   */
  async validateCredentials(): Promise<{ account: string; arn: string; userId: string }> {
    this.logger.debug("Validating AWS credentials via STS", {
      component: "AWSService",
      operation: "validateCredentials",
    });

    const stsClient = new STSClient(this.clientConfig);

    try {
      const response = await stsClient.send(new GetCallerIdentityCommand({}));

      const result = {
        account: response.Account || "",
        arn: response.Arn || "",
        userId: response.UserId || "",
      };

      this.logger.info("AWS credentials validated", {
        component: "AWSService",
        operation: "validateCredentials",
        metadata: { account: result.account },
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("AWS credential validation failed", {
        component: "AWSService",
        operation: "validateCredentials",
        metadata: { error: message },
      });
      throw new AWSAuthenticationError(message);
    } finally {
      stsClient.destroy();
    }
  }

  // ========================================
  // Inventory & Grouping
  // ========================================

  /**
   * List all EC2 instances as Node objects
   *
   * Validates: Requirements 9.1, 9.4
   */
  async getInventory(): Promise<Node[]> {
    this.logger.debug("Fetching EC2 inventory", {
      component: "AWSService",
      operation: "getInventory",
      metadata: { regions: this.regions },
    });

    // Query all configured regions in parallel
    const regionResults = await Promise.all(
      this.regions.map(async (region) => {
        try {
          const instances = await this.describeAllInstancesInRegion(region);
          this.logger.debug(`Region ${region} returned ${String(instances.length)} instances`, {
            component: "AWSService",
            operation: "getInventory",
            metadata: { region, count: instances.length },
          });
          return instances.map((instance) => this.transformInstanceToNode(instance, region));
        } catch (error) {
          this.logger.error(`Failed to fetch inventory from region ${region}`, {
            component: "AWSService",
            operation: "getInventory",
            metadata: { region },
          }, error instanceof Error ? error : undefined);
          return [];
        }
      })
    );

    const nodes = regionResults.flat();

    this.logger.info("EC2 inventory fetched", {
      component: "AWSService",
      operation: "getInventory",
      metadata: { count: nodes.length, regions: this.regions },
    });

    return nodes;
  }

  /**
   * Group instances by region, VPC, and tags
   *
   * Validates: Requirement 9.2
   */
  async getGroups(): Promise<NodeGroup[]> {
    this.logger.debug("Building EC2 groups", {
      component: "AWSService",
      operation: "getGroups",
    });

    const inventory = await this.getInventory();
    const groups: NodeGroup[] = [];

    groups.push(...this.groupByRegion(inventory));
    groups.push(...this.groupByVPC(inventory));
    groups.push(...this.groupByTags(inventory));

    this.logger.info("EC2 groups built", {
      component: "AWSService",
      operation: "getGroups",
      metadata: { groupCount: groups.length },
    });

    return groups;
  }

  /**
   * Get detailed facts for a specific EC2 instance
   *
   * Validates: Requirement 9.3
   *
   * @param nodeId - Node URI (e.g., "aws:us-east-1:i-abc123")
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.logger.debug("Fetching node facts", {
      component: "AWSService",
      operation: "getNodeFacts",
      metadata: { nodeId },
    });

    const { region, instanceId } = this.parseNodeId(nodeId);
    const client = this.getClientForRegion(region);

    const response = await client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    const instance = response.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    return this.transformToFacts(nodeId, instance);
  }

  // ========================================
  // Resource Discovery
  // ========================================

  /**
   * Get available AWS regions
   *
   * Validates: Requirement 13.1
   */
  async getRegions(): Promise<string[]> {
    this.logger.debug("Fetching AWS regions", {
      component: "AWSService",
      operation: "getRegions",
    });

    const response = await this.client.send(new DescribeRegionsCommand({}));
    const regions = (response.Regions || [])
      .map((r) => r.RegionName)
      .filter((name): name is string => !!name)
      .sort();

    this.logger.info("AWS regions fetched", {
      component: "AWSService",
      operation: "getRegions",
      metadata: { count: regions.length },
    });

    return regions;
  }

  /**
   * Get available EC2 instance types
   *
   * Validates: Requirement 13.2
   */
  async getInstanceTypes(region?: string): Promise<InstanceTypeInfo[]> {
    const client = region ? this.getClientForRegion(region) : this.client;

    this.logger.debug("Fetching instance types", {
      component: "AWSService",
      operation: "getInstanceTypes",
      metadata: { region: region || this.region },
    });

    const results: InstanceTypeInfo[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new DescribeInstanceTypesCommand({
          NextToken: nextToken,
          MaxResults: 100,
        })
      );

      for (const it of response.InstanceTypes || []) {
        results.push({
          instanceType: it.InstanceType || "unknown",
          vCpus: it.VCpuInfo?.DefaultVCpus || 0,
          memoryMiB: it.MemoryInfo?.SizeInMiB || 0,
          architecture: it.ProcessorInfo?.SupportedArchitectures?.[0] || "unknown",
          currentGeneration: it.CurrentGeneration ?? false,
        });
      }

      nextToken = response.NextToken;
    } while (nextToken);

    this.logger.info("Instance types fetched", {
      component: "AWSService",
      operation: "getInstanceTypes",
      metadata: { count: results.length },
    });

    return results;
  }

  /**
   * Get available AMIs for a region
   *
   * Validates: Requirement 13.3
   */
  async getAMIs(region: string, filters?: AMIFilter[]): Promise<AMIInfo[]> {
    const client = this.getClientForRegion(region);

    this.logger.debug("Fetching AMIs", {
      component: "AWSService",
      operation: "getAMIs",
      metadata: { region },
    });

    const ec2Filters: Filter[] = (filters || []).map((f) => ({
      Name: f.name,
      Values: f.values,
    }));

    // Default: only show available images owned by self or Amazon
    if (ec2Filters.length === 0) {
      ec2Filters.push({ Name: "state", Values: ["available"] });
    }

    const response = await client.send(
      new DescribeImagesCommand({
        Filters: ec2Filters,
        Owners: ["self", "amazon"],
        MaxResults: 200,
      })
    );

    const amis: AMIInfo[] = (response.Images || []).map((img) => ({
      imageId: img.ImageId || "",
      name: img.Name || "",
      description: img.Description,
      architecture: img.Architecture || "unknown",
      ownerId: img.OwnerId || "",
      state: img.State || "unknown",
      platform: img.PlatformDetails,
      creationDate: img.CreationDate,
    }));

    this.logger.info("AMIs fetched", {
      component: "AWSService",
      operation: "getAMIs",
      metadata: { region, count: amis.length },
    });

    return amis;
  }

  /**
   * Get available VPCs for a region
   *
   * Validates: Requirement 13.4
   */
  async getVPCs(region: string): Promise<VPCInfo[]> {
    const client = this.getClientForRegion(region);

    this.logger.debug("Fetching VPCs", {
      component: "AWSService",
      operation: "getVPCs",
      metadata: { region },
    });

    const response = await client.send(new DescribeVpcsCommand({}));

    const vpcs: VPCInfo[] = (response.Vpcs || []).map((vpc) => ({
      vpcId: vpc.VpcId || "",
      cidrBlock: vpc.CidrBlock || "",
      state: vpc.State || "unknown",
      isDefault: vpc.IsDefault ?? false,
      tags: tagsToRecord(vpc.Tags),
    }));

    this.logger.info("VPCs fetched", {
      component: "AWSService",
      operation: "getVPCs",
      metadata: { region, count: vpcs.length },
    });

    return vpcs;
  }

  /**
   * Get available subnets for a region
   *
   * Validates: Requirement 13.5
   */
  async getSubnets(region: string, vpcId?: string): Promise<SubnetInfo[]> {
    const client = this.getClientForRegion(region);

    this.logger.debug("Fetching subnets", {
      component: "AWSService",
      operation: "getSubnets",
      metadata: { region, vpcId },
    });

    const filters: Filter[] = [];
    if (vpcId) {
      filters.push({ Name: "vpc-id", Values: [vpcId] });
    }

    const response = await client.send(
      new DescribeSubnetsCommand({
        Filters: filters.length > 0 ? filters : undefined,
      })
    );

    const subnets: SubnetInfo[] = (response.Subnets || []).map((s) => ({
      subnetId: s.SubnetId || "",
      vpcId: s.VpcId || "",
      cidrBlock: s.CidrBlock || "",
      availabilityZone: s.AvailabilityZone || "",
      availableIpAddressCount: s.AvailableIpAddressCount || 0,
      tags: tagsToRecord(s.Tags),
    }));

    this.logger.info("Subnets fetched", {
      component: "AWSService",
      operation: "getSubnets",
      metadata: { region, count: subnets.length },
    });

    return subnets;
  }

  /**
   * Get available security groups for a region
   *
   * Validates: Requirement 13.6
   */
  async getSecurityGroups(region: string, vpcId?: string): Promise<SecurityGroupInfo[]> {
    const client = this.getClientForRegion(region);

    this.logger.debug("Fetching security groups", {
      component: "AWSService",
      operation: "getSecurityGroups",
      metadata: { region, vpcId },
    });

    const filters: Filter[] = [];
    if (vpcId) {
      filters.push({ Name: "vpc-id", Values: [vpcId] });
    }

    const response = await client.send(
      new DescribeSecurityGroupsCommand({
        Filters: filters.length > 0 ? filters : undefined,
      })
    );

    const groups: SecurityGroupInfo[] = (response.SecurityGroups || []).map((sg) => ({
      groupId: sg.GroupId || "",
      groupName: sg.GroupName || "",
      description: sg.Description || "",
      vpcId: sg.VpcId || "",
      tags: tagsToRecord(sg.Tags),
    }));

    this.logger.info("Security groups fetched", {
      component: "AWSService",
      operation: "getSecurityGroups",
      metadata: { region, count: groups.length },
    });

    return groups;
  }

  /**
   * Get available key pairs for a region
   *
   * Validates: Requirement 13.7
   */
  async getKeyPairs(region: string): Promise<KeyPairInfo[]> {
    const client = this.getClientForRegion(region);

    this.logger.debug("Fetching key pairs", {
      component: "AWSService",
      operation: "getKeyPairs",
      metadata: { region },
    });

    const response = await client.send(new DescribeKeyPairsCommand({}));

    const keyPairs: KeyPairInfo[] = (response.KeyPairs || []).map((kp) => ({
      keyName: kp.KeyName || "",
      keyPairId: kp.KeyPairId || "",
      keyFingerprint: kp.KeyFingerprint || "",
      keyType: kp.KeyType,
    }));

    this.logger.info("Key pairs fetched", {
      component: "AWSService",
      operation: "getKeyPairs",
      metadata: { region, count: keyPairs.length },
    });

    return keyPairs;
  }

  // ========================================
  // Provisioning & Lifecycle
  // ========================================

  /**
   * Provision a new EC2 instance via RunInstances.
   *
   * Validates: Requirement 10.1, 10.2, 10.3
   *
   * @returns The new instance ID
   */
  async provisionInstance(params: Record<string, unknown>): Promise<string> {
    this.logger.info("Provisioning EC2 instance", {
      component: "AWSService",
      operation: "provisionInstance",
      metadata: { imageId: params.imageId, instanceType: params.instanceType },
    });

    const region = (params.region as string) || this.region;
    const client = this.getClientForRegion(region);

    try {
      const response = await client.send(
        new RunInstancesCommand({
          ImageId: params.imageId as string,
          InstanceType: ((params.instanceType as string) || "t2.micro") as RunInstancesCommandInput["InstanceType"],
          MinCount: 1,
          MaxCount: 1,
          KeyName: params.keyName as string | undefined,
          SecurityGroupIds: params.securityGroupIds as string[] | undefined,
          SubnetId: params.subnetId as string | undefined,
          TagSpecifications: params.name
            ? [
                {
                  ResourceType: "instance",
                  Tags: [{ Key: "Name", Value: params.name as string }],
                },
              ]
            : undefined,
        })
      );

      const instanceId = response.Instances?.[0]?.InstanceId;
      if (!instanceId) {
        throw new Error("RunInstances returned no instance ID");
      }

      this.logger.info("EC2 instance provisioned", {
        component: "AWSService",
        operation: "provisionInstance",
        metadata: { instanceId, region },
      });

      return instanceId;
    } catch (error) {
      this.throwIfAuthError(error);
      throw error;
    }
  }

  /**
   * Start an EC2 instance.
   * Validates: Requirement 11.1
   */
  async startInstance(instanceId: string, region?: string): Promise<void> {
    const client = this.getClientForRegion(region || this.region);
    try {
      await client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      this.logger.info("EC2 instance started", {
        component: "AWSService",
        operation: "startInstance",
        metadata: { instanceId },
      });
    } catch (error) {
      this.throwIfAuthError(error);
      throw error;
    }
  }

  /**
   * Stop an EC2 instance.
   * Validates: Requirement 11.1
   */
  async stopInstance(instanceId: string, region?: string): Promise<void> {
    const client = this.getClientForRegion(region || this.region);
    try {
      await client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
      this.logger.info("EC2 instance stopped", {
        component: "AWSService",
        operation: "stopInstance",
        metadata: { instanceId },
      });
    } catch (error) {
      this.throwIfAuthError(error);
      throw error;
    }
  }

  /**
   * Reboot an EC2 instance.
   * Validates: Requirement 11.1
   */
  async rebootInstance(instanceId: string, region?: string): Promise<void> {
    const client = this.getClientForRegion(region || this.region);
    try {
      await client.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
      this.logger.info("EC2 instance rebooted", {
        component: "AWSService",
        operation: "rebootInstance",
        metadata: { instanceId },
      });
    } catch (error) {
      this.throwIfAuthError(error);
      throw error;
    }
  }

  /**
   * Terminate an EC2 instance.
   * Validates: Requirement 11.1
   */
  async terminateInstance(instanceId: string, region?: string): Promise<void> {
    const client = this.getClientForRegion(region || this.region);
    try {
      await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
      this.logger.info("EC2 instance terminated", {
        component: "AWSService",
        operation: "terminateInstance",
        metadata: { instanceId },
      });
    } catch (error) {
      this.throwIfAuthError(error);
      throw error;
    }
  }

  /**
   * Check if an AWS SDK error is an authentication/credentials error
   * and throw AWSAuthenticationError if so.
   */
  private throwIfAuthError(error: unknown): void {
    if (error instanceof Error) {
      const name = (error as Error & { name?: string }).name ?? "";
      const code = (error as Error & { Code?: string }).Code ?? "";
      const authErrors = [
        "AuthFailure",
        "UnauthorizedAccess",
        "InvalidClientTokenId",
        "SignatureDoesNotMatch",
        "ExpiredToken",
        "ExpiredTokenException",
        "AccessDeniedException",
        "CredentialsError",
      ];
      if (authErrors.includes(name) || authErrors.includes(code)) {
        throw new AWSAuthenticationError(error.message);
      }
    }
  }

  // ========================================
  // Private Helpers
  // ========================================

  /**
   * Describe all EC2 instances in a specific region using pagination
   */
  private async describeAllInstancesInRegion(region: string): Promise<Instance[]> {
    const client = this.getClientForRegion(region);
    const instances: Instance[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new DescribeInstancesCommand({ NextToken: nextToken })
      );

      for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) {
          instances.push(instance);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return instances;
  }

  /**
   * Transform an EC2 Instance into a Node object
   *
   * Validates: Requirement 9.4 - includes state, type, region, VPC, tags
   */
  private transformInstanceToNode(instance: Instance, queryRegion?: string): Node {
    const instanceId = instance.InstanceId || "unknown";
    const nameTag = getTagValue(instance.Tags, "Name");
    const tags = tagsToRecord(instance.Tags);
    const state = instance.State?.Name || "unknown";
    const instanceType = instance.InstanceType || "unknown";
    const vpcId = instance.VpcId || "";
    const az = instance.Placement?.AvailabilityZone || queryRegion || this.region;
    const instanceRegion = az.replace(/[a-z]$/, "");

    const nodeId = `aws:${instanceRegion}:${instanceId}`;

    const node: Node = {
      id: nodeId,
      name: nameTag || instanceId,
      uri: `aws:${instanceRegion}:${instanceId}`,
      transport: "ssh" as const,
      config: {
        instanceId,
        state,
        instanceType,
        region: instanceRegion,
        vpcId,
        tags,
        availabilityZone: az,
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
      },
      source: "aws",
    };

    // Attach status for UI display (same pattern as ProxmoxService)
    (node as Node & { status?: string }).status = state;

    return node;
  }

  /**
   * Transform an EC2 Instance into a Facts object
   */
  private transformToFacts(nodeId: string, instance: Instance): Facts {
    const tags = tagsToRecord(instance.Tags);
    const state = instance.State?.Name || "unknown";
    const instanceType = instance.InstanceType || "unknown";
    const az = instance.Placement?.AvailabilityZone || this.region;
    const instanceRegion = az.replace(/[a-z]$/, "");

    const nameTag = getTagValue(instance.Tags, "Name");

    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: "aws",
      facts: {
        os: {
          family: instance.Platform === "Windows" ? "windows" : "linux",
          name: instance.PlatformDetails || "unknown",
          release: { full: "unknown", major: "unknown" },
        },
        processors: {
          count: instance.CpuOptions?.CoreCount != null && instance.CpuOptions?.ThreadsPerCore != null
            ? instance.CpuOptions.CoreCount * instance.CpuOptions.ThreadsPerCore
            : 0,
          models: [],
        },
        memory: {
          system: { total: "unknown", available: "unknown" },
        },
        networking: {
          hostname: instance.PrivateDnsName || "unknown",
          interfaces: {
            ...(instance.PublicIpAddress
              ? { public: { ip: instance.PublicIpAddress, dns: instance.PublicDnsName } }
              : {}),
            ...(instance.PrivateIpAddress
              ? { private: { ip: instance.PrivateIpAddress, dns: instance.PrivateDnsName } }
              : {}),
          },
        },
        categories: {
          system: {
            name: nameTag,
            instanceId: instance.InstanceId,
            state,
            instanceType,
            region: instanceRegion,
            availabilityZone: az,
            launchTime: instance.LaunchTime?.toISOString(),
            architecture: instance.Architecture,
            platform: instance.Platform || "linux",
            platformDetails: instance.PlatformDetails,
            virtualizationType: instance.VirtualizationType,
            hypervisor: instance.Hypervisor,
            monitoring: instance.Monitoring?.State,
            iamInstanceProfile: instance.IamInstanceProfile?.Arn,
          },
          network: {
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            publicIp: instance.PublicIpAddress,
            privateIp: instance.PrivateIpAddress,
            publicDns: instance.PublicDnsName,
            privateDns: instance.PrivateDnsName,
            sourceDestCheck: instance.SourceDestCheck,
            networkInterfaces: (instance.NetworkInterfaces || []).map((nic) => ({
              networkInterfaceId: nic.NetworkInterfaceId,
              subnetId: nic.SubnetId,
              vpcId: nic.VpcId,
              privateIp: nic.PrivateIpAddress,
              privateDns: nic.PrivateDnsName,
              publicIp: nic.Association?.PublicIp,
              publicDns: nic.Association?.PublicDnsName,
              macAddress: nic.MacAddress,
              status: nic.Status,
              description: nic.Description,
            })),
          },
          hardware: {
            instanceType,
            architecture: instance.Architecture,
            rootDeviceType: instance.RootDeviceType,
            rootDeviceName: instance.RootDeviceName,
            ebsOptimized: instance.EbsOptimized,
            cpuOptions: instance.CpuOptions
              ? {
                  coreCount: instance.CpuOptions.CoreCount,
                  threadsPerCore: instance.CpuOptions.ThreadsPerCore,
                }
              : undefined,
            blockDevices: (instance.BlockDeviceMappings || []).map((bdm) => ({
              deviceName: bdm.DeviceName,
              volumeId: bdm.Ebs?.VolumeId,
              status: bdm.Ebs?.Status,
              attachTime: bdm.Ebs?.AttachTime?.toISOString(),
              deleteOnTermination: bdm.Ebs?.DeleteOnTermination,
            })),
          },
          custom: {
            tags,
            keyName: instance.KeyName,
            imageId: instance.ImageId,
            securityGroups: (instance.SecurityGroups || []).map((sg) => ({
              groupId: sg.GroupId,
              groupName: sg.GroupName,
            })),
            spotInstanceRequestId: instance.SpotInstanceRequestId,
            capacityReservationId: instance.CapacityReservationId,
            metadataOptions: instance.MetadataOptions
              ? {
                  state: instance.MetadataOptions.State,
                  httpTokens: instance.MetadataOptions.HttpTokens,
                  httpEndpoint: instance.MetadataOptions.HttpEndpoint,
                }
              : undefined,
          },
        },
      },
    };
  }

  /**
   * Parse a node ID (e.g., "aws:us-east-1:i-abc123") into region and instanceId
   */
  private parseNodeId(nodeId: string): { region: string; instanceId: string } {
    const parts = nodeId.split(":");
    if (parts.length < 3 || parts[0] !== "aws") {
      throw new Error(
        `Invalid AWS node ID format: ${nodeId}. Expected "aws:{region}:{instanceId}"`
      );
    }
    return { region: parts[1], instanceId: parts.slice(2).join(":") };
  }

  /**
   * Group nodes by region
   */
  private groupByRegion(nodes: Node[]): NodeGroup[] {
    const regionMap = new Map<string, string[]>();

    for (const node of nodes) {
      const region = (node.config.region as string) || this.region;
      if (!regionMap.has(region)) {
        regionMap.set(region, []);
      }
      regionMap.get(region)!.push(node.name);
    }

    return Array.from(regionMap.entries()).map(([region, nodeIds]) => ({
      id: `aws:region:${region}`,
      name: `AWS ${region}`,
      source: "aws",
      sources: ["aws"],
      linked: false,
      nodes: nodeIds,
      metadata: { description: `EC2 instances in ${region}` },
    }));
  }

  /**
   * Group nodes by VPC
   */
  private groupByVPC(nodes: Node[]): NodeGroup[] {
    const vpcMap = new Map<string, string[]>();

    for (const node of nodes) {
      const vpcId = (node.config.vpcId as string) || "no-vpc";
      if (!vpcMap.has(vpcId)) {
        vpcMap.set(vpcId, []);
      }
      vpcMap.get(vpcId)!.push(node.name);
    }

    return Array.from(vpcMap.entries()).map(([vpcId, nodeIds]) => ({
      id: `aws:vpc:${vpcId}`,
      name: vpcId === "no-vpc" ? "No VPC" : `VPC ${vpcId}`,
      source: "aws",
      sources: ["aws"],
      linked: false,
      nodes: nodeIds,
      metadata: { description: `EC2 instances in VPC ${vpcId}` },
    }));
  }

  /**
   * Group nodes by tag keys (e.g., "Environment", "Project")
   */
  private groupByTags(nodes: Node[]): NodeGroup[] {
    // Collect groups for well-known tag keys
    const tagKeys = ["Environment", "Project", "Team", "Application", "Stack"];
    const tagGroups = new Map<string, Map<string, string[]>>();

    for (const node of nodes) {
      const tags = (node.config.tags as Record<string, string>) || {};
      for (const key of tagKeys) {
        const value = tags[key];
        if (value) {
          if (!tagGroups.has(key)) {
            tagGroups.set(key, new Map());
          }
          const valueMap = tagGroups.get(key)!;
          if (!valueMap.has(value)) {
            valueMap.set(value, []);
          }
          valueMap.get(value)!.push(node.name);
        }
      }
    }

    const groups: NodeGroup[] = [];
    for (const [tagKey, valueMap] of tagGroups) {
      for (const [tagValue, nodeIds] of valueMap) {
        groups.push({
          id: `aws:tag:${tagKey}:${tagValue}`,
          name: `${tagKey}: ${tagValue}`,
          source: "aws",
          sources: ["aws"],
          linked: false,
          nodes: nodeIds,
          metadata: {
            description: `EC2 instances with tag ${tagKey}=${tagValue}`,
          },
        });
      }
    }

    return groups;
  }
}
