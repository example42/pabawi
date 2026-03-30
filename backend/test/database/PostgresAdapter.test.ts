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

  describe("getPlaceholder", () => {
    it("returns $1 for index 1", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.getPlaceholder(1)).toBe("$1");
    });

    it("returns $2 for index 2", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.getPlaceholder(2)).toBe("$2");
    });

    it("returns $99 for index 99", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.getPlaceholder(99)).toBe("$99");
    });

    it("returns $0 for index 0", () => {
      const adapter = new PostgresAdapter("postgresql://localhost:5432/test");
      expect(adapter.getPlaceholder(0)).toBe("$0");
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
