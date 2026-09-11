import type { Capability, ExecutionToolPlugin, ProvisioningCapability } from "../integrations/types";

/**
 * One classification of provider lifecycle actions, shared by every consumer.
 *
 * The generic lifecycle routes used to carry two independent hardcoded lists:
 * one mapping an action to the permission it requires, another deciding which
 * actions are destructive for the discovery endpoint. They disagreed
 * (`terminate_instance` was destructive for authorization but not for
 * discovery), so an action could be advertised as safe and still be gated as a
 * destroy. Finding I08.
 *
 * The permission names match the RBAC resources seeded by migrations 007 and
 * 013: `<provider>:read|lifecycle|provision|destroy`.
 */
export type LifecyclePermission = "read" | "lifecycle" | "provision" | "destroy";

const ACTION_PERMISSIONS: Readonly<Record<string, LifecyclePermission>> = {
  // Power and state transitions on an existing guest.
  start: "lifecycle",
  stop: "lifecycle",
  shutdown: "lifecycle",
  reboot: "lifecycle",
  restart: "lifecycle",
  suspend: "lifecycle",
  resume: "lifecycle",
  deallocate: "lifecycle",
  snapshot: "lifecycle",
  // Creation.
  provision: "provision",
  create_vm: "provision",
  create_lxc: "provision",
  create_instance: "provision",
  // Irreversible removal.
  destroy: "destroy",
  destroy_vm: "destroy",
  destroy_lxc: "destroy",
  terminate: "destroy",
  terminate_instance: "destroy",
};

/**
 * Providers reachable through the generic lifecycle routes.
 *
 * Deliberately an allowlist rather than "any registered execution tool": node
 * IDs also carry prefixes for command execution tools (bolt, ansible, ssh),
 * and those must not be reachable through a route that bypasses the command
 * whitelist. Each name here is an RBAC resource with read/lifecycle/provision/
 * destroy permissions.
 */
export const LIFECYCLE_PROVIDERS = ["proxmox", "aws", "azure"] as const;

export type LifecycleProvider = (typeof LIFECYCLE_PROVIDERS)[number];

/** The permission an action requires, or null when the action is unknown. */
export function permissionForAction(action: string): LifecyclePermission | null {
  return ACTION_PERMISSIONS[action] ?? null;
}

/** Whether an action permanently removes the resource it targets. */
export function isDestructiveAction(action: string): boolean {
  return permissionForAction(action) === "destroy";
}

/**
 * Resolve the provider from a node ID prefix (`proxmox:node:vmid`,
 * `aws:region:instanceId`, `azure:subscription:resourceGroup:vmName`).
 */
export function resolveLifecycleProvider(nodeId: string): LifecycleProvider | null {
  const prefix = nodeId.split(":")[0];
  return (LIFECYCLE_PROVIDERS as readonly string[]).includes(prefix)
    ? (prefix as LifecycleProvider)
    : null;
}

interface ProvisioningCapableTool {
  listProvisioningCapabilities?: () => ProvisioningCapability[];
}

function capabilities(tool: ExecutionToolPlugin): Capability[] {
  return typeof tool.listCapabilities === "function" ? tool.listCapabilities() : [];
}

function provisioningCapabilities(tool: ExecutionToolPlugin): ProvisioningCapability[] {
  const provisioning = tool as unknown as ProvisioningCapableTool;
  return typeof provisioning.listProvisioningCapabilities === "function"
    ? provisioning.listProvisioningCapabilities()
    : [];
}

/**
 * Every action a provider advertises, lifecycle and provisioning alike.
 * The discovery endpoint and the execution endpoints agree because both read
 * this rather than a list written next to the route.
 */
export function supportedActions(tool: ExecutionToolPlugin): string[] {
  return [
    ...capabilities(tool).map((capability) => capability.name),
    ...provisioningCapabilities(tool).map((capability) => capability.name),
  ];
}

/**
 * The action that destroys a guest for this provider, or null when it does not
 * support destruction at all (Azure advertises no destroy capability). Picking
 * it from the provider's own capabilities means `DELETE` refuses Azure because
 * the provider cannot destroy, not because the route never heard of Azure.
 */
export function destroyActionFor(tool: ExecutionToolPlugin): string | null {
  return supportedActions(tool).find(isDestructiveAction) ?? null;
}
