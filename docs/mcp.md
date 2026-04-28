# MCP Server

Pabawi includes an embedded [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes read-only infrastructure tools over Streamable HTTP. This lets AI assistants like Claude, Cursor, Kiro, and other MCP-compatible clients query your infrastructure data directly.

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

All tool calls go through the same RBAC permission system as the REST API. The MCP server calls services directly (no HTTP round-trips) since it runs inside the backend process.

## Client Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "pabawi": {
      "url": "http://localhost:3000/mcp"
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
      "url": "http://localhost:3000/mcp"
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
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Any MCP Client

The endpoint accepts standard MCP Streamable HTTP requests at `POST /mcp`. No authentication headers are needed — the MCP server uses its own service user internally.

## Available Tools

| Tool | Description | Parameters |
|---|---|---|
| `inventory_list` | List nodes from all active integrations | `search?` — filter by name or certname |
| `facts_get` | Get system facts for a node | `certname` — node certname |
| `reports_query` | Query Puppet run reports | `certname?`, `limit?`, `status?` |
| `catalogs_get` | Get compiled Puppet catalog for a node | `certname` — node certname |
| `hiera_lookup` | Look up a Hiera key value | `key`, `environment?` (default: production) |
| `executions_list` | List execution history | `limit?`, `status?`, `tool?` |
| `integrations_list` | List integrations and health status | _(none)_ |
| `journal_query` | Search journal entries | `nodeId?`, `eventType?`, `limit?` |

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

Resolves a Hiera key for a given environment. Requires Hiera integration.

```
key: "ntp::servers"
environment: "staging"  →  defaults to "production" if omitted
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

## Troubleshooting

### MCP endpoint not responding

- Verify `MCP_ENABLED=true` is set in `backend/.env`
- Restart the backend after changing the setting
- Check logs for "MCP server initialized" message

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
