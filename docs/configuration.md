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
| `PABAWI_CRASH_DUMP_DIR` | `<cwd>/crash-dumps` | Directory where JSON crash dumps and Node diagnostic reports are written on unhandled exceptions. Created automatically with mode `0700`. Must be writable by the process user. |
| `CORS_ALLOWED_ORIGINS` | _(none)_ | Comma-separated list of allowed origins (e.g. `http://localhost:5173`) |

## Database

Pabawi runs on SQLite by default and supports PostgreSQL as an alternative
backend. The same schema and code path serve both — application SQL is written
with `?` placeholders and translated to PostgreSQL's `$n` form at query time.

| Variable | Default | Description |
|---|---|---|
| `DB_TYPE` | `sqlite` | Database backend: `sqlite` or `postgres` |
| `DATABASE_PATH` | `./data/pabawi.db` | SQLite database file path, used when `DB_TYPE=sqlite` (directory must exist and be writable) |
| `DATABASE_URL` | _(none)_ | PostgreSQL connection URL, **required** when `DB_TYPE=postgres` (e.g. `postgres://user:pass@host:5432/pabawi`) |

Invalid combinations are rejected at startup: `DB_TYPE=postgres` without a
`DATABASE_URL` fails fast with a descriptive error.

### Using PostgreSQL

Point `DATABASE_URL` at any reachable PostgreSQL instance. Migrations run
automatically on startup against whichever backend is configured.

`docker-compose.yml` ships a profile-gated `postgres` service for convenience:

```bash
docker compose --profile postgres up
```

Its credentials are read from these variables (compose-only, with the defaults
shown):

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `pabawi` | PostgreSQL role for the compose service |
| `POSTGRES_PASSWORD` | `pabawi` | Password for that role |
| `POSTGRES_DB` | `pabawi` | Database name created on first start |
| `POSTGRES_PORT` | `5432` | Host port mapped to the container |

To make the app use that service, set in `.env`:

```bash
DB_TYPE=postgres
DATABASE_URL=postgres://pabawi:pabawi@postgres:5432/pabawi
```

## Authentication & Secrets

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | **required** | Secret key for JWT token signing. Must be ≥ 32 chars of random entropy and not a placeholder (e.g. `your-secure-random-secret-here`, `change-me`). Generate with `openssl rand -base64 32`. The server refuses to start otherwise. Tokens are issued/verified with `iss=pabawi` / `aud=pabawi`. |
| `PABAWI_LIFECYCLE_TOKEN` | _(empty)_ | Bearer token required for inventory lifecycle endpoints (`POST /api/nodes/:id/action`, `DELETE /api/inventory/:id`). When unset, those endpoints return 500 (`LIFECYCLE_AUTH_MISCONFIGURED`). |

### Azure Entra ID SSO

Optional federated authentication via OpenID Connect. When enabled, the login page shows "Sign in with Microsoft" alongside local login. See [integrations/entra-id.md](./integrations/entra-id.md) for Azure portal setup.

| Variable | Default | Description |
|---|---|---|
| `ENTRA_ID_ENABLED` | `false` | Set to `"true"` to enable Entra ID SSO. All other `ENTRA_ID_*` vars are ignored unless this is `"true"`. |
| `ENTRA_ID_TENANT_ID` | **required** | Azure tenant (directory) ID |
| `ENTRA_ID_CLIENT_ID` | **required** | Application (client) ID from the app registration |
| `ENTRA_ID_CLIENT_SECRET` | **required** | Client secret value |
| `ENTRA_ID_REDIRECT_URI` | **required** | OAuth callback URL (must match Azure app registration). Format: `https://your-host/api/auth/entra-id/callback` |
| `ENTRA_ID_SCOPES` | `openid,profile,email` | Comma-separated OAuth scopes. Empty entries are discarded. |
| `ENTRA_ID_GROUP_MAPPING` | _(none)_ | JSON object mapping Azure group IDs to Pabawi role names. Example: `{"uuid-1":"administrator","uuid-2":"operator"}` |
| `ENTRA_ID_POST_LOGOUT_REDIRECT_URI` | _(app base URL)_ | Where Microsoft redirects after SSO logout |
| `ENTRA_ID_JWKS_CACHE_TTL_MS` | `86400000` | How long to cache JWKS signing keys (ms). Default: 24 hours. |

When `ENTRA_ID_ENABLED=true`, all four required variables must be set or the server refuses to start with a validation error listing the missing ones.

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

### Checkmk

| Variable | Default | Description |
|---|---|---|
| `CHECKMK_ENABLED` | — | Set to `true` to enable |
| `CHECKMK_SERVER_URL` | **required** | Checkmk server URL (e.g. `https://checkmk.example.com`) |
| `CHECKMK_SITE` | **required** | Checkmk site name |
| `CHECKMK_USERNAME` | **required** | Automation user name |
| `CHECKMK_PASSWORD` | **required** | Automation user secret |
| `CHECKMK_SSL_VERIFY` | `true` | Set to `"false"` to skip TLS certificate verification |

All data is fetched live (no caching). The plugin provides host inventory (priority 8), live service monitoring status, and state-change events. See [integrations/checkmk.md](./integrations/checkmk.md) for details.

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

## MCP Server

| Variable | Default | Description |
|---|---|---|
| `MCP_ENABLED` | `false` | Set to `true` to enable the embedded MCP server at `/mcp` |
| `MCP_AUTH_TOKEN` | _(none)_ | Static bearer token for MCP client authentication. Generate with `openssl rand -hex 32`. When set, MCP clients can authenticate with this token instead of a JWT. Scoped to `/mcp` only. |

When enabled, Pabawi exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `POST /mcp` using Streamable HTTP transport. This allows AI assistants (Claude, Cursor, etc.) to query infrastructure data through 8 read-only tools:

| Tool | Description |
|---|---|
| `inventory_list` | Aggregated node inventory from all integrations |
| `facts_get` | Node facts by certname |
| `reports_query` | Puppet reports with filtering |
| `catalogs_get` | Puppet catalogs by certname |
| `hiera_lookup` | Hiera key resolution |
| `executions_list` | Execution history |
| `integrations_list` | Integration health status |
| `journal_query` | Journal entries with filtering |

A dedicated `mcp-service` user is auto-provisioned at startup with an `MCP Service` role containing all read permissions. All tool calls are gated by the existing RBAC permission system.

## Validation Errors

If any variable fails Zod validation, the server exits immediately with:

```
Configuration validation failed: <field>: <reason>
```

Check the exact variable name — there are no fallbacks for required fields.
