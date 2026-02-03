# Puppetserver Plugin

Puppetserver integration for Pabawi, providing catalog compilation, environment management, and server status.

## Overview

The Puppetserver plugin connects Pabawi to Puppet Server, enabling:

- Catalog compilation for nodes
- Environment listing and management
- Server status and health monitoring
- Facts retrieval from Puppetserver

## Capabilities

| Capability | Category | Description | Risk Level |
|------------|----------|-------------|------------|
| `catalog.compile` | config | Compile a catalog for a node | read |
| `environments.list` | config | List available environments | read |
| `status.get` | info | Get server status and health | read |
| `facts.get` | info | Get facts for a node | read |

## Widgets

### Home Widget (`puppetserver:home-widget`)

Displays a summary tile showing:

- Environment count
- Catalog compilation status
- Server health

### Catalog Compilation (`puppetserver:catalog-compilation`)

Compile and view catalogs for nodes.

### Environment Info (`puppetserver:environment-info`)

Shows available Puppet environments.

### Node Status (`puppetserver:node-status`)

Displays node status from Puppetserver perspective.

## Configuration

Configure in `config/integrations.yaml`:

```yaml
integrations:
  puppetserver:
    enabled: true
    priority: 20
    config:
      serverUrl: "https://puppet.example.com:8140"
      ssl:
        enabled: true
        ca: "/path/to/ca.pem"
        cert: "/path/to/cert.pem"
        key: "/path/to/key.pem"
      timeout: 30000
```

## CLI Commands

```bash
# Compile catalog
pab puppetserver catalog node1.example.com

# List environments
pab puppetserver environments

# Get server status
pab puppetserver status
```

## Color Theme

The Puppetserver plugin uses blue (`#2E3A87`) as its primary color.
