import { describe, it, expect, beforeEach, vi } from "vitest";
import { IntegrationConfigService } from "../../src/services/IntegrationConfigService";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";

const TEST_SECRET = "test-jwt-secret-for-encryption-testing";

function createMockDb(): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({ changes: 1 }),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getDialect: vi.fn().mockReturnValue("sqlite" as const),
    getPlaceholder: vi.fn((_i: number) => "?"),
  };
}

describe("IntegrationConfigService", () => {
  let db: DatabaseAdapter;
  let service: IntegrationConfigService;

  beforeEach(() => {
    db = createMockDb();
    service = new IntegrationConfigService(db, TEST_SECRET);
  });

  // --------------------------------------------------------------------------
  // saveConfig
  // --------------------------------------------------------------------------
  describe("saveConfig", () => {
    it("inserts a config with upsert SQL", async () => {
      await service.saveConfig("user-1", "proxmox", { host: "10.0.0.1", port: 8006 });

      expect(db.execute).toHaveBeenCalledOnce();
      const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("INSERT INTO integration_configs");
      expect(sql).toContain("ON CONFLICT");
      expect(params[1]).toBe("user-1");
      expect(params[2]).toBe("proxmox");
    });

    it("encrypts sensitive fields before storing", async () => {
      await service.saveConfig("user-1", "aws", {
        region: "us-east-1",
        accessKeyId: "AKIA...",
        secretAccessKey: "wJalr...",
        apiToken: "tok-123",
      });

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const storedConfig = JSON.parse(params[3] as string);

      // Non-sensitive fields remain plaintext
      expect(storedConfig.region).toBe("us-east-1");

      // Sensitive fields are encrypted envelopes (JSON strings with iv/salt/encrypted/tag)
      for (const field of ["accessKeyId", "secretAccessKey", "apiToken"]) {
        const envelope = JSON.parse(storedConfig[field]);
        expect(envelope).toHaveProperty("iv");
        expect(envelope).toHaveProperty("salt");
        expect(envelope).toHaveProperty("encrypted");
        expect(envelope).toHaveProperty("tag");
      }
    });

    it("rejects invalid input (empty userId)", async () => {
      await expect(
        service.saveConfig("", "proxmox", { host: "10.0.0.1" }),
      ).rejects.toThrow();
    });

    it("rejects invalid input (empty integrationName)", async () => {
      await expect(
        service.saveConfig("user-1", "", { host: "10.0.0.1" }),
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // getConfig
  // --------------------------------------------------------------------------
  describe("getConfig", () => {
    it("returns null when no record exists", async () => {
      const result = await service.getConfig("user-1", "proxmox");
      expect(result).toBeNull();
    });

    it("decrypts sensitive fields on retrieval", async () => {
      // First save to capture the encrypted config
      await service.saveConfig("user-1", "aws", {
        region: "us-east-1",
        secretAccessKey: "my-secret-value",
      });

      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      // Mock queryOne to return the saved row
      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "test-id",
        userId: "user-1",
        integrationName: "aws",
        config: encryptedConfigJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await service.getConfig("user-1", "aws");

      expect(result).not.toBeNull();
      expect(result!.config.region).toBe("us-east-1");
      expect(result!.config.secretAccessKey).toBe("my-secret-value");
      expect(result!.isActive).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // deleteConfig
  // --------------------------------------------------------------------------
  describe("deleteConfig", () => {
    it("executes DELETE with correct params", async () => {
      await service.deleteConfig("user-1", "proxmox");

      expect(db.execute).toHaveBeenCalledOnce();
      const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("DELETE FROM integration_configs");
      expect(params).toEqual(["user-1", "proxmox"]);
    });
  });

  // --------------------------------------------------------------------------
  // listConfigs
  // --------------------------------------------------------------------------
  describe("listConfigs", () => {
    it("returns empty array when user has no configs", async () => {
      const result = await service.listConfigs("user-1");
      expect(result).toEqual([]);
    });

    it("returns decrypted configs for a user", async () => {
      // Save a config to capture encrypted JSON
      await service.saveConfig("user-1", "proxmox", {
        host: "10.0.0.1",
        password: "admin123",
      });

      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "cfg-1",
          userId: "user-1",
          integrationName: "proxmox",
          config: encryptedConfigJson,
          isActive: 1,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const result = await service.listConfigs("user-1");

      expect(result).toHaveLength(1);
      expect(result[0].config.host).toBe("10.0.0.1");
      expect(result[0].config.password).toBe("admin123");
    });
  });

  // --------------------------------------------------------------------------
  // getActiveConfigs
  // --------------------------------------------------------------------------
  describe("getActiveConfigs", () => {
    it("queries for active configs only", async () => {
      await service.getActiveConfigs();

      expect(db.query).toHaveBeenCalledOnce();
      const [sql] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("isActive = 1");
    });
  });

  // --------------------------------------------------------------------------
  // Encryption round-trip
  // --------------------------------------------------------------------------
  describe("encryption round-trip", () => {
    it("preserves all sensitive field values through save/retrieve cycle", async () => {
      const originalConfig = {
        host: "10.0.0.1",
        port: 8006,
        apiToken: "PVEAPIToken=user@pam!mytoken=aaaa-bbbb-cccc",
        password: "super-secret-password",
        sshKey: "ssh-rsa AAAAB3...",
        clientSecret: "cs_live_abc123",
        enabled: true,
      };

      await service.saveConfig("user-1", "proxmox", originalConfig);

      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "test-id",
        userId: "user-1",
        integrationName: "proxmox",
        config: encryptedConfigJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await service.getConfig("user-1", "proxmox");

      expect(result!.config.host).toBe("10.0.0.1");
      expect(result!.config.port).toBe(8006);
      expect(result!.config.apiToken).toBe("PVEAPIToken=user@pam!mytoken=aaaa-bbbb-cccc");
      expect(result!.config.password).toBe("super-secret-password");
      expect(result!.config.sshKey).toBe("ssh-rsa AAAAB3...");
      expect(result!.config.clientSecret).toBe("cs_live_abc123");
      expect(result!.config.enabled).toBe(true);
    });

    it("encrypted values at rest differ from plaintext", async () => {
      await service.saveConfig("user-1", "aws", {
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      });

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const storedConfig = JSON.parse(params[3] as string);

      // The stored value should NOT be the plaintext
      expect(storedConfig.secretAccessKey).not.toBe(
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      );
    });

    it("handles null and undefined sensitive field values gracefully", async () => {
      await service.saveConfig("user-1", "proxmox", {
        host: "10.0.0.1",
        password: null,
        apiToken: undefined,
      });

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const storedConfig = JSON.parse(params[3] as string);

      // null/undefined sensitive fields should not be encrypted
      expect(storedConfig.password).toBeNull();
      expect(storedConfig.apiToken).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Sensitive field detection
  // --------------------------------------------------------------------------
  describe("sensitive field detection", () => {
    it("detects fields matching *token*, *password*, *secret*, *key* patterns", async () => {
      const config = {
        host: "plain",
        apiToken: "sensitive",
        API_TOKEN: "sensitive",
        password: "sensitive",
        dbPassword: "sensitive",
        secretKey: "sensitive",
        accessKey: "sensitive",
        clientSecret: "sensitive",
        region: "plain",
      };

      await service.saveConfig("user-1", "test", config);

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const stored = JSON.parse(params[3] as string);

      // Plaintext fields
      expect(stored.host).toBe("plain");
      expect(stored.region).toBe("plain");

      // Encrypted fields (should be JSON envelope strings)
      for (const field of [
        "apiToken", "API_TOKEN", "password", "dbPassword",
        "secretKey", "accessKey", "clientSecret",
      ]) {
        const envelope = JSON.parse(stored[field]);
        expect(envelope).toHaveProperty("iv");
        expect(envelope).toHaveProperty("salt");
        expect(envelope).toHaveProperty("encrypted");
        expect(envelope).toHaveProperty("tag");
      }
    });
  });

  // --------------------------------------------------------------------------
  // getEffectiveConfig
  // --------------------------------------------------------------------------
  describe("getEffectiveConfig", () => {
    it("returns empty object when neither env nor DB config exists", async () => {
      const result = await service.getEffectiveConfig("proxmox");
      expect(result).toEqual({});
    });

    it("returns env config only when no DB config exists", async () => {
      const envProvider = vi.fn().mockReturnValue({ host: "10.0.0.1", port: 8006 });
      const svcWithEnv = new IntegrationConfigService(db, TEST_SECRET, envProvider);

      const result = await svcWithEnv.getEffectiveConfig("proxmox");

      expect(envProvider).toHaveBeenCalledWith("proxmox");
      expect(result).toEqual({ host: "10.0.0.1", port: 8006 });
    });

    it("returns DB config only when no env provider is set", async () => {
      // Save a config to capture encrypted JSON
      await service.saveConfig("user-1", "proxmox", { host: "db-host", port: 9999 });
      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cfg-1",
        userId: "user-1",
        integrationName: "proxmox",
        config: encryptedConfigJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await service.getEffectiveConfig("proxmox");

      expect(result).toEqual({ host: "db-host", port: 9999 });
    });

    it("merges env and DB configs with DB overriding non-null keys", async () => {
      const envProvider = vi.fn().mockReturnValue({
        host: "env-host",
        port: 8006,
        region: "us-east-1",
      });
      const svcWithEnv = new IntegrationConfigService(db, TEST_SECRET, envProvider);

      // Save a config to capture encrypted JSON (DB overrides host, adds extra)
      await svcWithEnv.saveConfig("user-1", "proxmox", { host: "db-host", extra: "value" });
      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cfg-1",
        userId: "user-1",
        integrationName: "proxmox",
        config: encryptedConfigJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await svcWithEnv.getEffectiveConfig("proxmox");

      // DB overrides env for "host", env "port" and "region" preserved, DB "extra" added
      expect(result.host).toBe("db-host");
      expect(result.port).toBe(8006);
      expect(result.region).toBe("us-east-1");
      expect(result.extra).toBe("value");
    });

    it("does not override env values with null DB values", async () => {
      const envProvider = vi.fn().mockReturnValue({ host: "env-host", port: 8006 });
      const svcWithEnv = new IntegrationConfigService(db, TEST_SECRET, envProvider);

      // Simulate a DB config where host is null (stored as plaintext null in JSON)
      const dbConfigJson = JSON.stringify({ host: null, extra: "db-extra" });

      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cfg-1",
        userId: "user-1",
        integrationName: "proxmox",
        config: dbConfigJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await svcWithEnv.getEffectiveConfig("proxmox");

      // null DB value should NOT override env value
      expect(result.host).toBe("env-host");
      expect(result.port).toBe(8006);
      expect(result.extra).toBe("db-extra");
    });

    it("returns env config when env provider returns empty object and no DB config", async () => {
      const envProvider = vi.fn().mockReturnValue({});
      const svcWithEnv = new IntegrationConfigService(db, TEST_SECRET, envProvider);

      // envProvider returns {} which is truthy, so it's treated as envConfig
      const result = await svcWithEnv.getEffectiveConfig("unknown");
      expect(result).toEqual({});
    });
  });

  // --------------------------------------------------------------------------
  // rotateEncryptionKey
  // --------------------------------------------------------------------------
  describe("rotateEncryptionKey", () => {
    const OLD_SECRET = "old-secret-key-for-testing";
    const NEW_SECRET = "new-secret-key-for-testing";

    it("re-encrypts all configs from old key to new key", async () => {
      // Create a service with the old secret
      const oldService = new IntegrationConfigService(db, OLD_SECRET);

      // Save a config (encrypted with OLD_SECRET)
      await oldService.saveConfig("user-1", "proxmox", {
        host: "10.0.0.1",
        password: "super-secret",
      });
      const [, saveParams] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const encryptedConfigJson = saveParams[3] as string;

      // Mock withTransaction to execute the callback
      (db.withTransaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: () => Promise<void>) => fn(),
      );

      // Mock query to return the saved row
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "cfg-1",
          userId: "user-1",
          integrationName: "proxmox",
          config: encryptedConfigJson,
          isActive: 1,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      await oldService.rotateEncryptionKey(OLD_SECRET, NEW_SECRET);

      // Verify execute was called with UPDATE (the second call, first was INSERT)
      const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = executeCalls[executeCalls.length - 1];
      expect(updateCall[0]).toContain("UPDATE integration_configs");
      expect(updateCall[1][2]).toBe("cfg-1"); // id

      // Verify the re-encrypted config can be decrypted with the new key
      const reEncryptedJson = updateCall[1][0] as string;
      const reEncryptedConfig = JSON.parse(reEncryptedJson);

      // host should remain plaintext
      expect(reEncryptedConfig.host).toBe("10.0.0.1");

      // password should be an encrypted envelope (re-encrypted with new key)
      const envelope = JSON.parse(reEncryptedConfig.password);
      expect(envelope).toHaveProperty("iv");
      expect(envelope).toHaveProperty("salt");
      expect(envelope).toHaveProperty("encrypted");
      expect(envelope).toHaveProperty("tag");

      // Now verify the new service (with NEW_SECRET) can decrypt it
      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cfg-1",
        userId: "user-1",
        integrationName: "proxmox",
        config: reEncryptedJson,
        isActive: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      // After rotation, the service's secret should be updated to NEW_SECRET
      const result = await oldService.getConfig("user-1", "proxmox");
      expect(result!.config.host).toBe("10.0.0.1");
      expect(result!.config.password).toBe("super-secret");
    });

    it("uses withTransaction for atomicity", async () => {
      (db.withTransaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: () => Promise<void>) => fn(),
      );
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await service.rotateEncryptionKey(TEST_SECRET, "new-key");

      expect(db.withTransaction).toHaveBeenCalledOnce();
    });

    it("handles empty config table gracefully", async () => {
      (db.withTransaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: () => Promise<void>) => fn(),
      );
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await service.rotateEncryptionKey(TEST_SECRET, "new-key");

      // Only the withTransaction query should have been called, no UPDATEs
      const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(0);
    });
  });
});
