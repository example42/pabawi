import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseQueryError, DatabaseConnectionError } from "../../src/database/errors";

describe("AdapterFactory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns SQLiteAdapter when DB_TYPE is unset", async () => {
    delete process.env.DB_TYPE;
    const { createDatabaseAdapter } = await import("../../src/database/AdapterFactory");
    const adapter = await createDatabaseAdapter({ databasePath: ":memory:" });
    expect(adapter.getDialect()).toBe("sqlite");
    expect(adapter.getPlaceholder(1)).toBe("?");
  });

  it("returns SQLiteAdapter when DB_TYPE is 'sqlite'", async () => {
    process.env.DB_TYPE = "sqlite";
    const { createDatabaseAdapter } = await import("../../src/database/AdapterFactory");
    const adapter = await createDatabaseAdapter({ databasePath: ":memory:" });
    expect(adapter.getDialect()).toBe("sqlite");
  });

  it("throws when DB_TYPE is 'postgres' without DATABASE_URL", async () => {
    process.env.DB_TYPE = "postgres";
    delete process.env.DATABASE_URL;
    const { createDatabaseAdapter } = await import("../../src/database/AdapterFactory");
    await expect(createDatabaseAdapter({ databasePath: "" })).rejects.toThrow(
      "DATABASE_URL environment variable is required"
    );
  });

  it("returns PostgresAdapter when DB_TYPE is 'postgres' with DATABASE_URL", async () => {
    process.env.DB_TYPE = "postgres";
    process.env.DATABASE_URL = "postgres://localhost/test";
    const { createDatabaseAdapter } = await import("../../src/database/AdapterFactory");
    const adapter = await createDatabaseAdapter({ databasePath: "" });
    expect(adapter.getDialect()).toBe("postgres");
    expect(adapter.getPlaceholder(3)).toBe("$3");
  });
});

describe("DatabaseQueryError", () => {
  it("captures query and params context", () => {
    const err = new DatabaseQueryError("fail", "SELECT 1", [42]);
    expect(err.message).toBe("fail");
    expect(err.name).toBe("DatabaseQueryError");
    expect(err.query).toBe("SELECT 1");
    expect(err.params).toEqual([42]);
    expect(err).toBeInstanceOf(Error);
  });

  it("works without params", () => {
    const err = new DatabaseQueryError("fail", "SELECT 1");
    expect(err.params).toBeUndefined();
  });
});

describe("DatabaseConnectionError", () => {
  it("captures connection details", () => {
    const err = new DatabaseConnectionError("timeout", "localhost:5432");
    expect(err.message).toBe("timeout");
    expect(err.name).toBe("DatabaseConnectionError");
    expect(err.connectionDetails).toBe("localhost:5432");
    expect(err).toBeInstanceOf(Error);
  });
});
