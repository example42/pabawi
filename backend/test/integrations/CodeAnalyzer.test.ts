/**
 * CodeAnalyzer Unit Tests
 *
 * Tests for the CodeAnalyzer class that performs static analysis
 * of Puppet code in a control repository.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CodeAnalyzer } from "../../src/integrations/hiera/CodeAnalyzer";
import { HieraScanner } from "../../src/integrations/hiera/HieraScanner";
import type { CodeAnalysisConfig } from "../../src/integrations/hiera/types";

describe("CodeAnalyzer", () => {
  let analyzer: CodeAnalyzer;
  let testDir: string;
  let config: CodeAnalysisConfig;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analyzer-test-"));

    // Create test control repo structure
    createTestControlRepo(testDir);

    // Create analyzer config
    config = {
      enabled: true,
      lintEnabled: true,
      moduleUpdateCheck: true,
      analysisInterval: 300,
      exclusionPatterns: [],
    };

    analyzer = new CodeAnalyzer(testDir, config);
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize successfully with valid control repo", async () => {
      await analyzer.initialize();

      expect(analyzer.isInitialized()).toBe(true);
    });

    it("should discover classes from manifests", async () => {
      await analyzer.initialize();

      const classes = analyzer.getClasses();
      expect(classes.size).toBeGreaterThan(0);
      expect(classes.has("profile::nginx")).toBe(true);
      expect(classes.has("profile::base")).toBe(true);
    });

    it("should discover defined types from manifests", async () => {
      await analyzer.initialize();

      const definedTypes = analyzer.getDefinedTypes();
      expect(definedTypes.has("profile::vhost")).toBe(true);
    });

    it("should handle missing directories gracefully", async () => {
      // Remove manifests directory
      fs.rmSync(path.join(testDir, "manifests"), { recursive: true, force: true });

      await analyzer.initialize();

      expect(analyzer.isInitialized()).toBe(true);
      expect(analyzer.getClasses().size).toBe(0);
    });
  });

  describe("analyze", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should return complete analysis result", async () => {
      const result = await analyzer.analyze();

      expect(result.unusedCode).toBeDefined();
      expect(result.lintIssues).toBeDefined();
      expect(result.moduleUpdates).toBeDefined();
      expect(result.statistics).toBeDefined();
      expect(result.analyzedAt).toBeDefined();
    });

    it("should cache analysis results", async () => {
      const result1 = await analyzer.analyze();
      const result2 = await analyzer.analyze();

      // Should return same cached result
      expect(result1.analyzedAt).toBe(result2.analyzedAt);
    });
  });

  describe("getUnusedCode", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should detect unused classes", async () => {
      const unusedCode = await analyzer.getUnusedCode();

      // profile::unused is not included anywhere
      const unusedClassNames = unusedCode.unusedClasses.map((c) => c.name);
      expect(unusedClassNames).toContain("profile::unused");
    });

    it("should include file and line info for unused items", async () => {
      const unusedCode = await analyzer.getUnusedCode();

      for (const item of unusedCode.unusedClasses) {
        expect(item.file).toBeDefined();
        expect(item.line).toBeGreaterThan(0);
        expect(item.type).toBe("class");
      }
    });

    it("should detect unused defined types", async () => {
      const unusedCode = await analyzer.getUnusedCode();

      // profile::unused_type is not instantiated anywhere
      const unusedTypeNames = unusedCode.unusedDefinedTypes.map((t) => t.name);
      expect(unusedTypeNames).toContain("profile::unused_type");
    });

    it("should detect unused Hiera keys when scanner is set", async () => {
      // Create and initialize HieraScanner
      const scanner = new HieraScanner(testDir, "data");
      await scanner.scan();
      analyzer.setHieraScanner(scanner);

      const unusedCode = await analyzer.getUnusedCode();

      // unused_key is not referenced in any manifest
      const unusedKeyNames = unusedCode.unusedHieraKeys.map((k) => k.name);
      expect(unusedKeyNames).toContain("unused_key");
    });
  });

  describe("exclusion patterns", () => {
    it("should exclude items matching exclusion patterns", async () => {
      // Create analyzer with exclusion patterns
      const configWithExclusions: CodeAnalysisConfig = {
        ...config,
        exclusionPatterns: ["profile::unused*"],
      };
      const analyzerWithExclusions = new CodeAnalyzer(testDir, configWithExclusions);
      await analyzerWithExclusions.initialize();

      const unusedCode = await analyzerWithExclusions.getUnusedCode();

      // profile::unused should be excluded
      const unusedClassNames = unusedCode.unusedClasses.map((c) => c.name);
      expect(unusedClassNames).not.toContain("profile::unused");
    });

    it("should support wildcard patterns", async () => {
      const configWithExclusions: CodeAnalysisConfig = {
        ...config,
        exclusionPatterns: ["*::unused*"],
      };
      const analyzerWithExclusions = new CodeAnalyzer(testDir, configWithExclusions);
      await analyzerWithExclusions.initialize();

      const unusedCode = await analyzerWithExclusions.getUnusedCode();

      // Both profile::unused and profile::unused_type should be excluded
      const unusedClassNames = unusedCode.unusedClasses.map((c) => c.name);
      const unusedTypeNames = unusedCode.unusedDefinedTypes.map((t) => t.name);
      expect(unusedClassNames).not.toContain("profile::unused");
      expect(unusedTypeNames).not.toContain("profile::unused_type");
    });
  });

  describe("getLintIssues", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should detect lint issues", async () => {
      const issues = await analyzer.getLintIssues();

      expect(issues.length).toBeGreaterThan(0);
    });

    it("should include file, line, and severity for each issue", async () => {
      const issues = await analyzer.getLintIssues();

      for (const issue of issues) {
        expect(issue.file).toBeDefined();
        expect(issue.line).toBeGreaterThan(0);
        expect(["error", "warning", "info"]).toContain(issue.severity);
        expect(issue.message).toBeDefined();
        expect(issue.rule).toBeDefined();
      }
    });

    it("should detect trailing whitespace", async () => {
      const issues = await analyzer.getLintIssues();

      const trailingWhitespaceIssues = issues.filter(
        (i) => i.rule === "trailing_whitespace"
      );
      expect(trailingWhitespaceIssues.length).toBeGreaterThan(0);
    });
  });

  describe("filterIssues", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should filter by severity", async () => {
      const allIssues = await analyzer.getLintIssues();
      const warningsOnly = analyzer.filterIssues(allIssues, {
        severity: ["warning"],
      });

      expect(warningsOnly.every((i) => i.severity === "warning")).toBe(true);
    });

    it("should filter by type", async () => {
      const allIssues = await analyzer.getLintIssues();
      const trailingOnly = analyzer.filterIssues(allIssues, {
        types: ["trailing_whitespace"],
      });

      expect(trailingOnly.every((i) => i.rule === "trailing_whitespace")).toBe(true);
    });

    it("should combine filters", async () => {
      const allIssues = await analyzer.getLintIssues();
      const filtered = analyzer.filterIssues(allIssues, {
        severity: ["warning"],
        types: ["trailing_whitespace"],
      });

      expect(
        filtered.every(
          (i) => i.severity === "warning" && i.rule === "trailing_whitespace"
        )
      ).toBe(true);
    });
  });

  describe("countIssues", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should count issues by severity", async () => {
      const issues = await analyzer.getLintIssues();
      const counts = analyzer.countIssues(issues);

      expect(counts.bySeverity).toBeDefined();
      expect(typeof counts.bySeverity.error).toBe("number");
      expect(typeof counts.bySeverity.warning).toBe("number");
      expect(typeof counts.bySeverity.info).toBe("number");
    });

    it("should count issues by rule", async () => {
      const issues = await analyzer.getLintIssues();
      const counts = analyzer.countIssues(issues);

      expect(counts.byRule).toBeDefined();
      expect(counts.total).toBe(issues.length);
    });

    it("should have correct total", async () => {
      const issues = await analyzer.getLintIssues();
      const counts = analyzer.countIssues(issues);

      const severityTotal =
        counts.bySeverity.error +
        counts.bySeverity.warning +
        counts.bySeverity.info;
      expect(severityTotal).toBe(counts.total);
    });
  });

  describe("getUsageStatistics", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should return usage statistics", async () => {
      const stats = await analyzer.getUsageStatistics();

      expect(stats.totalManifests).toBeGreaterThan(0);
      expect(stats.totalClasses).toBeGreaterThan(0);
      expect(stats.linesOfCode).toBeGreaterThan(0);
    });

    it("should count classes correctly", async () => {
      const stats = await analyzer.getUsageStatistics();

      expect(stats.totalClasses).toBe(analyzer.getClasses().size);
    });

    it("should count defined types correctly", async () => {
      const stats = await analyzer.getUsageStatistics();

      expect(stats.totalDefinedTypes).toBe(analyzer.getDefinedTypes().size);
    });

    it("should rank classes by usage frequency", async () => {
      const stats = await analyzer.getUsageStatistics();

      // Verify mostUsedClasses is sorted by usageCount descending
      for (let i = 1; i < stats.mostUsedClasses.length; i++) {
        expect(stats.mostUsedClasses[i - 1].usageCount).toBeGreaterThanOrEqual(
          stats.mostUsedClasses[i].usageCount
        );
      }
    });

    it("should rank resources by count", async () => {
      const stats = await analyzer.getUsageStatistics();

      // Verify mostUsedResources is sorted by count descending
      for (let i = 1; i < stats.mostUsedResources.length; i++) {
        expect(stats.mostUsedResources[i - 1].count).toBeGreaterThanOrEqual(
          stats.mostUsedResources[i].count
        );
      }
    });

    it("should include class usage information", async () => {
      const stats = await analyzer.getUsageStatistics();

      // profile::base is included by profile::nginx
      const baseClass = stats.mostUsedClasses.find(c => c.name === "profile::base");
      expect(baseClass).toBeDefined();
      expect(baseClass?.usageCount).toBeGreaterThan(0);
    });

    it("should include resource usage information", async () => {
      const stats = await analyzer.getUsageStatistics();

      // package and service resources are used in the test manifests
      const packageResource = stats.mostUsedResources.find(r => r.type === "package");
      expect(packageResource).toBeDefined();
      expect(packageResource?.count).toBeGreaterThan(0);
    });

    it("should count manifests correctly", async () => {
      const stats = await analyzer.getUsageStatistics();

      // We created 6 manifest files in the test setup (including lint_test.pp)
      expect(stats.totalManifests).toBe(6);
    });

    it("should calculate lines of code", async () => {
      const stats = await analyzer.getUsageStatistics();

      // Lines of code should be positive and reasonable
      expect(stats.linesOfCode).toBeGreaterThan(0);
      expect(stats.linesOfCode).toBeLessThan(1000); // Sanity check for test data
    });

    it("should count functions when present", async () => {
      const stats = await analyzer.getUsageStatistics();

      // totalFunctions should be a number (may be 0 if no functions in test repo)
      expect(typeof stats.totalFunctions).toBe("number");
      expect(stats.totalFunctions).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getModuleUpdates", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should parse Puppetfile modules", async () => {
      const updates = await analyzer.getModuleUpdates();

      expect(updates.length).toBeGreaterThan(0);
    });

    it("should extract module names and versions", async () => {
      const updates = await analyzer.getModuleUpdates();

      const stdlibModule = updates.find((m) => m.name.includes("stdlib"));
      expect(stdlibModule).toBeDefined();
      expect(stdlibModule?.currentVersion).toBe("8.0.0");
    });

    it("should identify forge vs git modules", async () => {
      const updates = await analyzer.getModuleUpdates();

      const forgeModules = updates.filter((m) => m.source === "forge");
      const gitModules = updates.filter((m) => m.source === "git");

      expect(forgeModules.length).toBeGreaterThan(0);
      expect(gitModules.length).toBeGreaterThan(0);
    });
  });

  describe("cache management", () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it("should clear cache", async () => {
      // Populate cache
      await analyzer.analyze();

      // Clear cache
      analyzer.clearCache();

      // Next analysis should have different timestamp
      const result1 = await analyzer.analyze();
      analyzer.clearCache();

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await analyzer.analyze();

      expect(result1.analyzedAt).not.toBe(result2.analyzedAt);
    });

    it("should reload analyzer", async () => {
      const classesBefore = analyzer.getClasses().size;

      await analyzer.reload();

      const classesAfter = analyzer.getClasses().size;
      expect(classesAfter).toBe(classesBefore);
    });
  });

  describe("error handling", () => {
    it("should throw error when not initialized", async () => {
      await expect(analyzer.analyze()).rejects.toThrow("not initialized");
    });
  });
});

/**
 * Create a test control repository structure
 */
