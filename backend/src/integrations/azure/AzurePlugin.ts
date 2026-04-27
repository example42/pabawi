/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Azure Integration Plugin
 *
 * Plugin class that integrates Azure VMs into Pabawi.
 * Implements both InformationSourcePlugin and ExecutionToolPlugin interfaces.
 *
 * Validates: Requirements 1.1, 1.4, 1.5, 1.6, 2.6, 3.1–3.4, 4.1, 5.1, 6.1,
 *            7.1, 8.1, 8.5, 9.1–9.3, 11.1–11.3, 11.5, 13.1, 13.2
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
import type { CreateJournalEntry, JournalSource } from "../../services/journal/types";
import type {
  AzureConfig,
  AzureLocationInfo,
  AzureVMSizeInfo,
  AzureImageInfo,
  AzureResourceGroupInfo,
  ProvisioningCapability,
} from "./types";
import { AzureService } from "./AzureService";
import { AzureAuthenticationError } from "./types";

/**
 * AzurePlugin — Plugin for Azure Virtual Machines
 *
 * Provides:
 * - Inventory discovery of Azure VMs
 * - Group management (by location, resource group, tags)
 * - Facts retrieval for VMs
 * - Lifecycle actions (start, stop, restart, deallocate)
 * - Provisioning capabilities (create_vm)
 * - Resource discovery (locations, VM sizes, images, resource groups)
 */
