"use strict";
/**
 * Inventory Capability Interface
 *
 * Standardized interface for inventory management capabilities.
 * Plugins implementing inventory capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/inventory
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryFilterParamsSchema = exports.InventoryGroupsParamsSchema = exports.InventoryGetParamsSchema = exports.InventoryListParamsSchema = void 0;
exports.hasInventoryCapability = hasInventoryCapability;
const zod_1 = require("zod");
// =============================================================================
// Zod Schemas for Validation
// =============================================================================
/**
 * Schema for inventory.list parameters
 */
exports.InventoryListParamsSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().describe("Force refresh from source"),
    groups: zod_1.z.array(zod_1.z.string()).optional().describe("Filter by group membership"),
});
/**
 * Schema for inventory.get parameters
 */
exports.InventoryGetParamsSchema = zod_1.z.object({
    nodeId: zod_1.z.string().min(1).describe("Node identifier"),
});
/**
 * Schema for inventory.groups parameters
 */
exports.InventoryGroupsParamsSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().describe("Force refresh from source"),
});
/**
 * Schema for inventory.filter parameters
 */
exports.InventoryFilterParamsSchema = zod_1.z.object({
    criteria: zod_1.z.record(zod_1.z.unknown()).describe("Filter criteria as key-value pairs"),
    groups: zod_1.z.array(zod_1.z.string()).optional().describe("Filter by group membership"),
});
/**
 * Type guard to check if a plugin implements InventoryCapability
 */
function hasInventoryCapability(plugin) {
    return (typeof plugin === "object" &&
        plugin !== null &&
        "inventoryList" in plugin &&
        typeof plugin.inventoryList === "function" &&
        "inventoryGet" in plugin &&
        typeof plugin.inventoryGet === "function" &&
        "inventoryGroups" in plugin &&
        typeof plugin.inventoryGroups === "function" &&
        "inventoryFilter" in plugin &&
        typeof plugin.inventoryFilter === "function");
}
//# sourceMappingURL=inventory.js.map
