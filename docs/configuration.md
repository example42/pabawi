# Configuration

Integration and server configuration is read from the process environment at
startup. Source development loads `backend/.env` when started in `backend/`;
containers receive environment variables from their deployment. `ConfigService`
validates with Zod; SSH has its own configuration parser. Authentication policy
such as self-registration and default roles is stored in the database.

The variable tables below are checked against both parsers by
`node --test scripts/documentation/contracts.test.mjs`. Defaults apply when unset;
examples may deliberately override them. Integration sections apply only when
that integration is enabled. Durations state their units; counts are unitless.
Credential values belong in restricted environment files or Secrets. Private-key
paths are not credentials themselves, but their target files require protection.
This inventory covers Pabawi's configuration parsers, not every environment
variable recognized by Node, cloud SDK credential chains or deployment tools.

## Quick Start

```bash
# Bolt settings, added to an environment with JWT_SECRET and bootstrap ownership configured
BOLT_PROJECT_PATH=/path/to/bolt-project
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST='["uptime","df -h","free -m"]'
```

Run `scripts/setup.sh` for interactive setup that generates a complete `.env` file.

## Core Server

Initial administrator enrollment requires `PABAWI_BOOTSTRAP_TOKEN`, an independently
generated secret of 32 to 512 characters. An unset value disables enrollment.
Remove it after setup and restart. See [Initial setup](initial-setup.md).

