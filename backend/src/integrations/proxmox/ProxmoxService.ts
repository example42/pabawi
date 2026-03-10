/**
 * Proxmox Service
 *
 * Business logic layer for the Proxmox VE integration.
 * Orchestrates API calls through ProxmoxClient and handles data transformation.
 */

import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import type { HealthStatus, NodeGroup, Action, Capability } from "../types";
import type { Node, Facts, ExecutionResult } from "../bolt/types";
import { SimpleCache } from "../../utils/caching";
import { ProxmoxClient } from "./ProxmoxClient";
import type {
  ProxmoxConfig,
  ProxmoxGuest,
  ProxmoxGuestConfig,
  ProxmoxGuestStatus,
  VMCreateParams,
  LXCCreateParams,
  ProvisioningCapability
} from "./types";
import { ProxmoxAuthenticationError } from "./types";

/**
 * ProxmoxService - Business logic layer for Proxmox integration
 *
 * Responsibilities:
 * - Orchestrate API calls through ProxmoxClient
 * - Transform Proxmox API responses to Pabawi data models
 * - Implement caching strategy for inventory, groups, and facts
 * - Handle data aggregation and grouping logic
 * - Manage provisioning operations (create/destroy VMs and containers)
 */
export class ProxmoxService {
  private client?: ProxmoxClient;
  private cache: SimpleCache;
  private logger: LoggerService;
  private performanceMonitor: PerformanceMonitorService;
  private config: ProxmoxConfig;

  /**
   * Create a new ProxmoxService instance
   *
   * @param config - Proxmox configuration
   * @param logger - Logger service instance
   * @param performanceMonitor - Performance monitor service instance
   */
  constructor(
    config: ProxmoxConfig,
    logger: LoggerService,
    performanceMonitor: PerformanceMonitorService
  ) {
    this.config = config;
    this.logger = logger;
    this.performanceMonitor = performanceMonitor;
    this.cache = new SimpleCache({ ttl: 60000 }); // Default 60s TTL

    this.logger.debug("ProxmoxService created", {
      component: "ProxmoxService",
      operation: "constructor",
    });
  }

  /**
   * Initialize the service
   *
   * Creates ProxmoxClient and authenticates with the Proxmox API.
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing ProxmoxService", {
      component: "ProxmoxService",
      operation: "initialize",
    });

    this.client = new ProxmoxClient(this.config, this.logger);
    await this.client.authenticate();

    this.logger.info("ProxmoxService initialized successfully", {
      component: "ProxmoxService",
      operation: "initialize",
    });
  }

  /**
   * Perform health check
   *
   * Queries the Proxmox API version endpoint to verify connectivity.
   * Returns healthy status if API is reachable, degraded if authentication fails,
   * and unhealthy if API is unreachable.
   *
   * @returns Health status (without lastCheck timestamp)
   */
  async healthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    if (!this.client) {
      return {
        healthy: false,
        message: "ProxmoxClient not initialized",
      };
    }

