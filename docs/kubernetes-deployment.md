# Kubernetes Deployment Guide

This guide covers deploying Pabawi to a Kubernetes cluster, including configuration maps, persistent volumes, and services.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Configuration Map](#configuration-map)
- [Deployment](#deployment)
- [Service](#service)
- [Storage Setup](#storage-setup)
- [Secrets](#secrets)

## Overview

Pabawi can be deployed as a scalable application in Kubernetes. The deployment typically consists of:

- **Deployment**: Manages the Pabawi pods.
- **ConfigMap**: Stores non-sensitive configuration (environment variables).
- **Secret**: Stores sensitive data like SSH keys and database credentials.
- **PersistentVolume**: Stores the SQLite database (note: SQLite requires a single replica deployment strategy).
- **Service**: Exposes the application to the cluster or external network.

## Prerequisites

- A running Kubernetes cluster.
- `kubectl` configured to communicate with your cluster.
- Docker image of Pabawi available in a container registry.

## Configuration Map

Create a `ConfigMap` to store environment variables that control Pabawi's behavior.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pabawi-config
data:
  PORT: "3000"
  HOST: "0.0.0.0"
  BOLT_PROJECT_PATH: "/bolt-project"
  COMMAND_WHITELIST_ALLOW_ALL: "false"
  COMMAND_WHITELIST_MATCH_MODE: "exact"
  LOG_LEVEL: "info"
  DATABASE_PATH: "/data/executions.db"
  BOLT_EXECUTION_TIMEOUT: "300000"
  CACHE_INVENTORY_TTL: "60000"
  CACHE_FACTS_TTL: "300000"
  CONCURRENT_EXECUTION_LIMIT: "10"
```

## Deployment

The Deployment resource manages the application pods.

**Important**: Because Pabawi currently uses SQLite for its database, you must limit the deployment to **1 replica** (`replicas: 1`) to avoid database locking issues. For high availability with multiple replicas, a future update supporting external databases (like PostgreSQL) would be required.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pabawi
spec:
  replicas: 1  # Note: Database is not shared, use 1 replica
  selector:
    matchLabels:
      app: pabawi
  template:
    metadata:
      labels:
        app: pabawi
    spec:
      containers:
      - name: pabawi
        image: pabawi:0.1.0
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: pabawi-config
        env:
        - name: COMMAND_WHITELIST
          value: '["ls","pwd","uptime"]'
        volumeMounts:
        - name: bolt-project
          mountPath: /bolt-project
          readOnly: true
        - name: data
          mountPath: /data
        - name: ssh-keys
          mountPath: /root/.ssh
          readOnly: true
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: bolt-project
        configMap:
          name: bolt-project-files
      - name: data
        persistentVolumeClaim:
          claimName: pabawi-data
      - name: ssh-keys
        secret:
          secretName: ssh-keys
          defaultMode: 0600
```

## Service

Expose the application using a Service.

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
  type: LoadBalancer
```

## Storage Setup

You will need a PersistentVolumeClaim (PVC) for the SQLite database data.

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
      storage: 1Gi
```

## Secrets

For sensitive data like SSH keys or SSL certificates, use Kubernetes Secrets.

```bash
# Example: Create secret from SSH keys
kubectl create secret generic ssh-keys --from-file=id_rsa=~/.ssh/id_rsa
```
