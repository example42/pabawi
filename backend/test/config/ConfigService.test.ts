import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigService } from "../../src/config/ConfigService";

describe("ConfigService - Integration Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Clear PuppetDB-related environment variables to ensure test isolation
    delete process.env.PUPPETDB_ENABLED;
    delete process.env.PUPPETDB_SERVER_URL;
    delete process.env.PUPPETDB_PORT;
    delete process.env.PUPPETDB_TOKEN;
    delete process.env.PUPPETDB_TIMEOUT;
    delete process.env.PUPPETDB_RETRY_ATTEMPTS;
    delete process.env.PUPPETDB_RETRY_DELAY;
    delete process.env.PUPPETDB_SSL_ENABLED;
    delete process.env.PUPPETDB_SSL_CA;
    delete process.env.PUPPETDB_SSL_CERT;
    delete process.env.PUPPETDB_SSL_KEY;
    delete process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("PuppetDB Configuration", () => {
    it("should load PuppetDB configuration when enabled", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret
      process.env.PUPPETDB_PORT = "8081";  // pragma: allowlist secret
      process.env.PUPPETDB_TOKEN = "test-token";  // pragma: allowlist secret
      process.env.PUPPETDB_TIMEOUT = "30000";  // pragma: allowlist secret
      process.env.PUPPETDB_RETRY_ATTEMPTS = "3";  // pragma: allowlist secret
      process.env.PUPPETDB_RETRY_DELAY = "1000";  // pragma: allowlist secret

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
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_CA = "/path/to/ca.pem";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_CERT = "/path/to/cert.pem";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_KEY = "/path/to/key.pem";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED = "true";  // pragma: allowlist secret

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
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret
      process.env.PUPPETDB_SSL_ENABLED = "false";  // pragma: allowlist secret

      const configService = new ConfigService();
      const puppetdbConfig = configService.getPuppetDBConfig();

      expect(puppetdbConfig).not.toBeNull();
      expect(puppetdbConfig?.ssl).toBeDefined();
      expect(puppetdbConfig?.ssl?.enabled).toBe(false);
    });

    it("should throw error when PUPPETDB_ENABLED is true but SERVER_URL is missing", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "PUPPETDB_SERVER_URL is required when PUPPETDB_ENABLED is true",
      );
    });

    it("should apply default values for optional PuppetDB settings", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret

      const configService = new ConfigService();
      const config = configService.getConfig();

      expect(config.integrations.puppetdb).toBeDefined();
      expect(config.integrations.puppetdb?.timeout).toBe(30000);
      expect(config.integrations.puppetdb?.retryAttempts).toBe(3);
      expect(config.integrations.puppetdb?.retryDelay).toBe(1000);
    });

    it("should validate PuppetDB server URL format", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "not-a-valid-url";  // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow();
    });

    it("should validate PuppetDB port is a positive integer", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret
      process.env.PUPPETDB_PORT = "-1";  // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow();
    });

    it("should validate retry attempts is non-negative", () => {
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret
      process.env.PUPPETDB_RETRY_ATTEMPTS = "-1";  // pragma: allowlist secret

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
      process.env.PUPPETDB_ENABLED = "true";  // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com";  // pragma: allowlist secret

      const configService = new ConfigService();
      const integrations = configService.getIntegrationsConfig();

      expect(integrations.puppetdb).toBeDefined();
      expect(integrations.puppetdb?.enabled).toBe(true);
    });
  });

  describe("AWS Configuration", () => {
    beforeEach(() => {
      delete process.env.AWS_ENABLED;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_DEFAULT_REGION;
      delete process.env.AWS_SESSION_TOKEN;
      delete process.env.AWS_PROFILE;
      delete process.env.AWS_ENDPOINT;
    });

    it("should load AWS configuration when enabled", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"; // pragma: allowlist secret
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"; // pragma: allowlist secret
      process.env.AWS_DEFAULT_REGION = "us-west-2"; // pragma: allowlist secret

      const configService = new ConfigService();
      const awsConfig = configService.getAWSConfig();

      expect(awsConfig).not.toBeNull();
      expect(awsConfig?.enabled).toBe(true);
      expect(awsConfig?.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(awsConfig?.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
      expect(awsConfig?.region).toBe("us-west-2");
    });

    it("should return null when AWS is not enabled", () => {
      const configService = new ConfigService();
      const awsConfig = configService.getAWSConfig();

      expect(awsConfig).toBeNull();
    });

    it("should use default region when AWS_DEFAULT_REGION is not set", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"; // pragma: allowlist secret
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"; // pragma: allowlist secret

      const configService = new ConfigService();
      const awsConfig = configService.getAWSConfig();

      expect(awsConfig).not.toBeNull();
      expect(awsConfig?.region).toBe("us-east-1");
    });

    it("should include AWS in integrations config when enabled", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"; // pragma: allowlist secret
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"; // pragma: allowlist secret

      const configService = new ConfigService();
      const integrations = configService.getIntegrationsConfig();

      expect(integrations.aws).toBeDefined();
      expect(integrations.aws?.enabled).toBe(true);
    });

    it("should not include AWS in integrations when disabled", () => {
      const configService = new ConfigService();
      const integrations = configService.getIntegrationsConfig();

      expect(integrations.aws).toBeUndefined();
    });

    it("should parse optional AWS fields", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"; // pragma: allowlist secret
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"; // pragma: allowlist secret
      process.env.AWS_SESSION_TOKEN = "FwoGZXIvYXdzEBYaDH"; // pragma: allowlist secret
      process.env.AWS_PROFILE = "production"; // pragma: allowlist secret
      process.env.AWS_ENDPOINT = "http://localhost:4566"; // pragma: allowlist secret

      const configService = new ConfigService();
      const awsConfig = configService.getAWSConfig();

      expect(awsConfig?.sessionToken).toBe("FwoGZXIvYXdzEBYaDH");
      expect(awsConfig?.profile).toBe("production");
      expect(awsConfig?.endpoint).toBe("http://localhost:4566");
    });
  });
});
