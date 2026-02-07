/**
 * Reports Capability Interface
 *
 * Standardized interface for report management capabilities.
 * Plugins implementing report capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/reports
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for reports.list parameters
 */
export const ReportsListParamsSchema = z.object({
  nodeId: z.string().optional().describe("Filter by node identifier"),
  limit: z.number().positive().optional().describe("Maximum number of reports to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
  startTime: z.string().optional().describe("Filter reports after this timestamp (ISO 8601)"),
  endTime: z.string().optional().describe("Filter reports before this timestamp (ISO 8601)"),
  status: z.enum(["success", "failed", "changed", "unchanged"]).optional().describe("Filter by report status"),
});

/**
 * Schema for reports.get parameters
 */
export const ReportsGetParamsSchema = z.object({
  reportId: z.string().min(1).describe("Report identifier"),
});

/**
 * Schema for reports.query parameters
 */
export const ReportsQueryParamsSchema = z.object({
  filters: z.record(z.unknown()).describe("Query filters as key-value pairs"),
  limit: z.number().positive().optional().describe("Maximum number of reports to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
  orderBy: z.string().optional().describe("Field to order results by"),
  orderDirection: z.enum(["asc", "desc"]).optional().describe("Order direction"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type ReportsListParams = z.infer<typeof ReportsListParamsSchema>;
export type ReportsGetParams = z.infer<typeof ReportsGetParamsSchema>;
export type ReportsQueryParams = z.infer<typeof ReportsQueryParamsSchema>;

// =============================================================================
// Report Data Types
// =============================================================================

/**
 * Report status enumeration
 */
export type ReportStatus = "success" | "failed" | "changed" | "unchanged";

/**
 * Report resource change
 */
export interface ReportResourceChange {
  /** Resource type (e.g., 'File', 'Service', 'Package') */
  resourceType: string;
  /** Resource title/name */
  resourceTitle: string;
  /** Change status */
  status: "success" | "failed" | "skipped";
  /** Whether the resource changed */
  changed: boolean;
  /** Events/messages for this resource */
  events?: {
    message: string;
    status: string;
    timestamp?: string;
  }[];
}

/**
 * Report metrics
 */
export interface ReportMetrics {
  /** Total resources in catalog */
  total?: number;
  /** Resources that changed */
  changed?: number;
  /** Resources that failed */
  failed?: number;
  /** Resources that were skipped */
  skipped?: number;
  /** Resources that succeeded without changes */
  unchanged?: number;
  /** Execution time in seconds */
  executionTime?: number;
}

/**
 * Report data structure
 */
export interface Report {
  /** Unique report identifier */
  id: string;
  /** Node identifier this report is for */
  nodeId: string;
  /** Node name */
  nodeName?: string;
  /** Report timestamp */
  timestamp: string;
  /** Report status */
  status: ReportStatus;
  /** Environment name */
  environment?: string;
  /** Configuration version or hash */
  configurationVersion?: string;
  /** Report metrics */
  metrics?: ReportMetrics;
  /** Resource changes */
  resourceChanges?: ReportResourceChange[];
  /** Logs or messages */
  logs?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Paginated report list result
 */
export interface ReportListResult {
  /** Array of reports */
  reports: Report[];
  /** Total count of reports matching query */
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
 * Reports capability interface
 *
 * Provides standardized methods for report management:
 * - reports.list: List available reports
 * - reports.get: Get specific report
 * - reports.query: Query reports with filters
 *
 * @example
 * ```typescript
 * class PuppetDBPlugin extends BasePlugin implements ReportsCapability {
 *   async reportsList(params: ReportsListParams): Promise<ReportListResult> {
 *     // Implementation
 *   }
 *
 *   async reportsGet(params: ReportsGetParams): Promise<Report | null> {
 *     // Implementation
 *   }
 *
 *   async reportsQuery(params: ReportsQueryParams): Promise<ReportListResult> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface ReportsCapability {
  /**
   * List available reports
   *
   * @param params - List parameters with optional filters
   * @returns Paginated report list result
   */
  reportsList(params: ReportsListParams): Promise<ReportListResult>;

  /**
   * Get specific report by ID
   *
   * @param params - Get parameters with reportId
   * @returns Report details or null if not found
   */
  reportsGet(params: ReportsGetParams): Promise<Report | null>;

  /**
   * Query reports with advanced filters
   *
   * @param params - Query parameters with filters
   * @returns Paginated report list result
   */
  reportsQuery(params: ReportsQueryParams): Promise<ReportListResult>;
}

/**
 * Type guard to check if a plugin implements ReportsCapability
 */
export function hasReportsCapability(
  plugin: unknown,
): plugin is ReportsCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "reportsList" in plugin &&
    typeof (plugin as Record<string, unknown>).reportsList === "function" &&
    "reportsGet" in plugin &&
    typeof (plugin as Record<string, unknown>).reportsGet === "function" &&
    "reportsQuery" in plugin &&
    typeof (plugin as Record<string, unknown>).reportsQuery === "function"
  );
}
