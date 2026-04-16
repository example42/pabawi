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

Provision and manage resources. Cannot destroy. Cannot configure integrations.

| Permission | Description |
|---|---|
| `*:provision:*` | Create VMs, containers, EC2 instances |
| `*:lifecycle:*` | Start, stop, reboot — but **not** destroy |
| `*:inventory:read` | View inventory and facts |

### Viewer

Read-only.

| Permission | Description |
|---|---|
| `*:inventory:read` | View inventory |
| `*:facts:read` | View node facts |

## Permission Reference

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
