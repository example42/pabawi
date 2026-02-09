"use strict";
/**
 * Integration Plugin Types and Interfaces
 *
 * This module defines the core plugin architecture for integrating multiple
 * backend systems (execution tools and information sources) into Pabawi.
 *
 * v1.0.0 Architecture:
 * - Capability-based interface replacing type-based plugin categories
 * - Full-stack plugins: backend capabilities + frontend widgets + CLI commands
 * - RBAC integration with permission-aware capability execution
 * - Plugin metadata for versioning, dependencies, and discovery
 *
 * @module integrations/types
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationType = void 0;
// =============================================================================
// v1.0.0 TYPES - New Plugin Architecture
// =============================================================================
/**
 * Integration types categorizing plugin functionality
 * Used for UI organization, menu grouping, and capability discovery
 *
 * Every integration type can potentially write entries to the Node Journal.
 * Journal logging is configurable per-plugin (when/what to write and logging level).
 */
var IntegrationType;
(function (IntegrationType) {
    /** Inventory and node discovery sources */
    IntegrationType["InventorySource"] = "InventorySource";
    /** Remote command/task execution (Bolt, Ansible, SSH) */
    IntegrationType["RemoteExecution"] = "RemoteExecution";
    /** Information retrieval (PuppetDB facts, inventory data, node metadata) */
    IntegrationType["Info"] = "Info";
    /** Configuration management (Puppet, Ansible, Chef) */
    IntegrationType["ConfigurationManagement"] = "ConfigurationManagement";
    /** Events that happened on systems (alerts, changes, incidents) */
    IntegrationType["Event"] = "Event";
    /** Monitoring and metrics collection */
    IntegrationType["Monitoring"] = "Monitoring";
    /** Infrastructure provisioning (Terraform, CloudFormation) */
    IntegrationType["Provisioning"] = "Provisioning";
    /** Application deployment automation */
    IntegrationType["Deployment"] = "Deployment";
    /** Secret and credential management */
    IntegrationType["SecretManagement"] = "SecretManagement"; // pragma: allowlist secret
    /** Scheduled operations and jobs */
    IntegrationType["Schedule"] = "Schedule";
    /** Software installation via package managers */
    IntegrationType["SoftwareInstall"] = "SoftwareInstall";
    /** Workflow orchestration */
    IntegrationType["Orchestration"] = "Orchestration";
    /** Logging and analytics */
    IntegrationType["Logging"] = "Logging";
    /** Audit and compliance */
    IntegrationType["AuditCompliance"] = "AuditCompliance";
    /** Backup and recovery */
    IntegrationType["BackupRecovery"] = "BackupRecovery";
})(IntegrationType || (exports.IntegrationType = IntegrationType = {}));
//# sourceMappingURL=types.js.map
