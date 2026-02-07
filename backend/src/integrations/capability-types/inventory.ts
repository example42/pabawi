/**
 * Inventory Capability Interface
 *
 * Standardized interface for inventory management capabilities.
 * Plugins implementing inventory capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/inventory
 */

import { z } from "zod";
import type { Node } from "../types";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for inventory.list parameters
 */
export const InventoryListParamsSchema = z.object({
  refresh: z.boolean().optional().describe("Force refresh from source"),
  groups: z.array(z.string()).optional().describe("Filter by group membership"),
});

/**
 * Schema for inventory.get parameters
 */
export const InventoryGetParamsSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
});

/**
 * Schema for inventory.groups parameters
 */
export const InventoryGroupsParamsSchema = z.object({
  refresh: z.boolean().optional().describe("Force refresh from source"),
});

/**
 * Schema for inventory.filter parameters
 */
export const InventoryFilterParamsSchema = z.object({
  criteria: z.record(z.unknown()).describe("Filter criteria as key-value pairs"),
  groups: z.array(z.string()).optional().describe("Filter by group membership"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type InventoryListParams = z.infer<typeof InventoryListParamsSchema>;
export type InventoryGetParams = z.infer<typeof InventoryGetParamsSchema>;
export type InventoryGroupsParams = z.infer<typeof InventoryGroupsParamsSchema>;
export type InventoryFilterParams = z.infer<typeof InventoryFilterParamsSchema>;

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Inventory capability interface
 *
 * Provides standardized methods for inventory management:
 * - inventory.list: List all nodes from this source
 * - inventory.get: Get specific node details
 * - inventory.groups: List available groups
 * - inventory.filter: Filter nodes by criteria
 *
 * @example
 * ```typescript
 * class BoltPlugin extends BasePlugin implements InventoryCapability {
 *   async inventoryList(params: InventoryListParams): Promise<Node[]> {
 *     // Implementation
 *   }
 *
 *   async inventoryGet(params: InventoryGetParams): Promise<Node | null> {
 *     // Implementation
 *   }
 *
 *   async inventoryGroups(params: InventoryGroupsParams): Promise<string[]> {
 *     // Implementation
 *   }
 *
 *   async inventoryFilter(params: InventoryFilterParams): Promise<Node[]> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface InventoryCapability {
  /**
   * List all nodes from this inventory source
   *
   * @param params - List parameters
   * @returns Array of nodes
   */
  inventoryList(params: InventoryListParams): Promise<Node[]>;

  /**
   * Get specific node details
   *
   * @param params - Get parameters with nodeId
   * @returns Node details or null if not found
   */
  inventoryGet(params: InventoryGetParams): Promise<Node | null>;

  /**
   * List available groups
   *
   * @param params - Groups parameters
   * @returns Array of group names
   */
  inventoryGroups(params: InventoryGroupsParams): Promise<string[]>;

  /**
   * Filter nodes by criteria
   *
   * @param params - Filter parameters with criteria
   * @returns Array of matching nodes
   */
  inventoryFilter(params: InventoryFilterParams): Promise<Node[]>;
}

/**
 * Type guard to check if a plugin implements InventoryCapability
 */
export function hasInventoryCapability(
  plugin: unknown,
): plugin is InventoryCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "inventoryList" in plugin &&
    typeof (plugin as Record<string, unknown>).inventoryList === "function" &&
    "inventoryGet" in plugin &&
    typeof (plugin as Record<string, unknown>).inventoryGet === "function" &&
    "inventoryGroups" in plugin &&
    typeof (plugin as Record<string, unknown>).inventoryGroups === "function" &&
    "inventoryFilter" in plugin &&
    typeof (plugin as Record<string, unknown>).inventoryFilter === "function"
  );
}
