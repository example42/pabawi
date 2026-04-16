# Ansible Integration

Pabawi uses Ansible for ad-hoc command execution, package installation, and playbook execution on managed hosts.

## Prerequisites

- `ansible` and `ansible-playbook` in `PATH` on the Pabawi host
- A reachable inventory file for managed hosts
- SSH connectivity from the Pabawi host to target nodes

```bash
ansible --version && ansible-playbook --version
```

## Configuration

```bash
ANSIBLE_ENABLED=true
ANSIBLE_PROJECT_PATH=/opt/ansible-project   # working directory for ansible commands
ANSIBLE_INVENTORY_PATH=inventory/hosts      # relative to ANSIBLE_PROJECT_PATH, or absolute
ANSIBLE_EXECUTION_TIMEOUT=300000            # ms, default 5 min
```

Use the **Ansible Setup Guide** in the Pabawi web UI to generate the `.env` snippet interactively.

## Inventory

Pabawi uses the configured inventory file for all Ansible operations. Any valid Ansible inventory format works.

**INI (`inventory/hosts`):**

```ini
[web]
web01.example.com
web02.example.com

[web:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
```

**YAML (`inventory/hosts.yaml`):**

```yaml
all:
  children:
    web:
      hosts:
        web01.example.com:
        web02.example.com:
      vars:
        ansible_user: ubuntu
        ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

## Playbooks

Place playbooks in `ANSIBLE_PROJECT_PATH` (e.g. `playbooks/`). They appear in the **Run Playbook** section on node detail pages.

```yaml
---
- name: Maintenance playbook
  hosts: all
  become: true
  tasks:
    - name: Ensure curl is present
      ansible.builtin.package:
        name: curl
        state: present
```

## Validation

Test from the CLI before using the UI:

```bash
cd $ANSIBLE_PROJECT_PATH
ansible all -i inventory/hosts -m ping
ansible-playbook -i inventory/hosts playbooks/site.yml --check
```

Then in Pabawi:

1. Check Integrations — Ansible should show `connected` or `degraded`
2. Execute a command on a node with tool = Ansible
3. Verify executions show `Tool: Ansible`

## Troubleshooting

| Problem | Fix |
|---|---|
| "Ansible integration is not available" | `ANSIBLE_ENABLED=true` not set, or `ansible` not in `PATH`. Restart backend after changing `.env`. |
| "Ansible inventory file was not found" | Check `ANSIBLE_PROJECT_PATH` + `ANSIBLE_INVENTORY_PATH`. Use absolute paths. Check file permissions. |
| Commands work in shell but fail in Pabawi | Check `SSH_KEY`/user in inventory vars. Set `LOG_LEVEL=debug` and check backend logs. |
