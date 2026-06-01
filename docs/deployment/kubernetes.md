# Kubernetes Deployment

## Helm chart

The repository includes a Helm chart at `charts/pabawi`.

```bash
# SQLite, single replica
helm install pabawi ./charts/pabawi \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

For PostgreSQL-backed deployments, use an existing Secret containing
`DATABASE_URL`:

```bash
kubectl create secret generic pabawi-db \
  --from-literal=DATABASE_URL='postgres://pabawi:password@postgres.example:5432/pabawi'

helm install pabawi ./charts/pabawi \
  --set database.type=postgres \
  --set database.postgres.existingSecret=pabawi-db \
  --set replicaCount=3 \
  --set podDisruptionBudget.enabled=true \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

The chart also supports optional bundled PostgreSQL via the Bitnami PostgreSQL
dependency:

```bash
helm dependency build ./charts/pabawi

PG_PASSWORD="$(openssl rand -base64 24)"

helm install pabawi ./charts/pabawi \
  --set database.type=postgres \
  --set postgresql.enabled=true \
  --set postgresql.auth.password="$PG_PASSWORD" \
  --set secrets.jwtSecret="$(openssl rand -base64 48)"
```

Use bundled PostgreSQL for demos or isolated single-replica environments. For
production and scaled Pabawi releases, use managed PostgreSQL or an
operator-managed PostgreSQL cluster.

## Database backend

Pabawi defaults to SQLite and also supports PostgreSQL.

- **SQLite:** set `DB_TYPE=sqlite`, keep `replicas: 1`, and mount a writable
  PVC at `/opt/pabawi/data`. Multiple SQLite-backed replicas will cause
  database locking.
- **PostgreSQL:** set `DB_TYPE=postgres` and provide `DATABASE_URL` in a
  Secret. Point it at an external PostgreSQL service, a managed database, or a
  PostgreSQL instance installed separately in the cluster.

PostgreSQL removes the SQLite file-locking constraint, but Pabawi's execution
queue and concurrency limit are still process-local. Keep `replicas: 1` unless
you have accounted for per-pod execution concurrency and routing behavior.

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pabawi-config
data:
  PORT: "3000"
  HOST: "0.0.0.0"
  LOG_LEVEL: "info"
  DB_TYPE: "sqlite"
  DATABASE_PATH: "/opt/pabawi/data/pabawi.db"
  BOLT_PROJECT_PATH: "/opt/pabawi/bolt-project"
  COMMAND_WHITELIST_ALLOW_ALL: "false"
  COMMAND_WHITELIST_MATCH_MODE: "exact"
  BOLT_EXECUTION_TIMEOUT: "300000"
  CACHE_INVENTORY_TTL: "60000"
  CACHE_FACTS_TTL: "300000"
  CONCURRENT_EXECUTION_LIMIT: "10"
  ALLOW_DESTRUCTIVE_PROVISIONING: "false"
```

## Secrets

```bash
# SSL certs (for PuppetDB/Puppetserver)
kubectl create secret generic pabawi-certs \
  --from-file=ca.pem=./certs/ca.pem \
  --from-file=client.crt=./certs/client.crt \
  --from-file=client.key=./certs/client.key

# SSH keys (for SSH integration)
kubectl create secret generic pabawi-ssh \
  --from-file=id_rsa=~/.ssh/pabawi_key

# Sensitive env vars
kubectl create secret generic pabawi-secrets \
  --from-literal=JWT_SECRET='<32+ chars of random entropy>' \
  --from-literal=PUPPETDB_ENABLED=true \
  --from-literal=PUPPETDB_SERVER_URL=https://puppetdb.example.com \
  --from-literal=COMMAND_WHITELIST='["uptime","df -h","free -m"]'
```

## PostgreSQL configuration

For PostgreSQL, change only the database-related environment. Put
`DATABASE_URL` in a Secret, not in the ConfigMap.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pabawi-config
data:
  PORT: "3000"
  HOST: "0.0.0.0"
  LOG_LEVEL: "info"
  DB_TYPE: "postgres"
  BOLT_PROJECT_PATH: "/opt/pabawi/bolt-project"
  COMMAND_WHITELIST_ALLOW_ALL: "false"
  COMMAND_WHITELIST_MATCH_MODE: "exact"
  BOLT_EXECUTION_TIMEOUT: "300000"
  CACHE_INVENTORY_TTL: "60000"
  CACHE_FACTS_TTL: "300000"
  CONCURRENT_EXECUTION_LIMIT: "10"
  ALLOW_DESTRUCTIVE_PROVISIONING: "false"
```

```bash
kubectl create secret generic pabawi-secrets \
  --from-literal=JWT_SECRET='<32+ chars of random entropy>' \
  --from-literal=DATABASE_URL='postgres://pabawi:<password>@postgres.example.svc.cluster.local:5432/pabawi' \
  --from-literal=PUPPETDB_ENABLED=true \
  --from-literal=PUPPETDB_SERVER_URL=https://puppetdb.example.com \
  --from-literal=COMMAND_WHITELIST='["uptime","df -h","free -m"]'
```

Use the service DNS name and credentials for your PostgreSQL deployment. Pabawi
runs migrations automatically on startup against the configured backend.

## PersistentVolumeClaim

Required for SQLite. Not required for the application database when
`DB_TYPE=postgres`, though you may still mount other volumes for Bolt projects,
certificates, SSH keys, or integration data.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pabawi-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pabawi
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pabawi
  template:
    metadata:
      labels:
        app: pabawi
    spec:
      securityContext:
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: pabawi
        image: example42/pabawi:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: pabawi-config
        - secretRef:
            name: pabawi-secrets
        volumeMounts:
        - name: data
          mountPath: /opt/pabawi/data
        - name: bolt-project
          mountPath: /opt/pabawi/bolt-project
          readOnly: true
        - name: certs
          mountPath: /opt/pabawi/certs
          readOnly: true
        - name: ssh-keys
          mountPath: /opt/pabawi/ssh
          readOnly: true
        env:
        - name: PUPPETDB_SSL_CA
          value: /opt/pabawi/certs/ca.pem
        - name: PUPPETDB_SSL_CERT
          value: /opt/pabawi/certs/client.crt
        - name: PUPPETDB_SSL_KEY
          value: /opt/pabawi/certs/client.key
        - name: SSH_DEFAULT_KEY
          value: /opt/pabawi/ssh/id_rsa
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 15
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: pabawi-data
      - name: bolt-project
        hostPath:
          path: /opt/bolt-project
          type: Directory
      - name: certs
        secret:
          secretName: pabawi-certs
          defaultMode: 0640
      - name: ssh-keys
        secret:
          secretName: pabawi-ssh
          defaultMode: 0600
```

## Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pabawi
spec:
  selector:
    app: pabawi
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP  # use LoadBalancer or Ingress for external access
```

## Deploy

```bash
kubectl apply -f pabawi-configmap.yaml
kubectl apply -f pabawi-pvc.yaml
kubectl apply -f pabawi-deployment.yaml
kubectl apply -f pabawi-service.yaml

# Verify
kubectl get pods -l app=pabawi
kubectl logs -l app=pabawi -f
curl http://<cluster-ip>/api/health
```
