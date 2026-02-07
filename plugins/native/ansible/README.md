# Ansible Plugin

Ansible plugin for Pabawi that provides remote execution and inventory management capabilities using Ansible.

## Features

- **Playbook Execution**: Run Ansible playbooks on target nodes
- **Command Execution**: Execute ad-hoc commands via ansible command module
- **Inventory Management**: List and manage nodes from Ansible inventory
- **Fact Collection**: Gather facts from nodes using ansible setup module

## Requirements

- Ansible installed and accessible in PATH
- Valid Ansible inventory configuration
- SSH access to target nodes

## Configuration

Configure the plugin in your integration settings:

```yaml
ansible:
  enabled: true
  inventoryPath: /path/to/inventory
  playbookPath: /path/to/playbooks
  defaultTimeout: 300000
```

## Capabilities

### Remote Execution

- `command.execute` - Execute shell commands on targets
- `task.execute` - Execute Ansible playbooks
- `script.execute` - Execute scripts on targets

### Inventory

- `inventory.list` - List all nodes from Ansible inventory
- `inventory.get` - Get specific node details
- `inventory.groups` - List available groups
- `inventory.filter` - Filter nodes by criteria

## Usage

### Execute Playbook

```bash
pabawi ansible task.execute --taskName site.yml --targets webservers
```

### Execute Command

```bash
pabawi ansible command.execute --command "uptime" --targets all
```

### List Inventory

```bash
pabawi ansible inventory.list
```
