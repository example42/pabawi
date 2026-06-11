# Upgrading Pabawi

This guide covers upgrading existing Pabawi installations. For fresh installs,
see the main [README](../README.md#installation).

## Before You Upgrade

1. **Read the [CHANGELOG](../CHANGELOG.md)** for the target version. Look for
   sections labelled "Security — breaking for operators" or "Action required
   before upgrade" — these require configuration changes before starting the
   new version.
2. **Back up your database.** SQLite: copy the `.db` file. PostgreSQL: run
   `pg_dump`.
3. **Back up your `.env` file.** Some releases add required variables or change
   defaults.

Database migrations run automatically on startup. They are forward-only — there
is no built-in rollback. The backup is your rollback path.

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
cd charts/pabawi
git pull   # or copy the updated chart

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

If the chart includes a database migration Job, it runs before the new
Deployment pods start. Monitor the Job:

```bash
kubectl get jobs -l app.kubernetes.io/component=migration
kubectl logs job/pabawi-migrate
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
  `Authorization: Bearer <PABAWI_LIFECYCLE_TOKEN>`.

- SSE `?token=` URL parameter removed. Clients must use the stream-ticket
  endpoint (`POST /api/executions/:id/stream-ticket`) instead.

- Refresh-token rotation enforced. Clients must store and use the latest
  `refreshToken` from each refresh response.

### Upgrading to 1.3.0 with PostgreSQL

If switching from SQLite to PostgreSQL during this upgrade:

1. Set `DB_TYPE=postgres` and `DATABASE_URL` in `.env`.
2. The new schema is created automatically on first startup. There is no
   automated SQLite-to-PostgreSQL data migration — export and re-import
   manually if you need to preserve execution history or user accounts.

### Upgrading to 1.4.0

New optional integration: **Checkmk monitoring**. No action required unless you
want to enable it. Add `CHECKMK_ENABLED=true` and the related variables to
`.env`. See [docs/integrations/checkmk.md](integrations/checkmk.md).

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
