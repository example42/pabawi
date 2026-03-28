/**
 * AWS Integration Plugin
 *
 * Plugin class that integrates AWS EC2 into Pabawi.
 * Implements both InformationSourcePlugin and ExecutionToolPlugin interfaces.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

import { BasePlugin } from "../BasePlugin";
import type {
  HealthStatus,
  InformationSourcePlugin,
  ExecutionToolPlugin,
  NodeGroup,
  Capability,
  Action,
} from "../types";
import type { Node, Facts, ExecutionResult } from "../bolt/types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import type { JournalService } from "../../services/journal/JournalService";
import type { CreateJournalEntry } from "../../services/journal/types";
import type {
  AWSConfig,
  InstanceTypeInfo,
  AMIInfo,
  AMIFilter,
  VPCInfo,
  SubnetInfo,
  SecurityGroupInfo,
  KeyPairInfo,
  ProvisioningCapability,
} from "./types";
import { AWSService } from "./AWSService";
import { AWSAuthenticationError } from "./types";

/**
 * AWSPlugin - Plugin for AWS EC2
 *
 * Provides:
 * - Inventory discovery of EC2 instances
 * - Group management (by region, VPC, tags)
 * - Facts retrieval for instances
 * - Lifecycle actions (start, stop, reboot, terminate)
 * - Provisioning capabilities (launch/terminate instances)
 * - Resource discovery (regions, instance types, AMIs, VPCs, subnets, security groups, key pairs)
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 9.1-9.4, 10.1-10.4, 11.1-11.4, 12.1-12.3, 13.1-13.7
 */
