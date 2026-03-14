/**
 * Proxmox Integration Plugin
 *
 * Plugin class that integrates Proxmox Virtual Environment into Pabawi.
 * Implements both InformationSourcePlugin and ExecutionToolPlugin interfaces.
 */

import { BasePlugin } from "../BasePlugin";
import type {
  HealthStatus,
  InformationSourcePlugin,
  ExecutionToolPlugin,
  NodeGroup,
  Capability,
  Action,
} from "../types";
import type { Node, Facts, ExecutionResult } from "../bolt/types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import { ProxmoxService } from "./ProxmoxService";
import type { ProxmoxConfig, ProvisioningCapability } from "./types";

/**
 * ProxmoxIntegration - Plugin for Proxmox Virtual Environment
 *
 * Provides:
 * - Inventory discovery of VMs and containers
 * - Group management (by node, status, type)
 * - Facts retrieval for guests
 * - Lifecycle actions (start, stop, shutdown, reboot, suspend, resume)
 * - Provisioning capabilities (create/destroy VMs and containers)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1-2.6, 4.1, 16.1-16.6
 */
export class ProxmoxIntegration
  extends BasePlugin
  implements InformationSourcePlugin, ExecutionToolPlugin
{
  type = "both" as const;
  private service?: ProxmoxService;

  /**
   * Create a new ProxmoxIntegration instance
   *
   * @param logger - Logger service instance (optional)
   * @param performanceMonitor - Performance monitor service instance (optional)
   */
  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService
  ) {
    super("proxmox", "both", logger, performanceMonitor);

    this.logger.debug("ProxmoxIntegration created", {
      component: "ProxmoxIntegration",
      operation: "constructor",
    });
  }

  /**
   * Perform plugin-specific initialization
   *
   * Validates Proxmox configuration and initializes ProxmoxService.
   * Logs security warning if SSL certificate verification is disabled.
   *
   * Validates: Requirements 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 16.1-16.6
   *
   * @throws Error if configuration is invalid
   */
  protected async performInitialization(): Promise<void> {
    this.logger.info("Initializing Proxmox integration", {
      component: "ProxmoxIntegration",
      operation: "performInitialization",
    });

    // Extract and validate Proxmox configuration
    const config = this.config.config as unknown as ProxmoxConfig;
    this.validateProxmoxConfig(config);

    // Initialize service with configuration
    this.service = new ProxmoxService(
      config,
      this.logger,
      this.performanceMonitor
    );
    await this.service.initialize();

    this.logger.info("Proxmox integration initialized successfully", {
      component: "ProxmoxIntegration",
      operation: "performInitialization",
    });
  }

  /**
   * Validate Proxmox configuration
   *
   * Validates:
   * - Host is a valid hostname or IP address
   * - Port is in valid range (1-65535)
   * - Either password or token authentication is configured
   * - Realm is provided for password authentication
   * - Logs security warning if SSL verification is disabled
   *
   * Validates: Requirements 2.3, 2.4, 2.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
   *
   * @param config - Proxmox configuration to validate
   * @throws Error if configuration is invalid
   * @private
   */
  private validateProxmoxConfig(config: ProxmoxConfig): void {
    this.logger.debug("Validating Proxmox configuration", {
      component: "ProxmoxIntegration",
      operation: "validateProxmoxConfig",
    });

    // Validate host (hostname or IP)
    if (!config.host || typeof config.host !== "string") {
      throw new Error("Proxmox configuration must include a valid host");
    }

    // Validate port range
    if (config.port !== undefined) {
      if (typeof config.port !== "number" || config.port < 1 || config.port > 65535) {
        throw new Error("Proxmox port must be between 1 and 65535");
      }
    }

    // Validate authentication - either token or password must be provided
    if (!config.token && !config.password) {
      throw new Error(
        "Proxmox configuration must include either token or password authentication"
      );
    }

    // Validate realm for password authentication
    if (config.password && !config.realm) {
      throw new Error(
        "Proxmox password authentication requires a realm"
      );
    }

    // Log security warning if cert verification disabled
    if (config.ssl?.rejectUnauthorized === false) {
      this.logger.warn(
        "TLS certificate verification is disabled - this is insecure",
        {
          component: "ProxmoxIntegration",
          operation: "validateProxmoxConfig",
        }
      );
    }

    this.logger.debug("Proxmox configuration validated successfully", {
      component: "ProxmoxIntegration",
      operation: "validateProxmoxConfig",
    });
  }

  /**
   * Perform plugin-specific health check
   *
   * Delegates to ProxmoxService to check API connectivity.
   * Returns healthy if API is reachable, degraded if authentication fails,
   * and unhealthy if API is unreachable.
   *
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   *
   * @returns Health status (without lastCheck timestamp)
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    if (!this.service) {
      return {
        healthy: false,
        message: "ProxmoxService not initialized",
      };
    }

    return await this.service.healthCheck();
  }

  // ========================================
  // InformationSourcePlugin Interface Methods
  // ========================================

  /**
   * Get inventory of all VMs and containers
   *
   * Delegates to ProxmoxService to retrieve all guests from the Proxmox cluster.
   * Results are cached for 60 seconds to reduce API load.
   *
   * Validates: Requirements 5.1-5.7
   *
   * @returns Array of Node objects representing all guests
   * @throws Error if service is not initialized or API call fails
   */
  async getInventory(): Promise<Node[]> {
    this.ensureInitialized();
    return await this.service!.getInventory();
  }

  /**
   * Get groups of VMs and containers
   *
   * Delegates to ProxmoxService to create NodeGroup objects organized by
   * Proxmox node, status, and type. Results are cached for 60 seconds.
   *
   * Validates: Requirements 6.1-6.7
   *
   * @returns Array of NodeGroup objects
   * @throws Error if service is not initialized or API call fails
   */
  async getGroups(): Promise<NodeGroup[]> {
    this.ensureInitialized();
    return await this.service!.getGroups();
  }

  /**
   * Get detailed facts for a specific guest
   *
   * Delegates to ProxmoxService to retrieve configuration and status information
   * for a VM or container. Results are cached for 30 seconds.
   *
   * Validates: Requirements 7.1-7.7
   *
   * @param nodeId - Node identifier in format proxmox:{node}:{vmid}
   * @returns Facts object with CPU, memory, disk, network config and current usage
   * @throws Error if service is not initialized, nodeId format is invalid, or guest doesn't exist
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    this.ensureInitialized();
    return await this.service!.getNodeFacts(nodeId);
  }

  /**
   * Get arbitrary data for a node
   *
   * Proxmox integration does not support additional data types beyond facts.
   * This method returns null for all data type requests.
   *
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve
   * @returns null (no additional data types supported)
   */
  async getNodeData(_nodeId: string, _dataType: string): Promise<unknown> {
    this.ensureInitialized();

    // Proxmox integration doesn't support additional data types beyond facts
    // Return null to indicate no data available for the requested type
    return null;
  }

  // ========================================
  // ExecutionToolPlugin Interface Methods
  // ========================================

  /**
   * Execute an action on a guest or provision new infrastructure
   *
   * Delegates to ProxmoxService to execute lifecycle actions (start, stop, shutdown,
   * reboot, suspend, resume) or provisioning actions (create_vm, create_lxc,
   * destroy_vm, destroy_lxc).
   *
   * Validates: Requirements 8.1-8.10, 9.3, 9.4, 10.1-10.7, 11.1-11.7, 12.1-12.7
   *
   * @param action - Action to execute
   * @returns ExecutionResult with success/error details
   * @throws Error if service is not initialized or action is invalid
   */
  async executeAction(action: Action): Promise<ExecutionResult> {
    this.ensureInitialized();
    return await this.service!.executeAction(action);
  }

  /**
   * List lifecycle action capabilities
   *
   * Returns all lifecycle actions that can be performed on VMs and containers.
   *
   * Validates: Requirements 8.1, 8.2
   *
   * @returns Array of Capability objects
   */
  listCapabilities(): Capability[] {
    this.ensureInitialized();
    return this.service!.listCapabilities();
  }

  /**
   * List provisioning capabilities
   *
   * Returns all provisioning capabilities supported by this integration,
   * including VM and LXC creation and destruction.
   *
   * Validates: Requirements 9.3, 9.4
   *
   * @returns Array of ProvisioningCapability objects
   */
  listProvisioningCapabilities(): ProvisioningCapability[] {
    this.ensureInitialized();
    return this.service!.listProvisioningCapabilities();
  }

  /**
   * Get list of PVE nodes in the cluster
   */
  async getNodes(): Promise<{ node: string; status: string; maxcpu?: number; maxmem?: number }[]> {
    this.ensureInitialized();
    return this.service!.getNodes();
  }

  /**
   * Get the next available VMID
   */
  async getNextVMID(): Promise<number> {
    this.ensureInitialized();
    return this.service!.getNextVMID();
  }

  /**
   * Get ISO images available on a node
   */
  async getISOImages(node: string, storage?: string): Promise<{ volid: string; format: string; size: number }[]> {
    this.ensureInitialized();
    return this.service!.getISOImages(node, storage);
  }

  /**
   * Get OS templates available on a node
   */
  async getTemplates(node: string, storage?: string): Promise<{ volid: string; format: string; size: number }[]> {
    this.ensureInitialized();
    return this.service!.getTemplates(node, storage);
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Ensure the plugin is initialized
   *
   * @throws Error if plugin is not initialized
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.service) {
      throw new Error("Proxmox integration is not initialized");
    }
  }
}
