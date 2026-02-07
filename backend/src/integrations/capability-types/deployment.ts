/**
 * Deployment Capability Interface
 *
 * Standardized interface for application/service deployment capabilities.
 * Plugins implementing deployment capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/deployment
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for deploy.execute parameters
 */
export const DeployExecuteParamsSchema = z.object({
  application: z.string().min(1).describe("Application or service name"),
  version: z.string().min(1).describe("Version to deploy"),
  environment: z.string().min(1).describe("Target environment (e.g., 'production', 'staging')"),
  targets: z.array(z.string().min(1)).optional().describe("Target node identifiers (if applicable)"),
  configuration: z.record(z.unknown()).optional().describe("Deployment configuration"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for deploy.status parameters
 */
export const DeployStatusParamsSchema = z.object({
  deploymentId: z.string().min(1).describe("Deployment identifier"),
});

/**
 * Schema for deploy.rollback parameters
 */
export const DeployRollbackParamsSchema = z.object({
  deploymentId: z.string().min(1).describe("Deployment identifier to rollback"),
  targetVersion: z.string().optional().describe("Specific version to rollback to"),
  async: z.boolean().optional().describe("Execute asynchronously"),
});

/**
 * Schema for deploy.history parameters
 */
export const DeployHistoryParamsSchema = z.object({
  application: z.string().min(1).describe("Application or service name"),
  environment: z.string().optional().describe("Filter by environment"),
  limit: z.number().positive().optional().describe("Maximum number of deployments to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type DeployExecuteParams = z.infer<typeof DeployExecuteParamsSchema>;
export type DeployStatusParams = z.infer<typeof DeployStatusParamsSchema>;
export type DeployRollbackParams = z.infer<typeof DeployRollbackParamsSchema>;
export type DeployHistoryParams = z.infer<typeof DeployHistoryParamsSchema>;

// =============================================================================
// Deployment Data Types
// =============================================================================

/**
 * Deployment status
 */
export type DeploymentStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "rolled_back"
  | "rolling_back";

/**
 * Deployment result
 */
export interface DeploymentResult {
  /** Unique deployment identifier */
  id: string;
  /** Application or service name */
  application: string;
  /** Version deployed */
  version: string;
  /** Target environment */
  environment: string;
  /** Deployment status */
  status: DeploymentStatus;
  /** When deployment started */
  startedAt: string;
  /** When deployment completed */
  completedAt?: string;
  /** User who initiated deployment */
  initiatedBy?: string;
  /** Target nodes (if applicable) */
  targets?: string[];
  /** Error message if failed */
  error?: string;
  /** Deployment details */
  details?: Record<string, unknown>;
  /** Previous version (for rollback reference) */
  previousVersion?: string;
}

/**
 * Deployment history entry
 */
export interface DeploymentHistoryEntry {
  /** Unique deployment identifier */
  id: string;
  /** Application or service name */
  application: string;
  /** Version deployed */
  version: string;
  /** Target environment */
  environment: string;
  /** Deployment status */
  status: DeploymentStatus;
  /** When deployment started */
  startedAt: string;
  /** When deployment completed */
  completedAt?: string;
  /** User who initiated deployment */
  initiatedBy?: string;
  /** Duration in milliseconds */
  duration?: number;
  /** Whether this was a rollback */
  isRollback?: boolean;
}

/**
 * Deployment history result
 */
export interface DeploymentHistoryResult {
  /** Array of deployment history entries */
  deployments: DeploymentHistoryEntry[];
  /** Total count of deployments */
  total: number;
  /** Current offset */
  offset: number;
  /** Limit used */
  limit: number;
}

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Deployment capability interface
 *
 * Provides standardized methods for deployment management:
 * - deploy.execute: Deploy application/service
 * - deploy.status: Get deployment status
 * - deploy.rollback: Rollback deployment
 * - deploy.history: Get deployment history
 *
 * @example
 * ```typescript
 * class JenkinsPlugin extends BasePlugin implements DeploymentCapability {
 *   async deployExecute(params: DeployExecuteParams): Promise<DeploymentResult> {
 *     // Implementation
 *   }
 *
 *   async deployStatus(params: DeployStatusParams): Promise<DeploymentResult> {
 *     // Implementation
 *   }
 *
 *   async deployRollback(params: DeployRollbackParams): Promise<DeploymentResult> {
 *     // Implementation
 *   }
 *
 *   async deployHistory(params: DeployHistoryParams): Promise<DeploymentHistoryResult> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface DeploymentCapability {
  /**
   * Deploy application or service
   *
   * @param params - Deployment parameters
   * @returns Deployment result with operation ID
   */
  deployExecute(params: DeployExecuteParams): Promise<DeploymentResult>;

  /**
   * Get deployment status
   *
   * @param params - Status parameters with deploymentId
   * @returns Current deployment status
   */
  deployStatus(params: DeployStatusParams): Promise<DeploymentResult>;

  /**
   * Rollback deployment
   *
   * @param params - Rollback parameters
   * @returns Rollback result with operation ID
   */
  deployRollback(params: DeployRollbackParams): Promise<DeploymentResult>;

  /**
   * Get deployment history
   *
   * @param params - History parameters with filters
   * @returns Paginated deployment history
   */
  deployHistory(params: DeployHistoryParams): Promise<DeploymentHistoryResult>;
}

/**
 * Type guard to check if a plugin implements DeploymentCapability
 */
export function hasDeploymentCapability(
  plugin: unknown,
): plugin is DeploymentCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "deployExecute" in plugin &&
    typeof (plugin as Record<string, unknown>).deployExecute === "function" &&
    "deployStatus" in plugin &&
    typeof (plugin as Record<string, unknown>).deployStatus === "function" &&
    "deployRollback" in plugin &&
    typeof (plugin as Record<string, unknown>).deployRollback === "function" &&
    "deployHistory" in plugin &&
    typeof (plugin as Record<string, unknown>).deployHistory === "function"
  );
}
