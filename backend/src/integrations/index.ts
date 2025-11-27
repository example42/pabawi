/**
 * Integration Plugin System
 *
 * This module provides the plugin architecture for integrating multiple
 * backend systems into Padawi. It exports the core interfaces, base classes,
 * and types needed to create and manage integration plugins.
 *
 * @module integrations
 */

// Export all types and interfaces
export type {
  IntegrationPlugin,
  ExecutionToolPlugin,
  InformationSourcePlugin,
  IntegrationConfig,
  HealthStatus,
  Capability,
  CapabilityParameter,
  Action,
  PluginRegistration,
} from './types';

// Export base plugin class
export { BasePlugin } from './BasePlugin';

// Export integration manager
export { IntegrationManager } from './IntegrationManager';
export type { AggregatedInventory, AggregatedNodeData } from './IntegrationManager';

// Export integration plugins
export { BoltPlugin } from './bolt';
