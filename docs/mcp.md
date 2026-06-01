# MCP Server

Pabawi includes an embedded [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes read-only (by default) infrastructure tools over Streamable HTTP. This lets AI assistants like Claude Desktop, Claude Code, Kiro, Cursor, Gemini CLI, OpenAI Codex CLI, and other MCP-compatible clients query your infrastructure data directly.

## Enabling the MCP Server

Add to `backend/.env`:

```bash
MCP_ENABLED=true
```

Restart the backend. You should see in the logs:

```
MCP server enabled, initializing...
Provisioning MCP service user
MCP server initialized, /mcp endpoint registered
```

The MCP endpoint is available at `POST http://<host>:<port>/mcp`.

## How It Works

When enabled, Pabawi:

1. Creates a dedicated `mcp-service` system user with a random password (cannot be used for login)
2. Creates an `MCP Service` built-in role with all `read` permissions
3. Assigns the role to the service user
4. Starts the MCP server and registers the `/mcp` endpoint

All MCP endpoints require JWT authentication — the same `Authorization: Bearer <token>` header used by the REST API. Once authenticated, tool calls go through the same RBAC permission system as the REST API. The MCP server calls services directly (no HTTP round-trips) since it runs inside the backend process.

## Authentication

The MCP endpoint requires authentication. Two methods are supported:

### Static token (recommended for MCP clients)

Set `MCP_AUTH_TOKEN` in `backend/.env`:

```bash
MCP_AUTH_TOKEN=your-secure-random-token-here
```

Generate a strong token:

```bash
openssl rand -hex 32
```

Use this token as the `Authorization: Bearer <token>` header in your MCP client configuration. It does not expire and is scoped exclusively to the `/mcp` endpoint — it cannot be used to access other API routes.

### JWT authentication

Alternatively, any valid Pabawi JWT (obtained via `POST /api/auth/login`) is accepted on the MCP endpoint. This is useful for browser-based or short-lived integrations but requires periodic token renewal.

## Client Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "pabawi": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

### Kiro

Add to `.kiro/settings/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "pabawi": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "pabawi": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

### Claude Code

Run from your project directory:

```bash
claude mcp add --transport http pabawi http://localhost:3000/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

This stores the server in your local Claude Code config. To verify it's connected, run `/mcp` inside Claude Code.

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "pabawi": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

Restart Gemini CLI and run `/mcp` to verify the connection.

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.pabawi]
url = "http://localhost:3000/mcp"

