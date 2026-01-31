/**
 * Unit tests for YAML Configuration Schemas
 *
 * Tests the Zod schemas for validating YAML configuration files:
 * - integrations.yaml
 * - rbac.yaml
 * - database.yaml
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  // Integrations schemas
  IntegrationsYamlSchema,
  YamlBoltIntegrationSchema,
  YamlPuppetDBIntegrationSchema,
  YamlHieraIntegrationSchema,
  YamlExternalPluginSchema,
  // RBAC schemas
  RbacYamlSchema,
  YamlAuthConfigSchema,
  YamlRoleSchema,
  YamlPermissionSchema,
  YamlUserSchema,
  // Database schemas
  DatabaseYamlSchema,
  YamlMigrationConfigSchema,
  // Validation helpers
  validateIntegrationsYaml,
  validateRbacYaml,
  validateDatabaseYaml,
  validatePabawiConfig,
  // Registration
  registerYamlConfigSchemas,
} from "../../src/config/YamlConfigSchemas";
import { resetSchemaRegistry, getSchemaRegistry } from "../../src/config/SchemaRegistry";

describe("YamlConfigSchemas", () => {
  // ============================================================================
  // Integrations YAML Schemas
  // ============================================================================

  describe("IntegrationsYamlSchema", () => {
    it("should accept minimal valid configuration", () => {
      const config = {
        integrations: {
          bolt: { enabled: true },
        },
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept full Bolt configuration", () => {
      const config = {
        integrations: {
          bolt: {
            enabled: true,
            priority: 5,
            frontend: {
              widgets: [
                {
                  id: "bolt:command-executor",
                  enabled: true,
                  defaultSlots: ["dashboard", "node-detail"],
                },
              ],
            },
            defaultPermissions: {
              "command.execute": ["admin", "operator"],
              "inventory.list": ["admin", "operator", "viewer"],
            },
            config: {
              projectPath: "/etc/bolt",
              timeout: 300000,
              commandWhitelist: {
                allowAll: false,
                matchMode: "exact",
                commands: ["ls", "pwd", "whoami"],
              },
            },
          },
        },
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept PuppetDB configuration", () => {
      const config = {
        integrations: {
          puppetdb: {
            enabled: true,
            priority: 10,
            config: {
              serverUrl: "https://puppetdb.example.com",
              port: 8081,
              timeout: 30000,
              ssl: {
                enabled: true,
                rejectUnauthorized: true,
              },
              cache: {
                ttl: 300000,
              },
              circuitBreaker: {
                threshold: 5,
                timeout: 60000,
                resetTimeout: 30000,
              },
            },
          },
        },
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept Hiera configuration", () => {
      const config = {
        integrations: {
          hiera: {
            enabled: true,
            priority: 6,
            config: {
              controlRepoPath: "/etc/puppetlabs/code",
              hieraConfigPath: "hiera.yaml",
              environments: ["production", "staging", "development"],
              factSources: {
                preferPuppetDB: true,
              },
              cache: {
                enabled: true,
                ttl: 300000,
                maxEntries: 10000,
              },
            },
          },
        },
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept external plugins", () => {
      const config = {
        externalPlugins: [
          {
            path: "./custom-plugins/my-plugin",
            enabled: true,
            config: { customSetting: "value" },
          },
          {
            package: "@pabawi-plugins/ansible",
            enabled: true,
            priority: 15,
          },
        ],
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject external plugin without path or package", () => {
      const config = {
        externalPlugins: [
          {
            enabled: true,
            config: { customSetting: "value" },
          },
        ],
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should apply defaults", () => {
      const config = {
        integrations: {
          bolt: {},
        },
      };

      const result = IntegrationsYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.integrations?.bolt?.enabled).toBe(true);
        expect(result.data.integrations?.bolt?.priority).toBe(5);
      }
    });
  });

  describe("YamlBoltIntegrationSchema", () => {
    it("should accept minimal config", () => {
      const result = YamlBoltIntegrationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.priority).toBe(5);
      }
    });

    it("should validate widget slots", () => {
      const config = {
        frontend: {
          widgets: [
            {
              id: "bolt:test",
              defaultSlots: ["dashboard", "invalid-slot"],
            },
          ],
        },
      };

      const result = YamlBoltIntegrationSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("YamlExternalPluginSchema", () => {
    it("should accept path-based plugin", () => {
      const result = YamlExternalPluginSchema.safeParse({
        path: "./plugins/custom",
        enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept package-based plugin", () => {
      const result = YamlExternalPluginSchema.safeParse({
        package: "@pabawi-plugins/terraform",
        enabled: true,
        priority: 10,
      });
      expect(result.success).toBe(true);
    });

    it("should reject without path or package", () => {
      const result = YamlExternalPluginSchema.safeParse({
        enabled: true,
        priority: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // RBAC YAML Schemas
  // ============================================================================

  describe("RbacYamlSchema", () => {
    it("should accept minimal valid configuration", () => {
      const config = {
        auth: {
          enabled: false,
        },
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept full auth configuration", () => {
      const config = {
        auth: {
          enabled: true,
          jwt: {
            secret: "super-secret-key", // pragma: allowlist secret
            accessTokenExpiry: 3600,
            refreshTokenExpiry: 604800,
            issuer: "pabawi",
          },
          session: {
            maxActiveSessions: 5,
            inactivityTimeout: 1800,
          },
          password: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
          },
        },
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept role definitions", () => {
      const config = {
        roles: [
          {
            name: "admin",
            description: "Full access",
            priority: 100,
            isSystem: true,
            permissions: [
              {
                capability: "*",
                action: "allow",
                description: "Full access to all capabilities",
              },
            ],
          },
          {
            name: "operator",
            description: "Operations team",
            priority: 50,
            permissions: [
              {
                capability: "command.execute",
                action: "allow",
              },
              {
                capability: "user.*",
                action: "deny",
              },
            ],
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept permission conditions", () => {
      const config = {
        roles: [
          {
            name: "prod-operator",
            permissions: [
              {
                capability: "command.execute",
                action: "allow",
                conditions: {
                  nodeFilter: "environment=production",
                  timeWindow: "weekdays:09:00-17:00",
                  ipRestriction: ["10.0.0.0/8", "192.168.1.100"],
                },
              },
            ],
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept group definitions", () => {
      const config = {
        groups: [
          {
            name: "ops-team",
            description: "Operations team members",
            roles: ["operator"],
          },
          {
            name: "dev-team",
            description: "Development team",
            roles: ["viewer"],
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept user seed data", () => {
      const config = {
        users: [
          {
            username: "admin",
            email: "admin@example.com",
            password: "SecurePassword123!", // pragma: allowlist secret
            displayName: "System Administrator",
            roles: ["admin"],
            active: true,
          },
          {
            username: "operator",
            email: "operator@example.com",
            password: "OperatorPass456!", // pragma: allowlist secret
            groups: ["ops-team"],
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const config = {
        users: [
          {
            username: "test",
            email: "invalid-email",
            password: "password", // pragma: allowlist secret
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid permission action", () => {
      const config = {
        roles: [
          {
            name: "test",
            permissions: [
              {
                capability: "command.execute",
                action: "maybe", // Invalid
              },
            ],
          },
        ],
      };

      const result = RbacYamlSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("YamlRoleSchema", () => {
    it("should apply defaults", () => {
      const result = YamlRoleSchema.safeParse({
        name: "test-role",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe(0);
        expect(result.data.isSystem).toBe(false);
        expect(result.data.permissions).toEqual([]);
      }
    });
  });

  describe("YamlPermissionSchema", () => {
    it("should accept allow action", () => {
      const result = YamlPermissionSchema.safeParse({
        capability: "command.execute",
        action: "allow",
      });
      expect(result.success).toBe(true);
    });

    it("should accept deny action", () => {
      const result = YamlPermissionSchema.safeParse({
        capability: "user.*",
        action: "deny",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("YamlUserSchema", () => {
    it("should require username, email, and password", () => {
      const result = YamlUserSchema.safeParse({
        username: "test",
      });
      expect(result.success).toBe(false);
    });

    it("should apply defaults", () => {
      const result = YamlUserSchema.safeParse({
        username: "test",
        email: "test@example.com",
        password: "password", // pragma: allowlist secret
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.active).toBe(true);
      }
    });
  });

  // ============================================================================
  // Database YAML Schemas
  // ============================================================================

  describe("DatabaseYamlSchema", () => {
    it("should accept SQLite configuration", () => {
      const config = {
        database: {
          type: "sqlite",
          path: "./data/pabawi.db",
          connectionTimeout: 30000,
          debug: false,
        },
        migrations: {
          autoRun: true,
          directory: "./src/database",
        },
      };

      const result = DatabaseYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept PostgreSQL configuration", () => {
      const config = {
        database: {
          type: "postgresql",
          host: "localhost",
          port: 5432,
          database: "pabawi",
          username: "pabawi",
          password: "secret",  // pragma: allowlist secret
          ssl: true,
          poolMin: 2,
          poolMax: 10,
        },
      };

      const result = DatabaseYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept backup configuration", () => {
      const config = {
        backup: {
          enabled: true,
          schedule: "0 2 * * *",
          directory: "./data/backups",
          retention: 7,
          compress: true,
        },
      };

      const result = DatabaseYamlSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject invalid database type", () => {
      const config = {
        database: {
          type: "oracle",
        },
      };

      const result = DatabaseYamlSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("YamlMigrationConfigSchema", () => {
    it("should apply defaults", () => {
      const result = YamlMigrationConfigSchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoRun).toBe(true);
        expect(result.data.directory).toBe("./src/database");
        expect(result.data.lockTimeout).toBe(60000);
      }
    });
  });

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  describe("validateIntegrationsYaml", () => {
    it("should validate integrations config", () => {
      const result = validateIntegrationsYaml({
        integrations: {
          bolt: { enabled: true },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("validateRbacYaml", () => {
    it("should validate RBAC config", () => {
      const result = validateRbacYaml({
        auth: { enabled: false },
        roles: [{ name: "admin", permissions: [] }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("validateDatabaseYaml", () => {
    it("should validate database config", () => {
      const result = validateDatabaseYaml({
        database: {
          type: "sqlite",
          path: "./data/test.db",
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("validatePabawiConfig", () => {
    it("should validate combined config", () => {
      const result = validatePabawiConfig({
        integrations: {
          bolt: { enabled: true },
        },
        auth: { enabled: false },
        database: {
          type: "sqlite",
          path: "./data/test.db",
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Schema Registration
  // ============================================================================

  describe("registerYamlConfigSchemas", () => {
    beforeEach(() => {
      resetSchemaRegistry();
    });

    afterEach(() => {
      resetSchemaRegistry();
    });

    it("should register all YAML schemas", () => {
      registerYamlConfigSchemas();

      const registry = getSchemaRegistry();
      expect(registry.has("yaml:integrations")).toBe(true);
      expect(registry.has("yaml:integrations:bolt")).toBe(true);
      expect(registry.has("yaml:integrations:puppetdb")).toBe(true);
      expect(registry.has("yaml:integrations:puppetserver")).toBe(true);
      expect(registry.has("yaml:integrations:hiera")).toBe(true);
      expect(registry.has("yaml:rbac")).toBe(true);
      expect(registry.has("yaml:rbac:auth")).toBe(true);
      expect(registry.has("yaml:rbac:role")).toBe(true);
      expect(registry.has("yaml:rbac:permission")).toBe(true);
      expect(registry.has("yaml:database")).toBe(true);
      expect(registry.has("yaml:pabawi")).toBe(true);
    });

    it("should categorize schemas correctly", () => {
      registerYamlConfigSchemas();

      const registry = getSchemaRegistry();

      const integrationSchemas = registry.getByCategory("integration");
      expect(integrationSchemas.length).toBeGreaterThanOrEqual(5);

      const authSchemas = registry.getByCategory("auth");
      expect(authSchemas.length).toBeGreaterThanOrEqual(4);

      const dbSchemas = registry.getByCategory("database");
      expect(dbSchemas.length).toBeGreaterThanOrEqual(1);
    });

    it("should mark schemas as core", () => {
      registerYamlConfigSchemas();

      const registry = getSchemaRegistry();
      const coreSchemas = registry.getCoreSchemas();
      expect(coreSchemas.length).toBeGreaterThan(0);

      // All registered schemas should be core (not plugin-specific)
      for (const schema of coreSchemas) {
        expect(schema.metadata.isCore).toBe(true);
        expect(schema.metadata.pluginName).toBeNull();
      }
    });
  });
});
