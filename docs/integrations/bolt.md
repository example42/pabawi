# Bolt Integration

Pabawi uses Bolt as its primary execution tool. Bolt handles command execution, task execution, Puppet runs, and package installation.

## Prerequisites

- Bolt CLI installed on the host running Pabawi (not needed inside Docker — Bolt is bundled in the container image)
- A valid Bolt project directory with `bolt-project.yaml` and `inventory.yaml`

## Configuration

```bash
BOLT_PROJECT_PATH=/opt/my-bolt-project   # required
BOLT_EXECUTION_TIMEOUT=300000            # default: 5 min
```

Run `scripts/setup.sh` or use the **Bolt Setup Guide** in the web UI to generate the `.env` snippet.

## Project Structure

```
bolt-project/
├── bolt-project.yaml
├── inventory.yaml
└── modules/
    ├── psick/
    └── tp/
```

**`bolt-project.yaml` — required settings:**

```yaml
name: my-project
modulepath:
  - modules
color: false        # critical: ANSI color codes break JSON parsing
apply-settings:
  show_diff: true
```

**`inventory.yaml` — example:**

```yaml
groups:
  - name: web-servers
    targets:
      - uri: web01.example.com
      - uri: web02.example.com
    config:
      transport: ssh
      ssh:
        user: deploy
        host-key-check: false
```

## Command Whitelist

All ad-hoc commands are validated against the whitelist before execution.

| Mode | Config | Behaviour |
|---|---|---|
| **Strict** (production) | `COMMAND_WHITELIST_MATCH_MODE=exact` | Command must match exactly |
| **Prefix** | `COMMAND_WHITELIST_MATCH_MODE=prefix` | Command must start with a listed prefix |
| **Open** (dev only) | `COMMAND_WHITELIST_ALLOW_ALL=true` | No validation |

```bash
# Production example — exact match
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST_MATCH_MODE=exact
COMMAND_WHITELIST='["uptime","df -h","free -m","ps aux"]'

# Dev example — prefix match for service inspection
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST_MATCH_MODE=prefix
COMMAND_WHITELIST='["systemctl status","journalctl -u","cat /var/log/"]'
```

Never whitelist destructive commands (`rm`, `dd`, `mkfs`). Never use `COMMAND_WHITELIST_ALLOW_ALL=true` in production.

## Package Tasks

Configure which Bolt tasks back the "Install Package" UI:

```bash
BOLT_PACKAGE_TASKS='[
  {
    "name": "package",
    "label": "Standard Package",
    "parameterMapping": { "packageName": "name", "ensure": "action", "version": "version" }
  },
  {
    "name": "tp::install",
    "label": "Tiny Puppet",
    "parameterMapping": { "packageName": "app", "ensure": "ensure", "settings": "settings" }
  }
]'
```

`parameterMapping` maps the UI form fields to the actual task parameter names.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Bolt configuration files not found" | Check `BOLT_PROJECT_PATH` is absolute and contains `bolt-project.yaml` + `inventory.yaml` |
| "Cannot parse Bolt output" | Set `color: false` in `bolt-project.yaml` — ANSI codes break JSON parsing |
| "Command not in whitelist" | Check the exact command string matches the whitelist entry (including spaces in prefix mode) |
| Task not in list | Run `bolt module install <module>` and verify it appears in `modules/` |
