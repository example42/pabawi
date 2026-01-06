/**
 * ForgeClient
 *
 * Client for querying the Puppet Forge API to get module information,
 * latest versions, and security advisories.
 *
 * Requirements: 10.2, 10.4
 */

import type { ModuleUpdate } from "./types";
import type { ParsedModule } from "./PuppetfileParser";

/**
 * Puppet Forge module information
 */
export interface ForgeModuleInfo {
  slug: string;
  name: string;
  owner: { slug: string; username: string };
  current_release: {
    version: string;
    created_at: string;
    deleted_at: string | null;
    file_uri: string;
    file_size: number;
    supported: boolean;
  };
  releases: Array<{
    version: string;
    created_at: string;
  }>;
  deprecated_at: string | null;
  deprecated_for: string | null;
  superseded_by: { slug: string } | null;
  endorsement: string | null;
  module_group: string;
  premium: boolean;
}

/**
 * Security advisory information
 */
export interface SecurityAdvisory {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  affectedVersions: string;
  fixedVersion?: string;
  description: string;
  url?: string;
  publishedAt: string;
}

/**
 * Module security status
 */
export interface ModuleSecurityStatus {
  moduleSlug: string;
  hasAdvisories: boolean;
  advisories: SecurityAdvisory[];
  deprecated: boolean;
  deprecationReason?: string;
}

/**
 * Forge API error
 */
export interface ForgeApiError {
  message: string;
  statusCode?: number;
  moduleSlug?: string;
}

/**
 * Module update check result
 */
export interface ModuleUpdateCheckResult {
  module: ParsedModule;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  deprecated: boolean;
  deprecatedFor?: string;
  supersededBy?: string;
  securityStatus?: ModuleSecurityStatus;
  error?: string;
}

/**
 * ForgeClient configuration
 */
export interface ForgeClientConfig {
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  securityAdvisoryUrl?: string;
}

const DEFAULT_FORGE_URL = "https://forgeapi.puppet.com";
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_USER_AGENT = "Pabawi/0.4.0";

/**
 * Known security advisories for common Puppet modules
 * This is a static list that can be extended or replaced with an external service
 */
const KNOWN_SECURITY_ADVISORIES: Record<string, SecurityAdvisory[]> = {
  // Example: puppetlabs/apache had a security issue in older versions
  // This would be populated from a security advisory database
};

/**
 * ForgeClient class for querying Puppet Forge API
 */
export class ForgeClient {
  private baseUrl: string;
  private timeout: number;
  private userAgent: string;
  private securityAdvisories: Map<string, SecurityAdvisory[]> = new Map();

  constructor(config: ForgeClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_FORGE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;

    // Initialize with known advisories
    this.loadKnownAdvisories();
  }

  /**
   * Load known security advisories
   */
  private loadKnownAdvisories(): void {
    for (const [moduleSlug, advisories] of Object.entries(KNOWN_SECURITY_ADVISORIES)) {
      this.securityAdvisories.set(this.normalizeSlug(moduleSlug), advisories);
    }
  }

  /**
   * Add a security advisory for a module
   * This can be used to dynamically add advisories from external sources
   */
  addSecurityAdvisory(moduleSlug: string, advisory: SecurityAdvisory): void {
    const normalized = this.normalizeSlug(moduleSlug);
    const existing = this.securityAdvisories.get(normalized) ?? [];
    existing.push(advisory);
    this.securityAdvisories.set(normalized, existing);
  }

  /**
   * Get security advisories for a module
   *
   * @param moduleSlug - Module slug in format "author/name" or "author-name"
   * @param version - Optional version to filter advisories
   * @returns List of security advisories affecting the module
   */
  getSecurityAdvisories(moduleSlug: string, version?: string): SecurityAdvisory[] {
    const normalized = this.normalizeSlug(moduleSlug);
    const advisories = this.securityAdvisories.get(normalized) ?? [];

    if (!version) {
      return advisories;
    }

    // Filter advisories that affect the specified version
    return advisories.filter((advisory) => {
      return this.isVersionAffected(version, advisory.affectedVersions, advisory.fixedVersion);
    });
  }

