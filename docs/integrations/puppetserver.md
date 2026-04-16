# Puppetserver Integration

Pabawi connects to Puppetserver to provide node inventory (from the CA), facts, catalog compilation, environment management, and service metrics.

## Prerequisites

- Puppetserver 6.x or 7.x running and reachable from the Pabawi host
- Port 8140 open
- Authentication: SSL client certificate, or PE RBAC token

## Minimal Configuration

**SSL certificate auth (open source Puppet and PE):**

```bash
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_SSL_CA=/opt/pabawi/certs/ca.pem
PUPPETSERVER_SSL_CERT=/opt/pabawi/certs/client.crt
PUPPETSERVER_SSL_KEY=/opt/pabawi/certs/client.key
```

**PE token auth:**

```bash
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_TOKEN=<pe-rbac-token>
```

See [configuration.md](../configuration.md) for the full env var reference.

## Certificate Setup (SSL Auth)

If Pabawi runs on the Puppetserver host, the Puppet SSL certs work directly:

```bash
PUPPETSERVER_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETSERVER_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/$(hostname -f).pem
PUPPETSERVER_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/$(hostname -f).pem
```

For Pabawi on a separate host, generate a cert with the `cli_auth` extension (required for CA API access):

```bash
# On Puppetserver
./scripts/generate-pabawi-cert.sh

# Sign the CSR
puppetserver ca sign --certname pabawi

# Download signed cert
./scripts/generate-pabawi-cert.sh --download
```

The `cli_auth` extension (OID `1.3.6.1.4.1.34380.1.3.39`) is required for CA management endpoints. Without it, certificate lists fall back to PuppetDB data.

## What It Provides

| Feature | Description |
|---|---|
| **Inventory** | Nodes from Puppetserver CA (priority 20) |
| **Node status** | Last check-in time, inactivity detection |
| **Facts** | Node facts from Puppetserver |
| **Catalog** | Compile catalog for a node/environment |
| **Catalog compare** | Diff catalogs across environments |
| **Environments** | List, deploy, cache flush |
| **Metrics** | JVM and service metrics |

## Verification

```bash
curl -k https://puppet.example.com:8140/status/v1/simple \
  -H "X-Authentication: <token>"
# or with cert:
curl --cert client.crt --key client.key --cacert ca.pem \
  https://puppet.example.com:8140/status/v1/simple
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "Puppetserver client not initialized" | `PUPPETSERVER_ENABLED=true` and `PUPPETSERVER_SERVER_URL` not set |
| "SSL handshake failed" | Check cert/key/CA paths and permissions. Cert must be signed by the correct CA. |
| "Authentication failed" | For PE token: run `puppet access show` to verify. For SSL: check cert is not expired. |
| "403 Forbidden on CA endpoints" | Cert missing `cli_auth` extension. Re-generate with the provided script. |
| Slow responses | Increase `PUPPETSERVER_CACHE_TTL`. Check Puppetserver JVM heap. |
| "Node not found" | Puppetserver only lists nodes with signed certs. Unsigned nodes won't appear. |
