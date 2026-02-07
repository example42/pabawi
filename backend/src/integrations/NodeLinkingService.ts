/**
 * Node Linking Service
 *
 * Service for linking nodes across multiple information sources based on matching identifiers.
 * Implements the node linking strategy described in the design document.
 *
 * @module integrations/NodeLinkingService
 * @version 1.0.0
 */

import type { Node } from "./types";
import type { IntegrationManager } from "./IntegrationManager";
import { LoggerService } from "../services/LoggerService";
import type { User } from "./CapabilityRegistry";

/**
 * Linked node with source attribution
 */
export interface LinkedNode extends Node {
  sources: string[]; // List of sources this node appears in
  linked: boolean; // True if node exists in multiple sources
  certificateStatus?: "signed" | "requested" | "revoked";
  lastCheckIn?: string;
}

/**
 * Aggregated data for a linked node from all sources
 */
export interface LinkedNodeData {
  node: LinkedNode;
  dataBySource: Record<string, Record<string, unknown>>;
}

/**
 * Node Linking Service
 *
 * Links nodes from multiple sources based on matching identifiers (certname, hostname, etc.)
 * Uses capability-based routing via CapabilityRegistry for v1.0.0 architecture.
 */
export class NodeLinkingService {
  private logger: LoggerService;

  constructor(private integrationManager: IntegrationManager) {
    this.logger = new LoggerService();
  }

  /**
   * Link nodes from multiple sources based on matching identifiers
   *
   * @param nodes - Nodes from all sources
   * @returns Linked nodes with source attribution
   */
  linkNodes(nodes: Node[]): LinkedNode[] {
    // First, group nodes by their identifiers
    const identifierToNodes = new Map<string, Node[]>();

    for (const node of nodes) {
      const identifiers = this.extractIdentifiers(node);

      // Add node to all matching identifier groups
      for (const identifier of identifiers) {
        const group = identifierToNodes.get(identifier) ?? [];
        group.push(node);
        identifierToNodes.set(identifier, group);
      }
    }

    // Now merge nodes that share any identifier
    const processedNodes = new Set<Node>();
    const linkedNodes: LinkedNode[] = [];

    for (const node of nodes) {
      if (processedNodes.has(node)) continue;

      // Find all nodes that share any identifier with this node
      const identifiers = this.extractIdentifiers(node);
      const relatedNodes = new Set<Node>();
      relatedNodes.add(node);

      // Collect all nodes that share any identifier
      for (const identifier of identifiers) {
        const group = identifierToNodes.get(identifier) ?? [];
        for (const relatedNode of group) {
          relatedNodes.add(relatedNode);
        }
      }

      // Create linked node from all related nodes
      const linkedNode: LinkedNode = {
        ...node,
        sources: [],
        linked: false,
      };

      // Merge data from all related nodes
      for (const relatedNode of relatedNodes) {
        processedNodes.add(relatedNode);

        const nodeSource =
          (relatedNode as Node & { source?: string }).source ?? "unknown";

        if (!linkedNode.sources.includes(nodeSource)) {
          linkedNode.sources.push(nodeSource);
        }

        // Merge certificate status from any source that provides it
        const nodeWithCert = relatedNode as Node & {
          certificateStatus?: "signed" | "requested" | "revoked";
        };
        if (nodeWithCert.certificateStatus) {
          // Only update if not already set, or if current source has a more specific status
          if (!linkedNode.certificateStatus) {
            linkedNode.certificateStatus = nodeWithCert.certificateStatus;
          }
        }

        // Merge last check-in (use most recent)
        const nodeWithCheckIn = relatedNode as Node & { lastCheckIn?: string };
        if (nodeWithCheckIn.lastCheckIn) {
          if (
            !linkedNode.lastCheckIn ||
            new Date(nodeWithCheckIn.lastCheckIn) >
              new Date(linkedNode.lastCheckIn)
          ) {
            linkedNode.lastCheckIn = nodeWithCheckIn.lastCheckIn;
          }
        }
      }

      // Mark as linked if from multiple sources
      linkedNode.linked = linkedNode.sources.length > 1;

      linkedNodes.push(linkedNode);
    }

    return linkedNodes;
  }

