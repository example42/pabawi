# Puppetserver Integration Setup

This guide will help you configure the Puppetserver integration in Pabawi to manage certificates, compile catalogs, and monitor node status.

## Prerequisites

- A running Puppetserver instance (version 6.x or 7.x)
- Network access to the Puppetserver API (default port 8140)
- Authentication credentials (either token or SSL certificates)

## Configuration Options

Add the following environment variables to your `backend/.env` file:

### Basic Configuration

```bash
# Enable Puppetserver integration
PUPPETSERVER_ENABLED=true

# Puppetserver URL (required)
PUPPETSERVER_SERVER_URL=https://puppet.example.com

# Puppetserver port (optional, defaults to 8140)
PUPPETSERVER_PORT=8140
```

### Authentication

Choose one of the following authentication methods:

#### Option 1: Token Authentication (Recommended)

```bash
# API token for authentication
PUPPETSERVER_TOKEN=your-api-token-here
```

To generate a token:

```bash
puppet access login --lifetime 1y
puppet access show
```

#### Option 2: SSL Certificate Authentication

```bash
# Enable SSL
PUPPETSERVER_SSL_ENABLED=true

# Path to SSL certificate files
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem

# Verify SSL certificates (default: true)
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true
```

### Advanced Configuration

```bash
# Request timeout in milliseconds (default: 30000)
PUPPETSERVER_TIMEOUT=30000

# Retry configuration
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000

# Node inactivity threshold in seconds (default: 3600 = 1 hour)
PUPPETSERVER_INACTIVITY_THRESHOLD=3600

# Cache TTL in milliseconds (default: 300000 = 5 minutes)
PUPPETSERVER_CACHE_TTL=300000

# Circuit breaker configuration
PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT=30000
```

## Complete Example Configuration

### Example 1: Token Authentication

```bash
# Puppetserver Integration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9...
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
PUPPETSERVER_CACHE_TTL=300000
```

### Example 2: SSL Certificate Authentication

```bash
# Puppetserver Integration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETSERVER_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/admin.pem
PUPPETSERVER_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/admin.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true
PUPPETSERVER_TIMEOUT=30000
```

## Verification

After configuring the integration:

1. **Restart the backend server**:

   ```bash
   cd backend
   npm run dev
   ```

2. **Check integration status**:
   - Navigate to the Integrations page in the UI
   - Look for "Puppetserver" in the list
   - Status should show "healthy" with a green indicator

3. **Test the connection**:

   ```bash
   curl http://localhost:3000/api/integrations/puppetserver/health
   ```

   Expected response:

   ```json
   {
     "name": "puppetserver",
     "type": "information",
     "status": "healthy",
     "message": "Puppetserver is reachable",
     "lastCheck": "2024-12-05T10:30:00.000Z"
   }
   ```

## Features Available

Once configured, you can:

### Certificate Management

- View all certificates (signed, requested, revoked)
- Sign certificate requests
- Revoke certificates
- Bulk operations on multiple certificates

### Node Monitoring

- View node inventory from Puppetserver CA
- Check node status and last check-in time
- Identify inactive nodes
- View node facts

### Catalog Operations

- Compile catalogs for specific environments
- Compare catalogs between environments
- View catalog resources and dependencies
- Debug catalog compilation errors

### Environment Management

- List available environments
- View environment details
- Deploy code to environments

## Troubleshooting

### Connection Errors

**Error**: "Puppetserver client not initialized"

- **Solution**: Ensure `PUPPETSERVER_ENABLED=true` and `PUPPETSERVER_SERVER_URL` is set

**Error**: "Failed to connect to Puppetserver"

- **Solution**: Verify network connectivity and firewall rules
- Test connection: `curl -k https://puppet.example.com:8140/status/v1/simple`

### Authentication Errors

**Error**: "Authentication failed"

- **Solution**: Verify token is valid or SSL certificates are correct
- For token auth: Run `puppet access show` to verify token
- For SSL auth: Check certificate paths and permissions

**Error**: "SSL certificate verification failed"

- **Solution**: Set `PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false` for self-signed certificates
- Or add CA certificate to trusted store

### Performance Issues

**Slow response times**

- **Solution**: Increase `PUPPETSERVER_TIMEOUT` value
- Adjust `PUPPETSERVER_CACHE_TTL` to cache results longer
- Check Puppetserver performance and resource usage

**Too many requests**

- **Solution**: Increase `PUPPETSERVER_CACHE_TTL` to reduce API calls
- Adjust circuit breaker thresholds

## Security Best Practices

1. **Use token authentication** when possible (easier to rotate)
2. **Store credentials securely** - never commit `.env` files
3. **Use SSL/TLS** for all connections
4. **Rotate tokens regularly** (set appropriate lifetime)
5. **Limit token permissions** to only required operations
6. **Enable certificate verification** in production (`PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true`)
7. **Use firewall rules** to restrict access to Puppetserver API

## API Endpoints

The integration exposes these endpoints:

- `GET /api/integrations/puppetserver/health` - Health check
- `GET /api/integrations/puppetserver/certificates` - List certificates
- `GET /api/integrations/puppetserver/certificates/:certname` - Get certificate
- `POST /api/integrations/puppetserver/certificates/:certname/sign` - Sign certificate
- `DELETE /api/integrations/puppetserver/certificates/:certname` - Revoke certificate
- `GET /api/integrations/puppetserver/nodes/:certname/status` - Node status
- `GET /api/integrations/puppetserver/nodes/:certname/catalog` - Compile catalog
- `GET /api/integrations/puppetserver/environments` - List environments

## Support

For issues or questions:

- Check the backend logs for detailed error messages
- Review Puppetserver logs at `/var/log/puppetlabs/puppetserver/`
- Verify API access with `curl` commands
- Consult Puppetserver documentation: <https://puppet.com/docs/puppetserver/>

## Next Steps

After setup:

1. Navigate to the **Certificates** page to manage node certificates
2. Use the **Inventory** page to view nodes from Puppetserver
3. Explore **Node Details** to view status, facts, and catalogs
4. Set up **Environment Deployments** for code management
