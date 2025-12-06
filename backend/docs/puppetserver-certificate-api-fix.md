# Puppetserver Certificate API Fix

## Issue Summary

The Puppetserver certificate API was not working due to incorrect configuration. This document explains the issues found and the fixes applied.

## Issues Found

### 1. Incorrect Port Configuration

**Problem**: The `.env` file had `PUPPETSERVER_PORT=8081`, which is the PuppetDB port, not the Puppetserver port.

**Symptoms**:

- API requests to `/puppet-ca/v1/certificate_statuses` returned 404 Not Found
- No certificates were displayed in the UI

**Fix**: Changed `PUPPETSERVER_PORT` from `8081` to `8140` (the standard Puppetserver port)

### 2. SSL Configuration Disabled

**Problem**: `PUPPETSERVER_SSL_ENABLED=false` meant that certificate-based authentication was not being used.

**Symptoms**:

- Even with the correct port, requests returned 403 Forbidden
- The error message was: "Forbidden request: /puppet-ca/v1/certificate_statuses (method :get)"

**Fix**: Changed `PUPPETSERVER_SSL_ENABLED` to `true` to enable certificate-based authentication

### 3. SSL Certificate Verification Too Strict

**Problem**: `PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true` was causing issues with self-signed certificates.

**Fix**: Changed to `false` for development/testing environments with self-signed certificates

## Correct Configuration

```bash
# Puppetserver Integration Configuration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.office.lab42
PUPPETSERVER_PORT=8140                    # ← Changed from 8081
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000
PUPPETSERVER_TOKEN=your_puppetserver_token_here

# PUPPETSERVER SSL Configuration
PUPPETSERVER_SSL_ENABLED=true             # ← Changed from false
PUPPETSERVER_SSL_CA=/Users/al/Documents/lab42-bolt/ca.pem
PUPPETSERVER_SSL_CERT=/Users/al/Documents/lab42-bolt/pabawi-cert.pem
PUPPETSERVER_SSL_KEY=/Users/al/Documents/lab42-bolt/pabawi-key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false # ← Changed from true
```

## API Endpoint Verification

The correct API endpoint for certificate statuses is:

```
GET https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses
```

Optional query parameters:

- `state=signed` - Filter for signed certificates
- `state=requested` - Filter for certificate requests
- `state=revoked` - Filter for revoked certificates

## Authentication

Puppetserver's certificate API requires **certificate-based authentication**, not token authentication. The client certificate must be:

1. Signed by the Puppetserver CA
2. Whitelisted in Puppetserver's `auth.conf` file

### Puppetserver Authorization Configuration

If you still get 403 Forbidden errors after fixing the port and SSL configuration, you may need to update Puppetserver's `auth.conf` file to allow your certificate to access the CA endpoints.

Example `auth.conf` entry:

```hocon
authorization: {
    version: 1
    rules: [
        {
            match-request: {
                path: "^/puppet-ca/v1/certificate_statuses"
                type: path
                method: [get, post, put, delete]
            }
            allow: ["pabawi"]  # Add your certificate name here
            sort-order: 200
            name: "pabawi certificate access"
        }
    ]
}
```

## Enhanced Logging

The following logging enhancements were added to help debug certificate API issues:

### PuppetserverClient.getCertificates()

- Logs when the method is called with parameters
- Logs the endpoint, base URL, and authentication status
- Logs the response type and sample data
- Logs detailed error information on failure

### PuppetserverClient.request()

- Logs all HTTP requests with method, URL, and authentication status
- Logs request headers (without sensitive data)
- Logs response status, headers, and data summary
- Logs detailed error information with categorization

### Example Log Output

```
[Puppetserver] getCertificates() called {
  state: undefined,
  endpoint: '/puppet-ca/v1/certificate_statuses',
  baseUrl: 'https://puppet.office.lab42:8140',
  hasToken: true,
  hasCertAuth: true
}

[Puppetserver] GET https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses {
  method: 'GET',
  url: 'https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses',
  hasBody: false,
  hasToken: true,
  hasCertAuth: true,
  timeout: 30000
}

[Puppetserver] Request headers for GET https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  hasAuthToken: true,
  authTokenLength: 44
}

[Puppetserver] Response GET https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses {
  status: 200,
  statusText: 'OK',
  ok: true,
  headers: { contentType: 'application/json', contentLength: '1234' }
}

[Puppetserver] Successfully parsed response for GET https://puppet.office.lab42:8140/puppet-ca/v1/certificate_statuses {
  dataType: 'array',
  arrayLength: 5
}

[Puppetserver] getCertificates() response received {
  state: undefined,
  resultType: 'array',
  resultLength: 5,
  sampleData: '{"certname":"node1.example.com","status":"signed",...'
}
```

## Testing

To test the certificate API:

```bash
cd backend
npx tsx test-certificate-api.ts
```

To test multiple endpoints:

```bash
cd backend
npx tsx test-endpoints.ts
```

## Next Steps

1. ✅ Fixed port configuration (8081 → 8140)
2. ✅ Enabled SSL certificate authentication
3. ✅ Added comprehensive logging
4. ⏳ Verify certificate has proper permissions in Puppetserver's auth.conf
5. ⏳ Test with actual Puppetserver instance
6. ⏳ Verify UI displays certificates correctly

## Related Requirements

This fix addresses the following requirements from the spec:

- **Requirement 2.1**: WHEN the system queries Puppetserver certificates endpoint THEN it SHALL use the correct API path and authentication
- **Requirement 2.2**: WHEN Puppetserver returns certificate data THEN the system SHALL correctly parse and transform the response
- **Requirement 2.4**: WHEN the certificates page loads THEN it SHALL display all certificates without errors
- **Requirement 2.5**: WHEN Puppetserver connection fails THEN the system SHALL display an error message and continue to show data from other available sources
