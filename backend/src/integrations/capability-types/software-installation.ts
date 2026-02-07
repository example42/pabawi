/**
 * Software Installation Capability Interface
 *
 * Standardized interface for software/package installation capabilities.
 * Plugins implementing software installation should conform to these interfaces.
 *
 * @module integrations/capability-types/software-installation
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for package.install parameters
 */
export const PackageInstallParamsSchema = z.object({
  packageName: z.string().min(1).describe("Package name to install"),
  version: z.string().optional().describe("Specific version to install"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  options: z.record(z.unknown()).optional().describe("Installation options"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for package.uninstall parameters
 */
export const PackageUninstallParamsSchema = z.object({
  packageName: z.string().min(1).describe("Package name to uninstall"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  purge: z.boolean().optional().describe("Remove configuration files"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for package.update parameters
 */
export const PackageUpdateParamsSchema = z.object({
  packageName: z.string().min(1).describe("Package name to update"),
  version: z.string().optional().describe("Specific version to update to"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for package.list parameters
 */
export const PackageListParamsSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
  filter: z.string().optional().describe("Filter packages by name pattern"),
});

/**
 * Schema for package.search parameters
 */
export const PackageSearchParamsSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  limit: z.number().positive().optional().describe("Maximum number of results"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type PackageInstallParams = z.infer<typeof PackageInstallParamsSchema>;
export type PackageUninstallParams = z.infer<typeof PackageUninstallParamsSchema>;
export type PackageUpdateParams = z.infer<typeof PackageUpdateParamsSchema>;
export type PackageListParams = z.infer<typeof PackageListParamsSchema>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;

// =============================================================================
// Package Data Types
// =============================================================================

/**
 * Package installation status
 */
export type PackageStatus = "installed" | "not_installed" | "upgradable" | "broken";

/**
 * Package information
 */
export interface PackageInfo {
  /** Package name */
  name: string;
  /** Installed version */
  version?: string;
  /** Available version (if upgradable) */
  availableVersion?: string;
  /** Package status */
  status: PackageStatus;
  /** Package description */
  description?: string;
  /** Package size */
  size?: string;
  /** Installation date */
  installedAt?: string;
  /** Package repository/source */
  repository?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Package operation result for a single node
 */
export interface PackageNodeResult {
  /** Node identifier */
  nodeId: string;
  /** Operation status */
  status: "success" | "failed";
  /** Package name */
  packageName: string;
  /** Version installed/uninstalled/updated */
  version?: string;
  /** Error message if failed */
  error?: string;
  /** Operation duration in milliseconds */
  duration: number;
}

/**
 * Package operation result
 */
export interface PackageOperationResult {
  /** Unique operation identifier */
  id: string;
  /** Operation type */
  operation: "install" | "uninstall" | "update";
  /** Package name */
  packageName: string;
  /** Target node identifiers */
  targetNodes: string[];
  /** Overall operation status */
  status: "running" | "success" | "failed" | "partial";
  /** When operation started */
  startedAt: string;
  /** When operation completed */
  completedAt?: string;
  /** Per-node results */
  results: PackageNodeResult[];
  /** Error message if operation failed */
  error?: string;
}

/**
 * Available package from search
 */
export interface AvailablePackage {
  /** Package name */
  name: string;
  /** Latest available version */
  version: string;
  /** Package description */
  description?: string;
  /** Package repository/source */
  repository?: string;
  /** Package size */
  size?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Software Installation capability interface
 *
 * Provides standardized methods for package management:
 * - package.install: Install software packages
 * - package.uninstall: Uninstall software packages
 * - package.update: Update software packages
 * - package.list: List installed packages
 * - package.search: Search available packages
 *
 * @example
 * ```typescript
 * class AptPlugin extends BasePlugin implements SoftwareInstallationCapability {
 *   async packageInstall(params: PackageInstallParams): Promise<PackageOperationResult> {
 *     // Implementation
 *   }
 *
 *   async packageUninstall(params: PackageUninstallParams): Promise<PackageOperationResult> {
 *     // Implementation
 *   }
 *
 *   async packageUpdate(params: PackageUpdateParams): Promise<PackageOperationResult> {
 *     // Implementation
 *   }
 *
 *   async packageList(params: PackageListParams): Promise<PackageInfo[]> {
 *     // Implementation
 *   }
 *
 *   async packageSearch(params: PackageSearchParams): Promise<AvailablePackage[]> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface SoftwareInstallationCapability {
  /**
   * Install software packages on target nodes
   *
   * @param params - Installation parameters
   * @returns Package operation result
   */
  packageInstall(params: PackageInstallParams): Promise<PackageOperationResult>;

  /**
   * Uninstall software packages from target nodes
   *
   * @param params - Uninstallation parameters
   * @returns Package operation result
   */
  packageUninstall(params: PackageUninstallParams): Promise<PackageOperationResult>;

  /**
   * Update software packages on target nodes
   *
   * @param params - Update parameters
   * @returns Package operation result
   */
  packageUpdate(params: PackageUpdateParams): Promise<PackageOperationResult>;

  /**
   * List installed packages on a node
   *
   * @param params - List parameters with nodeId
   * @returns Array of installed packages
   */
  packageList(params: PackageListParams): Promise<PackageInfo[]>;

  /**
   * Search available packages
   *
   * @param params - Search parameters with query
   * @returns Array of available packages
   */
  packageSearch(params: PackageSearchParams): Promise<AvailablePackage[]>;
}

/**
 * Type guard to check if a plugin implements SoftwareInstallationCapability
 */
export function hasSoftwareInstallationCapability(
  plugin: unknown,
): plugin is SoftwareInstallationCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "packageInstall" in plugin &&
    typeof (plugin as Record<string, unknown>).packageInstall === "function" &&
    "packageUninstall" in plugin &&
    typeof (plugin as Record<string, unknown>).packageUninstall === "function" &&
    "packageUpdate" in plugin &&
    typeof (plugin as Record<string, unknown>).packageUpdate === "function" &&
    "packageList" in plugin &&
    typeof (plugin as Record<string, unknown>).packageList === "function" &&
    "packageSearch" in plugin &&
    typeof (plugin as Record<string, unknown>).packageSearch === "function"
  );
}
