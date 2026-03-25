/**
 * AWSPlugin Health Check Tests
 *
 * Tests for performHealthCheck() using STS GetCallerIdentity.
 *
 * Validates: Requirements 12.1, 12.2, 12.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AWSPlugin } from "../AWSPlugin";
import { AWSAuthenticationError } from "../types";
import type { IntegrationConfig } from "../../types";
import type { LoggerService } from "../../../services/LoggerService";

// Mock AWSService
const mockValidateCredentials = vi.fn();
const mockServiceInstance = {
  validateCredentials: mockValidateCredentials,
  getInventory: vi.fn(),
  getGroups: vi.fn(),
  getNodeFacts: vi.fn(),
  getRegions: vi.fn(),
  getInstanceTypes: vi.fn(),
  getAMIs: vi.fn(),
  getVPCs: vi.fn(),
  getSubnets: vi.fn(),
  getSecurityGroups: vi.fn(),
  getKeyPairs: vi.fn(),
  provisionInstance: vi.fn(),
  startInstance: vi.fn(),
  stopInstance: vi.fn(),
  rebootInstance: vi.fn(),
  terminateInstance: vi.fn(),
};

vi.mock("../AWSService", () => ({
  AWSService: class {
    validateCredentials = mockServiceInstance.validateCredentials;
    getInventory = mockServiceInstance.getInventory;
    getGroups = mockServiceInstance.getGroups;
    getNodeFacts = mockServiceInstance.getNodeFacts;
    getRegions = mockServiceInstance.getRegions;
    getInstanceTypes = mockServiceInstance.getInstanceTypes;
    getAMIs = mockServiceInstance.getAMIs;
    getVPCs = mockServiceInstance.getVPCs;
    getSubnets = mockServiceInstance.getSubnets;
    getSecurityGroups = mockServiceInstance.getSecurityGroups;
    getKeyPairs = mockServiceInstance.getKeyPairs;
    provisionInstance = mockServiceInstance.provisionInstance;
    startInstance = mockServiceInstance.startInstance;
    stopInstance = mockServiceInstance.stopInstance;
    rebootInstance = mockServiceInstance.rebootInstance;
    terminateInstance = mockServiceInstance.terminateInstance;
  },
}));

describe("AWSPlugin Health Check", () => {
  let plugin: AWSPlugin;
  let mockLogger: LoggerService;

  const validConfig: IntegrationConfig = {
    enabled: true,
    name: "aws",
    type: "both",
    config: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE", // pragma: allowlist secret
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", // pragma: allowlist secret
      region: "us-east-1",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService;

    plugin = new AWSPlugin(mockLogger);
  });

  describe("healthy credentials (Req 12.1)", () => {
    it("should return healthy with account details on valid credentials", async () => {
      await plugin.initialize(validConfig);

      mockValidateCredentials.mockResolvedValue({
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/testuser",
        userId: "AIDAEXAMPLEUSERID",
      });

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain("arn:aws:iam::123456789012:user/testuser");
      expect(health.details).toEqual({
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/testuser",
        userId: "AIDAEXAMPLEUSERID",
        region: "us-east-1",
        regions: undefined,
        hasAccessKey: true,
        hasProfile: false,
        hasEndpoint: false,
      });
      expect(health.lastCheck).toBeDefined();
      expect(mockValidateCredentials).toHaveBeenCalledOnce();
    });
  });

  describe("invalid credentials (Req 12.2)", () => {
    it("should return unhealthy with 'AWS authentication failed' on invalid credentials", async () => {
      await plugin.initialize(validConfig);

      mockValidateCredentials.mockRejectedValue(
        new AWSAuthenticationError("The security token included in the request is invalid")
      );

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("AWS authentication failed");
      expect(mockValidateCredentials).toHaveBeenCalledOnce();
    });

    it("should return unhealthy with error message on non-auth errors", async () => {
      await plugin.initialize(validConfig);

      mockValidateCredentials.mockRejectedValue(new Error("Network timeout"));

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("Network timeout");
    });
  });

  describe("plugin continues accepting config updates when unhealthy (Req 12.3)", () => {
    it("should allow re-initialization after unhealthy health check", async () => {
      await plugin.initialize(validConfig);

      // First: unhealthy
      mockValidateCredentials.mockRejectedValue(
        new AWSAuthenticationError("Invalid credentials")
      );
      const unhealthy = await plugin.healthCheck();
      expect(unhealthy.healthy).toBe(false);

      // Plugin should still be initialized and accept new config
      expect(plugin.isInitialized()).toBe(true);

      // Re-initialize with new config
      const newConfig: IntegrationConfig = {
        ...validConfig,
        config: {
          accessKeyId: "AKIANEWKEYEXAMPLE", // pragma: allowlist secret
          secretAccessKey: "newSecretKeyExample123", // pragma: allowlist secret
          region: "eu-west-1",
        },
      };
      await plugin.initialize(newConfig);
      expect(plugin.isInitialized()).toBe(true);

      // Now healthy
      mockValidateCredentials.mockResolvedValue({
        account: "987654321098",
        arn: "arn:aws:iam::987654321098:user/newuser",
        userId: "AIDANEWUSERID",
      });
      const healthy = await plugin.healthCheck();
      expect(healthy.healthy).toBe(true);
    });

    it("should not crash when health check fails", async () => {
      await plugin.initialize(validConfig);

      mockValidateCredentials.mockRejectedValue(
        new AWSAuthenticationError("Expired token")
      );

      // Should not throw
      const health = await plugin.healthCheck();
      expect(health.healthy).toBe(false);

      // Plugin still functional for other operations
      expect(plugin.isInitialized()).toBe(true);
      expect(plugin.getConfig().enabled).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return unhealthy when plugin is not initialized", async () => {
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("Plugin is not initialized");
    });

    it("should return unhealthy when plugin is disabled", async () => {
      const disabledConfig: IntegrationConfig = {
        ...validConfig,
        enabled: false,
      };
      await plugin.initialize(disabledConfig);

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      // BasePlugin checks initialized before enabled; disabled plugins don't set initialized=true
      expect(health.message).toBe("Plugin is not initialized");
    });
  });
});
