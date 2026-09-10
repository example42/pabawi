import { describe, it, expect } from "vitest";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { PostgresAdapter } from "../../src/database/PostgresAdapter";
import { MigrationRunner } from "../../src/database/MigrationRunner";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const migrationsDir = join(__dirname, "../../src/database/migrations");

describe.skipIf(!databaseUrl)("I01: populated PostgreSQL upgrade", () => {
  for (const variant of ["checkmk", "entra"] as const) {
    it(`preserves relationships from the historic ${variant} 016 variant`, async () => {
      const schema = `i01_${randomUUID().replaceAll("-", "")}`;
      const control = new PostgresAdapter(databaseUrl);
      await control.initialize();
      await control.execute(`CREATE SCHEMA ${schema}`);
      const scopedUrl = new URL(databaseUrl);
      scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
      const db = new PostgresAdapter(scopedUrl.toString());
      const partialDir = mkdtempSync(join(tmpdir(), "pabawi-i01-pg-"));
      try {
        await db.initialize();
        for (const file of readdirSync(migrationsDir)) {
          const id = /^(\d+)_/.exec(file)?.[1];
          if (!id || id > "016") continue;
          if (id === "016" && (variant === "entra" ? file.includes("checkmk") : file.includes("entra"))) continue;
          copyFileSync(join(migrationsDir, file), join(partialDir, file));
        }
        await new MigrationRunner(db, partialDir).runPendingMigrations();
        await db.execute("INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at) VALUES ('u1', 'alice', 'alice@example.test', 'hash', 'Alice', 'Example', 1, 0, '2026-09-09', '2026-09-09')");
        await db.execute("INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ('u1', 'role-admin-001', '2026-09-09')");
        await db.execute("INSERT INTO groups (id, name, description, created_at, updated_at) VALUES ('g1', 'Ops', '', '2026-09-09', '2026-09-09')");
        await db.execute("INSERT INTO user_groups (user_id, group_id, assigned_at) VALUES ('u1', 'g1', '2026-09-09')");
        await db.execute("INSERT INTO revoked_tokens (token, user_id, revoked_at, expires_at) VALUES ('fixture', 'u1', '2026-09-09', '2026-09-10')");
        if (variant === "entra") {
          await db.execute("INSERT INTO federated_identities (id, user_id, provider, subject, issuer, created_at, updated_at) VALUES ('f1', 'u1', 'entra-id', 'sub', 'https://issuer.test', '2026-09-09', '2026-09-09')");
        }
        const tables = ["users", "user_roles", "groups", "user_groups", "revoked_tokens", ...(variant === "entra" ? ["federated_identities"] : [])];
        const before = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)));
        await new MigrationRunner(db, migrationsDir).runPendingMigrations();
        const after = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)));
        expect(after).toEqual(before);
        await db.execute("UPDATE users SET password_hash = NULL WHERE id = 'u1'");
        expect(await db.query("SELECT password_hash FROM users WHERE id = 'u1'")).toEqual([{ password_hash: null }]);
        expect((await new MigrationRunner(db, migrationsDir).getStatus()).pending).toEqual([]);
      } finally {
        await db.close();
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        rmSync(partialDir, { recursive: true, force: true });
      }
    });
  }
});
