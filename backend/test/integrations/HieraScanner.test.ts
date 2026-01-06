/**
 * HieraScanner Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { HieraScanner } from "../../src/integrations/hiera/HieraScanner";

describe("HieraScanner", () => {
  let scanner: HieraScanner;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-scanner-test-"));
    scanner = new HieraScanner(testDir, "data");
  });

  afterEach(() => {
    // Clean up test directory
    scanner.stopWatching();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a test file
   */
  function createTestFile(relativePath: string, content: string): void {
    const fullPath = path.join(testDir, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  describe("scan", () => {
    it("should scan an empty directory", async () => {
      fs.mkdirSync(path.join(testDir, "data"), { recursive: true });

      const index = await scanner.scan();

      expect(index.totalKeys).toBe(0);
      expect(index.totalFiles).toBe(0);
      expect(index.lastScan).toBeTruthy();
    });

    it("should scan a single YAML file", async () => {
      createTestFile("data/common.yaml", `
profile::nginx::port: 8080
profile::nginx::workers: 4
`);

      const index = await scanner.scan();

      expect(index.totalKeys).toBe(2);
      expect(index.totalFiles).toBe(1);
      expect(index.keys.has("profile::nginx::port")).toBe(true);
      expect(index.keys.has("profile::nginx::workers")).toBe(true);
    });

    it("should scan multiple YAML files", async () => {
      createTestFile("data/common.yaml", `
common_key: common_value
`);
      createTestFile("data/nodes/node1.yaml", `
node_key: node_value
`);

      const index = await scanner.scan();

      expect(index.totalKeys).toBe(2);
      expect(index.totalFiles).toBe(2);
      expect(index.keys.has("common_key")).toBe(true);
      expect(index.keys.has("node_key")).toBe(true);
    });

    it("should scan JSON files", async () => {
      createTestFile("data/common.json", JSON.stringify({
        "json_key": "json_value",
        "another_key": 123
      }));

      const index = await scanner.scan();

      expect(index.totalKeys).toBe(2);
      expect(index.keys.has("json_key")).toBe(true);
      expect(index.keys.has("another_key")).toBe(true);
    });

    it("should handle non-existent directory gracefully", async () => {
      scanner = new HieraScanner(testDir, "nonexistent");

      const index = await scanner.scan();

      expect(index.totalKeys).toBe(0);
      expect(index.totalFiles).toBe(0);
    });
  });


  describe("nested key support", () => {
    it("should extract nested keys with dot notation", async () => {
      createTestFile("data/common.yaml", `
profile:
  nginx:
    port: 8080
    workers: 4
`);

      const index = await scanner.scan();

      // Should have both the parent and nested keys
      expect(index.keys.has("profile")).toBe(true);
      expect(index.keys.has("profile.nginx")).toBe(true);
      expect(index.keys.has("profile.nginx.port")).toBe(true);
      expect(index.keys.has("profile.nginx.workers")).toBe(true);
    });

    it("should handle deeply nested structures", async () => {
      createTestFile("data/common.yaml", `
level1:
  level2:
    level3:
      level4:
        value: deep
`);

      const index = await scanner.scan();

      expect(index.keys.has("level1.level2.level3.level4.value")).toBe(true);
      const key = index.keys.get("level1.level2.level3.level4.value");
      expect(key?.locations[0].value).toBe("deep");
    });

    it("should handle Puppet-style double-colon keys", async () => {
      createTestFile("data/common.yaml", `
"profile::nginx::port": 8080
"profile::nginx::workers": 4
`);

      const index = await scanner.scan();

      expect(index.keys.has("profile::nginx::port")).toBe(true);
      expect(index.keys.has("profile::nginx::workers")).toBe(true);
    });
  });

  describe("multi-occurrence tracking", () => {
    it("should track key in multiple files", async () => {
      createTestFile("data/common.yaml", `
shared_key: common_value
`);
      createTestFile("data/nodes/node1.yaml", `
shared_key: node_value
`);

      const index = await scanner.scan();

      const key = index.keys.get("shared_key");
      expect(key).toBeDefined();
      expect(key?.locations.length).toBe(2);

      const values = key?.locations.map(loc => loc.value);
      expect(values).toContain("common_value");
      expect(values).toContain("node_value");
    });

    it("should track file path for each occurrence", async () => {
      createTestFile("data/common.yaml", `
shared_key: common_value
`);
      createTestFile("data/os/RedHat.yaml", `
shared_key: redhat_value
`);

      const index = await scanner.scan();

      const key = index.keys.get("shared_key");
      const files = key?.locations.map(loc => loc.file);

      expect(files).toContain("data/common.yaml");
      expect(files).toContain("data/os/RedHat.yaml");
    });

    it("should track hierarchy level for each occurrence", async () => {
      createTestFile("data/common.yaml", `
shared_key: common_value
`);
      createTestFile("data/nodes/node1.yaml", `
shared_key: node_value
`);

      const index = await scanner.scan();

      const key = index.keys.get("shared_key");
      const levels = key?.locations.map(loc => loc.hierarchyLevel);

      expect(levels).toContain("Common data");
      expect(levels).toContain("Per-node data");
    });
  });

  describe("searchKeys", () => {
    beforeEach(async () => {
      createTestFile("data/common.yaml", `
profile::nginx::port: 8080
profile::nginx::workers: 4
profile::apache::port: 80
database::mysql::port: 3306
`);
      await scanner.scan();
    });

    it("should find keys by partial match", () => {
      const results = scanner.searchKeys("nginx");

      expect(results.length).toBe(2);
      expect(results.map(k => k.name)).toContain("profile::nginx::port");
      expect(results.map(k => k.name)).toContain("profile::nginx::workers");
    });

    it("should be case-insensitive", () => {
      const results = scanner.searchKeys("NGINX");

      expect(results.length).toBe(2);
    });

    it("should return all keys for empty query", () => {
      const results = scanner.searchKeys("");

      expect(results.length).toBe(4);
    });

    it("should return empty array for no matches", () => {
      const results = scanner.searchKeys("nonexistent");

      expect(results.length).toBe(0);
    });

    it("should find keys by suffix", () => {
      const results = scanner.searchKeys("port");

      expect(results.length).toBe(3);
    });
  });


  describe("parseFileContent", () => {
    it("should parse valid YAML content", () => {
      const content = `
key1: value1
key2: 123
key3: true
`;
      const result = scanner.parseFileContent(content, "test.yaml");

      expect(result.success).toBe(true);
      expect(result.keys.size).toBe(3);
    });

    it("should handle invalid YAML gracefully", () => {
      const content = `invalid: yaml: content:`;
      const result = scanner.parseFileContent(content, "test.yaml");

      expect(result.success).toBe(false);
      expect(result.error).toContain("YAML parse error");
    });

    it("should handle empty content", () => {
      const result = scanner.parseFileContent("", "test.yaml");

      expect(result.success).toBe(true);
      expect(result.keys.size).toBe(0);
    });

    it("should extract lookup_options", () => {
      const content = `
profile::packages:
  - vim
  - git
lookup_options:
  profile::packages:
    merge: unique
`;
      const result = scanner.parseFileContent(content, "test.yaml");

      expect(result.success).toBe(true);
      expect(result.lookupOptions.has("profile::packages")).toBe(true);
      expect(result.lookupOptions.get("profile::packages")?.merge).toBe("unique");
    });

    it("should not include lookup_options as a key", () => {
      const content = `
real_key: value
lookup_options:
  real_key:
    merge: deep
`;
      const result = scanner.parseFileContent(content, "test.yaml");

      expect(result.success).toBe(true);
      expect(result.keys.has("real_key")).toBe(true);
      expect(result.keys.has("lookup_options")).toBe(false);
    });
  });

  describe("hierarchy level detection", () => {
    it("should detect common data level", async () => {
      createTestFile("data/common.yaml", `key: value`);
      await scanner.scan();

      const fileInfo = scanner.getKeyIndex().files.get("data/common.yaml");
      expect(fileInfo?.hierarchyLevel).toBe("Common data");
    });

    it("should detect per-node data level", async () => {
      createTestFile("data/nodes/node1.yaml", `key: value`);
      await scanner.scan();

      const fileInfo = scanner.getKeyIndex().files.get("data/nodes/node1.yaml");
      expect(fileInfo?.hierarchyLevel).toBe("Per-node data");
    });

    it("should detect per-OS data level", async () => {
      createTestFile("data/os/RedHat.yaml", `key: value`);
      await scanner.scan();

      const fileInfo = scanner.getKeyIndex().files.get("data/os/RedHat.yaml");
      expect(fileInfo?.hierarchyLevel).toBe("Per-OS data");
    });

    it("should detect per-environment data level", async () => {
      createTestFile("data/environments/production.yaml", `key: value`);
      await scanner.scan();

      const fileInfo = scanner.getKeyIndex().files.get("data/environments/production.yaml");
      expect(fileInfo?.hierarchyLevel).toBe("Per-environment data");
    });
  });

  describe("file watching", () => {
    it("should start watching for changes", () => {
      fs.mkdirSync(path.join(testDir, "data"), { recursive: true });

      scanner.watchForChanges(() => {});

      expect(scanner.isWatchingForChanges()).toBe(true);
    });

    it("should stop watching", () => {
      fs.mkdirSync(path.join(testDir, "data"), { recursive: true });

      scanner.watchForChanges(() => {});
      scanner.stopWatching();

      expect(scanner.isWatchingForChanges()).toBe(false);
    });
  });

  describe("cache invalidation", () => {
    it("should invalidate specific files", async () => {
      createTestFile("data/common.yaml", `key1: value1`);
      createTestFile("data/other.yaml", `key2: value2`);
      await scanner.scan();

      expect(scanner.getKeyIndex().keys.has("key1")).toBe(true);
      expect(scanner.getKeyIndex().keys.has("key2")).toBe(true);

      scanner.invalidateFiles(["data/common.yaml"]);

      expect(scanner.getKeyIndex().keys.has("key1")).toBe(false);
      expect(scanner.getKeyIndex().keys.has("key2")).toBe(true);
    });

    it("should rescan files after invalidation", async () => {
      createTestFile("data/common.yaml", `key1: value1`);
      await scanner.scan();

      // Modify the file
      createTestFile("data/common.yaml", `key1: updated_value`);

      await scanner.rescanFiles(["data/common.yaml"]);

      const key = scanner.getKey("key1");
      expect(key?.locations[0].value).toBe("updated_value");
    });
  });

  describe("getKey and getAllKeys", () => {
    beforeEach(async () => {
      createTestFile("data/common.yaml", `
key1: value1
key2: value2
`);
      await scanner.scan();
    });

    it("should get a specific key", () => {
      const key = scanner.getKey("key1");

      expect(key).toBeDefined();
      expect(key?.name).toBe("key1");
      expect(key?.locations[0].value).toBe("value1");
    });

    it("should return undefined for non-existent key", () => {
      const key = scanner.getKey("nonexistent");

      expect(key).toBeUndefined();
    });

    it("should get all keys", () => {
      const keys = scanner.getAllKeys();

      expect(keys.length).toBe(2);
      expect(keys.map(k => k.name)).toContain("key1");
      expect(keys.map(k => k.name)).toContain("key2");
    });
  });
});
