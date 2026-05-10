# Pabawi

Pabawi is an open source web frontend for managing classic infrastructure — physical servers, VMs, and the tools that run them.

It connects to your existing setup and gives you a unified interface for inventory, remote execution, and visibility.

## Integrations

| Tool | What you get |
|------|-------------|
| Puppet / OpenVox | Reports, catalog inspection, Hiera browser, event tracking, code analysis |
| PuppetDB | Node inventory, PQL queries, facts, resource history |
| Bolt | Task execution with parameter discovery, command execution |
| Ansible | Inventory, ad-hoc commands, playbook execution |
| SSH | Direct node management without config management tools |
| Proxmox | VM and container inventory, provisioning, lifecycle management |
| AWS | EC2 inventory, provisioning, start/stop/terminate |
| Azure | VM inventory, provisioning, lifecycle management (start/stop/restart/deallocate) |

## Features

- Multi-source inventory (Bolt, PuppetDB, Ansible, SSH, Proxmox, AWS, Azure) with inventory groups
- Command and task execution with real-time streaming output
- VM provisioning across Proxmox, AWS, and Azure
- Global Journal — cross-node event timeline with filtering by node, group, source, and date range
- RBAC authentication — multiple users, roles, audit trail
- Execution history with re-run capability
- Expert mode with full debug output
- Graceful degradation — works even when some integrations are unavailable

## Quick Start

```bash
mkdir pabawi && cd pabawi
# Create your .env configuration (see pabawi.example42.com for reference)
vi .env

docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \
  -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/pabawi:/pabawi" \
  --env-file ".env" \
  example42/pabawi:latest
```

Access the UI at <http://localhost:3000>

## Documentation

Full documentation, configuration reference and integration guides: 👉 <https://pabawi.example42.com>

## License

Apache License 2.0