The SSH integration requires a managed JSON fingerprint file configured by
`SSH_HOST_FINGERPRINTS_PATH` when `SSH_HOST_KEY_CHECK=true` (the default).
Missing, invalid or untrusted keys fail closed. See [SSH trust enrollment](integrations/ssh.md#security).

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `NODE_ENV` | unset | `test` disables dotenv loading; deployment tooling commonly sets `production`. | no |
| `PORT` | `3000` | HTTP port | no |
| `HOST` | `localhost` | Bind address (`0.0.0.0` for all interfaces) | no |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` | no |
| `PABAWI_CRASH_DUMP_DIR` | `<cwd>/crash-dumps` | Directory where JSON crash dumps and Node diagnostic reports are written on unhandled exceptions. Created automatically with mode `0700`. Must be writable by the process user. | no |
| `CORS_ALLOWED_ORIGINS` | _(none)_ | Comma-separated list of allowed origins (e.g. `http://localhost:5173`) | no |

## Database

Pabawi runs on SQLite by default and supports PostgreSQL as an alternative
backend. The same schema and code path serve both: application SQL is written
with `?` placeholders and translated to PostgreSQL's `$n` form at query time.

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `DB_TYPE` | `sqlite` | Database backend: `sqlite` or `postgres` | no |
| `DATABASE_PATH` | `./data/pabawi.db` | SQLite database file path, used when `DB_TYPE=sqlite` (directory must exist and be writable) | no |
| `DATABASE_URL` | _(none)_ | PostgreSQL connection URL, **required** when `DB_TYPE=postgres` (e.g. `postgres://user:pass@host:5432/pabawi`) | yes |

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

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `POSTGRES_USER` | `pabawi` | PostgreSQL role for the compose service | no |
| `POSTGRES_PASSWORD` | `pabawi` | Password for that role | yes |
| `POSTGRES_DB` | `pabawi` | Database name created on first start | no |
| `POSTGRES_PORT` | `5432` | Host port mapped to the container | no |

To make the app use that service, set in `.env`:

```bash
DB_TYPE=postgres
DATABASE_URL=postgres://pabawi:pabawi@postgres:5432/pabawi
```

## Authentication & Secrets

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PABAWI_BOOTSTRAP_TOKEN` | _(empty)_ | Initial enrollment secret, 32-512 characters. Empty disables enrollment. | yes |
| `JWT_SECRET` | **required** | Secret key for JWT token signing. Must be ≥ 32 chars of random entropy and not a placeholder (e.g. `your-secure-random-secret-here`, `change-me`). Generate with `openssl rand -base64 32`. The server refuses to start otherwise. Tokens are issued/verified with `iss=pabawi` / `aud=pabawi`. | yes |
| `PABAWI_LIFECYCLE_TOKEN` | _(empty)_ | Optional machine credential for the generic lifecycle endpoints (`POST /api/inventory/:id/action`, `DELETE /api/inventory/:id`, `GET /api/inventory/:id/lifecycle-actions`). Sent as `Authorization: Bearer <token>` instead of a user JWT. When unset, those endpoints accept a user JWT only. See [Lifecycle machine credential](#lifecycle-machine-credential). | yes |

### Lifecycle machine credential

`PABAWI_LIFECYCLE_TOKEN` exists for unattended clients (scripts, cron jobs,
webhooks) that drive the generic lifecycle endpoints without a user session. It
is an _alternative_ to a JWT in the `Authorization` header, not an extra header
alongside one.

When it is set, the server provisions a built-in `lifecycle-service` account
with a "Lifecycle Service" role holding `read`, `lifecycle` and `destroy` on
`proxmox`, `aws` and `azure`. A request carrying the token authenticates as
that account and is authorized by the ordinary RBAC checks, so a refusal is
audit-logged under `lifecycle-service` like any other principal's.

- Anyone holding the token can perform those actions on any node of those
  providers, subject to `ALLOW_DESTRUCTIVE_PROVISIONING`. Treat it like a
  password: generate it with `openssl rand -base64 32` and store it in a
  secret, not in a shell profile.
- To change its scope, edit the "Lifecycle Service" role's permissions (for
  example, remove `destroy`, or add `provision`). The role is not rewritten on
  restart. Do not delete the role itself: the server refuses to start when the
  account exists without it.
- To revoke it, deactivate the `lifecycle-service` account (effective
  immediately, no restart) or unset the variable and restart.
- The account holds that role alone, not the default role new users receive.
- The token is accepted on `/api/inventory` only; it cannot authenticate any
  other endpoint.

### Azure Entra ID SSO

Optional federated authentication via OpenID Connect. When enabled, the login page shows "Sign in with Microsoft" alongside local login. See [integrations/entra-id.md](./integrations/entra-id.md) for Azure portal setup.

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `ENTRA_ID_ENABLED` | `false` | Set to `"true"` to enable Entra ID SSO. All other `ENTRA_ID_*` vars are ignored unless this is `"true"`. | no |
| `ENTRA_ID_TENANT_ID` | **required** | Azure tenant (directory) ID | no |
| `ENTRA_ID_CLIENT_ID` | **required** | Application (client) ID from the app registration | no |
| `ENTRA_ID_CLIENT_SECRET` | **required** | Client secret value | yes |
| `ENTRA_ID_REDIRECT_URI` | **required** | OAuth callback URL (must match Azure app registration). Format: `https://your-host/api/auth/entra-id/callback` | no |
| `ENTRA_ID_SCOPES` | `openid,profile,email` | Comma-separated OAuth scopes. Empty entries are discarded. | no |
| `ENTRA_ID_GROUP_MAPPING` | _(none)_ | JSON object mapping Azure group IDs to Pabawi role names. Example: `{"uuid-1":"administrator","uuid-2":"operator"}` | no |
| `ENTRA_ID_POST_LOGOUT_REDIRECT_URI` | _(app base URL)_ | Where Microsoft redirects after SSO logout | no |
| `ENTRA_ID_JWKS_CACHE_TTL_MS` | `86400000` | How long to cache JWKS signing keys (ms). Default: 24 hours. | no |

When `ENTRA_ID_ENABLED=true`, all four required variables must be set or the server refuses to start with a validation error listing the missing ones.

## Bolt

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `BOLT_PROJECT_PATH` | `cwd` | Path to Bolt project directory containing `inventory.yaml` and `bolt-project.yaml` | no |
| `BOLT_EXECUTION_TIMEOUT` | `300000` | Max execution time per command in ms (5 min) | no |
| `BOLT_PACKAGE_TASKS` | _(see below)_ | JSON array of package task definitions | no |

**`BOLT_PACKAGE_TASKS`**: JSON array. Defaults to the built-in `package` task:

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

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `COMMAND_WHITELIST_ALLOW_ALL` | `false` | `true` to skip whitelist check (dev only) | no |
| `COMMAND_WHITELIST` | `[]` | JSON array of allowed commands | no |
| `COMMAND_WHITELIST_MATCH_MODE` | `exact` | `exact` (full match) or `prefix` (starts-with) | no |

```bash
# Example: exact match
COMMAND_WHITELIST='["uptime","df -h","free -m","systemctl status nginx"]'
COMMAND_WHITELIST_MATCH_MODE=exact

# Example: prefix match (allows "systemctl status *")
COMMAND_WHITELIST='["systemctl status","journalctl -u"]'
COMMAND_WHITELIST_MATCH_MODE=prefix
```

Never set `COMMAND_WHITELIST_ALLOW_ALL=true` in production.

The whitelist is enforced on **every** command-execution path: single-node
(`POST /api/nodes/:id/command`), multi-node batch (`POST /api/executions/batch`),
and re-execution (`POST /api/executions/:id/re-execute`). Shell metacharacters
(`; | & \` $() {} * ? [] ~ < > \\` and newlines) and commands beginning with `-`
are **always** rejected, even when `COMMAND_WHITELIST_ALLOW_ALL=true`, because
they would be interpreted by the remote shell on the target node.

## Streaming

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `STREAMING_BUFFER_MS` | `100` | Output batch interval in ms, measured from the first buffered chunk, so it is also the worst-case delay. Lower = more real-time, higher = less traffic | no |
| `STREAMING_MAX_OUTPUT_SIZE` | `10485760` | Max output per execution in bytes (10 MB) | no |
| `STREAMING_MAX_LINE_LENGTH` | `10000` | Max characters per output line before truncation | no |

## Console (VNC / Terminal)

Settings for the browser-based console proxy (VNC and terminal sessions).

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `CONSOLE_SESSION_TIMEOUT_MS` | `300000` | Idle session timeout in ms (5 min) | no |
| `CONSOLE_MAX_SESSION_DURATION` | `28800000` | Absolute session lifetime in ms (8 h) | no |
| `CONSOLE_MAX_CONCURRENT_SESSIONS` | `3` | Max reserved/live console sessions per user per process | no |
| `CONSOLE_HEARTBEAT_INTERVAL_MS` | `30000` | Heartbeat interval in ms (must be less than the idle timeout) | no |
| `CONSOLE_VERIFY_UPSTREAM_TLS` | `true` | Verify the TLS certificate of the upstream console host | no |

`CONSOLE_VERIFY_UPSTREAM_TLS` defaults to `true` (secure). Set it to `false`
**only** on trusted networks where the upstream console host uses a self-signed
certificate: disabling verification exposes the proxied session (which may
carry credentials and keystrokes) to man-in-the-middle attacks, and the server
logs a warning at startup when it is disabled.

## Caching

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `CACHE_INVENTORY_TTL` | `30000` | Inventory cache TTL in ms. Must be positive; zero is rejected by the schema | no |
| `CACHE_FACTS_TTL` | `300000` | Node facts cache TTL in ms. Must be positive; zero is rejected by the schema | no |

## Execution Queue

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `CONCURRENT_EXECUTION_LIMIT` | `5` | Shared concurrency per process for direct commands, tasks, playbooks, packages, Puppet runs, re-execution and batches; excludes provisioning/lifecycle/monitoring APIs | no |
| `MAX_QUEUE_SIZE` | `50` | Max queued executions before rejecting | no |

## Provisioning Safety

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `ALLOW_DESTRUCTIVE_PROVISIONING` | `false` | Allow destroy/terminate actions across all provisioning plugins. Returns `403 DESTRUCTIVE_ACTION_DISABLED` when false | no |

Keep `false` in production to prevent accidental VM/instance deletion.

## UI

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `UI_SHOW_HOME_PAGE_RUN_CHART` | `true` | Show aggregated Puppet run history chart on home page. Requires PuppetDB | no |

## Integrations

Enable integrations by setting `<PREFIX>_ENABLED=true`. Disabled integrations are skipped at startup: no connection attempts, no health check failures.

### Ansible

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `ANSIBLE_ENABLED` | `false` | Set to `true` to enable | no |
| `ANSIBLE_PROJECT_PATH` | `cwd` | Ansible project directory | no |
| `ANSIBLE_INVENTORY_PATH` | `inventory/hosts` | Inventory file path relative to project | no |
| `ANSIBLE_EXECUTION_TIMEOUT` | `300000` | Max execution time in ms | no |

### PuppetDB

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PUPPETDB_ENABLED` | `false` | Set to `true` to enable | no |
| `PUPPETDB_SERVER_URL` | **required** | PuppetDB URL (e.g. `https://puppetdb:8081`) | no |
| `PUPPETDB_PORT` | _(from URL)_ | Override port | no |
| `PUPPETDB_TOKEN` | unset | Authentication token | yes |
| `PUPPETDB_TIMEOUT` | `30000` | Request timeout in ms | no |
| `PUPPETDB_RETRY_ATTEMPTS` | `3` | Retry attempts on failure | no |
| `PUPPETDB_RETRY_DELAY` | `1000` | Delay between retries in ms | no |
| `PUPPETDB_CACHE_TTL` | `300000` | Response cache TTL in ms | no |

**SSL:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PUPPETDB_SSL_ENABLED` | `true` | Enable SSL verification | no |
| `PUPPETDB_SSL_CA` | unset | Path to CA certificate | no |
| `PUPPETDB_SSL_CERT` | unset | Path to client certificate | no |
| `PUPPETDB_SSL_KEY` | unset | Path to client key | no |
| `PUPPETDB_SSL_REJECT_UNAUTHORIZED` | `true` | Reject invalid certs. Set `false` for self-signed | no |

**Circuit Breaker:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PUPPETDB_CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before opening circuit | no |
| `PUPPETDB_CIRCUIT_BREAKER_TIMEOUT` | `60000` | Time circuit stays open in ms | no |
| `PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT` | `30000` | Time to half-open after timeout in ms | no |

### Puppetserver

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PUPPETSERVER_ENABLED` | `false` | Set to `true` to enable | no |
| `PUPPETSERVER_SERVER_URL` | **required** | Puppetserver URL (e.g. `https://puppet:8140`) | no |
| `PUPPETSERVER_PORT` | _(from URL)_ | Override port | no |
| `PUPPETSERVER_TOKEN` | unset | Authentication token | yes |
| `PUPPETSERVER_TIMEOUT` | `30000` | Request timeout in ms | no |
| `PUPPETSERVER_RETRY_ATTEMPTS` | `3` | Retry attempts on failure | no |
| `PUPPETSERVER_RETRY_DELAY` | `1000` | Delay between retries in ms | no |
| `PUPPETSERVER_INACTIVITY_THRESHOLD` | `3600` | Seconds without check-in before node considered inactive | no |
| `PUPPETSERVER_CACHE_TTL` | `300000` | Response cache TTL in ms | no |

**SSL** (same pattern as PuppetDB):

| Variable | Default | Secret value |
|---|---|---|
| `PUPPETSERVER_SSL_ENABLED` | `true` | no |
| `PUPPETSERVER_SSL_CA` | unset | no |
| `PUPPETSERVER_SSL_CERT` | unset | no |
| `PUPPETSERVER_SSL_KEY` | unset | no |
| `PUPPETSERVER_SSL_REJECT_UNAUTHORIZED` | `true` | no |

**Circuit Breaker:**

| Variable | Default | Secret value |
|---|---|---|
| `PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD` | `5` | no |
| `PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT` | `60000` | no |
| `PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT` | `30000` | no |

### Hiera

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `HIERA_ENABLED` | `false` | Set to `true` to enable | no |
| `HIERA_CONTROL_REPO_PATH` | **required** | Path to Puppet control repo | no |
| `HIERA_CONFIG_PATH` | `hiera.yaml` | Hiera config file relative to control repo | no |
| `HIERA_ENVIRONMENTS` | `["production"]` | JSON array of environments | no |

**Fact sources:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `HIERA_FACT_SOURCE_PREFER_PUPPETDB` | `true` | Use PuppetDB for fact interpolation when available | no |
| `HIERA_FACT_SOURCE_LOCAL_PATH` | unset | Path to local facts directory (fallback) | no |

**Catalog compilation:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `HIERA_CATALOG_COMPILATION_ENABLED` | `false` | Enable catalog compilation | no |
| `HIERA_CATALOG_COMPILATION_TIMEOUT` | `60000` | Compilation timeout in ms | no |
| `HIERA_CATALOG_COMPILATION_CACHE_TTL` | `300000` | Catalog cache TTL in ms | no |

**Cache:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `HIERA_CACHE_ENABLED` | `true` | Enable Hiera data cache | no |
| `HIERA_CACHE_TTL` | `300000` | Cache TTL in ms | no |
| `HIERA_CACHE_MAX_ENTRIES` | `10000` | Max cache entries | no |

**Code analysis:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `HIERA_CODE_ANALYSIS_ENABLED` | `true` | Enable Puppet code analysis | no |
| `HIERA_CODE_ANALYSIS_LINT_ENABLED` | `true` | Run puppet-lint | no |
| `HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK` | `true` | Check for module updates | no |
| `HIERA_CODE_ANALYSIS_INTERVAL` | `3600000` | Analysis interval in ms (1 hour) | no |
| `HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS` | `[]` | JSON array of glob patterns to exclude | no |

### Checkmk

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `CHECKMK_ENABLED` | `false` | Set to `true` to enable | no |
| `CHECKMK_SERVER_URL` | **required** | Checkmk server URL (e.g. `https://checkmk.example.com`) | no |
| `CHECKMK_SITE` | unset | Site name, needed unless the server URL already includes the site or full API path | no |
| `CHECKMK_USERNAME` | **required** | Automation user name | no |
| `CHECKMK_PASSWORD` | **required** | Automation user secret | yes |
| `CHECKMK_SSL_VERIFY` | `true` | Certificate verification for REST and TLS Livestatus | no |
| `CHECKMK_HEALTHCHECK_INTERVAL_MS` | `300000` | Health probe cache interval in ms | no |
| `CHECKMK_LIVESTATUS_HOST` | unset | Enables Livestatus history when set; requires a reachable protected listener | no |
| `CHECKMK_LIVESTATUS_PORT` | `6557` | TCP/TLS listener port, used when host is set | no |
| `CHECKMK_LIVESTATUS_TLS` | `false` | Set to exactly `true` for a TLS listener; sends no REST credential | no |
| `CHECKMK_LIVESTATUS_TIMEOUT_MS` | `5000` | Livestatus query timeout in ms | no |

Inventory and monitoring data are fetched live; health probes are cached. The plugin provides host inventory (priority 8), live service monitoring status, and state-change events. See [integrations/checkmk.md](./integrations/checkmk.md) for details.

### Proxmox

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PROXMOX_ENABLED` | `false` | Set to `true` to enable | no |
| `PROXMOX_HOST` | **required** | Proxmox VE host (without scheme, e.g. `pve.example.com`) | no |
| `PROXMOX_PORT` | `8006` | API port | no |
| `PROXMOX_USERNAME` | unset | Username (e.g. `root@pam`) | no |
| `PROXMOX_PASSWORD` | unset | Password (use token auth in production) | yes |
| `PROXMOX_REALM` | unset | Auth realm override | no |
| `PROXMOX_TOKEN` | unset | API token (`USER@REALM!TOKENID=UUID`) | yes |
| `PROXMOX_TIMEOUT` | `30000` | Request timeout in ms | no |
| `PROXMOX_PRIORITY` | `7` | Data source priority | no |

**SSL:**

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `PROXMOX_SSL_REJECT_UNAUTHORIZED` | `true` | Reject invalid certs. Set `false` for self-signed | no |
| `PROXMOX_SSL_CA` | unset | Path to CA certificate | no |
| `PROXMOX_SSL_CERT` | unset | Path to client certificate | no |
| `PROXMOX_SSL_KEY` | unset | Path to client key | no |

### AWS

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `AWS_ENABLED` | `false` | Set to `true` to enable | no |
| `AWS_ACCESS_KEY_ID` | unset | Access key (or use instance role) | no |
| `AWS_SECRET_ACCESS_KEY` | unset | Secret key | yes |
| `AWS_DEFAULT_REGION` | `us-east-1` | Default region | no |
| `AWS_REGIONS` | unset | JSON array or comma-separated list of regions to query | no |
| `AWS_SESSION_TOKEN` | unset | Session token for temporary credentials | yes |
| `AWS_PROFILE` | unset | AWS CLI profile name | no |
| `AWS_ENDPOINT` | unset | Override endpoint URL (for LocalStack etc.) | no |

### Azure

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `AZURE_ENABLED` | `false` | Set to exactly `true` to enable VM integration | no |
| `AZURE_TENANT_ID` | unset | Tenant ID for service-principal authentication | no |
| `AZURE_CLIENT_ID` | unset | Service-principal client ID | no |
| `AZURE_CLIENT_SECRET` | unset | Service-principal secret; provide with tenant and client IDs, or use the supported default credential chain | yes |
| `AZURE_SUBSCRIPTION_ID` | required when enabled | Subscription to manage | no |
| `AZURE_RESOURCE_GROUPS` | unset | JSON array or comma-separated list; unset queries all resource groups | no |

These configure VM management independently of `ENTRA_ID_*` login settings.
See [Azure integration](integrations/azure.md) for credential requirements.

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
CACHE_INVENTORY_TTL=30000
CACHE_FACTS_TTL=300000
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

SSH uses environment defaults and host entries in `SSH_CONFIG_PATH`.
See [SSH integration](integrations/ssh.md) for inventory and trust enrollment.

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `SSH_ENABLED` | `false` | Enable SSH | no |
| `SSH_CONFIG_PATH` | `unset` | OpenSSH inventory config path | no |
| `SSH_DEFAULT_USER` | `required when enabled` | Default remote username | no |
| `SSH_DEFAULT_PORT` | `22` | Remote port | no |
| `SSH_DEFAULT_KEY` | `unset` | Private-key file path | no |
| `SSH_HOST_KEY_CHECK` | `true` | Require a trusted server fingerprint | no |
| `SSH_HOST_FINGERPRINTS_PATH` | `unset` | Managed JSON trust file, required for verified connections | no |
| `SSH_CONNECTION_TIMEOUT` | `30` | Connection timeout in seconds, 5-300 | no |
| `SSH_COMMAND_TIMEOUT` | `300` | Command timeout in seconds, 10-3600 | no |
| `SSH_MAX_CONNECTIONS` | `50` | Pool connection count, 1-1000 | no |
| `SSH_MAX_CONNECTIONS_PER_HOST` | `5` | Connections per host, 1-100 | no |
| `SSH_IDLE_TIMEOUT` | `300` | Pool idle timeout in seconds, 10-3600 | no |
| `SSH_CONCURRENCY_LIMIT` | `10` | Parallel SSH commands, 1-100 | no |
| `SSH_PRIORITY` | `50` | Source priority | no |
| `SSH_SUDO_ENABLED` | `false` | Enable privilege escalation | no |
| `SSH_SUDO_COMMAND` | `sudo` | Escalation command | no |
| `SSH_SUDO_PASSWORDLESS` | `true` | Use passwordless escalation | no |
| `SSH_SUDO_PASSWORD` | `unset` | Escalation password when passwordless is false | yes |
| `SSH_SUDO_USER` | `root` | Escalation target user | no |

## MCP Server

| Variable | Default | Description | Secret value |
|---|---|---|---|
| `MCP_ENABLED` | `false` | Set to `true` to enable the embedded MCP server at `/mcp` | no |
| `MCP_AUTH_TOKEN` | _(none)_ | Static bearer token for MCP client authentication. Generate with `openssl rand -hex 32`. When set, MCP clients can authenticate with this token instead of a JWT. Scoped to `/mcp` only. | yes |

The endpoint is `/mcp` (POST/GET/DELETE). Personal access JWTs retain the
caller's grants; only the static token uses `mcp-service`. See the
[MCP guide](mcp.md) for the eleven tools, ownership, limits and revocation.

## Validation Errors

If any variable fails Zod validation, the server exits immediately with:

```
Configuration validation failed: <field>: <reason>
```

Check the exact variable name. Invalid console numbers fall back with warnings;
incomplete Checkmk credentials skip plugin registration with a warning.

Diagnostic retention, size limits and credential sanitization are documented in
[diagnostic security](diagnostics-security.md). These fixed limits also apply to
`PABAWI_CRASH_DUMP_DIR`; stdout/stderr retention remains the operator's responsibility.
