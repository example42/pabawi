/**
 * Integration Plugin Types and Interfaces
 *
 * This module defines the core plugin architecture for integrating multiple
 * backend systems (execution tools and information sources) into Pabawi.
 */

import type { Node, Facts, ExecutionResult } from "./bolt/types";

/**
 * Health status for an integration
 */
export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: string;
  details?: Record<string, unknown>;
  /**
   * Degraded indicates partial functionality
   * When true, some features work but others fail (e.g., auth issues)
   */
  degraded?: boolean;
  /**
   * List of working capabilities when degraded
   */
  workingCapabilities?: string[];
  /**
   * List of failing capabilities when degraded
   */
  failingCapabilities?: string[];
}

/**
 * Configuration for an integration plugin
 */
export interface IntegrationConfig {
  enabled: boolean;
  name: string;
  type: "execution" | "information" | "both";
  config: Record<string, unknown>;
  priority?: number; // For ordering when multiple sources provide same data
}

/**
 * Capability that an execution tool can perform
 */
export interface Capability {
  name: string;
  description: string;
  parameters?: CapabilityParameter[];
}

/**
 * Parameter definition for a capability
 */
export interface CapabilityParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description?: string;
  default?: unknown;
}

/**
 * Action to be executed by an execution tool
 */
export interface Action {
  type: "command" | "task" | "plan" | "script";
  target: string | string[];
  action: string;
  parameters?: Record<string, unknown>;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all integration plugins
 */
export interface IntegrationPlugin {
  /** Unique name of the integration */
  name: string;

  /** Type of integration */
  type: "execution" | "information" | "both";

  /**
   * Initialize the plugin with configuration
   * @param config - Integration configuration
   */
  initialize(config: IntegrationConfig): Promise<void>;

  /**
   * Check the health status of the integration
   * @returns Health status information
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Get the current configuration
   * @returns Current integration configuration
   */
  getConfig(): IntegrationConfig;

  /**
   * Check if the plugin is initialized and ready
   * @returns true if initialized, false otherwise
   */
  isInitialized(): boolean;
}

/**
 * Interface for execution tool plugins (e.g., Bolt, Ansible)
 */
export interface ExecutionToolPlugin extends IntegrationPlugin {
  type: "execution" | "both";

  /**
   * Execute an action on target nodes
   * @param action - Action to execute
   * @returns Execution result
   */
  executeAction(action: Action): Promise<ExecutionResult>;

  /**
   * List capabilities supported by this execution tool
   * @returns Array of capabilities
   */
  listCapabilities(): Capability[];
}

/**
 * Interface for information source plugins (e.g., PuppetDB, cloud APIs)
 */
export interface InformationSourcePlugin extends IntegrationPlugin {
  type: "information" | "both";

  /**
   * Get inventory of nodes from this source
   * @returns Array of nodes
   */
  getInventory(): Promise<Node[]>;

  /**
   * Get facts for a specific node
   * @param nodeId - Node identifier
   * @returns Facts for the node
   */
  getNodeFacts(nodeId: string): Promise<Facts>;

  /**
   * Get arbitrary data for a node
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve (e.g., 'reports', 'catalog', 'events')
   * @returns Data of the requested type
   */
  getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}

/**
 * Plugin registration information
 */
export interface PluginRegistration {
  plugin: IntegrationPlugin;
  config: IntegrationConfig;
  registeredAt: string;
}
