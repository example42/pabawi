---
inclusion: always
---

# Database & SQL Conventions

These conventions are non-negotiable. They exist because PostgreSQL folds
unquoted identifiers to lowercase while SQLite preserves case as written, so
camelCase column names silently behave differently between dialects. Past
violations of this rule caused login to fail on PostgreSQL with the bcrypt
error `data and hash arguments required` (every camelCase column in `users`
came back lowercased and `user.passwordHash` was `undefined`).

## Schema (DDL)

- All table and column names are `snake_case` in every migration file.
- Never declare a camelCase column in a CREATE TABLE or ALTER TABLE.
- Never quote identifiers to preserve case (e.g. `"passwordHash"`). The only
  acceptable quoted identifiers are reserved words such as `"action"`.
- Index, constraint, and trigger names are also `snake_case`.

## Queries (DML)

- INSERT, UPDATE, DELETE statements use `snake_case` columns. Parameters bind
  positionally, so the TS side does not see column names here.
- SELECT statements that hydrate a TypeScript interface MUST alias every
  `snake_case` column to its `camelCase` interface field:

  ```ts
  this.db.queryOne<User>(
    `SELECT id, username, email,
            password_hash AS "passwordHash",
            first_name    AS "firstName",
            last_name     AS "lastName",
            is_active     AS "isActive",
            is_admin      AS "isAdmin",
            created_at    AS "createdAt",
            updated_at    AS "updatedAt",
            last_login_at AS "lastLoginAt"
       FROM users WHERE username = ?`,
    [username],
  );
  ```

- Never use `SELECT *` in code paths that hydrate a typed interface. It works
  on SQLite, breaks on PostgreSQL, and hides the column contract.
- The alias target MUST be wrapped in double quotes (`AS "camelName"`) so
  PostgreSQL preserves the case of the output column.
- A SELECT that does not feed a typed interface (e.g. existence checks
  returning `count(*)`) does not need aliasing.

## TypeScript row shapes

- Internal row interfaces (`User`, `AuditLogEntry`, etc.) stay in `camelCase`.
  The aliasing in SELECTs hides the snake_case DB layer from the rest of the
  application.
- DTOs returned to the frontend are also `camelCase`.

## Migrations

- One migration per logical change. Filename: `NNN_description.sql` (shared)
  or `NNN_description.sqlite.sql` / `NNN_description.postgres.sql` for
  dialect-specific variants.
- Migrations are applied automatically at server startup by `MigrationRunner`.
- Each migration file is run inside a transaction. The runner provides this
  for both dialects — do not add explicit `BEGIN/COMMIT` inside migration
  files (it would nest transactions and break PostgreSQL).
- Schema changes that drop or rename data must be idempotent so an
  interrupted upgrade can be retried safely.

## Adding new tables or columns

When introducing new schema:

1. Use `snake_case` for everything in the migration file.
2. In the TypeScript repository or service that reads the table, write
   SELECTs with explicit `column AS "camelCase"` aliases for every column
   the typed interface expects.
3. INSERT and UPDATE statements list snake_case columns explicitly.
4. Run the test suite for both SQLite (default) and PostgreSQL
   (`scripts/docker-postgres-test.sh`) before merging.

## Why not snake_case everywhere (DB, TS, frontend)?

We considered it. The rename of column names alone was already a 70+ file
change. Renaming the TS interfaces and frontend DTOs would have multiplied
the surface area without changing what runs on the wire. We kept the DB
honest (snake_case, dialect-portable) and kept the TS surface stable
(camelCase) by paying the alias tax in SELECTs only.
