/**
 * Integration tests for Puppetserver certificate API endpoints
 */

import { describe, it, expect, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { PuppetserverService } from "../../src/integrations/puppetserver/PuppetserverService";
import { createIntegrationsRouter } from "../../src/routes/integrations";
import { requestIdMiddleware } from "../../src/middleware";
import type { IntegrationConfig } from "../../src/integrations/types";
import type { Certificate, BulkOperationResult } from "../../src/integrations/puppetserver/types";

/**
 * Mock PuppetserverService for testing
 */
class MockPuppetserverService extends PuppetserverService {
  private mockCertificates: Certificate[] = [
    {
      certname: "node1.example.com",
      status: "signed",
      fingerprint: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
      not_before: "2024-01-01T00:00:00Z",
      not_after: "2025-01-01T00:00:00Z",
    },
    {
      certname: "node2.example.com",
      status: "requested",
      fingerprint: "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
    },
    {
      certname: "node3.example.com",
      status: "revoked",
      fingerprint: "99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA",
      not_before: "2024-01-01T00:00:00Z",
      not_after: "2025-01-01T00:00:00Z",
    },
  ];

  protected async performInitialization(): Promise<void> {
    // Mock initialization
  }

  protected async performHealthCheck(): Promise<{ healthy: boolean; message: string }> {
    return {
      healthy: true,
      message: "Puppetserver is healthy",
    };
  }

  async listCertificates(status?: "signed" | "requested" | "revoked"): Promise<Certificate[]> {
    if (status) {
      return this.mockCertificates.filter((cert) => cert.status === status);
    }
    return this.mockCertificates;
  }

  async getCertificate(certname: string): Promise<Certificate | null> {
    return this.mockCertificates.find((cert) => cert.certname === certname) ?? null;
  }

  async signCertificate(certname: string): Promise<void> {
    const cert = this.mockCertificates.find((c) => c.certname === certname);
    if (cert && cert.status === "requested") {
      cert.status = "signed";
    }
  }

  async revokeCertificate(certname: string): Promise<void> {
    const cert = this.mockCertificates.find((c) => c.certname === certname);
    if (cert && cert.status === "signed") {
      cert.status = "revoked";
    }
  }

  async bulkSignCertificates(certnames: string[]): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      total: certnames.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const certname of certnames) {
      const cert = this.mockCertificates.find((c) => c.certname === certname);
      if (cert && cert.status === "requested") {
        cert.status = "signed";
        result.successful.push(certname);
        result.successCount++;
      } else {
        result.failed.push({
          certname,
          error: cert ? "Certificate is not in requested state" : "Certificate not found",
        });
        result.failureCount++;
      }
    }

    return result;
  }

  async bulkRevokeCertificates(certnames: string[]): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      total: certnames.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const certname of certnames) {
      const cert = this.mockCertificates.find((c) => c.certname === certname);
      if (cert && cert.status === "signed") {
        cert.status = "revoked";
        result.successful.push(certname);
        result.successCount++;
      } else {
        result.failed.push({
          certname,
          error: cert ? "Certificate is not signed" : "Certificate not found",
        });
        result.failureCount++;
      }
    }

    return result;
  }
}