  /**
   * Get all data for a linked node from all sources
   *
   * Uses capability-based routing to fetch data from all plugins that provide
   * the relevant capabilities (info.facts, reports.list, etc.)
   *
   * @param nodeId - Node identifier
   * @returns Aggregated node data from all linked sources
   */
  async getLinkedNodeData(nodeId: string): Promise<LinkedNodeData> {
    // Get all nodes to find matching ones
    const aggregated = await this.integrationManager.getAggregatedInventory();
    const linkedNodes = this.linkNodes(aggregated.nodes);

    // Find the linked node
    const linkedNode = linkedNodes.find(
      (n) => n.id === nodeId || n.name === nodeId,
    );

    if (!linkedNode) {
      throw new Error(`Node '${nodeId}' not found in any source`);
    }

    // Fetch data from all sources using capability-based routing
    const dataBySource: LinkedNodeData["dataBySource"] = {};

    // Create a system user for internal capability execution
    const systemUser: User = {
      id: "system",
      username: "system",
      roles: ["admin"],
    };

    const capabilityRegistry = this.integrationManager.getCapabilityRegistry();

    for (const sourceName of linkedNode.sources) {
      try {
        const sourceData: Record<string, unknown> = {};

        // Get facts using info.facts capability
        const factsResult = await capabilityRegistry.executeCapability<Record<string, unknown>>(
          systemUser,
          "info.facts",
          { nodeId },
          undefined
        );

        if (factsResult.success && factsResult.data && factsResult.handledBy === sourceName) {
          sourceData.facts = factsResult.data;
        }

        // Dynamically query all available capabilities for this node
        // Try common capability patterns that plugins might provide
        const commonCapabilities = [
          { name: "reports.list", key: "reports" },
          { name: "catalog.get", key: "catalog" },
          { name: "events.list", key: "events" },
          { name: "certificate.get", key: "certificate" },
          { name: "status.get", key: "status" },
        ];

        for (const { name: capabilityName, key } of commonCapabilities) {
          try {
            const result = await capabilityRegistry.executeCapability(
              systemUser,
              capabilityName,
              { nodeId },
              undefined
            );

            if (result.success && result.data && result.handledBy === sourceName) {
              sourceData[key] = result.data;
            }
          } catch {
            // Capability not available or failed - skip silently
          }
        }

        // Only add to dataBySource if we got some data
        if (Object.keys(sourceData).length > 0) {
          dataBySource[sourceName] = sourceData;
        }
      } catch (error) {
        this.logger.error(`Failed to get data from ${sourceName}`, {
          component: "NodeLinkingService",
          operation: "getLinkedNodeData",
          metadata: { sourceName, nodeId },
        }, error instanceof Error ? error : undefined);
      }
    }

    return {
      node: linkedNode,
      dataBySource,
    };
  }

  /**
   * Find matching nodes across sources
   *
   * @param identifier - Node identifier (certname, hostname, etc.)
   * @returns Nodes matching the identifier from all sources
   */
  async findMatchingNodes(identifier: string): Promise<Node[]> {
    const aggregated = await this.integrationManager.getAggregatedInventory();
    const matchingNodes: Node[] = [];

    for (const node of aggregated.nodes) {
      const identifiers = this.extractIdentifiers(node);

      if (identifiers.includes(identifier.toLowerCase())) {
        matchingNodes.push(node);
      }
    }

    return matchingNodes;
  }

  /**
   * Check if two nodes match based on their identifiers
   *
   * Note: This method is currently unused but kept for future node linking enhancements
   *
   * @param node1 - First node
   * @param node2 - Second node
   * @returns True if nodes match, false otherwise
   */
  /* private matchNodes(node1: Node, node2: Node): boolean {
    const identifiers1 = this.extractIdentifiers(node1);
    const identifiers2 = this.extractIdentifiers(node2);

    // Check if any identifiers match
    for (const id1 of identifiers1) {
      if (identifiers2.includes(id1)) {
        return true;
      }
    }

    return false;
  } */

  /**
   * Extract all possible identifiers from a node
   *
   * @param node - Node to extract identifiers from
   * @returns Array of identifiers (normalized to lowercase)
   */
  private extractIdentifiers(node: Node): string[] {
    const identifiers: string[] = [];

    // Add node ID
    if (node.id) {
      identifiers.push(node.id.toLowerCase());
    }

    // Add node name (certname)
    if (node.name) {
      identifiers.push(node.name.toLowerCase());
    }

    // Add URI hostname (extract from URI)
    if (node.uri) {
      try {
        // Extract hostname from URI
        // URIs can be in formats like:
        // - ssh://hostname
        // - hostname
        // - hostname:port
        const uriParts = node.uri.split("://");
        const hostPart = uriParts.length > 1 ? uriParts[1] : uriParts[0];
        const hostname = hostPart.split(":")[0].split("/")[0];

        if (hostname) {
          identifiers.push(hostname.toLowerCase());
        }
      } catch {
        // Ignore URI parsing errors
      }
    }

    // Add hostname from config if available
    const nodeConfig = node.config as { hostname?: string } | undefined;
    if (nodeConfig?.hostname) {
      identifiers.push(nodeConfig.hostname.toLowerCase());
    }

    // Remove duplicates
    return Array.from(new Set(identifiers));
  }
}
