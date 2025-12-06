/**
 * Puppetserver Data Types
 *
 * Type definitions for Puppetserver API responses and transformed data.
 */

/**
 * Certificate status in Puppetserver CA
 */
export type CertificateStatus = "signed" | "requested" | "revoked";

/**
 * Certificate from Puppetserver CA
 */
export interface Certificate {
  certname: string;
  status: CertificateStatus;
  fingerprint: string;
  dns_alt_names?: string[];
  authorization_extensions?: Record<string, unknown>;
  not_before?: string;
  not_after?: string;
}

/**
 * Node activity category based on last check-in time
 */
export type NodeActivityCategory = "active" | "inactive" | "never_checked_in";

/**
 * Node status from Puppetserver
 */
export interface NodeStatus {
  certname: string;
  latest_report_hash?: string;
  latest_report_status?: "unchanged" | "changed" | "failed";
  latest_report_noop?: boolean;
  latest_report_noop_pending?: boolean;
  cached_catalog_status?: string;
  catalog_timestamp?: string;
  facts_timestamp?: string;
  report_timestamp?: string;
  catalog_environment?: string;
  report_environment?: string;
}

/**
 * Puppet environment
 */
export interface Environment {
  name: string;
  last_deployed?: string;
  status?: "deployed" | "deploying" | "failed";
}

/**
 * Environment deployment result
 */
export interface DeploymentResult {
  environment: string;
  status: "success" | "failed";
  message?: string;
  timestamp: string;
}

/**
 * Catalog resource
 */
export interface CatalogResource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

/**
 * Catalog from Puppetserver
 */
export interface Catalog {
  certname: string;
  version: string;
  environment: string;
  transaction_uuid?: string;
  producer_timestamp?: string;
  resources: CatalogResource[];
  edges?: CatalogEdge[];
}

/**
 * Catalog edge (relationship between resources)
 */
export interface CatalogEdge {
  source: {
    type: string;
    title: string;
  };
  target: {
    type: string;
    title: string;
  };
  relationship: "contains" | "before" | "require" | "subscribe" | "notify";
}

/**
 * Parameter difference in catalog comparison
 */
export interface ParameterDiff {
  parameter: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Resource difference in catalog comparison
 */
export interface ResourceDiff {
  type: string;
  title: string;
  parameterChanges: ParameterDiff[];
}

/**
 * Catalog comparison result
 */
export interface CatalogDiff {
  environment1: string;
  environment2: string;
  added: CatalogResource[];
  removed: CatalogResource[];
  modified: ResourceDiff[];
  unchanged: CatalogResource[];
}

/**
 * Result of a bulk certificate operation
 */
export interface BulkOperationResult {
  successful: string[];
  failed: {
    certname: string;
    error: string;
  }[];
  total: number;
  successCount: number;
  failureCount: number;
}

/**
 * Puppetserver client configuration
 */
export interface PuppetserverClientConfig {
  serverUrl: string;
  port?: number;
  token?: string;
  cert?: string;
  key?: string;
  ca?: string;
  timeout?: number;
  rejectUnauthorized?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Puppetserver cache configuration
 */
export interface PuppetserverCacheConfig {
  ttl: number;
}

/**
 * Puppetserver SSL configuration
 */
export interface PuppetserverSSLConfig {
  enabled: boolean;
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized?: boolean;
}

/**
 * Puppetserver integration configuration
 */
export interface PuppetserverConfig {
  enabled: boolean;
  serverUrl: string;
  port?: number;
  token?: string;
  ssl?: PuppetserverSSLConfig;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  inactivityThreshold?: number;
  cache?: PuppetserverCacheConfig;
  circuitBreaker?: {
    threshold: number;
    timeout: number;
    resetTimeout: number;
  };
}
