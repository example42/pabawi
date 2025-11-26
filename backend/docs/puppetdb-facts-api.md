# PuppetDB Facts API

## Overview

The PuppetDB Facts API provides access to node facts collected by Puppet agents and stored in PuppetDB. This endpoint implements requirements 2.1-2.4 from the PuppetDB integration specification.

## Endpoint

```
GET /api/integrations/puppetdb/nodes/:certname/facts
```

## Features

- **Requirement 2.1**: Queries PuppetDB for the latest facts for a node
- **Requirement 2.2**: Returns facts in a structured, searchable format with source attribution
- **Requirement 2.3**: Organizes facts by category (system, network, hardware, custom)
- **Requirement 2.4**: Includes timestamp and source metadata

## Request

### Parameters

- `certname` (path parameter, required): The certificate name of the node

### Example

```bash
curl http://localhost:3000/api/integrations/puppetdb/nodes/node1.example.com/facts
```

## Response

### Success Response (200 OK)

```json
{
  "facts": {
    "nodeId": "node1.example.com",
    "gatheredAt": "2024-01-15T10:30:00.000Z",
    "source": "puppetdb",
    "facts": {
      "os": {
        "family": "RedHat",
        "name": "CentOS",
        "release": {
          "full": "7.9.2009",
          "major": "7"
        }
      },
      "processors": {
        "count": 4,
        "models": ["Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"]
      },
      "memory": {
        "system": {
          "total": "16.00 GiB",
          "available": "8.50 GiB"
        }
      },
      "networking": {
        "hostname": "node1",
        "interfaces": {
          "eth0": {
            "ip": "192.168.1.100",
            "mac": "00:50:56:a1:b2:c3"
          }
        }
      },
      "categories": {
        "system": {
          "os.family": "RedHat",
          "os.name": "CentOS",
          "kernel": "Linux",
          "architecture": "x86_64"
        },
        "network": {
          "networking.hostname": "node1",
          "networking.fqdn": "node1.example.com",
          "ipaddress": "192.168.1.100"
        },
        "hardware": {
          "processors.count": 4,
          "memorysize": "16.00 GiB",
          "manufacturer": "VMware, Inc."
        },
        "custom": {
          "custom_fact_1": "value1",
          "custom_fact_2": "value2"
        }
      }
    }
  },
  "source": "puppetdb"
}
```

### Error Responses

#### PuppetDB Not Configured (503 Service Unavailable)

```json
{
  "error": {
    "code": "PUPPETDB_NOT_CONFIGURED",
    "message": "PuppetDB integration is not configured"
  }
}
```

#### PuppetDB Not Initialized (503 Service Unavailable)

```json
{
  "error": {
    "code": "PUPPETDB_NOT_INITIALIZED",
    "message": "PuppetDB integration is not initialized"
  }
}
```

#### Node Not Found (404 Not Found)

```json
{
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "Node 'node1.example.com' not found in PuppetDB"
  }
}
```

#### Authentication Error (401 Unauthorized)

```json
{
  "error": {
    "code": "PUPPETDB_AUTH_ERROR",
    "message": "Authentication failed. Check your PuppetDB token."
  }
}
```

#### Connection Error (503 Service Unavailable)

```json
{
  "error": {
    "code": "PUPPETDB_CONNECTION_ERROR",
    "message": "Cannot connect to PuppetDB at https://puppetdb.example.com:8081",
    "details": {
      "error": "ECONNREFUSED"
    }
  }
}
```

## Caching

Facts are cached with a configurable TTL (default: 5 minutes) to reduce load on PuppetDB. The cache is per-node and automatically expires based on the configured TTL.

### Cache Configuration

Set the cache TTL in your configuration:

```json
{
  "integrations": {
    "puppetdb": {
      "cache": {
        "ttl": 300000
      }
    }
  }
}
```

Or via environment variable:

```bash
PUPPETDB_CACHE_TTL=300000
```

## Implementation Details

### Fact Categorization

Facts are automatically categorized based on their key names:

- **System**: OS, kernel, architecture, timezone, uptime
- **Network**: Hostname, interfaces, IP addresses, MAC addresses
- **Hardware**: Processors, memory, disks, manufacturer info
- **Custom**: All other facts not matching the above categories

### Source Attribution

All facts include source attribution to indicate they came from PuppetDB:

- `source` field at the top level of the facts object
- `source: "puppetdb"` in the response wrapper

### Timestamp

The `gatheredAt` field contains the ISO 8601 timestamp of when the facts were retrieved from PuppetDB.

## Related Endpoints

- `GET /api/integrations/puppetdb/nodes` - List all nodes
- `GET /api/integrations/puppetdb/nodes/:certname` - Get node details
- `GET /api/integrations/puppetdb/nodes/:certname/reports` - Get node reports (coming soon)
- `GET /api/integrations/puppetdb/nodes/:certname/catalog` - Get node catalog (coming soon)
- `GET /api/integrations/puppetdb/nodes/:certname/events` - Get node events (coming soon)
