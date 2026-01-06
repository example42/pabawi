/**
 * ForgeClient Unit Tests
 *
 * Tests for the ForgeClient class that queries Puppet Forge API
 * for module information and security advisories.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ForgeClient } from "../../src/integrations/hiera/ForgeClient";
import type { ParsedModule } from "../../src/integrations/hiera/PuppetfileParser";

describe("ForgeClient", () => {
  let client: ForgeClient;

  beforeEach(() => {
    client = new ForgeClient();
  });

  describe("isNewerVersion", () => {
    it("should detect newer major version", () => {
      expect(client.isNewerVersion("2.0.0", "1.0.0")).toBe(true);
      expect(client.isNewerVersion("1.0.0", "2.0.0")).toBe(false);
    });

    it("should detect newer minor version", () => {
      expect(client.isNewerVersion("1.2.0", "1.1.0")).toBe(true);
      expect(client.isNewerVersion("1.1.0", "1.2.0")).toBe(false);
    });

    it("should detect newer patch version", () => {
      expect(client.isNewerVersion("1.0.2", "1.0.1")).toBe(true);
      expect(client.isNewerVersion("1.0.1", "1.0.2")).toBe(false);
    });

    it("should handle equal versions", () => {
      expect(client.isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    });

    it("should handle versions with v prefix", () => {
      expect(client.isNewerVersion("v2.0.0", "v1.0.0")).toBe(true);
      expect(client.isNewerVersion("v1.0.0", "v2.0.0")).toBe(false);
    });

    it("should handle special version strings", () => {
      expect(client.isNewerVersion("2.0.0", "latest")).toBe(false);
      expect(client.isNewerVersion("2.0.0", "HEAD")).toBe(false);
      expect(client.isNewerVersion("2.0.0", "local")).toBe(false);
    });

    it("should handle versions with pre-release tags", () => {
      expect(client.isNewerVersion("2.0.0", "1.0.0-rc1")).toBe(true);
      expect(client.isNewerVersion("1.0.0-rc2", "1.0.0-rc1")).toBe(false); // Same numeric part
    });

    it("should handle versions with different segment counts", () => {
      expect(client.isNewerVersion("1.0.0.1", "1.0.0")).toBe(true);
      expect(client.isNewerVersion("1.0.0", "1.0.0.1")).toBe(false);
    });
  });

  describe("addSecurityAdvisory", () => {
    it("should add security advisory for a module", () => {
      client.addSecurityAdvisory("puppetlabs/apache", {
        id: "CVE-2023-1234",
        title: "Test vulnerability",
        severity: "high",
        affectedVersions: "< 2.0.0",
        fixedVersion: "2.0.0",
        description: "Test description",
        publishedAt: "2023-01-01",
      });

      const advisories = client.getSecurityAdvisories("puppetlabs/apache", "1.0.0");
      expect(advisories).toHaveLength(1);
      expect(advisories[0].id).toBe("CVE-2023-1234");
    });

    it("should handle multiple advisories for same module", () => {
      client.addSecurityAdvisory("puppetlabs/apache", {
        id: "CVE-2023-1234",
        title: "First vulnerability",
        severity: "high",
        affectedVersions: "< 2.0.0",
        description: "Test",
        publishedAt: "2023-01-01",
      });

      client.addSecurityAdvisory("puppetlabs/apache", {
        id: "CVE-2023-5678",
        title: "Second vulnerability",
        severity: "medium",
        affectedVersions: "< 3.0.0",
        description: "Test",
        publishedAt: "2023-06-01",
      });

      const advisories = client.getSecurityAdvisories("puppetlabs/apache");
      expect(advisories).toHaveLength(2);
    });
  });

  describe("getSecurityAdvisories", () => {
    beforeEach(() => {
      client.addSecurityAdvisory("puppetlabs/apache", {
        id: "CVE-2023-1234",
        title: "Test vulnerability",
        severity: "high",
        affectedVersions: "< 2.0.0",
        fixedVersion: "2.0.0",
        description: "Test description",
        publishedAt: "2023-01-01",
      });
    });

    it("should return advisories for affected version", () => {
      const advisories = client.getSecurityAdvisories("puppetlabs/apache", "1.5.0");
      expect(advisories).toHaveLength(1);
    });

    it("should not return advisories for fixed version", () => {
      const advisories = client.getSecurityAdvisories("puppetlabs/apache", "2.0.0");
      expect(advisories).toHaveLength(0);
    });

    it("should not return advisories for version after fix", () => {
      const advisories = client.getSecurityAdvisories("puppetlabs/apache", "3.0.0");
      expect(advisories).toHaveLength(0);
    });

    it("should return all advisories when no version specified", () => {
      const advisories = client.getSecurityAdvisories("puppetlabs/apache");
      expect(advisories).toHaveLength(1);
    });

    it("should return empty array for unknown module", () => {
      const advisories = client.getSecurityAdvisories("unknown/module", "1.0.0");
      expect(advisories).toHaveLength(0);
    });

    it("should normalize module slug format", () => {
      const advisories1 = client.getSecurityAdvisories("puppetlabs/apache", "1.0.0");
      const advisories2 = client.getSecurityAdvisories("puppetlabs-apache", "1.0.0");
      expect(advisories1).toHaveLength(1);
      expect(advisories2).toHaveLength(1);
    });
  });

  describe("toModuleUpdates", () => {
    it("should convert update results to ModuleUpdate format", () => {
      const results = [
        {
          module: {
            name: "puppetlabs/stdlib",
            version: "8.0.0",
            source: "forge" as const,
            line: 1,
          },
          currentVersion: "8.0.0",
          latestVersion: "9.0.0",
          hasUpdate: true,
          deprecated: false,
        },
      ];

      const updates = client.toModuleUpdates(results);

      expect(updates).toHaveLength(1);
      expect(updates[0].name).toBe("puppetlabs/stdlib");
      expect(updates[0].currentVersion).toBe("8.0.0");
      expect(updates[0].latestVersion).toBe("9.0.0");
      expect(updates[0].hasSecurityAdvisory).toBe(false);
    });

    it("should include deprecation info in changelog", () => {
      const results = [
        {
          module: {
            name: "old/module",
            version: "1.0.0",
            source: "forge" as const,
            line: 1,
          },
          currentVersion: "1.0.0",
          latestVersion: "1.0.0",
          hasUpdate: false,
          deprecated: true,
          deprecatedFor: "Use new/module instead",
          supersededBy: "new/module",
        },
      ];

      const updates = client.toModuleUpdates(results);

      expect(updates[0].changelog).toContain("Deprecated");
      expect(updates[0].changelog).toContain("Use new/module instead");
      expect(updates[0].changelog).toContain("Superseded by new/module");
    });

    it("should include security advisory info", () => {
      const results = [
        {
          module: {
            name: "puppetlabs/apache",
            version: "1.0.0",
            source: "forge" as const,
            line: 1,
          },
          currentVersion: "1.0.0",
          latestVersion: "2.0.0",
          hasUpdate: true,
          deprecated: false,
          securityStatus: {
            moduleSlug: "puppetlabs-apache",
            hasAdvisories: true,
            advisories: [
              {
                id: "CVE-2023-1234",
                title: "Critical vulnerability",
                severity: "critical" as const,
                affectedVersions: "< 2.0.0",
                description: "Test",
                publishedAt: "2023-01-01",
              },
            ],
            deprecated: false,
          },
        },
      ];

      const updates = client.toModuleUpdates(results);

      expect(updates[0].hasSecurityAdvisory).toBe(true);
      expect(updates[0].changelog).toContain("Security");
      expect(updates[0].changelog).toContain("CRITICAL");
      expect(updates[0].changelog).toContain("Critical vulnerability");
    });
  });

  describe("checkForUpdates", () => {
    it("should handle git modules without forge check", async () => {
      const modules: ParsedModule[] = [
        {
          name: "custom_module",
          version: "v1.0.0",
          source: "git",
          gitUrl: "https://github.com/example/custom.git",
          gitTag: "v1.0.0",
          line: 1,
        },
      ];

      const results = await client.checkForUpdates(modules);

      expect(results).toHaveLength(1);
      expect(results[0].module.name).toBe("custom_module");
      expect(results[0].hasUpdate).toBe(false);
    });
  });
});
