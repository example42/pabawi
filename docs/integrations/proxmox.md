# Proxmox Integration

Pabawi connects to Proxmox VE to discover VMs and LXC containers, manage their lifecycle, and provision new guests.

## Prerequisites

- Proxmox VE cluster with API access (port 8006)
- API token or username/password credentials

## Configuration

```bash
PROXMOX_ENABLED=true
PROXMOX_HOST=proxmox.example.com       # hostname only, no scheme
PROXMOX_PORT=8006                      # default
PROXMOX_TOKEN=user@realm!tokenid=uuid  # recommended
# or password auth:
# PROXMOX_USERNAME=root
# PROXMOX_PASSWORD=secret
# PROXMOX_REALM=pam
```

**SSL (optional):**

```bash
PROXMOX_SSL_REJECT_UNAUTHORIZED=true   # set false for self-signed certs
PROXMOX_SSL_CA=/opt/pabawi/certs/proxmox-ca.pem
```

See [configuration.md](../configuration.md) for all Proxmox env vars.

## Authentication

**Token auth (recommended):** Create via Proxmox UI → Datacenter → Permissions → API Tokens. Token format: `user@realm!tokenid=uuid`.

Required permissions for the token user:

| Permission | Purpose |
|---|---|
| `VM.Allocate` | Create VMs/containers |
| `VM.Config.*` | Configure VMs/containers |
| `VM.PowerMgmt` | Start/stop/reboot |
| `VM.Audit` | Read VM info |
| `Datastore.Allocate` | Allocate disk |

**Password auth:** Uses username/password to obtain a temporary ticket (auto-refreshed every 2 hours). Realms: `pam` (Linux PAM) or `pve` (Proxmox VE).

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | All VMs and LXC containers across the cluster |
| **Grouping** | By Proxmox node, by status (running/stopped), by type (qemu/lxc) |
| **Facts** | VM config, status, resource usage |
| **Lifecycle** | Start, stop, shutdown, reboot |
| **Provisioning** | Create VM from template, create LXC container |
| **Destroy** | Delete VM/container — blocked unless `ALLOW_DESTRUCTIVE_PROVISIONING=true` |

## Node Format in Inventory

Each discovered guest has ID format `proxmox:<node>:<vmid>`. For example: `proxmox:pve01:100`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "PROXMOX_HOST is required" | Set `PROXMOX_HOST` (hostname only, no `https://`) |
| "SSL certificate error" | Set `PROXMOX_SSL_REJECT_UNAUTHORIZED=false` for self-signed certs |
| "401 Unauthorized" | Check token format: `user@realm!tokenid=uuid`. Verify token exists and has not expired. |
| "403 Forbidden" | Token user lacks required permissions. Check VM.Allocate, VM.Config.*, VM.PowerMgmt. |
| "Destroy blocked (403 DESTRUCTIVE_ACTION_DISABLED)" | Set `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| No guests in inventory | Verify Proxmox node is reachable and credentials work. Check backend logs. |