  /**
   * Check if a version is affected by an advisory
   */
  private isVersionAffected(version: string, affectedVersions: string, fixedVersion?: string): boolean {
    // Simple version range check
    // affectedVersions format: "< 2.0.0" or ">= 1.0.0, < 2.0.0"

    if (fixedVersion && !this.isNewerVersion(fixedVersion, version)) {
      // Version is at or after the fix
      return false;
    }

    // Parse affected versions range
    const ranges = affectedVersions.split(",").map((r) => r.trim());

    for (const range of ranges) {
      const ltMatch = range.match(/^<\s*(.+)$/);
      const lteMatch = range.match(/^<=\s*(.+)$/);
      const gtMatch = range.match(/^>\s*(.+)$/);
      const gteMatch = range.match(/^>=\s*(.+)$/);
      const eqMatch = range.match(/^=\s*(.+)$/);

      if (ltMatch) {
        if (!this.isNewerVersion(ltMatch[1], version)) continue;
        return true;
      }
      if (lteMatch) {
        if (this.isNewerVersion(version, lteMatch[1])) continue;
        return true;
      }
      if (gtMatch) {
        if (!this.isNewerVersion(version, gtMatch[1])) continue;
        return true;
      }
      if (gteMatch) {
        if (this.isNewerVersion(gteMatch[1], version)) continue;
        return true;
      }
      if (eqMatch) {
        if (version !== eqMatch[1]) continue;
        return true;
      }
    }

    return false;
  }

  /**
   * Get security status for a module
   *
   * @param moduleSlug - Module slug
   * @param version - Current version
   * @returns Security status including advisories and deprecation info
   */
  async getSecurityStatus(moduleSlug: string, version: string): Promise<ModuleSecurityStatus> {
    const normalized = this.normalizeSlug(moduleSlug);
    const advisories = this.getSecurityAdvisories(moduleSlug, version);

    // Also check if module is deprecated (which is a security concern)
    const moduleInfo = await this.getModuleInfo(moduleSlug);
    const deprecated = moduleInfo?.deprecated_at !== null;

    return {
      moduleSlug: normalized,
      hasAdvisories: advisories.length > 0 || deprecated,
      advisories,
      deprecated,
      deprecationReason: moduleInfo?.deprecated_for ?? undefined,
    };
  }

  /**
   * Check security for multiple modules
   *
   * @param modules - List of parsed modules
   * @returns Map of module slug to security status
   */
  async checkSecurityForModules(modules: ParsedModule[]): Promise<Map<string, ModuleSecurityStatus>> {
    const results = new Map<string, ModuleSecurityStatus>();

    // Only check forge modules (git modules would need different handling)
    const forgeModules = modules.filter((m) => m.source === "forge");

    for (const mod of forgeModules) {
      const slug = mod.forgeSlug ?? mod.name;
      const status = await this.getSecurityStatus(slug, mod.version);
      results.set(this.normalizeSlug(slug), status);
    }

    return results;
  }

