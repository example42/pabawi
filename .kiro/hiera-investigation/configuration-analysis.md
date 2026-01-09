# Hiera Configuration Investigation: "Not Found" Keys Issue

## Executive Summary

The "Not Found" error for all keys on node `puppet.office.lab42` indicates a **configuration or data discovery problem** rather than a code issue. The Hiera integration is fully implemented but requires proper setup.

## Root Cause Analysis

### Primary Issues

1. **Missing or Misconfigured `hiera.yaml`**
   - The Hiera integration requires a valid `hiera.yaml` file in the control repository
   - Default path: `{controlRepoPath}/hiera.yaml`
   - Can be overridden via `HIERA_CONFIG_PATH` environment variable

2. **Hieradata Directory Not Found**
   - The scanner cannot locate the hieradata directory
   - Default path: `{controlRepoPath}/data`
   - Can be configured in `hiera.yaml` via `defaults.datadir`
   - Multiple datadirs can be specified in hierarchy levels

3. **Node Facts Not Available**
   - Hiera resolution requires node facts for hierarchy interpolation
   - Facts are sourced from:
     - PuppetDB (preferred, if `HIERA_FACT_SOURCE_PREFER_PUPPETDB=true`)
     - Local fact files (fallback)
   - Without facts, hierarchy paths cannot be interpolated

4. **Hierarchy Path Interpolation Failure**
   - Hiera uses `%{facts.xxx}` and `%{::xxx}` syntax for dynamic paths
   - If facts are missing or facts don't match expected keys, paths won't resolve
   - Example: `path: "nodes/%{facts.fqdn}.yaml"` requires `fqdn` fact

## Configuration Requirements

### 1. Environment Variables (Backend)

```bash
# Required
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/path/to/control-repo

# Optional (with defaults)
HIERA_CONFIG_PATH=hiera.yaml
HIERA_ENVIRONMENTS=["production","development"]

# Fact source configuration
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true
HIERA_FACT_SOURCE_LOCAL_PATH=/path/to/facts

# Cache configuration
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000
HIERA_CACHE_MAX_ENTRIES=10000

# Code analysis configuration
HIERA_CODE_ANALYSIS_ENABLED=true
HIERA_CODE_ANALYSIS_LINT_ENABLED=true
```

### 2. Directory Structure

```
control-repo/
├── hiera.yaml                 # Required: Hiera 5 configuration
├── data/                      # Default hieradata directory
│   ├── common.yaml           # Common data (no hierarchy)
│   ├── nodes/
│   │   ├── puppet.office.lab42.yaml
│   │   └── other-node.yaml
│   ├── os/
│   │   ├── RedHat.yaml
│   │   └── Debian.yaml
│   └── environment/
│       ├── production.yaml
│       └── development.yaml
├── manifests/
│   └── site.pp
└── modules/
    └── ...
```

### 3. Hiera.yaml Structure (Hiera 5 Format)

```yaml
---
version: 5

defaults:
  datadir: data
  data_hash: yaml_data

hierarchy:
  - name: "Node-specific data"
    path: "nodes/%{facts.fqdn}.yaml"
  
  - name: "OS-specific data"
    path: "os/%{facts.os.family}.yaml"
  
  - name: "Environment data"
    path: "environment/%{::environment}.yaml"
  
  - name: "Common data"
    path: "common.yaml"
```

## Key Resolution Flow

### 1. Configuration Parsing
```
HieraService.initialize()
  ↓
HieraParser.parse(hiera.yaml)
  ↓
Extract hierarchy levels and datadirs
```

### 2. Data Discovery
```
HieraScanner.scan()
  ↓
Recursively scan hieradata directories
  ↓
Extract all keys from YAML/JSON files
  ↓
Build HieraKeyIndex (Map<keyName, HieraKey>)
```

### 3. Key Resolution
```
HieraService.resolveKey(nodeId, key)
  ↓
FactService.getFacts(nodeId)
  ↓
For each hierarchy level:
  - Interpolate path with facts
  - Load data file
  - Extract key value
  ↓
Apply lookup method (first, unique, hash, deep)
  ↓
Return HieraResolution
```

