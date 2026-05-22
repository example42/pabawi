/**
 * Integration tests that exercise PostgresAdapter against a real PostgreSQL
 * server. They are skipped unless TEST_DATABASE_URL is set, so the default
 * `npm test` run is unaffected.
 *
 * To run them locally:
 *   docker compose --profile postgres up -d postgres
 *   TEST_DATABASE_URL=postgres://pabawi:pabawi@localhost:5432/pabawi \
 *     npm run test --workspace=backend -- postgres-integration
 *
 * Point TEST_DATABASE_URL at a throwaway database — these tests create and
 * drop tables and run the full migration set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresAdapter } from "../../src/database/PostgresAdapter";
import { MigrationRunner } from "../../src/database/MigrationRunner";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)(
  "PostgresAdapter (integration — real PostgreSQL)",
  () => {
    let adapter: PostgresAdapter;

    beforeAll(async () => {
      adapter = new PostgresAdapter(databaseUrl);
      await adapter.initialize();
      await adapter.execute("DROP TABLE IF EXISTS rewrite_test");
      await adapter.execute(
        "CREATE TABLE rewrite_test (id INTEGER PRIMARY KEY, label TEXT)",
      );
    });

    afterAll(async () => {
      if (adapter.isConnected()) {
        await adapter.execute("DROP TABLE IF EXISTS rewrite_test");
        await adapter.close();
      }
    });

    it("connects and reports the postgres dialect", () => {
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getDialect()).toBe("postgres");
    });

    it("rewrites ? placeholders and round-trips data", async () => {
      await adapter.execute(
        "INSERT INTO rewrite_test (id, label) VALUES (?, ?)",
        [1, "alpha"],
      );
      await adapter.execute(
        "INSERT INTO rewrite_test (id, label) VALUES (?, ?)",
        [2, "beta"],
      );

      const rows = await adapter.query<{ id: number; label: string }>(
        "SELECT id, label FROM rewrite_test WHERE id = ? ORDER BY id",
        [1],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.label).toBe("alpha");

      const one = await adapter.queryOne<{ label: string }>(
        "SELECT label FROM rewrite_test WHERE id = ?",
        [2],
      );
      expect(one?.label).toBe("beta");
    });

    it("does not rewrite a ? inside a SQL string literal", async () => {
      await adapter.execute(
        "INSERT INTO rewrite_test (id, label) VALUES (?, ?)",
        [3, "a?b"],
      );
      // The '?' in 'a?b' is part of an SQL string literal, not a placeholder.
      const row = await adapter.queryOne<{ id: number }>(
        "SELECT id FROM rewrite_test WHERE label = 'a?b' AND id = ?",
        [3],
      );
      expect(row?.id).toBe(3);
    });

    it("commits a transaction", async () => {
      await adapter.withTransaction(async () => {
        await adapter.execute(
          "INSERT INTO rewrite_test (id, label) VALUES (?, ?)",
          [10, "committed"],
        );
      });
      const row = await adapter.queryOne<{ id: number }>(
        "SELECT id FROM rewrite_test WHERE id = ?",
        [10],
      );
      expect(row?.id).toBe(10);
    });

    it("rolls back a failed transaction", async () => {
      await expect(
        adapter.withTransaction(async () => {
          await adapter.execute(
            "INSERT INTO rewrite_test (id, label) VALUES (?, ?)",
            [11, "rolled-back"],
          );
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const row = await adapter.queryOne<{ id: number }>(
        "SELECT id FROM rewrite_test WHERE id = ?",
        [11],
      );
      expect(row).toBeNull();
    });

    it("reports the rewritten SQL on a query error", async () => {
      await expect(
        adapter.query("SELECT * FROM table_that_does_not_exist WHERE id = ?", [1]),
      ).rejects.toThrow();
    });

    it("runs the full migration set against PostgreSQL", async () => {
      const runner = new MigrationRunner(adapter);
      await runner.runPendingMigrations();

      const tables = await adapter.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      );
      const names = tables.map((t) => t.table_name);
      expect(names).toContain("users");
      expect(names).toContain("executions");
      expect(names).toContain("migrations");
    });
  },
);
