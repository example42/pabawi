# Hiera Integration

Pabawi reads your Puppet control repository to browse Hiera data, resolve node-specific values, search keys, and run code analysis.

## Prerequisites

- A Puppet control repository on disk, reachable from the Pabawi host (local path or mounted volume)
- `hiera.yaml` (or `hiera.yaml.v5`) in the repository root
- Read-only access from the Pabawi process to the control repo

## Configuration

```bash
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/opt/control-repo   # required
HIERA_CONFIG_PATH=hiera.yaml                # relative to control repo root
HIERA_ENVIRONMENTS='["production","staging"]'  # JSON array
```

**Fact sources** — Hiera needs node facts to resolve hierarchy interpolations:

```bash
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true   # use PuppetDB facts when available (recommended)
HIERA_FACT_SOURCE_LOCAL_PATH=/opt/facts  # fallback: dir of per-node JSON files (node1.json, etc.)
```

**Caching:**

```bash
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000       # 5 min default
HIERA_CACHE_MAX_ENTRIES=10000
```

**Code analysis:**

```bash
HIERA_CODE_ANALYSIS_ENABLED=true
HIERA_CODE_ANALYSIS_LINT_ENABLED=true
HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK=true
HIERA_CODE_ANALYSIS_INTERVAL=3600000    # 1 hour default
HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS='["spec/fixtures","vendor/"]'
```

**Catalog compilation** (advanced — requires Puppet CLI on the host):

```bash
HIERA_CATALOG_COMPILATION_ENABLED=true
HIERA_CATALOG_COMPILATION_TIMEOUT=60000
```

See [configuration.md](../configuration.md) for all Hiera env vars.

## What It Provides

| Feature | Description |
|---|---|
| **Hierarchy browser** | Visualize `hiera.yaml` structure and layer ordering |
| **Node lookup** | Simulate `puppet lookup` for a node — see effective values per key |
| **Key search** | Find keys across all data files |
| **Cross-node view** | See a key's value on every node at once |
| **Code analysis** | Detect unused keys, lint issues, and module update opportunities |
| **Catalog compilation** | Compile a catalog for a node in context (requires Puppet CLI) |

## Troubleshooting

| Problem | Fix |
|---|---|
| "Hiera configuration file not found" | Verify `HIERA_CONTROL_REPO_PATH` and `HIERA_CONFIG_PATH`. File must exist at `<repo>/<config_path>`. |
| "Resolution error: missing facts" | Enable PuppetDB integration and `HIERA_FACT_SOURCE_PREFER_PUPPETDB=true`. Or add per-node JSON fact files in `HIERA_FACT_SOURCE_LOCAL_PATH`. |
| Slow key lookups | Reduce `HIERA_CACHE_TTL` to let the cache warm up faster, or increase `HIERA_CACHE_MAX_ENTRIES`. |
| Analysis times out on large repos | Add exclusion patterns: `HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS='["vendor/","spec/"]'` |
| "No environments shown" | Set `HIERA_ENVIRONMENTS` to a JSON array of environment names. |
