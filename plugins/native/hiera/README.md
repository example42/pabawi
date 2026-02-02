# Hiera Plugin

Hiera integration for Pabawi, providing key lookup, hierarchy visualization, and data analysis.

## Overview

The Hiera plugin enables Pabawi to work with Puppet Hiera data, providing:

- Key lookup with hierarchy resolution
- Key listing and search
- Hierarchy visualization
- Data file scanning and indexing
- Node-specific data retrieval
- Data analysis and recommendations

## Capabilities

| Capability | Category | Description | Risk Level |
|------------|----------|-------------|------------|
| `lookup.key` | config | Look up a Hiera key value | read |
| `keys.list` | config | List all Hiera keys | read |
| `hierarchy.get` | config | Get hierarchy configuration | read |
| `scan.run` | config | Scan and index data files | read |
| `node.data` | info | Get data for a specific node | read |
| `analysis.run` | info | Analyze data for issues | read |

## Widgets

### Home Widget (`hiera:home-widget`)

Displays a summary tile showing:

- Total keys indexed
- Hierarchy levels
- Last scan timestamp

### Key Lookup (`hiera:key-lookup`)

Interactive key lookup with hierarchy resolution.

### Hierarchy Viewer (`hiera:hierarchy-viewer`)

Visualizes the Hiera hierarchy configuration.

### Node Hiera Data (`hiera:node-data`)

Shows all Hiera data applicable to a specific node.

## Configuration

Configure in `config/integrations.yaml`:

```yaml
integrations:
  hiera:
    enabled: true
    priority: 6
    config:
      controlRepoPath: "/path/to/control-repo"
      hieraConfigPath: "hiera.yaml"
      environments:
        - production
        - staging
        - development
      cache:
        enabled: true
        ttl: 300
```

## CLI Commands

```bash
# Look up a key
pab hiera lookup profile::base::ntp_servers

# List all keys
pab hiera keys

# Show hierarchy
pab hiera hierarchy

# Scan data files
pab hiera scan

# Get node data
pab hiera node node1.example.com

# Analyze data
pab hiera analyze
```

## Color Theme

The Hiera plugin uses red (`#C1272D`) as its primary color.
