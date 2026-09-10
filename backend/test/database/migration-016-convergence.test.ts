import { describe, it, expect } from "vitest";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { MigrationRunner } from "../../src/database/MigrationRunner";

const migrationsDir = join(__dirname, "../../src/database/migrations");

describe("I02: migration 016 feature convergence", () => {
  it.each(["fresh", "entra", "checkmk", "checkmk-revoked"])("converges from %s on a WAL database", async (variant) => {
    const dir = mkdtempSync(join(tmpdir(), "pabawi-i02-"));
    const db = new SQLiteAdapter(join(dir, "live.db"));
    const fresh = new SQLiteAdapter(":memory:");
    try {
      await db.initialize();
      await fresh.initialize();
      await new MigrationRunner(fresh, migrationsDir).runPendingMigrations();
      if (variant !== "fresh") {
        for (const file of readdirSync(migrationsDir)) {
          const id = /^(\d+)_/.exec(file)?.[1];
          if (!id || id >= "016") continue;
          copyFileSync(join(migrationsDir, file), join(dir, file));
        }
        const historicalName = variant.startsWith("checkmk") ? "016_checkmk_write_permissions.sql" : "016_entra_id_auth.sql";
        copyFileSync(join(__dirname, "fixtures/migration-016", historicalName), join(dir, historicalName));
        await new MigrationRunner(db, dir).runPendingMigrations();
        // Reproduce the pre-checksum tracking table used by deployed variants.
        await db.execute("ALTER TABLE migrations DROP COLUMN checksum");
        await db.execute("INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at) VALUES ('u1', 'alice', 'alice@example.test', 'hash', 'Alice', 'Example', 1, 0, '2026-09-09', '2026-09-09')");
        await db.execute("INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ('u1', 'role-admin-001', '2026-09-09')");
        if (variant === "entra") {
          await db.execute("INSERT INTO federated_identities (id, user_id, provider, subject, issuer, created_at, updated_at) VALUES ('f1', 'u1', 'entra-id', 'sub', 'https://issuer.test', '2026-09-09', '2026-09-09')");
          await db.execute("INSERT INTO oauth_state_store VALUES ('state', 'nonce', 'verifier', '2026-09-09', '2026-09-10')");
          await db.execute("INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, created_at, expires_at) VALUES ('code', 'access', 'refresh', 'u1', '2026-09-09', '2026-09-10')");
        }
      }
      if (variant === "checkmk-revoked") {
        await db.execute("DELETE FROM role_permissions WHERE permission_id = 'checkmk-write-001'");
      }
      const retainedTables = variant === "fresh" ? [] : ["users", "user_roles", ...(variant === "entra" ? ["federated_identities", "oauth_state_store", "oauth_auth_codes"] : [])];
      const before = await Promise.all(retainedTables.map(table => db.query(table === "users" ? 'SELECT id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at, last_login_at FROM users' : `SELECT * FROM ${table}`)));
      const runner = new MigrationRunner(db, migrationsDir);
      await runner.runPendingMigrations();
      expect(await Promise.all(retainedTables.map(table => db.query(table === "users" ? 'SELECT id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at, last_login_at FROM users' : `SELECT * FROM ${table}`)))).toEqual(before);
      const schemaQuery = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != 'migrations' ORDER BY type, name";
      expect(await db.query(schemaQuery)).toEqual(await fresh.query(schemaQuery));
      expect(await db.query("SELECT role_id FROM role_permissions WHERE permission_id = 'checkmk-write-001' ORDER BY role_id")).toEqual(variant === "checkmk-revoked" ? [] : [{ role_id: "role-admin-001" }, { role_id: "role-operator-001" }]);
      expect(await db.query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(await db.query("PRAGMA foreign_key_check")).toEqual([]);
      expect(await runner.runPendingMigrations()).toBe(0);
      if (variant !== "fresh") {
        expect(await db.query("SELECT checksum FROM migrations WHERE id = '016'")).toEqual([{ checksum: null }]);
      }
    } finally {
      await db.close();
      await fresh.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