[mcp_servers.pabawi.headers]
Authorization = "Bearer <MCP_AUTH_TOKEN>"
```

Run `codex mcp list` to verify the server is configured.

### Any MCP Client

The endpoint accepts standard MCP Streamable HTTP requests at `POST /mcp`. All requests require a bearer token in the `Authorization` header — either the static `MCP_AUTH_TOKEN` or a valid JWT from `POST /api/auth/login`.

## Available Tools

| Tool | Description | Parameters |
|---|---|---|
| `inventory_list` | List nodes from all active integrations | `search?` — filter by name or certname |
| `facts_get` | Get system facts for a node | `certname` — node certname |
| `facts_bulk` | Get specific facts across all nodes in one query | `fact_names` — array of top-level fact names, `include_all?` |
| `reports_query` | Query Puppet run reports | `certname?`, `limit?`, `status?` |
| `catalogs_get` | Get compiled Puppet catalog for a node | `certname` — node certname |
| `hiera_lookup` | Look up a Hiera key value for a node | `key`, `node?` (certname for hierarchy resolution), `environment?` (default: production) |
| `executions_list` | List execution history | `limit?`, `status?`, `tool?` |
| `integrations_list` | List integrations and health status | _(none)_ |
| `journal_query` | Search journal entries | `nodeId?`, `eventType?`, `limit?` |
| `monitoring_services_get` | Get live Checkmk service status for a node | `nodeId` — node hostname |
| `monitoring_events_get` | Get Checkmk state-change events for a node | `nodeId` — node hostname, `limit?` (1-1000, default 200) |

All tools are read-only. Each tool checks RBAC permissions before executing.

## Sample Prompts

Once connected, you can ask your AI assistant things like:

### Inventory and Discovery

- "List all nodes in my infrastructure"
- "Search for nodes with 'web' in the name"
- "Which integrations are healthy right now?"
- "Show me all nodes managed by Puppet"

### Node Inspection

- "What are the facts for node web-01.example.com?"
- "What OS is db-primary running?"
- "Show me the Puppet catalog for web-01"
- "Look up the ntp::servers Hiera key in production"

### Operations and History

- "Show me the last 10 Puppet reports"
- "Are there any failed Puppet runs in the last reports?"
- "What executions have been run recently?"
- "Show me journal entries for node web-01"

### Troubleshooting

- "Check if all integrations are connected and healthy"
- "Show me failed Puppet reports for the last 5 runs"
- "What changed on node db-primary according to the journal?"
- "Look up the Hiera value for profile::base::packages in staging"

### Multi-Step Analysis

- "List all nodes, then get the facts for the first one"
- "Check which integrations are unhealthy and show me recent journal entries"
- "Find all web servers and show me their latest Puppet reports"

## Permission Management

The `MCP Service` role is created with all `read` permissions by default. To customize what the MCP server can access:

1. Go to the Role Management page in the Pabawi UI
2. Find the `MCP Service` role
3. Add or remove permissions as needed

The `mcp-service` user and `MCP Service` role are visible in the Users and Roles management pages like any other user/role.

## Tool Details

### inventory_list

Returns aggregated node inventory from all active integrations (Bolt, PuppetDB, Ansible, SSH, Proxmox, AWS, Azure).

```
search: "web"  →  returns only nodes with "web" in name or certname
search: omitted  →  returns all nodes
```

### facts_get

Returns facts gathered from all sources for a specific node. Facts are keyed by source (bolt, puppetdb, ansible, etc.).

```
certname: "web-01.example.com"
```

### facts_bulk

Returns specific facts across all nodes in a single PuppetDB query. Much more efficient than calling `facts_get` per node when you need the same facts for many nodes.

```
fact_names: ["os", "networking", "memory"]   →  get OS, networking, and memory facts for all nodes
include_all: false                           →  filter to essential sub-keys only
```

### reports_query

Returns Puppet run reports. Requires PuppetDB integration.

```
certname: "web-01"     →  reports for a specific node
limit: 5               →  last 5 reports
status: "changed"      →  only reports with changes
```

### catalogs_get

Returns the compiled Puppet catalog for a node. Requires PuppetDB integration.

```
certname: "web-01.example.com"
```

### hiera_lookup

Resolves a Hiera key for a node. When a `node` is provided, the service fetches the node's facts from PuppetDB and uses them to resolve hierarchy paths (e.g. `nodes/%{facts.networking.fqdn}.yaml`, `os/%{facts.os.family}.yaml`). Without a node, only static hierarchy levels like `common.yaml` are checked.

```
key: "ntp::servers"
node: "web01.example.com"  →  resolve using this node's facts (optional)
environment: "staging"      →  defaults to "production" if omitted
```

### executions_list

Returns execution history (commands, tasks, Puppet runs).

```
limit: 10              →  last 10 executions
status: "success"      →  only successful executions
tool: "bolt"           →  only Bolt executions
```

### integrations_list

Returns all configured integrations with their current health status. No parameters.

### journal_query

Returns journal entries (events, actions, notes).

```
nodeId: "web-01"       →  entries for a specific node
eventType: "puppet_run" →  only Puppet run events
limit: 20              →  last 20 entries
```

### monitoring_services_get

Returns live Checkmk service monitoring status for a node. Requires the Checkmk integration to be configured. Returns an MCP error if the plugin is disabled or the node is unknown.

```
nodeId: "web-01"       →  service status for this node
```

Each service includes: description, state (OK/WARN/CRIT/UNKNOWN), plugin output, and last check timestamp.

### monitoring_events_get

Returns Checkmk state-change events for a node. Events come from Livestatus when configured, otherwise derived from the REST API. Returns an MCP error if the plugin is disabled or the node is unknown.

```
nodeId: "web-01"       →  events for this node
limit: 50              →  last 50 events (default: 200, max: 1000)
```

Each event includes: timestamp, service description, state transition, and output text.

## Troubleshooting

### Docker and Container Deployments

The MCP endpoint (`/mcp`) is served on the same port as the rest of the API (default 3000). No additional port mapping is needed — if the Pabawi UI is reachable, so is MCP.

To enable MCP in Docker, add to your `.env` file (or the env_file referenced by docker-compose):

```bash
MCP_ENABLED=true
MCP_AUTH_TOKEN=<generate-with-openssl-rand-hex-32>
```

The MCP client URL from outside the container is:

```
http://<docker-host>:<mapped-port>/mcp
```

For example, with the default `docker-compose.yml` mapping `3000:3000`:

```
http://localhost:3000/mcp
```

#### Reverse Proxy / Ingress Considerations

The MCP Streamable HTTP transport uses long-lived SSE connections on `GET /mcp`. If you place a reverse proxy (nginx, Traefik, HAProxy) or Kubernetes ingress in front of Pabawi:

- **Disable response buffering** for the `/mcp` path — SSE requires unbuffered streaming
- **Increase idle/read timeouts** to at least 300s (the default 60s in nginx will drop MCP sessions)
- **Disable request body size limits** or set them generously for `/mcp` POST (MCP messages can be large)
- **Preserve headers** — the `mcp-session-id` header must pass through unmodified

Example nginx location block:

```nginx
location /mcp {
    proxy_pass http://pabawi:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

Example Kubernetes ingress annotation (nginx ingress controller):

```yaml
nginx.ingress.kubernetes.io/proxy-buffering: "off"
nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
```

#### Kubernetes / Pod Deployments

When running Pabawi in a pod:

1. The `/mcp` endpoint is part of the same container — expose it via the same Service/Ingress as the UI
2. Set `MCP_ENABLED=true` and `MCP_AUTH_TOKEN` in your ConfigMap/Secret
3. If using horizontal pod autoscaling, note that MCP sessions are in-memory and not shared across replicas — a client must hit the same pod for the duration of a session (use sticky sessions or session affinity)

### MCP endpoint not responding

- Verify `MCP_ENABLED=true` is set in `backend/.env`
- Restart the backend after changing the setting
- Check logs for "MCP server initialized" message

### MCP endpoint returning 401 Unauthorized

- If using `MCP_AUTH_TOKEN`: verify the token in your client config matches the value in `backend/.env` exactly
- If using JWT: tokens expire — re-authenticate via `POST /api/auth/login` to get a fresh token
- Ensure the `Authorization: Bearer <token>` header is being sent
- Verify the user account is not locked or disabled (JWT path only)

### Tools returning permission errors

- The `MCP Service` role may be missing the required permission
- Go to Role Management → MCP Service → add the missing permission
- Permission format: `<resource>/<action>` (e.g., `puppetdb/read`)

### Service user not visible

- The `mcp-service` user is only created when `MCP_ENABLED=true`
- Check logs for "Provisioning MCP service user" or errors during provisioning

### Integration-specific tools returning errors

- Tools like `reports_query`, `catalogs_get`, and `hiera_lookup` require their respective integrations to be enabled
- If PuppetDB is not configured, PuppetDB-dependent tools will return "service not available"
