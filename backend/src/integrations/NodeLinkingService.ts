/**
 * Node Linking Service
 *
 * Service for linking nodes across multiple information sources based on matching identifiers.
 * Implements the node linking strategy described in the design document.
 */

import type { Node } from "./bolt/types";
import type { IntegrationManager } from "./IntegrationManager";
import { LoggerService } from "../services/LoggerService";

/**
 * Source-specific node data
 */
export interface SourceNodeData {
  id: string;
  uri: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: string;
}

/**
 * Linked node with source attribution and source-specific data
 */
export interface LinkedNode extends Node {
  sources: string[]; // List of sources this node appears in
  linked: boolean; // True if node exists in multiple sources
  certificateStatus?: "signed" | "requested" | "revoked";
  lastCheckIn?: string;

  // Source-specific data (keeps original IDs and URIs per source)
  sourceData: Record<string, SourceNodeData>;
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

        // Use the first node's name as the primary identifier
        // (all related nodes should have the same name)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const primaryName = node.name?.trim() || node.id || node.uri;

        // Create linked node with common name
        const linkedNode: LinkedNode = {
          id: primaryName, // Use name (or stable fallback) as primary ID for lookups
          name: primaryName,
          uri: node.uri, // Will be overwritten with combined URIs
          transport: node.transport,
          config: node.config,
          sources: [],
          linked: false,
          sourceData: {},
        };

        // Collect source-specific data from all related nodes
        const allUris: string[] = [];

        for (const relatedNode of relatedNodes) {
          processedNodes.add(relatedNode);

          const nodeSource =
            (relatedNode as Node & { source?: string }).source ?? "bolt";

          if (!linkedNode.sources.includes(nodeSource)) {
            linkedNode.sources.push(nodeSource);
          }

          // Store source-specific data
          linkedNode.sourceData[nodeSource] = {
            id: relatedNode.id,
            uri: relatedNode.uri,
            config: relatedNode.config,
            metadata: (relatedNode as Node & { metadata?: Record<string, unknown> }).metadata,
            status: (relatedNode as Node & { status?: string }).status,
          };

          // Collect URIs
          allUris.push(relatedNode.uri);

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

        // Keep uri as the primary URI from the first non-empty source.
        // Source-specific URIs are preserved in sourceData[source].uri.
        const primaryUri = allUris.find((u) => u) ?? linkedNode.uri;
        linkedNode.uri = primaryUri;

        // Mark as linked if from multiple sources
        linkedNode.linked = linkedNode.sources.length > 1;

        // Set source (singular) to the primary source for backward compatibility
        // This ensures code that reads node.source still works correctly
        linkedNode.source = linkedNode.sources[0];

        this.logger.debug("Created linked node", {
          component: "NodeLinkingService",
          operation: "linkNodes",
          metadata: {
            nodeId: linkedNode.id,
            nodeName: linkedNode.name,
            sources: linkedNode.sources,
            linked: linkedNode.linked,
            sourceDataKeys: Object.keys(linkedNode.sourceData),
          },
        });

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

    // Add node ID (always unique per source)
    if (node.id) {
      identifiers.push(node.id.toLowerCase());
    }

    // Add node name (certname) - used for cross-source linking
    // Skip empty names to prevent incorrect linking
    if (node.name && node.name.trim() !== "") {
      identifiers.push(node.name.toLowerCase());
    }

    // Add URI hostname (extract from URI)
    // Skip Proxmox URIs as they use format proxmox://node/vmid where 'node' is not unique per VM
    // Skip AWS URIs as they use format aws:region:instance-id where splitting on ':' yields 'aws' for all nodes
    if (node.uri && !node.uri.startsWith("proxmox://") && !node.uri.startsWith("aws:")) {
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
