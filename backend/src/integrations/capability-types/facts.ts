/**
 * Facts Capability Interface
 *
 * Standardized interface for fact collection capabilities.
 * Plugins implementing fact capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/facts
 */

import { z } from "zod";
import type { Facts } from "../types";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for info.facts parameters
 */
export const FactsGetParamsSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
  providers: z.array(z.string()).optional().describe("Specific fact providers to use"),
});

/**
 * Schema for info.refresh parameters
 */
export const FactsRefreshParamsSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
  providers: z.array(z.string()).optional().describe("Specific fact providers to refresh"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type FactsGetParams = z.infer<typeof FactsGetParamsSchema>;
export type FactsRefreshParams = z.infer<typeof FactsRefreshParamsSchema>;

// =============================================================================
// Fact Provider Priority System
// =============================================================================

/**
 * Fact provider registration interface
 * Allows plugins to register as fact providers with priority
 */
export interface FactProvider {
  /** Provider name (typically plugin name) */
  name: string;
  /** Priority for fact merging (higher = takes precedence) */
  priority: number;
  /** Fact keys this provider can supply */
  supportedFactKeys: string[];
}

/**
 * Fact provider registry for managing multiple fact sources
 */
export interface FactProviderRegistry {
  /** Register a fact provider */
  registerProvider(provider: FactProvider): void;
  /** Get all registered providers */
  getProviders(): FactProvider[];
  /** Get providers sorted by priority (highest first) */
  getProvidersByPriority(): FactProvider[];
  /** Get provider by name */
  getProvider(name: string): FactProvider | undefined;
}

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Facts capability interface
 *
 * Provides standardized methods for fact collection:
 * - info.facts: Get facts for a node
 * - info.refresh: Force refresh facts (bypass cache)
 *
 * Includes fact provider priority system for merging facts from multiple sources.
 *
 * @example
 * ```typescript
 * class PuppetDBPlugin extends BasePlugin implements FactsCapability {
 *   async factsGet(params: FactsGetParams): Promise<Facts> {
 *     // Implementation
 *   }
 *
 *   async factsRefresh(params: FactsRefreshParams): Promise<Facts> {
 *     // Implementation
 *   }
 *
 *   getFactProvider(): FactProvider {
 *     return {
 *       name: 'puppetdb',
 *       priority: 100,
 *       supportedFactKeys: ['os', 'kernel', 'processors', ...]
 *     };
 *   }
 * }
 * ```
 */
export interface FactsCapability {
  /**
   * Get facts for a node
   *
   * @param params - Get parameters with nodeId
   * @returns Facts object with key-value pairs
   */
  factsGet(params: FactsGetParams): Promise<Facts>;

  /**
   * Force refresh facts (bypass cache)
   *
   * @param params - Refresh parameters with nodeId
   * @returns Refreshed facts object
   */
  factsRefresh(params: FactsRefreshParams): Promise<Facts>;

  /**
   * Get fact provider information for this plugin
   * Used by the framework to determine priority when merging facts
   *
   * @returns Fact provider metadata
   */
  getFactProvider(): FactProvider;
}

/**
 * Type guard to check if a plugin implements FactsCapability
 */
export function hasFactsCapability(
  plugin: unknown,
): plugin is FactsCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "factsGet" in plugin &&
    typeof (plugin as Record<string, unknown>).factsGet === "function" &&
    "factsRefresh" in plugin &&
    typeof (plugin as Record<string, unknown>).factsRefresh === "function" &&
    "getFactProvider" in plugin &&
    typeof (plugin as Record<string, unknown>).getFactProvider === "function"
  );
}
