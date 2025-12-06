/**
 * Node Linking Service
 *
 * Service for linking nodes across multiple information sources based on matching identifiers.
 * Implements the node linking strategy described in the design document.
 */

import type { Node } from "../bolt/types";
import type { IntegrationManager } from "./IntegrationManager";

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
  dataBySource: Record<
    string,
    {
      facts?: unknown;
      status?: unknown;
      certificate?: unknown;
      reports?: unknown[];
      catalog?: unknown;
      events?: unknown[];
    }
  >;
}

/**
 * Node Linking Service
 *
 * Links nodes from multiple sources based on matching identifiers (certname, hostname, etc.)
 */
export class NodeLinkingService {
  constructor(private integrationManager: IntegrationManager) {}

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
          (relatedNode as Node & { source?: string }).source ?? "bolt";

        if (!linkedNode.sources.includes(nodeSource)) {
          linkedNode.sources.push(nodeSource);
        }

        // Merge certificate status (prefer from puppetserver)
        if (nodeSource === "puppetserver") {
          const nodeWithCert = relatedNode as Node & {
            certificateStatus?: "signed" | "requested" | "revoked";
          };
          if (nodeWithCert.certificateStatus) {
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

    // Fetch data from all sources
    const dataBySource: LinkedNodeData["dataBySource"] = {};

    for (const sourceName of linkedNode.sources) {
      const source = this.integrationManager.getInformationSource(sourceName);

      if (!source?.isInitialized()) {
        continue;
      }

      try {
        // Get facts from this source
        const facts = await source.getNodeFacts(nodeId);

        // Get additional data types based on source
        const additionalData: Record<string, unknown> = {};

        // Try to get source-specific data
        try {
          if (sourceName === "puppetdb") {
            // Get PuppetDB-specific data
            additionalData.reports = await source.getNodeData(
              nodeId,
              "reports",
            );
            additionalData.catalog = await source.getNodeData(
              nodeId,
              "catalog",
            );
            additionalData.events = await source.getNodeData(nodeId, "events");
          } else if (sourceName === "puppetserver") {
            // Get Puppetserver-specific data
            additionalData.certificate = await source.getNodeData(
              nodeId,
              "certificate",
            );
            additionalData.status = await source.getNodeData(nodeId, "status");
          }
        } catch {
          // Log but don't fail if additional data retrieval fails
          // Silently ignore errors for additional data
        }

        dataBySource[sourceName] = {
          facts,
          ...additionalData,
        };
      } catch (error) {
        console.error(`Failed to get data from ${sourceName}:`, error);
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
