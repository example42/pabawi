/**
 * Capability Types Index
 *
 * Central export point for all standardized capability type interfaces.
 * These interfaces define the contracts that plugins must implement for each capability type.
 *
 * @module integrations/capability-types
 */

// =============================================================================
// Inventory Capability
// =============================================================================
export {
  // Interfaces
  type InventoryCapability,
  // Schemas
  InventoryListParamsSchema,
  InventoryGetParamsSchema,
  InventoryGroupsParamsSchema,
  InventoryFilterParamsSchema,
  // Types
  type InventoryListParams,
  type InventoryGetParams,
  type InventoryGroupsParams,
  type InventoryFilterParams,
  // Type Guards
  hasInventoryCapability,
} from "./inventory";

// =============================================================================
// Facts Capability
// =============================================================================
export {
  // Interfaces
  type FactsCapability,
  type FactProvider,
  type FactProviderRegistry,
  // Schemas
  FactsGetParamsSchema,
  FactsRefreshParamsSchema,
  // Types
  type FactsGetParams,
  type FactsRefreshParams,
  // Type Guards
  hasFactsCapability,
} from "./facts";

// =============================================================================
// Remote Execution Capability
// =============================================================================
export {
  // Interfaces
  type RemoteExecutionCapability,
  // Schemas
  CommandExecuteParamsSchema,
  TaskExecuteParamsSchema,
  ScriptExecuteParamsSchema,
  // Types
  type CommandExecuteParams,
  type TaskExecuteParams,
  type ScriptExecuteParams,
  type OutputChunk,
  type OutputStreamCallback,
  // Type Guards
  hasRemoteExecutionCapability,
} from "./remote-execution";

// =============================================================================
// Reports Capability
// =============================================================================
export {
  // Interfaces
  type ReportsCapability,
  // Schemas
  ReportsListParamsSchema,
  ReportsGetParamsSchema,
  ReportsQueryParamsSchema,
  // Types
  type ReportsListParams,
  type ReportsGetParams,
  type ReportsQueryParams,
  type Report,
  type ReportStatus,
  type ReportResourceChange,
  type ReportMetrics,
  type ReportListResult,
  // Type Guards
  hasReportsCapability,
} from "./reports";

// =============================================================================
// Events Capability
// =============================================================================
export {
  // Interfaces
  type EventsCapability,
  // Schemas
  EventsListParamsSchema,
  EventsStreamParamsSchema,
  EventsQueryParamsSchema,
  // Types
  type EventsListParams,
  type EventsStreamParams,
  type EventsQueryParams,
  type Event,
  type EventStatus,
  type EventListResult,
  type EventStreamCallback,
  // Type Guards
  hasEventsCapability,
} from "./events";

// =============================================================================
// Provisioning Capability (Future)
// =============================================================================
export {
  // Interfaces
  type ProvisioningCapability,
  // Schemas
  ProvisionCreateParamsSchema,
  ProvisionStatusParamsSchema,
  ProvisionListParamsSchema,
  DecommissionExecuteParamsSchema,
  DecommissionStatusParamsSchema,
  // Types
  type ProvisionCreateParams,
  type ProvisionStatusParams,
  type ProvisionListParams,
  type DecommissionExecuteParams,
  type DecommissionStatusParams,
  type ProvisioningStatus,
  type ResourceStatus,
  type ProvisioningResult,
  type ProvisionedResource,
  type DecommissioningResult,
  // Type Guards
  hasProvisioningCapability,
} from "./provisioning";

// =============================================================================
// Software Installation Capability (Future)
// =============================================================================
export {
  // Interfaces
  type SoftwareInstallationCapability,
  // Schemas
  PackageInstallParamsSchema,
  PackageUninstallParamsSchema,
  PackageUpdateParamsSchema,
  PackageListParamsSchema,
  PackageSearchParamsSchema,
  // Types
  type PackageInstallParams,
  type PackageUninstallParams,
  type PackageUpdateParams,
  type PackageListParams,
  type PackageSearchParams,
  type PackageStatus,
  type PackageInfo,
  type PackageNodeResult,
  type PackageOperationResult,
  type AvailablePackage,
  // Type Guards
  hasSoftwareInstallationCapability,
} from "./software-installation";

// =============================================================================
// Deployment Capability (Future)
// =============================================================================
export {
  // Interfaces
  type DeploymentCapability,
  // Schemas
  DeployExecuteParamsSchema,
  DeployStatusParamsSchema,
  DeployRollbackParamsSchema,
  DeployHistoryParamsSchema,
  // Types
  type DeployExecuteParams,
  type DeployStatusParams,
  type DeployRollbackParams,
  type DeployHistoryParams,
  type DeploymentStatus,
  type DeploymentResult,
  type DeploymentHistoryEntry,
  type DeploymentHistoryResult,
  // Type Guards
  hasDeploymentCapability,
} from "./deployment";

// =============================================================================
// Alert Capability (Future)
// =============================================================================
export {
  // Interfaces
  type AlertCapability,
  // Schemas
  AlertListParamsSchema,
  AlertGetParamsSchema,
  AlertAcknowledgeParamsSchema,
  AlertResolveParamsSchema,
  AlertSubscribeParamsSchema,
  // Types
  type AlertListParams,
  type AlertGetParams,
  type AlertAcknowledgeParams,
  type AlertResolveParams,
  type AlertSubscribeParams,
  type AlertSeverity,
  type AlertStatus,
  type Alert,
  type AlertListResult,
  type AlertAcknowledgmentResult,
  type AlertResolutionResult,
  type AlertNotificationCallback,
  // Type Guards
  hasAlertCapability,
} from "./alerts";
