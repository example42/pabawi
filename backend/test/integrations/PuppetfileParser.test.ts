/**
 * PuppetfileParser Unit Tests
 *
 * Tests for the PuppetfileParser class that parses Puppetfile
 * to extract module dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PuppetfileParser } from "../../src/integrations/hiera/PuppetfileParser";

describe("PuppetfileParser", () => {
  let parser: PuppetfileParser;
  let testDir: string;

  beforeEach(() => {
    parser = new PuppetfileParser();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "puppetfile-test-"));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("parse", () => {
    it("should parse simple forge modules", () => {
      const content = `
mod 'puppetlabs/stdlib', '8.0.0'
mod 'puppetlabs/concat', '7.0.0'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules).toHaveLength(2);
      expect(result.modules[0].name).toBe("puppetlabs/stdlib");
      expect(result.modules[0].version).toBe("8.0.0");
      expect(result.modules[0].source).toBe("forge");
      expect(result.modules[1].name).toBe("puppetlabs/concat");
      expect(result.modules[1].version).toBe("7.0.0");
    });

    it("should parse forge modules with hyphen format", () => {
      const content = `mod 'puppetlabs-stdlib', '8.0.0'`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].name).toBe("puppetlabs/stdlib");
      expect(result.modules[0].forgeSlug).toBe("puppetlabs-stdlib");
    });

    it("should parse forge modules without version", () => {
      const content = `mod 'puppetlabs/stdlib'`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].version).toBe("latest");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("no version specified");
    });

    it("should parse git modules with tag", () => {
      const content = `
mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git',
  :tag => 'v1.0.0'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].name).toBe("custom_module");
      expect(result.modules[0].version).toBe("v1.0.0");
      expect(result.modules[0].source).toBe("git");
      expect(result.modules[0].gitUrl).toBe("https://github.com/example/custom_module.git");
      expect(result.modules[0].gitTag).toBe("v1.0.0");
    });

    it("should parse git modules with branch", () => {
      const content = `
mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git',
  :branch => 'main'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].version).toBe("main");
      expect(result.modules[0].gitBranch).toBe("main");
    });

    it("should parse git modules with commit", () => {
      const content = `
mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git',
  :commit => 'abc123'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].version).toBe("abc123");
      expect(result.modules[0].gitCommit).toBe("abc123");
    });

    it("should parse git modules without ref (defaults to HEAD)", () => {
      const content = `
mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].version).toBe("HEAD");
    });

    it("should parse local modules", () => {
      const content = `mod 'local_module', :local => true`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules[0].name).toBe("local_module");
      expect(result.modules[0].version).toBe("local");
    });

    it("should parse forge directive", () => {
      const content = `
forge 'https://forge.puppet.com'
mod 'puppetlabs/stdlib', '8.0.0'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.forgeUrl).toBe("https://forge.puppet.com");
    });

    it("should parse moduledir directive", () => {
      const content = `
moduledir '.modules'
mod 'puppetlabs/stdlib', '8.0.0'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.moduledir).toBe(".modules");
    });

    it("should skip comments", () => {
      const content = `
# This is a comment
mod 'puppetlabs/stdlib', '8.0.0'
# Another comment
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.modules).toHaveLength(1);
    });

    it("should track line numbers", () => {
      const content = `
mod 'puppetlabs/stdlib', '8.0.0'

mod 'puppetlabs/concat', '7.0.0'
`;
      const result = parser.parse(content);

      expect(result.modules[0].line).toBe(2);
      expect(result.modules[1].line).toBe(4);
    });
  });

  describe("error handling", () => {
    it("should report error for invalid module declaration", () => {
      const content = `mod invalid syntax here`;
      const result = parser.parse(content);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Failed to parse");
      expect(result.errors[0].line).toBe(1);
    });

    it("should report error for unclosed multi-line module", () => {
      const content = `
mod 'custom_module',
  :git => 'https://github.com/example/custom_module.git',
`;
      const result = parser.parse(content);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.message.includes("Unclosed"))).toBe(true);
    });

    it("should warn about unknown directives", () => {
      const content = `
unknown_directive 'value'
mod 'puppetlabs/stdlib', '8.0.0'
`;
      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("Unknown directive"))).toBe(true);
    });

    it("should handle file read errors", () => {
      const result = parser.parseFile("/nonexistent/path/Puppetfile");

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Failed to read");
    });
  });

  describe("parseFile", () => {
    it("should parse a Puppetfile from disk", () => {
      const puppetfilePath = path.join(testDir, "Puppetfile");
      fs.writeFileSync(
        puppetfilePath,
        `
forge 'https://forge.puppet.com'
mod 'puppetlabs/stdlib', '8.0.0'
`
      );

      const result = parser.parseFile(puppetfilePath);

      expect(result.success).toBe(true);
      expect(result.modules).toHaveLength(1);
      expect(result.forgeUrl).toBe("https://forge.puppet.com");
    });
  });

  describe("toModuleUpdates", () => {
    it("should convert parsed modules to ModuleUpdate format", () => {
      const content = `
mod 'puppetlabs/stdlib', '8.0.0'
mod 'custom_module', :git => 'https://github.com/example/custom_module.git', :tag => 'v1.0.0'
`;
      const result = parser.parse(content);
      const updates = parser.toModuleUpdates(result.modules);

      expect(updates).toHaveLength(2);
      expect(updates[0].name).toBe("puppetlabs/stdlib");
      expect(updates[0].currentVersion).toBe("8.0.0");
      expect(updates[0].source).toBe("forge");
      expect(updates[1].name).toBe("custom_module");
      expect(updates[1].source).toBe("git");
    });
  });

  describe("getErrorSummary", () => {
    it("should return null for successful parse", () => {
      const content = `mod 'puppetlabs/stdlib', '8.0.0'`;
      const result = parser.parse(content);
      const summary = parser.getErrorSummary(result);

      expect(summary).toBeNull();
    });

    it("should return formatted error summary", () => {
      const content = `mod invalid syntax`;
      const result = parser.parse(content);
      const summary = parser.getErrorSummary(result);

      expect(summary).not.toBeNull();
      expect(summary).toContain("Puppetfile parse errors");
      expect(summary).toContain("Line 1");
    });
  });

  describe("validate", () => {
    it("should validate a valid Puppetfile", () => {
      const puppetfilePath = path.join(testDir, "Puppetfile");
      fs.writeFileSync(puppetfilePath, `mod 'puppetlabs/stdlib', '8.0.0'`);

      const result = parser.validate(puppetfilePath);

      expect(result.valid).toBe(true);
      expect(result.modules).toHaveLength(1);
    });

    it("should report validation issues for unpinned versions", () => {
      const puppetfilePath = path.join(testDir, "Puppetfile");
      fs.writeFileSync(puppetfilePath, `mod 'puppetlabs/stdlib'`);

      const result = parser.validate(puppetfilePath);

      expect(result.valid).toBe(true); // Still valid, just has warnings
      expect(result.issues.some((i) => i.message.includes("no version pinned"))).toBe(true);
    });

    it("should report validation issues for git modules without ref", () => {
      const puppetfilePath = path.join(testDir, "Puppetfile");
      fs.writeFileSync(
        puppetfilePath,
        `mod 'custom', :git => 'https://github.com/example/custom.git'`
      );

      const result = parser.validate(puppetfilePath);

      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.message.includes("no tag, branch, or commit"))).toBe(true);
    });
  });
});