export class AWSPlugin
  extends BasePlugin
  implements InformationSourcePlugin, ExecutionToolPlugin
{
  readonly type = "both" as const;
  private service?: AWSService;
  private journalService?: JournalService;

  /**
   * Create a new AWSPlugin instance
   *
   * @param logger - Logger service instance (optional)
   * @param performanceMonitor - Performance monitor service instance (optional)
   * @param journalService - Journal service instance for recording events (optional)
   */
  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
    journalService?: JournalService
  ) {
    super("aws", "both", logger, performanceMonitor);
    this.journalService = journalService;

    this.logger.debug("AWSPlugin created", {
      component: "AWSPlugin",
      operation: "constructor",
    });
  }

  /**
   * Perform plugin-specific initialization
   *
   * Validates AWS configuration and initializes AWS SDK clients.
   *
   * @throws Error if configuration is invalid
   */
  protected async performInitialization(): Promise<void> {
    this.logger.info("Initializing AWS integration", {
      component: "AWSPlugin",
      operation: "performInitialization",
    });

    const config = this.config.config as unknown as AWSConfig;
    this.validateAWSConfig(config);

    // Create AWSService instance wrapping the EC2 client
    this.service = new AWSService(config, this.logger);

    this.logger.info("AWS integration initialized successfully", {
      component: "AWSPlugin",
      operation: "performInitialization",
    });
  }

  /**
   * Validate AWS configuration
   *
   * @param config - AWS configuration to validate
   * @throws Error if configuration is invalid
   */
  private validateAWSConfig(config: AWSConfig): void {
    this.logger.debug("Validating AWS configuration", {
      component: "AWSPlugin",
      operation: "validateAWSConfig",
    });

    // If explicit accessKeyId is provided, secretAccessKey must also be present
    if (config.accessKeyId && !config.secretAccessKey) {
      throw new Error(
        "AWS configuration with accessKeyId must also include secretAccessKey"
      );
    }

    // If no explicit credentials or profile, the AWS SDK will use the default
    // credential chain (env vars, ~/.aws/credentials, instance profile, etc.)
    if (!config.accessKeyId && !config.profile) {
      this.logger.info("No explicit AWS credentials or profile configured — using default credential chain", {
        component: "AWSPlugin",
        operation: "validateAWSConfig",
      });
    }

    this.logger.debug("AWS configuration validated successfully", {
      component: "AWSPlugin",
      operation: "validateAWSConfig",
    });
  }

  /**
   * Perform plugin-specific health check
   *
   * Uses STS GetCallerIdentity to validate credentials.
   *
   * Validates: Requirements 12.1, 12.2, 12.3
   *
   * @returns Health status (without lastCheck timestamp)
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    if (!this.service) {
      return {
        healthy: false,
        message: "AWS service not initialized",
      };
    }

    try {
      const identity = await this.service.validateCredentials();
      const config = this.config.config as unknown as AWSConfig;

      return {
        healthy: true,
        message: `AWS authenticated as ${identity.arn}`,
        details: {
          account: identity.account,
          arn: identity.arn,
          userId: identity.userId,
          region: config.region ?? 'us-east-1',
          regions: config.regions,
          hasAccessKey: !!config.accessKeyId,
          hasProfile: !!config.profile,
          hasEndpoint: !!config.endpoint,
        },
      };
    } catch (error) {
      if (error instanceof AWSAuthenticationError) {
        const config = this.config.config as unknown as AWSConfig;
        return {
          healthy: false,
          message: "AWS authentication failed",
          details: {
            region: config.region ?? 'us-east-1',
            regions: config.regions,
            hasAccessKey: !!config.accessKeyId,
            hasProfile: !!config.profile,
            hasEndpoint: !!config.endpoint,
          },
        };
      }

      const config = this.config.config as unknown as AWSConfig;
      return {
        healthy: false,
        message: error instanceof Error ? error.message : "AWS health check failed",
        details: {
          region: config.region ?? 'us-east-1',
          regions: config.regions,
          hasAccessKey: !!config.accessKeyId,
          hasProfile: !!config.profile,
          hasEndpoint: !!config.endpoint,
        },
      };
    }
  }

  // ========================================
  // InformationSourcePlugin Interface Methods
  // ========================================

  /**
   * Get inventory of all EC2 instances
   *
   * Validates: Requirements 9.1, 9.4
   *
   * @returns Array of Node objects representing EC2 instances
   */
  async getInventory(): Promise<Node[]> {
    this.ensureInitialized();
    return this.service!.getInventory();
  }

  /**
   * Get groups of EC2 instances (by region, VPC, tags)
   *
   * Validates: Requirement 9.2
   *
   * @returns Array of NodeGroup objects
   */
  async getGroups(): Promise<NodeGroup[]> {
    this.ensureInitialized();
    return this.service!.getGroups();
  }

  /**
   * Get detailed facts for a specific EC2 instance
   *
   * Validates: Requirement 9.3
   *
   * @param nodeId - Node identifier (e.g., aws:us-east-1:i-abc123)
   * @returns Facts object with instance metadata
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    // If nodeId is already in aws:region:instanceId format, use it directly.
    // Otherwise resolve by searching the inventory for a node with matching id or name.
    if (!nodeId.startsWith("aws:")) {
      const inventory = await this.service!.getInventory();
      const match = inventory.find((n) => n.id === nodeId || n.name === nodeId);
      if (!match) {
        throw new Error(`AWS node not found: ${nodeId}`);
      }
      return this.service!.getNodeFacts(match.id);
    }

    return this.service!.getNodeFacts(nodeId);
  }

  /**
   * Get arbitrary data for a node
   *
   * @param _nodeId - Node identifier
   * @param _dataType - Type of data to retrieve
   * @returns null (no additional data types supported yet)
   */
  async getNodeData(_nodeId: string, _dataType: string): Promise<unknown> {
    this.ensureInitialized();
    return null;
  }

  // ========================================
  // ExecutionToolPlugin Interface Methods
  // ========================================

  /**
   * Execute an action (provisioning or lifecycle) on EC2
   *
   * Routes based on action.action:
   * - "provision" / "create_instance" → provisionInstance
   * - "start" / "stop" / "reboot" / "terminate" → corresponding lifecycle method
   *
   * Records a journal entry on every completion (success or failure).
   * Throws AWSAuthenticationError on invalid/expired credentials.
   *
   * Validates: Requirements 10.1-10.4, 11.1-11.4
   *
   * @param action - Action to execute
   * @returns ExecutionResult with success/error details
   */
  async executeAction(action: Action): Promise<ExecutionResult> {
    this.ensureInitialized();

    const startedAt = new Date().toISOString();
    const target = Array.isArray(action.target) ? action.target[0] : action.target;

    try {
      let result: ExecutionResult;

      switch (action.action) {
        case "provision":
        case "create_instance":
          result = await this.handleProvision(action, startedAt, target);
          break;
        case "start":
        case "stop":
        case "reboot":
        case "terminate":
          result = await this.handleLifecycle(action, startedAt, target);
          break;
        default:
          throw new Error(`Unsupported AWS action: ${action.action}`);
      }

      await this.recordJournal(action, target, result);
      return result;
    } catch (error) {
      // Re-throw AWSAuthenticationError directly (Req 11.3)
      if (error instanceof AWSAuthenticationError) {
        await this.recordJournalFailure(action, target, startedAt, error.message);
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedResult = this.buildFailedResult(action, startedAt, target, errorMessage);
      await this.recordJournal(action, target, failedResult);
      return failedResult;
    }
  }

  /**
   * Handle provisioning actions (create_instance / provision)
   */
  private async handleProvision(
    action: Action,
    startedAt: string,
    target: string
  ): Promise<ExecutionResult> {
    const params = action.parameters ?? (action.metadata as Record<string, unknown>) ?? {};
    const instanceId = await this.service!.provisionInstance(params);
    const completedAt = new Date().toISOString();

    return {
      id: `aws-provision-${Date.now()}`,
      type: "task",
      targetNodes: [target],
      action: action.action,
      parameters: params,
      status: "success",
      startedAt,
      completedAt,
      results: [
        {
          nodeId: instanceId,
          status: "success",
          output: { stdout: `Instance ${instanceId} launched successfully` },
          duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        },
      ],
    };
  }

  /**
   * Handle lifecycle actions (start, stop, reboot, terminate)
   */
  private async handleLifecycle(
    action: Action,
    startedAt: string,
    target: string
  ): Promise<ExecutionResult> {
    const { instanceId, region } = this.parseTarget(target, action);

    switch (action.action) {
      case "start":
        await this.service!.startInstance(instanceId, region);
        break;
      case "stop":
        await this.service!.stopInstance(instanceId, region);
        break;
      case "reboot":
        await this.service!.rebootInstance(instanceId, region);
        break;
      case "terminate":
        await this.service!.terminateInstance(instanceId, region);
        break;
    }

    const completedAt = new Date().toISOString();

    return {
      id: `aws-${action.action}-${Date.now()}`,
      type: "command",
      targetNodes: [target],
      action: action.action,
      status: "success",
      startedAt,
      completedAt,
      results: [
        {
          nodeId: target,
          status: "success",
          output: { stdout: `Action ${action.action} completed on ${instanceId}` },
          duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        },
      ],
    };
  }

  /**
   * Parse target string to extract instanceId and optional region.
   * Supports "aws:region:instanceId" format or plain instance IDs.
   */
  private parseTarget(
    target: string,
    action: Action
  ): { instanceId: string; region?: string } {
    const parts = target.split(":");
    if (parts.length >= 3 && parts[0] === "aws") {
      return { region: parts[1], instanceId: parts.slice(2).join(":") };
    }
    // Fall back to metadata or treat target as raw instance ID
    const region = action.metadata?.region as string | undefined;
    return { instanceId: target, region };
  }

  /**
   * Build a failed ExecutionResult
   */
  private buildFailedResult(
    action: Action,
    startedAt: string,
    target: string,
    errorMessage: string
  ): ExecutionResult {
    return {
      id: `aws-error-${Date.now()}`,
      type: "command",
      targetNodes: [target],
      action: action.action,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      results: [
        {
          nodeId: target,
          status: "failed",
          error: errorMessage,
          duration: 0,
        },
      ],
      error: errorMessage,
    };
  }

  /**
   * Record a journal entry for a completed action (success or failure).
   * Validates: Requirements 10.4, 11.4
   */
  private async recordJournal(
    action: Action,
    target: string,
    result: ExecutionResult
  ): Promise<void> {
    if (!this.journalService) return;

    const eventType = this.mapActionToEventType(action.action);
    const entry: CreateJournalEntry = {
      nodeId: target,
      nodeUri: `aws:${target}`,
      eventType,
      source: "aws",
      action: action.action,
      summary:
        result.status === "success"
          ? `AWS ${action.action} succeeded on ${target}`
          : `AWS ${action.action} failed on ${target}: ${result.error ?? "unknown error"}`,
      details: {
        status: result.status,
        parameters: action.parameters,
        ...(result.error ? { error: result.error } : {}),
      },
    };

    try {
      await this.journalService.recordEvent(entry);
    } catch (err) {
      this.logger.error("Failed to record journal entry", {
        component: "AWSPlugin",
        operation: "recordJournal",
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  /**
   * Record a journal entry for a failure that throws (e.g., auth errors).
   */
  private async recordJournalFailure(
    action: Action,
    target: string,
    startedAt: string,
    errorMessage: string
  ): Promise<void> {
    const failedResult = this.buildFailedResult(action, startedAt, target, errorMessage);
    await this.recordJournal(action, target, failedResult);
  }

  /**
   * Map an action name to a JournalEventType
   */
  private mapActionToEventType(
    actionName: string
  ): "provision" | "start" | "stop" | "reboot" | "destroy" | "info" {
    switch (actionName) {
      case "provision":
      case "create_instance":
        return "provision";
      case "start":
        return "start";
      case "stop":
        return "stop";
      case "reboot":
        return "reboot";
      case "terminate":
        return "destroy";
      default:
        return "info";
    }
  }

  /**
   * Set the JournalService (alternative to constructor injection)
   */
  setJournalService(journalService: JournalService): void {
    this.journalService = journalService;
  }

  /**
   * List lifecycle action capabilities
   *
   * @returns Array of Capability objects
   */
  listCapabilities(): Capability[] {
    return [
      { name: "start", description: "Start an EC2 instance" },
      { name: "stop", description: "Stop an EC2 instance" },
      { name: "reboot", description: "Reboot an EC2 instance" },
      { name: "terminate", description: "Terminate an EC2 instance" },
    ];
  }

  /**
   * List provisioning capabilities
   *
   * @returns Array of ProvisioningCapability objects
   */
  listProvisioningCapabilities(): ProvisioningCapability[] {
    return [
      {
        name: "create_instance",
        description: "Launch a new EC2 instance",
        operation: "create",
      },
    ];
  }

  // ========================================
  // AWS-Specific Resource Discovery Methods
  // ========================================

  /**
   * Get available AWS regions
   *
   * Validates: Requirement 13.1
   */
  async getRegions(): Promise<string[]> {
    this.ensureInitialized();
    return this.service!.getRegions();
  }

  /**
   * Get available EC2 instance types
   *
   * Validates: Requirement 13.2
   */
  async getInstanceTypes(_region?: string): Promise<InstanceTypeInfo[]> {
    this.ensureInitialized();
    return this.service!.getInstanceTypes(_region);
  }

  /**
   * Get available AMIs for a region
   *
   * Validates: Requirement 13.3
   */
  async getAMIs(_region: string, _filters?: AMIFilter[]): Promise<AMIInfo[]> {
    this.ensureInitialized();
    return this.service!.getAMIs(_region, _filters);
  }

  /**
   * Get available VPCs for a region
   *
   * Validates: Requirement 13.4
   */
  async getVPCs(_region: string): Promise<VPCInfo[]> {
    this.ensureInitialized();
    return this.service!.getVPCs(_region);
  }

  /**
   * Get available subnets for a region
   *
   * Validates: Requirement 13.5
   */
  async getSubnets(_region: string, _vpcId?: string): Promise<SubnetInfo[]> {
    this.ensureInitialized();
    return this.service!.getSubnets(_region, _vpcId);
  }

  /**
   * Get available security groups for a region
   *
   * Validates: Requirement 13.6
   */
  async getSecurityGroups(
    _region: string,
    _vpcId?: string
  ): Promise<SecurityGroupInfo[]> {
    this.ensureInitialized();
    return this.service!.getSecurityGroups(_region, _vpcId);
  }

  /**
   * Get available key pairs for a region
   *
   * Validates: Requirement 13.7
   */
  async getKeyPairs(_region: string): Promise<KeyPairInfo[]> {
    this.ensureInitialized();
    return this.service!.getKeyPairs(_region);
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Ensure the plugin is initialized
   *
   * @throws Error if plugin is not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config.enabled) {
      throw new Error("AWS integration is not initialized");
    }
  }
}
