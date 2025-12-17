# Pabawi Error Codes Reference

Version: 0.3.0

## Overview

This document provides a comprehensive reference of all error codes used in the Pabawi API, including their HTTP status codes, descriptions, and common causes.

## Error Response Format

All API errors follow this consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context (optional)"
  }
}
```

### Expert Mode Error Response

When expert mode is enabled (via `X-Expert-Mode: true` header or `expertMode: true` in request body), errors include additional diagnostic information:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context",
    "stackTrace": "Error: ...\n    at ...",
    "requestId": "req-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "executionContext": {
      "endpoint": "/api/...",
      "method": "GET"
    }
  }
}
```

## General Error Codes

### Client Errors (4xx)

| Code | HTTP Status | Description | Common Causes |
|------|-------------|-------------|---------------|
| `INVALID_REQUEST` | 400 | Request validation failed | Missing required fields, invalid JSON, malformed parameters |
| `COMMAND_NOT_ALLOWED` | 403 | Command not in whitelist | Command not configured in whitelist, whitelist mode enabled |
| `INVALID_NODE_ID` | 404 | Node not found in inventory | Node doesn't exist, typo in node ID |
| `INVALID_TASK_NAME` | 404 | Task does not exist | Task not installed, typo in task name |
| `EXECUTION_NOT_FOUND` | 404 | Execution not found | Invalid execution ID, execution expired |
| `BOLT_CONFIG_MISSING` | 404 | Bolt configuration files not found | Bolt project not initialized, incorrect path |
| `INVALID_TASK` | 400 | Task not configured | Package installation task not configured |

### Server Errors (5xx)

| Code | HTTP Status | Description | Common Causes |
|------|-------------|-------------|---------------|
| `NODE_UNREACHABLE` | 503 | Cannot connect to node | Node offline, network issues, SSH/WinRM misconfigured |
| `BOLT_EXECUTION_FAILED` | 500 | Bolt CLI returned error | Command failed on target, Bolt error |
| `BOLT_TIMEOUT` | 500 | Execution exceeded timeout | Long-running command, timeout too short |
| `BOLT_PARSE_ERROR` | 500 | Cannot parse Bolt output | Unexpected Bolt output format, Bolt version mismatch |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | Unhandled exception, system error |

## PuppetDB Error Codes

| Code | HTTP Status | Description | Common Causes |
|------|-------------|-------------|---------------|
| `PUPPETDB_NOT_CONFIGURED` | 503 | PuppetDB integration not configured | Missing configuration, integration disabled |
| `PUPPETDB_NOT_INITIALIZED` | 503 | PuppetDB integration not initialized | Initialization failed, service not started |
| `PUPPETDB_CONNECTION_ERROR` | 503 | Cannot connect to PuppetDB | PuppetDB offline, network issues, incorrect URL |
| `PUPPETDB_AUTH_ERROR` | 401 | Authentication failed | Invalid token (PE only), expired certificate, missing credentials |
| `PUPPETDB_QUERY_ERROR` | 400 | Invalid PQL query syntax | Malformed PQL query, unsupported query features |
| `PUPPETDB_TIMEOUT` | 504 | PuppetDB request timeout | Query too complex, PuppetDB overloaded, timeout too short |
| `NODE_NOT_FOUND` | 404 | Node not found in PuppetDB | Node never reported, deactivated node, typo in certname |
| `REPORT_NOT_FOUND` | 404 | Report not found | Invalid report hash, report expired/archived |
| `CATALOG_NOT_FOUND` | 404 | Catalog not found | Node never compiled catalog, catalog expired |

## Puppetserver Error Codes

| Code | HTTP Status | Description | Common Causes |
|------|-------------|-------------|---------------|
| `PUPPETSERVER_NOT_CONFIGURED` | 503 | Puppetserver integration not configured | Missing configuration, integration disabled |
| `PUPPETSERVER_NOT_INITIALIZED` | 503 | Puppetserver integration not initialized | Initialization failed, service not started |
| `PUPPETSERVER_CONNECTION_ERROR` | 503 | Cannot connect to Puppetserver | Puppetserver offline, network issues, incorrect URL |
| `PUPPETSERVER_AUTH_ERROR` | 401 | Authentication failed | Invalid certificate, certificate not whitelisted in auth.conf |
| `PUPPETSERVER_TIMEOUT` | 504 | Puppetserver request timeout | Catalog compilation slow, Puppetserver overloaded |
| `CERTIFICATE_NOT_FOUND` | 404 | Certificate not found | Invalid certname, certificate never requested |
| `CERTIFICATE_OPERATION_ERROR` | 500 | Certificate operation failed | Cannot sign/revoke certificate, CA error |
| `CATALOG_COMPILATION_ERROR` | 500 | Catalog compilation failed | Puppet code error, missing facts, environment issues |
| `ENVIRONMENT_NOT_FOUND` | 404 | Environment not found | Environment doesn't exist, not deployed |
| `ENVIRONMENT_DEPLOYMENT_ERROR` | 500 | Environment deployment failed | Code-manager error, r10k error, git issues |

