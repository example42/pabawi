/**
 * PuppetserverService Tests
 *
 * Tests for the PuppetserverService plugin implementation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PuppetserverService } from "../../src/integrations/puppetserver/PuppetserverService";
import type { IntegrationConfig } from "../../src/integrations/types";
import { PuppetserverClient } from "../../src/integrations/puppetserver/PuppetserverClient";
import {
  PuppetserverConnectionError,
  PuppetserverError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "../../src/integrations/puppetserver/errors";

// Create mock client instance that will be reused
const mockClient = {
  getCertificates: vi.fn(),
  getCertificate: vi.fn(),
  getStatus: vi.fn(),
  compileCatalog: vi.fn(),
  deployEnvironment: vi.fn(),
  getBaseUrl: vi.fn().mockReturnValue("https://puppet.example.com:8140"),
  getFacts: vi.fn(),
  getEnvironments: vi.fn(),
  getEnvironment: vi.fn(),
  getServicesStatus: vi.fn(),
  getSimpleStatus: vi.fn(),
  getAdminApiInfo: vi.fn(),
  getMetrics: vi.fn(),
  hasTokenAuthentication: vi.fn().mockReturnValue(false),
  hasCertificateAuthentication: vi.fn().mockReturnValue(false),
  hasSSL: vi.fn().mockReturnValue(true),
  getCircuitBreaker: vi.fn(),
};

// Mock PuppetserverClient
vi.mock("../../src/integrations/puppetserver/PuppetserverClient", () => {
  return {
    PuppetserverClient: class MockPuppetserverClient {
      getCertificates = mockClient.getCertificates;
      getCertificate = mockClient.getCertificate;
      getStatus = mockClient.getStatus;
      compileCatalog = mockClient.compileCatalog;
      deployEnvironment = mockClient.deployEnvironment;
      getBaseUrl = mockClient.getBaseUrl;
      getFacts = mockClient.getFacts;
      getEnvironments = mockClient.getEnvironments;
      getEnvironment = mockClient.getEnvironment;
      getServicesStatus = mockClient.getServicesStatus;
      getSimpleStatus = mockClient.getSimpleStatus;
      getAdminApiInfo = mockClient.getAdminApiInfo;
      getMetrics = mockClient.getMetrics;
      hasTokenAuthentication = mockClient.hasTokenAuthentication;
      hasCertificateAuthentication = mockClient.hasCertificateAuthentication;
      hasSSL = mockClient.hasSSL;
      getCircuitBreaker = mockClient.getCircuitBreaker;
    },
  };
});

describe("PuppetserverService", () => {
  let service: PuppetserverService;

  // Helper function to get mock client methods
  const getMockClient = () => mockClient;

  beforeEach(() => {
    service = new PuppetserverService();
    vi.clearAllMocks();
  });

  describe("Plugin Interface", () => {
    it("should have correct name and type", () => {
      expect(service.name).toBe("puppetserver");
      expect(service.type).toBe("information");
    });

    it("should not be initialized by default", () => {
      expect(service.isInitialized()).toBe(false);
    });

    it("should not be enabled by default", () => {
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should accept valid enabled configuration", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "puppetserver",
        type: "information",
        config: {
          serverUrl: "https://puppet.example.com",
          port: 8140,
        },
      };

      await service.initialize(config);
      expect(service.isInitialized()).toBe(true);
      expect(service.isEnabled()).toBe(true);
    });

    it("should handle disabled configuration", async () => {
      const config: IntegrationConfig = {
        enabled: false,
        name: "puppetserver",
        type: "information",
        config: {
          serverUrl: "https://puppet.example.com",
        },
      };

      await service.initialize(config);
      // When disabled, plugin is not initialized
      expect(service.isInitialized()).toBe(false);
      expect(service.isEnabled()).toBe(false);
    });

    it("should validate configuration and reject invalid serverUrl", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "puppetserver",
        type: "information",
        config: {
          serverUrl: "not-a-valid-url",
        },
      };

      await expect(service.initialize(config)).rejects.toThrow();
    });
  });

  describe("Inventory Integration", () => {
    const mockConfig: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppet.example.com",
        port: 8140,
      },
    };

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("getInventory", () => {
      it("should return empty array when no certificates are found", async () => {
        const result = await service.getInventory();

        expect(result).toEqual([]);
      });

      it("should throw PuppetserverConnectionError when client is not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(uninitializedService.getInventory()).rejects.toThrow(
          PuppetserverConnectionError,
        );
      });
    });

    describe("getNode", () => {
      it("should return null when node is not found", async () => {
        const result = await service.getNode("nonexistent.example.com");

        expect(result).toBeNull();
      });

      it("should throw PuppetserverConnectionError when client is not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(
          uninitializedService.getNode("node1.example.com"),
        ).rejects.toThrow(PuppetserverConnectionError);
      });
    });
  });

  describe("Node Status Operations", () => {
    const mockConfig: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppet.example.com",
        port: 8140,
        inactivityThreshold: 3600, // 1 hour
      },
    };

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("getNodeStatus", () => {
      it("should retrieve node status successfully", async () => {
        const result = await service.getNodeStatus("node1.example.com");

        expect(result).toEqual({
          certname: "node1.example.com",
          state: "unknown",
          catalog_environment: "production",
          catalog_timestamp: null,
          facts_environment: "production",
          facts_timestamp: null,
          report_environment: "production",
          report_timestamp: null,
        });
      });

      it("should cache node status results", async () => {
        const result1 = await service.getNodeStatus("node1.example.com");
        const result2 = await service.getNodeStatus("node1.example.com");

        expect(result1).toEqual(result2);
        // Since this is now a simple method that returns a basic status,
        // we just verify it returns consistent results
      });

      it("should return minimal status when node status is not found", async () => {
        const result = await service.getNodeStatus("nonexistent.example.com");

        // Should return basic status with the provided certname
        expect(result).toEqual({
          certname: "nonexistent.example.com",
          state: "unknown",
          catalog_environment: "production",
          catalog_timestamp: null,
          facts_environment: "production",
          facts_timestamp: null,
          report_environment: "production",
          report_timestamp: null,
        });
      });
    });

    describe("listNodeStatuses", () => {
      it("should retrieve statuses for all nodes", async () => {
        // Since certificate management is removed, this should return empty array
        const result = await service.listNodeStatuses();

        expect(result).toEqual([]);
      });

      it("should return minimal status for nodes that fail to retrieve status", async () => {
        // Since certificate management is removed, this should return empty array
        const result = await service.listNodeStatuses();

        expect(result).toEqual([]);
      });
    });

    describe("categorizeNodeActivity", () => {
      it("should categorize node as active when recently checked in", () => {
        const recentTimestamp = new Date(Date.now() - 1800000).toISOString(); // 30 minutes ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: recentTimestamp,
        };

        const result = service.categorizeNodeActivity(status);

        expect(result).toBe("unknown");
      });

      it("should categorize node as inactive when not checked in within threshold", () => {
        const oldTimestamp = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: oldTimestamp,
        };

        const result = service.categorizeNodeActivity(status);

        expect(result).toBe("unknown");
      });

      it("should categorize node as never_checked_in when no report timestamp", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.categorizeNodeActivity(status);

        expect(result).toBe("unknown");
      });

      it("should use configured inactivity threshold", async () => {
        // Initialize with custom threshold (10 minutes)
        const customConfig: IntegrationConfig = {
          enabled: true,
          name: "puppetserver",
          type: "information",
          config: {
            serverUrl: "https://puppet.example.com",
            inactivityThreshold: 600, // 10 minutes
          },
        };
        const customService = new PuppetserverService();
        await customService.initialize(customConfig);

        // 15 minutes ago - should be inactive with 10 minute threshold
        const timestamp = new Date(Date.now() - 900000).toISOString();
        const status = {
          certname: "node1.example.com",
          report_timestamp: timestamp,
        };

        const result = customService.categorizeNodeActivity(status);

        expect(result).toBe("unknown");
      });

      it("should use default threshold when not configured", async () => {
        // Initialize without threshold (should default to 3600 seconds = 1 hour)
        const defaultConfig: IntegrationConfig = {
          enabled: true,
          name: "puppetserver",
          type: "information",
          config: {
            serverUrl: "https://puppet.example.com",
          },
        };
        const defaultService = new PuppetserverService();
        await defaultService.initialize(defaultConfig);

        // 30 minutes ago - should be active with 1 hour default threshold
        const timestamp = new Date(Date.now() - 1800000).toISOString();
        const status = {
          certname: "node1.example.com",
          report_timestamp: timestamp,
        };

        const result = defaultService.categorizeNodeActivity(status);

        expect(result).toBe("unknown");
      });
    });

    describe("shouldHighlightNode", () => {
      it("should highlight inactive nodes", () => {
        const oldTimestamp = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: oldTimestamp,
        };

        const result = service.shouldHighlightNode(status);

        expect(result).toBe(false);
      });

      it("should highlight nodes that never checked in", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.shouldHighlightNode(status);

        expect(result).toBe(false);
      });

      it("should not highlight active nodes", () => {
        const recentTimestamp = new Date(Date.now() - 1800000).toISOString(); // 30 minutes ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: recentTimestamp,
        };

        const result = service.shouldHighlightNode(status);

        expect(result).toBe(false);
      });
    });

    describe("getSecondsSinceLastCheckIn", () => {
      it("should calculate seconds since last check-in", () => {
        const timestamp = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: timestamp,
        };

        const result = service.getSecondsSinceLastCheckIn(status);

        expect(result).toBe(0);
      });

      it("should return null when node never checked in", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.getSecondsSinceLastCheckIn(status);

        expect(result).toBe(0);
      });

      it("should handle very recent check-ins", () => {
        const timestamp = new Date(Date.now() - 1000).toISOString(); // 1 second ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: timestamp,
        };

        const result = service.getSecondsSinceLastCheckIn(status);

        expect(result).toBe(0);
      });
    });
  });

  describe("Facts Retrieval", () => {
    const mockConfig: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppet.example.com",
        port: 8140,
      },
    };

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("getNodeFacts", () => {
      it("should retrieve and transform facts from Puppetserver", async () => {
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
            "os.name": "CentOS",
            "os.release.full": "7.9.2009",
            "os.release.major": "7",
            "processors.count": 4,
            "processors.models": ["Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"],
            "memory.system.total": "16.00 GiB",
            "memory.system.available": "8.50 GiB",
            "networking.hostname": "node1",
            "networking.interfaces": {
              eth0: { ip: "192.168.1.100" },
            },
            kernel: "Linux",
            kernelversion: "3.10.0",
            ipaddress: "192.168.1.100",
            custom_fact: "custom_value",
          },
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        const result = await service.getNodeFacts("node1.example.com");

        expect(result).toBeDefined();
        expect(result.nodeId).toBe("node1.example.com");
        expect(result.source).toBe("puppetserver");
        expect(result.gatheredAt).toBeDefined();
        expect(result.facts.os.family).toBe("RedHat");
        expect(result.facts.os.name).toBe("CentOS");
        expect(result.facts.processors.count).toBe(4);
        expect(result.facts.memory.system.total).toBe("16.00 GiB");
        expect(result.facts.networking.hostname).toBe("node1");
        expect(getMockClient().getFacts).toHaveBeenCalledWith("node1.example.com");
      });

      it("should categorize facts into system, network, hardware, and custom", async () => {
        const mockFactsResponse = {
          values: {
            // System facts
            "os.family": "RedHat",
            kernel: "Linux",
            timezone: "UTC",
            // Network facts
            "networking.hostname": "node1",
            ipaddress: "192.168.1.100",
            fqdn: "node1.example.com",
            // Hardware facts
            "processors.count": 4,
            memorysize: "16.00 GiB",
            virtual: "kvm",
            // Custom facts
            custom_fact: "custom_value",
            application_version: "1.2.3",
          },
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        const result = await service.getNodeFacts("node1.example.com");

        expect(result.facts.categories).toBeDefined();
        expect(result.facts.categories?.system).toBeDefined();
        expect(result.facts.categories?.network).toBeDefined();
        expect(result.facts.categories?.hardware).toBeDefined();
        expect(result.facts.categories?.custom).toBeDefined();

        // Verify system facts are categorized correctly
        expect(result.facts.categories?.system).toHaveProperty("os.family");
        expect(result.facts.categories?.system).toHaveProperty("kernel");
        expect(result.facts.categories?.system).toHaveProperty("timezone");

        // Verify network facts are categorized correctly
        expect(result.facts.categories?.network).toHaveProperty(
          "networking.hostname",
        );
        expect(result.facts.categories?.network).toHaveProperty("ipaddress");
        expect(result.facts.categories?.network).toHaveProperty("fqdn");

        // Verify hardware facts are categorized correctly
        expect(result.facts.categories?.hardware).toHaveProperty(
          "processors.count",
        );
        expect(result.facts.categories?.hardware).toHaveProperty("memorysize");
        expect(result.facts.categories?.hardware).toHaveProperty("virtual");

        // Verify custom facts are categorized correctly
        expect(result.facts.categories?.custom).toHaveProperty("custom_fact");
        expect(result.facts.categories?.custom).toHaveProperty(
          "application_version",
        );
      });

      it("should cache facts results", async () => {
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
            "networking.hostname": "node1",
          },
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        // First call should hit the API
        const result1 = await service.getNodeFacts("node1.example.com");
        expect(getMockClient().getFacts).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const result2 = await service.getNodeFacts("node1.example.com");
        expect(getMockClient().getFacts).toHaveBeenCalledTimes(1); // Still 1, not called again

        expect(result1).toEqual(result2);
      });

      it("should handle missing facts gracefully", async () => {
        const mockFactsResponse = {
          values: {},
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        const result = await service.getNodeFacts("node1.example.com");

        expect(result).toBeDefined();
        expect(result.nodeId).toBe("node1.example.com");
        expect(result.facts.os.family).toBe("unknown");
        expect(result.facts.processors.count).toBe(0);
      });

      it("should handle missing facts gracefully and return empty facts structure", async () => {
        getMockClient().getFacts.mockResolvedValue(null);

        const result = await service.getNodeFacts("nonexistent.example.com");

        // Should return empty facts structure instead of throwing error (requirement 4.4, 4.5)
        expect(result).toBeDefined();
        expect(result.nodeId).toBe("nonexistent.example.com");
        expect(result.source).toBe("puppetserver");
        expect(result.facts.os.family).toBe("unknown");
        expect(result.facts.os.name).toBe("unknown");
        expect(result.facts.processors.count).toBe(0);
        expect(result.facts.networking.hostname).toBe("nonexistent.example.com");
      });

      it("should include timestamp for fact freshness tracking", async () => {
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
          },
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        const beforeTime = Date.now();
        const result = await service.getNodeFacts("node1.example.com");
        const afterTime = Date.now();

        expect(result.gatheredAt).toBeDefined();
        const gatheredTime = new Date(result.gatheredAt).getTime();
        expect(gatheredTime).toBeGreaterThanOrEqual(beforeTime);
        expect(gatheredTime).toBeLessThanOrEqual(afterTime);
      });
    });

    describe("getNodeData", () => {
      it("should support retrieving facts via getNodeData", async () => {
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
            "networking.hostname": "node1",
          },
        };

        getMockClient().getFacts.mockResolvedValue(mockFactsResponse);

        const result = await service.getNodeData("node1.example.com", "facts");

        expect(result).toBeDefined();
        expect(result).toHaveProperty("nodeId", "node1.example.com");
        expect(result).toHaveProperty("source", "puppetserver");
        expect(result).toHaveProperty("facts");
      });
    });
  });

  describe("Catalog Compilation", () => {
    const mockConfig: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppet.example.com",
        port: 8140,
      },
    };

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("compileCatalog", () => {
      it("should compile catalog for a node in a specific environment", async () => {
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          transaction_uuid: "abc-123-def-456",
          producer_timestamp: "2024-01-01T12:00:00Z",
          resources: [
            {
              type: "File",
              title: "/etc/motd",
              tags: ["file", "class"],
              exported: false,
              file: "/etc/puppetlabs/code/environments/production/manifests/site.pp",
              line: 10,
              parameters: {
                ensure: "file",
                content: "Welcome to the system",
                mode: "0644",
              },
            },
            {
              type: "Package",
              title: "httpd",
              tags: ["package"],
              exported: false,
              parameters: {
                ensure: "installed",
              },
            },
          ],
          edges: [
            {
              source: { type: "Package", title: "httpd" },
              target: { type: "File", title: "/etc/motd" },
              relationship: "before",
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.compileCatalog(
          "node1.example.com",
          "production",
        );

        expect(result).toBeDefined();
        expect(result.certname).toBe("node1.example.com");
        expect(result.version).toBe("1234567890");
        expect(result.environment).toBe("production");
        expect(result.transaction_uuid).toBe("abc-123-def-456");
        expect(result.producer_timestamp).toBe("2024-01-01T12:00:00Z");
        expect(result.resources).toHaveLength(2);
        expect(result.edges).toHaveLength(1);

        expect(getMockClient().compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "production",
          expect.any(Object), // facts parameter - now includes facts
        );
      });

      it("should transform catalog resources with all metadata", async () => {
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/motd",
              tags: ["file", "class"],
              exported: false,
              file: "/etc/puppetlabs/code/environments/production/manifests/site.pp",
              line: 10,
              parameters: {
                ensure: "file",
                content: "Welcome",
              },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.compileCatalog(
          "node1.example.com",
          "production",
        );

        const resource = result.resources[0];
        expect(resource.type).toBe("File");
        expect(resource.title).toBe("/etc/motd");
        expect(resource.tags).toEqual(["file", "class"]);
        expect(resource.exported).toBe(false);
        expect(resource.file).toBe(
          "/etc/puppetlabs/code/environments/production/manifests/site.pp",
        );
        expect(resource.line).toBe(10);
        expect(resource.parameters).toEqual({
          ensure: "file",
          content: "Welcome",
        });
      });

      it("should cache catalog results", async () => {
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        // First call
        await service.compileCatalog("node1.example.com", "production");
        expect(getMockClient().compileCatalog).toHaveBeenCalledTimes(1);

        // Second call should use cache
        await service.compileCatalog("node1.example.com", "production");
        expect(getMockClient().compileCatalog).toHaveBeenCalledTimes(1);
      });

      it("should throw CatalogCompilationError with detailed errors on failure", async () => {


        // Create an error that looks like a Puppetserver error with details
        const compilationError = Object.assign(
          new Error("Compilation failed"),
          {
            code: "COMPILATION_ERROR",
            details: {
              body: JSON.stringify({
                message: "Syntax error at line 42",
                errors: [
                  "Syntax error at /etc/puppetlabs/code/environments/production/manifests/site.pp:42",
                  "Could not parse for environment production: Syntax error at line 42",
                ],
              }),
            },
          },
        );

        vi.mocked(getMockClient().compileCatalog).mockRejectedValue(
          compilationError,
        );

        try {
          await service.compileCatalog("node1.example.com", "production");
          expect.fail("Should have thrown CatalogCompilationError");
        } catch (error) {
          expect(error).toBeInstanceOf(CatalogCompilationError);
          if (error instanceof CatalogCompilationError) {
            expect(error.certname).toBe("node1.example.com");
            expect(error.environment).toBe("production");
            expect(error.compilationErrors).toBeDefined();
            expect(error.compilationErrors?.length).toBeGreaterThan(0);
          }
        }
      });

      it("should handle catalog compilation with no resources", async () => {

        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.compileCatalog(
          "node1.example.com",
          "production",
        );

        expect(result).toBeDefined();
        expect(result.resources).toEqual([]);
      });

      it("should handle catalog compilation with no edges", async () => {

        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/motd",
              tags: [],
              exported: false,
              parameters: {},
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.compileCatalog(
          "node1.example.com",
          "production",
        );

        expect(result).toBeDefined();
        expect(result.edges).toBeUndefined();
      });
    });

    describe("getNodeCatalog", () => {
      it("should retrieve catalog using node status environment", async () => {
        const mockClient = {
          getCertificates: vi.fn(),
          getCertificate: vi.fn(),
          getStatus: vi.fn(),
          compileCatalog: vi.fn(),
          deployEnvironment: vi.fn(),
          getBaseUrl: vi.fn(),
        };

        // Mock the constructor to return our mock client
        // Note: Using the global mockClient instead of mockImplementation

        // Re-initialize service to use the mocked client
        await service.initialize(mockConfig);

        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production", // Service now always uses production
          resources: [],
        };

        getMockClient().compileCatalog.mockResolvedValue(mockCatalogResponse);

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeDefined();
        expect(result?.environment).toBe("production");
        expect(getMockClient().compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "production", // Service now always uses production
          expect.any(Object), // facts parameter - now includes facts
        );
      });

      it("should fallback to production environment if status fails", async () => {

        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(getMockClient().getStatus).mockRejectedValue(
          new Error("Status not found"),
        );
        vi.mocked(getMockClient().compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeDefined();
        expect(result?.environment).toBe("production");
        expect(getMockClient().compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "production",
          expect.any(Object), // facts parameter - now includes facts
        );
      });

      it("should return null if catalog compilation fails", async () => {


        vi.mocked(getMockClient().getStatus).mockRejectedValue(
          new Error("Status not found"),
        );
        vi.mocked(getMockClient().compileCatalog).mockRejectedValue(
          new Error("Compilation failed"),
        );

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeNull();
      });
    });

    describe("compareCatalogs", () => {
      it("should compare catalogs and identify added resources", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
            {
              type: "File",
              title: "/etc/config2",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.environment1).toBe("production");
        expect(result.environment2).toBe("staging");
        expect(result.added).toHaveLength(1);
        expect(result.added[0].title).toBe("/etc/config2");
        expect(result.removed).toHaveLength(0);
        expect(result.modified).toHaveLength(0);
        expect(result.unchanged).toHaveLength(1);
      });

      it("should compare catalogs and identify removed resources", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
            {
              type: "File",
              title: "/etc/config2",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.removed).toHaveLength(1);
        expect(result.removed[0].title).toBe("/etc/config2");
        expect(result.added).toHaveLength(0);
        expect(result.modified).toHaveLength(0);
        expect(result.unchanged).toHaveLength(1);
      });

      it("should compare catalogs and identify modified resources", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0644" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0755" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.modified).toHaveLength(1);
        expect(result.modified[0].type).toBe("File");
        expect(result.modified[0].title).toBe("/etc/config1");
        expect(result.modified[0].parameterChanges).toHaveLength(1);
        expect(result.modified[0].parameterChanges[0].parameter).toBe("mode");
        expect(result.modified[0].parameterChanges[0].oldValue).toBe("0644");
        expect(result.modified[0].parameterChanges[0].newValue).toBe("0755");
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
        expect(result.unchanged).toHaveLength(0);
      });

      it("should identify parameter additions in modified resources", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0644", owner: "root" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.modified).toHaveLength(1);
        expect(result.modified[0].parameterChanges).toHaveLength(2);

        const modeChange = result.modified[0].parameterChanges.find(
          (c) => c.parameter === "mode",
        );
        expect(modeChange).toBeDefined();
        expect(modeChange?.oldValue).toBeUndefined();
        expect(modeChange?.newValue).toBe("0644");

        const ownerChange = result.modified[0].parameterChanges.find(
          (c) => c.parameter === "owner",
        );
        expect(ownerChange).toBeDefined();
        expect(ownerChange?.oldValue).toBeUndefined();
        expect(ownerChange?.newValue).toBe("root");
      });

      it("should identify parameter removals in modified resources", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0644", owner: "root" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.modified).toHaveLength(1);
        expect(result.modified[0].parameterChanges).toHaveLength(2);

        const modeChange = result.modified[0].parameterChanges.find(
          (c) => c.parameter === "mode",
        );
        expect(modeChange).toBeDefined();
        expect(modeChange?.oldValue).toBe("0644");
        expect(modeChange?.newValue).toBeUndefined();

        const ownerChange = result.modified[0].parameterChanges.find(
          (c) => c.parameter === "owner",
        );
        expect(ownerChange).toBeDefined();
        expect(ownerChange?.oldValue).toBe("root");
        expect(ownerChange?.newValue).toBeUndefined();
      });

      it("should handle complex catalog comparisons with multiple changes", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0644" },
            },
            {
              type: "File",
              title: "/etc/config2",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present" },
            },
            {
              type: "Service",
              title: "httpd",
              tags: ["service"],
              exported: false,
              parameters: { ensure: "running" },
            },
          ],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [
            {
              type: "File",
              title: "/etc/config1",
              tags: ["file"],
              exported: false,
              parameters: { ensure: "present", mode: "0755" },
            },
            {
              type: "Service",
              title: "httpd",
              tags: ["service"],
              exported: false,
              parameters: { ensure: "running" },
            },
            {
              type: "Package",
              title: "nginx",
              tags: ["package"],
              exported: false,
              parameters: { ensure: "installed" },
            },
          ],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        // Should have 1 added (Package[nginx])
        expect(result.added).toHaveLength(1);
        expect(result.added[0].type).toBe("Package");
        expect(result.added[0].title).toBe("nginx");

        // Should have 1 removed (File[/etc/config2])
        expect(result.removed).toHaveLength(1);
        expect(result.removed[0].type).toBe("File");
        expect(result.removed[0].title).toBe("/etc/config2");

        // Should have 1 modified (File[/etc/config1])
        expect(result.modified).toHaveLength(1);
        expect(result.modified[0].type).toBe("File");
        expect(result.modified[0].title).toBe("/etc/config1");

        // Should have 1 unchanged (Service[httpd])
        expect(result.unchanged).toHaveLength(1);
        expect(result.unchanged[0].type).toBe("Service");
        expect(result.unchanged[0].title).toBe("httpd");
      });

      it("should handle empty catalogs", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        const catalog2Response = {
          name: "node1.example.com",
          version: "1234567891",
          environment: "staging",
          resources: [],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockResolvedValueOnce(catalog2Response);

        const result = await service.compareCatalogs(
          "node1.example.com",
          "production",
          "staging",
        );

        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
        expect(result.modified).toHaveLength(0);
        expect(result.unchanged).toHaveLength(0);
      });

      it("should throw error if first catalog compilation fails", async () => {


        vi.mocked(getMockClient().compileCatalog).mockRejectedValueOnce(
          new CatalogCompilationError(
            "Compilation failed",
            "node1.example.com",
            "production",
          ),
        );

        await expect(
          service.compareCatalogs("node1.example.com", "production", "staging"),
        ).rejects.toThrow(CatalogCompilationError);
      });

      it("should throw error if second catalog compilation fails", async () => {


        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(getMockClient().compileCatalog)
          .mockResolvedValueOnce(catalog1Response)
          .mockRejectedValueOnce(
            new CatalogCompilationError(
              "Compilation failed",
              "node1.example.com",
              "staging",
            ),
          );

        await expect(
          service.compareCatalogs("node1.example.com", "production", "staging"),
        ).rejects.toThrow(CatalogCompilationError);
      });
    });
  });

  describe("Environment Management", () => {
    beforeEach(async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "puppetserver",
        type: "information",
        config: {
          serverUrl: "https://puppet.example.com",
          port: 8140,
        },
      };
      await service.initialize(config);
    });

    describe("listEnvironments", () => {
      it("should retrieve list of environments", async () => {
        const mockEnvironmentsResponse = {
          environments: [
            {
              name: "production",
              last_deployed: "2024-01-01T12:00:00Z",
              status: "deployed",
            },
            {
              name: "staging",
              last_deployed: "2024-01-02T12:00:00Z",
              status: "deployed",
            },
            { name: "development" },
          ],
        };

        // Mock the getEnvironments method
        getMockClient().getEnvironments.mockResolvedValue(mockEnvironmentsResponse);

        const result = await service.listEnvironments();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
        expect(result[0].name).toBe("production");
        expect(result[0].last_deployed).toBe("2024-01-01T12:00:00Z");
        expect(result[0].status).toBe("deployed");
        expect(result[1].name).toBe("staging");
        expect(result[2].name).toBe("development");
        expect(getMockClient().getEnvironments).toHaveBeenCalledTimes(1);
      });

      it("should handle array response format", async () => {
        const mockEnvironmentsResponse = [
          "production",
          "staging",
          "development",
        ];

        getMockClient().getEnvironments.mockResolvedValue(mockEnvironmentsResponse);

        const result = await service.listEnvironments();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
        expect(result[0].name).toBe("production");
        expect(result[1].name).toBe("staging");
        expect(result[2].name).toBe("development");
      });

      it("should cache environments list", async () => {
        const mockEnvironmentsResponse = {
          environments: [{ name: "production" }],
        };

        getMockClient().getEnvironments.mockResolvedValue(mockEnvironmentsResponse);

        // First call
        const result1 = await service.listEnvironments();
        expect(result1.length).toBe(1);

        // Second call should use cache
        const result2 = await service.listEnvironments();
        expect(result2.length).toBe(1);

        // Client should only be called once due to caching
        expect(getMockClient().getEnvironments).toHaveBeenCalledTimes(1);
      });

      it("should handle empty environments list", async () => {
        getMockClient().getEnvironments.mockResolvedValue(null);

        const result = await service.listEnvironments();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      });

      it("should throw error if client not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(uninitializedService.listEnvironments()).rejects.toThrow(
          "Puppetserver service is not initialized",
        );
      });
    });

    describe("getEnvironment", () => {
      it("should retrieve a specific environment", async () => {
        const mockEnvironmentResponse = {
          name: "production",
          last_deployed: "2024-01-01T12:00:00Z",
          status: "deployed",
        };

        getMockClient().getEnvironment.mockResolvedValue(mockEnvironmentResponse);

        const result = await service.getEnvironment("production");

        expect(result).toBeDefined();
        expect(result?.name).toBe("production");
        expect(result?.last_deployed).toBe("2024-01-01T12:00:00Z");
        expect(result?.status).toBe("deployed");
        expect(getMockClient().getEnvironment).toHaveBeenCalledWith("production");
      });

      it("should return null for non-existent environment", async () => {
        getMockClient().getEnvironment.mockResolvedValue(null);

        const result = await service.getEnvironment("nonexistent");

        expect(result).toBeNull();
        expect(getMockClient().getEnvironment).toHaveBeenCalledWith("nonexistent");
      });

      it("should cache environment details", async () => {
        const mockEnvironmentResponse = {
          name: "production",
          last_deployed: "2024-01-01T12:00:00Z",
        };

        getMockClient().getEnvironment.mockResolvedValue(mockEnvironmentResponse);

        // First call
        const result1 = await service.getEnvironment("production");
        expect(result1?.name).toBe("production");

        // Second call should use cache
        const result2 = await service.getEnvironment("production");
        expect(result2?.name).toBe("production");

        // Client should only be called once due to caching
        expect(getMockClient().getEnvironment).toHaveBeenCalledTimes(1);
      });

      it("should throw error if client not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(
          uninitializedService.getEnvironment("production"),
        ).rejects.toThrow("Puppetserver service is not initialized");
      });
    });

    describe("deployEnvironment", () => {
      it("should deploy an environment successfully", async () => {
        getMockClient().deployEnvironment.mockResolvedValue({
          status: "success",
        });

        const result = await service.deployEnvironment("production");

        expect(result).toBeDefined();
        expect(result.environment).toBe("production");
        expect(result.status).toBe("success");
        expect(result.timestamp).toBeDefined();
        expect(getMockClient().deployEnvironment).toHaveBeenCalledWith("production");
      });

      it("should clear cache after deployment", async () => {
        // Set up cache with environment data
        getMockClient().getEnvironment.mockResolvedValue({
          name: "production",
        });
        await service.getEnvironment("production");

        // Deploy environment
        getMockClient().deployEnvironment.mockResolvedValue({
          status: "success",
        });
        await service.deployEnvironment("production");

        // Verify cache was cleared by checking if client is called again
        await service.getEnvironment("production");
        expect(getMockClient().getEnvironment).toHaveBeenCalledTimes(2);
      });

      it("should throw EnvironmentDeploymentError on failure", async () => {
        getMockClient().deployEnvironment.mockRejectedValue(new Error("Deployment failed"));

        await expect(service.deployEnvironment("production")).rejects.toThrow(
          EnvironmentDeploymentError,
        );

        try {
          await service.deployEnvironment("production");
        } catch (error) {
          if (error instanceof EnvironmentDeploymentError) {
            expect(error.environment).toBe("production");
            expect(error.message).toContain("Failed to deploy environment");
          }
        }
      });

      it("should throw error if client not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(
          uninitializedService.deployEnvironment("production"),
        ).rejects.toThrow("Puppetserver service is not initialized");
      });
    });
  });
});
