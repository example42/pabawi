# Permissions and RBAC

Pabawi uses Role-Based Access Control (RBAC) when `AUTH_ENABLED=true`. Users are assigned roles. Roles contain permissions. Permissions gate specific actions.

## Permission Format

```
<integration>:<category>:<action>
```

Examples:

- `proxmox:provision:create_vm` — create VMs in Proxmox
- `proxmox:lifecycle:start` — start Proxmox VMs/containers
- `proxmox:lifecycle:destroy` — destroy Proxmox VMs/containers
- `*:provision:*` — all provisioning actions on all integrations
- `*:*:*` — full admin access

## Built-in Roles

### Administrator

Full access. Permission: `*:*:*`

### Operator

Read, execute, and lifecycle access to all integrations. Cannot destroy or configure.

Includes all Viewer permissions plus:

| Permission | Description |
|---|---|
| `ansible/execute` | Execute Ansible playbooks |
| `bolt/execute` | Execute Bolt tasks and commands |
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
| `hiera/read` | View Hiera data |
| `hiera/admin` | Manage Hiera configuration |

### SSH

| Permission | Grants |
|---|---|
| `ssh/read` | View SSH connections |
| `ssh/execute` | Execute SSH commands |
| `ssh/admin` | Full SSH management |

### Provisioning

| Permission | Grants |
|---|---|
| `<int>:provision:create_vm` | Create VMs (Proxmox, AWS) |
| `<int>:provision:create_lxc` | Create LXC containers (Proxmox) |
| `<int>:provision:*` | All provisioning for the integration |

### Lifecycle

| Permission | Grants |
|---|---|
| `<int>:lifecycle:start` | Start stopped resources |
| `<int>:lifecycle:stop` | Stop running resources |
| `<int>:lifecycle:reboot` | Reboot resources |
| `<int>:lifecycle:shutdown` | Graceful shutdown |
| `<int>:lifecycle:destroy` | **Permanently delete** — also requires `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| `<int>:lifecycle:*` | All lifecycle actions |

### Inventory and Data

| Permission | Grants |
|---|---|
| `*:inventory:read` | View node inventory |
| `*:facts:read` | View node facts |

## UI Visibility Rules

Pabawi hides UI elements the current user lacks permission for:

| UI Element | Required Permission |
|---|---|
| Manage tab | Any `lifecycle:*` or `provision:*` permission |
| Provision tab | Any `provision:*` permission |
| VM creation form | `<int>:provision:create_vm` |
| LXC creation form | `<int>:provision:create_lxc` |
| Start button | `<int>:lifecycle:start` |
| Stop button | `<int>:lifecycle:stop` |
| Destroy button | `<int>:lifecycle:destroy` + `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| Setup menu | Admin only |

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
curl -X POST http://localhost:3000/api/roles/<role-id>/permissions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permission": "proxmox:provision:create_vm"}'

# Assign role to user
curl -X POST http://localhost:3000/api/users/<user-id>/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleId": "<role-id>"}'
```

See [api.md](./api.md#rbac) for the full RBAC API reference.

## Example Role Setups

**VM operator (Proxmox only):**

```
proxmox:provision:create_vm
proxmox:lifecycle:start
proxmox:lifecycle:stop
proxmox:lifecycle:reboot
proxmox:inventory:read
```

**Read-only viewer:**

```
*:inventory:read
*:facts:read
```

**Full Proxmox access (including destroy):**

```
proxmox:provision:*
proxmox:lifecycle:*
```

Also requires `ALLOW_DESTRUCTIVE_PROVISIONING=true` for destroy to work.

## MCP Service User

When `MCP_ENABLED=true`, Pabawi auto-provisions a `mcp-service` system user at startup with an `MCP Service` built-in role. This role is assigned all permissions with action `read`, giving the MCP server read-only access to all integrations.

The `mcp-service` user:

- Is visible in the Users management page
- Has a random password (cannot be used for login)
- Cannot be deleted (built-in role)
- Is reused on subsequent restarts (idempotent provisioning)

To grant additional permissions to MCP tools, assign more permissions to the `MCP Service` role via the Role Management page or API.
