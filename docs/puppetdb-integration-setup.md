# PuppetDB Integration Setup Guide

Version: 0.2.0

## Overview

This guide walks you through configuring Padawi to integrate with PuppetDB, enabling dynamic inventory discovery, node facts retrieval, Puppet run reports viewing, catalog inspection, and event tracking. PuppetDB integration provides a comprehensive view of your Puppet-managed infrastructure directly within Padawi.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [SSL/TLS Setup](#ssltls-setup)
- [Authentication Setup](#authentication-setup)
- [Testing the Connection](#testing-the-connection)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)
- [Security Best Practices](#security-best-practices)

## Prerequisites

Before configuring PuppetDB integration, ensure you have:

1. **PuppetDB Server**: A running PuppetDB instance (version 6.0 or later recommended)
2. **Network Access**: Padawi server can reach PuppetDB server (default port: 8081)
3. **Credentials**: Authentication token or SSL certificates for PuppetDB access
4. **Permissions**: Appropriate permissions to query PuppetDB data

### Verifying PuppetDB Availability

Test PuppetDB connectivity from the Padawi server:

```bash
# Test HTTP connection (if not using SSL)
curl http://puppetdb.example.com:8080/pdb/meta/v1/version

# Test HTTPS connection (if using SSL)
curl https://puppetdb.example.com:8081/pdb/meta/v1/version

# Expected response:
{
  "version": "7.x.x"
}
```

## Quick Start

### Minimal Configuration

The simplest PuppetDB configuration requires only the server URL:

**Using Environment Variables:**

```bash
# Enable PuppetDB integration
export PUPPETDB_ENABLED=true

# Set PuppetDB server URL
export PUPPETDB_SERVER_URL=https://puppetdb.example.com

# Optional: Set port (default: 8081 for HTTPS, 8080 for HTTP)
export PUPPETDB_PORT=8081
```

**Using Configuration File:**

Create or edit `backend/.env`:

```env
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
```

### Starting Padawi

```bash
# Restart Padawi to apply configuration
npm run dev:backend

# Or if using Docker
docker-compose restart
```

### Verifying Integration

1. Open Padawi in your browser: `http://localhost:3000`
2. Navigate to the **Home** page
3. Look for **Integration Status** section
4. Verify PuppetDB shows as "Connected"
5. Navigate to **Inventory** page
6. You should see nodes from PuppetDB with source attribution

## Configuration Options

### Core Settings

#### PUPPETDB_ENABLED

- **Type:** Boolean (`true` or `false`)
- **Default:** `false`
- **Description:** Enable or disable PuppetDB integration
- **Example:** `PUPPETDB_ENABLED=true`

#### PUPPETDB_SERVER_URL

- **Type:** String (URL)
- **Required:** Yes (when enabled)
- **Description:** Base URL of your PuppetDB server
- **Example:** `PUPPETDB_SERVER_URL=https://puppetdb.example.com`
- **Notes:**
  - Include protocol (http:// or https://)
  - Do not include port in URL (use PUPPETDB_PORT instead)
  - Do not include trailing slash

#### PUPPETDB_PORT

- **Type:** Integer
- **Default:** `8081` (HTTPS) or `8080` (HTTP)
- **Description:** Port number for PuppetDB API
- **Example:** `PUPPETDB_PORT=8081`
- **Notes:**
  - Standard PuppetDB ports: 8081 (HTTPS), 8080 (HTTP)
  - Ensure firewall allows access to this port

### Connection Settings

#### PUPPETDB_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `30000` (30 seconds)
- **Description:** Timeout for PuppetDB API requests
- **Example:** `PUPPETDB_TIMEOUT=60000`
- **Notes:**
  - Increase for slow networks or large queries
  - Minimum recommended: 10000 (10 seconds)

#### PUPPETDB_RETRY_ATTEMPTS

- **Type:** Integer
- **Default:** `3`
- **Description:** Number of retry attempts for failed requests
- **Example:** `PUPPETDB_RETRY_ATTEMPTS=5`
- **Notes:**
  - Retries use exponential backoff
  - Set to 0 to disable retries

#### PUPPETDB_RETRY_DELAY

- **Type:** Integer (milliseconds)
- **Default:** `1000` (1 second)
- **Description:** Initial delay between retry attempts
- **Example:** `PUPPETDB_RETRY_DELAY=2000`
- **Notes:**
  - Delay doubles with each retry (exponential backoff)
  - Example: 1s, 2s, 4s, 8s...

### Cache Settings

#### PUPPETDB_CACHE_TTL

- **Type:** Integer (milliseconds)
- **Default:** `300000` (5 minutes)
- **Description:** Time-to-live for cached PuppetDB data
- **Example:** `PUPPETDB_CACHE_TTL=600000` (10 minutes)
- **Notes:**
  - Reduces load on PuppetDB
  - Set to 0 to disable caching
  - Increase for static environments
  - Decrease for rapidly changing environments

### Circuit Breaker Settings

The circuit breaker prevents cascading failures by temporarily disabling PuppetDB queries after repeated failures.

#### PUPPETDB_CIRCUIT_BREAKER_THRESHOLD

- **Type:** Integer
- **Default:** `5`
- **Description:** Number of consecutive failures before opening circuit
- **Example:** `PUPPETDB_CIRCUIT_BREAKER_THRESHOLD=10`

#### PUPPETDB_CIRCUIT_BREAKER_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `60000` (1 minute)
- **Description:** How long circuit stays open after threshold reached
- **Example:** `PUPPETDB_CIRCUIT_BREAKER_TIMEOUT=120000`

#### PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `30000` (30 seconds)
- **Description:** Time to wait before attempting to close circuit
- **Example:** `PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT=60000`

## SSL/TLS Setup

PuppetDB typically uses HTTPS with SSL/TLS certificates. Padawi supports various SSL configurations.

### Option 1: System CA Certificates (Recommended)

If your PuppetDB certificate is signed by a trusted CA:

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

No additional certificate configuration needed.

### Option 2: Custom CA Certificate

If using a custom or self-signed CA:

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

**CA Certificate Path:**

- Must be absolute path or relative to Padawi working directory
- File must be readable by Padawi process
- PEM format required

**Example CA Certificate Location:**

```bash
# Puppet CA certificate (typical location)
PUPPETDB_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem

# Custom location
PUPPETDB_SSL_CA=/opt/padawi/certs/puppetdb-ca.pem
```

### Option 3: Client Certificate Authentication

If PuppetDB requires client certificates:

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_CERT=/path/to/client-cert.pem
PUPPETDB_SSL_KEY=/path/to/client-key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

**Certificate Requirements:**

- All certificates must be in PEM format
- Private key must be unencrypted (no passphrase)
- Certificates must be readable by Padawi process
- Client certificate must be signed by PuppetDB's trusted CA

**Generating Client Certificates:**

If using Puppet's CA:

```bash
# Generate certificate request
puppet certificate generate padawi.example.com

# Sign the certificate (on Puppet CA server)
puppetserver ca sign --certname padawi.example.com

# Retrieve signed certificate
puppet certificate find padawi.example.com
```

### Option 4: Disable Certificate Validation (Development Only)

**WARNING:** Only use in development/testing environments!

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_REJECT_UNAUTHORIZED=false
```

**Security Risk:** This disables certificate validation and is vulnerable to man-in-the-middle attacks. Never use in production.

### SSL Configuration Examples

**Example 1: Production with Puppet CA**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETDB_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/padawi.pem
PUPPETDB_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/padawi.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

**Example 2: Development with Self-Signed Certificate**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://localhost
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_REJECT_UNAUTHORIZED=false  # Development only!
```

**Example 3: Production with Commercial CA**

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
# No custom CA needed - uses system trust store
```

## Authentication Setup

PuppetDB supports token-based authentication for API access.

### Token Authentication

#### Obtaining a Token

**Method 1: Using Puppet Access**

```bash
# Request token (interactive)
puppet access login

# Request token (non-interactive)
puppet access login --lifetime 1y

# View current token
puppet access show
```

**Method 2: Using PuppetDB API**

```bash
# Generate token via API
curl -X POST https://puppetdb.example.com:8081/pdb/admin/v1/token \
  -H "Content-Type: application/json" \
  -d '{"user": "padawi", "lifetime": "1y"}'
```

**Method 3: Using Puppet Enterprise Console**

1. Log in to Puppet Enterprise Console
2. Navigate to **Access Control** > **Users**
3. Select or create user for Padawi
4. Generate API token
5. Copy token for configuration

#### Configuring Token

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-token-here
```

**Security Best Practices:**

- Store token in environment variable, not in code
- Use `.env` file with restricted permissions (600)
- Rotate tokens regularly (recommended: every 90 days)
- Use dedicated service account for Padawi
- Grant minimum required permissions

**Token Permissions:**

Padawi requires read-only access to:

- `/pdb/query/v4/nodes`
- `/pdb/query/v4/facts`
- `/pdb/query/v4/reports`
- `/pdb/query/v4/catalogs`
- `/pdb/query/v4/events`

### Combined SSL and Token Authentication

Most production deployments use both SSL and token authentication:

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081

# SSL Configuration
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETDB_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/padawi.pem
PUPPETDB_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/padawi.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true

# Token Authentication
PUPPETDB_TOKEN=your-token-here

# Connection Settings
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_CACHE_TTL=300000
```

## Testing the Connection

### Using Padawi UI

1. **Start Padawi:**

   ```bash
   npm run dev:backend
   ```

2. **Open Browser:**
   - Navigate to `http://localhost:3000`

3. **Check Integration Status:**
   - Go to **Home** page
   - Look for **Integration Status** section
   - PuppetDB should show:
     - Status: Connected (green)
     - Last Check: Recent timestamp
     - No error messages

4. **Test Inventory:**
   - Navigate to **Inventory** page
   - Nodes from PuppetDB should appear
   - Each node should show "PuppetDB" as source

5. **Test Node Details:**
   - Click on any PuppetDB node
   - Navigate to **Facts** tab
   - Click "Gather Facts" (should load from PuppetDB)
   - Check **Puppet Reports** tab
   - Check **Catalog** tab
   - Check **Events** tab

### Using API

Test PuppetDB integration via API:

```bash
# Check integration status
curl http://localhost:3000/api/integrations/status

# Expected response:
{
  "integrations": {
    "puppetdb": {
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}

# Get nodes from PuppetDB
curl http://localhost:3000/api/integrations/puppetdb/nodes

# Get facts for a specific node
curl http://localhost:3000/api/integrations/puppetdb/nodes/node1.example.com/facts

# Get reports for a specific node
curl http://localhost:3000/api/integrations/puppetdb/nodes/node1.example.com/reports
```

### Using Logs

Check Padawi logs for connection details:

```bash
# View logs (development)
npm run dev:backend

# View logs (Docker)
docker-compose logs -f padawi

# View logs (systemd)
sudo journalctl -u padawi -f

# Look for:
[INFO] PuppetDB integration initialized
[INFO] PuppetDB health check: connected
[INFO] Retrieved 42 nodes from PuppetDB
```

## Troubleshooting

### Connection Issues

#### Problem: "PuppetDB connection failed"

**Symptoms:**

- Integration status shows "Disconnected" or "Error"
- Error message: "Connection refused" or "Connection timeout"

**Solutions:**

1. **Verify PuppetDB is running:**

   ```bash
   # Check PuppetDB service
   sudo systemctl status puppetdb
   
   # Check PuppetDB is listening
   sudo netstat -tlnp | grep 8081
   ```

2. **Test connectivity:**

   ```bash
   # From Padawi server
   curl -v https://puppetdb.example.com:8081/pdb/meta/v1/version
   ```

3. **Check firewall:**

   ```bash
   # Ensure port 8081 is open
   sudo firewall-cmd --list-ports
   sudo ufw status
   ```

4. **Verify URL and port:**
   - Check `PUPPETDB_SERVER_URL` is correct
   - Check `PUPPETDB_PORT` matches PuppetDB configuration
   - Ensure no typos in configuration

#### Problem: "SSL certificate verification failed"

**Symptoms:**

- Error message: "unable to verify the first certificate"
- Error message: "self signed certificate in certificate chain"

**Solutions:**

1. **Provide CA certificate:**

   ```bash
   PUPPETDB_SSL_CA=/path/to/ca.pem
   ```

2. **Verify CA certificate path:**

   ```bash
   # Check file exists and is readable
   ls -la /path/to/ca.pem
   cat /path/to/ca.pem
   ```

3. **Check certificate format:**
   - Must be PEM format
   - Should start with `-----BEGIN CERTIFICATE-----`

4. **For development only:**

   ```bash
   PUPPETDB_SSL_REJECT_UNAUTHORIZED=false
   ```

#### Problem: "Authentication failed"

**Symptoms:**

- Error message: "401 Unauthorized"
- Error message: "403 Forbidden"
- Error message: "Invalid token"

**Solutions:**

1. **Verify token is correct:**

   ```bash
   # Test token directly
   curl -H "X-Authentication: $PUPPETDB_TOKEN" \
     https://puppetdb.example.com:8081/pdb/query/v4/nodes
   ```

2. **Check token expiration:**

   ```bash
   # View token details
   puppet access show
   ```

3. **Generate new token:**

   ```bash
   puppet access login --lifetime 1y
   ```

4. **Verify token permissions:**
   - Ensure user has read access to PuppetDB queries
   - Check RBAC settings in Puppet Enterprise

### Query Issues

#### Problem: "No nodes returned from PuppetDB"

**Symptoms:**

- Inventory page shows no PuppetDB nodes
- Integration status shows "Connected"

**Solutions:**

1. **Verify nodes exist in PuppetDB:**

   ```bash
   curl https://puppetdb.example.com:8081/pdb/query/v4/nodes
   ```

2. **Check PuppetDB has data:**
   - Ensure Puppet agents have checked in
   - Verify PuppetDB is receiving reports

3. **Check cache:**
   - Clear cache by restarting Padawi
   - Or set `PUPPETDB_CACHE_TTL=0` temporarily

4. **Enable debug logging:**

   ```bash
   LOG_LEVEL=debug
   ```

#### Problem: "PQL query failed"

**Symptoms:**

- Error when using PQL filters
- Error message: "Invalid query syntax"

**Solutions:**

1. **Verify PQL syntax:**

   ```bash
   # Test query directly
   curl -X POST https://puppetdb.example.com:8081/pdb/query/v4 \
     -H "Content-Type: application/json" \
     -d '{"query": "nodes { certname ~ \"web\" }"}'
   ```

2. **Check PuppetDB version:**
   - PQL syntax varies by version
   - Ensure using correct syntax for your version

3. **Review PQL documentation:**
   - [PuppetDB Query Tutorial](https://puppet.com/docs/puppetdb/latest/api/query/tutorial.html)

### Performance Issues

#### Problem: "Slow response from PuppetDB"

**Symptoms:**

- Long wait times for data to load
- Timeouts on large queries

**Solutions:**

1. **Increase timeout:**

   ```bash
   PUPPETDB_TIMEOUT=60000  # 60 seconds
   ```

2. **Enable caching:**

   ```bash
   PUPPETDB_CACHE_TTL=600000  # 10 minutes
   ```

3. **Optimize PuppetDB:**
   - Check PuppetDB performance
   - Review PuppetDB logs for slow queries
   - Consider PuppetDB tuning

4. **Use pagination:**
   - Padawi automatically paginates large result sets
   - Adjust page size if needed

#### Problem: "Circuit breaker open"

**Symptoms:**

- Error message: "Circuit breaker is open"
- PuppetDB queries failing after repeated errors

**Solutions:**

1. **Wait for circuit to reset:**
   - Circuit automatically resets after timeout
   - Default: 30 seconds

2. **Fix underlying issue:**
   - Resolve connection problems
   - Fix authentication issues
   - Address PuppetDB errors

3. **Adjust circuit breaker settings:**

   ```bash
   PUPPETDB_CIRCUIT_BREAKER_THRESHOLD=10  # More tolerant
   PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT=60000  # Longer reset time
   ```

4. **Restart Padawi:**
   - Resets circuit breaker state

### Configuration Issues

#### Problem: "Configuration not applied"

**Symptoms:**

- Changes to `.env` file not taking effect
- PuppetDB still disabled after enabling

**Solutions:**

1. **Restart Padawi:**

   ```bash
   # Development
   # Stop with Ctrl+C, then:
   npm run dev:backend
   
   # Docker
   docker-compose restart
   
   # Systemd
   sudo systemctl restart padawi
   ```

2. **Verify environment variables:**

   ```bash
   # Check variables are set
   printenv | grep PUPPETDB
   ```

3. **Check `.env` file location:**
   - Must be in `backend/` directory
   - File must be named exactly `.env`

4. **Check file permissions:**

   ```bash
   ls -la backend/.env
   # Should be readable by Padawi process
   ```

## Advanced Configuration

### Multiple PuppetDB Instances

Currently, Padawi supports one PuppetDB instance. For multiple instances, consider:

1. **PuppetDB Federation:** Configure PuppetDB instances to federate
2. **Load Balancer:** Use load balancer in front of multiple PuppetDB instances
3. **Future Enhancement:** Multi-instance support planned for future release

### Custom Query Defaults

Configure default query parameters:

```bash
# Default query limit
PUPPETDB_DEFAULT_QUERY_LIMIT=1000

# Default query timeout
PUPPETDB_DEFAULT_QUERY_TIMEOUT=30000
```

### Integration Priority

When multiple inventory sources are configured, set priority:

```bash
# Higher number = higher priority
PUPPETDB_PRIORITY=10
BOLT_PRIORITY=5
```

Nodes from higher priority sources appear first in inventory.

### Health Check Interval

Configure how often Padawi checks PuppetDB health:

```bash
# Health check interval (milliseconds)
PUPPETDB_HEALTH_CHECK_INTERVAL=60000  # 1 minute
```

## Security Best Practices

### Credential Management

1. **Use Environment Variables:**
   - Never hardcode tokens in code
   - Store in `.env` file with restricted permissions

2. **Restrict File Permissions:**

   ```bash
   chmod 600 backend/.env
   chown padawi:padawi backend/.env
   ```

3. **Rotate Tokens Regularly:**
   - Recommended: Every 90 days
   - Use short-lived tokens when possible

4. **Use Dedicated Service Account:**
   - Create dedicated user for Padawi
   - Grant minimum required permissions
   - Monitor access logs

### Network Security

1. **Use HTTPS:**
   - Always use HTTPS in production
   - Never use HTTP for sensitive data

2. **Certificate Validation:**
   - Always validate certificates in production
   - Use `PUPPETDB_SSL_REJECT_UNAUTHORIZED=true`

3. **Firewall Rules:**
   - Restrict access to PuppetDB port
   - Allow only Padawi server IP

4. **Network Segmentation:**
   - Place PuppetDB and Padawi in secure network segment
   - Use VPN or private network

### Access Control

1. **RBAC in PuppetDB:**
   - Configure role-based access control
   - Grant read-only access to Padawi
   - Restrict sensitive data access

2. **Audit Logging:**
   - Enable audit logging in PuppetDB
   - Monitor Padawi access patterns
   - Review logs regularly

3. **Principle of Least Privilege:**
   - Grant minimum required permissions
   - Regularly review and revoke unnecessary access

### Monitoring

1. **Monitor Integration Health:**
   - Set up alerts for connection failures
   - Track query performance
   - Monitor error rates

2. **Log Analysis:**
   - Regularly review Padawi logs
   - Check for authentication failures
   - Monitor for unusual query patterns

3. **Security Scanning:**
   - Scan for exposed credentials
   - Check for SSL/TLS vulnerabilities
   - Review security advisories

## Configuration Checklist

Before deploying to production:

- [ ] PuppetDB URL and port configured correctly
- [ ] SSL/TLS enabled with proper certificates
- [ ] Certificate validation enabled (`PUPPETDB_SSL_REJECT_UNAUTHORIZED=true`)
- [ ] Authentication token configured and tested
- [ ] Token has minimum required permissions
- [ ] `.env` file has restricted permissions (600)
- [ ] Connection timeout appropriate for network
- [ ] Retry and circuit breaker settings configured
- [ ] Cache TTL configured for environment
- [ ] Integration tested via UI and API
- [ ] Health check shows "Connected" status
- [ ] Nodes appear in inventory with PuppetDB source
- [ ] Facts, reports, catalogs, and events load correctly
- [ ] Error handling tested (disconnect PuppetDB temporarily)
- [ ] Logs reviewed for errors or warnings
- [ ] Monitoring and alerts configured
- [ ] Security best practices followed
- [ ] Documentation updated with environment-specific details

## Additional Resources

- [PuppetDB API Documentation](https://puppet.com/docs/puppetdb/latest/api/index.html)
- [PuppetDB Query Tutorial](https://puppet.com/docs/puppetdb/latest/api/query/tutorial.html)
- [Puppet SSL Configuration](https://puppet.com/docs/puppet/latest/ssl_certificates.html)
- [Padawi Configuration Guide](./configuration.md)
- [Padawi API Documentation](./api.md)
- [Padawi User Guide](./user-guide.md)

## Support

For PuppetDB integration issues:

1. Check this setup guide and troubleshooting section
2. Enable expert mode for detailed error information
3. Review Padawi logs with `LOG_LEVEL=debug`
4. Test PuppetDB connectivity directly
5. Consult PuppetDB documentation
6. Contact your administrator or support team
