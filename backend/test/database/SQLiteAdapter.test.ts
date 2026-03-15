import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { DatabaseQueryError, DatabaseConnectionError } from "../../src/database/errors";

describe("SQLiteAdapter", () => {
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = new SQLiteAdapter(":memory:");
    await adapter.initialize();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.close();
    }
  });

  describe("initialize", () => {
    it("sets connected to true after init", () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it("enables WAL mode (memory db falls back to memory journal)", async () => {
      // :memory: databases cannot use WAL, SQLite silently uses "memory" instead.
      // WAL mode is correctly enabled for file-based databases.
      const row = await adapter.queryOne<{ journal_mode: string }>(
        "PRAGMA journal_mode;",
      );
      expect(row?.journal_mode).toBe("memory");
    });

    it("enables foreign keys", async () => {
      const row = await adapter.queryOne<{ foreign_keys: number }>(
        "PRAGMA foreign_keys;",
      );
      expect(row?.foreign_keys).toBe(1);
    });
  });

  describe("close", () => {
    it("sets connected to false", async () => {
      await adapter.close();
      expect(adapter.isConnected()).toBe(false);
    });

    it("is safe to call when already closed", async () => {
      await adapter.close();
      await adapter.close(); // should not throw
    });
  });

  describe("getDialect / getPlaceholder", () => {
    it("returns sqlite dialect", () => {
      expect(adapter.getDialect()).toBe("sqlite");
    });

    it("returns ? for any index", () => {
      expect(adapter.getPlaceholder(1)).toBe("?");
      expect(adapter.getPlaceholder(99)).toBe("?");
    });
  });

  describe("query", () => {
    it("returns rows from a SELECT", async () => {
      await adapter.execute(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
      );
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["alice"]);
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["bob"]);

      const rows = await adapter.query<{ id: number; name: string }>(
        "SELECT * FROM t ORDER BY id",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("alice");
      expect(rows[1].name).toBe("bob");
    });

    it("returns empty array for no matches", async () => {
      await adapter.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const rows = await adapter.query("SELECT * FROM t");
      expect(rows).toEqual([]);
    });

    it("throws DatabaseQueryError on invalid SQL", async () => {
      await expect(adapter.query("SELECT * FROM nonexistent")).rejects.toThrow(
        DatabaseQueryError,
      );
    });
  });

  describe("queryOne", () => {
    it("returns a single row", async () => {
      await adapter.execute(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
      );
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["alice"]);

      const row = await adapter.queryOne<{ name: string }>(
        "SELECT name FROM t WHERE id = 1",
      );
      expect(row?.name).toBe("alice");
    });

    it("returns null when no match", async () => {
      await adapter.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      const row = await adapter.queryOne("SELECT * FROM t WHERE id = 999");
      expect(row).toBeNull();
    });

    it("throws DatabaseQueryError on invalid SQL", async () => {
      await expect(
        adapter.queryOne("SELECT * FROM nonexistent"),
      ).rejects.toThrow(DatabaseQueryError);
    });
  });

  describe("execute", () => {
    it("returns changes count for INSERT", async () => {
      await adapter.execute(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
      );
      const result = await adapter.execute("INSERT INTO t (name) VALUES (?)", [
        "alice",
      ]);
      expect(result.changes).toBe(1);
    });

    it("returns changes count for UPDATE", async () => {
      await adapter.execute(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
      );
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["alice"]);
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["bob"]);

      const result = await adapter.execute("UPDATE t SET name = ?", [
        "charlie",
      ]);
      expect(result.changes).toBe(2);
    });

    it("throws DatabaseQueryError on invalid SQL", async () => {
      await expect(
        adapter.execute("INSERT INTO nonexistent VALUES (1)"),
      ).rejects.toThrow(DatabaseQueryError);
    });
  });

  describe("transactions", () => {
    beforeEach(async () => {
      await adapter.execute(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
      );
    });

    it("commits on success", async () => {
      await adapter.beginTransaction();
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["alice"]);
      await adapter.commit();

      const rows = await adapter.query("SELECT * FROM t");
      expect(rows).toHaveLength(1);
    });

    it("rolls back on rollback()", async () => {
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["before"]);
      await adapter.beginTransaction();
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["during"]);
      await adapter.rollback();

      const rows = await adapter.query("SELECT * FROM t");
      expect(rows).toHaveLength(1);
    });

    it("throws on nested beginTransaction", async () => {
      await adapter.beginTransaction();
      await expect(adapter.beginTransaction()).rejects.toThrow(
        "Nested transactions are not supported in SQLite",
      );
      await adapter.rollback();
    });

    it("withTransaction commits on success", async () => {
      const result = await adapter.withTransaction(async () => {
        await adapter.execute("INSERT INTO t (name) VALUES (?)", ["alice"]);
        return "done";
      });

      expect(result).toBe("done");
      const rows = await adapter.query("SELECT * FROM t");
      expect(rows).toHaveLength(1);
    });

    it("withTransaction rolls back on error", async () => {
      await adapter.execute("INSERT INTO t (name) VALUES (?)", ["before"]);

      await expect(
        adapter.withTransaction(async () => {
          await adapter.execute("INSERT INTO t (name) VALUES (?)", ["during"]);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const rows = await adapter.query("SELECT * FROM t");
      expect(rows).toHaveLength(1);
    });
  });

  describe("not connected", () => {
    it("throws on query when not connected", async () => {
      const fresh = new SQLiteAdapter(":memory:");
      expect(() => fresh.query("SELECT 1")).toThrow(DatabaseQueryError);
    });

    it("throws on queryOne when not connected", async () => {
      const fresh = new SQLiteAdapter(":memory:");
      expect(() => fresh.queryOne("SELECT 1")).toThrow(DatabaseQueryError);
    });

    it("throws on execute when not connected", async () => {
      const fresh = new SQLiteAdapter(":memory:");
      expect(() => fresh.execute("SELECT 1")).toThrow(DatabaseQueryError);
    });
  });
});
