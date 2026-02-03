# Bolt Integration Setup Guide

## Overview

Pabawi is built on top of Puppet Bolt. This guide covers the core configuration required to connect Pabawi to your Bolt project, configure security whitelists, and enable package management tasks.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Configuration](#project-configuration)
- [Security & Whitelisting](#security--whitelisting)
- [Package Management](#package-management)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- A valid [Puppet Bolt](https://puppet.com/docs/bolt/latest/bolt.html) project directory.
- Bolt installed on the server running Pabawi (unless running via Docker).

## Project Configuration

Pabawi requires a properly structured Bolt project directory to function.

### Setting the Project Path

Configure the path to your Bolt project using the `BOLT_PROJECT_PATH` environment variable.

```bash
# Absolute path to your bolt project
BOLT_PROJECT_PATH=/opt/my-bolt-project
```

### Required File Structure

Your Bolt project directory must contain the following structure:

```
bolt-project/
├── bolt-project.yaml    # Bolt project configuration
├── inventory.yaml       # Node inventory
└── modules/            # Bolt modules directory
    ├── module1/
    └── module2/
```

### `bolt-project.yaml` Best Practices

For optimal integration with Pabawi, we recommend the following settings in your `bolt-project.yaml`:

```yaml
name: my-project
modulepath:
  - modules

# Critical: Disable color to ensure Pabawi can parse JSON output correctly
color: false

# Recommended: Apply settings
apply-settings:
  evaltrace: true
  log_level: info
  show_diff: true
```

### `inventory.yaml`

Pabawi parses your `inventory.yaml` to populate the node list.

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

## Security & Whitelisting

The command whitelist is a critical security feature that controls which ad-hoc commands can be executed on target nodes via the Pabawi UI.

### Configuration Modes

#### 1. Strict Mode (Recommended)

Only allow specific, exact commands.

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
BOLT_COMMAND_WHITELIST='["uptime", "df -h", "free -m"]'
```

#### 2. Flexible Mode

Allow commands that start with a specific prefix (allows arguments).

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
BOLT_COMMAND_WHITELIST='["systemctl status", "cat /var/log/"]'
# Allows: "systemctl status nginx", "cat /var/log/syslog"
```

#### 3. Developer Mode (Unsafe)

Allow all commands. **Do not use in production.**

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=true
```

### Whitelist Examples

#### System Monitoring

```bash
BOLT_COMMAND_WHITELIST='[
  "uptime",
  "df -h",
  "free -m",
  "top -bn1",
  "ps aux",
  "netstat -tulpn",
  "ss -tulpn"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
```

#### Log Viewing

```bash
BOLT_COMMAND_WHITELIST='[
  "cat /var/log",
  "tail /var/log",
  "grep",
  "journalctl"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
```

#### Service Management

```bash
BOLT_COMMAND_WHITELIST='[
  "systemctl status",
  "systemctl restart",
  "systemctl start",
  "systemctl stop",
  "service"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
```

#### Web Server Operations

```bash
BOLT_COMMAND_WHITELIST='[
  "nginx -t",
  "nginx -s reload",
  "apache2ctl configtest",
  "apache2ctl graceful",
  "curl -I",
  "wget --spider"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
```

### Best Practices

1. **Start restrictive**: Begin with a minimal whitelist and add commands as needed
2. **Use prefix mode carefully**: Only use prefix matching when necessary, as it's less secure
3. **Document your whitelist**: Keep a record of why each command is allowed
4. **Regular audits**: Review and update the whitelist periodically
5. **Environment-specific**: Use different whitelists for dev, staging, and production
6. **Avoid dangerous commands**: Never whitelist destructive commands like `rm`, `dd`, `mkfs`, etc.

## Package Management

Pabawi provides a UI for installing packages on nodes. You must configure which underlying Bolt tasks perform these operations.

### Configuring `BOLT_PACKAGE_TASKS`

This is a JSON array defining available package tasks.

#### Example: Default + Tiny Puppet (tp)

```bash
BOLT_PACKAGE_TASKS='[
  {
    "name": "package",
    "label": "Standard Package (built-in)",
    "parameterMapping": {
      "packageName": "name",
      "ensure": "action",
      "version": "version"
    }
  },
  {
    "name": "tp::install",
    "label": "Tiny Puppet (TP)",
    "parameterMapping": {
      "packageName": "app",
      "ensure": "ensure",
      "settings": "settings"
    }
  }
]'
```

### Parameter Mapping Keys

- `name`: The actual Bolt task name (e.g., `package`, `tp::install`).
- `label`: Human-readable name shown in the dropdown.
- `parameterMapping`: Maps the UI fields to the task's parameters:
  - `packageName`: Maps to the package name argument.
  - `ensure`: Maps to the action/state argument (install/absent).
  - `version`: Maps to the version argument.

## Performance Tuning

Adjust these settings based on your server load and project size.

### Execution Timeouts

Prevent hung processes from blocking resources.

```bash
# Timeout in milliseconds (default: 5 minutes)
BOLT_EXECUTION_TIMEOUT=300000
```

### Concurrency

Control how many Bolt processes can run simultaneously.

```bash
# Maximum concurrent Bolt processes (default: 5)
CONCURRENT_EXECUTION_LIMIT=10

# Maximum queued requests before rejection (default: 50)
MAX_QUEUE_SIZE=100
```

### Integration Priority

If you are using PuppetDB alongside Bolt, you can define which source takes precedence for node details.

```bash
# Higher number = higher priority (default: 5)
BOLT_PRIORITY=5
```

## Troubleshooting

### Common Issues

**"Bolt configuration files not found"**

- Ensure `BOLT_PROJECT_PATH` is absolute.
- Verify `bolt-project.yaml` and `inventory.yaml` exist in that directory.

**"Cannot parse Bolt output"**

- Check `bolt-project.yaml` and ensure `color: false` is set. ANSI color codes break the JSON parser.

**"Command not in whitelist"**

- If using `prefix` mode, ensure the command starts *exactly* with the whitelist string (including spaces).
- Check logs to see the exact command Pabawi attempted to run.