describe("Puppetserver Certificate API", () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let puppetserverService: MockPuppetserverService;

  beforeEach(async () => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Initialize integration manager
    integrationManager = new IntegrationManager();

    // Create mock Puppetserver service
    puppetserverService = new MockPuppetserverService();

    const config: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppetserver.example.com",
        port: 8140,
      },
      priority: 10,
    };

    integrationManager.registerPlugin(puppetserverService, config);
    await integrationManager.initializePlugins();

    // Add routes
    app.use(
      "/api/integrations",
      createIntegrationsRouter(integrationManager, undefined, puppetserverService),
    );
  });

  describe("GET /api/integrations/puppetserver/certificates", () => {
    it("should return all certificates", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/certificates")
        .expect(200);

      expect(response.body).toHaveProperty("certificates");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body).toHaveProperty("count", 3);
      expect(Array.isArray(response.body.certificates)).toBe(true);
      expect(response.body.certificates).toHaveLength(3);
    });

    it("should filter certificates by status", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/certificates?status=requested")
        .expect(200);

      expect(response.body.certificates).toHaveLength(1);
      expect(response.body.certificates[0].status).toBe("requested");
      expect(response.body.filtered).toBe(true);
      expect(response.body.filter).toEqual({ status: "requested" });
    });

    it("should return error for invalid status", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/certificates?status=invalid")
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("GET /api/integrations/puppetserver/certificates/:certname", () => {
    it("should return specific certificate", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/certificates/node1.example.com")
        .expect(200);

      expect(response.body).toHaveProperty("certificate");
      expect(response.body.certificate.certname).toBe("node1.example.com");
      expect(response.body.certificate.status).toBe("signed");
      expect(response.body.source).toBe("puppetserver");
    });

    it("should return 404 for non-existent certificate", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/certificates/nonexistent.example.com")
        .expect(404);

      expect(response.body.error.code).toBe("CERTIFICATE_NOT_FOUND");
    });
  });

  describe("POST /api/integrations/puppetserver/certificates/:certname/sign", () => {
    it("should sign a certificate request", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/node2.example.com/sign")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.certname).toBe("node2.example.com");
      expect(response.body.message).toContain("signed successfully");

      // Verify certificate was signed
      const certResponse = await request(app)
        .get("/api/integrations/puppetserver/certificates/node2.example.com")
        .expect(200);

      expect(certResponse.body.certificate.status).toBe("signed");
    });
  });

  describe("DELETE /api/integrations/puppetserver/certificates/:certname", () => {
    it("should revoke a certificate", async () => {
      const response = await request(app)
        .delete("/api/integrations/puppetserver/certificates/node1.example.com")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.certname).toBe("node1.example.com");
      expect(response.body.message).toContain("revoked successfully");

      // Verify certificate was revoked
      const certResponse = await request(app)
        .get("/api/integrations/puppetserver/certificates/node1.example.com")
        .expect(200);

      expect(certResponse.body.certificate.status).toBe("revoked");
    });
  });

  describe("POST /api/integrations/puppetserver/certificates/bulk-sign", () => {
    it("should sign multiple certificates", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/bulk-sign")
        .send({ certnames: ["node2.example.com"] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.successCount).toBe(1);
      expect(response.body.result.failureCount).toBe(0);
      expect(response.body.result.successful).toContain("node2.example.com");
    });

    it("should return 207 for partial success", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/bulk-sign")
        .send({ certnames: ["node2.example.com", "node1.example.com"] })
        .expect(207);

      expect(response.body.success).toBe(false);
      expect(response.body.result.successCount).toBe(1);
      expect(response.body.result.failureCount).toBe(1);
    });

    it("should return error for invalid request body", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/bulk-sign")
        .send({ certnames: [] })
        .expect(400);

      expect(response.body.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("POST /api/integrations/puppetserver/certificates/bulk-revoke", () => {
    it("should revoke multiple certificates", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/bulk-revoke")
        .send({ certnames: ["node1.example.com"] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.successCount).toBe(1);
      expect(response.body.result.failureCount).toBe(0);
      expect(response.body.result.successful).toContain("node1.example.com");
    });

    it("should return 207 for partial success", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/certificates/bulk-revoke")
        .send({ certnames: ["node1.example.com", "node2.example.com"] })
        .expect(207);

      expect(response.body.success).toBe(false);
      expect(response.body.result.successCount).toBe(1);
      expect(response.body.result.failureCount).toBe(1);
    });
  });

  describe("Service not configured", () => {
    it("should return 503 when Puppetserver is not configured", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      const testManager = new IntegrationManager();
      await testManager.initializePlugins();

      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(testManager, undefined, undefined),
      );

      const response = await request(testApp)
        .get("/api/integrations/puppetserver/certificates")
        .expect(503);

      expect(response.body.error.code).toBe("PUPPETSERVER_NOT_CONFIGURED");
    });
  });
});
