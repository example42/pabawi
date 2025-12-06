/**
 * PuppetDB Data Types
 *
 * Type definitions for PuppetDB API responses and transformed data.
 */

/**
 * Report metrics from PuppetDB
 */
export interface ReportMetrics {
  resources: {
    total: number;
    skipped: number;
    failed: number;
    failed_to_restart: number;
    restarted: number;
    changed: number;
    corrective_change?: number; // PuppetDB-specific: changes made to correct drift
    out_of_sync: number;
    scheduled: number;
  };
  time: Record<string, number>;
  changes: {
    total: number;
  };
  events: {
    success: number;
    failure: number;
    noop?: number; // PuppetDB-specific: events that would have changed in noop mode
    total: number;
  };
}

/**
 * Resource event from a Puppet report
 */
export interface ResourceEvent {
  resource_type: string;
  resource_title: string;
  property: string;
  timestamp: string;
  status: "success" | "failure" | "noop" | "skipped";
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
  containment_path: string[];
}

/**
 * Log entry from a Puppet report
 */
export interface LogEntry {
  level: string;
  message: string;
  source: string;
  tags: string[];
  time: string;
  file?: string;
  line?: number;
}

/**
 * Puppet report from PuppetDB
 */
export interface Report {
  certname: string;
  hash: string;
  environment: string;
  status: "unchanged" | "changed" | "failed";
  noop: boolean;
  puppet_version: string;
  report_format: number;
  configuration_version: string;
  start_time: string;
  end_time: string;
  producer_timestamp: string;
  receive_time: string;
  transaction_uuid: string;
  metrics: ReportMetrics;
  logs: LogEntry[];
  resource_events: ResourceEvent[];
}

/**
 * Catalog resource from PuppetDB
 */
export interface Resource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

/**
 * Resource reference for catalog edges
 */
export interface ResourceRef {
  type: string;
  title: string;
}

/**
 * Catalog edge (relationship between resources)
 */
export interface Edge {
  source: ResourceRef;
  target: ResourceRef;
  relationship: "contains" | "before" | "require" | "subscribe" | "notify";
}

/**
 * Puppet catalog from PuppetDB
 */
export interface Catalog {
  certname: string;
  version: string;
  transaction_uuid: string;
  environment: string;
  producer_timestamp: string;
  hash: string;
  resources: Resource[];
  edges: Edge[];
}

/**
 * Puppet event from PuppetDB
 */
export interface Event {
  certname: string;
  timestamp: string;
  report: string;
  resource_type: string;
  resource_title: string;
  property: string;
  status: "success" | "failure" | "noop" | "skipped";
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
}

/**
 * Event filters for querying
 */
export interface EventFilters {
  status?: "success" | "failure" | "noop" | "skipped";
  resourceType?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}