## Integration Error Codes

| Code | HTTP Status | Description | Common Causes |
|------|-------------|-------------|---------------|
| `INTEGRATION_NOT_CONFIGURED` | 503 | Integration not configured | Missing configuration, integration disabled |
| `INTEGRATION_NOT_INITIALIZED` | 503 | Integration not initialized | Initialization failed, service not started |
| `CONNECTION_ERROR` | 503 | Cannot connect to integration | Service offline, network issues, incorrect URL |
| `AUTH_ERROR` | 401 | Authentication failed | Invalid credentials, expired token/certificate (tokens only available in PE) |
| `TIMEOUT` | 504 | Request timeout | Service slow, timeout too short |

## Error Handling Best Practices

### For API Consumers

1. **Always check the error code** - Don't rely solely on HTTP status codes
2. **Handle specific errors** - Implement specific handling for common errors
3. **Use expert mode for debugging** - Enable expert mode to get detailed error information
4. **Implement retry logic** - Retry transient errors (503, 504) with exponential backoff
5. **Log errors** - Log error codes and details for troubleshooting

### Example Error Handling (JavaScript)

```javascript
try {
  const response = await fetch('/api/integrations/puppetdb/nodes/web-01/facts');
  const data = await response.json();
  
  if (!response.ok) {
    const error = data.error;
    
    switch (error.code) {
      case 'PUPPETDB_NOT_CONFIGURED':
        console.error('PuppetDB is not configured');
        // Show configuration instructions
        break;
        
      case 'PUPPETDB_CONNECTION_ERROR':
        console.error('Cannot connect to PuppetDB');
        // Retry with exponential backoff
        break;
        
      case 'NODE_NOT_FOUND':
        console.error('Node not found');
        // Show "node not found" message
        break;
        
      case 'PUPPETDB_AUTH_ERROR':
        console.error('Authentication failed');
        // Show authentication error, check credentials
        break;
        
      default:
        console.error('Unexpected error:', error.message);
        // Show generic error message
    }
  }
} catch (err) {
  console.error('Network error:', err);
  // Handle network errors
}
```

## Troubleshooting Guide

### PuppetDB Connection Errors

**Error:** `PUPPETDB_CONNECTION_ERROR`

**Troubleshooting Steps:**

1. Verify PuppetDB is running: `systemctl status puppetdb`
2. Check PuppetDB URL in configuration
3. Verify network connectivity: `curl https://puppetdb.example.com:8081/pdb/meta/v1/version`
4. Check firewall rules
5. Verify SSL certificates if using HTTPS

### Puppetserver Authentication Errors

**Error:** `PUPPETSERVER_AUTH_ERROR`

**Troubleshooting Steps:**

1. Verify certificate is signed by Puppetserver CA
2. Check certificate is whitelisted in Puppetserver's `auth.conf`
3. Verify certificate paths in configuration
4. Check certificate expiration: `openssl x509 -in cert.pem -noout -dates`
5. Verify Puppetserver is configured to accept certificate authentication

### Catalog Compilation Errors

**Error:** `CATALOG_COMPILATION_ERROR`

**Troubleshooting Steps:**

1. Check Puppet code syntax
2. Verify all required facts are available
3. Check environment exists and is deployed
4. Review Puppetserver logs: `/var/log/puppetlabs/puppetserver/puppetserver.log`
5. Test compilation manually: `puppet catalog compile <certname> --environment <env>`

### Node Not Found Errors

**Error:** `NODE_NOT_FOUND`

**Troubleshooting Steps:**

1. Verify node has reported to PuppetDB
2. Check node is not deactivated: `puppet node deactivate <certname> --status`
3. Verify certname spelling
4. Check PuppetDB query: `curl 'https://puppetdb:8081/pdb/query/v4/nodes/<certname>'`

## Related Documentation

- [API Documentation](./api.md)
- [Integrations API Documentation](./integrations-api.md)
- [Configuration Guide](./configuration.md)
- [Troubleshooting Guide](./troubleshooting.md)