function createTestControlRepo(testDir: string): void {
  // Create directories
  fs.mkdirSync(path.join(testDir, "manifests", "profile"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "data"), { recursive: true });

  // Create profile::nginx class
  const nginxManifest = `
# @summary Manages nginx configuration
class profile::nginx (
  Integer $port = 80,
  Integer $workers = 4,
) {
  include profile::base

  package { 'nginx':
    ensure => present,
  }

  service { 'nginx':
    ensure => running,
  }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "nginx.pp"), nginxManifest);

  // Create profile::base class
  const baseManifest = `
class profile::base {
  package { 'vim':
    ensure => present,
  }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "base.pp"), baseManifest);

  // Create profile::unused class (not included anywhere)
  const unusedManifest = `
class profile::unused {
  notify { 'unused': }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "unused.pp"), unusedManifest);

  // Create a file with trailing whitespace for lint testing
  const lintTestManifest = `
class profile::lint_test {   
  # This line has trailing spaces   
  notify { 'test': }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "lint_test.pp"), lintTestManifest);

  // Create profile::vhost defined type
  const vhostManifest = `
define profile::vhost (
  String $docroot,
  Integer $port = 80,
) {
  file { "/etc/nginx/sites-available/\${title}":
    ensure  => file,
    content => "server { listen \${port}; root \${docroot}; }",
  }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "vhost.pp"), vhostManifest);

  // Create profile::unused_type defined type (not instantiated anywhere)
  const unusedTypeManifest = `
define profile::unused_type (
  String $param,
) {
  notify { "unused_type: \${title}": }
}
`;
  fs.writeFileSync(path.join(testDir, "manifests", "profile", "unused_type.pp"), unusedTypeManifest);

  // Create hieradata
  const commonData = `
profile::nginx::port: 8080
profile::nginx::workers: 4
unused_key: "this key is not used"
`;
  fs.writeFileSync(path.join(testDir, "data", "common.yaml"), commonData);

  // Create hiera.yaml
  const hieraConfig = `
version: 5
defaults:
  datadir: data
  data_hash: yaml_data
hierarchy:
  - name: "Common data"
    path: "common.yaml"
`;
  fs.writeFileSync(path.join(testDir, "hiera.yaml"), hieraConfig);

  // Create Puppetfile
  const puppetfile = `
forge 'https://forge.puppet.com'

mod 'puppetlabs/stdlib', '8.0.0'
mod 'puppetlabs/concat', '7.0.0'

mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git',
  :tag => 'v1.0.0'
`;
  fs.writeFileSync(path.join(testDir, "Puppetfile"), puppetfile);
}
