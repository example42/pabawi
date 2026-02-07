/**
 * Alert Capability Interface
 *
 * Standardized interface for alert management capabilities.
 * Plugins implementing alert capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/alerts
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for alert.list parameters
 */
export const AlertListParamsSchema = z.object({
  nodeId: z.string().optional().describe("Filter by node identifier"),
  serviceId: z.string().optional().describe("Filter by service identifier"),
  severity: z.enum(["critical", "warning", "info"]).optional().describe("Filter by severity"),
  status: z.enum(["active", "acknowledged", "resolved"]).optional().describe("Filter by status"),
  limit: z.number().positive().optional().describe("Maximum number of alerts to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
});

/**
 * Schema for alert.get parameters
 */
export const AlertGetParamsSchema = z.object({
  alertId: z.string().min(1).describe("Alert identifier"),
});

/**
 * Schema for alert.acknowledge parameters
 */
export const AlertAcknowledgeParamsSchema = z.object({
  alertId: z.string().min(1).describe("Alert identifier"),
  acknowledgedBy: z.string().min(1).describe("User acknowledging the alert"),
  comment: z.string().optional().describe("Optional comment"),
});

/**
 * Schema for alert.resolve parameters
 */
export const AlertResolveParamsSchema = z.object({
  alertId: z.string().min(1).describe("Alert identifier"),
  resolvedBy: z.string().min(1).describe("User resolving the alert"),
  resolution: z.string().optional().describe("Resolution description"),
});

/**
 * Schema for alert.subscribe parameters
 */
export const AlertSubscribeParamsSchema = z.object({
  nodeId: z.string().optional().describe("Subscribe to alerts for specific node"),
  serviceId: z.string().optional().describe("Subscribe to alerts for specific service"),
  severity: z.array(z.enum(["critical", "warning", "info"])).optional().describe("Filter by severities"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type AlertListParams = z.infer<typeof AlertListParamsSchema>;
export type AlertGetParams = z.infer<typeof AlertGetParamsSchema>;
export type AlertAcknowledgeParams = z.infer<typeof AlertAcknowledgeParamsSchema>;
export type AlertResolveParams = z.infer<typeof AlertResolveParamsSchema>;
export type AlertSubscribeParams = z.infer<typeof AlertSubscribeParamsSchema>;

// =============================================================================
// Alert Data Types
// =============================================================================

/**
 * Alert severity levels
 */
export type AlertSeverity = "critical" | "warning" | "info";

/**
 * Alert status
 */
export type AlertStatus = "active" | "acknowledged" | "resolved";

/**
 * Alert data structure
 */
export interface Alert {
  /** Unique alert identifier */
  id: string;
  /** Alert title/summary */
  title: string;
  /** Detailed alert description */
  description?: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Alert status */
  status: AlertStatus;
  /** Node identifier (if applicable) */
  nodeId?: string;
  /** Node name (if applicable) */
  nodeName?: string;
  /** Service identifier (if applicable) */
  serviceId?: string;
  /** Service name (if applicable) */
  serviceName?: string;
  /** When alert was created */
  createdAt: string;
  /** When alert was last updated */
  updatedAt?: string;
  /** When alert was acknowledged */
  acknowledgedAt?: string;
  /** User who acknowledged */
  acknowledgedBy?: string;
  /** Acknowledgment comment */
  acknowledgmentComment?: string;
  /** When alert was resolved */
  resolvedAt?: string;
  /** User who resolved */
  resolvedBy?: string;
  /** Resolution description */
  resolution?: string;
  /** Alert source/origin */
  source?: string;
  /** Alert tags */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Paginated alert list result
 */
export interface AlertListResult {
  /** Array of alerts */
  alerts: Alert[];
  /** Total count of alerts matching query */
  total: number;
  /** Current offset */
  offset: number;
  /** Limit used */
  limit: number;
}

/**
 * Alert acknowledgment result
 */
export interface AlertAcknowledgmentResult {
  /** Alert identifier */
  alertId: string;
  /** Whether acknowledgment succeeded */
  success: boolean;
  /** Updated alert */
  alert?: Alert;
  /** Error message if failed */
  error?: string;
}

/**
 * Alert resolution result
 */
export interface AlertResolutionResult {
  /** Alert identifier */
  alertId: string;
  /** Whether resolution succeeded */
  success: boolean;
  /** Updated alert */
  alert?: Alert;
  /** Error message if failed */
  error?: string;
}

/**
 * Callback function for alert notifications
 */
export type AlertNotificationCallback = (alert: Alert) => void;

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Alert capability interface
 *
 * Provides standardized methods for alert management:
 * - alert.list: List alerts for nodes/services
 * - alert.get: Get specific alert details
 * - alert.acknowledge: Acknowledge an alert
 * - alert.resolve: Resolve an alert
 * - alert.subscribe: Subscribe to alert notifications
 *
 * @example
 * ```typescript
 * class PrometheusPlugin extends BasePlugin implements AlertCapability {
 *   async alertList(params: AlertListParams): Promise<AlertListResult> {
 *     // Implementation
 *   }
 *
 *   async alertGet(params: AlertGetParams): Promise<Alert | null> {
 *     // Implementation
 *   }
 *
 *   async alertAcknowledge(params: AlertAcknowledgeParams): Promise<AlertAcknowledgmentResult> {
 *     // Implementation
 *   }
 *
 *   async alertResolve(params: AlertResolveParams): Promise<AlertResolutionResult> {
 *     // Implementation
 *   }
 *
 *   async alertSubscribe(params: AlertSubscribeParams, callback: AlertNotificationCallback): Promise<void> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface AlertCapability {
  /**
   * List alerts for nodes/services
   *
   * @param params - List parameters with optional filters
   * @returns Paginated alert list result
   */
  alertList(params: AlertListParams): Promise<AlertListResult>;

  /**
   * Get specific alert details
   *
   * @param params - Get parameters with alertId
   * @returns Alert details or null if not found
   */
  alertGet(params: AlertGetParams): Promise<Alert | null>;

  /**
   * Acknowledge an alert
   *
   * @param params - Acknowledgment parameters
   * @returns Acknowledgment result
   */
  alertAcknowledge(params: AlertAcknowledgeParams): Promise<AlertAcknowledgmentResult>;

  /**
   * Resolve an alert
   *
   * @param params - Resolution parameters
   * @returns Resolution result
   */
  alertResolve(params: AlertResolveParams): Promise<AlertResolutionResult>;

  /**
   * Subscribe to alert notifications
   * Provides real-time alert notifications
   *
   * @param params - Subscription parameters with filters
   * @param callback - Callback function for each alert
   */
  alertSubscribe(params: AlertSubscribeParams, callback: AlertNotificationCallback): Promise<void>;
}

/**
 * Type guard to check if a plugin implements AlertCapability
 */
export function hasAlertCapability(
  plugin: unknown,
): plugin is AlertCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "alertList" in plugin &&
    typeof (plugin as Record<string, unknown>).alertList === "function" &&
    "alertGet" in plugin &&
    typeof (plugin as Record<string, unknown>).alertGet === "function" &&
    "alertAcknowledge" in plugin &&
    typeof (plugin as Record<string, unknown>).alertAcknowledge === "function" &&
    "alertResolve" in plugin &&
    typeof (plugin as Record<string, unknown>).alertResolve === "function" &&
    "alertSubscribe" in plugin &&
    typeof (plugin as Record<string, unknown>).alertSubscribe === "function"
  );
}
