# Configuration

All configuration is set via environment variables in `backend/.env`. `ConfigService` reads them at startup, validates with Zod, and rejects invalid values with a descriptive error. There are no database-stored overrides.

## Quick Start

```bash
# Minimal — Bolt only
BOLT_PROJECT_PATH=/path/to/bolt-project
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST='["uptime","df -h","free -m"]'
```

Run `scripts/setup.sh` for interactive setup that generates a complete `.env` file.

## Core Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `localhost` | Bind address (`0.0.0.0` for all interfaces) |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `DATABASE_PATH` | `./data/pabawi.db` | SQLite database file path (directory must exist and be writable) |
| `CORS_ALLOWED_ORIGINS` | _(none)_ | Comma-separated list of allowed origins (e.g. `http://localhost:5173`) |

## Bolt

| Variable | Default | Description |
|---|---|---|
| `BOLT_PROJECT_PATH` | `cwd` | Path to Bolt project directory containing `inventory.yaml` and `bolt-project.yaml` |
| `BOLT_EXECUTION_TIMEOUT` | `300000` | Max execution time per command in ms (5 min) |
| `BOLT_PACKAGE_TASKS` | _(see below)_ | JSON array of package task definitions |

**`BOLT_PACKAGE_TASKS`** — JSON array. Defaults to the built-in `package` task:

```json
[{
  "name": "package",
  "label": "Package (built-in)",
  "parameterMapping": {
    "packageName": "name",
    "ensure": "action",
    "version": "version"
  }
}]
```

## Command Whitelist

| Variable | Default | Description |
|---|---|---|
| `COMMAND_WHITELIST_ALLOW_ALL` | `false` | `true` to skip whitelist check (dev only) |
| `COMMAND_WHITELIST` | `[]` | JSON array of allowed commands |
| `COMMAND_WHITELIST_MATCH_MODE` | `exact` | `exact` (full match) or `prefix` (starts-with) |

```bash
# Example: exact match
COMMAND_WHITELIST='["uptime","df -h","free -m","systemctl status nginx"]'
COMMAND_WHITELIST_MATCH_MODE=exact

# Example: prefix match (allows "systemctl status *")
COMMAND_WHITELIST='["systemctl status","journalctl -u"]'
COMMAND_WHITELIST_MATCH_MODE=prefix
```

Never set `COMMAND_WHITELIST_ALLOW_ALL=true` in production.

## Streaming

| Variable | Default | Description |
|---|---|---|
| `STREAMING_BUFFER_MS` | `100` | Output batch interval in ms. Lower = more real-time, higher = less traffic |
| `STREAMING_MAX_OUTPUT_SIZE` | `10485760` | Max output per execution in bytes (10 MB) |
| `STREAMING_MAX_LINE_LENGTH` | `10000` | Max characters per output line before truncation |

## Caching

| Variable | Default | Description |
|---|---|---|
| `CACHE_INVENTORY_TTL` | `30000` | Inventory cache TTL in ms. `0` to disable |
| `CACHE_FACTS_TTL` | `300000` | Node facts cache TTL in ms. `0` to disable |

## Execution Queue

| Variable | Default | Description |
|---|---|---|
| `CONCURRENT_EXECUTION_LIMIT` | `5` | Max simultaneous executions. Others queue |
| `MAX_QUEUE_SIZE` | `50` | Max queued executions before rejecting |

## Provisioning Safety

| Variable | Default | Description |
|---|---|---|
| `ALLOW_DESTRUCTIVE_PROVISIONING` | `false` | Allow destroy/terminate actions across all provisioning plugins. Returns `403 DESTRUCTIVE_ACTION_DISABLED` when false |

Keep `false` in production to prevent accidental VM/instance deletion.

## UI

| Variable | Default | Description |
|---|---|---|
| `UI_SHOW_HOME_PAGE_RUN_CHART` | `true` | Show aggregated Puppet run history chart on home page. Requires PuppetDB |

## Integrations

Enable integrations by setting `<PREFIX>_ENABLED=true`. Disabled integrations are skipped at startup — no connection attempts, no health check failures.

### Ansible

| Variable | Default | Description |
|---|---|---|
| `ANSIBLE_ENABLED` | — | Set to `true` to enable |
| `ANSIBLE_PROJECT_PATH` | `cwd` | Ansible project directory |
| `ANSIBLE_INVENTORY_PATH` | `inventory/hosts` | Inventory file path relative to project |
| `ANSIBLE_EXECUTION_TIMEOUT` | `300000` | Max execution time in ms |