## Diagnostic Steps

### Step 1: Verify Configuration
```bash
# Check if Hiera is enabled
curl http://localhost:3000/api/integrations/hiera/status

# Expected response:
{
  "enabled": true,
  "configured": true,
  "healthy": true,
  "controlRepoPath": "/path/to/control-repo",
  "keyCount": 42,
  "fileCount": 8
}
```

### Step 2: Check Key Discovery
```bash
# Get all discovered keys
curl http://localhost:3000/api/integrations/hiera/keys

# If empty, the scanner didn't find any keys
# Possible causes:
# - hieradata directory doesn't exist
# - No YAML/JSON files in hieradata
# - Wrong datadir path in hiera.yaml
```

### Step 3: Verify Node Facts
```bash
# Check if facts are available for the node
curl http://localhost:3000/api/integrations/puppetdb/nodes/puppet.office.lab42/facts

# If empty or error, facts are not available
# Possible causes:
# - Node not in PuppetDB
# - PuppetDB integration not configured
# - Local fact files not found
```

### Step 4: Test Key Resolution
```bash
# Try to resolve a specific key
curl http://localhost:3000/api/integrations/hiera/nodes/puppet.office.lab42/keys/common::setting

# Response will show:
# - found: true/false
# - resolvedValue: the value or null
# - sourceFile: which file provided the value
# - hierarchyLevel: which hierarchy level matched
# - allValues: values from all levels
# - interpolatedVariables: variables used in path interpolation
```

## Common Issues and Solutions

### Issue 1: "Hiera integration is not configured"
**Cause:** `HIERA_CONTROL_REPO_PATH` not set or invalid

**Solution:**
```bash
# Set the environment variable
export HIERA_CONTROL_REPO_PATH=/path/to/control-repo

# Verify the path exists
ls -la /path/to/control-repo/hiera.yaml
```

### Issue 2: "Key count: 0" in status
**Cause:** Hieradata directory not found or empty

**Solution:**
```bash
# Check if data directory exists
ls -la /path/to/control-repo/data/

# Check if hiera.yaml specifies correct datadir
grep -A 5 "defaults:" /path/to/control-repo/hiera.yaml

# Verify YAML files exist
find /path/to/control-repo/data -name "*.yaml" -o -name "*.yml"
```

### Issue 3: "found: false" for all keys
**Cause:** Facts not available or hierarchy paths not interpolating correctly

**Solution:**
```bash
# Check if node has facts in PuppetDB
curl https://puppetdb.example.com:8081/pdb/query/v4/nodes/puppet.office.lab42

# Check if local facts file exists
ls -la /path/to/facts/puppet.office.lab42.json

# Verify hierarchy paths in hiera.yaml use correct fact names
# Example: %{facts.fqdn} requires 'fqdn' fact to exist
```

### Issue 4: "Hiera integration is not initialized"
**Cause:** Initialization failed, check server logs

**Solution:**
```bash
# Check server logs for errors
tail -f /var/log/application.log | grep -i hiera

# Common errors:
# - "hiera.yaml not found"
# - "Invalid YAML syntax"
# - "Datadir does not exist"
# - "Failed to parse hierarchy"
```

## File Locations and Responsibilities

### Configuration Files
- **`backend/src/config/schema.ts`** (lines 220-250)
  - Defines HieraConfig schema with all configuration options
  - Validates environment variables

- **`backend/.env.example`** (lines 85-100)
  - Example environment variable configuration
  - Documents all Hiera-related settings

### Implementation Files
- **`backend/src/integrations/hiera/HieraParser.ts`**
  - Parses `hiera.yaml` in Hiera 5 format
  - Extracts hierarchy levels and datadirs
  - Validates configuration

- **`backend/src/integrations/hiera/HieraScanner.ts`**
  - Recursively scans hieradata directories
  - Builds key index from YAML/JSON files
  - Watches for file changes

