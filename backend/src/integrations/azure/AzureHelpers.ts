/**
 * Azure Service Helpers
 *
 * Pure transformation and grouping functions extracted from AzureService
 * to keep the main service file under 300 lines.
 */

import type { VirtualMachine, VirtualMachineInstanceView } from "@azure/arm-compute";
import type { Node, Facts } from "../bolt/types";
import type { NodeGroup } from "../types";

const TAG_KEYS = ["Environment", "Project", "Team", "Application"];

/**
 * Extract power state from a VM's instanceView statuses
 */
export function extractPowerState(vm: VirtualMachine): string {
  const statuses = vm.instanceView?.statuses ?? [];
  const powerStatus = statuses.find((s) => s.code?.startsWith("PowerState/"));
  return powerStatus?.displayStatus ?? "unknown";
}

/**
 * Parse an Azure node ID into its components
 */
export function parseNodeId(nodeId: string): { subscriptionId: string; resourceGroup: string; vmName: string } {
  const parts = nodeId.split(":");
  if (parts.length < 4 || parts[0] !== "azure") {
    throw new Error(
      `Invalid Azure node ID format: ${nodeId}. Expected "azure:{subscriptionId}:{resourceGroup}:{vmName}"`,
    );
  }
  return { subscriptionId: parts[1], resourceGroup: parts[2], vmName: parts.slice(3).join(":") };
}

/**
 * Transform an Azure VirtualMachine into a Node object
 */
export function transformVMToNode(vm: VirtualMachine, resourceGroup: string, subscriptionId: string): Node {
  const vmName: string = vm.name ?? "unknown";
  const tags: Record<string, string> = (vm.tags as Record<string, string> | undefined) ?? {};
  const powerState = extractPowerState(vm);
  const nodeId = `azure:${subscriptionId}:${resourceGroup}:${vmName}`;

  const node: Node = {
    id: nodeId,
    name: vmName,
    uri: nodeId,
    transport: "ssh" as const,
    config: {
      vmId: vm.id ?? "",
      powerState,
      vmSize: vm.hardwareProfile?.vmSize ?? "unknown",
      resourceGroup,
      location: vm.location,
      tags,
      provisioningState: vm.provisioningState ?? "unknown",
      osType: vm.storageProfile?.osDisk?.osType ?? "unknown",
    },
    source: "azure",
  };

  (node as Node & { status?: string }).status = powerState;
  return node;
}

/**
 * Transform a VM and its instance view into a Facts object
 */
export function transformToFacts(
  nodeId: string,
  vm: VirtualMachine,
  instanceView: VirtualMachineInstanceView,
  subscriptionId: string,
): Facts {
  const tags: Record<string, string> = (vm.tags as Record<string, string> | undefined) ?? {};
  const powerStatus = instanceView.statuses?.find((s) => s.code?.startsWith("PowerState/"));
  const powerState = powerStatus?.displayStatus ?? "unknown";
  const osType: string = vm.storageProfile?.osDisk?.osType ?? "unknown";
  const imageRef = vm.storageProfile?.imageReference;

  return {
    nodeId,
    gatheredAt: new Date().toISOString(),
    source: "azure",
    facts: {
      os: {
        family: osType.toLowerCase() === "windows" ? "windows" : "linux",
        name: imageRef ? `${imageRef.offer ?? ""}/${imageRef.sku ?? ""}` : "unknown",
        release: { full: imageRef?.version ?? "unknown", major: imageRef?.sku ?? "unknown" },
      },
      processors: { count: 0, models: [] },
      memory: { system: { total: "unknown", available: "unknown" } },
      networking: {
        hostname: vm.name ?? "unknown",
        interfaces: {},
      },
      categories: {
        system: {
          vmName: vm.name,
          vmId: vm.id,
          powerState,
          vmSize: vm.hardwareProfile?.vmSize,
          location: vm.location,
          provisioningState: vm.provisioningState,
          osType,
          offer: imageRef?.offer,
          sku: imageRef?.sku,
          version: imageRef?.version,
        },
        network: {
          networkInterfaces: (vm.networkProfile?.networkInterfaces ?? []).map((nic) => ({
            id: nic.id,
            primary: nic.primary,
          })),
        },
        hardware: {
          vmSize: vm.hardwareProfile?.vmSize,
          osDiskSizeGB: vm.storageProfile?.osDisk?.diskSizeGB,
          dataDiskCount: vm.storageProfile?.dataDisks?.length ?? 0,
          dataDiskDetails: (vm.storageProfile?.dataDisks ?? []).map((d) => ({
            name: d.name,
            sizeGB: d.diskSizeGB,
            lun: d.lun,
          })),
        },
        custom: {
          tags,
          resourceGroup: parseNodeId(nodeId).resourceGroup,
          subscriptionId,
        },
      },
    },
  };
}

