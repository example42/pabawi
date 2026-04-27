/**
 * Azure Service
 *
 * Wraps Azure SDK clients to provide inventory discovery,
 * grouping, facts retrieval, provisioning, lifecycle management,
 * and resource discovery for Azure VMs.
 */

import { ComputeManagementClient } from "@azure/arm-compute";
import type { VirtualMachine } from "@azure/arm-compute";
import { ClientSecretCredential, DefaultAzureCredential } from "@azure/identity";
import type { TokenCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-resources-subscriptions";
import { AzureAuthenticationError } from "./types";
import type {
  AzureConfig,
  AzureLocationInfo,
  AzureVMSizeInfo,
  AzureImageInfo,
  AzureResourceGroupInfo,
} from "./types";
import type { Node, Facts } from "../bolt/types";
import type { NodeGroup } from "../types";
import type { LoggerService } from "../../services/LoggerService";
import {
  transformVMToNode,
  transformToFacts,
  parseNodeId,
  groupByLocation,
  groupByResourceGroup,
  groupByTags,
} from "./AzureHelpers";

const AUTH_ERROR_CODES = [
  "AuthenticationFailed",
  "AuthorizationFailed",
  "InvalidAuthenticationToken",
  "ExpiredAuthenticationToken",
];

export class AzureService {
  private readonly computeClient: ComputeManagementClient;
  private readonly resourceClient: ResourceManagementClient;
  private readonly subscriptionClient: SubscriptionClient;
  private readonly credential: TokenCredential;
  private readonly subscriptionId: string;
  private readonly resourceGroups?: string[];
  private readonly logger: LoggerService;

  constructor(config: AzureConfig, logger: LoggerService) {
    this.logger = logger;
    this.subscriptionId = config.subscriptionId;
    this.resourceGroups = config.resourceGroups;

    if (config.tenantId && config.clientId && config.clientSecret) {
      this.credential = new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret);
      this.logger.debug("Using ClientSecretCredential", { component: "AzureService", operation: "constructor" });
    } else {
      this.credential = new DefaultAzureCredential();
      this.logger.debug("Using DefaultAzureCredential", { component: "AzureService", operation: "constructor" });
    }

    this.computeClient = new ComputeManagementClient(this.credential, this.subscriptionId);
    this.resourceClient = new ResourceManagementClient(this.credential, this.subscriptionId);
    this.subscriptionClient = new SubscriptionClient(this.credential);

    this.logger.debug("AzureService created", {
      component: "AzureService",
      operation: "constructor",
      metadata: { subscriptionId: this.subscriptionId },
    });
  }
  // ========================================
  // Credential Validation
  // ========================================

  async validateCredentials(): Promise<{ subscriptionName: string; subscriptionId: string; tenantId: string }> {
    try {
      const response = await this.subscriptionClient.subscriptions.get(this.subscriptionId);
      const result = {
        subscriptionName: response.displayName ?? "",
        subscriptionId: response.subscriptionId ?? this.subscriptionId,
        tenantId: response.tenantId ?? "",
      };
      this.logger.info("Azure credentials validated", {
        component: "AzureService", operation: "validateCredentials",
        metadata: { subscriptionName: result.subscriptionName },
      });
      return result;
    } catch (error) {
      this.throwIfAuthError(error);
      if (error instanceof AzureAuthenticationError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new AzureAuthenticationError(message);
    }
  }
  // ========================================
  // Inventory, Groups & Facts
  // ========================================

  async getInventory(): Promise<Node[]> {
    const nodes: Node[] = [];

    if (this.resourceGroups && this.resourceGroups.length > 0) {
      for (const rg of this.resourceGroups) {
        try {
          const vms = await this.listVMsInResourceGroup(rg);
          nodes.push(...vms.map((vm) => transformVMToNode(vm, rg, this.subscriptionId)));
        } catch (error) {
          this.logger.error(`Failed to query resource group ${rg}`, {
            component: "AzureService", operation: "getInventory", metadata: { resourceGroup: rg },
          }, error instanceof Error ? error : undefined);
        }
      }
    } else {
      nodes.push(...await this.listAllVMs());
    }

    this.logger.info("Azure VM inventory fetched", {
      component: "AzureService", operation: "getInventory", metadata: { count: nodes.length },
    });
    return nodes;
  }

  async getGroups(): Promise<NodeGroup[]> {
    const inventory = await this.getInventory();
    return [...groupByLocation(inventory), ...groupByResourceGroup(inventory), ...groupByTags(inventory)];
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    const { resourceGroup, vmName } = parseNodeId(nodeId);
    const vm = await this.computeClient.virtualMachines.get(resourceGroup, vmName);
    if (!vm) throw new Error(`VM not found: ${vmName} in resource group ${resourceGroup}`);
    const instanceView = await this.computeClient.virtualMachines.instanceView(resourceGroup, vmName);
    return transformToFacts(nodeId, vm, instanceView, this.subscriptionId);
  }

  // ========================================
  // Provisioning & Lifecycle
  // ========================================

  async provisionVM(params: Record<string, unknown>): Promise<string> {
    const rg = params.resourceGroup as string;
    const vmName = params.vmName as string;
    this.logger.info("Provisioning Azure VM", {
      component: "AzureService", operation: "provisionVM", metadata: { resourceGroup: rg, vmName },
    });

    try {
      const imageRef = params.imageReference as { publisher: string; offer: string; sku: string; version?: string };
      const adminUser = params.adminUsername as string;
      const vmDef: VirtualMachine = {
        location: params.location as string,
        hardwareProfile: { vmSize: (params.vmSize as string) ?? "Standard_B1s" },
        storageProfile: {
          imageReference: { ...imageRef, version: imageRef.version ?? "latest" },
          osDisk: { createOption: "FromImage", managedDisk: { storageAccountType: "Standard_LRS" } },
        },
        osProfile: {
          computerName: vmName, adminUsername: adminUser,
          ...(params.adminPassword ? { adminPassword: params.adminPassword as string } : {}),
          ...(params.sshPublicKey ? {
            linuxConfiguration: { ssh: { publicKeys: [{
              path: `/home/${adminUser}/.ssh/authorized_keys`, keyData: params.sshPublicKey as string,
            }] } },
          } : {}),
        },
        networkProfile: {
          networkInterfaces: params.networkInterfaceId ? [{ id: params.networkInterfaceId as string }] : [],
        },
      };

      const poller = await this.computeClient.virtualMachines.beginCreateOrUpdate(rg, vmName, vmDef);
      const result = await poller.pollUntilDone();
      return result.id ?? `${rg}/${vmName}`;
    } catch (error) { this.throwIfAuthError(error); throw error; }
  }

  async startVM(resourceGroup: string, vmName: string): Promise<void> {
    await this.runLifecycleOp("startVM", resourceGroup, vmName,
      () => this.computeClient.virtualMachines.beginStart(resourceGroup, vmName));
  }

  async stopVM(resourceGroup: string, vmName: string): Promise<void> {
    await this.runLifecycleOp("stopVM", resourceGroup, vmName,
      () => this.computeClient.virtualMachines.beginPowerOff(resourceGroup, vmName));
  }

  async restartVM(resourceGroup: string, vmName: string): Promise<void> {
    await this.runLifecycleOp("restartVM", resourceGroup, vmName,
      () => this.computeClient.virtualMachines.beginRestart(resourceGroup, vmName));
  }

  async deallocateVM(resourceGroup: string, vmName: string): Promise<void> {
    await this.runLifecycleOp("deallocateVM", resourceGroup, vmName,
      () => this.computeClient.virtualMachines.beginDeallocate(resourceGroup, vmName));
  }

  private async runLifecycleOp(
    operation: string,
    resourceGroup: string,
    vmName: string,
    beginOp: () => Promise<{ pollUntilDone: () => Promise<unknown> }>,
  ): Promise<void> {
    try {
      const poller = await beginOp();
      await poller.pollUntilDone();
      this.logger.info(`Azure VM ${operation} complete`, {
        component: "AzureService", operation, metadata: { resourceGroup, vmName },
      });
    } catch (error) { this.throwIfAuthError(error); throw error; }
  }

  // ========================================
  // Resource Discovery
  // ========================================

  async getLocations(): Promise<AzureLocationInfo[]> {
    const locations: AzureLocationInfo[] = [];
    for await (const loc of this.subscriptionClient.subscriptions.listLocations(this.subscriptionId)) {
      if (loc.name && loc.displayName) locations.push({ name: loc.name, displayName: loc.displayName });
    }
    this.logger.info("Azure locations fetched", {
      component: "AzureService", operation: "getLocations", metadata: { count: locations.length },
    });
    return locations;
  }

  async getVMSizes(location: string): Promise<AzureVMSizeInfo[]> {
    const sizes: AzureVMSizeInfo[] = [];
    for await (const size of this.computeClient.virtualMachineSizes.list(location)) {
      sizes.push({
        name: size.name ?? "unknown",
        vCpus: size.numberOfCores ?? 0,
        memoryMB: size.memoryInMB ?? 0,
        osDiskSizeGB: size.osDiskSizeInMB ? Math.round(size.osDiskSizeInMB / 1024) : 0,
      });
    }
    this.logger.info("Azure VM sizes fetched", {
      component: "AzureService", operation: "getVMSizes", metadata: { location, count: sizes.length },
    });
    return sizes;
  }

  async getImages(publisher?: string, offer?: string, sku?: string): Promise<AzureImageInfo[]> {
    if (!publisher || !offer || !sku) return [];
    const result = await this.computeClient.virtualMachineImages.list("eastus", publisher, offer, sku);
    return result.map((img) => ({ publisher, offer, sku, version: img.name ?? "latest" }));
  }

  async getResourceGroups(): Promise<AzureResourceGroupInfo[]> {
    const groups: AzureResourceGroupInfo[] = [];
    for await (const rg of this.resourceClient.resourceGroups.list()) {
      groups.push({ name: rg.name ?? "", location: rg.location, tags: (rg.tags as Record<string, string>) ?? {} });
    }
    this.logger.info("Azure resource groups fetched", {
      component: "AzureService", operation: "getResourceGroups", metadata: { count: groups.length },
    });
    return groups;
  }

  // ========================================
  // Private Helpers
  // ========================================

  private throwIfAuthError(error: unknown): void {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code ?? "";
      const name = (error as Error & { name?: string }).name ?? "";
      if (AUTH_ERROR_CODES.includes(code) || AUTH_ERROR_CODES.includes(name)) {
        throw new AzureAuthenticationError(error.message);
      }
    }
  }

  private async listVMsInResourceGroup(resourceGroup: string): Promise<VirtualMachine[]> {
    const vms: VirtualMachine[] = [];
    const iter = this.computeClient.virtualMachines.list(resourceGroup);
    for await (const vm of iter) { vms.push(vm); }
    return vms;
  }

  private async listAllVMs(): Promise<Node[]> {
    const nodes: Node[] = [];
    const rgIter = this.resourceClient.resourceGroups.list();
    for await (const rg of rgIter) {
      const rgName = rg.name ?? "";
      try {
        const vms = await this.listVMsInResourceGroup(rgName);
        nodes.push(...vms.map((vm) => transformVMToNode(vm, rgName, this.subscriptionId)));
      } catch (error) {
        this.logger.error(`Failed to query resource group ${rgName}`, {
          component: "AzureService", operation: "listAllVMs", metadata: { resourceGroup: rgName },
        }, error instanceof Error ? error : undefined);
      }
    }
    return nodes;
  }
}
