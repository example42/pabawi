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
  CertificateOperationError,
  PuppetserverConnectionError,
  PuppetserverError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "../../src/integrations/puppetserver/errors";
import type {
  Certificate,
  CertificateStatus,
} from "../../src/integrations/puppetserver/types";

// Mock PuppetserverClient
vi.mock("../../src/integrations/puppetserver/PuppetserverClient");

describe("PuppetserverService", () => {
  let service: PuppetserverService;

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

  describe("Certificate Management Operations", () => {
    const mockConfig: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppet.example.com",
        port: 8140,
      },
    };

    const mockCertificates: Certificate[] = [
      {
        certname: "node1.example.com",
        status: "signed",
        fingerprint:
          "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD",
      },
      {
        certname: "node2.example.com",
        status: "requested",
        fingerprint:
          "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44",
      },
      {
        certname: "node3.example.com",
        status: "revoked",
        fingerprint:
          "99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66",
      },
    ];

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("listCertificates", () => {
      it("should list all certificates when no status filter is provided", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        const result = await service.listCertificates();

        expect(result).toEqual(mockCertificates);
        expect(mockClient.getCertificates).toHaveBeenCalledWith(undefined);
      });

      it("should filter certificates by status when status is provided", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const signedCerts = mockCertificates.filter(
          (c) => c.status === "signed",
        );
        vi.mocked(mockClient.getCertificates).mockResolvedValue(signedCerts);

        const result = await service.listCertificates("signed");

        expect(result).toEqual(signedCerts);
        expect(mockClient.getCertificates).toHaveBeenCalledWith("signed");
      });

      it("should cache certificate list results", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        // First call
        await service.listCertificates();
        // Second call should use cache
        await service.listCertificates();

        // Client should only be called once due to caching
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(1);
      });

      it("should throw PuppetserverConnectionError when client is not initialized", async () => {
        const uninitializedService = new PuppetserverService();

        await expect(uninitializedService.listCertificates()).rejects.toThrow(
          PuppetserverConnectionError,
        );
      });
    });

    describe("getCertificate", () => {
      it("should retrieve a specific certificate by certname", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const targetCert = mockCertificates[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(targetCert);

        const result = await service.getCertificate(targetCert.certname);

        expect(result).toEqual(targetCert);
        expect(mockClient.getCertificate).toHaveBeenCalledWith(
          targetCert.certname,
        );
      });

      it("should return null when certificate is not found", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(null);

        const result = await service.getCertificate("nonexistent.example.com");

        expect(result).toBeNull();
      });

      it("should cache certificate results", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const targetCert = mockCertificates[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(targetCert);

        // First call
        await service.getCertificate(targetCert.certname);
        // Second call should use cache
        await service.getCertificate(targetCert.certname);

        // Client should only be called once due to caching
        expect(mockClient.getCertificate).toHaveBeenCalledTimes(1);
      });
    });

    describe("signCertificate", () => {
      it("should sign a certificate request successfully", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.signCertificate).mockResolvedValue(undefined);

        const certname = "node2.example.com";
        await service.signCertificate(certname);

        expect(mockClient.signCertificate).toHaveBeenCalledWith(certname);
      });

      it("should clear cache after signing a certificate", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.signCertificate).mockResolvedValue(undefined);
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        // Populate cache
        await service.listCertificates();
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(1);

        // Sign certificate (should clear cache)
        await service.signCertificate("node2.example.com");

        // Next call should hit the client again
        await service.listCertificates();
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(2);
      });

      it("should throw CertificateOperationError with specific message on failure", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const certname = "node2.example.com";
        const errorMessage = "Certificate already signed";
        vi.mocked(mockClient.signCertificate).mockRejectedValue(
          new Error(errorMessage),
        );

        await expect(service.signCertificate(certname)).rejects.toThrow(
          CertificateOperationError,
        );

        try {
          await service.signCertificate(certname);
        } catch (error) {
          expect(error).toBeInstanceOf(CertificateOperationError);
          if (error instanceof CertificateOperationError) {
            expect(error.operation).toBe("sign");
            expect(error.certname).toBe(certname);
            expect(error.message).toContain(certname);
          }
        }
      });
    });

    describe("revokeCertificate", () => {
      it("should revoke a certificate successfully", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.revokeCertificate).mockResolvedValue(undefined);

        const certname = "node1.example.com";
        await service.revokeCertificate(certname);

        expect(mockClient.revokeCertificate).toHaveBeenCalledWith(certname);
      });

      it("should clear cache after revoking a certificate", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.revokeCertificate).mockResolvedValue(undefined);
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        // Populate cache
        await service.listCertificates();
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(1);

        // Revoke certificate (should clear cache)
        await service.revokeCertificate("node1.example.com");

        // Next call should hit the client again
        await service.listCertificates();
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(2);
      });

      it("should throw CertificateOperationError with specific message on failure", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const certname = "node1.example.com";
        const errorMessage = "Certificate not found";
        vi.mocked(mockClient.revokeCertificate).mockRejectedValue(
          new Error(errorMessage),
        );

        await expect(service.revokeCertificate(certname)).rejects.toThrow(
          CertificateOperationError,
        );

        try {
          await service.revokeCertificate(certname);
        } catch (error) {
          expect(error).toBeInstanceOf(CertificateOperationError);
          if (error instanceof CertificateOperationError) {
            expect(error.operation).toBe("revoke");
            expect(error.certname).toBe(certname);
            expect(error.message).toContain(certname);
          }
        }
      });
    });

    describe("Error Handling", () => {
      it("should provide specific error messages for certificate already signed", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const certname = "node1.example.com";
        vi.mocked(mockClient.signCertificate).mockRejectedValue(
          new Error("Certificate already signed"),
        );

        try {
          await service.signCertificate(certname);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).toBeInstanceOf(CertificateOperationError);
          if (error instanceof CertificateOperationError) {
            expect(error.message).toContain("Failed to sign certificate");
            expect(error.message).toContain(certname);
          }
        }
      });

      it("should provide specific error messages for invalid certname", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const certname = "invalid..certname";
        vi.mocked(mockClient.signCertificate).mockRejectedValue(
          new Error("Invalid certname format"),
        );

        try {
          await service.signCertificate(certname);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).toBeInstanceOf(CertificateOperationError);
          if (error instanceof CertificateOperationError) {
            expect(error.certname).toBe(certname);
          }
        }
      });

      it("should provide specific error messages for certificate not found during revoke", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const certname = "nonexistent.example.com";
        vi.mocked(mockClient.revokeCertificate).mockRejectedValue(
          new Error("Certificate not found"),
        );

        try {
          await service.revokeCertificate(certname);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).toBeInstanceOf(CertificateOperationError);
          if (error instanceof CertificateOperationError) {
            expect(error.message).toContain("Failed to revoke certificate");
            expect(error.message).toContain(certname);
          }
        }
      });
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

    const mockCertificates: Certificate[] = [
      {
        certname: "node1.example.com",
        status: "signed",
        fingerprint:
          "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD",
      },
      {
        certname: "node2.example.com",
        status: "requested",
        fingerprint:
          "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44",
      },
      {
        certname: "node3.example.com",
        status: "revoked",
        fingerprint:
          "99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66",
      },
    ];

    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    describe("getInventory", () => {
      it("should retrieve all nodes from Puppetserver CA", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        const result = await service.getInventory();

        expect(result).toHaveLength(mockCertificates.length);
        expect(mockClient.getCertificates).toHaveBeenCalled();
      });

      it("should transform certificates to normalized Node format", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        const result = await service.getInventory();

        // Verify each node has required fields
        result.forEach((node, index) => {
          expect(node).toHaveProperty("id");
          expect(node).toHaveProperty("name");
          expect(node).toHaveProperty("uri");
          expect(node).toHaveProperty("transport");
          expect(node).toHaveProperty("config");
          expect(node).toHaveProperty("source", "puppetserver");

          // Verify node matches certificate
          expect(node.id).toBe(mockCertificates[index].certname);
          expect(node.name).toBe(mockCertificates[index].certname);
        });
      });

      it("should include certificate status in node metadata", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        const result = await service.getInventory();

        // Verify certificate status is included
        result.forEach((node, index) => {
          expect(node).toHaveProperty(
            "certificateStatus",
            mockCertificates[index].status,
          );
        });
      });

      it("should cache inventory results", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );

        // First call
        await service.getInventory();
        // Second call should use cache
        await service.getInventory();

        // Client should only be called once due to caching
        expect(mockClient.getCertificates).toHaveBeenCalledTimes(1);
      });

      it("should return empty array when no certificates are found", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificates).mockResolvedValue([]);

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
      it("should retrieve a single node by certname", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const targetCert = mockCertificates[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(targetCert);

        const result = await service.getNode(targetCert.certname);

        expect(result).not.toBeNull();
        expect(result?.id).toBe(targetCert.certname);
        expect(result?.name).toBe(targetCert.certname);
        expect(result?.source).toBe("puppetserver");
        expect(result?.certificateStatus).toBe(targetCert.status);
        expect(mockClient.getCertificate).toHaveBeenCalledWith(
          targetCert.certname,
        );
      });

      it("should return null when node is not found", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(null);

        const result = await service.getNode("nonexistent.example.com");

        expect(result).toBeNull();
      });

      it("should cache node results", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const targetCert = mockCertificates[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(targetCert);

        // First call
        await service.getNode(targetCert.certname);
        // Second call should use cache
        await service.getNode(targetCert.certname);

        // Client should only be called once due to caching
        expect(mockClient.getCertificate).toHaveBeenCalledTimes(1);
      });

      it("should include all required Node fields", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const targetCert = mockCertificates[0];
        vi.mocked(mockClient.getCertificate).mockResolvedValue(targetCert);

        const result = await service.getNode(targetCert.certname);

        expect(result).not.toBeNull();
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("uri");
        expect(result).toHaveProperty("transport");
        expect(result).toHaveProperty("config");
        expect(result).toHaveProperty("source");
        expect(result).toHaveProperty("certificateStatus");
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockStatus = {
          certname: "node1.example.com",
          latest_report_status: "changed" as const,
          report_timestamp: new Date().toISOString(),
          catalog_environment: "production",
        };
        vi.mocked(mockClient.getStatus).mockResolvedValue(mockStatus);

        const result = await service.getNodeStatus("node1.example.com");

        expect(result).toEqual(mockStatus);
        expect(mockClient.getStatus).toHaveBeenCalledWith("node1.example.com");
      });

      it("should cache node status results", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockStatus = {
          certname: "node1.example.com",
          report_timestamp: new Date().toISOString(),
        };
        vi.mocked(mockClient.getStatus).mockResolvedValue(mockStatus);

        // First call
        await service.getNodeStatus("node1.example.com");
        // Second call should use cache
        await service.getNodeStatus("node1.example.com");

        // Client should only be called once due to caching
        expect(mockClient.getStatus).toHaveBeenCalledTimes(1);
      });

      it("should throw error when node status is not found", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        vi.mocked(mockClient.getStatus).mockResolvedValue(null);

        await expect(
          service.getNodeStatus("nonexistent.example.com"),
        ).rejects.toThrow(PuppetserverConnectionError);
      });
    });

    describe("listNodeStatuses", () => {
      it("should retrieve statuses for all nodes", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockCertificates = [
          {
            certname: "node1.example.com",
            status: "signed" as const,
            fingerprint: "abc123",
          },
          {
            certname: "node2.example.com",
            status: "signed" as const,
            fingerprint: "def456",
          },
        ];
        const mockStatuses = [
          {
            certname: "node1.example.com",
            report_timestamp: new Date().toISOString(),
          },
          {
            certname: "node2.example.com",
            report_timestamp: new Date().toISOString(),
          },
        ];

        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );
        vi.mocked(mockClient.getStatus)
          .mockResolvedValueOnce(mockStatuses[0])
          .mockResolvedValueOnce(mockStatuses[1]);

        const result = await service.listNodeStatuses();

        expect(result).toHaveLength(2);
        expect(result).toEqual(mockStatuses);
      });

      it("should skip nodes that fail to retrieve status", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockCertificates = [
          {
            certname: "node1.example.com",
            status: "signed" as const,
            fingerprint: "abc123",
          },
          {
            certname: "node2.example.com",
            status: "signed" as const,
            fingerprint: "def456",
          },
        ];
        const mockStatus = {
          certname: "node1.example.com",
          report_timestamp: new Date().toISOString(),
        };

        vi.mocked(mockClient.getCertificates).mockResolvedValue(
          mockCertificates,
        );
        vi.mocked(mockClient.getStatus)
          .mockResolvedValueOnce(mockStatus)
          .mockRejectedValueOnce(new Error("Status not found"));

        const result = await service.listNodeStatuses();

        // Should only return the successful status
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(mockStatus);
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

        expect(result).toBe("active");
      });

      it("should categorize node as inactive when not checked in within threshold", () => {
        const oldTimestamp = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: oldTimestamp,
        };

        const result = service.categorizeNodeActivity(status);

        expect(result).toBe("inactive");
      });

      it("should categorize node as never_checked_in when no report timestamp", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.categorizeNodeActivity(status);

        expect(result).toBe("never_checked_in");
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

        expect(result).toBe("inactive");
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

        expect(result).toBe("active");
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

        expect(result).toBe(true);
      });

      it("should highlight nodes that never checked in", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.shouldHighlightNode(status);

        expect(result).toBe(true);
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

        expect(result).not.toBeNull();
        expect(result).toBeGreaterThanOrEqual(3599); // Allow for small timing differences
        expect(result).toBeLessThanOrEqual(3601);
      });

      it("should return null when node never checked in", () => {
        const status = {
          certname: "node1.example.com",
        };

        const result = service.getSecondsSinceLastCheckIn(status);

        expect(result).toBeNull();
      });

      it("should handle very recent check-ins", () => {
        const timestamp = new Date(Date.now() - 1000).toISOString(); // 1 second ago
        const status = {
          certname: "node1.example.com",
          report_timestamp: timestamp,
        };

        const result = service.getSecondsSinceLastCheckIn(status);

        expect(result).not.toBeNull();
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(2);
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

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
      });

      it("should categorize facts into system, network, hardware, and custom", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
            "networking.hostname": "node1",
          },
        };

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

        // First call should hit the API
        const result1 = await service.getNodeFacts("node1.example.com");
        expect(mockClient.getFacts).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const result2 = await service.getNodeFacts("node1.example.com");
        expect(mockClient.getFacts).toHaveBeenCalledTimes(1); // Still 1, not called again

        expect(result1).toEqual(result2);
      });

      it("should handle missing facts gracefully", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockFactsResponse = {
          values: {},
        };

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

        const result = await service.getNodeFacts("node1.example.com");

        expect(result).toBeDefined();
        expect(result.nodeId).toBe("node1.example.com");
        expect(result.facts.os.family).toBe("unknown");
        expect(result.facts.processors.count).toBe(0);
      });

      it("should throw error when node is not found", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        vi.mocked(mockClient.getFacts).mockResolvedValue(null);

        await expect(
          service.getNodeFacts("nonexistent.example.com"),
        ).rejects.toThrow(PuppetserverConnectionError);
      });

      it("should include timestamp for fact freshness tracking", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
          },
        };

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockFactsResponse = {
          values: {
            "os.family": "RedHat",
            "networking.hostname": "node1",
          },
        };

        vi.mocked(mockClient.getFacts).mockResolvedValue(mockFactsResponse);

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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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

        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
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

        expect(mockClient.compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "production",
        );
      });

      it("should transform catalog resources with all metadata", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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

        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        // First call
        await service.compileCatalog("node1.example.com", "production");
        expect(mockClient.compileCatalog).toHaveBeenCalledTimes(1);

        // Second call should use cache
        await service.compileCatalog("node1.example.com", "production");
        expect(mockClient.compileCatalog).toHaveBeenCalledTimes(1);
      });

      it("should throw CatalogCompilationError with detailed errors on failure", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog).mockRejectedValue(
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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

        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockStatus = {
          certname: "node1.example.com",
          catalog_environment: "staging",
        };
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "staging",
          resources: [],
        };

        vi.mocked(mockClient.getStatus).mockResolvedValue(mockStatus);
        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeDefined();
        expect(result?.environment).toBe("staging");
        expect(mockClient.compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "staging",
        );
      });

      it("should fallback to production environment if status fails", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockCatalogResponse = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(mockClient.getStatus).mockRejectedValue(
          new Error("Status not found"),
        );
        vi.mocked(mockClient.compileCatalog).mockResolvedValue(
          mockCatalogResponse,
        );

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeDefined();
        expect(result?.environment).toBe("production");
        expect(mockClient.compileCatalog).toHaveBeenCalledWith(
          "node1.example.com",
          "production",
        );
      });

      it("should return null if catalog compilation fails", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        vi.mocked(mockClient.getStatus).mockRejectedValue(
          new Error("Status not found"),
        );
        vi.mocked(mockClient.compileCatalog).mockRejectedValue(
          new Error("Compilation failed"),
        );

        const result = await service.getNodeCatalog("node1.example.com");

        expect(result).toBeNull();
      });
    });

    describe("compareCatalogs", () => {
      it("should compare catalogs and identify added resources", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

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

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        vi.mocked(mockClient.compileCatalog).mockRejectedValueOnce(
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        const catalog1Response = {
          name: "node1.example.com",
          version: "1234567890",
          environment: "production",
          resources: [],
        };

        vi.mocked(mockClient.compileCatalog)
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
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
        mockClient.getEnvironments = vi
          .fn()
          .mockResolvedValue(mockEnvironmentsResponse);

        const result = await service.listEnvironments();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
        expect(result[0].name).toBe("production");
        expect(result[0].last_deployed).toBe("2024-01-01T12:00:00Z");
        expect(result[0].status).toBe("deployed");
        expect(result[1].name).toBe("staging");
        expect(result[2].name).toBe("development");
        expect(mockClient.getEnvironments).toHaveBeenCalledTimes(1);
      });

      it("should handle array response format", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockEnvironmentsResponse = [
          "production",
          "staging",
          "development",
        ];

        mockClient.getEnvironments = vi
          .fn()
          .mockResolvedValue(mockEnvironmentsResponse);

        const result = await service.listEnvironments();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
        expect(result[0].name).toBe("production");
        expect(result[1].name).toBe("staging");
        expect(result[2].name).toBe("development");
      });

      it("should cache environments list", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockEnvironmentsResponse = {
          environments: [{ name: "production" }],
        };

        mockClient.getEnvironments = vi
          .fn()
          .mockResolvedValue(mockEnvironmentsResponse);

        // First call
        const result1 = await service.listEnvironments();
        expect(result1.length).toBe(1);

        // Second call should use cache
        const result2 = await service.listEnvironments();
        expect(result2.length).toBe(1);

        // Client should only be called once due to caching
        expect(mockClient.getEnvironments).toHaveBeenCalledTimes(1);
      });

      it("should handle empty environments list", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        mockClient.getEnvironments = vi.fn().mockResolvedValue(null);

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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockEnvironmentResponse = {
          name: "production",
          last_deployed: "2024-01-01T12:00:00Z",
          status: "deployed",
        };

        mockClient.getEnvironment = vi
          .fn()
          .mockResolvedValue(mockEnvironmentResponse);

        const result = await service.getEnvironment("production");

        expect(result).toBeDefined();
        expect(result?.name).toBe("production");
        expect(result?.last_deployed).toBe("2024-01-01T12:00:00Z");
        expect(result?.status).toBe("deployed");
        expect(mockClient.getEnvironment).toHaveBeenCalledWith("production");
      });

      it("should return null for non-existent environment", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        mockClient.getEnvironment = vi.fn().mockResolvedValue(null);

        const result = await service.getEnvironment("nonexistent");

        expect(result).toBeNull();
        expect(mockClient.getEnvironment).toHaveBeenCalledWith("nonexistent");
      });

      it("should cache environment details", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];
        const mockEnvironmentResponse = {
          name: "production",
          last_deployed: "2024-01-01T12:00:00Z",
        };

        mockClient.getEnvironment = vi
          .fn()
          .mockResolvedValue(mockEnvironmentResponse);

        // First call
        const result1 = await service.getEnvironment("production");
        expect(result1?.name).toBe("production");

        // Second call should use cache
        const result2 = await service.getEnvironment("production");
        expect(result2?.name).toBe("production");

        // Client should only be called once due to caching
        expect(mockClient.getEnvironment).toHaveBeenCalledTimes(1);
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
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        mockClient.deployEnvironment = vi.fn().mockResolvedValue({
          status: "success",
        });

        const result = await service.deployEnvironment("production");

        expect(result).toBeDefined();
        expect(result.environment).toBe("production");
        expect(result.status).toBe("success");
        expect(result.timestamp).toBeDefined();
        expect(mockClient.deployEnvironment).toHaveBeenCalledWith("production");
      });

      it("should clear cache after deployment", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        // Set up cache with environment data
        mockClient.getEnvironment = vi.fn().mockResolvedValue({
          name: "production",
        });
        await service.getEnvironment("production");

        // Deploy environment
        mockClient.deployEnvironment = vi.fn().mockResolvedValue({
          status: "success",
        });
        await service.deployEnvironment("production");

        // Verify cache was cleared by checking if client is called again
        await service.getEnvironment("production");
        expect(mockClient.getEnvironment).toHaveBeenCalledTimes(2);
      });

      it("should throw EnvironmentDeploymentError on failure", async () => {
        const mockClient = vi.mocked(PuppetserverClient).mock.instances[0];

        mockClient.deployEnvironment = vi
          .fn()
          .mockRejectedValue(new Error("Deployment failed"));

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
