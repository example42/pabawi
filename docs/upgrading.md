# Upgrading Pabawi

This guide covers upgrading existing Pabawi installations. For fresh installs,
see the main [README](../README.md#installation).

## Before You Upgrade

1. **Read the [CHANGELOG](../CHANGELOG.md)** for the target version. Look for
   security and required-action sections before starting the new version.
2. **Back up your database consistently.** For SQLite, use the online backup
   command below, or stop every writer cleanly before copying the database.
   Copying only a live `.db` file can omit committed data still in its WAL.
   PostgreSQL: use `pg_dump` and verify the dump in a separate database.

   ```bash
   sqlite3 /path/to/pabawi.db ".backup '/path/to/pabawi-backup.db'"
   sqlite3 /path/to/pabawi-backup.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
   ```

   The integrity check must return `ok`; the foreign-key check must return no
   rows. Restore to a separate location and verify user-role and user-group
   assignments before upgrading.
3. **Back up your `.env` file.** Some releases add required variables or change
   defaults.

Database migrations run automatically on startup. They are forward-only: there
is no built-in rollback. The backup is your rollback path.

## Migration 016 convergence and migration integrity

Older releases used ID `016` for both Checkmk write permissions and Entra ID
authentication tables. The selected feature depended on the database dialect.
The corrected migration set keeps Entra at `016`, moves Checkmk to `021`, and
adds `022` to create missing Entra tables on installations that already recorded
the Checkmk variant. Existing migration-history rows retain their original names.

Both repairs preserve existing data. Migration `021` seeds Administrator and
Operator Checkmk write grants for installations that missed that feature. If
history records the Checkmk variant of `016`, it preserves subsequent grant
removals. Migration `022` preserves federation links and OAuth records.
These migrations cannot recover assignments lost by the original migration
`017`; use the backup recovery procedure below for that case.

Upgrade from a clean release checkout or freshly built image. Do not overlay
new SQL files onto an old compiled migration directory: obsolete `016_checkmk_*`
files would remain and the runner will correctly reject their conflicting IDs.
Keep the previous installation and its consistent database backup for recovery.

Newly applied migrations record SHA-256 checksums in the migration transaction.
Startup and migration-status checks reject changed, renamed or missing files
for those records before applying pending migrations. Restore the original
release files when drift is reported; do not clear history or edit stored
checksums to bypass it. Historical rows retain a null checksum because the
original executed SQL cannot be verified retrospectively. Checksums detect file
drift, not tampering by someone who can also modify the database.

## Authentication upgrade: migrations 023 through 025

This security upgrade requires every user to sign in again. Previous access and
refresh tokens lack the required token purpose/session-version claims and are
rejected. Existing console credentials also require a new authenticated session.

Stop all old backend processes before migration, then start only the corrected
version. Older binaries do not enforce the new revocation contract. Migration
`023` adds account and permission revisions, `024` installs dialect-specific
triggers, and `025` binds console credentials to account versions. Preserve the
triggers when maintaining the database: they are part of authorization enforcement.

After upgrade, verify login, refresh exchange and an authorized read. Reset a
disposable test account's password or deactivate it, then verify its previous
access and refresh tokens fail immediately. See
[token purpose and revocation](permissions-rbac.md#token-purpose-and-revocation)
for the policy, including role changes and long-lived connections.

## Upgrade Methods

- [Git / source install](#git--source-install)
- [Docker (standalone)](#docker-standalone)
- [Docker Compose](#docker-compose)
- [Kubernetes / Helm](#kubernetes--helm)

---

## Git / Source Install

For installations cloned from the repository and built locally.

```bash
cd /path/to/pabawi

# 1. Stop the running server
# (Ctrl-C if running in foreground, or stop your process manager)

# 2. Pull the latest release
git fetch --tags
git checkout v<VERSION>          # e.g. v1.4.0
# or, to track the latest on main:
# git pull origin main

# 3. Install / rebuild dependencies
npm run install:all

# 4. Review .env changes
diff backend/.env.example backend/.env
# Add any new required variables shown in the CHANGELOG

# 5. Build
npm run build

# 6. Start
npm run dev:fullstack            # development
# or your production process manager (systemd, pm2, etc.)
```

### Pinning to a release tag vs. tracking main

Release tags (`v1.4.0`, `v1.3.1`, etc.) are stable cut points. Tracking `main`
gives you the latest commits but may include incomplete work between releases.
For production, pin to tags.

---

## Docker (Standalone)

```bash
# 1. Pull the new image
docker pull example42/pabawi:latest
# or a specific version:
# docker pull example42/pabawi:1.4.0

# 2. Stop and remove the old container
docker stop pabawi
docker rm pabawi

# 3. Review .env for new required variables (check CHANGELOG)

# 4. Start the new container with the same volumes and env
docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \
  -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/data:/opt/pabawi/data" \
  -v "$(pwd)/bolt-project:/opt/pabawi/bolt-project:ro" \
  --env-file .env \
  example42/pabawi:latest
```

Your data persists in the mounted volumes. The new container applies any
pending database migrations on startup.

### Rollback

If the new version fails to start:

```bash
docker stop pabawi && docker rm pabawi
# Restore the database backup, then start the previous image:
docker run -d --name pabawi ... example42/pabawi:<previous-version>
```

---

## Docker Compose

```bash
cd /path/to/pabawi   # directory containing docker-compose.yml

# 1. Pull the latest image
docker compose pull

# 2. Review .env for new required variables

# 3. Recreate the container
docker compose up -d

# 4. Verify
docker compose logs -f app
curl http://localhost:3000/api/health
```

`docker compose up -d` recreates only containers whose image or config changed.
Volumes are preserved.

### With PostgreSQL profile

```bash
docker compose --profile postgres pull
docker compose --profile postgres up -d
```

### Pinning a version

Edit `docker-compose.yml` (or use an override file) to pin the image tag:

```yaml
services:
  app:
    image: example42/pabawi:1.4.0
```

---

## Kubernetes / Helm

```bash
# 1. Update the chart (if using a local copy)
cd /path/to/pabawi
# Use the clean release checkout described above

# 2. Review values changes
helm diff upgrade pabawi ./charts/pabawi -f my-values.yaml
# (requires the helm-diff plugin; otherwise compare values.yaml manually)

# 3. Upgrade
helm upgrade pabawi ./charts/pabawi \
  -f my-values.yaml \
  --set image.tag=1.4.0

# 4. Watch the rollout
kubectl rollout status deployment/pabawi
kubectl logs -l app.kubernetes.io/name=pabawi -f
```

The external PostgreSQL migration hook runs before install/upgrade. Before an
upgrade, stop the existing application and follow the [maintenance procedure](../charts/pabawi/README.md).
The pre-upgrade hook does not stop the old deployment for you. See [Helm hook timing](https://helm.sh/docs/topics/charts_hooks/). Monitor the Job:

```bash
kubectl get jobs -l app.kubernetes.io/component=migration
kubectl logs -l app.kubernetes.io/component=migration
```

### Rollback

```bash
helm rollback pabawi
# Restore the database from backup if migrations are not backward-compatible
```

---

## Version-Specific Notes

### Upgrading to 1.3.0

**Action required before starting the new version:**

- `JWT_SECRET` must be ≥ 32 characters and not a placeholder value. The app
  refuses to boot otherwise. Generate a proper secret:

  ```bash
  JWT_SECRET=$(openssl rand -base64 32)
  ```

- `DELETE /api/inventory/:id` now requires the lifecycle bearer token. If you
  have scripts calling this endpoint, add
  `Authorization: Bearer <PABAWI_LIFECYCLE_TOKEN>`. (Superseded in 1.5.0: the
  token replaces the JWT rather than accompanying it. See
  [Upgrading to 1.5.0](#upgrading-to-150).)

- SSE `?token=` URL parameter removed. Clients must use the stream-ticket
  endpoint (`POST /api/executions/:id/stream-ticket`) instead.

- Refresh-token rotation enforced. Clients must store and use the latest
  `refreshToken` from each refresh response.

### Upgrading to 1.3.0 with PostgreSQL

If switching from SQLite to PostgreSQL during this upgrade:

1. Set `DB_TYPE=postgres` and `DATABASE_URL` in `.env`.
2. The new schema is created automatically on first startup. There is no
   automated SQLite-to-PostgreSQL data migration: export and re-import
   manually if you need to preserve execution history or user accounts.

### Upgrading to 1.4.0

New optional integration: **Checkmk monitoring**. No action required unless you
want to enable it. Add `CHECKMK_ENABLED=true` and the related variables to
`.env`. See [docs/integrations/checkmk.md](integrations/checkmk.md).

### Upgrading to 1.5.0

**Security: breaking for operators using custom roles.**

Infrastructure routes that previously required only authentication now enforce
RBAC (assessment finding S01). Migration `020` adds three resources and grants
them to the built-in roles, so Viewer, Operator, Provisioner and Administrator
receive the new read grants. Custom roles do not receive the new permissions
automatically.

| Surface | Now requires |
|---|---|
| `/api/integrations/aws/*` | `aws:read` on every route, plus `aws:provision` / `aws:lifecycle` / `aws:destroy` (terminate) |
| `/api/integrations/azure/*` | `azure:read` on every route, plus `azure:provision` / `azure:lifecycle` / `azure:destroy` (deallocate) |
| `/api/integrations/proxmox/*` | `proxmox:read` on every route, plus `proxmox:provision` / `proxmox:lifecycle` / `proxmox:destroy` |
| `/api/integrations/puppetserver/*` | `puppetserver:read`; `puppetserver:write` to deploy an environment; `puppetserver:admin` to flush the environment cache |
| `/api/integrations/hiera/*` | `hiera:read`; `hiera:admin` for `POST /reload` |
| `/api/executions/*`, `/api/streaming/*` | `executions:read`; batch submission, re-execution and cancellation require `<execution-tool>:execute` |
| `/api/nodes/:id/command` | `<selected-tool>:execute`, including automatic tool selection |
| `/api/inventory`, `/api/inventory/:id`, `/api/nodes/:id/facts` | Only sources with `<source>:read` are queried and returned; explicit restricted facts/PQL requests return 403 |
| `/api/inventory/:id/action`, `DELETE /api/inventory/:id` | Provider read plus the action-specific provision/lifecycle/destroy permission. RBAC is now the only gate; see the lifecycle credential note below |
| `/api/integrations/provisioning` | `provisioning:read` (the permission row was missing before, so only `is_admin` users could reach it) |

**The lifecycle credential is no longer a second header.**

`PABAWI_LIFECYCLE_TOKEN` used to be required in `Authorization` *in addition to*
the JWT the production mount already required in that same header, so neither
credential could satisfy both checks and the generic lifecycle endpoints were
unreachable in a normal deployment (assessment finding I08). The token is now an
alternative credential: a request presents either a user JWT or the token, and
RBAC decides what either may do.

- If you use these endpoints from the UI or with a user JWT, nothing changes
  except that they now work: the caller needs `<provider>:read` plus the
  permission for the action's class.
- If you use them from a script, keep sending
  `Authorization: Bearer $PABAWI_LIFECYCLE_TOKEN` and drop any JWT you were also
  trying to send. The token authenticates as the new built-in
  `lifecycle-service` account, whose "Lifecycle Service" role holds `read`,
  `lifecycle` and `destroy` on `proxmox`, `aws` and `azure`. Edit that role to
  widen or narrow the scope; deactivate the account to revoke the token without
  a restart.
- The instruction in [Upgrading to 1.3.0](#upgrading-to-130) to add the
  lifecycle bearer *on top of* existing authentication no longer applies.
- The endpoints are documented at their real paths: the router is mounted at
  `/api/inventory`, not `/api/nodes`, so the action endpoint is
  `POST /api/inventory/:id/action`.
- Azure nodes now resolve through these endpoints (they used to be rejected as
  an unknown provider), and each provider accepts only the actions it
  advertises. `DELETE` on an Azure node returns `DESTROY_NOT_SUPPORTED` (501),
  because the Azure integration has no destroy capability.

Execution history and output are shared across users who hold `executions:read`;
they are not restricted to the execution owner. Grant this permission only to
operators who may inspect other users' execution output.

After upgrading, review any custom role that previously relied on
authentication alone and add the permissions above. `puppetserver:write` and
`puppetserver:admin` are granted to Administrator only: environment deployment
and cache flush change what every managed node applies, so Operators must be
granted them deliberately.

**Database: migration 017 was destructive on SQLite and fatal on PostgreSQL.**

Migration `017_nullable_password_hash` made `users.password_hash` nullable for
SSO accounts by rebuilding the `users` table. It shipped as a single shared file
and was wrong on both backends:

- **SQLite.** The rebuild dropped `users` with foreign keys enabled. SQLite runs
  an implicit `DELETE` before the drop, which fired `ON DELETE CASCADE` on
  `user_roles`, `user_groups`, `revoked_tokens` and `federated_identities`, and
  `ON DELETE SET NULL` on `audit_logs.user_id` and `journal_entries.user_id`.
  User accounts survived (they were copied); every role assignment, group
  membership, SSO link and token revocation did not.
- **PostgreSQL.** `DROP TABLE users` fails there with `cannot drop table users
  because other objects depend on it`, so the migration aborted and the
  deployment stayed at migration 016. PostgreSQL installations could not start
  past that point at all.

Migration 017 is now two dialect-specific files: SQLite suspends foreign-key
enforcement around the rebuild (and verifies the result with
`PRAGMA foreign_key_check` before committing), PostgreSQL uses
`ALTER COLUMN ... DROP NOT NULL`. Migration `018` also gained a PostgreSQL
variant, because its `datetime('now')` default is SQLite-only.

**If you already ran the old 017 on SQLite,** the migration is recorded as
applied and will not run again, and the deleted rows cannot be recovered by a
later migration: nothing in the database records what they were. Recovery:

1. Preserve the current database using the consistent backup procedure above.
2. Restore your pre-upgrade backup to a separate file and read the assignments
   out of it:

   ```bash
   sqlite3 pabawi-backup.db \
     "SELECT user_id, role_id FROM user_roles;
      SELECT user_id, group_id FROM user_groups;
      SELECT id, user_id, provider, subject FROM federated_identities;"
   ```

3. Re-create the assignments through the API or UI so they are audit-logged,
   rather than inserting them directly.

Accounts with `is_admin = 1` are unaffected: that flag lives on `users` and was
copied. Everyone else lost all permissions until their roles are re-assigned,
which is what an affected installation looks like from the outside.

---

## General Tips

- **Health check:** After every upgrade, verify `curl http://localhost:3000/api/health`
  returns `{"status":"ok"}` with HTTP 200.
- **Expert mode:** Enable expert mode in the UI after upgrading to see full
  debug output if something looks wrong.
- **Logs:** Check logs immediately after startup. Failed migrations or missing
  config surface within the first few seconds.
- **Permissions:** If new RBAC permissions were added in the release, built-in
  roles (Viewer, Operator, Administrator) are updated automatically via
  migration. Custom roles may need manual permission grants.
