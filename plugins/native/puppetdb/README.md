# PuppetDB Plugin

PuppetDB integration for Pabawi, providing access to node inventory, facts, reports, and events.

## Overview

The PuppetDB plugin connects Pabawi to PuppetDB, enabling:

- Node inventory from PuppetDB
- Facts querying and exploration
- Puppet run reports and history
- Resource events and changes
- Catalog inspection
- PQL query execution

## Capabilities

| Capability | Category | Description | Risk Level |
|------------|----------|-------------|------------|
| `nodes.list` | inventory | List all nodes from PuppetDB | read |
| `facts.query` | info | Query facts for nodes | read |
| `reports.list` | info | List Puppet reports | read |
| `reports.get` | info | Get a specific report | read |
| `events.list` | info | List Puppet run events | read |
| `catalog.get` | info | Get compiled catalog | read |
| `query.pql` | info | Execute PQL queries | read |

## Widgets

### Home Widget (`puppetdb:home-widget`)

Displays a summary tile showing:

- Total node count
- Recent reports summary
- Failed runs count

### Facts Explorer (`puppetdb:facts-explorer`)

Interactive facts browser for exploring node facts.

### Reports Viewer (`puppetdb:reports-viewer`)

Displays Puppet run reports with status and changes.

### Events Viewer (`puppetdb:events-viewer`)

Shows resource events from Puppet runs.

### Catalog Viewer (`puppetdb:catalog-viewer`)

Visualizes the compiled Puppet catalog for a node.

## Configuration

Configure in `config/integrations.yaml`:

```yaml
integrations:
  puppetdb:
    enabled: true
    priority: 10
    config:
      serverUrl: "https://puppetdb.example.com:8081"
      ssl:
        enabled: true
        ca: "/path/to/ca.pem"
        cert: "/path/to/cert.pem"
        key: "/path/to/key.pem"
      timeout: 30000
      cache:
        enabled: true
        ttl: 300
```

## CLI Commands

```bash
# List nodes
pab puppetdb nodes

# Query facts
pab puppetdb facts node1.example.com

# List reports
pab puppetdb reports node1.example.com

# Execute PQL query
pab puppetdb query 'nodes { certname ~ "web" }'
```

## Color Theme

The PuppetDB plugin uses violet (`#9063CD`) as its primary color.
