/**
 * FactService
 *
 * Thin wrapper around existing PuppetDB integration for fact retrieval.
 * Provides fallback to local fact files when PuppetDB is unavailable.
 *
 * Design Decision: Rather than duplicating fact retrieval logic, this service
 * delegates to the existing PuppetDBService.getNodeFacts() when PuppetDB
 * integration is available. This ensures:
 * - Single source of truth for PuppetDB communication
 * - Consistent caching behavior
 * - No code duplication
 */

import * as fs from "fs";
import * as path from "path";
import type { IntegrationManager } from "../IntegrationManager";
import type { InformationSourcePlugin } from "../types";
import type { Facts, FactResult, LocalFactFile, FactSourceConfig } from "./types";

/**
 * FactService
 *
 * Retrieves facts for nodes using PuppetDB as primary source
 * with local fact files as fallback.
 */
export class FactService {
  private integrationManager: IntegrationManager;
  private localFactsPath?: string;
  private preferPuppetDB: boolean;

  /**
   * Create a new FactService
   *
   * @param integrationManager - Integration manager for accessing PuppetDB
   * @param config - Fact source configuration
   */
  constructor(
    integrationManager: IntegrationManager,
    config?: FactSourceConfig
  ) {
    this.integrationManager = integrationManager;
    this.localFactsPath = config?.localFactsPath;
    this.preferPuppetDB = config?.preferPuppetDB ?? true;
  }

  /**
   * Get facts for a node
   *
   * Uses PuppetDB if available, falls back to local files.
   * Returns empty fact set with warning when no facts available.
   *
   * @param nodeId - Node identifier (certname)
   * @returns Facts and metadata about the source
   */
  async getFacts(nodeId: string): Promise<FactResult> {
    // Try PuppetDB first if preferred
    if (this.preferPuppetDB) {
      const puppetdbResult = await this.getFactsFromPuppetDB(nodeId);
      if (puppetdbResult) {
        return puppetdbResult;
      }
    }

    // Try local facts
    const localResult = this.getFactsFromLocalFiles(nodeId);
    if (localResult) {
      return localResult;
    }

    // Try PuppetDB as fallback if not preferred initially
    if (!this.preferPuppetDB) {
      const puppetdbResult = await this.getFactsFromPuppetDB(nodeId);
      if (puppetdbResult) {
        return puppetdbResult;
      }
    }

    // No facts available - return empty set with warning
    return this.createEmptyFactResult(nodeId);
  }

  /**
   * Get the fact source that would be used for a node
   *
   * @param nodeId - Node identifier
   * @returns Source type or 'none' if no facts available
   */
  async getFactSource(nodeId: string): Promise<"puppetdb" | "local" | "none"> {
    // Check PuppetDB availability
    const puppetdb = this.getPuppetDBSource();
    if (puppetdb?.isInitialized()) {
      try {
        await puppetdb.getNodeFacts(nodeId);
        return "puppetdb";
      } catch {
        // PuppetDB doesn't have facts for this node
      }
    }

    // Check local facts
    if (this.localFactsPath) {
      const factFile = this.getLocalFactFilePath(nodeId);
      if (factFile && fs.existsSync(factFile)) {
        return "local";
      }
    }

    return "none";
  }

  /**
   * List all nodes with available facts (from any source)
   *
   * @returns Array of node identifiers
   */
  async listAvailableNodes(): Promise<string[]> {
    const nodes = new Set<string>();

    // Get nodes from PuppetDB
    const puppetdb = this.getPuppetDBSource();
    if (puppetdb?.isInitialized()) {
      try {
        const inventory = await puppetdb.getInventory();
        for (const node of inventory) {
          nodes.add(node.id);
        }
      } catch (error) {
        this.log(`Failed to get nodes from PuppetDB: ${this.getErrorMessage(error)}`, "warn");
      }
    }

    // Get nodes from local fact files
    if (this.localFactsPath && fs.existsSync(this.localFactsPath)) {
      try {
        const files = fs.readdirSync(this.localFactsPath);
        for (const file of files) {
          if (file.endsWith(".json")) {
            // Extract node name from filename (remove .json extension)
            const nodeName = file.slice(0, -5);
            nodes.add(nodeName);
          }
        }
      } catch (error) {
        this.log(`Failed to list local fact files: ${this.getErrorMessage(error)}`, "warn");
      }
    }

    return Array.from(nodes);
  }

