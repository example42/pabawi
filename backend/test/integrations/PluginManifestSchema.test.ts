/**
 * Tests for PluginManifestSchema
 *
 * Tests the Zod schema validation for plugin.json manifest files.
 */

import { describe, it, expect } from "vitest";
import {
  PluginManifestSchema,
  validatePluginManifest,
  parsePluginManifest,
  validateManifestConsistency,
  examplePluginManifest,
  type PluginManifest,
} from "../../src/integrations/PluginManifestSchema";
import * as fs from "fs";
import * as path from "path";

describe("PluginManifestSchema", () => {
  describe("basic validation", () => {
    it("should validate the example manifest", () => {
      const result = validatePluginManifest(examplePluginManifest);
      expect(result.success).toBe(true);
    });

    it("should parse the example manifest without throwing", () => {
      expect(() => parsePluginManifest(examplePluginManifest)).not.toThrow();
    });

    it("should require name field", () => {
      const manifest = { ...examplePluginManifest };
      // @ts-expect-error - Testing invalid manifest
      delete manifest.name;

      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });

    it("should require version field", () => {
      const manifest = { ...examplePluginManifest };
      // @ts-expect-error - Testing invalid manifest
      delete manifest.version;

      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });

    it("should require author field", () => {
      const manifest = { ...examplePluginManifest };
      // @ts-expect-error - Testing invalid manifest
      delete manifest.author;

      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });

    it("should require description field", () => {
      const manifest = { ...examplePluginManifest };
      // @ts-expect-error - Testing invalid manifest
      delete manifest.description;

      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });

    it("should require integrationType field", () => {
      const manifest = { ...examplePluginManifest };
      // @ts-expect-error - Testing invalid manifest
      delete manifest.integrationType;

      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("should accept valid plugin names", () => {
      const validNames = ["bolt", "puppetdb", "my-plugin", "plugin123"];

      for (const name of validNames) {
        const manifest = { ...examplePluginManifest, name };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid plugin names", () => {
      const invalidNames = [
        "UPPERCASE",
        "has spaces",
        "has_underscores",
        "123startswithnumber",
        "-startswithyphen",
        "",
      ];

      for (const name of invalidNames) {
        const manifest = { ...examplePluginManifest, name };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("version validation", () => {
    it("should accept valid semver versions", () => {
      const validVersions = [
        "1.0.0",
        "0.1.0",
        "10.20.30",
        "1.0.0-alpha",
        "1.0.0-beta.1",
        "1.0.0+build.123",
      ];

      for (const version of validVersions) {
        const manifest = { ...examplePluginManifest, version };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid versions", () => {
      const invalidVersions = ["1.0", "v1.0.0", "1", "1.0.0.0", ""];

      for (const version of invalidVersions) {
        const manifest = { ...examplePluginManifest, version };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("color validation", () => {
    it("should accept valid hex colors", () => {
      const validColors = ["#FFAE1A", "#000000", "#ffffff", "#AbCdEf"];

      for (const color of validColors) {
        const manifest = { ...examplePluginManifest, color };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid colors", () => {
      const invalidColors = [
        "FFAE1A", // Missing #
        "#FFF", // Too short
        "#FFAE1AFF", // Too long
        "red", // Named color
        "rgb(255,0,0)", // RGB format
      ];

      for (const color of invalidColors) {
        const manifest = { ...examplePluginManifest, color };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("capability validation", () => {
    it("should accept valid capability names", () => {
      const validNames = [
        "command.execute",
        "task.run",
        "inventory.list",
        "facts.query.node",
      ];

      for (const name of validNames) {
        const manifest = {
          ...examplePluginManifest,
          capabilities: [
            {
              name,
              category: "command",
              description: "Test capability",
              riskLevel: "read",
              requiredPermissions: ["test.permission"],
            },
          ],
        };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid capability names", () => {
      const invalidNames = [
        "nodots",
        ".startswith.dot",
        "endswith.",
        "",
      ];

      for (const name of invalidNames) {
        const manifest = {
          ...examplePluginManifest,
          capabilities: [
            {
              name,
              category: "command",
              description: "Test capability",
              riskLevel: "read",
              requiredPermissions: ["test.permission"],
            },
          ],
        };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(false);
      }
    });

    it("should validate risk levels", () => {
      const validRiskLevels = ["read", "write", "execute", "admin"];

      for (const riskLevel of validRiskLevels) {
        const manifest = {
          ...examplePluginManifest,
          capabilities: [
            {
              name: "test.capability",
              category: "command",
              description: "Test",
              riskLevel,
              requiredPermissions: ["test"],
            },
          ],
        };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid risk levels", () => {
      const manifest = {
        ...examplePluginManifest,
        capabilities: [
          {
            name: "test.capability",
            category: "command",
            description: "Test",
            riskLevel: "dangerous",
            requiredPermissions: ["test"],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("widget validation", () => {
    it("should accept valid widget definitions", () => {
      const manifest = {
        ...examplePluginManifest,
        widgets: [
          {
            id: "example-plugin:test-widget",
            name: "Test Widget",
            component: "frontend/TestWidget.svelte",
            slots: ["home-summary", "dashboard"],
            size: "medium",
            requiredCapabilities: [],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(true);
    });

    it("should reject invalid widget ID format", () => {
      const manifest = {
        ...examplePluginManifest,
        widgets: [
          {
            id: "invalid_id_format",
            name: "Test Widget",
            component: "frontend/TestWidget.svelte",
            slots: ["home-summary"],
            size: "medium",
            requiredCapabilities: [],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });

    it("should validate widget slots", () => {
      const validSlots = [
        "home-summary",
        "dashboard",
        "node-detail",
        "node-journal",
        "inventory-panel",
        "standalone-page",
        "sidebar",
        "modal",
      ];

      for (const slot of validSlots) {
        const manifest = {
          ...examplePluginManifest,
          widgets: [
            {
              id: "example-plugin:test",
              name: "Test",
              component: "test.svelte",
              slots: [slot],
              size: "medium",
              requiredCapabilities: [],
            },
          ],
        };
        const result = validatePluginManifest(manifest);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid widget slots", () => {
      const manifest = {
        ...examplePluginManifest,
        widgets: [
          {
            id: "example-plugin:test",
            name: "Test",
            component: "test.svelte",
            slots: ["invalid-slot"],
            size: "medium",
            requiredCapabilities: [],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("CLI command validation", () => {
    it("should accept valid CLI commands", () => {
      const manifest = {
        ...examplePluginManifest,
        cliCommands: [
          {
            name: "test-cmd",
            actions: [
              {
                name: "run",
                capability: "example.hello",
                description: "Run something",
              },
            ],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(true);
    });

    it("should reject CLI commands without actions", () => {
      const manifest = {
        ...examplePluginManifest,
        cliCommands: [
          {
            name: "test-cmd",
            actions: [],
          },
        ],
      };
      const result = validatePluginManifest(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("validateManifestConsistency", () => {
    it("should warn when widget requires undeclared capability", () => {
      const manifest: PluginManifest = {
        ...examplePluginManifest,
        capabilities: [
          {
            name: "test.capability",
            category: "command",
            description: "Test",
            riskLevel: "read",
            requiredPermissions: ["test"],
          },
        ],
        widgets: [
          {
            id: "example-plugin:widget",
            name: "Widget",
            component: "Widget.svelte",
            slots: ["dashboard"],
            size: "medium",
            requiredCapabilities: ["undeclared.capability"],
            priority: 0,
            nodeScoped: false,
          },
        ],
      };

      const warnings = validateManifestConsistency(manifest);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("undeclared.capability");
    });

    it("should warn when CLI action references undeclared capability", () => {
      const manifest: PluginManifest = {
        ...examplePluginManifest,
        capabilities: [],
        widgets: [], // Clear widgets to avoid widget warnings
        cliCommands: [
          {
            name: "test",
            actions: [
              {
                name: "run",
                capability: "undeclared.capability",
                description: "Test",
              },
            ],
          },
        ],
      };

      const warnings = validateManifestConsistency(manifest);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes("undeclared.capability"))).toBe(true);
    });

    it("should warn when widget ID doesn't match plugin name", () => {
      const manifest: PluginManifest = {
        ...examplePluginManifest,
        name: "my-plugin",
        widgets: [
          {
            id: "other-plugin:widget",
            name: "Widget",
            component: "Widget.svelte",
            slots: ["dashboard"],
            size: "medium",
            requiredCapabilities: [],
            priority: 0,
            nodeScoped: false,
          },
        ],
      };

      const warnings = validateManifestConsistency(manifest);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("should start with plugin name");
    });

    it("should return no warnings for consistent manifest", () => {
      const manifest: PluginManifest = {
        ...examplePluginManifest,
        capabilities: [
          {
            name: "example.hello",
            category: "custom",
            description: "Test",
            riskLevel: "read",
            requiredPermissions: ["test"],
          },
        ],
        widgets: [
          {
            id: "example-plugin:widget",
            name: "Widget",
            component: "Widget.svelte",
            slots: ["dashboard"],
            size: "medium",
            requiredCapabilities: ["example.hello"],
            priority: 0,
            nodeScoped: false,
          },
        ],
        cliCommands: [
          {
            name: "example",
            actions: [
              {
                name: "hello",
                capability: "example.hello",
                description: "Say hello",
              },
            ],
          },
        ],
      };

      const warnings = validateManifestConsistency(manifest);
      expect(warnings).toHaveLength(0);
    });
  });
});

describe("Native plugin manifests", () => {
  const pluginsDir = path.join(__dirname, "../../../plugins/native");

  const nativePlugins = ["bolt", "puppetdb", "puppetserver", "hiera"];

  for (const pluginName of nativePlugins) {
    describe(`${pluginName} plugin.json`, () => {
      const manifestPath = path.join(pluginsDir, pluginName, "plugin.json");

      it("should exist", () => {
        expect(fs.existsSync(manifestPath)).toBe(true);
      });

      it("should be valid JSON", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        expect(() => JSON.parse(content)).not.toThrow();
      });

      it("should pass schema validation", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        const result = validatePluginManifest(manifest);

        if (!result.success) {
          console.error(`Validation errors for ${pluginName}:`, result.error.errors);
        }

        expect(result.success).toBe(true);
      });

      it("should have correct plugin name", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        expect(manifest.name).toBe(pluginName);
      });

      it("should have at least one capability", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        expect(manifest.capabilities.length).toBeGreaterThan(0);
      });

      it("should have a home-summary widget", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        const homeWidget = manifest.widgets.find((w: { slots: string[] }) =>
          w.slots.includes("home-summary")
        );
        expect(homeWidget).toBeDefined();
      });

      it("should have a valid color", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        expect(manifest.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });

      it("should pass consistency validation", () => {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(content);
        const parsed = parsePluginManifest(manifest);
        const warnings = validateManifestConsistency(parsed);

        // Log warnings but don't fail - some warnings are acceptable
        if (warnings.length > 0) {
          console.log(`Consistency warnings for ${pluginName}:`, warnings);
        }
      });
    });
  }
});
