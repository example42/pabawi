# PuppetDB Integration

Pabawi connects to PuppetDB to provide node inventory, facts, Puppet reports, catalogs, and events.

## Prerequisites

- PuppetDB 6.0+ running and reachable from the Pabawi host
- Port 8081 (HTTPS) or 8080 (HTTP localhost) open
- SSL client certificates signed by the Puppetserver CA (for HTTPS), or a PE auth token

Test connectivity:

```bash
curl https://puppetdb.example.com:8081/pdb/meta/v1/version
```

## Minimal Configuration

**Localhost HTTP (open source Puppet):**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=http://localhost
PUPPETDB_PORT=8080
```

**Remote HTTPS with SSL:**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_CA=/opt/pabawi/certs/ca.pem
PUPPETDB_SSL_CERT=/opt/pabawi/certs/client.crt
PUPPETDB_SSL_KEY=/opt/pabawi/certs/client.key
```

**Puppet Enterprise (token auth):**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=<pe-rbac-token>
PUPPETDB_SSL_REJECT_UNAUTHORIZED=false   # if using self-signed PE cert
```

See [configuration.md](../configuration.md) for the full env var reference including retry, cache, and circuit breaker settings.

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | Nodes from PuppetDB (priority 10) |
| **Facts** | System facts per node |
| **Reports** | Puppet run reports with status, resources, events |
| **Catalogs** | Compiled catalog resources per node |
| **Events** | Resource-level events from reports |
| **Summary stats** | Aggregate PuppetDB statistics |

## SSL Certificate Setup

The client cert and key must be signed by the same CA as PuppetDB's server cert.

If Pabawi runs on the Puppetserver host, the Puppet-signed certs work directly:

```bash
PUPPETDB_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETDB_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/$(hostname -f).pem
PUPPETDB_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/$(hostname -f).pem
```

If Pabawi runs on a different host, generate a certificate on the Puppetserver and copy the files:

```bash
# On Puppetserver
puppetserver ca generate --certname pabawi.example.com

# Copy to Pabawi host
scp /etc/puppetlabs/puppet/ssl/certs/pabawi.example.com.pem pabawi-host:/opt/pabawi/certs/client.crt
scp /etc/puppetlabs/puppet/ssl/private_keys/pabawi.example.com.pem pabawi-host:/opt/pabawi/certs/client.key
scp /etc/puppetlabs/puppet/ssl/certs/ca.pem pabawi-host:/opt/pabawi/certs/ca.pem
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `PUPPETDB_SERVER_URL is required` | Set the URL, not just the port |
| "SSL handshake failed" | Verify CA, cert, and key paths. Check cert is signed by the correct CA. |
| "Certificate expired" | Renew the client cert: `puppetserver ca renew --certname pabawi.example.com` |
| "Connection refused" | Check `PUPPETDB_PORT` and firewall rules. Test with `curl`. |
| "401 Unauthorized" | PE token missing or expired. Regenerate via `puppet-access login`. |
| Reports not appearing | PuppetDB must be configured to receive reports (`store_configs = true` in Puppet) |