- **`backend/src/integrations/hiera/HieraResolver.ts`**
  - Resolves keys using hierarchy and facts
  - Interpolates paths with variables
  - Applies lookup methods

- **`backend/src/integrations/hiera/HieraService.ts`**
  - Orchestrates parser, scanner, resolver
  - Implements caching
  - Manages initialization

- **`backend/src/integrations/hiera/FactService.ts`**
  - Retrieves node facts from PuppetDB or local files
  - Implements fact source priority

### API Routes
- **`backend/src/routes/hiera.ts`**
  - `GET /api/integrations/hiera/status` - Check integration status
  - `GET /api/integrations/hiera/keys` - List all discovered keys
  - `GET /api/integrations/hiera/nodes/:nodeId/keys/:key` - Resolve specific key
  - `POST /api/integrations/hiera/reload` - Reload control repository

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ HieraService.initialize()                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. HieraParser.parse(hiera.yaml)                           │
│     ↓                                                        │
│     Extract hierarchy levels and datadirs                   │
│                                                              │
│  2. HieraScanner.scan() / scanMultipleDatadirs()            │
│     ↓                                                        │
│     Recursively scan all hieradata directories              │
│     ↓                                                        │
│     Extract keys from YAML/JSON files                       │
│     ↓                                                        │
│     Build HieraKeyIndex                                     │
│                                                              │
│  3. scanner.watchForChanges()                               │
│     ↓                                                        │
│     Invalidate cache on file changes                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ HieraService.resolveKey(nodeId, key)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Check resolution cache                                  │
│     ↓                                                        │
│  2. FactService.getFacts(nodeId)                            │
│     ├─ Try PuppetDB (if enabled)                            │
│     └─ Fall back to local facts                             │
│     ↓                                                        │
│  3. HieraResolver.resolve(key, facts, config)               │
│     ├─ For each hierarchy level:                            │
│     │  ├─ Interpolate path with facts                       │
│     │  ├─ Load data file                                    │
│     │  └─ Extract key value                                 │
│     ├─ Apply lookup method                                  │
│     └─ Return HieraResolution                               │
│     ↓                                                        │
│  4. Cache result                                            │
│     ↓                                                        │
│  5. Return HieraResolution                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Testing the Setup

### 1. Create Test Hiera Configuration
```yaml
# /path/to/control-repo/hiera.yaml
---
version: 5

defaults:
  datadir: data
  data_hash: yaml_data

hierarchy:
  - name: "Common data"
    path: "common.yaml"
```

### 2. Create Test Data File
```yaml
# /path/to/control-repo/data/common.yaml
---
common::setting: "test_value"
common::port: 8080
```

### 3. Set Environment Variables
```bash
export HIERA_ENABLED=true
export HIERA_CONTROL_REPO_PATH=/path/to/control-repo
```

### 4. Restart Application and Test
```bash
# Check status
curl http://localhost:3000/api/integrations/hiera/status

# Should show keyCount: 2

# Resolve key
curl http://localhost:3000/api/integrations/hiera/nodes/puppet.office.lab42/keys/common::setting

# Should return: "test_value"
```

## Next Steps

1. **Verify Control Repository Path**
   - Ensure `HIERA_CONTROL_REPO_PATH` points to valid control repo
   - Verify `hiera.yaml` exists and is valid YAML

2. **Check Hieradata Directory**
   - Verify `data/` directory exists (or custom datadir from hiera.yaml)
   - Ensure YAML/JSON files exist in hieradata

3. **Verify Node Facts**
   - Check if node `puppet.office.lab42` exists in PuppetDB
   - Verify facts are available for the node
   - Check if hierarchy paths can be interpolated with available facts

4. **Enable Debug Logging**
   - Set `LOG_LEVEL=debug` to see detailed resolution steps
   - Check logs for interpolation failures or missing files

5. **Test with Simple Hierarchy**
   - Start with a single `common.yaml` file
   - Add hierarchy levels incrementally
   - Test each level independently