### PuppetDB

| Variable | Default | Description |
|---|---|---|
| `PUPPETDB_ENABLED` | — | Set to `true` to enable |
| `PUPPETDB_SERVER_URL` | **required** | PuppetDB URL (e.g. `https://puppetdb:8081`) |
| `PUPPETDB_PORT` | _(from URL)_ | Override port |
| `PUPPETDB_TOKEN` | — | Authentication token |
| `PUPPETDB_TIMEOUT` | `30000` | Request timeout in ms |
| `PUPPETDB_RETRY_ATTEMPTS` | `3` | Retry attempts on failure |
| `PUPPETDB_RETRY_DELAY` | `1000` | Delay between retries in ms |
| `PUPPETDB_CACHE_TTL` | `300000` | Response cache TTL in ms |

**SSL:**

| Variable | Default | Description |
|---|---|---|
| `PUPPETDB_SSL_ENABLED` | `true` | Enable SSL verification |
| `PUPPETDB_SSL_CA` | — | Path to CA certificate |
| `PUPPETDB_SSL_CERT` | — | Path to client certificate |
| `PUPPETDB_SSL_KEY` | — | Path to client key |
| `PUPPETDB_SSL_REJECT_UNAUTHORIZED` | `true` | Reject invalid certs. Set `false` for self-signed |

**Circuit Breaker:**

| Variable | Default | Description |
|---|---|---|
| `PUPPETDB_CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before opening circuit |
| `PUPPETDB_CIRCUIT_BREAKER_TIMEOUT` | `60000` | Time circuit stays open in ms |
| `PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT` | `30000` | Time to half-open after timeout in ms |

### Puppetserver

| Variable | Default | Description |
|---|---|---|
| `PUPPETSERVER_ENABLED` | — | Set to `true` to enable |
| `PUPPETSERVER_SERVER_URL` | **required** | Puppetserver URL (e.g. `https://puppet:8140`) |
| `PUPPETSERVER_PORT` | _(from URL)_ | Override port |
| `PUPPETSERVER_TOKEN` | — | Authentication token |
| `PUPPETSERVER_TIMEOUT` | `30000` | Request timeout in ms |
| `PUPPETSERVER_RETRY_ATTEMPTS` | `3` | Retry attempts on failure |
| `PUPPETSERVER_RETRY_DELAY` | `1000` | Delay between retries in ms |
| `PUPPETSERVER_INACTIVITY_THRESHOLD` | `3600` | Seconds without check-in before node considered inactive |
| `PUPPETSERVER_CACHE_TTL` | `300000` | Response cache TTL in ms |

**SSL** (same pattern as PuppetDB):

| Variable | Default |
|---|---|
| `PUPPETSERVER_SSL_ENABLED` | `true` |
| `PUPPETSERVER_SSL_CA` | — |
| `PUPPETSERVER_SSL_CERT` | — |
| `PUPPETSERVER_SSL_KEY` | — |
| `PUPPETSERVER_SSL_REJECT_UNAUTHORIZED` | `true` |

**Circuit Breaker:**

| Variable | Default |
|---|---|
| `PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD` | `5` |
| `PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT` | `60000` |
| `PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT` | `30000` |

### Hiera

| Variable | Default | Description |
|---|---|---|
| `HIERA_ENABLED` | — | Set to `true` to enable |
| `HIERA_CONTROL_REPO_PATH` | **required** | Path to Puppet control repo |
| `HIERA_CONFIG_PATH` | `hiera.yaml` | Hiera config file relative to control repo |
| `HIERA_ENVIRONMENTS` | `["production"]` | JSON array of environments |

**Fact sources:**

| Variable | Default | Description |
|---|---|---|
| `HIERA_FACT_SOURCE_PREFER_PUPPETDB` | `true` | Use PuppetDB for fact interpolation when available |
| `HIERA_FACT_SOURCE_LOCAL_PATH` | — | Path to local facts directory (fallback) |

**Catalog compilation:**

| Variable | Default | Description |
|---|---|---|
| `HIERA_CATALOG_COMPILATION_ENABLED` | `false` | Enable catalog compilation |
| `HIERA_CATALOG_COMPILATION_TIMEOUT` | `60000` | Compilation timeout in ms |
| `HIERA_CATALOG_COMPILATION_CACHE_TTL` | `300000` | Catalog cache TTL in ms |

**Cache:**

