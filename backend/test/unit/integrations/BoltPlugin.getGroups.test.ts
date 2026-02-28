/**
 * Unit tests for BoltPlugin.getGroups() method
 * Tests group extraction from Bolt inventory.yaml files
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BoltPlugin } from "../../../src/integrations/bolt/BoltPlugin";
import type { BoltService } from "../../../src/integrations/bolt/BoltService";
import type { IntegrationConfig } from "../../../src/integrations/types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("BoltPlugin.getGroups()", () => {
  let mockBoltService: BoltService;
  let boltPlugin: BoltPlugin;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test inventory files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bolt-test-"));

    // Create mock BoltService
    mockBoltService = {
      getInventory: vi.fn().mockResolvedValue([
        { id: "web1.example.com", name: "web1.example.com", uri: "ssh://web1.example.com", transport: "ssh" as const },
        { id: "web2.example.com", name: "web2.example.com", uri: "ssh://web2.example.com", transport: "ssh" as const },
        { id: "db1.example.com", name: "db1.example.com", uri: "ssh://db1.example.com", transport: "ssh" as const },
      ]),
      getBoltProjectPath: vi.fn().mockReturnValue(tempDir),
      gatherFacts: vi.fn(),
      runCommand: vi.fn(),
      runTask: vi.fn(),
    } as unknown as BoltService;

    boltPlugin = new BoltPlugin(mockBoltService);

    // Initialize plugin
    const config: IntegrationConfig = {
      enabled: true,
      name: "bolt",
      type: "both",
      config: {},
      priority: 5,
    };
    await boltPlugin.initialize(config);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should return empty array when no inventory file exists", async () => {
    const groups = await boltPlugin.getGroups();
    expect(groups).toEqual([]);
  });

  it("should return empty array when inventory has no groups section", async () => {
    const inventoryContent = `
targets:
  - name: web1.example.com
    uri: ssh://web1.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();
    expect(groups).toEqual([]);
  });

  it("should parse simple group with targets", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - web1.example.com
      - web2.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "bolt:web_servers",
      name: "web_servers",
      source: "bolt",
      sources: ["bolt"],
      linked: false,
      nodes: ["bolt:web1.example.com", "bolt:web2.example.com"],
    });
  });

  it("should include vars in metadata", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - web1.example.com
    vars:
      role: webserver
      http_port: 80
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].metadata?.variables).toEqual({
      role: "webserver",
      http_port: 80,
    });
  });

  it("should include config in metadata", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - web1.example.com
    config:
      transport: ssh
      ssh:
        user: deploy
        port: 22
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].metadata?.config).toEqual({
      transport: "ssh",
      ssh: {
        user: "deploy",
        port: 22,
      },
    });
  });

  it("should include description in metadata", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    description: Production web servers
    targets:
      - web1.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].metadata?.description).toBe("Production web servers");
  });

  it("should handle nested groups in hierarchy", async () => {
    const inventoryContent = `
groups:
  - name: production
    groups:
      - web_servers
      - db_servers
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "bolt:production",
      name: "production",
      nodes: [],
    });
    expect(groups[0].metadata?.hierarchy).toEqual(["web_servers", "db_servers"]);
  });

  it("should parse multiple groups", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - web1.example.com
      - web2.example.com
  - name: db_servers
    targets:
      - db1.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("web_servers");
    expect(groups[0].nodes).toEqual(["bolt:web1.example.com", "bolt:web2.example.com"]);
    expect(groups[1].name).toBe("db_servers");
    expect(groups[1].nodes).toEqual(["bolt:db1.example.com"]);
  });

  it("should handle target objects with name property", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - name: web1.example.com
        uri: ssh://web1.example.com
      - name: web2.example.com
        uri: ssh://web2.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].nodes).toEqual(["bolt:web1.example.com", "bolt:web2.example.com"]);
  });

  it("should skip groups without name", async () => {
    const inventoryContent = `
groups:
  - targets:
      - web1.example.com
  - name: valid_group
    targets:
      - web2.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("valid_group");
  });

  it("should handle inventory.yml extension", async () => {
    const inventoryContent = `
groups:
  - name: web_servers
    targets:
      - web1.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("web_servers");
  });

  it("should prefer inventory.yaml over inventory.yml", async () => {
    const yamlContent = `
groups:
  - name: from_yaml
    targets:
      - web1.example.com
`;
    const ymlContent = `
groups:
  - name: from_yml
    targets:
      - web2.example.com
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), yamlContent);
    fs.writeFileSync(path.join(tempDir, "inventory.yml"), ymlContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("from_yaml");
  });

  it("should handle complex group with all features", async () => {
    const inventoryContent = `
groups:
  - name: production_web
    description: Production web server cluster
    targets:
      - web1.example.com
      - web2.example.com
    groups:
      - web_common
    vars:
      environment: production
      role: webserver
    config:
      transport: ssh
      ssh:
        user: deploy
        port: 22
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), inventoryContent);

    const groups = await boltPlugin.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "bolt:production_web",
      name: "production_web",
      source: "bolt",
      sources: ["bolt"],
      linked: false,
      nodes: ["bolt:web1.example.com", "bolt:web2.example.com"],
    });
    expect(groups[0].metadata).toMatchObject({
      description: "Production web server cluster",
      variables: {
        environment: "production",
        role: "webserver",
      },
      config: {
        transport: "ssh",
        ssh: {
          user: "deploy",
          port: 22,
        },
      },
      hierarchy: ["web_common"],
    });
  });

  it("should return empty array on YAML parse error", async () => {
    const invalidYaml = `
groups:
  - name: web_servers
    targets: [invalid yaml structure
`;
    fs.writeFileSync(path.join(tempDir, "inventory.yaml"), invalidYaml);

    const groups = await boltPlugin.getGroups();
    expect(groups).toEqual([]);
  });
});