  /**
   * Get module information from Puppet Forge
   *
   * @param moduleSlug - Module slug in format "author/name" or "author-name"
   * @returns Module information or null if not found
   */
  async getModuleInfo(moduleSlug: string): Promise<ForgeModuleInfo | null> {
    const normalizedSlug = this.normalizeSlug(moduleSlug);
    const url = `${this.baseUrl}/v3/modules/${normalizedSlug}`;

    try {
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Forge API returned status ${response.status}`);
      }

      const data = await response.json();
      return data as ForgeModuleInfo;
    } catch (error) {
      this.log(`Failed to fetch module info for ${moduleSlug}: ${this.getErrorMessage(error)}`, "warn");
      return null;
    }
  }

  /**
   * Get the latest version of a module
   *
   * @param moduleSlug - Module slug in format "author/name" or "author-name"
   * @returns Latest version string or null if not found
   */
  async getLatestVersion(moduleSlug: string): Promise<string | null> {
    const moduleInfo = await this.getModuleInfo(moduleSlug);
    return moduleInfo?.current_release?.version ?? null;
  }

  /**
   * Check for updates for a list of modules
   *
   * @param modules - List of parsed modules to check
   * @returns List of module update check results
   */
  async checkForUpdates(modules: ParsedModule[]): Promise<ModuleUpdateCheckResult[]> {
    const results: ModuleUpdateCheckResult[] = [];

    // Process modules in parallel with concurrency limit
    const concurrencyLimit = 5;
    const forgeModules = modules.filter((m) => m.source === "forge");

    for (let i = 0; i < forgeModules.length; i += concurrencyLimit) {
      const batch = forgeModules.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map((mod) => this.checkModuleUpdate(mod))
      );
      results.push(...batchResults);
    }

    // Add git modules without update check (can't check git repos via Forge)
    const gitModules = modules.filter((m) => m.source === "git");
    for (const mod of gitModules) {
      results.push({
        module: mod,
        currentVersion: mod.version,
        latestVersion: mod.version,
        hasUpdate: false,
        deprecated: false,
      });
    }

    return results;
  }

  /**
   * Check for update for a single module
   */
  private async checkModuleUpdate(module: ParsedModule): Promise<ModuleUpdateCheckResult> {
    const slug = module.forgeSlug ?? module.name;

    try {
      const moduleInfo = await this.getModuleInfo(slug);

      if (!moduleInfo) {
        return {
          module,
          currentVersion: module.version,
          latestVersion: module.version,
          hasUpdate: false,
          deprecated: false,
          error: `Module not found on Puppet Forge: ${slug}`,
        };
      }

      const latestVersion = moduleInfo.current_release?.version ?? module.version;
      const hasUpdate = this.isNewerVersion(latestVersion, module.version);

      // Get security status
      const securityStatus = await this.getSecurityStatus(slug, module.version);

      return {
        module,
        currentVersion: module.version,
        latestVersion,
        hasUpdate,
        deprecated: moduleInfo.deprecated_at !== null,
        deprecatedFor: moduleInfo.deprecated_for ?? undefined,
        supersededBy: moduleInfo.superseded_by?.slug,
        securityStatus,
      };
    } catch (error) {
      return {
        module,
        currentVersion: module.version,
        latestVersion: module.version,
        hasUpdate: false,
        deprecated: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Convert update check results to ModuleUpdate format
   */
  toModuleUpdates(results: ModuleUpdateCheckResult[]): ModuleUpdate[] {
    return results.map((result) => {
      const hasSecurityAdvisory = result.securityStatus?.hasAdvisories ?? false;

      let changelog: string | undefined;
      if (result.deprecated) {
        changelog = `Deprecated${result.deprecatedFor ? `: ${result.deprecatedFor}` : ""}${result.supersededBy ? `. Superseded by ${result.supersededBy}` : ""}`;
      }
      if (result.securityStatus?.advisories && result.securityStatus.advisories.length > 0) {
        const advisoryInfo = result.securityStatus.advisories
          .map((a) => `${a.severity.toUpperCase()}: ${a.title}`)
          .join("; ");
        changelog = changelog ? `${changelog}. Security: ${advisoryInfo}` : `Security: ${advisoryInfo}`;
      }

      return {
        name: result.module.name,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        source: result.module.source,
        hasSecurityAdvisory,
        changelog,
      };
    });
  }

  /**
   * Compare two semantic versions
   *
   * @returns true if version1 is newer than version2
   */
  isNewerVersion(version1: string, version2: string): boolean {
    // Handle special cases
    if (version2 === "latest" || version2 === "HEAD" || version2 === "local") {
      return false;
    }

    // Parse versions
    const v1Parts = this.parseVersion(version1);
    const v2Parts = this.parseVersion(version2);

    // Compare major, minor, patch
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const p1 = v1Parts[i] ?? 0;
      const p2 = v2Parts[i] ?? 0;

      if (p1 > p2) return true;
      if (p1 < p2) return false;
    }

    return false;
  }

  /**
   * Parse a version string into numeric parts
   */
  private parseVersion(version: string): number[] {
    // Remove leading 'v' if present
    const cleaned = version.replace(/^v/, "");

    // Split by dots and convert to numbers
    return cleaned.split(".").map((part) => {
      // Extract numeric portion (handles things like "1.0.0-rc1")
      const match = part.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
  }

  /**
   * Normalize module slug to Forge format (author-name)
   */
  private normalizeSlug(slug: string): string {
    // Convert author/name to author-name
    return slug.replace("/", "-");
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Log a message
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const prefix = "[ForgeClient]";
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
