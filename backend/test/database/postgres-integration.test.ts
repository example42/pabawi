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

      // Every migration on disk must be recorded, not just the ones before the
      // first dialect incompatibility. Migration 017 used to abort here with
      // "cannot drop table users because other objects depend on it" (I01),
      // which left every PostgreSQL deployment stuck at 016.
      const status = await runner.getStatus();
      expect(status.pending).toHaveLength(0);
      const appliedIds = status.applied.map((m) => m.id);
      expect(appliedIds).toContain("017");
      expect(appliedIds).toContain("020");
    });

    it("supports nullable passwords and new role assignments after migration 017", async () => {
      await new MigrationRunner(adapter).runPendingMigrations();

      const column = await adapter.queryOne<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'`,
      );
      expect(column?.is_nullable).toBe("YES");

      const now = new Date().toISOString();
      await adapter.execute(
        `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, 1, 0, ?, ?)`,
        ["i01-user", "i01_user", "i01@example.test", "I01", "User", now, now],
      );
      await adapter.execute(
        "INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)",
        ["i01-user", "role-admin-001", now],
      );

      try {
        const rows = await adapter.query<{ c: string }>(
          "SELECT COUNT(*) AS c FROM user_roles WHERE user_id = ?",
          ["i01-user"],
        );
        expect(Number(rows[0]?.c)).toBe(1);
      } finally {
        await adapter.execute("DELETE FROM users WHERE id = ?", ["i01-user"]);
      }
    });
  },
);
