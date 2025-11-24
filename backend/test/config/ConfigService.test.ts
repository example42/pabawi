import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigService } from "../../src/config/ConfigService";

describe("ConfigService - Integration Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("PuppetDB Configuration", () => {
    it("should load PuppetDB configuration when enabled", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";
      process.env.PUPPETDB_PORT = "8081";
      process.env.PUPPETDB_TOKEN = "test-token";
      process.env.PUPPETDB_TIMEOUT = "30000";
      process.env.PUPPETDB_RETRY_ATTEMPTS = "3";
      process.env.PUPPETDB_RETRY_DELAY = "1000";

      const configService = new ConfigService();
      const puppetdbConfig = configService.getPuppetDBConfig();

      expect(puppetdbConfig).not.toBeNull();
      expect(puppetdbConfig?.enabled).toBe(true);
      expect(puppetdbConfig?.serverUrl).toBe("https://puppetdb.example.com");
      expect(puppetdbConfig?.port).toBe(8081);
      expect(puppetdbConfig?.token).toBe("test-token");
      expect(puppetdbConfig?.timeout).toBe(30000);
      expect(puppetdbConfig?.retryAttempts).toBe(3);
      expect(puppetdbConfig?.retryDelay).toBe(1000);
    });

    it("should return null when PuppetDB is not enabled", () => {
      const configService = new ConfigService();
      const puppetdbConfig = configService.getPuppetDBConfig();

      expect(puppetdbConfig).toBeNull();
    });

    it("should load PuppetDB SSL configuration", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";
      process.env.PUPPETDB_SSL_ENABLED = "true";
      process.env.PUPPETDB_SSL_CA = "/path/to/ca.pem";
      process.env.PUPPETDB_SSL_CERT = "/path/to/cert.pem";
      process.env.PUPPETDB_SSL_KEY = "/path/to/key.pem";
      process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED = "true";

      const configService = new ConfigService();
      const puppetdbConfig = configService.getPuppetDBConfig();

      expect(puppetdbConfig).not.toBeNull();
      expect(puppetdbConfig?.ssl).toBeDefined();
      expect(puppetdbConfig?.ssl?.enabled).toBe(true);
      expect(puppetdbConfig?.ssl?.ca).toBe("/path/to/ca.pem");
      expect(puppetdbConfig?.ssl?.cert).toBe("/path/to/cert.pem");
      expect(puppetdbConfig?.ssl?.key).toBe("/path/to/key.pem");
      expect(puppetdbConfig?.ssl?.rejectUnauthorized).toBe(true);
    });

    it("should disable SSL when PUPPETDB_SSL_ENABLED is false", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";
      process.env.PUPPETDB_SSL_ENABLED = "false";

      const configService = new ConfigService();
      const puppetdbConfig = configService.getPuppetDBConfig();

      expect(puppetdbConfig).not.toBeNull();
      expect(puppetdbConfig?.ssl).toBeDefined();
      expect(puppetdbConfig?.ssl?.enabled).toBe(false);
    });

    it("should throw error when PUPPETDB_ENABLED is true but SERVER_URL is missing", () => {
      process.env.PUPPETDB_ENABLED = "true";

      expect(() => new ConfigService()).toThrow(
        "PUPPETDB_SERVER_URL is required when PUPPETDB_ENABLED is true",
      );
    });

    it("should apply default values for optional PuppetDB settings", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";

      const configService = new ConfigService();
      const config = configService.getConfig();

      expect(config.integrations.puppetdb).toBeDefined();
      expect(config.integrations.puppetdb?.timeout).toBe(30000);
      expect(config.integrations.puppetdb?.retryAttempts).toBe(3);
      expect(config.integrations.puppetdb?.retryDelay).toBe(1000);
    });

    it("should validate PuppetDB server URL format", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "not-a-valid-url";

      expect(() => new ConfigService()).toThrow();
    });

    it("should validate PuppetDB port is a positive integer", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";
      process.env.PUPPETDB_PORT = "-1";

      expect(() => new ConfigService()).toThrow();
    });

    it("should validate retry attempts is non-negative", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";
      process.env.PUPPETDB_RETRY_ATTEMPTS = "-1";

      expect(() => new ConfigService()).toThrow();
    });
  });

  describe("Integrations Configuration", () => {
    it("should return empty integrations when none are configured", () => {
      const configService = new ConfigService();
      const integrations = configService.getIntegrationsConfig();

      expect(integrations).toBeDefined();
      expect(integrations.puppetdb).toBeUndefined();
    });

    it("should include PuppetDB in integrations when enabled", () => {
      process.env.PUPPETDB_ENABLED = "true";
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";

      const configService = new ConfigService();
      const integrations = configService.getIntegrationsConfig();

      expect(integrations.puppetdb).toBeDefined();
      expect(integrations.puppetdb?.enabled).toBe(true);
    });
  });
});
