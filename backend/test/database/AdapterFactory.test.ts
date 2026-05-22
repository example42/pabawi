import { describe, it, expect } from "vitest";
import { DatabaseQueryError, DatabaseConnectionError } from "../../src/database/errors";
import { createDatabaseAdapter } from "../../src/database/AdapterFactory";

describe("AdapterFactory", () => {
  it("returns SQLiteAdapter when dbType is omitted", async () => {
    const adapter = await createDatabaseAdapter({ databasePath: ":memory:" });
    expect(adapter.getDialect()).toBe("sqlite");
  });

  it("returns SQLiteAdapter when dbType is 'sqlite'", async () => {
    const adapter = await createDatabaseAdapter({
      databasePath: ":memory:",
      dbType: "sqlite",
    });
    expect(adapter.getDialect()).toBe("sqlite");
  });

  it("throws when dbType is 'postgres' without a databaseUrl", async () => {
    await expect(
      createDatabaseAdapter({ databasePath: "", dbType: "postgres" }),
    ).rejects.toThrow("DATABASE_URL is required");
  });

  it("returns PostgresAdapter when dbType is 'postgres' with a databaseUrl", async () => {
    const adapter = await createDatabaseAdapter({
      databasePath: "",
      dbType: "postgres",
      databaseUrl: "postgres://localhost/test",
    });
    expect(adapter.getDialect()).toBe("postgres");
  });
});

describe("DatabaseQueryError", () => {
  it("captures query and paramCount context", () => {
    const err = new DatabaseQueryError("fail", "SELECT 1", [42]);
    expect(err.message).toBe("fail");
    expect(err.name).toBe("DatabaseQueryError");
    expect(err.query).toBe("SELECT 1");
    expect(err.paramCount).toBe(1);
    expect(err).toBeInstanceOf(Error);
  });

  it("works without params", () => {
    const err = new DatabaseQueryError("fail", "SELECT 1");
    expect(err.paramCount).toBe(0);
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
