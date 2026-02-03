# Hiera Integration Setup Guide

## Overview

Pabawi integrates with [Hiera](https://puppet.com/docs/puppet/latest/hiera_intro.html) to provide visibility into your infrastructure's configuration data. This integration allows you to browse hierarchy levels, view effective configuration for specific nodes, and analyze Hiera data directly from the UI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Features](#features)
- [Caching & Performance](#caching--performance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- A valid [Control Repository](https://puppet.com/docs/pe/latest/control_repo.html) containing a `hiera.yaml` file.
- Read access to the control repository from the Pabawi server.
- (Optional) Access to PuppetDB for accurate fact-based hierarchy resolution.

## Configuration

Add the following environment variables to your `.env` file or deployment configuration.

### Basic Setup

```bash
# Enable the integration
HIERA_ENABLED=true

# Path to your control repository (root directory containing hiera.yaml)
HIERA_CONTROL_REPO_PATH=/path/to/control-repo

# Name of the config file (defaults to hiera.yaml)
HIERA_CONFIG_PATH=hiera.yaml
```

### Hierarchy & Facts

To correctly resolve Hiera data for a node, Pabawi needs facts (e.g., `os.family`, `environment`, `hostname`).

```bash
# Prefer facts from PuppetDB if available (Recommended)
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true

# Fallback: Path to local JSON files containing facts (e.g., node1.json)
HIERA_FACT_SOURCE_LOCAL_PATH=/path/to/facts_dir
```

### Environment Support

Specify which Puppet environments are available for browsing.

```bash
# JSON array of environment names
HIERA_ENVIRONMENTS='["production", "staging", "development"]'
```

### Advanced Analysis

Pabawi can perform static analysis on your Hiera data to find missing keys, duplicates, or syntax errors.

```bash
# Enable code analysis features
HIERA_CODE_ANALYSIS_ENABLED=true

# Enable linting of YAML files
HIERA_CODE_ANALYSIS_LINT_ENABLED=true

# Check for module updates
HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK=true

# Analysis interval in hours (default: 24)
HIERA_CODE_ANALYSIS_INTERVAL=24
```

## Features

Once configured, the Hiera integration enables:

1. **Hierarchy Browser:** Visualize your `hiera.yaml` structure and see how layers are ordered.
2. **Node Lookup:** Simulate a `puppet lookup` for a specific node to see effective values.
3. **Key Search:** Search for specific configuration keys across all data files.
4. **Static Analysis:** Identify potentially broken references or missing variables in your hierarchy.

## Caching & Performance

Resolving Hiera lookups can be resource-intensive. Pabawi includes caching mechanisms to improve UI responsiveness.

```bash
# Enable caching of lookup results
HIERA_CACHE_ENABLED=true

# Cache Time-To-Live in milliseconds (default: 5 minutes)
HIERA_CACHE_TTL=300000

# Maximum number of cached entries
HIERA_CACHE_MAX_ENTRIES=1000
```

### Catalog Compilation

For deep debugging, Pabawi can trigger catalog compilations to verify Hiera data in context.

```bash
# Enable catalog compilation features
HIERA_CATALOG_COMPILATION_ENABLED=true

# Compilation timeout in milliseconds
HIERA_CATALOG_COMPILATION_TIMEOUT=60000
```

## Troubleshooting

### Common Issues

**"Hiera configuration file not found"**

- Verify `HIERA_CONTROL_REPO_PATH` points to the root of your repo.
- Ensure `HIERA_CONFIG_PATH` matches your filename (usually `hiera.yaml` or `hiera.yaml.v5`).

**"Resolution Error: Missing facts"**

- Hiera relies on facts (like `os.family`) to select the correct data files.
- Ensure PuppetDB integration is active (`HIERA_FACT_SOURCE_PREFER_PUPPETDB=true`) OR provide local fact files.

**"Analysis Error"**

- Large repositories may time out during analysis.
- Check backend logs for specific parsing errors in your YAML files.
- You can exclude specific paths from analysis:

  ```bash
  HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS='["spec/fixtures", "vendor/"]'
  ```

### Verification

Check the backend logs for initialization messages:

```
[INFO] Hiera integration initialized
[INFO] Loaded Hiera config from /path/to/control-repo/hiera.yaml
```
