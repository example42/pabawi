# Pabawi Helm Chart

This chart deploys Pabawi on Kubernetes.

## Install with SQLite

SQLite is the default and is intentionally single-replica.

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

## Scaling

SQLite mode fails template rendering if `replicaCount > 1` or autoscaling is
enabled. Use PostgreSQL before enabling multi-replica deployments or HPA.

```yaml
database:
  type: postgres
  postgres:
    existingSecret: pabawi-db

replicaCount: 3

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10

podDisruptionBudget:
  enabled: true
  minAvailable: 2
```

Pabawi's execution queue and concurrency limit are per pod. When scaling out,
size `CONCURRENT_EXECUTION_LIMIT` and routing with that in mind.

For PostgreSQL deployments, the chart creates a Helm hook Job that runs
database migrations before install/upgrade rollout when using external
PostgreSQL. Leave `migrations.enabled` on for multi-replica releases. Bundled
PostgreSQL is intentionally blocked from multi-replica/HPA chart installs
because the dependency is created during the same release and is not a
production HA database topology.

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
