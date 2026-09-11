# Pabawi Helm Chart

This chart deploys Pabawi on Kubernetes.

Run the commands below from the repository root. Fetch the locked chart
dependency before rendering or installing, including when PostgreSQL is disabled:

```bash
helm dependency build ./charts/pabawi
```

For a new installation, provide an independently generated
`secretEnv.PABAWI_BOOTSTRAP_TOKEN` in a protected values file or the existing
application Secret. Enrollment stays disabled without it. Keep first start private
and follow the [bootstrap guidance](../../docs/configuration.md).

## Install with SQLite

SQLite is the default and is intentionally single-replica. Its Deployment always
uses `Recreate`, regardless of `strategy`, so a rollout stops the old writer before
starting its replacement. Expect downtime during upgrades and rotation.

```bash
helm install pabawi ./charts/pabawi \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

## Install with external PostgreSQL

Create or reference a Secret containing `DATABASE_URL`, then enable PostgreSQL
mode:

```bash
kubectl create secret generic pabawi-db \
  --from-literal=DATABASE_URL='postgres://pabawi:password@postgres.example:5432/pabawi'

helm install pabawi ./charts/pabawi \
  --set database.type=postgres \
  --set database.postgres.existingSecret=pabawi-db \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

## Install with bundled PostgreSQL

The chart can pull Bitnami PostgreSQL as an optional dependency. This is useful
for demos and isolated environments; production deployments should normally use
a managed database or a PostgreSQL operator.

```bash
helm dependency build ./charts/pabawi

PG_PASSWORD="$(openssl rand -base64 24)"

helm install pabawi ./charts/pabawi \
  --set database.type=postgres \
  --set postgresql.enabled=true \
  --set postgresql.auth.password="$PG_PASSWORD" \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

## Supported topology and migrations

The supported application baseline is one process. PostgreSQL does not distribute
execution queues, concurrency limits, stream tickets, MCP transports or console
sessions. Multiple replicas and HPA remain unverified for those protocols; sticky
routing does not establish failover or recovery. SQLite rejects multiple replicas
and HPA at render time. Bundled PostgreSQL also rejects those configurations.

For external PostgreSQL, use `replicaCount: 1` and `strategy.type: Recreate` to
avoid application overlap. `strategy` applies only to PostgreSQL. Recreate causes
downtime and does not establish safe cancellation or recovery of running work.

External PostgreSQL migrations run in a `pre-install,pre-upgrade` hook Job. With
`serviceAccount.create: true`, a separate migration ServiceAccount is created by
an earlier hook and inherits the configured account annotations and token-mount
setting. It remains after the Job finishes so Helm cannot remove it before the
Job starts. Helm replaces it on the next install/upgrade; hook resources are not
managed by uninstall. With `serviceAccount.create: false`, the named account
(or namespace default account) must already exist before installation.

The database, `database.postgres.existingSecret`, image-pull Secrets, and any
Secret/ConfigMap referenced by `extraEnv` must exist before the hook runs. Do not
reference ordinary resources from the same release as hook prerequisites. The
Job needs network access to PostgreSQL and uses the same image as the application.
Bundled PostgreSQL and SQLite run migrations at application startup because
their storage prerequisites are installed with the release.

Run only one release migration at a time against a database. A pre-upgrade Job
runs while the previous application is still present; `Recreate` affects the
subsequent Deployment update, not hook execution. Before a schema upgrade, stop
admission, resolve active work and stop the old application under a maintenance
window. Take and verify a consistent backup first. Database migration rollback
is not implemented by `helm rollback`.

## Configuration and credential rotation

Chart-managed ConfigMap and Secret content contributes to reserved
`checksum/config` and `checksum/secret` pod annotations. Changing command policy,
JWT signing keys, MCP/lifecycle tokens, provider credentials in `secretEnv`, or
chart-managed database credentials triggers a rollout even with the same image.
Caller-supplied annotations cannot replace these checksums. Unchanged managed
values preserve the pod template. An omitted `secrets.jwtSecret` reuses the
installed Secret through Helm lookup; generate-on-render GitOps tools should
supply an explicit managed value or use an existing Secret.

Update the protected values source and upgrade with its complete configuration:

```bash
helm upgrade pabawi ./charts/pabawi -f /secure/pabawi-values.yaml --wait --timeout 5m
kubectl rollout status deployment/pabawi --timeout=5m
```

Existing Secrets, `extraEnvFrom` sources and mounted integration files are outside
the chart's checksum mechanism. Update those resources, then explicitly restart:

```bash
kubectl rollout restart deployment/pabawi
kubectl rollout status deployment/pabawi --timeout=5m
```

For GitOps, change a non-secret revision annotation such as
`podAnnotations.pabawi.io/credentials-revision` after the external Secret
controller has applied the new data. Keep the revision in the desired values.
Coordinate external database password activation with database access and the
migration hook. Changing a Secret reference or a pod environment entry also
changes the pod template. Ensure `extraEnv`, `extraEnvFrom` and duplicate keys in
`secretEnv` do not override the value you intend to rotate.

Rotation is complete only when every old application pod has exited, replacements
are Ready, an old credential is rejected and the replacement credential works
through the relevant API. Verify the effective command policy with an authorized
request to `/api/config` and a harmless denied-command probe in a test inventory.
Do not log credentials, print Secret data, or put real values on command lines.
With a rolling PostgreSQL strategy, old pods can accept old credentials until
they exit; use a maintenance window when immediate invalidation is required.

Changing `JWT_SECRET` invalidates existing access and refresh JWTs in replacement
processes and requires login again. Restarting closes process-local SSE, MCP and
console connections. Rotation does not revoke upstream credentials by itself,
undo completed infrastructure actions, or guarantee cancellation/recovery of
running executions. Check provider state before retrying interrupted work.

## Verification

```bash
helm lint ./charts/pabawi
node --test scripts/deployment/chart.test.mjs
```

The live regression runner requires an explicitly supplied disposable kind
kubeconfig and a locally built image. It creates an isolated namespace with
PostgreSQL 15 and SQLite, enrolls test accounts, rotates credentials, and checks
the running HTTP APIs. It retains resources for inspection:

```bash
kind create cluster --name pabawi-chart-test --kubeconfig /tmp/pabawi-chart-test.kubeconfig
kind load docker-image pabawi:chart-test postgres:15 --name pabawi-chart-test
node scripts/deployment/cluster-smoke.mjs /tmp/pabawi-chart-test.kubeconfig pabawi:chart-test
```

Build `pabawi:chart-test` and obtain `postgres:15` first. If Docker Desktop's
multi-platform store makes kind import fail with a missing content digest,
export both images with `docker image save --platform linux/arm64` (or
`linux/amd64` for that host) and import the archive with `kind load image-archive`.
Use only disposable databases and credentials. The script does not contact
infrastructure providers. CI runs the render regressions; cluster execution is
currently a separate check.

The checksum and hook ordering follow Helm's
[rollout guidance](https://helm.sh/docs/howto/charts_tips_and_tricks/) and
[hook lifecycle](https://helm.sh/docs/topics/charts_hooks/).

## Mounting integrations

Use `volumeMounts` plus `volumes` for Bolt projects, control repositories,
certificates, SSH keys, and Ansible content:

```yaml
volumeMounts:
  boltProject:
    enabled: true
volumes:
  boltProject:
    existingClaim: pabawi-bolt-project
```

Supported volume sources are `existingClaim`, `configMap`, `secret`,
`hostPath`, and `emptyDir`.