/**
 * Group nodes by Azure location
 */
export function groupByLocation(nodes: Node[]): NodeGroup[] {
  const locationMap = new Map<string, string[]>();
  for (const node of nodes) {
    const location = typeof node.config.location === "string" ? node.config.location : "unknown";
    if (!locationMap.has(location)) locationMap.set(location, []);
    const locationNodes = locationMap.get(location);
    if (locationNodes) locationNodes.push(node.name);
  }
  return Array.from(locationMap.entries()).map(([location, nodeNames]) => ({
    id: `azure:location:${location}`,
    name: `Azure ${location}`,
    source: "azure",
    sources: ["azure"],
    linked: false,
    nodes: nodeNames,
    metadata: { description: `Azure VMs in ${location}` },
  }));
}

/**
 * Group nodes by resource group
 */
export function groupByResourceGroup(nodes: Node[]): NodeGroup[] {
  const rgMap = new Map<string, string[]>();
  for (const node of nodes) {
    const rg = typeof node.config.resourceGroup === "string" ? node.config.resourceGroup : "unknown";
    if (!rgMap.has(rg)) rgMap.set(rg, []);
    const rgNodes = rgMap.get(rg);
    if (rgNodes) rgNodes.push(node.name);
  }
  return Array.from(rgMap.entries()).map(([rg, nodeNames]) => ({
    id: `azure:resourceGroup:${rg}`,
    name: `Resource Group: ${rg}`,
    source: "azure",
    sources: ["azure"],
    linked: false,
    nodes: nodeNames,
    metadata: { description: `Azure VMs in resource group ${rg}` },
  }));
}

/**
 * Group nodes by well-known tag keys (Environment, Project, Team, Application)
 */
export function groupByTags(nodes: Node[]): NodeGroup[] {
  const tagGroups = new Map<string, Map<string, string[]>>();

  for (const node of nodes) {
    const rawTags = node.config.tags;
    const tags: Record<string, string> = typeof rawTags === "object" && rawTags !== null
      ? rawTags as Record<string, string>
      : {};
    for (const key of TAG_KEYS) {
      const value = tags[key];
      if (value) {
        if (!tagGroups.has(key)) tagGroups.set(key, new Map());
        const valueMap = tagGroups.get(key);
        if (valueMap) {
          if (!valueMap.has(value)) valueMap.set(value, []);
          const valueNodes = valueMap.get(value);
          if (valueNodes) valueNodes.push(node.name);
        }
      }
    }
  }

  const groups: NodeGroup[] = [];
  for (const [tagKey, valueMap] of tagGroups) {
    for (const [tagValue, nodeNames] of valueMap) {
      groups.push({
        id: `azure:tag:${tagKey}:${tagValue}`,
        name: `${tagKey}: ${tagValue}`,
        source: "azure",
        sources: ["azure"],
        linked: false,
        nodes: nodeNames,
        metadata: { description: `Azure VMs with tag ${tagKey}=${tagValue}` },
      });
    }
  }

  return groups;
}