| Variable | Default | Description |
|---|---|---|
| `HIERA_CACHE_ENABLED` | `true` | Enable Hiera data cache |
| `HIERA_CACHE_TTL` | `300000` | Cache TTL in ms |
| `HIERA_CACHE_MAX_ENTRIES` | `10000` | Max cache entries |

**Code analysis:**

| Variable | Default | Description |
|---|---|---|
| `HIERA_CODE_ANALYSIS_ENABLED` | `true` | Enable Puppet code analysis |
| `HIERA_CODE_ANALYSIS_LINT_ENABLED` | `true` | Run puppet-lint |
| `HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK` | `true` | Check for module updates |
| `HIERA_CODE_ANALYSIS_INTERVAL` | `3600000` | Analysis interval in ms (1 hour) |
| `HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS` | `[]` | JSON array of glob patterns to exclude |

### Proxmox

| Variable | Default | Description |
|---|---|---|
| `PROXMOX_ENABLED` | — | Set to `true` to enable |
| `PROXMOX_HOST` | **required** | Proxmox VE host (without scheme, e.g. `pve.example.com`) |
| `PROXMOX_PORT` | `8006` | API port |
| `PROXMOX_USERNAME` | — | Username (e.g. `root@pam`) |
| `PROXMOX_PASSWORD` | — | Password (use token auth in production) |
| `PROXMOX_REALM` | — | Auth realm override |
| `PROXMOX_TOKEN` | — | API token (`USER@REALM!TOKENID=UUID`) |
| `PROXMOX_TIMEOUT` | `30000` | Request timeout in ms |
| `PROXMOX_PRIORITY` | `7` | Data source priority |

**SSL:**

| Variable | Default | Description |
|---|---|---|
| `PROXMOX_SSL_REJECT_UNAUTHORIZED` | `true` | Reject invalid certs. Set `false` for self-signed |
| `PROXMOX_SSL_CA` | — | Path to CA certificate |
| `PROXMOX_SSL_CERT` | — | Path to client certificate |
| `PROXMOX_SSL_KEY` | — | Path to client key |

### AWS

| Variable | Default | Description |
|---|---|---|
| `AWS_ENABLED` | — | Set to `true` to enable |
| `AWS_ACCESS_KEY_ID` | — | Access key (or use instance role) |
| `AWS_SECRET_ACCESS_KEY` | — | Secret key |
| `AWS_DEFAULT_REGION` | `us-east-1` | Default region |
| `AWS_REGIONS` | — | JSON array or comma-separated list of regions to query |
| `AWS_SESSION_TOKEN` | — | Session token for temporary credentials |
| `AWS_PROFILE` | — | AWS CLI profile name |
| `AWS_ENDPOINT` | — | Override endpoint URL (for LocalStack etc.) |

## Example `.env` Files

### Development

```bash
PORT=3000
HOST=localhost
LOG_LEVEL=debug
BOLT_PROJECT_PATH=./bolt-project
DATABASE_PATH=./data/pabawi.db
BOLT_EXECUTION_TIMEOUT=600000
COMMAND_WHITELIST_ALLOW_ALL=true
CACHE_INVENTORY_TTL=0
CACHE_FACTS_TTL=0
CONCURRENT_EXECUTION_LIMIT=2
ALLOW_DESTRUCTIVE_PROVISIONING=true
```

### Production (Bolt + PuppetDB + Puppetserver)

```bash
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=warn
BOLT_PROJECT_PATH=/opt/pabawi/bolt-project
DATABASE_PATH=/opt/pabawi/data/pabawi.db
BOLT_EXECUTION_TIMEOUT=300000
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST='["uptime","df -h","free -m","systemctl status"]'
COMMAND_WHITELIST_MATCH_MODE=exact
CACHE_INVENTORY_TTL=60000
CACHE_FACTS_TTL=300000
CONCURRENT_EXECUTION_LIMIT=10
MAX_QUEUE_SIZE=100
ALLOW_DESTRUCTIVE_PROVISIONING=false

PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com:8081
PUPPETDB_SSL_CA=/opt/pabawi/certs/ca.pem
PUPPETDB_SSL_CERT=/opt/pabawi/certs/client.crt
PUPPETDB_SSL_KEY=/opt/pabawi/certs/client.key

PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com:8140
PUPPETSERVER_TOKEN=your-token-here
```

## SSH Integration

SSH is configured per-node in the Bolt inventory file, not via env vars. See [integrations/ssh.md](./integrations/ssh.md).

## Validation Errors

If any variable fails Zod validation, the server exits immediately with:

```
Configuration validation failed: <field>: <reason>
```

Check the exact variable name — there are no fallbacks for required fields.