  /**
   * Update the local facts path
   *
   * @param localFactsPath - New path to local fact files
   */
  setLocalFactsPath(localFactsPath: string | undefined): void {
    this.localFactsPath = localFactsPath;
  }

  /**
   * Update the PuppetDB preference
   *
   * @param preferPuppetDB - Whether to prefer PuppetDB over local facts
   */
  setPreferPuppetDB(preferPuppetDB: boolean): void {
    this.preferPuppetDB = preferPuppetDB;
  }

  /**
   * Get facts from PuppetDB
   *
   * @param nodeId - Node identifier
   * @returns FactResult or null if unavailable
   */
  private async getFactsFromPuppetDB(nodeId: string): Promise<FactResult | null> {
    const puppetdb = this.getPuppetDBSource();

    if (!puppetdb?.isInitialized()) {
      this.log("PuppetDB integration not available");
      return null;
    }

    try {
      const facts = await puppetdb.getNodeFacts(nodeId);
      return {
        facts,
        source: "puppetdb",
      };
    } catch (error) {
      this.log(`Failed to get facts from PuppetDB for node '${nodeId}': ${this.getErrorMessage(error)}`, "warn");
      return null;
    }
  }

  /**
   * Get facts from local fact files
   *
   * @param nodeId - Node identifier
   * @returns FactResult or null if unavailable
   */
  private getFactsFromLocalFiles(nodeId: string): FactResult | null {
    if (!this.localFactsPath) {
      return null;
    }

    const factFile = this.getLocalFactFilePath(nodeId);
    if (!factFile || !fs.existsSync(factFile)) {
      return null;
    }

    try {
      const facts = this.parseLocalFactFile(factFile, nodeId);
      return {
        facts,
        source: "local",
        warnings: ["Using local fact files - facts may be outdated"],
      };
    } catch (error) {
      this.log(`Failed to parse local fact file for node '${nodeId}': ${this.getErrorMessage(error)}`, "warn");
      return null;
    }
  }

  /**
   * Parse a local fact file in Puppetserver format
   *
   * Supports the Puppetserver fact file format with "name" and "values" structure.
   *
   * @param filePath - Path to the fact file
   * @param nodeId - Node identifier
   * @returns Parsed facts
   */
  private parseLocalFactFile(filePath: string, nodeId: string): Facts {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as LocalFactFile | Record<string, unknown>;

    // Check if it's in Puppetserver format (has "name" and "values")
    if (this.isLocalFactFile(parsed)) {
      return this.transformLocalFactFile(parsed, nodeId);
    }

    // Assume it's a flat fact structure
    return this.transformFlatFacts(parsed, nodeId);
  }

