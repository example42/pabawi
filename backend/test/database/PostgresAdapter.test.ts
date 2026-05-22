import { describe, it, expect } from "vitest";
import { PostgresAdapter } from "../../src/database/PostgresAdapter";
import { DatabaseConnectionError } from "../../src/database/errors";

describe("PostgresAdapter", () => {
  describe("instantiation", () => {
    it("can be instantiated with a connection URL", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter).toBeInstanceOf(PostgresAdapter);
    });

    it("reports not connected before initialize", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("getDialect", () => {
    it("returns postgres", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.getDialect()).toBe("postgres");
    });
  });

  describe("initialize", () => {
    it("throws DatabaseConnectionError when server is unreachable", async () => {
      const adapter = new PostgresAdapter(
        "postgresql://localhost:59999/nonexistent_db",
      );
      await expect(adapter.initialize()).rejects.toThrow(
        DatabaseConnectionError,
      );
      expect(adapter.isConnected()).toBe(false);
    });
  });
});