    try {
      this.logger.debug("Performing health check", {
        component: "ProxmoxService",
        operation: "healthCheck",
      });

      const version = await this.client.get("/api2/json/version");

      this.logger.info("Health check successful", {
        component: "ProxmoxService",
        operation: "healthCheck",
        metadata: { version },
      });

      return {
        healthy: true,
        message: "Proxmox API is reachable",
        details: { version },
      };
    } catch (error) {
      if (error instanceof ProxmoxAuthenticationError) {
        this.logger.warn("Health check failed: authentication error", {
          component: "ProxmoxService",
          operation: "healthCheck",
          metadata: { error: error.message },
        });

        return {
          healthy: false,
          degraded: true,
          message: "Authentication failed",
          details: { error: error.message },
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Health check failed: API unreachable",
        {
          component: "ProxmoxService",
          operation: "healthCheck",
          metadata: { error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      return {
        healthy: false,
        message: "Proxmox API is unreachable",
        details: { error: errorMessage },
      };
    }
  }

  /**
   * Get inventory of all VMs and containers
   *
   * Queries the Proxmox cluster resources endpoint for all guests (VMs and containers).
   * Results are cached for 60 seconds to reduce API load.
   *
   * @returns Array of Node objects representing all guests
   * @throws Error if client is not initialized or API call fails
   */
  async getInventory(): Promise<Node[]> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    const cacheKey = "inventory:all";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug("Returning cached inventory", {
        component: "ProxmoxService",
        operation: "getInventory",
        metadata: { nodeCount: (cached as Node[]).length },
      });
      return cached as Node[];
    }

    const complete = this.performanceMonitor.startTimer("proxmox:getInventory");

    try {
      this.logger.debug("Fetching inventory from Proxmox API", {
        component: "ProxmoxService",
        operation: "getInventory",
      });

      // Query all cluster resources (VMs and containers)
      const resources = await this.client.get(
        "/api2/json/cluster/resources?type=vm"
      );

      if (!Array.isArray(resources)) {
        throw new Error("Unexpected response format from Proxmox API");
      }

      // Transform each guest to a Node object
      const nodes = resources.map((guest) =>
        this.transformGuestToNode(guest as ProxmoxGuest)
      );

      // Cache for 60 seconds
      this.cache.set(cacheKey, nodes, 60000);

      this.logger.info("Inventory fetched successfully", {
        component: "ProxmoxService",
        operation: "getInventory",
        metadata: { nodeCount: nodes.length, cached: false },
      });

      complete({ cached: false, nodeCount: nodes.length });

      return nodes;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to fetch inventory",
        {
          component: "ProxmoxService",
          operation: "getInventory",
          metadata: { error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      complete({ error: errorMessage });
      throw error;
    }
  }

  /**
   * Transform a Proxmox guest to a Node object
   *
   * Converts Proxmox API guest data to Pabawi's Node format.
   * Node ID format: proxmox:{node}:{vmid}
   *
   * @param guest - Proxmox guest object from API
   * @returns Node object with standardized fields
   * @private
   */
  private transformGuestToNode(guest: ProxmoxGuest): Node {
    // Node ID format: proxmox:{node}:{vmid}
    const nodeId = `proxmox:${guest.node}:${guest.vmid}`;

    // Build metadata object
    const metadata: Record<string, unknown> = {
      vmid: guest.vmid,
      node: guest.node,
      type: guest.type,
      status: guest.status,
    };

    // Add optional fields if present
    if (guest.maxmem !== undefined) {
      metadata.maxmem = guest.maxmem;
    }
    if (guest.maxdisk !== undefined) {
      metadata.maxdisk = guest.maxdisk;
    }
    if (guest.cpus !== undefined) {
      metadata.cpus = guest.cpus;
    }
    if (guest.uptime !== undefined) {
      metadata.uptime = guest.uptime;
    }

    // Create Node object
    const node: Node = {
      id: nodeId,
      name: guest.name,
      uri: `proxmox://${guest.node}/${guest.vmid}`,
      transport: "ssh" as const, // Default transport, can be overridden
      config: {},
      source: "proxmox",
    };

    // Add metadata
    (node as Node & { metadata?: Record<string, unknown> }).metadata = metadata;

    // Add status if available (map to a custom field since Node doesn't have status)
    if (guest.status) {
      (node as Node & { status?: string }).status = guest.status;
    }

    this.logger.debug("Transformed guest to node", {
      component: "ProxmoxService",
      operation: "transformGuestToNode",
      metadata: { vmid: guest.vmid, nodeId },
    });

    return node;
  }

  /**
   * Get groups of VMs and containers
   *
   * Creates NodeGroup objects organized by Proxmox node, status, and type.
   * Results are cached for 60 seconds to reduce API load.
   *
   * @returns Array of NodeGroup objects
   * @throws Error if client is not initialized or API call fails
   */
  async getGroups(): Promise<NodeGroup[]> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    const cacheKey = "groups:all";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug("Returning cached groups", {
        component: "ProxmoxService",
        operation: "getGroups",
        metadata: { groupCount: (cached as NodeGroup[]).length },
      });
      return cached as NodeGroup[];
    }

    try {
      this.logger.debug("Building groups from inventory", {
        component: "ProxmoxService",
        operation: "getGroups",
      });

      // Reuse inventory data
      const inventory = await this.getInventory();
      const groups: NodeGroup[] = [];

      // Group by node
      const nodeGroups = this.groupByNode(inventory);
      groups.push(...nodeGroups);

      // Group by status
      const statusGroups = this.groupByStatus(inventory);
      groups.push(...statusGroups);

      // Group by type (VM vs LXC)
      const typeGroups = this.groupByType(inventory);
      groups.push(...typeGroups);

      // Cache for 60 seconds
      this.cache.set(cacheKey, groups, 60000);

      this.logger.info("Groups built successfully", {
        component: "ProxmoxService",
        operation: "getGroups",
        metadata: { groupCount: groups.length, cached: false },
      });

      return groups;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to build groups",
        {
          component: "ProxmoxService",
          operation: "getGroups",
          metadata: { error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      throw error;
    }
  }

  /**
   * Group nodes by Proxmox node
   *
   * Creates one NodeGroup per physical Proxmox node.
   * Group ID format: proxmox:node:{nodename}
   *
   * @param nodes - Array of Node objects from inventory
   * @returns Array of NodeGroup objects grouped by node
   * @private
   */
  private groupByNode(nodes: Node[]): NodeGroup[] {
    const nodeMap = new Map<string, Node[]>();

    // Group nodes by their Proxmox node
    for (const node of nodes) {
      const proxmoxNode = (node as Node & { metadata?: Record<string, unknown> })
        .metadata?.node as string;

      if (!proxmoxNode) {
        continue;
      }

      if (!nodeMap.has(proxmoxNode)) {
        nodeMap.set(proxmoxNode, []);
      }
      nodeMap.get(proxmoxNode)!.push(node);
    }

    // Create NodeGroup objects
    const groups: NodeGroup[] = [];
    for (const [nodeName, nodeList] of nodeMap.entries()) {
      groups.push({
        id: `proxmox:node:${nodeName}`,
        name: `Proxmox Node: ${nodeName}`,
        source: "proxmox",
        sources: ["proxmox"],
        linked: false,
        nodes: nodeList.map((n) => n.id),
        metadata: {
          description: `All guests on Proxmox node ${nodeName}`,
          nodeType: "physical",
        },
      });
    }

    this.logger.debug("Grouped nodes by Proxmox node", {
      component: "ProxmoxService",
      operation: "groupByNode",
      metadata: { groupCount: groups.length },
    });

    return groups;
  }

  /**
   * Group nodes by status
   *
   * Creates one NodeGroup per status type (running, stopped, paused).
   * Group ID format: proxmox:status:{status}
   *
   * @param nodes - Array of Node objects from inventory
   * @returns Array of NodeGroup objects grouped by status
   * @private
   */
  private groupByStatus(nodes: Node[]): NodeGroup[] {
    const statusMap = new Map<string, Node[]>();

    // Group nodes by their status
    for (const node of nodes) {
      const status = (node as Node & { status?: string }).status;

      if (!status) {
        continue;
      }

      if (!statusMap.has(status)) {
        statusMap.set(status, []);
      }
      statusMap.get(status)!.push(node);
    }

    // Create NodeGroup objects
    const groups: NodeGroup[] = [];
    for (const [status, nodeList] of statusMap.entries()) {
      groups.push({
        id: `proxmox:status:${status}`,
        name: `Status: ${status}`,
        source: "proxmox",
        sources: ["proxmox"],
        linked: false,
        nodes: nodeList.map((n) => n.id),
        metadata: {
          description: `All guests with status ${status}`,
          statusType: status,
        },
      });
    }

    this.logger.debug("Grouped nodes by status", {
      component: "ProxmoxService",
      operation: "groupByStatus",
      metadata: { groupCount: groups.length },
    });

    return groups;
  }

  /**
   * Group nodes by type
   *
   * Creates one NodeGroup per guest type (qemu for VMs, lxc for containers).
   * Group ID format: proxmox:type:{type}
   *
   * @param nodes - Array of Node objects from inventory
   * @returns Array of NodeGroup objects grouped by type
   * @private
   */
  private groupByType(nodes: Node[]): NodeGroup[] {
    const typeMap = new Map<string, Node[]>();

    // Group nodes by their type
    for (const node of nodes) {
      const type = (node as Node & { metadata?: Record<string, unknown> })
        .metadata?.type as string;

      if (!type) {
        continue;
      }

      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type)!.push(node);
    }

    // Create NodeGroup objects
    const groups: NodeGroup[] = [];
    for (const [type, nodeList] of typeMap.entries()) {
      const displayName = type === "qemu" ? "Virtual Machines" : "LXC Containers";
      groups.push({
        id: `proxmox:type:${type}`,
        name: displayName,
        source: "proxmox",
        sources: ["proxmox"],
        linked: false,
        nodes: nodeList.map((n) => n.id),
        metadata: {
          description: `All ${displayName.toLowerCase()}`,
          guestType: type,
        },
      });
    }

    this.logger.debug("Grouped nodes by type", {
      component: "ProxmoxService",
      operation: "groupByType",
      metadata: { groupCount: groups.length },
    });

    return groups;
  }

  /**
   * Get detailed facts for a specific guest
   *
   * Retrieves configuration and status information for a VM or container.
   * Results are cached for 30 seconds to reduce API load.
   *
   * Node ID format: proxmox:{node}:{vmid}
   *
   * @param nodeId - Node identifier in format proxmox:{node}:{vmid}
   * @returns Facts object with CPU, memory, disk, network config and current usage
   * @throws Error if client is not initialized, nodeId format is invalid, or guest doesn't exist
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    const cacheKey = `facts:${nodeId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug("Returning cached facts", {
        component: "ProxmoxService",
        operation: "getNodeFacts",
        metadata: { nodeId },
      });
      return cached as Facts;
    }

    try {
      this.logger.debug("Fetching facts from Proxmox API", {
        component: "ProxmoxService",
        operation: "getNodeFacts",
        metadata: { nodeId },
      });

      // Parse VMID and node name from nodeId (format: "proxmox:{node}:{vmid}")
      const vmid = this.parseVMID(nodeId);
      const node = this.parseNodeName(nodeId);

      // Determine guest type (qemu or lxc)
      const guestType = await this.getGuestType(node, vmid);

      // Fetch configuration
      const configEndpoint =
        guestType === "lxc"
          ? `/api2/json/nodes/${node}/lxc/${vmid}/config`
          : `/api2/json/nodes/${node}/qemu/${vmid}/config`;

      const config = await this.client.get(configEndpoint);

      // Fetch current status
      const statusEndpoint =
        guestType === "lxc"
          ? `/api2/json/nodes/${node}/lxc/${vmid}/status/current`
          : `/api2/json/nodes/${node}/qemu/${vmid}/status/current`;

      const status = await this.client.get(statusEndpoint);

      // Transform to Facts object
      const facts = this.transformToFacts(nodeId, config, status, guestType);

      // Cache for 30 seconds
      this.cache.set(cacheKey, facts, 30000);

      this.logger.info("Facts fetched successfully", {
        component: "ProxmoxService",
        operation: "getNodeFacts",
        metadata: { nodeId, guestType, cached: false },
      });

      return facts;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to fetch facts",
        {
          component: "ProxmoxService",
          operation: "getNodeFacts",
          metadata: { nodeId, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      throw error;
    }
  }

  /**
   * Parse VMID from nodeId
   *
   * Extracts the VMID from a nodeId in format proxmox:{node}:{vmid}
   *
   * @param nodeId - Node identifier
   * @returns VMID as number
   * @throws Error if nodeId format is invalid
   * @private
   */
  private parseVMID(nodeId: string): number {
    const parts = nodeId.split(":");
    if (parts.length !== 3 || parts[0] !== "proxmox") {
      throw new Error(
        `Invalid nodeId format: ${nodeId}. Expected format: proxmox:{node}:{vmid}`
      );
    }

    const vmid = parseInt(parts[2], 10);
    if (isNaN(vmid)) {
      throw new Error(`Invalid VMID in nodeId: ${nodeId}`);
    }

    return vmid;
  }

  /**
   * Parse node name from nodeId
   *
   * Extracts the Proxmox node name from a nodeId in format proxmox:{node}:{vmid}
   *
   * @param nodeId - Node identifier
   * @returns Proxmox node name
   * @throws Error if nodeId format is invalid
   * @private
   */
  private parseNodeName(nodeId: string): string {
    const parts = nodeId.split(":");
    if (parts.length !== 3 || parts[0] !== "proxmox") {
      throw new Error(
        `Invalid nodeId format: ${nodeId}. Expected format: proxmox:{node}:{vmid}`
      );
    }

    return parts[1];
  }

  /**
   * Determine guest type (qemu or lxc)
   *
   * Queries the cluster resources to determine if a guest is a VM (qemu) or container (lxc).
   * This is necessary because we need to know the type to construct the correct API endpoints.
   *
   * @param node - Proxmox node name
   * @param vmid - Guest VMID
   * @returns Guest type ('qemu' or 'lxc')
   * @throws Error if guest doesn't exist
   * @private
   */
  private async getGuestType(
    node: string,
    vmid: number
  ): Promise<"qemu" | "lxc"> {
    // Query cluster resources to find the guest
    const resources = await this.client!.get(
      "/api2/json/cluster/resources?type=vm"
    );

    if (!Array.isArray(resources)) {
      throw new Error("Unexpected response format from Proxmox API");
    }

    // Find the guest by node and vmid
    const guest = resources.find(
      (r: ProxmoxGuest) => r.node === node && r.vmid === vmid
    );

    if (!guest) {
      throw new Error(
        `Guest with VMID ${vmid} not found on node ${node}`
      );
    }

    return (guest as ProxmoxGuest).type;
  }

  /**
   * Transform Proxmox config and status to Facts object
   *
   * Converts Proxmox API responses to Pabawi's Facts format.
   * Includes CPU, memory, disk, and network configuration.
   * Includes current usage when guest is running.
   *
   * @param nodeId - Node identifier
   * @param config - Guest configuration from Proxmox API
   * @param status - Guest status from Proxmox API
   * @param guestType - Guest type ('qemu' or 'lxc')
   * @returns Facts object
   * @private
   */
  private transformToFacts(
    nodeId: string,
    config: unknown,
    status: unknown,
    guestType: "qemu" | "lxc"
  ): Facts {
    const configData = config as ProxmoxGuestConfig;
    const statusData = status as ProxmoxGuestStatus;

    // Extract network interfaces
    const interfaces: Record<string, unknown> = {};
    let hostname = configData.name || "unknown";

    // Parse network configuration (net0, net1, etc.)
    for (const key of Object.keys(configData)) {
      if (key.startsWith("net")) {
        interfaces[key] = configData[key];
      }
    }

    // For LXC, hostname might be in config
    if (guestType === "lxc" && configData.hostname) {
      hostname = configData.hostname as string;
    }

    // Build facts object
    const facts: Facts = {
      nodeId,
      gatheredAt: new Date().toISOString(),
      source: "proxmox",
      facts: {
        os: {
          family: guestType === "lxc" ? "linux" : "unknown",
          name: (configData.ostype as string) || "unknown",
          release: {
            full: "unknown",
            major: "unknown",
          },
        },
        processors: {
          count: configData.cores || 1,
          models: configData.cpu ? [configData.cpu as string] : [],
        },
        memory: {
          system: {
            total: this.formatBytes(configData.memory * 1024 * 1024),
            available:
              statusData.status === "running" && statusData.mem !== undefined
                ? this.formatBytes((configData.memory - statusData.mem / (1024 * 1024)) * 1024 * 1024)
                : this.formatBytes(configData.memory * 1024 * 1024),
          },
        },
        networking: {
          hostname,
          interfaces,
        },
        categories: {
          system: {
            vmid: configData.vmid,
            type: guestType,
            status: statusData.status,
            uptime: statusData.uptime,
          },
          hardware: {
            cores: configData.cores,
            sockets: configData.sockets,
            memory: configData.memory,
            cpu: configData.cpu,
          },
          network: {
            interfaces,
          },
          custom: {
            bootdisk: configData.bootdisk,
            scsihw: configData.scsihw,
          },
        },
      },
    };

    // Add current usage if guest is running
    if (statusData.status === "running") {
      facts.facts.categories!.system = {
        ...facts.facts.categories!.system,
        currentMemory: statusData.mem,
        currentMemoryFormatted: this.formatBytes(statusData.mem || 0),
        currentDisk: statusData.disk,
        currentDiskFormatted: this.formatBytes(statusData.disk || 0),
        networkIn: statusData.netin,
        networkOut: statusData.netout,
        diskRead: statusData.diskread,
        diskWrite: statusData.diskwrite,
      };
    }

    this.logger.debug("Transformed config and status to facts", {
      component: "ProxmoxService",
      operation: "transformToFacts",
      metadata: { nodeId, guestType },
    });

    return facts;
  }

  /**
   * Format bytes to human-readable string
   *
   * @param bytes - Number of bytes
   * @returns Formatted string (e.g., "1.5 GB")
   * @private
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Clear all cached data
   *
   * Useful for forcing fresh data retrieval or after provisioning operations.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug("Cache cleared", {
      component: "ProxmoxService",
      operation: "clearCache",
    });
  }

  /**
   * Execute an action on a guest
   *
   * Routes actions to appropriate handlers based on action type.
   * Supports lifecycle actions (start, stop, shutdown, reboot, suspend, resume)
   * and provisioning actions (create_vm, create_lxc, destroy_vm, destroy_lxc).
   *
   * @param action - Action to execute
   * @returns ExecutionResult with success/error details
   * @throws Error if client is not initialized or action is invalid
   */
  async executeAction(action: Action): Promise<ExecutionResult> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    this.logger.info("Executing action", {
      component: "ProxmoxService",
      operation: "executeAction",
      metadata: { action: action.action, target: action.target },
    });

    const complete = this.performanceMonitor.startTimer("proxmox:executeAction");

    try {
      let result: ExecutionResult;

      // Check if this is a provisioning action
      const provisioningActions = ["create_vm", "create_lxc", "destroy_vm", "destroy_lxc"];
      if (provisioningActions.includes(action.action)) {
        result = await this.executeProvisioningAction(action.action, action.parameters);
      } else {
        // Handle lifecycle actions
        result = await this.executeLifecycleAction(
          action.target as string,
          action.action
        );
      }

      complete({ success: result.status === "success" });
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to execute action",
        {
          component: "ProxmoxService",
          operation: "executeAction",
          metadata: { action: action.action, target: action.target, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      complete({ error: errorMessage });
      throw error;
    }
  }

  /**
   * Execute a lifecycle action on a guest
   *
   * Handles start, stop, shutdown, reboot, suspend, and resume actions.
   * Parses the target nodeId to extract node and VMID, determines guest type,
   * calls the appropriate Proxmox API endpoint, and waits for task completion.
   *
   * @param target - Target node ID in format proxmox:{node}:{vmid}
   * @param action - Action name (start, stop, shutdown, reboot, suspend, resume)
   * @returns ExecutionResult with success/error details
   * @private
   */
  private async executeLifecycleAction(
    target: string,
    action: string
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();

    try {
      // Parse target nodeId to extract node and VMID
      const vmid = this.parseVMID(target);
      const node = this.parseNodeName(target);

      this.logger.debug("Executing lifecycle action", {
        component: "ProxmoxService",
        operation: "executeLifecycleAction",
        metadata: { node, vmid, action },
      });

      // Determine guest type (qemu or lxc)
      const guestType = await this.getGuestType(node, vmid);

      // Map action to API endpoint
      let endpoint: string;
      switch (action) {
        case "start":
          endpoint = guestType === "lxc"
            ? `/api2/json/nodes/${node}/lxc/${vmid}/status/start`
            : `/api2/json/nodes/${node}/qemu/${vmid}/status/start`;
          break;
        case "stop":
          endpoint = guestType === "lxc"
            ? `/api2/json/nodes/${node}/lxc/${vmid}/status/stop`
            : `/api2/json/nodes/${node}/qemu/${vmid}/status/stop`;
          break;
        case "shutdown":
          endpoint = guestType === "lxc"
            ? `/api2/json/nodes/${node}/lxc/${vmid}/status/shutdown`
            : `/api2/json/nodes/${node}/qemu/${vmid}/status/shutdown`;
          break;
        case "reboot":
          endpoint = guestType === "lxc"
            ? `/api2/json/nodes/${node}/lxc/${vmid}/status/reboot`
            : `/api2/json/nodes/${node}/qemu/${vmid}/status/reboot`;
          break;
        case "suspend":
          if (guestType === "lxc") {
            throw new Error("Suspend action is not supported for LXC containers");
          }
          endpoint = `/api2/json/nodes/${node}/qemu/${vmid}/status/suspend`;
          break;
        case "resume":
          if (guestType === "lxc") {
            throw new Error("Resume action is not supported for LXC containers");
          }
          endpoint = `/api2/json/nodes/${node}/qemu/${vmid}/status/resume`;
          break;
        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      // Execute the action
      const taskId = await this.client!.post(endpoint, {});

      this.logger.debug("Action task started", {
        component: "ProxmoxService",
        operation: "executeLifecycleAction",
        metadata: { node, vmid, action, taskId },
      });

      // Wait for task completion
      await this.client!.waitForTask(node, taskId);

      const completedAt = new Date().toISOString();

      this.logger.info("Lifecycle action completed successfully", {
        component: "ProxmoxService",
        operation: "executeLifecycleAction",
        metadata: { node, vmid, action },
      });

      // Return ExecutionResult
      return {
        id: taskId,
        type: "task",
        targetNodes: [target],
        action,
        status: "success",
        startedAt,
        completedAt,
        results: [
          {
            nodeId: target,
            status: "success",
            output: {
              stdout: `Action ${action} completed successfully`,
            },
            duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Lifecycle action failed",
        {
          component: "ProxmoxService",
          operation: "executeLifecycleAction",
          metadata: { target, action, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      // Return ExecutionResult with error
      return {
        id: `error-${Date.now()}`,
        type: "task",
        targetNodes: [target],
        action,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        results: [
          {
            nodeId: target,
            status: "failed",
            error: errorMessage,
            duration: 0,
          },
        ],
        error: errorMessage,
      };
    }
  }

  /**
   * List capabilities supported by this integration
   *
   * Returns all lifecycle actions that can be performed on VMs and containers.
   *
   * @returns Array of Capability objects
   */
  listCapabilities(): Capability[] {
    return [
      {
        name: "start",
        description: "Start a VM or container",
        parameters: [],
      },
      {
        name: "stop",
        description: "Force stop a VM or container",
        parameters: [],
      },
      {
        name: "shutdown",
        description: "Gracefully shutdown a VM or container",
        parameters: [],
      },
      {
        name: "reboot",
        description: "Reboot a VM or container",
        parameters: [],
      },
      {
        name: "suspend",
        description: "Suspend a VM (not supported for LXC containers)",
        parameters: [],
      },
      {
        name: "resume",
        description: "Resume a suspended VM (not supported for LXC containers)",
        parameters: [],
      },
    ];
  }

  /**
   * Check if a guest exists on a node
   *
   * Queries the Proxmox API to determine if a guest with the given VMID exists.
   *
   * @param node - Node name
   * @param vmid - VM/Container ID
   * @returns True if guest exists, false otherwise
   * @private
   */
  private async guestExists(node: string, vmid: number): Promise<boolean> {
    try {
      // Try to get guest status - if it exists, this will succeed
      await this.getGuestType(node, vmid);
      return true;
    } catch (error) {
      // If guest doesn't exist, getGuestType will throw
      return false;
    }
  }

  /**
   * Create a new VM
   *
   * Creates a new virtual machine on the specified node with the given parameters.
   * Validates VMID uniqueness before creation, waits for task completion,
   * and clears inventory/groups cache after successful creation.
   *
   * @param params - VM creation parameters
   * @returns ExecutionResult with success/error details
   * @throws Error if client is not initialized
   */
  async createVM(params: VMCreateParams): Promise<ExecutionResult> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    this.logger.info("Creating VM", {
      component: "ProxmoxService",
      operation: "createVM",
      metadata: { vmid: params.vmid, node: params.node, name: params.name },
    });

    const complete = this.performanceMonitor.startTimer("proxmox:createVM");
    const startedAt = new Date().toISOString();

    try {
      // Validate VMID is unique
      const exists = await this.guestExists(params.node, params.vmid);
      if (exists) {
        const errorMessage = `VM with VMID ${params.vmid} already exists on node ${params.node}`;
        this.logger.warn(errorMessage, {
          component: "ProxmoxService",
          operation: "createVM",
          metadata: { vmid: params.vmid, node: params.node },
        });

        complete({ error: errorMessage });
        return {
          id: `error-${Date.now()}`,
          type: "task",
          targetNodes: [`proxmox:${params.node}:${params.vmid}`],
          action: "create_vm",
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          error: errorMessage,
          results: [],
        };
      }

      // Call Proxmox API to create VM
      const endpoint = `/api2/json/nodes/${params.node}/qemu`;
      const taskId = await this.client.post(endpoint, params);

      this.logger.debug("VM creation task started", {
        component: "ProxmoxService",
        operation: "createVM",
        metadata: { vmid: params.vmid, node: params.node, taskId },
      });

      // Wait for task completion
      await this.client.waitForTask(params.node, taskId);

      const completedAt = new Date().toISOString();

      // Clear inventory and groups cache
      this.cache.delete("inventory:all");
      this.cache.delete("groups:all");

      this.logger.info("VM created successfully", {
        component: "ProxmoxService",
        operation: "createVM",
        metadata: { vmid: params.vmid, node: params.node },
      });

      complete({ success: true, vmid: params.vmid });

      return {
        id: taskId,
        type: "task",
        targetNodes: [`proxmox:${params.node}:${params.vmid}`],
        action: "create_vm",
        status: "success",
        startedAt,
        completedAt,
        results: [
          {
            nodeId: `proxmox:${params.node}:${params.vmid}`,
            status: "success",
            output: {
              stdout: `VM ${params.vmid} created successfully`,
            },
            duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to create VM",
        {
          component: "ProxmoxService",
          operation: "createVM",
          metadata: { vmid: params.vmid, node: params.node, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      complete({ error: errorMessage });

      return {
        id: `error-${Date.now()}`,
        type: "task",
        targetNodes: [`proxmox:${params.node}:${params.vmid}`],
        action: "create_vm",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        error: errorMessage,
        results: [],
      };
    }
  }

  /**
   * Create a new LXC container
   *
   * Creates a new LXC container on the specified node with the given parameters.
   * Validates VMID uniqueness before creation, waits for task completion,
   * and clears inventory/groups cache after successful creation.
   *
   * @param params - LXC creation parameters
   * @returns ExecutionResult with success/error details
   * @throws Error if client is not initialized
   */
  async createLXC(params: LXCCreateParams): Promise<ExecutionResult> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    this.logger.info("Creating LXC container", {
      component: "ProxmoxService",
      operation: "createLXC",
      metadata: { vmid: params.vmid, node: params.node, hostname: params.hostname },
    });

    const complete = this.performanceMonitor.startTimer("proxmox:createLXC");
    const startedAt = new Date().toISOString();

    try {
      // Validate VMID is unique
      const exists = await this.guestExists(params.node, params.vmid);
      if (exists) {
        const errorMessage = `Container with VMID ${params.vmid} already exists on node ${params.node}`;
        this.logger.warn(errorMessage, {
          component: "ProxmoxService",
          operation: "createLXC",
          metadata: { vmid: params.vmid, node: params.node },
        });

        complete({ error: errorMessage });
        return {
          id: `error-${Date.now()}`,
          type: "task",
          targetNodes: [`proxmox:${params.node}:${params.vmid}`],
          action: "create_lxc",
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          error: errorMessage,
          results: [],
        };
      }

      // Call Proxmox API to create LXC
      const endpoint = `/api2/json/nodes/${params.node}/lxc`;
      const taskId = await this.client.post(endpoint, params);

      this.logger.debug("LXC creation task started", {
        component: "ProxmoxService",
        operation: "createLXC",
        metadata: { vmid: params.vmid, node: params.node, taskId },
      });

      // Wait for task completion
      await this.client.waitForTask(params.node, taskId);

      const completedAt = new Date().toISOString();

      // Clear inventory and groups cache
      this.cache.delete("inventory:all");
      this.cache.delete("groups:all");

      this.logger.info("LXC container created successfully", {
        component: "ProxmoxService",
        operation: "createLXC",
        metadata: { vmid: params.vmid, node: params.node },
      });

      complete({ success: true, vmid: params.vmid });

      return {
        id: taskId,
        type: "task",
        targetNodes: [`proxmox:${params.node}:${params.vmid}`],
        action: "create_lxc",
        status: "success",
        startedAt,
        completedAt,
        results: [
          {
            nodeId: `proxmox:${params.node}:${params.vmid}`,
            status: "success",
            output: {
              stdout: `Container ${params.vmid} created successfully`,
            },
            duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to create LXC container",
        {
          component: "ProxmoxService",
          operation: "createLXC",
          metadata: { vmid: params.vmid, node: params.node, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      complete({ error: errorMessage });

      return {
        id: `error-${Date.now()}`,
        type: "task",
        targetNodes: [`proxmox:${params.node}:${params.vmid}`],
        action: "create_lxc",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        error: errorMessage,
        results: [],
      };
    }
  }

  /**
   * Destroy a guest (VM or LXC container)
   *
   * Destroys a guest by first stopping it if running, then deleting it.
   * Clears all related caches (inventory, groups, facts) after successful deletion.
   *
   * @param node - Node name
   * @param vmid - VM/Container ID
   * @returns ExecutionResult with success/error details
   * @throws Error if client is not initialized
   */
  async destroyGuest(node: string, vmid: number): Promise<ExecutionResult> {
    if (!this.client) {
      throw new Error("ProxmoxClient not initialized");
    }

    this.logger.info("Destroying guest", {
      component: "ProxmoxService",
      operation: "destroyGuest",
      metadata: { node, vmid },
    });

    const complete = this.performanceMonitor.startTimer("proxmox:destroyGuest");
    const startedAt = new Date().toISOString();
    const nodeId = `proxmox:${node}:${vmid}`;

    try {
      // Check if guest exists
      const exists = await this.guestExists(node, vmid);
      if (!exists) {
        const errorMessage = `Guest ${vmid} not found on node ${node}`;
        this.logger.warn(errorMessage, {
          component: "ProxmoxService",
          operation: "destroyGuest",
          metadata: { node, vmid },
        });

        complete({ error: errorMessage });
        return {
          id: `error-${Date.now()}`,
          type: "task",
          targetNodes: [nodeId],
          action: "destroy_guest",
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          error: errorMessage,
          results: [],
        };
      }

      // Determine guest type
      const guestType = await this.getGuestType(node, vmid);

      // Check if guest is running and stop it first
      const statusEndpoint = guestType === "lxc"
        ? `/api2/json/nodes/${node}/lxc/${vmid}/status/current`
        : `/api2/json/nodes/${node}/qemu/${vmid}/status/current`;

      const status = await this.client.get(statusEndpoint) as ProxmoxGuestStatus;

      if (status.status === "running") {
        this.logger.debug("Stopping guest before deletion", {
          component: "ProxmoxService",
          operation: "destroyGuest",
          metadata: { node, vmid, guestType },
        });

        const stopEndpoint = guestType === "lxc"
          ? `/api2/json/nodes/${node}/lxc/${vmid}/status/stop`
          : `/api2/json/nodes/${node}/qemu/${vmid}/status/stop`;

        const stopTaskId = await this.client.post(stopEndpoint, {});
        await this.client.waitForTask(node, stopTaskId);

        this.logger.debug("Guest stopped successfully", {
          component: "ProxmoxService",
          operation: "destroyGuest",
          metadata: { node, vmid },
        });
      }

      // Delete guest
      const deleteEndpoint = guestType === "lxc"
        ? `/api2/json/nodes/${node}/lxc/${vmid}`
        : `/api2/json/nodes/${node}/qemu/${vmid}`;

      const deleteTaskId = await this.client.delete(deleteEndpoint);
      await this.client.waitForTask(node, deleteTaskId);

      const completedAt = new Date().toISOString();

      // Clear all related caches
      this.cache.delete("inventory:all");
      this.cache.delete("groups:all");
      this.cache.delete(`facts:${nodeId}`);

      this.logger.info("Guest destroyed successfully", {
        component: "ProxmoxService",
        operation: "destroyGuest",
        metadata: { node, vmid },
      });

      complete({ success: true });

      return {
        id: deleteTaskId,
        type: "task",
        targetNodes: [nodeId],
        action: "destroy_guest",
        status: "success",
        startedAt,
        completedAt,
        results: [
          {
            nodeId,
            status: "success",
            output: {
              stdout: `Guest ${vmid} destroyed successfully`,
            },
            duration: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Failed to destroy guest",
        {
          component: "ProxmoxService",
          operation: "destroyGuest",
          metadata: { node, vmid, error: errorMessage },
        },
        error instanceof Error ? error : undefined
      );

      complete({ error: errorMessage });

      return {
        id: `error-${Date.now()}`,
        type: "task",
        targetNodes: [nodeId],
        action: "destroy_guest",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        error: errorMessage,
        results: [],
      };
    }
  }

  /**
   * Execute a provisioning action
   *
   * Routes provisioning actions (create_vm, create_lxc, destroy_vm, destroy_lxc)
   * to the appropriate handler methods.
   *
   * @param action - Action name
   * @param params - Action parameters
   * @returns ExecutionResult with success/error details
   * @private
   */
  private async executeProvisioningAction(
    action: string,
    params: unknown
  ): Promise<ExecutionResult> {
    switch (action) {
      case "create_vm":
        return await this.createVM(params as VMCreateParams);
      case "create_lxc":
        return await this.createLXC(params as LXCCreateParams);
      case "destroy_vm":
      case "destroy_lxc": {
        const destroyParams = params as { node: string; vmid: number };
        if (!destroyParams.node || !destroyParams.vmid) {
          throw new Error("destroy action requires node and vmid parameters");
        }
        return await this.destroyGuest(destroyParams.node, destroyParams.vmid);
      }
      default:
        throw new Error(`Unsupported provisioning action: ${action}`);
    }
  }

  /**
   * List provisioning capabilities
   *
   * Returns all provisioning capabilities supported by this integration,
   * including VM and LXC creation and destruction.
   *
   * @returns Array of ProvisioningCapability objects
   */
  listProvisioningCapabilities(): ProvisioningCapability[] {
    return [
      {
        name: "create_vm",
        description: "Create a new virtual machine",
        operation: "create",
        parameters: [
          { name: "vmid", type: "number", required: true },
          { name: "name", type: "string", required: true },
          { name: "node", type: "string", required: true },
          { name: "cores", type: "number", required: false, default: 1 },
          { name: "memory", type: "number", required: false, default: 512 },
          { name: "disk", type: "string", required: false },
          { name: "network", type: "object", required: false },
        ],
      },
      {
        name: "create_lxc",
        description: "Create a new LXC container",
        operation: "create",
        parameters: [
          { name: "vmid", type: "number", required: true },
          { name: "hostname", type: "string", required: true },
          { name: "node", type: "string", required: true },
          { name: "ostemplate", type: "string", required: true },
          { name: "cores", type: "number", required: false, default: 1 },
          { name: "memory", type: "number", required: false, default: 512 },
          { name: "rootfs", type: "string", required: false },
          { name: "network", type: "object", required: false },
        ],
      },
      {
        name: "destroy_vm",
        description: "Destroy a virtual machine",
        operation: "destroy",
        parameters: [
          { name: "vmid", type: "number", required: true },
          { name: "node", type: "string", required: true },
        ],
      },
      {
        name: "destroy_lxc",
        description: "Destroy an LXC container",
        operation: "destroy",
        parameters: [
          { name: "vmid", type: "number", required: true },
          { name: "node", type: "string", required: true },
        ],
      },
    ];
  }


}
