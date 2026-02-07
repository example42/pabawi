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
/**
 * Schema for inventory.list parameters
 */
export declare const InventoryListParamsSchema: z.ZodObject<{
    refresh: z.ZodOptional<z.ZodBoolean>;
    groups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    groups?: string[];
    refresh?: boolean;
}, {
    groups?: string[];
    refresh?: boolean;
}>;
/**
 * Schema for inventory.get parameters
 */
export declare const InventoryGetParamsSchema: z.ZodObject<{
    nodeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodeId?: string;
}, {
    nodeId?: string;
}>;
/**
 * Schema for inventory.groups parameters
 */
export declare const InventoryGroupsParamsSchema: z.ZodObject<{
    refresh: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    refresh?: boolean;
}, {
    refresh?: boolean;
}>;
/**
 * Schema for inventory.filter parameters
 */
export declare const InventoryFilterParamsSchema: z.ZodObject<{
    criteria: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    groups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    groups?: string[];
    criteria?: Record<string, unknown>;
}, {
    groups?: string[];
    criteria?: Record<string, unknown>;
}>;
export type InventoryListParams = z.infer<typeof InventoryListParamsSchema>;
export type InventoryGetParams = z.infer<typeof InventoryGetParamsSchema>;
export type InventoryGroupsParams = z.infer<typeof InventoryGroupsParamsSchema>;
export type InventoryFilterParams = z.infer<typeof InventoryFilterParamsSchema>;
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
export declare function hasInventoryCapability(plugin: unknown): plugin is InventoryCapability;
//# sourceMappingURL=inventory.d.ts.map
