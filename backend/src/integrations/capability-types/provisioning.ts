/**
 * Provisioning Capability Interface
 *
 * Standardized interface for provisioning and decommissioning capabilities.
 * Plugins implementing provisioning capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/provisioning
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for provision.create parameters
 */
export const ProvisionCreateParamsSchema = z.object({
  resourceType: z.string().min(1).describe("Type of resource to provision (e.g., 'vm', 'container', 'instance')"),
  name: z.string().min(1).describe("Name for the provisioned resource"),
  configuration: z.record(z.unknown()).describe("Provisioning configuration"),
  tags: z.record(z.string()).optional().describe("Tags to apply to the resource"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for provision.status parameters
 */
export const ProvisionStatusParamsSchema = z.object({
  provisionId: z.string().min(1).describe("Provisioning operation identifier"),
});

/**
 * Schema for provision.list parameters
 */
export const ProvisionListParamsSchema = z.object({
  resourceType: z.string().optional().describe("Filter by resource type"),
  tags: z.record(z.string()).optional().describe("Filter by tags"),
  status: z.enum(["active", "terminated", "pending", "failed"]).optional().describe("Filter by status"),
});

/**
 * Schema for decommission.execute parameters
 */
export const DecommissionExecuteParamsSchema = z.object({
  resourceId: z.string().min(1).describe("Resource identifier to decommission"),
  force: z.boolean().optional().describe("Force decommission even if resource is in use"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for decommission.status parameters
 */
export const DecommissionStatusParamsSchema = z.object({
  decommissionId: z.string().min(1).describe("Decommissioning operation identifier"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type ProvisionCreateParams = z.infer<typeof ProvisionCreateParamsSchema>;
export type ProvisionStatusParams = z.infer<typeof ProvisionStatusParamsSchema>;
export type ProvisionListParams = z.infer<typeof ProvisionListParamsSchema>;
export type DecommissionExecuteParams = z.infer<typeof DecommissionExecuteParamsSchema>;
export type DecommissionStatusParams = z.infer<typeof DecommissionStatusParamsSchema>;

// =============================================================================
// Provisioning Data Types
// =============================================================================

/**
 * Provisioning operation status
 */
export type ProvisioningStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

/**
 * Resource status
 */
export type ResourceStatus = "active" | "terminated" | "pending" | "failed";

/**
 * Provisioning result
 */
export interface ProvisioningResult {
  /** Unique provisioning operation identifier */
  id: string;
  /** Resource type */
  resourceType: string;
  /** Resource name */
  name: string;
  /** Provisioning status */
  status: ProvisioningStatus;
  /** Resource ID (if provisioned) */
  resourceId?: string;
  /** Resource URI or endpoint */
  resourceUri?: string;
  /** When provisioning started */
  startedAt: string;
  /** When provisioning completed */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
  /** Provisioning details */
  details?: Record<string, unknown>;
}

/**
 * Provisioned resource
 */
export interface ProvisionedResource {
  /** Unique resource identifier */
  id: string;
  /** Resource type */
  resourceType: string;
  /** Resource name */
  name: string;
  /** Resource status */
  status: ResourceStatus;
  /** Resource URI or endpoint */
  uri?: string;
  /** When resource was created */
  createdAt: string;
  /** Tags applied to resource */
  tags?: Record<string, string>;
  /** Resource configuration */
  configuration?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Decommissioning result
 */
export interface DecommissioningResult {
  /** Unique decommissioning operation identifier */
  id: string;
  /** Resource identifier being decommissioned */
  resourceId: string;
  /** Decommissioning status */
  status: ProvisioningStatus;
  /** When decommissioning started */
  startedAt: string;
  /** When decommissioning completed */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
  /** Decommissioning details */
  details?: Record<string, unknown>;
}

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Provisioning capability interface
 *
 * Provides standardized methods for provisioning and decommissioning:
 * - provision.create: Provision new infrastructure/nodes
 * - provision.status: Get provisioning status
 * - provision.list: List provisioned resources
 * - decommission.execute: Decommission infrastructure/nodes
 * - decommission.status: Get decommissioning status
 *
 * @example
 * ```typescript
 * class TerraformPlugin extends BasePlugin implements ProvisioningCapability {
 *   async provisionCreate(params: ProvisionCreateParams): Promise<ProvisioningResult> {
 *     // Implementation
 *   }
 *
 *   async provisionStatus(params: ProvisionStatusParams): Promise<ProvisioningResult> {
 *     // Implementation
 *   }
 *
 *   async provisionList(params: ProvisionListParams): Promise<ProvisionedResource[]> {
 *     // Implementation
 *   }
 *
 *   async decommissionExecute(params: DecommissionExecuteParams): Promise<DecommissioningResult> {
 *     // Implementation
 *   }
 *
 *   async decommissionStatus(params: DecommissionStatusParams): Promise<DecommissioningResult> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface ProvisioningCapability {
  /**
   * Provision new infrastructure/nodes
   *
   * @param params - Provisioning parameters
   * @returns Provisioning result with operation ID
   */
  provisionCreate(params: ProvisionCreateParams): Promise<ProvisioningResult>;

  /**
   * Get provisioning operation status
   *
   * @param params - Status parameters with provisionId
   * @returns Current provisioning status
   */
  provisionStatus(params: ProvisionStatusParams): Promise<ProvisioningResult>;

  /**
   * List provisioned resources
   *
   * @param params - List parameters with optional filters
   * @returns Array of provisioned resources
   */
  provisionList(params: ProvisionListParams): Promise<ProvisionedResource[]>;

  /**
   * Decommission infrastructure/nodes
   *
   * @param params - Decommissioning parameters
   * @returns Decommissioning result with operation ID
   */
  decommissionExecute(params: DecommissionExecuteParams): Promise<DecommissioningResult>;

  /**
   * Get decommissioning operation status
   *
   * @param params - Status parameters with decommissionId
   * @returns Current decommissioning status
   */
  decommissionStatus(params: DecommissionStatusParams): Promise<DecommissioningResult>;
}

/**
 * Type guard to check if a plugin implements ProvisioningCapability
 */
export function hasProvisioningCapability(
  plugin: unknown,
): plugin is ProvisioningCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "provisionCreate" in plugin &&
    typeof (plugin as Record<string, unknown>).provisionCreate === "function" &&
    "provisionStatus" in plugin &&
    typeof (plugin as Record<string, unknown>).provisionStatus === "function" &&
    "provisionList" in plugin &&
    typeof (plugin as Record<string, unknown>).provisionList === "function" &&
    "decommissionExecute" in plugin &&
    typeof (plugin as Record<string, unknown>).decommissionExecute === "function" &&
    "decommissionStatus" in plugin &&
    typeof (plugin as Record<string, unknown>).decommissionStatus === "function"
  );
}
