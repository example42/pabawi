// Feature: v1-release-prep, Property 1: ConfigService env parsing round-trip
/**
 * Validates: Requirements 6.1
 *
 * Property test: For any valid set of integration environment variables
 * (Proxmox, AWS, PuppetDB, Puppetserver, Hiera, Ansible), parsing them
 * through ConfigService should produce an AppConfig whose integration fields
 * match the input values (types coerced, defaults applied per Zod schema).
 *
 * Unit tests: specific integration config blocks, defaults, error cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { ConfigService } from "../../src/config/ConfigService";

/**
 * Helper: save and restore all process.env between tests.
 * We snapshot the full env once and restore it after each test.
 */
const savedEnv: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  Object.assign(savedEnv, process.env);
}

function restoreEnv(): void {
  // Remove keys that were added during the test
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  // Restore original values
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Clear all integration-related env vars to ensure test isolation.
 */
function clearIntegrationEnv(): void {
  const prefixes = [
    "ANSIBLE_", "PUPPETDB_", "PUPPETSERVER_", "HIERA_",
    "PROXMOX_", "AWS_", "PORT", "HOST", "BOLT_", "LOG_LEVEL",
    "DATABASE_PATH", "CORS_ALLOWED_ORIGINS", "COMMAND_WHITELIST",
    "STREAMING_", "CACHE_", "CONCURRENT_EXECUTION_LIMIT",
    "MAX_QUEUE_SIZE", "UI_SHOW_HOME_PAGE_RUN_CHART",
    "ALLOW_DESTRUCTIVE_PROVISIONING",
  ];
  for (const key of Object.keys(process.env)) {
    if (prefixes.some((p) => key.startsWith(p))) {
      delete process.env[key];
    }
  }
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid hostname (alphanumeric + dots) */
const hostnameArb = fc
  .tuple(
    fc.array(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz".split(""))), { minLength: 3, maxLength: 12 }).map((a) => a.join("")),
    fc.constantFrom(".example.com", ".local", ".test"),
  )
  .map(([name, suffix]) => name + suffix);

/** Generate a valid URL */
const urlArb = fc
  .tuple(fc.constantFrom("https://", "http://"), hostnameArb)
  .map(([proto, host]) => proto + host);

/** Generate a valid port number */
const portArb = fc.integer({ min: 1, max: 65535 });

/** Generate a positive integer for timeouts etc. */
const posIntArb = fc.integer({ min: 1, max: 600000 });

/** Generate a non-negative integer */
const nonNegIntArb = fc.integer({ min: 0, max: 100 });

/** Generate a simple token string */
const tokenArb = fc.array(
  fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz0123456789-_".split(""))),
  { minLength: 4, maxLength: 32 },
).map((a) => a.join(""));

/** Generate a file path */
const pathArb = fc
  .tuple(
    fc.constantFrom("/etc/", "/opt/", "/tmp/", "/var/"),
    fc.array(fc.constantFrom(...("abcdefghijklmnopqrstuvwxyz-_".split(""))), { minLength: 2, maxLength: 12 }).map((a) => a.join("")),
    fc.constantFrom(".pem", ".crt", ".key", ""),
  )
  .map(([dir, name, ext]) => dir + name + ext);

/** Generate an AWS region */
const awsRegionArb = fc.constantFrom(
  "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1", "sa-east-1",
);

const propertyTestConfig = { numRuns: 100, verbose: false };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ConfigService", () => {
  beforeEach(() => {
    snapshotEnv();
    clearIntegrationEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  // ─── Property 1: ConfigService env parsing round-trip ────────────────────
  describe("Property 1: ConfigService env parsing round-trip", () => {
    it("should produce valid AppConfig for any valid Proxmox env vars", () => {
      fc.assert(
        fc.property(
          hostnameArb,
          portArb,
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          (host, port, username, password, realm, token) => {
            clearIntegrationEnv();
            process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret
            process.env.PROXMOX_HOST = host; // pragma: allowlist secret
            process.env.PROXMOX_PORT = String(port); // pragma: allowlist secret
            if (username !== undefined) process.env.PROXMOX_USERNAME = username; // pragma: allowlist secret
            if (password !== undefined) process.env.PROXMOX_PASSWORD = password; // pragma: allowlist secret
            if (realm !== undefined) process.env.PROXMOX_REALM = realm; // pragma: allowlist secret
            if (token !== undefined) process.env.PROXMOX_TOKEN = token; // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.proxmox).toBeDefined();
            expect(config.integrations.proxmox!.enabled).toBe(true);
            expect(config.integrations.proxmox!.host).toBe(host);
            expect(config.integrations.proxmox!.port).toBe(port);
            if (username !== undefined) expect(config.integrations.proxmox!.username).toBe(username);
            if (password !== undefined) expect(config.integrations.proxmox!.password).toBe(password);
            if (realm !== undefined) expect(config.integrations.proxmox!.realm).toBe(realm);
            if (token !== undefined) expect(config.integrations.proxmox!.token).toBe(token);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any valid AWS env vars", () => {
      fc.assert(
        fc.property(
          awsRegionArb,
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          (region, accessKeyId, secretAccessKey, sessionToken, profile) => {
            clearIntegrationEnv();
            process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
            process.env.AWS_DEFAULT_REGION = region; // pragma: allowlist secret
            if (accessKeyId !== undefined) process.env.AWS_ACCESS_KEY_ID = accessKeyId; // pragma: allowlist secret
            if (secretAccessKey !== undefined) process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey; // pragma: allowlist secret
            if (sessionToken !== undefined) process.env.AWS_SESSION_TOKEN = sessionToken; // pragma: allowlist secret
            if (profile !== undefined) process.env.AWS_PROFILE = profile; // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.aws).toBeDefined();
            expect(config.integrations.aws!.enabled).toBe(true);
            expect(config.integrations.aws!.region).toBe(region);
            if (accessKeyId !== undefined) expect(config.integrations.aws!.accessKeyId).toBe(accessKeyId);
            if (secretAccessKey !== undefined) expect(config.integrations.aws!.secretAccessKey).toBe(secretAccessKey);
            if (sessionToken !== undefined) expect(config.integrations.aws!.sessionToken).toBe(sessionToken);
            if (profile !== undefined) expect(config.integrations.aws!.profile).toBe(profile);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any valid PuppetDB env vars", () => {
      fc.assert(
        fc.property(
          urlArb,
          fc.option(portArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(posIntArb, { nil: undefined }),
          (serverUrl, port, token, timeout) => {
            clearIntegrationEnv();
            process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
            process.env.PUPPETDB_SERVER_URL = serverUrl; // pragma: allowlist secret
            if (port !== undefined) process.env.PUPPETDB_PORT = String(port); // pragma: allowlist secret
            if (token !== undefined) process.env.PUPPETDB_TOKEN = token; // pragma: allowlist secret
            if (timeout !== undefined) process.env.PUPPETDB_TIMEOUT = String(timeout); // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.puppetdb).toBeDefined();
            expect(config.integrations.puppetdb!.enabled).toBe(true);
            expect(config.integrations.puppetdb!.serverUrl).toBe(serverUrl);
            if (port !== undefined) expect(config.integrations.puppetdb!.port).toBe(port);
            if (token !== undefined) expect(config.integrations.puppetdb!.token).toBe(token);
            if (timeout !== undefined) expect(config.integrations.puppetdb!.timeout).toBe(timeout);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any valid Puppetserver env vars", () => {
      fc.assert(
        fc.property(
          urlArb,
          fc.option(portArb, { nil: undefined }),
          fc.option(tokenArb, { nil: undefined }),
          fc.option(posIntArb, { nil: undefined }),
          (serverUrl, port, token, timeout) => {
            clearIntegrationEnv();
            process.env.PUPPETSERVER_ENABLED = "true"; // pragma: allowlist secret
            process.env.PUPPETSERVER_SERVER_URL = serverUrl; // pragma: allowlist secret
            if (port !== undefined) process.env.PUPPETSERVER_PORT = String(port); // pragma: allowlist secret
            if (token !== undefined) process.env.PUPPETSERVER_TOKEN = token; // pragma: allowlist secret
            if (timeout !== undefined) process.env.PUPPETSERVER_TIMEOUT = String(timeout); // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.puppetserver).toBeDefined();
            expect(config.integrations.puppetserver!.enabled).toBe(true);
            expect(config.integrations.puppetserver!.serverUrl).toBe(serverUrl);
            if (port !== undefined) expect(config.integrations.puppetserver!.port).toBe(port);
            if (token !== undefined) expect(config.integrations.puppetserver!.token).toBe(token);
            if (timeout !== undefined) expect(config.integrations.puppetserver!.timeout).toBe(timeout);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any valid Ansible env vars", () => {
      fc.assert(
        fc.property(
          pathArb,
          fc.option(pathArb, { nil: undefined }),
          fc.option(posIntArb, { nil: undefined }),
          (projectPath, inventoryPath, timeout) => {
            clearIntegrationEnv();
            process.env.ANSIBLE_ENABLED = "true"; // pragma: allowlist secret
            process.env.ANSIBLE_PROJECT_PATH = projectPath; // pragma: allowlist secret
            if (inventoryPath !== undefined) process.env.ANSIBLE_INVENTORY_PATH = inventoryPath; // pragma: allowlist secret
            if (timeout !== undefined) process.env.ANSIBLE_EXECUTION_TIMEOUT = String(timeout); // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.ansible).toBeDefined();
            expect(config.integrations.ansible!.enabled).toBe(true);
            expect(config.integrations.ansible!.projectPath).toBe(projectPath);
            if (inventoryPath !== undefined) expect(config.integrations.ansible!.inventoryPath).toBe(inventoryPath);
            if (timeout !== undefined) expect(config.integrations.ansible!.timeout).toBe(timeout);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any valid Hiera env vars", () => {
      fc.assert(
        fc.property(
          pathArb,
          fc.option(pathArb, { nil: undefined }),
          (controlRepoPath, hieraConfigPath) => {
            clearIntegrationEnv();
            process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
            process.env.HIERA_CONTROL_REPO_PATH = controlRepoPath; // pragma: allowlist secret
            if (hieraConfigPath !== undefined) process.env.HIERA_CONFIG_PATH = hieraConfigPath; // pragma: allowlist secret

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations.hiera).toBeDefined();
            expect(config.integrations.hiera!.enabled).toBe(true);
            expect(config.integrations.hiera!.controlRepoPath).toBe(controlRepoPath);
            if (hieraConfigPath !== undefined) expect(config.integrations.hiera!.hieraConfigPath).toBe(hieraConfigPath);
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig with no integrations when none are enabled", () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            clearIntegrationEnv();

            const configService = new ConfigService();
            const config = configService.getConfig();

            expect(config.integrations).toBeDefined();
            expect(config.integrations.proxmox).toBeUndefined();
            expect(config.integrations.aws).toBeUndefined();
            expect(config.integrations.puppetdb).toBeUndefined();
            expect(config.integrations.puppetserver).toBeUndefined();
            expect(config.integrations.hiera).toBeUndefined();
            expect(config.integrations.ansible).toBeUndefined();
          },
        ),
        propertyTestConfig,
      );
    });

    it("should produce valid AppConfig for any combination of enabled integrations", () => {
      fc.assert(
        fc.property(
          fc.boolean(), // proxmox
          fc.boolean(), // aws
          fc.boolean(), // puppetdb
          fc.boolean(), // ansible
          (enableProxmox, enableAws, enablePuppetdb, enableAnsible) => {
            clearIntegrationEnv();

            if (enableProxmox) {
              process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret
              process.env.PROXMOX_HOST = "proxmox.test"; // pragma: allowlist secret
            }
            if (enableAws) {
              process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
            }
            if (enablePuppetdb) {
              process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
              process.env.PUPPETDB_SERVER_URL = "https://puppetdb.test"; // pragma: allowlist secret
            }
            if (enableAnsible) {
              process.env.ANSIBLE_ENABLED = "true"; // pragma: allowlist secret
              process.env.ANSIBLE_PROJECT_PATH = "/opt/ansible"; // pragma: allowlist secret
            }

            const configService = new ConfigService();
            const config = configService.getConfig();

            // Verify each integration is present/absent based on enabled flag
            if (enableProxmox) {
              expect(config.integrations.proxmox?.enabled).toBe(true);
            } else {
              expect(config.integrations.proxmox).toBeUndefined();
            }
            if (enableAws) {
              expect(config.integrations.aws?.enabled).toBe(true);
            } else {
              expect(config.integrations.aws).toBeUndefined();
            }
            if (enablePuppetdb) {
              expect(config.integrations.puppetdb?.enabled).toBe(true);
            } else {
              expect(config.integrations.puppetdb).toBeUndefined();
            }
            if (enableAnsible) {
              expect(config.integrations.ansible?.enabled).toBe(true);
            } else {
              expect(config.integrations.ansible).toBeUndefined();
            }

            // Config should always be structurally valid
            expect(config.port).toBeTypeOf("number");
            expect(config.host).toBeTypeOf("string");
            expect(config.logLevel).toBeTypeOf("string");
          },
        ),
        propertyTestConfig,
      );
    });
  });

  // ─── Unit Tests: Proxmox integration config ──────────────────────────────
  describe("Proxmox Configuration", () => {
    it("should load Proxmox configuration when enabled", () => {
      process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret
      process.env.PROXMOX_HOST = "proxmox.example.com"; // pragma: allowlist secret
      process.env.PROXMOX_PORT = "8006"; // pragma: allowlist secret
      process.env.PROXMOX_USERNAME = "root"; // pragma: allowlist secret
      process.env.PROXMOX_PASSWORD = "secret123"; // pragma: allowlist secret
      process.env.PROXMOX_REALM = "pam"; // pragma: allowlist secret
      process.env.PROXMOX_TOKEN = "user@pam!tokenid=token-value"; // pragma: allowlist secret
      process.env.PROXMOX_TIMEOUT = "60000"; // pragma: allowlist secret
      process.env.PROXMOX_PRIORITY = "5"; // pragma: allowlist secret

      const configService = new ConfigService();
      const config = configService.getConfig();
      const proxmox = config.integrations.proxmox;

      expect(proxmox).toBeDefined();
      expect(proxmox!.enabled).toBe(true);
      expect(proxmox!.host).toBe("proxmox.example.com");
      expect(proxmox!.port).toBe(8006);
      expect(proxmox!.username).toBe("root");
      expect(proxmox!.password).toBe("secret123");
      expect(proxmox!.realm).toBe("pam");
      expect(proxmox!.token).toBe("user@pam!tokenid=token-value");
      expect(proxmox!.timeout).toBe(60000);
      expect(proxmox!.priority).toBe(5);
    });

    it("should apply Proxmox defaults for port, timeout, and priority", () => {
      process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret
      process.env.PROXMOX_HOST = "proxmox.local"; // pragma: allowlist secret

      const configService = new ConfigService();
      const proxmox = configService.getConfig().integrations.proxmox;

      expect(proxmox!.port).toBe(8006);
      expect(proxmox!.timeout).toBe(30000);
      expect(proxmox!.priority).toBe(7);
    });

    it("should parse Proxmox SSL configuration", () => {
      process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret
      process.env.PROXMOX_HOST = "proxmox.local"; // pragma: allowlist secret
      process.env.PROXMOX_SSL_REJECT_UNAUTHORIZED = "false"; // pragma: allowlist secret
      process.env.PROXMOX_SSL_CA = "/etc/ssl/ca.pem"; // pragma: allowlist secret

      const configService = new ConfigService();
      const proxmox = configService.getConfig().integrations.proxmox;

      expect(proxmox!.ssl).toBeDefined();
      expect(proxmox!.ssl!.rejectUnauthorized).toBe(false);
      expect(proxmox!.ssl!.ca).toBe("/etc/ssl/ca.pem");
    });

    it("should throw when PROXMOX_HOST is missing but enabled", () => {
      process.env.PROXMOX_ENABLED = "true"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "PROXMOX_HOST is required when PROXMOX_ENABLED is true",
      );
    });

    it("should not include Proxmox when disabled", () => {
      const configService = new ConfigService();
      expect(configService.getConfig().integrations.proxmox).toBeUndefined();
    });
  });

  // ─── Unit Tests: AWS integration config ──────────────────────────────────
  describe("AWS Configuration", () => {
    it("should load AWS configuration when enabled", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"; // pragma: allowlist secret
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"; // pragma: allowlist secret
      process.env.AWS_DEFAULT_REGION = "us-west-2"; // pragma: allowlist secret

      const configService = new ConfigService();
      const aws = configService.getAWSConfig();

      expect(aws).not.toBeNull();
      expect(aws!.enabled).toBe(true);
      expect(aws!.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(aws!.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
      expect(aws!.region).toBe("us-west-2");
    });

    it("should return null when AWS is not enabled", () => {
      const configService = new ConfigService();
      expect(configService.getAWSConfig()).toBeNull();
    });

    it("should use default region us-east-1 when AWS_DEFAULT_REGION is not set", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret

      const configService = new ConfigService();
      const aws = configService.getAWSConfig();

      expect(aws!.region).toBe("us-east-1");
    });

    it("should parse optional AWS fields", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_SESSION_TOKEN = "FwoGZXIvYXdzEBYaDH"; // pragma: allowlist secret
      process.env.AWS_PROFILE = "production"; // pragma: allowlist secret
      process.env.AWS_ENDPOINT = "http://localhost:4566"; // pragma: allowlist secret

      const configService = new ConfigService();
      const aws = configService.getAWSConfig();

      expect(aws!.sessionToken).toBe("FwoGZXIvYXdzEBYaDH");
      expect(aws!.profile).toBe("production");
      expect(aws!.endpoint).toBe("http://localhost:4566");
    });

    it("should parse AWS_REGIONS as JSON array", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_REGIONS = '["us-east-1","eu-west-1"]'; // pragma: allowlist secret

      const configService = new ConfigService();
      const aws = configService.getAWSConfig();

      expect(aws!.regions).toEqual(["us-east-1", "eu-west-1"]);
    });

    it("should parse AWS_REGIONS as comma-separated string", () => {
      process.env.AWS_ENABLED = "true"; // pragma: allowlist secret
      process.env.AWS_REGIONS = "us-east-1,eu-west-1"; // pragma: allowlist secret

      const configService = new ConfigService();
      const aws = configService.getAWSConfig();

      expect(aws!.regions).toEqual(["us-east-1", "eu-west-1"]);
    });
  });

  // ─── Unit Tests: PuppetDB integration config ────────────────────────────
  describe("PuppetDB Configuration", () => {
    it("should load PuppetDB configuration when enabled", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com"; // pragma: allowlist secret
      process.env.PUPPETDB_PORT = "8081"; // pragma: allowlist secret
      process.env.PUPPETDB_TOKEN = "test-token"; // pragma: allowlist secret
      process.env.PUPPETDB_TIMEOUT = "45000"; // pragma: allowlist secret
      process.env.PUPPETDB_RETRY_ATTEMPTS = "5"; // pragma: allowlist secret
      process.env.PUPPETDB_RETRY_DELAY = "2000"; // pragma: allowlist secret

      const configService = new ConfigService();
      const puppetdb = configService.getPuppetDBConfig();

      expect(puppetdb).not.toBeNull();
      expect(puppetdb!.enabled).toBe(true);
      expect(puppetdb!.serverUrl).toBe("https://puppetdb.example.com");
      expect(puppetdb!.port).toBe(8081);
      expect(puppetdb!.token).toBe("test-token");
      expect(puppetdb!.timeout).toBe(45000);
      expect(puppetdb!.retryAttempts).toBe(5);
      expect(puppetdb!.retryDelay).toBe(2000);
    });

    it("should return null when PuppetDB is not enabled", () => {
      const configService = new ConfigService();
      expect(configService.getPuppetDBConfig()).toBeNull();
    });

    it("should apply PuppetDB defaults", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com"; // pragma: allowlist secret

      const configService = new ConfigService();
      const config = configService.getConfig().integrations.puppetdb;

      expect(config!.timeout).toBe(30000);
      expect(config!.retryAttempts).toBe(3);
      expect(config!.retryDelay).toBe(1000);
    });

    it("should load PuppetDB SSL configuration", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com"; // pragma: allowlist secret
      process.env.PUPPETDB_SSL_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SSL_CA = "/path/to/ca.pem"; // pragma: allowlist secret
      process.env.PUPPETDB_SSL_CERT = "/path/to/cert.pem"; // pragma: allowlist secret
      process.env.PUPPETDB_SSL_KEY = "/path/to/key.pem"; // pragma: allowlist secret
      process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED = "true"; // pragma: allowlist secret

      const configService = new ConfigService();
      const puppetdb = configService.getPuppetDBConfig();

      expect(puppetdb!.ssl).toBeDefined();
      expect(puppetdb!.ssl!.enabled).toBe(true);
      expect(puppetdb!.ssl!.ca).toBe("/path/to/ca.pem");
      expect(puppetdb!.ssl!.cert).toBe("/path/to/cert.pem");
      expect(puppetdb!.ssl!.key).toBe("/path/to/key.pem");
      expect(puppetdb!.ssl!.rejectUnauthorized).toBe(true);
    });

    it("should parse PuppetDB circuit breaker configuration", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com"; // pragma: allowlist secret
      process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD = "10"; // pragma: allowlist secret
      process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT = "120000"; // pragma: allowlist secret
      process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT = "60000"; // pragma: allowlist secret

      const configService = new ConfigService();
      const puppetdb = configService.getPuppetDBConfig();

      expect(puppetdb!.circuitBreaker).toBeDefined();
      expect(puppetdb!.circuitBreaker!.threshold).toBe(10);
      expect(puppetdb!.circuitBreaker!.timeout).toBe(120000);
      expect(puppetdb!.circuitBreaker!.resetTimeout).toBe(60000);
    });

    it("should throw when PUPPETDB_SERVER_URL is missing but enabled", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "PUPPETDB_SERVER_URL is required when PUPPETDB_ENABLED is true",
      );
    });

    it("should throw on invalid PuppetDB server URL", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "not-a-valid-url"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow();
    });

    it("should throw on negative PuppetDB port", () => {
      process.env.PUPPETDB_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETDB_SERVER_URL = "https://puppetdb.example.com"; // pragma: allowlist secret
      process.env.PUPPETDB_PORT = "-1"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow();
    });
  });

  // ─── Unit Tests: Puppetserver integration config ─────────────────────────
  describe("Puppetserver Configuration", () => {
    it("should load Puppetserver configuration when enabled", () => {
      process.env.PUPPETSERVER_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETSERVER_SERVER_URL = "https://puppet.example.com"; // pragma: allowlist secret
      process.env.PUPPETSERVER_PORT = "8140"; // pragma: allowlist secret
      process.env.PUPPETSERVER_TOKEN = "ps-token"; // pragma: allowlist secret

      const configService = new ConfigService();
      const ps = configService.getPuppetserverConfig();

      expect(ps).not.toBeNull();
      expect(ps!.enabled).toBe(true);
      expect(ps!.serverUrl).toBe("https://puppet.example.com");
      expect(ps!.port).toBe(8140);
      expect(ps!.token).toBe("ps-token");
    });

    it("should return null when Puppetserver is not enabled", () => {
      const configService = new ConfigService();
      expect(configService.getPuppetserverConfig()).toBeNull();
    });

    it("should throw when PUPPETSERVER_SERVER_URL is missing but enabled", () => {
      process.env.PUPPETSERVER_ENABLED = "true"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "PUPPETSERVER_SERVER_URL is required when PUPPETSERVER_ENABLED is true",
      );
    });

    it("should apply Puppetserver defaults", () => {
      process.env.PUPPETSERVER_ENABLED = "true"; // pragma: allowlist secret
      process.env.PUPPETSERVER_SERVER_URL = "https://puppet.example.com"; // pragma: allowlist secret

      const configService = new ConfigService();
      const ps = configService.getConfig().integrations.puppetserver;

      expect(ps!.timeout).toBe(30000);
      expect(ps!.retryAttempts).toBe(3);
      expect(ps!.retryDelay).toBe(1000);
      expect(ps!.inactivityThreshold).toBe(3600);
    });
  });

  // ─── Unit Tests: Hiera integration config ────────────────────────────────
  describe("Hiera Configuration", () => {
    it("should load Hiera configuration when enabled", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CONTROL_REPO_PATH = "/opt/puppet/control-repo"; // pragma: allowlist secret
      process.env.HIERA_CONFIG_PATH = "custom-hiera.yaml"; // pragma: allowlist secret
      process.env.HIERA_ENVIRONMENTS = '["production","staging"]'; // pragma: allowlist secret

      const configService = new ConfigService();
      const hiera = configService.getHieraConfig();

      expect(hiera).not.toBeNull();
      expect(hiera!.enabled).toBe(true);
      expect(hiera!.controlRepoPath).toBe("/opt/puppet/control-repo");
      expect(hiera!.hieraConfigPath).toBe("custom-hiera.yaml");
      expect(hiera!.environments).toEqual(["production", "staging"]);
    });

    it("should return null when Hiera is not enabled", () => {
      const configService = new ConfigService();
      expect(configService.getHieraConfig()).toBeNull();
    });

    it("should throw when HIERA_CONTROL_REPO_PATH is missing but enabled", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "HIERA_CONTROL_REPO_PATH is required when HIERA_ENABLED is true",
      );
    });

    it("should throw on invalid HIERA_ENVIRONMENTS JSON", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CONTROL_REPO_PATH = "/opt/puppet/control-repo"; // pragma: allowlist secret
      process.env.HIERA_ENVIRONMENTS = "not-json"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "HIERA_ENVIRONMENTS must be a valid JSON array of strings",
      );
    });

    it("should apply Hiera defaults", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CONTROL_REPO_PATH = "/opt/puppet/control-repo"; // pragma: allowlist secret

      const configService = new ConfigService();
      const hiera = configService.getConfig().integrations.hiera;

      expect(hiera!.hieraConfigPath).toBe("hiera.yaml");
      expect(hiera!.environments).toEqual(["production"]);
      expect(hiera!.factSources.preferPuppetDB).toBe(true);
      expect(hiera!.cache.enabled).toBe(true);
      expect(hiera!.cache.ttl).toBe(300000);
    });

    it("should parse Hiera catalog compilation config", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CONTROL_REPO_PATH = "/opt/puppet/control-repo"; // pragma: allowlist secret
      process.env.HIERA_CATALOG_COMPILATION_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CATALOG_COMPILATION_TIMEOUT = "120000"; // pragma: allowlist secret

      const configService = new ConfigService();
      const hiera = configService.getConfig().integrations.hiera;

      expect(hiera!.catalogCompilation.enabled).toBe(true);
      expect(hiera!.catalogCompilation.timeout).toBe(120000);
    });
  });

  // ─── Unit Tests: Ansible integration config ──────────────────────────────
  describe("Ansible Configuration", () => {
    it("should load Ansible configuration when enabled", () => {
      process.env.ANSIBLE_ENABLED = "true"; // pragma: allowlist secret
      process.env.ANSIBLE_PROJECT_PATH = "/opt/ansible"; // pragma: allowlist secret
      process.env.ANSIBLE_INVENTORY_PATH = "inventory/production"; // pragma: allowlist secret
      process.env.ANSIBLE_EXECUTION_TIMEOUT = "600000"; // pragma: allowlist secret

      const configService = new ConfigService();
      const ansible = configService.getAnsibleConfig();

      expect(ansible).not.toBeNull();
      expect(ansible!.enabled).toBe(true);
      expect(ansible!.projectPath).toBe("/opt/ansible");
      expect(ansible!.inventoryPath).toBe("inventory/production");
      expect(ansible!.timeout).toBe(600000);
    });

    it("should return null when Ansible is not enabled", () => {
      const configService = new ConfigService();
      expect(configService.getAnsibleConfig()).toBeNull();
    });

    it("should apply Ansible defaults", () => {
      process.env.ANSIBLE_ENABLED = "true"; // pragma: allowlist secret

      const configService = new ConfigService();
      const ansible = configService.getConfig().integrations.ansible;

      expect(ansible!.projectPath).toBe(process.cwd());
      expect(ansible!.inventoryPath).toBe("inventory/hosts");
      expect(ansible!.timeout).toBe(300000);
    });
  });

  // ─── Unit Tests: Defaults and core config ────────────────────────────────
  describe("Default Configuration", () => {
    it("should apply all core defaults when no env vars are set", () => {
      const configService = new ConfigService();
      const config = configService.getConfig();

      expect(config.port).toBe(3000);
      expect(config.host).toBe("localhost");
      expect(config.executionTimeout).toBe(300000);
      expect(config.logLevel).toBe("info");
      expect(config.databasePath).toBe("./data/pabawi.db");
      expect(config.streaming.bufferMs).toBe(100);
      expect(config.streaming.maxOutputSize).toBe(10485760);
      expect(config.cache.inventoryTtl).toBe(30000);
      expect(config.cache.factsTtl).toBe(300000);
      expect(config.executionQueue.concurrentLimit).toBe(5);
      expect(config.executionQueue.maxQueueSize).toBe(50);
      expect(config.provisioning.allowDestructiveActions).toBe(false);
      expect(config.ui.showHomePageRunChart).toBe(true);
    });

    it("should override defaults with env vars", () => {
      process.env.PORT = "4000";
      process.env.HOST = "0.0.0.0";
      process.env.LOG_LEVEL = "debug";
      process.env.DATABASE_PATH = "/data/custom.db";

      const configService = new ConfigService();
      const config = configService.getConfig();

      expect(config.port).toBe(4000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.logLevel).toBe("debug");
      expect(config.databasePath).toBe("/data/custom.db");
    });

    it("should parse CORS_ALLOWED_ORIGINS as comma-separated list", () => {
      process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:5173";

      const configService = new ConfigService();
      const config = configService.getConfig();

      expect(config.corsAllowedOrigins).toEqual([
        "http://localhost:3000",
        "http://localhost:5173",
      ]);
    });

    it("should parse COMMAND_WHITELIST as JSON array", () => {
      process.env.COMMAND_WHITELIST = '["puppet","bolt"]';
      process.env.COMMAND_WHITELIST_ALLOW_ALL = "false";
      process.env.COMMAND_WHITELIST_MATCH_MODE = "prefix";

      const configService = new ConfigService();
      const whitelist = configService.getCommandWhitelist();

      expect(whitelist.whitelist).toEqual(["puppet", "bolt"]);
      expect(whitelist.allowAll).toBe(false);
      expect(whitelist.matchMode).toBe("prefix");
    });

    it("should parse provisioning safety config", () => {
      process.env.ALLOW_DESTRUCTIVE_PROVISIONING = "true";

      const configService = new ConfigService();
      expect(configService.isDestructiveProvisioningAllowed()).toBe(true);
    });
  });

  // ─── Unit Tests: Error cases ─────────────────────────────────────────────
  describe("Error Cases", () => {
    it("should throw on invalid COMMAND_WHITELIST JSON", () => {
      process.env.COMMAND_WHITELIST = "not-json{";

      expect(() => new ConfigService()).toThrow("Failed to parse COMMAND_WHITELIST");
    });

    it("should throw on invalid LOG_LEVEL value", () => {
      process.env.LOG_LEVEL = "verbose";

      expect(() => new ConfigService()).toThrow();
    });

    it("should throw on non-positive PORT", () => {
      process.env.PORT = "0";

      expect(() => new ConfigService()).toThrow();
    });

    it("should throw on invalid HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS JSON", () => {
      process.env.HIERA_ENABLED = "true"; // pragma: allowlist secret
      process.env.HIERA_CONTROL_REPO_PATH = "/opt/puppet/control-repo"; // pragma: allowlist secret
      process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS = "not-json"; // pragma: allowlist secret

      expect(() => new ConfigService()).toThrow(
        "HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS must be a valid JSON array of strings",
      );
    });
  });

  // ─── Unit Tests: Getter methods ──────────────────────────────────────────
  describe("Getter Methods", () => {
    it("should return correct values from getter methods", () => {
      process.env.PORT = "5000";
      process.env.HOST = "0.0.0.0";
      process.env.BOLT_PROJECT_PATH = "/opt/bolt";
      process.env.BOLT_EXECUTION_TIMEOUT = "120000";
      process.env.LOG_LEVEL = "warn";
      process.env.DATABASE_PATH = "/data/test.db";

      const configService = new ConfigService();

      expect(configService.getPort()).toBe(5000);
      expect(configService.getHost()).toBe("0.0.0.0");
      expect(configService.getBoltProjectPath()).toBe("/opt/bolt");
      expect(configService.getExecutionTimeout()).toBe(120000);
      expect(configService.getLogLevel()).toBe("warn");
      expect(configService.getDatabasePath()).toBe("/data/test.db");
    });

    it("should return config via generic get method", () => {
      const configService = new ConfigService();

      expect(configService.get("port")).toBe(configService.getPort());
      expect(configService.get("host")).toBe(configService.getHost());
      expect(configService.get("logLevel")).toBe(configService.getLogLevel());
    });
  });
});
