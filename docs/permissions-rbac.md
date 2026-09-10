# Permissions and RBAC

Pabawi uses Role-Based Access Control (RBAC) on authenticated API routes. Users are assigned roles. Roles contain permissions. Permissions gate specific actions.

## Authentication Methods

Pabawi supports two authentication methods that can work simultaneously:

- **Local authentication** — username/password login, always available
- **Azure Entra ID SSO** — federated login via OpenID Connect (optional, see [integrations/entra-id.md](./integrations/entra-id.md))

Both methods issue identical Pabawi JWT tokens. The RBAC middleware makes no distinction between authentication origins — permissions are determined by the user's assigned roles regardless of how they logged in.

### Federated Users

Users who authenticate via Entra ID for the first time are automatically provisioned:

- If a local user with the same email exists, the Entra ID identity is linked to that account
- Otherwise, a new account is created with federation-only access (no local password)
- The default viewer role is assigned to new federated users

### Group-to-Role Mapping

When `ENTRA_ID_GROUP_MAPPING` is configured, Pabawi synchronizes roles at each SSO login based on the user's Azure group memberships. Manually assigned roles are preserved. See [integrations/entra-id.md](./integrations/entra-id.md#group-to-role-mapping) for details.

## Permission Format

Permissions are database records with a `resource` and an `action`, written here
as `<resource>/<action>`. Examples include `proxmox/provision`,
`proxmox/lifecycle` and `proxmox/destroy`. Assign permission IDs to roles through
the API. Wildcard strings are not supported.

## Built-in Roles

### Administrator

The Administrator role receives explicit permission assignments. Active users
with `is_admin` set also pass all permission checks.

### Operator

Read, execute, and lifecycle access to all integrations. Cannot destroy or configure.

Includes all Viewer permissions plus:

| Permission | Description |
|---|---|
| `ansible/execute` | Execute Ansible playbooks |
| `bolt/execute` | Execute Bolt tasks and commands (single-node, multi-node batch, and re-execution) |
| `proxmox/lifecycle` | Start/stop/reboot Proxmox VMs |
| `aws/lifecycle` | Start/stop/reboot AWS instances |
| `azure/lifecycle` | Start/stop/reboot Azure VMs |
| `ssh/execute` | Execute SSH commands |

### Viewer

Read-only access to all integrations.

| Permission | Description |
|---|---|
| `ansible/read` | View Ansible inventory |
| `bolt/read` | View Bolt inventory |
| `puppetdb/read` | View PuppetDB data |
| `proxmox/read` | View Proxmox resources |
| `aws/read` | View AWS resources |
| `azure/read` | View Azure resources |
| `journal/read` | View journal entries |
| `integration_config/read` | View integration status |
| `hiera/read` | View Hiera data |
| `ssh/read` | View SSH connections |
| `puppetserver/read` | View Puppetserver nodes, catalogs, environments and status |
| `executions/read` | View execution history, results and streamed output |
| `provisioning/read` | List provisioning integrations and their capabilities |

## Permission Reference

### Azure

| Permission | Grants |
|---|---|
| `azure/read` | View Azure resources |
| `azure/lifecycle` | Start/stop/reboot Azure VMs |
| `azure/provision` | Create new Azure resources |
| `azure/destroy` | Terminate Azure resources |
| `azure/admin` | Full Azure management |

### Hiera

| Permission | Grants |
|---|---|
| `hiera/read` | View Hiera data (required by every `/api/integrations/hiera` route) |
| `hiera/admin` | Reload the Hiera control repository |

### Puppetserver

| Permission | Grants |
|---|---|
| `puppetserver/read` | View nodes, catalogs, environments, status and metrics (required by every `/api/integrations/puppetserver` route) |
| `puppetserver/write` | Deploy a Puppet environment |
| `puppetserver/admin` | Flush the environment cache |

Granted to Administrator only for `write` and `admin`. Environment deployment
and cache flush change what every managed node applies, so they are not part of
the Operator role by default; grant them explicitly through a custom role if
your operators need them.

