# Pabawi Authentication Guide

Version: 0.3.0

## Overview

Pabawi supports multiple authentication methods depending on the integration being used. This guide covers authentication requirements and configuration for each integration.

## Authentication Methods

### No Authentication (Bolt)

Bolt integration does not require authentication at the Pabawi API level. Authentication is handled by Bolt itself when connecting to target nodes via SSH, WinRM, or other transports.

**Configuration:**

Configure node authentication in your Bolt inventory file:

```yaml
# bolt-project/inventory.yaml
groups:
  - name: linux_nodes
    targets:
      - web-01.example.com
      - web-02.example.com
    config:
      transport: ssh
      ssh:
        user: admin
        private-key: /path/to/private-key
        host-key-check: false
```

### Token-Based Authentication (PuppetDB)

**Note: Token-based authentication is only available with Puppet Enterprise. Open Source Puppet and OpenVox require certificate-based authentication.**

PuppetDB supports token-based authentication using RBAC tokens from Puppet Enterprise.

**Configuration:**

Set the PuppetDB token in your environment:

```bash
PUPPETDB_TOKEN=your-puppetdb-token-here
```

Or in your configuration file:

```json
{
  "integrations": {
    "puppetdb": {
      "token": "your-puppetdb-token-here"
    }
  }
}
```

**Generating a PuppetDB Token (Puppet Enterprise Only):**

```bash
puppet access login --lifetime 1y
puppet access show
```

**Note: The `puppet access` command is only available with Puppet Enterprise. Open Source Puppet installations must use certificate-based authentication.**

**Using the Token:**

The token is automatically included in all PuppetDB API requests:

```http
GET /pdb/query/v4/nodes
X-Authentication-Token: your-puppetdb-token-here
```

### Certificate-Based Authentication (Puppetserver)

Puppetserver requires certificate-based authentication for CA operations and other administrative endpoints.

**Configuration:**

Configure SSL certificates in your environment:

```bash
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false  # For self-signed certs
```

Or in your configuration file:

```json
{
  "integrations": {
    "puppetserver": {
      "ssl": {
        "enabled": true,
        "ca": "/path/to/ca.pem",
        "cert": "/path/to/cert.pem",
        "key": "/path/to/key.pem",
        "rejectUnauthorized": false
      }
    }
  }
}
```

**Generating Certificates:**

1. **Request a certificate from Puppetserver:**

```bash
puppet ssl submit_request --certname pabawi
```

1. **Sign the certificate on Puppetserver:**

```bash
puppetserver ca sign --certname pabawi
```

1. **Download the certificate:**

```bash
puppet ssl download_cert --certname pabawi
```

1. **Extract certificate files:**

```bash
# CA certificate
cp /etc/puppetlabs/puppet/ssl/certs/ca.pem /path/to/ca.pem

# Client certificate
cp /etc/puppetlabs/puppet/ssl/certs/pabawi.pem /path/to/pabawi-cert.pem

# Private key
cp /etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem /path/to/pabawi-key.pem
```

**Whitelisting Certificate in Puppetserver:**

Add your certificate to Puppetserver's `auth.conf`:

```hocon
# /etc/puppetlabs/puppetserver/conf.d/auth.conf
authorization: {
    version: 1
    rules: [
        {
            match-request: {
                path: "^/puppet-ca/v1/"
                type: regex
                method: [get, post, put, delete]
            }
            allow: ["pabawi"]
            sort-order: 200
            name: "pabawi certificate access"
        },
        {
            match-request: {
                path: "^/puppet/v3/"
                type: regex
                method: [get, post]
            }
            allow: ["pabawi"]
            sort-order: 200
            name: "pabawi puppet api access"
        }
    ]
}
```

Restart Puppetserver after modifying `auth.conf`:

```bash
systemctl restart puppetserver
```

## Authentication Troubleshooting

### PuppetDB Authentication Errors

**Error:** `PUPPETDB_AUTH_ERROR`

**Symptoms:**

- 401 Unauthorized responses
- "Authentication failed" messages

**Solutions:**

1. **Verify token is valid:**

```bash
curl -X GET https://puppetdb.example.com:8081/pdb/meta/v1/version \
  -H "X-Authentication-Token: your-token-here"
```

1. **Check token expiration:**

```bash
puppet access show
```

1. **Generate new token:**

```bash
puppet access login --lifetime 1y
```

1. **Verify token in configuration:**

```bash
echo $PUPPETDB_TOKEN
```

### Puppetserver Authentication Errors

**Error:** `PUPPETSERVER_AUTH_ERROR`

**Symptoms:**

- 403 Forbidden responses
- "Forbidden request" messages
- Certificate validation errors

**Solutions:**

1. **Verify certificate is signed:**

```bash
puppetserver ca list --all
```

1. **Check certificate expiration:**

```bash
openssl x509 -in /path/to/cert.pem -noout -dates
```

1. **Verify certificate paths:**

```bash
ls -la /path/to/ca.pem
ls -la /path/to/cert.pem
ls -la /path/to/key.pem
```

