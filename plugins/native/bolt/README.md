# Bolt Plugin

Puppet Bolt integration for Pabawi, providing remote command and task execution capabilities.

## Overview

The Bolt plugin enables Pabawi to execute commands and tasks on remote nodes using Puppet Bolt. It provides:

- Remote command execution via SSH/WinRM
- Bolt task execution with parameter support
- Inventory management from Bolt inventory files
- Facts collection from target nodes

## Capabilities

| Capability | Category | Description | Risk Level |
|------------|----------|-------------|------------|
| `command.execute` | command | Execute shell commands on target nodes | execute |
| `task.execute` | task | Execute Bolt tasks on target nodes | execute |
| `task.list` | task | List available Bolt tasks | read |
| `inventory.list` | inventory | List nodes from Bolt inventory | read |
| `facts.query` | info | Query facts from nodes | read |

## Widgets

### Home Widget (`bolt:home-widget`)

Displays a summary tile on the home page showing:

- Total node count from inventory
- Recent execution count
- Last execution status

### Command Executor (`bolt:command-executor`)

Interactive widget for executing shell commands on nodes.

### Task Runner (`bolt:task-runner`)

Widget for browsing and executing Bolt tasks with parameter forms.

### Facts Viewer (`bolt:facts-viewer`)

Displays facts collected from nodes via Bolt.

## Configuration

Configure the Bolt plugin in `config/integrations.yaml`:

```yaml
integrations:
  bolt:
    enabled: true
    priority: 5
    config:
      projectPath: "."
      timeout: 300000
      commandWhitelist:
        allowAll: false
        matchMode: prefix
        commands:
          - "ls"
          - "cat"
          - "hostname"
          - "uptime"
```

## CLI Commands

```bash
# Run a command
pab bolt run 'hostname' --targets node1.example.com

# Execute a task
pab bolt task package::install --targets node1 --params '{"name": "nginx"}'

# List available tasks
pab bolt tasks

# Show inventory
pab bolt inventory

# Query facts
pab bolt facts node1.example.com
```

## Requirements

- Puppet Bolt installed and configured
- Valid Bolt inventory file
- SSH/WinRM access to target nodes

## Color Theme

The Bolt plugin uses orange (`#FFAE1A`) as its primary color throughout the UI.