  /**
   * Check if parsed content is in LocalFactFile format
   *
   * @param parsed - Parsed JSON content
   * @returns True if in LocalFactFile format
   */
  private isLocalFactFile(parsed: unknown): parsed is LocalFactFile {
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      "values" in parsed &&
      typeof (parsed as LocalFactFile).name === "string" &&
      typeof (parsed as LocalFactFile).values === "object"
    );
  }

  /**
   * Transform LocalFactFile format to Facts
   *
   * @param factFile - Local fact file content
   * @param nodeId - Node identifier
   * @returns Transformed facts
   */
  private transformLocalFactFile(factFile: LocalFactFile, nodeId: string): Facts {
    const values = factFile.values;

    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts: this.buildFactsObject(values),
    };
  }

  /**
   * Transform flat fact structure to Facts
   *
   * @param flatFacts - Flat fact object
   * @param nodeId - Node identifier
   * @returns Transformed facts
   */
  private transformFlatFacts(flatFacts: Record<string, unknown>, nodeId: string): Facts {
    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts: this.buildFactsObject(flatFacts),
    };
  }

  /**
   * Build a Facts.facts object from raw fact values
   *
   * Ensures required fields have default values if missing.
   *
   * @param values - Raw fact values
   * @returns Facts.facts object
   */
  private buildFactsObject(values: Record<string, unknown>): Facts["facts"] {
    // Extract or create default values for required fields
    const os = this.extractOsFacts(values);
    const processors = this.extractProcessorFacts(values);
    const memory = this.extractMemoryFacts(values);
    const networking = this.extractNetworkingFacts(values);

    return {
      os,
      processors,
      memory,
      networking,
      ...values,
    };
  }

  /**
   * Extract OS facts with defaults
   */
  private extractOsFacts(values: Record<string, unknown>): Facts["facts"]["os"] {
    const os = values.os as Record<string, unknown> | undefined;

    return {
      family: typeof os?.family === "string" ? os.family : "Unknown",
      name: typeof os?.name === "string" ? os.name : "Unknown",
      release: {
        full: os && typeof os.release === "object" && os.release !== null
          ? (os.release as Record<string, unknown>).full as string
          : "Unknown",
        major: os && typeof os.release === "object" && os.release !== null
          ? (os.release as Record<string, unknown>).major as string
          : "Unknown",
      },
    };
  }

  /**
   * Extract processor facts with defaults
   */
  private extractProcessorFacts(values: Record<string, unknown>): Facts["facts"]["processors"] {
    const processors = values.processors as Record<string, unknown> | undefined;

    return {
      count: typeof processors?.count === "number" ? processors.count : 0,
      models: Array.isArray(processors?.models) ? processors.models as string[] : [],
    };
  }

  /**
   * Extract memory facts with defaults
   */
  private extractMemoryFacts(values: Record<string, unknown>): Facts["facts"]["memory"] {
    const memory = values.memory as Record<string, unknown> | undefined;
    const system = memory?.system as Record<string, unknown> | undefined;

    return {
      system: {
        total: (system?.total as string) || "Unknown",
        available: (system?.available as string) || "Unknown",
      },
    };
  }

  /**
   * Extract networking facts with defaults
   */
  private extractNetworkingFacts(values: Record<string, unknown>): Facts["facts"]["networking"] {
    const networking = values.networking as Record<string, unknown> | undefined;

    return {
      hostname: typeof networking?.hostname === "string" ? networking.hostname : "Unknown",
      interfaces: typeof networking?.interfaces === "object" && networking.interfaces !== null && !Array.isArray(networking.interfaces)
        ? networking.interfaces as Record<string, unknown>
        : {},
    };
  }

  /**
   * Get the path to a local fact file for a node
   *
   * @param nodeId - Node identifier
   * @returns File path or null if local facts not configured
   */
  private getLocalFactFilePath(nodeId: string): string | null {
    if (!this.localFactsPath) {
      return null;
    }

    return path.join(this.localFactsPath, `${nodeId}.json`);
  }

  /**
   * Create an empty fact result for when no facts are available
   *
   * @param nodeId - Node identifier
   * @returns Empty FactResult with warning
   */
  private createEmptyFactResult(nodeId: string): FactResult {
    return {
      facts: {
        nodeId,
        gatheredAt: new Date().toISOString(),
        facts: {
          os: {
            family: "Unknown",
            name: "Unknown",
            release: {
              full: "Unknown",
              major: "Unknown",
            },
          },
          processors: {
            count: 0,
            models: [],
          },
          memory: {
            system: {
              total: "Unknown",
              available: "Unknown",
            },
          },
          networking: {
            hostname: "Unknown",
            interfaces: {},
          },
        },
      },
      source: "local",
      warnings: [`No facts available for node '${nodeId}'`],
    };
  }

  /**
   * Get the PuppetDB information source from the integration manager
   *
   * @returns PuppetDB plugin or null
   */
  private getPuppetDBSource(): InformationSourcePlugin | null {
    return this.integrationManager.getInformationSource("puppetdb");
  }

  /**
   * Extract error message from unknown error
   *
   * @param error - Unknown error
   * @returns Error message string
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Log a message
   *
   * @param message - Message to log
   * @param level - Log level
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const prefix = "[FactService]";
    switch (level) {
      case "warn":
        console.warn(prefix, message);
        break;
      case "error":
        console.error(prefix, message);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(prefix, message);
    }
  }
}