### Executions

| Permission | Grants |
|---|---|
| `executions/read` | List executions, read execution detail, stored output and the SSE stream |

Commands, Puppet runs and batches require `<execution-tool>/execute` for the
selected tool. Re-execution and cancellation require it for the stored tool;
batch cancellation checks every tool in the batch. Package installation supports
Bolt and Ansible and requires the selected tool's execute permission.

Execution output is shared with all holders of `executions/read`, regardless of
which user started the execution.

### SSH

| Permission | Grants |
|---|---|
| `ssh/read` | View SSH connections |
| `ssh/execute` | Execute SSH commands |
| `ssh/admin` | Full SSH management |

### Provisioning and lifecycle

| Permission | Grants |
|---|---|
| `provisioning/read` | Discover provisioning integrations |
| `<provider>/read` | Read provider inventory and discovery data |
| `<provider>/provision` | Create provider resources |
| `<provider>/lifecycle` | Start, stop, reboot and other non-destruction lifecycle operations |
| `<provider>/destroy` | Destruction, AWS termination and Azure deallocation, also subject to `ALLOW_DESTRUCTIVE_PROVISIONING` |

Provider mutations also require that provider's read permission. These are
resource/action pairs, not wildcard permission strings. The generic inventory
lifecycle endpoints retain their additional lifecycle credential requirement.

### Inventory and facts

Aggregated inventory and facts include only sources for which the caller holds
`<source>/read`. Filtering happens before provider calls and node linking.
Explicit restricted facts and PuppetDB PQL requests return 403. Scoped requests
cannot reuse unrestricted inventory cache entries.

## UI permission state

The frontend loads the current caller's grants from `GET /api/auth/permissions`
after login, token refresh or restoring a session. Controls remain unavailable
until permissions load; grants are cleared on logout.

| UI element | Required permission |
|---|---|
| Provision navigation | `provisioning/read` and at least one provider's read/provision grants |
| Provisioning form | Selected provider's read/provision grants |
| Lifecycle action | Provider read plus lifecycle or destroy, with the destructive configuration gate |
| Execution navigation | `executions/read` |
| Re-execute and cancel controls | Stored execution tool's execute grant |
| Inventory navigation | At least one source's read grant |
| Monitoring navigation | `checkmk/read` |

The backend enforces permissions independently of UI visibility.

## Managing Users, Roles, and Permissions

Use the API or (when auth is enabled) the Users section in Settings.

**Quick setup via API:**

```bash
# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secure-pass", "email": "alice@example.com"}'

# Create a role
curl -X POST http://localhost:3000/api/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "vm-operator", "description": "Create and manage VMs"}'

# Assign permission to role
curl -X POST "http://localhost:3000/api/roles/<role-id>/permissions/<permission-id>" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Assign role to user
curl -X POST "http://localhost:3000/api/users/<user-id>/roles/<role-id>" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

See [api.md](./api.md#rbac) for the full RBAC API reference.

## Example Role Setups

A Proxmox VM operator needs `proxmox/read`, `proxmox/provision` and
`proxmox/lifecycle`. Add `provisioning/read` for the provisioning page.

A viewer restricted to Bolt inventory and facts needs `bolt/read`. Grant other
sources' read permissions individually to expand that scope.

Add `proxmox/destroy` to allow destruction. Destruction also requires
`ALLOW_DESTRUCTIVE_PROVISIONING=true`.

## MCP Service User

When `MCP_ENABLED=true`, Pabawi auto-provisions a `mcp-service` system user at startup with an `MCP Service` built-in role. This role is assigned all permissions with action `read`, giving the MCP server read-only access to all integrations.

The `mcp-service` user:

- Is visible in the Users management page
- Has a random password (cannot be used for login)
- Cannot be deleted (built-in role)
- Is reused on subsequent restarts (idempotent provisioning)

To grant additional permissions to MCP tools, assign more permissions to the `MCP Service` role via the Role Management page or API.