export class AzurePlugin
  extends BasePlugin
  implements InformationSourcePlugin, ExecutionToolPlugin
{
  readonly type = "both" as const;
  private service?: AzureService;
  private journalService?: JournalService;

  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
    journalService?: JournalService,
  ) {
    super("azure", "both", logger, performanceMonitor);
    this.journalService = journalService;

    this.logger.debug("AzurePlugin created", {
      component: "AzurePlugin",
      operation: "constructor",
    });
  }

  // ========================================
  // Initialization
  // ========================================

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async performInitialization(): Promise<void> {
    this.logger.info("Initializing Azure integration", {
      component: "AzurePlugin",
      operation: "performInitialization",
    });

    const config = this.config.config as unknown as AzureConfig;
    this.validateAzureConfig(config);

    this.service = new AzureService(config, this.logger);

    this.logger.info("Azure integration initialized successfully", {
      component: "AzurePlugin",
      operation: "performInitialization",
    });
  }

  private validateAzureConfig(config: AzureConfig): void {
    this.logger.debug("Validating Azure configuration", {
      component: "AzurePlugin",
      operation: "validateAzureConfig",
    });

    if (!config.subscriptionId) {
      throw new Error(
        "AZURE_SUBSCRIPTION_ID is required when AZURE_ENABLED is true",
      );
    }

    if (!config.tenantId && !config.clientId && !config.clientSecret) {
      this.logger.info(
        "No explicit Azure credentials configured — using default credential chain (managed identity, CLI, environment)",
        { component: "AzurePlugin", operation: "validateAzureConfig" },
      );
    }

    this.logger.debug("Azure configuration validated successfully", {
      component: "AzurePlugin",
      operation: "validateAzureConfig",
    });
  }

  // ========================================
  // Health Check
  // ========================================

  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    if (!this.service) {
      return { healthy: false, message: "Azure service not initialized" };
    }

    try {
      const info = await this.service.validateCredentials();
      const config = this.config.config as unknown as AzureConfig;

      return {
        healthy: true,
        message: `Azure authenticated — subscription "${info.subscriptionName}"`,
        details: {
          subscriptionName: info.subscriptionName,
          subscriptionId: info.subscriptionId,
          tenantId: info.tenantId,
          resourceGroups: config.resourceGroups,
          hasClientCredentials: !!(config.tenantId && config.clientId),
        },
      };
    } catch (error) {
      if (error instanceof AzureAuthenticationError) {
        return {
          healthy: false,
          message: "Azure authentication failed",
          details: { error: error.message },
        };
      }

      return {
        healthy: false,
        message: error instanceof Error ? error.message : "Azure health check failed",
        details: {
          error: error instanceof Error ? error.stack : String(error),
        },
      };
    }
  }

  // ========================================
  // InformationSourcePlugin
  // ========================================

  async getInventory(): Promise<Node[]> {
    this.ensureInitialized();
    return this.service!.getInventory();
  }

  async getGroups(): Promise<NodeGroup[]> {
    this.ensureInitialized();
    return this.service!.getGroups();
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();

    if (!nodeId.startsWith("azure:")) {
      const inventory = await this.service!.getInventory();
      const match = inventory.find((n) => n.id === nodeId || n.name === nodeId);
      if (!match) {
        throw new Error(`Azure node not found: ${nodeId}`);
      }
      return this.service!.getNodeFacts(match.id);
    }

    return this.service!.getNodeFacts(nodeId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getNodeData(_nodeId: string, _dataType: string): Promise<unknown> {
    this.ensureInitialized();
    return null;
  }

  // ========================================
  // ExecutionToolPlugin
  // ========================================

  async executeAction(action: Action): Promise<ExecutionResult> {
    this.ensureInitialized();

    const startedAt = new Date().toISOString();
    const target = Array.isArray(action.target) ? action.target[0] : action.target;

    try {
      let result: ExecutionResult;

      switch (action.action) {
        case "provision":
        case "create_vm":
          result = await this.handleProvision(action, startedAt, target);
          break;
        case "start":
        case "stop":
        case "restart":
        case "deallocate":
          result = await this.handleLifecycle(action, startedAt, target);
          break;
        default:
          throw new Error(`Unsupported Azure action: ${action.action}`);
      }

      await this.recordJournal(action, target, result);
      return result;
    } catch (error) {
      if (error instanceof AzureAuthenticationError) {
        await this.recordJournalFailure(action, target, startedAt, error.message);
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedResult = this.buildFailedResult(action, startedAt, target, errorMessage);
      await this.recordJournal(action, target, failedResult);
      return failedResult;
    }
  }

  private async handleProvision(
    action: Action,
    startedAt: string,
    target: string,
  ): Promise<ExecutionResult> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const params = action.parameters ?? action.metadata! ?? {};
    const resourceId = await this.service!.provisionVM(params);
    const completedAt = new Date().toISOString();

    return {
      id: `azure-provision-${String(Date.now())}`,
      type: "task",
      targetNodes: [target],
      action: action.action,
      parameters: params,
      status: "success",
      startedAt,
      completedAt,
      results: [
        {
          nodeId: resourceId,
          status: "success",
          output: { stdout: `VM ${resourceId} provisioned successfully` },
          duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        },
      ],
    };
  }

  private async handleLifecycle(
    action: Action,
    startedAt: string,
    target: string,
  ): Promise<ExecutionResult> {
    const { resourceGroup, vmName } = this.parseTarget(target, action);

    switch (action.action) {
      case "start":
        await this.service!.startVM(resourceGroup, vmName);
        break;
      case "stop":
        await this.service!.stopVM(resourceGroup, vmName);
        break;
      case "restart":
        await this.service!.restartVM(resourceGroup, vmName);
        break;
      case "deallocate":
        await this.service!.deallocateVM(resourceGroup, vmName);
        break;
    }

    const completedAt = new Date().toISOString();

    return {
      id: `azure-${action.action}-${String(Date.now())}`,
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
          output: { stdout: `Action ${action.action} completed on ${vmName}` },
          duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        },
      ],
    };
  }

  private parseTarget(
    target: string,
    action: Action,
  ): { resourceGroup: string; vmName: string } {
    const parts = target.split(":");
    if (parts.length >= 4 && parts[0] === "azure") {
      return { resourceGroup: parts[2], vmName: parts.slice(3).join(":") };
    }
    const resourceGroup =
      (action.parameters?.resourceGroup as string | undefined) ??
      (action.metadata?.resourceGroup as string | undefined) ??
      "";
    const vmName =
      (action.parameters?.vmName as string | undefined) ??
      (action.metadata?.vmName as string | undefined) ??
      target;
    return { resourceGroup, vmName };
  }

  private buildFailedResult(
    action: Action,
    startedAt: string,
    target: string,
    errorMessage: string,
  ): ExecutionResult {
    return {
      id: `azure-error-${String(Date.now())}`,
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

  // ========================================
  // Journal Integration
  // ========================================

  private async recordJournal(
    action: Action,
    target: string,
    result: ExecutionResult,
  ): Promise<void> {
    if (!this.journalService) return;

    const eventType = this.mapActionToEventType(action.action);
    const entry: CreateJournalEntry = {
      nodeId: target,
      nodeUri: `azure:${target}`,
      eventType,
      source: "azure" as JournalSource,
      action: action.action,
      summary:
        result.status === "success"
          ? `Azure ${action.action} succeeded on ${target}`
          : `Azure ${action.action} failed on ${target}: ${result.error ?? "unknown error"}`,
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
        component: "AzurePlugin",
        operation: "recordJournal",
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async recordJournalFailure(
    action: Action,
    target: string,
    startedAt: string,
    errorMessage: string,
  ): Promise<void> {
    const failedResult = this.buildFailedResult(action, startedAt, target, errorMessage);
    await this.recordJournal(action, target, failedResult);
  }

  private mapActionToEventType(
    actionName: string,
  ): "provision" | "start" | "stop" | "reboot" | "destroy" | "unknown" {
    switch (actionName) {
      case "provision":
      case "create_vm":
        return "provision";
      case "start":
        return "start";
      case "stop":
        return "stop";
      case "restart":
        return "reboot";
      case "deallocate":
        return "destroy";
      default:
        return "unknown";
    }
  }

  setJournalService(journalService: JournalService): void {
    this.journalService = journalService;
  }

  // ========================================
  // Capabilities
  // ========================================

  listCapabilities(): Capability[] {
    return [
      { name: "start", description: "Start an Azure VM" },
      { name: "stop", description: "Stop an Azure VM" },
      { name: "restart", description: "Restart an Azure VM" },
      { name: "deallocate", description: "Deallocate an Azure VM" },
    ];
  }

  listProvisioningCapabilities(): ProvisioningCapability[] {
    return [
      {
        name: "create_vm",
        description: "Create a new Azure VM",
        operation: "create",
      },
    ];
  }

  // ========================================
  // Resource Discovery
  // ========================================

  async getLocations(): Promise<AzureLocationInfo[]> {
    this.ensureInitialized();
    return this.service!.getLocations();
  }

  async getVMSizes(location: string): Promise<AzureVMSizeInfo[]> {
    this.ensureInitialized();
    return this.service!.getVMSizes(location);
  }

  async getImages(publisher?: string, offer?: string, sku?: string): Promise<AzureImageInfo[]> {
    this.ensureInitialized();
    return this.service!.getImages(publisher, offer, sku);
  }

  async getResourceGroups(): Promise<AzureResourceGroupInfo[]> {
    this.ensureInitialized();
    return this.service!.getResourceGroups();
  }

  // ========================================
  // Helpers
  // ========================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.config.enabled) {
      throw new Error("Azure integration is not initialized");
    }
  }
}