1. **Test certificate authentication:**

```bash
curl -X GET https://puppetserver.example.com:8140/puppet-ca/v1/certificate_statuses \
  --cert /path/to/cert.pem \
  --key /path/to/key.pem \
  --cacert /path/to/ca.pem
```

1. **Check auth.conf whitelist:**

```bash
cat /etc/puppetlabs/puppetserver/conf.d/auth.conf
```

1. **Verify certificate name matches:**

```bash
openssl x509 -in /path/to/cert.pem -noout -subject
```

### SSL Certificate Verification Errors

**Error:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `SELF_SIGNED_CERT_IN_CHAIN`

**Symptoms:**

- SSL verification errors
- Certificate chain validation failures

**Solutions:**

1. **For self-signed certificates, disable strict verification:**

```bash
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false
PUPPETDB_SSL_REJECT_UNAUTHORIZED=false
```

1. **Verify CA certificate is correct:**

```bash
openssl verify -CAfile /path/to/ca.pem /path/to/cert.pem
```

1. **Check certificate chain:**

```bash
openssl s_client -connect puppetserver.example.com:8140 -showcerts
```

## Security Best Practices

### Token Security

1. **Use long-lived tokens sparingly** - Generate tokens with appropriate lifetimes
2. **Rotate tokens regularly** - Regenerate tokens periodically
3. **Store tokens securely** - Use environment variables or secure secret management
4. **Never commit tokens** - Add tokens to `.gitignore`
5. **Use least privilege** - Grant tokens only necessary permissions

### Certificate Security

1. **Protect private keys** - Set appropriate file permissions (600)
2. **Use strong key sizes** - Minimum 2048-bit RSA keys
3. **Monitor certificate expiration** - Set up alerts for expiring certificates
4. **Revoke compromised certificates** - Immediately revoke if compromised
5. **Use separate certificates** - Don't reuse certificates across services

### File Permissions

Set appropriate permissions for sensitive files:

```bash
# Private keys
chmod 600 /path/to/key.pem
chown pabawi:pabawi /path/to/key.pem

# Certificates
chmod 644 /path/to/cert.pem
chmod 644 /path/to/ca.pem

# Configuration files with tokens
chmod 600 /path/to/config.json
chown pabawi:pabawi /path/to/config.json
```

## Configuration Examples

### Complete PuppetDB Configuration

```bash
# .env
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-puppetdb-token-here
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/etc/pabawi/ssl/ca.pem
PUPPETDB_SSL_CERT=/etc/pabawi/ssl/cert.pem
PUPPETDB_SSL_KEY=/etc/pabawi/ssl/key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
```

### Complete Puppetserver Configuration

```bash
# .env
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppetserver.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/etc/pabawi/ssl/ca.pem
PUPPETSERVER_SSL_CERT=/etc/pabawi/ssl/pabawi-cert.pem
PUPPETSERVER_SSL_KEY=/etc/pabawi/ssl/pabawi-key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
```

### Docker Configuration

When running in Docker, mount certificate files as volumes:

```yaml
# docker-compose.yml
services:
  pabawi:
    image: pabawi:latest
    volumes:
      - ./ssl/ca.pem:/etc/pabawi/ssl/ca.pem:ro
      - ./ssl/cert.pem:/etc/pabawi/ssl/cert.pem:ro
      - ./ssl/key.pem:/etc/pabawi/ssl/key.pem:ro
    environment:
      - PUPPETDB_TOKEN=${PUPPETDB_TOKEN}
      - PUPPETSERVER_SSL_CA=/etc/pabawi/ssl/ca.pem
      - PUPPETSERVER_SSL_CERT=/etc/pabawi/ssl/cert.pem
      - PUPPETSERVER_SSL_KEY=/etc/pabawi/ssl/key.pem
```

## Testing Authentication

### Test PuppetDB Authentication

```bash
# Test with curl
curl -X GET https://puppetdb.example.com:8081/pdb/meta/v1/version \
  -H "X-Authentication-Token: ${PUPPETDB_TOKEN}"

# Test via Pabawi API
curl -X GET http://localhost:3000/api/integrations/puppetdb/nodes
```

### Test Puppetserver Authentication

```bash
# Test with curl
curl -X GET https://puppetserver.example.com:8140/puppet-ca/v1/certificate_statuses \
  --cert /path/to/cert.pem \
  --key /path/to/key.pem \
  --cacert /path/to/ca.pem

# Test via Pabawi API
curl -X GET http://localhost:3000/api/integrations/puppetserver/certificates
```

### Test Integration Status

```bash
# Check all integrations
curl -X GET http://localhost:3000/api/integrations/status

# Force fresh health check
curl -X GET http://localhost:3000/api/integrations/status?refresh=true
```

## Related Documentation

- [Configuration Guide](./configuration.md)
- [Puppetserver Setup](./PUPPETSERVER_SETUP.md)
- [PuppetDB Integration Setup](./puppetdb-integration-setup.md)
- [Error Codes Reference](./error-codes.md)
- [Troubleshooting Guide](./troubleshooting.md)
