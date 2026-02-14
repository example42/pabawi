# Ansible Integration Setup Guide

## Overview

Pabawi supports Ansible as an execution integration for:

- Ad-hoc command execution on nodes
- Package installation/removal
- Playbook execution
- Execution history tracking with tool attribution (`ansible`)

This guide covers the minimum configuration needed to enable and validate Ansible in Pabawi.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Inventory Setup](#inventory-setup)
- [Playbook Setup](#playbook-setup)
- [Validation](#validation)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- `ansible` and `ansible-playbook` available in `PATH`
- A reachable inventory file for your managed hosts
- SSH (or compatible Ansible transport) connectivity from the machine running Pabawi

Example validation:

```bash
ansible --version
ansible-playbook --version
```

## Environment Configuration

Add the following to your `backend/.env`:

```bash
ANSIBLE_ENABLED=true
ANSIBLE_PROJECT_PATH=.
ANSIBLE_INVENTORY_PATH=inventory/hosts
ANSIBLE_EXECUTION_TIMEOUT=300000
```

### Variable Reference

- `ANSIBLE_ENABLED`: Enables Ansible integration (`true`/`false`)
- `ANSIBLE_PROJECT_PATH`: Working directory used when running Ansible commands
- `ANSIBLE_INVENTORY_PATH`: Inventory path relative to `ANSIBLE_PROJECT_PATH` (or absolute)
- `ANSIBLE_EXECUTION_TIMEOUT`: Execution timeout in milliseconds

## Inventory Setup

Pabawi can work with your existing Ansible inventory. The configured `ANSIBLE_INVENTORY_PATH` must point to a valid inventory file.

### INI Example (`inventory/hosts`)

```ini
[linux]
web01.example.com
db01.example.com

[linux:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
```

### YAML Example (`inventory/hosts.yaml`)

```yaml
all:
  children:
    linux:
      hosts:
        web01.example.com:
        db01.example.com:
      vars:
        ansible_user: ubuntu
        ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

## Playbook Setup

Create playbooks in your project path (for example, under `playbooks/`) and execute them from the Node Actions page.

Example playbook:

```yaml
---
- name: Sample maintenance playbook
  hosts: all
  become: true
  tasks:
    - name: Ensure curl is present
      ansible.builtin.package:
        name: curl
        state: present
```

## Validation

Before testing from UI, validate directly from CLI in `ANSIBLE_PROJECT_PATH`:

```bash
ansible all -i inventory/hosts -m ping
ansible-playbook -i inventory/hosts playbooks/site.yml --check
```

Then in Pabawi:

1. Open Integrations and verify Ansible status is `connected` or `degraded`
2. Go to a node and run:
   - Command execution (select tool = Ansible)
   - Package installation (select tool = Ansible)
   - Playbook execution
3. Check Executions page and confirm `Tool` shows `Ansible`

## Troubleshooting

### "Ansible integration is not available"

- Ensure `ANSIBLE_ENABLED=true`
- Restart backend after updating `.env`
- Confirm `ansible` and `ansible-playbook` are installed on host/container

### "Ansible inventory file was not found"

- Verify `ANSIBLE_PROJECT_PATH` and `ANSIBLE_INVENTORY_PATH`
- Use absolute paths if needed
- Check file permissions for the backend process user

### Commands work in shell but fail in Pabawi

- Validate the same inventory path used by Pabawi
- Check SSH key/user in inventory vars
- Review backend logs with `LOG_LEVEL=debug`
