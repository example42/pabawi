# Pabawi Integrations API Documentation

Version: 0.5.0

## Overview

This document describes the API endpoints for all Pabawi integrations including Bolt, PuppetDB, and Puppetserver. These integrations provide a unified interface for infrastructure management across multiple tools.

## Table of Contents

- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Integration Status](#integration-status)
- [Bolt Integration](#bolt-integration)
- [PuppetDB Integration](#puppetdb-integration)
- [Puppetserver Integration](#puppetserver-integration)

## Authentication

### Token-Based Authentication

**Note: Token-based authentication is only available with Puppet Enterprise. Open Source Puppet and OpenVox installations must use certificate-based authentication.**

Some integrations (PuppetDB, Puppetserver) support token-based authentication when using Puppet Enterprise:

```http
X-Authentication-Token: your-token-here
```

### Certificate-Based Authentication

Puppetserver requires certificate-based authentication for CA operations. Configure certificates in your environment:

```bash
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem
```

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional context (optional)"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTEGRATION_NOT_CONFIGURED` | 503 | Integration not configured |
| `INTEGRATION_NOT_INITIALIZED` | 503 | Integration not initialized |
| `CONNECTION_ERROR` | 503 | Cannot connect to integration |
| `AUTH_ERROR` | 401 | Authentication failed |
| `TIMEOUT` | 504 | Request timeout |
| `INVALID_REQUEST` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Resource not found |

## Integration Status

### Get All Integration Status

Retrieve connection status for all configured integrations.

**Request:**

```http
GET /api/integrations/status
```

**Query Parameters:**

- `refresh` (boolean, optional): Force fresh health check instead of using cache

**Response:**

```json
{
  "integrations": {
    "bolt": {
      "name": "Bolt",
      "type": "both",
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "puppetdb": {
      "name": "PuppetDB",
      "type": "information",
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "puppetserver": {
      "name": "Puppetserver",
      "type": "information",
      "status": "connected",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Status Values:**

- `connected`: Integration is healthy and responding
- `disconnected`: Integration is configured but not responding
- `error`: Integration encountered an error

## Bolt Integration

Bolt is accessed through the main API endpoints (inventory, commands, tasks, etc.). See the main [API documentation](./api.md) for details.

## PuppetDB Integration

### Inventory

#### List All Nodes from PuppetDB

**Request:**

```http
GET /api/integrations/puppetdb/nodes
```

**Query Parameters:**

- `query` (string, optional): PQL query to filter nodes
- `limit` (integer, optional): Maximum nodes to return (default: 1000)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**

```json
{
  "nodes": [
    {
      "id": "web-01.example.com",
      "name": "web-01.example.com",
      "certname": "web-01.example.com",
      "uri": "ssh://web-01.example.com",
      "transport": "ssh",
      "source": "puppetdb",
      "catalog_timestamp": "2024-01-15T10:00:00.000Z",
      "facts_timestamp": "2024-01-15T10:00:00.000Z",
      "report_timestamp": "2024-01-15T10:00:00.000Z"
    }
  ],
  "total": 42,
  "source": "puppetdb"
}
```

#### Get Node Details

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname
```

**Response:**

```json
{
  "node": {
    "certname": "web-01.example.com",
    "catalog_timestamp": "2024-01-15T10:00:00.000Z",
    "facts_timestamp": "2024-01-15T10:00:00.000Z",
    "report_timestamp": "2024-01-15T10:00:00.000Z",
    "catalog_environment": "production",
    "latest_report_status": "changed"
  }
}
```

### Facts

#### Get Node Facts

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/facts
```

**Response:**

```json
{
  "certname": "web-01.example.com",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "source": "puppetdb",
  "facts": {
    "os": {
      "family": "RedHat",
      "name": "CentOS"
    },
    "processors": {
      "count": 4
    }
  }
}
```

### Reports

#### Get Reports Summary

**Request:**

```http
GET /api/integrations/puppetdb/reports/summary
```

**Response:**

```json
{
  "summary": {
    "total": 150,
    "failed": 5,
    "changed": 45,
    "unchanged": 95,
    "noop": 5
  }
}
```

#### Get All Reports

**Request:**

```http
GET /api/integrations/puppetdb/reports
```

**Query Parameters:**

- `limit` (integer, optional): Maximum reports (default: 50)
- `offset` (integer, optional): Pagination offset (default: 0)

#### Get Node Reports

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/reports
```

**Query Parameters:**

- `limit` (integer, optional): Maximum reports (default: 10)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**

```json
{
  "certname": "web-01.example.com",
  "reports": [
    {
      "hash": "abc123",
      "certname": "web-01.example.com",
      "start_time": "2024-01-15T10:00:00.000Z",
      "end_time": "2024-01-15T10:01:30.000Z",
      "environment": "production",
      "status": "changed",
      "metrics": {
        "resources": {
          "total": 47,
          "changed": 5,
          "failed": 0
        }
      }
    }
  ]
}
```

#### Get Report Details

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/reports/:hash
```

### Catalogs

#### Get Node Catalog

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/catalog
```

**Query Parameters:**

- `resourceType` (string, optional): Filter by resource type

**Response:**

```json
{
  "certname": "web-01.example.com",
  "version": "1642248000",
  "environment": "production",
  "resources": [
    {
      "type": "File",
      "title": "/etc/nginx/nginx.conf",
      "parameters": {
        "ensure": "file",
        "owner": "root"
      }
    }
  ]
}
```

#### Get Node Resources

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/resources
```

**Query Parameters:**

- `resourceType` (string, optional): Filter by resource type

**Response:**

```json
{
  "certname": "web-01.example.com",
  "resources": {
    "File": [
      {
        "type": "File",
        "title": "/etc/nginx/nginx.conf",
        "parameters": {
          "ensure": "file"
        }
      }
    ],
    "Service": [
      {
        "type": "Service",
        "title": "nginx",
        "parameters": {
          "ensure": "running"
        }
      }
    ]
  }
}
```

### Events

#### Get Node Events

**Request:**

```http
GET /api/integrations/puppetdb/nodes/:certname/events
```

**Query Parameters:**

- `status` (string, optional): Filter by status (success, failure, noop, skipped)
- `resource_type` (string, optional): Filter by resource type
- `start_time` (string, optional): Filter after timestamp (ISO 8601)
- `end_time` (string, optional): Filter before timestamp (ISO 8601)
- `limit` (integer, optional): Maximum events (default: 100)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**

```json
{
  "certname": "web-01.example.com",
  "events": [
    {
      "timestamp": "2024-01-15T10:01:15.000Z",
      "resource_type": "File",
      "resource_title": "/etc/nginx/nginx.conf",
      "property": "content",
      "status": "success",
      "message": "content changed"
    }
  ],
  "total": 250
}
```

### Admin

#### Get Archive Info

**Request:**

```http
GET /api/integrations/puppetdb/admin/archive
```

**Response:**

```json
{
  "archive": {
    "enabled": true,
    "path": "/opt/puppetlabs/server/data/puppetdb/archive"
  }
}
```

#### Get Summary Stats

**Request:**

```http
GET /api/integrations/puppetdb/admin/summary-stats
```

**Response:**

```json
{
  "stats": {
    "nodes": 42,
    "resources": 1250,
    "avg_resources_per_node": 29.76
  }
}
```

## Puppetserver Integration

### Certificates

#### List All Certificates

**Request:**

```http
GET /api/integrations/puppetserver/certificates
```

**Query Parameters:**

- `status` (string, optional): Filter by status (signed, requested, revoked)

**Response:**

```json
{
  "certificates": [
    {
      "certname": "web-01.example.com",
      "status": "signed",
      "fingerprint": "AA:BB:CC:DD...",
      "dns_alt_names": ["web-01", "web-01.example.com"],
      "not_before": "2024-01-01T00:00:00.000Z",
      "not_after": "2029-01-01T00:00:00.000Z"
    }
  ],
  "total": 42,
  "source": "puppetserver"
}
```

**Authentication:** Requires certificate-based authentication

**API Endpoint:** `/puppet-ca/v1/certificate_statuses`

#### Get Certificate Details

**Request:**

```http
GET /api/integrations/puppetserver/certificates/:certname
```

**Response:**

```json
{
  "certificate": {
    "certname": "web-01.example.com",
    "status": "signed",
    "fingerprint": "AA:BB:CC:DD...",
    "dns_alt_names": ["web-01", "web-01.example.com"],
    "not_before": "2024-01-01T00:00:00.000Z",
    "not_after": "2029-01-01T00:00:00.000Z"
  }
}
```

#### Sign Certificate

**Request:**

```http
POST /api/integrations/puppetserver/certificates/:certname/sign
```

**Response:**

```json
{
  "success": true,
  "message": "Certificate signed successfully",
  "certname": "web-01.example.com"
}
```

**API Endpoint:** `/puppet-ca/v1/certificate_status/:certname`

#### Revoke Certificate

**Request:**

```http
DELETE /api/integrations/puppetserver/certificates/:certname
```

**Response:**

```json
{
  "success": true,
  "message": "Certificate revoked successfully",
  "certname": "web-01.example.com"
}
```

#### Bulk Sign Certificates

**Request:**

```http
POST /api/integrations/puppetserver/certificates/bulk-sign
```

**Request Body:**

```json
{
  "certnames": ["web-01.example.com", "web-02.example.com"]
}
```

**Response:**

```json
{
  "successful": ["web-01.example.com", "web-02.example.com"],
  "failed": [],
  "total": 2,
  "successCount": 2,
  "failureCount": 0
}
```

#### Bulk Revoke Certificates

**Request:**

```http
POST /api/integrations/puppetserver/certificates/bulk-revoke
```

**Request Body:**

```json
{
  "certnames": ["web-01.example.com", "web-02.example.com"]
}
```

### Nodes

#### List All Nodes from Puppetserver

**Request:**

```http
GET /api/integrations/puppetserver/nodes
```

**Response:**

```json
{
  "nodes": [
    {
      "id": "web-01.example.com",
      "name": "web-01.example.com",
      "certname": "web-01.example.com",
      "uri": "ssh://web-01.example.com",
      "transport": "ssh",
      "source": "puppetserver",
      "certificateStatus": "signed"
    }
  ],
  "total": 42,
  "source": "puppetserver"
}
```

#### Get Node Details

**Request:**

```http
GET /api/integrations/puppetserver/nodes/:certname
```

#### Get Node Status

**Request:**

```http
GET /api/integrations/puppetserver/nodes/:certname/status
```

**Response:**

```json
{
  "certname": "web-01.example.com",
  "latest_report_hash": "abc123",
  "latest_report_status": "changed",
  "catalog_timestamp": "2024-01-15T10:00:00.000Z",
  "facts_timestamp": "2024-01-15T10:00:00.000Z",
  "report_timestamp": "2024-01-15T10:00:00.000Z",
  "catalog_environment": "production"
}
```

**API Endpoint:** `/puppet/v3/status/:certname`

#### Get Node Facts

**Request:**

```http
GET /api/integrations/puppetserver/nodes/:certname/facts
```

**Response:**

```json
{
  "certname": "web-01.example.com",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "source": "puppetserver",
  "facts": {
    "os": {
      "family": "RedHat"
    }
  }
}
```

**API Endpoint:** `/puppet/v3/facts/:certname`

### Catalogs

#### Compile Catalog

**Request:**

```http
GET /api/integrations/puppetserver/catalog/:certname/:environment
```

**Response:**

```json
{
  "certname": "web-01.example.com",
  "environment": "production",
  "version": "1642248000",
  "resources": [
    {
      "type": "File",
      "title": "/etc/nginx/nginx.conf",
      "parameters": {
        "ensure": "file"
      }
    }
  ]
}
```

**API Endpoint:** `/puppet/v3/catalog/:certname?environment=:environment`

#### Compare Catalogs

**Request:**

```http
POST /api/integrations/puppetserver/catalog/compare
```

**Request Body:**

```json
{
  "certname": "web-01.example.com",
  "environment1": "production",
  "environment2": "staging"
}
```

**Response:**

```json
{
  "certname": "web-01.example.com",
  "environment1": "production",
  "environment2": "staging",
  "added": [],
  "removed": [],
  "modified": [
    {
      "type": "File",
      "title": "/etc/nginx/nginx.conf",
      "parameterChanges": [
        {
          "parameter": "content",
          "oldValue": "...",
          "newValue": "..."
        }
      ]
    }
  ]
}
```

### Environments

#### List Environments

**Request:**

```http
GET /api/integrations/puppetserver/environments
```

**Response:**

```json
{
  "environments": [
    {
      "name": "production",
      "last_deployed": "2024-01-15T10:00:00.000Z"
    },
    {
      "name": "staging",
      "last_deployed": "2024-01-14T15:00:00.000Z"
    }
  ],
  "total": 2
}
```

**API Endpoint:** `/puppet/v3/environments`

#### Get Environment Details

**Request:**

```http
GET /api/integrations/puppetserver/environments/:name
```

#### Deploy Environment

**Request:**

```http
POST /api/integrations/puppetserver/environments/:name/deploy
```

**Response:**

```json
{
  "environment": "production",
  "status": "success",
  "message": "Environment deployed successfully",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### Status and Metrics

#### Get Services Status

**Request:**

```http
GET /api/integrations/puppetserver/status/services
```

**Response:**

```json
{
  "services": [
    {
      "name": "jruby-metrics",
      "state": "running",
      "status": "Running"
    },
    {
      "name": "ca",
      "state": "running",
      "status": "Running"
    }
  ]
}
```

**API Endpoint:** `/status/v1/services`

#### Get Simple Status

**Request:**

```http
GET /api/integrations/puppetserver/status/simple
```

**Response:**

```json
{
  "state": "running",
  "status": "running"
}
```

**API Endpoint:** `/status/v1/simple`

#### Get Admin API Info

**Request:**

```http
GET /api/integrations/puppetserver/admin-api
```

**Response:**

```json
{
  "info": {
    "version": "1.0",
    "endpoints": [...]
  }
}
```

**API Endpoint:** `/puppet-admin-api/v1`

#### Get Metrics

**Request:**

```http
GET /api/integrations/puppetserver/metrics
```

**Response:**

```json
{
  "metrics": {
    "jvm": {
      "memory": {
        "heap": {
          "used": 512000000,
          "max": 2048000000
        }
      }
    }
  }
}
```

**API Endpoint:** `/metrics/v2` (via Jolokia)

**Warning:** This endpoint can be resource-intensive. Use sparingly.

## Configuration

### Environment Variables

#### PuppetDB Configuration

```bash
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-token-here
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_CERT=/path/to/cert.pem
PUPPETDB_SSL_KEY=/path/to/key.pem
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_CACHE_TTL=300000
```

#### Puppetserver Configuration

```bash
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppetserver.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=your-token-here
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
```

## Caching

Integration data is cached to improve performance:

- **PuppetDB Inventory**: 5 minutes
- **PuppetDB Facts**: 5 minutes
- **PuppetDB Reports**: 1 minute
- **PuppetDB Catalogs**: 5 minutes
- **Puppetserver Certificates**: 5 minutes
- **Puppetserver Node Status**: 5 minutes

To bypass cache, include header:

```http
X-Cache-Control: no-cache
```

## Rate Limiting

Rate limits vary by integration and endpoint type. Check response headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248060
```

## Related Documentation

- [Main API Documentation](./api.md)
- [PuppetDB Integration Setup](./integrations/puppetdb.md)
- [Puppetserver Setup](./uppetserver-integration-setup.md)
- [Configuration Guide](./configuration.md)
