/**
 * Unit tests for SchemaRegistry
 *
 * Tests the schema registry functionality including:
 * - Schema registration and retrieval
 * - Plugin schema management
 * - Validation functionality
 * - Schema composition
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
  SchemaRegistry,
  getSchemaRegistry,
  resetSchemaRegistry,
  registerCoreSchema,
  registerPluginSchema,
  SchemaCategory,
} from "../../src/config/SchemaRegistry";

describe("SchemaRegistry", () => {
  beforeEach(() => {
    resetSchemaRegistry();
  });

  afterEach(() => {
    resetSchemaRegistry();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = getSchemaRegistry();
      const instance2 = getSchemaRegistry();
      expect(instance1).toBe(instance2);
    });

    it("should reset the instance", () => {
      const instance1 = getSchemaRegistry();
      resetSchemaRegistry();
      const instance2 = getSchemaRegistry();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("schema registration", () => {
    it("should register a schema with metadata", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({ name: z.string() });

      registry.register(schema, {
        id: "test:schema",
        name: "Test Schema",
        description: "A test schema",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      expect(registry.has("test:schema")).toBe(true);
    });

    it("should throw when registering duplicate schema without override", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({ name: z.string() });

      registry.register(schema, {
        id: "test:duplicate",
        name: "Test Schema",
        description: "A test schema",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      expect(() => {
        registry.register(schema, {
          id: "test:duplicate",
          name: "Test Schema 2",
          description: "Another test schema",
          version: "1.0.0",
          category: "custom" as SchemaCategory,
          pluginName: null,
          isCore: true,
        });
      }).toThrow("already registered");
    });

    it("should allow override with option", () => {
      const registry = getSchemaRegistry();
      const schema1 = z.object({ name: z.string() });
      const schema2 = z.object({ name: z.string(), age: z.number() });

      registry.register(schema1, {
        id: "test:override",
        name: "Test Schema",
        description: "Original schema",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      registry.register(
        schema2,
        {
          id: "test:override",
          name: "Test Schema V2",
          description: "Updated schema",
          version: "2.0.0",
          category: "custom" as SchemaCategory,
          pluginName: null,
          isCore: true,
        },
        { override: true }
      );

      const entry = registry.get("test:override");
      expect(entry?.metadata.version).toBe("2.0.0");
    });
  });

  describe("schema retrieval", () => {
    it("should get a registered schema", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({ name: z.string() });

      registry.register(schema, {
        id: "test:get",
        name: "Test Schema",
        description: "A test schema",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      const entry = registry.get("test:get");
      expect(entry).toBeDefined();
      expect(entry?.metadata.id).toBe("test:get");
      expect(entry?.schema).toBe(schema);
    });

    it("should return undefined for non-existent schema", () => {
      const registry = getSchemaRegistry();
      const entry = registry.get("non:existent");
      expect(entry).toBeUndefined();
    });

    it("should throw when using getOrThrow for non-existent schema", () => {
      const registry = getSchemaRegistry();
      expect(() => registry.getOrThrow("non:existent")).toThrow("not found");
    });
  });

  describe("schema unregistration", () => {
    it("should unregister a schema", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({ name: z.string() });

      registry.register(schema, {
        id: "test:unregister",
        name: "Test Schema",
        description: "A test schema",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      expect(registry.has("test:unregister")).toBe(true);
      const deleted = registry.unregister("test:unregister");
      expect(deleted).toBe(true);
      expect(registry.has("test:unregister")).toBe(false);
    });

    it("should return false when unregistering non-existent schema", () => {
      const registry = getSchemaRegistry();
      const deleted = registry.unregister("non:existent");
      expect(deleted).toBe(false);
    });
  });

  describe("plugin schema management", () => {
    it("should register a plugin schema", () => {
      registerPluginSchema(
        "test-plugin",
        z.object({ config: z.string() }),
        {
          id: "plugin:test:config",
          name: "Test Plugin Config",
          description: "Configuration for test plugin",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      const registry = getSchemaRegistry();
      const entry = registry.get("plugin:test:config");
      expect(entry?.metadata.pluginName).toBe("test-plugin");
      expect(entry?.metadata.isCore).toBe(false);
    });

    it("should unregister all schemas for a plugin", () => {
      const registry = getSchemaRegistry();

      registerPluginSchema(
        "my-plugin",
        z.object({ a: z.string() }),
        {
          id: "plugin:my:schema1",
          name: "Schema 1",
          description: "First schema",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "my-plugin",
        z.object({ b: z.string() }),
        {
          id: "plugin:my:schema2",
          name: "Schema 2",
          description: "Second schema",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "other-plugin",
        z.object({ c: z.string() }),
        {
          id: "plugin:other:schema",
          name: "Other Schema",
          description: "Other plugin schema",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      const count = registry.unregisterPlugin("my-plugin");
      expect(count).toBe(2);
      expect(registry.has("plugin:my:schema1")).toBe(false);
      expect(registry.has("plugin:my:schema2")).toBe(false);
      expect(registry.has("plugin:other:schema")).toBe(true);
    });

    it("should get schemas by plugin", () => {
      const registry = getSchemaRegistry();

      registerPluginSchema(
        "test-plugin",
        z.object({ a: z.string() }),
        {
          id: "plugin:test:a",
          name: "Schema A",
          description: "Schema A",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "test-plugin",
        z.object({ b: z.string() }),
        {
          id: "plugin:test:b",
          name: "Schema B",
          description: "Schema B",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      const schemas = registry.getByPlugin("test-plugin");
      expect(schemas).toHaveLength(2);
    });
  });

  describe("schema categories", () => {
    it("should get schemas by category", () => {
      const registry = getSchemaRegistry();

      registerCoreSchema(
        z.object({ auth: z.boolean() }),
        {
          id: "core:auth",
          name: "Auth Schema",
          description: "Auth schema",
          version: "1.0.0",
          category: "auth" as SchemaCategory,
        }
      );

      registerCoreSchema(
        z.object({ db: z.string() }),
        {
          id: "core:db",
          name: "DB Schema",
          description: "DB schema",
          version: "1.0.0",
          category: "database" as SchemaCategory,
        }
      );

      const authSchemas = registry.getByCategory("auth");
      expect(authSchemas).toHaveLength(1);
      expect(authSchemas[0].metadata.id).toBe("core:auth");
    });

    it("should get core schemas", () => {
      const registry = getSchemaRegistry();

      registerCoreSchema(
        z.object({ core: z.boolean() }),
        {
          id: "core:test",
          name: "Core Schema",
          description: "Core schema",
          version: "1.0.0",
          category: "core" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "plugin",
        z.object({ plugin: z.boolean() }),
        {
          id: "plugin:test",
          name: "Plugin Schema",
          description: "Plugin schema",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      const coreSchemas = registry.getCoreSchemas();
      expect(coreSchemas).toHaveLength(1);
      expect(coreSchemas[0].metadata.id).toBe("core:test");
    });
  });

  describe("schema validation", () => {
    it("should validate data against a registered schema", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({
        name: z.string(),
        age: z.number().positive(),
      });

      registry.register(schema, {
        id: "test:validate",
        name: "Validation Schema",
        description: "Schema for validation tests",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      const result = registry.validate("test:validate", { name: "John", age: 30 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "John", age: 30 });
    });

    it("should return errors for invalid data", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({
        name: z.string(),
        age: z.number().positive(),
      });

      registry.register(schema, {
        id: "test:validate:errors",
        name: "Validation Schema",
        description: "Schema for validation tests",
        version: "1.0.0",
        category: "custom" as SchemaCategory,
        pluginName: null,
        isCore: true,
      });

      const result = registry.validate("test:validate:errors", { name: 123, age: -5 });
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("should return error for non-existent schema", () => {
      const registry = getSchemaRegistry();
      const result = registry.validate("non:existent", { data: "test" });
      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe("schema_not_found");
    });

    it("should validate directly with a schema", () => {
      const registry = getSchemaRegistry();
      const schema = z.object({ value: z.number() });

      const result = registry.validateWithSchema(schema, { value: 42 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
    });
  });

  describe("schema composition", () => {
    it("should compose multiple schemas", () => {
      const registry = getSchemaRegistry();

      registry.register(
        z.object({ name: z.string() }),
        {
          id: "compose:name",
          name: "Name Schema",
          description: "Name field",
          version: "1.0.0",
          category: "custom" as SchemaCategory,
          pluginName: null,
          isCore: true,
        }
      );

      registry.register(
        z.object({ age: z.number() }),
        {
          id: "compose:age",
          name: "Age Schema",
          description: "Age field",
          version: "1.0.0",
          category: "custom" as SchemaCategory,
          pluginName: null,
          isCore: true,
        }
      );

      const composed = registry.compose(["compose:name", "compose:age"]);
      expect(composed).not.toBeNull();

      const result = composed!.safeParse({ name: "John", age: 30 });
      expect(result.success).toBe(true);
    });

    it("should return null when composing with non-existent schema", () => {
      const registry = getSchemaRegistry();

      registry.register(
        z.object({ name: z.string() }),
        {
          id: "compose:exists",
          name: "Exists Schema",
          description: "Existing schema",
          version: "1.0.0",
          category: "custom" as SchemaCategory,
          pluginName: null,
          isCore: true,
        }
      );

      const composed = registry.compose(["compose:exists", "compose:missing"]);
      expect(composed).toBeNull();
    });
  });

  describe("statistics", () => {
    it("should return correct statistics", () => {
      const registry = getSchemaRegistry();

      registerCoreSchema(
        z.object({}),
        {
          id: "stats:core1",
          name: "Core 1",
          description: "Core schema 1",
          version: "1.0.0",
          category: "core" as SchemaCategory,
        }
      );

      registerCoreSchema(
        z.object({}),
        {
          id: "stats:auth1",
          name: "Auth 1",
          description: "Auth schema 1",
          version: "1.0.0",
          category: "auth" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "plugin-a",
        z.object({}),
        {
          id: "stats:plugin1",
          name: "Plugin 1",
          description: "Plugin schema 1",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      registerPluginSchema(
        "plugin-a",
        z.object({}),
        {
          id: "stats:plugin2",
          name: "Plugin 2",
          description: "Plugin schema 2",
          version: "1.0.0",
          category: "plugin" as SchemaCategory,
        }
      );

      const stats = registry.getStats();
      expect(stats.total).toBe(4);
      expect(stats.coreCount).toBe(2);
      expect(stats.pluginCount).toBe(2);
      expect(stats.byCategory.core).toBe(1);
      expect(stats.byCategory.auth).toBe(1);
      expect(stats.byCategory.plugin).toBe(2);
      expect(stats.byPlugin["plugin-a"]).toBe(2);
    });
  });

  describe("utility methods", () => {
    it("should list all schema IDs", () => {
      const registry = getSchemaRegistry();

      registerCoreSchema(
        z.object({}),
        {
          id: "list:one",
          name: "One",
          description: "Schema one",
          version: "1.0.0",
          category: "core" as SchemaCategory,
        }
      );

      registerCoreSchema(
        z.object({}),
        {
          id: "list:two",
          name: "Two",
          description: "Schema two",
          version: "1.0.0",
          category: "core" as SchemaCategory,
        }
      );

      const ids = registry.listIds();
      expect(ids).toContain("list:one");
      expect(ids).toContain("list:two");
    });

    it("should export metadata", () => {
      const registry = getSchemaRegistry();

      registerCoreSchema(
        z.object({}),
        {
          id: "export:test",
          name: "Export Test",
          description: "Schema for export test",
          version: "1.0.0",
          category: "core" as SchemaCategory,
        }
      );

      const metadata = registry.exportMetadata();
      expect(metadata).toHaveLength(1);
      expect(metadata[0].id).toBe("export:test");
      expect(metadata[0].registeredAt).toBeInstanceOf(Date);
    });
  });
});
