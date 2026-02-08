# Ansible Integration Setup Guide

## Overview

The Ansible plugin enables Pabawi to execute playbooks, run ad-hoc commands, and manage inventory using Ansible. This guide covers installation, configuration, and best practices for integrating Ansible with Pabawi.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Inventory Setup](#inventory-setup)
- [Playbook Configuration](#playbook-configuration)
- [Security & Access Control](#security--access-control)
- [Testing the Integration](#testing-the-integration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

- Ansible installed and accessible in PATH (version 2.9+)
- Valid Ansible inventory file or dynamic inventory script
- SSH access to target nodes with key-based authentication
- Ansible playbooks directory (if using playbook execution)

Test Ansible installation:

```bash
# Verify Ansible is installed
ansible --version

# Test inventory access
ansible all --list-hosts -i /path/to/inventory

# Test connectivity to nodes
ansible all -m ping -i /path/to/inventory
```

## Quick Start

### Basic Configuration

**Using Environment Variables:**

```bash
# Enable Ansible integration
export ANSIBLE_ENABLED=true

# Set inventory path
export ANSIBLE_INVENTORY_PATH=/etc/ansible/hosts

# Set playbooks directory
export ANSIBLE_PLAYBOOK_PATH=/etc/ansible/playbooks

# Set default timeout (optional)
export ANSIBLE_EXECUTION_TIMEOUT=300000
```

**Using Configuration File:**

Create or edit `backend/config/integrations.yaml`:

```yaml
ansible:
  enabled: true
  inventoryPath: /etc/ansible/hosts
  playbookPath: /etc/ansible/playbooks
  defaultTimeout: 300000
  priority: 5
```

### Minimal Setup

For a quick test with default settings:

```bash
# Enable with defaults (uses /etc/ansible/hosts)
export ANSIBLE_ENABLED=true
```

## Configuration Options

### Core Settings

#### ANSIBLE_ENABLED

- **Type:** Boolean (`true` or `false`)
- **Default:** `false`
- **Description:** Enable or disable Ansible integration
- **Example:** `ANSIBLE_ENABLED=true`

#### ANSIBLE_INVENTORY_PATH

- **Type:** String (file path)
- **Required:** Yes (when enabled)
- **Description:** Path to Ansible inventory file or directory
- **Example:** `ANSIBLE_INVENTORY_PATH=/etc/ansible/hosts`
- **Notes:**
  - Can be a file or directory
  - Supports INI, YAML, or dynamic inventory scripts
  - Must be readable by Pabawi process
  - Can use relative or absolute paths

#### ANSIBLE_PLAYBOOK_PATH

- **Type:** String (directory path)
- **Required:** No
- **Description:** Directory containing Ansible playbooks
- **Example:** `ANSIBLE_PLAYBOOK_PATH=/etc/ansible/playbooks`
- **Notes:**
  - Required for playbook execution capability
  - All playbooks in this directory are available to Pabawi
  - Subdirectories are supported

### Execution Settings

#### ANSIBLE_EXECUTION_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `300000` (5 minutes)
- **Description:** Default timeout for Ansible command and playbook execution
- **Example:** `ANSIBLE_EXECUTION_TIMEOUT=600000` (10 minutes)
- **Notes:**
  - Applies to both ad-hoc commands and playbook runs
  - Can be overridden per-execution via API
  - Set higher for long-running playbooks

#### ANSIBLE_FORKS

- **Type:** Integer
- **Default:** `5` (Ansible default)
- **Description:** Number of parallel processes for Ansible execution
- **Example:** `ANSIBLE_FORKS=10`
- **Notes:**
  - Higher values = faster execution on multiple hosts
  - Limited by system resources
  - Ansible default is 5

#### ANSIBLE_VERBOSITY

- **Type:** Integer (0-4)
- **Default:** `0`
- **Description:** Ansible output verbosity level
- **Example:** `ANSIBLE_VERBOSITY=2`
- **Levels:**
  - `0`: Normal output
  - `1`: Verbose (-v)
  - `2`: More verbose (-vv)
  - `3`: Debug (-vvv)
  - `4`: Connection debug (-vvvv)

### Connection Settings

#### ANSIBLE_REMOTE_USER

- **Type:** String
- **Default:** Current user
- **Description:** Default SSH user for remote connections
- **Example:** `ANSIBLE_REMOTE_USER=ansible`
- **Notes:**
  - Can be overridden in inventory
  - Should have appropriate sudo privileges

#### ANSIBLE_PRIVATE_KEY_FILE

- **Type:** String (file path)
- **Default:** `~/.ssh/id_rsa`
- **Description:** Default SSH private key for authentication
- **Example:** `ANSIBLE_PRIVATE_KEY_FILE=/home/ansible/.ssh/ansible_key`
- **Notes:**
  - Must be readable by Pabawi process
  - Should not have a passphrase (or use ssh-agent)

#### ANSIBLE_SSH_TIMEOUT

- **Type:** Integer (seconds)
- **Default:** `10`
- **Description:** SSH connection timeout
- **Example:** `ANSIBLE_SSH_TIMEOUT=30`

### Integration Priority

#### ANSIBLE_PRIORITY

- **Type:** Integer
- **Default:** `5`
- **Description:** Priority when multiple inventory sources are configured
- **Example:** `ANSIBLE_PRIORITY=10`
- **Notes:**
  - Higher number = higher priority
  - Affects node display order in inventory

## Inventory Setup

### Static Inventory (INI Format)

Create `/etc/ansible/hosts`:

```ini
# Web servers group
[webservers]
web01.example.com
web02.example.com ansible_user=deploy

# Database servers group
[databases]
db01.example.com ansible_port=2222
db02.example.com

# Variables for all web servers
[webservers:vars]
ansible_user=www-data
http_port=80

# Parent group
[production:children]
webservers
databases
```

### Static Inventory (YAML Format)

Create `/etc/ansible/hosts.yml`:

```yaml
all:
  children:
    webservers:
      hosts:
        web01.example.com:
        web02.example.com:
      vars:
        ansible_user: deploy
        http_port: 80
    
    databases:
      hosts:
        db01.example.com:
          ansible_port: 2222
        db02.example.com:
      vars:
        ansible_user: postgres
    
    production:
      children:
        webservers:
        databases:
```

### Dynamic Inventory

Create executable script `/etc/ansible/inventory.py`:

```python
#!/usr/bin/env python3
import json
import sys

def get_inventory():
    return {
        "webservers": {
            "hosts": ["web01.example.com", "web02.example.com"],
            "vars": {
                "ansible_user": "deploy"
            }
        },
        "_meta": {
            "hostvars": {
                "web01.example.com": {
                    "ansible_host": "192.168.1.10"
                },
                "web02.example.com": {
                    "ansible_host": "192.168.1.11"
                }
            }
        }
    }

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--list":
        print(json.dumps(get_inventory()))
    elif len(sys.argv) == 3 and sys.argv[1] == "--host":
        print(json.dumps({}))
    else:
        print(json.dumps({}))
```

Make it executable:

```bash
chmod +x /etc/ansible/inventory.py
```

Configure Pabawi to use it:

```bash
export ANSIBLE_INVENTORY_PATH=/etc/ansible/inventory.py
```

## Playbook Configuration

### Directory Structure

Organize playbooks in a dedicated directory:

```
/etc/ansible/playbooks/
├── site.yml
├── webservers.yml
├── databases.yml
├── deploy.yml
├── roles/
│   ├── common/
│   ├── nginx/
│   └── postgresql/
└── group_vars/
    ├── all.yml
    ├── webservers.yml
    └── databases.yml
```

### Example Playbook

Create `/etc/ansible/playbooks/deploy.yml`:

```yaml
---
- name: Deploy application
  hosts: webservers
  become: yes
  
  tasks:
    - name: Update package cache
      apt:
        update_cache: yes
      when: ansible_os_family == "Debian"
    
    - name: Install dependencies
      apt:
        name:
          - git
          - python3
          - python3-pip
        state: present
    
    - name: Clone repository
      git:
        repo: https://github.com/example/app.git
        dest: /opt/app
        version: main
    
    - name: Install Python dependencies
      pip:
        requirements: /opt/app/requirements.txt
        virtualenv: /opt/app/venv
    
    - name: Restart application service
      systemd:
        name: myapp
        state: restarted
        enabled: yes
```

### Playbook Best Practices

1. **Use roles for reusability**
2. **Define variables in group_vars and host_vars**
3. **Use tags for selective execution**
4. **Include error handling with blocks**
5. **Use check mode for dry runs**
6. **Document playbooks with comments**

## Security & Access Control

### SSH Key Management

**Generate dedicated SSH key for Ansible:**

```bash
# Generate key
ssh-keygen -t ed25519 -f ~/.ssh/ansible_key -C "ansible@pabawi"

# Copy to target nodes
ssh-copy-id -i ~/.ssh/ansible_key.pub user@target-node

# Configure Pabawi to use it
export ANSIBLE_PRIVATE_KEY_FILE=~/.ssh/ansible_key
```

### Ansible Vault

Protect sensitive data using Ansible Vault:

```bash
# Create encrypted file
ansible-vault create secrets.yml

# Edit encrypted file
ansible-vault edit secrets.yml

# Encrypt existing file
ansible-vault encrypt vars.yml
```

Configure vault password file:

```bash
# Create password file
echo "your-vault-password" > ~/.ansible_vault_pass
chmod 600 ~/.ansible_vault_pass

# Configure Ansible to use it
export ANSIBLE_VAULT_PASSWORD_FILE=~/.ansible_vault_pass
```

### Privilege Escalation

Configure sudo access for Ansible user:

```bash
# On target nodes, create sudoers file
sudo visudo -f /etc/sudoers.d/ansible
```

Add content:

```
# Allow ansible user to run all commands without password
ansible ALL=(ALL) NOPASSWD: ALL

# Or restrict to specific commands
ansible ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/bin/apt-get
```

### Command Whitelisting

Restrict which playbooks can be executed via Pabawi:

```yaml
ansible:
  enabled: true
  playbookPath: /etc/ansible/playbooks
  allowedPlaybooks:
    - deploy.yml
    - update.yml
    - restart-services.yml
  # If not specified, all playbooks in playbookPath are allowed
```

## Testing the Integration

### Using Pabawi UI

1. **Start Pabawi:**

   ```bash
   npm run dev:backend
   ```

2. **Check Integration Status:**
   - Navigate to **Home** page
   - Look for **Ansible** in Integration Status
   - Should show: Status: Connected (green)

3. **Test Inventory:**
   - Go to **Inventory** page
   - Nodes from Ansible inventory should appear
   - Each node should show "Ansible" as source

4. **Test Command Execution:**
   - Select a node
   - Navigate to **Execute** tab
   - Choose "Ansible" as execution method
   - Run command: `uptime`
   - Verify output appears

5. **Test Playbook Execution:**
   - Navigate to **Ansible** integration page
   - Select a playbook from dropdown
   - Choose target hosts or groups
   - Click "Execute Playbook"
   - Monitor execution progress

### Using API

Test Ansible integration via API:

```bash
# Check integration status
curl http://localhost:3000/api/integrations/status

# List inventory
curl http://localhost:3000/api/integrations/ansible/inventory

# Execute command
curl -X POST http://localhost:3000/api/integrations/ansible/command \
  -H "Content-Type: application/json" \
  -d '{
    "command": "uptime",
    "targets": ["web01.example.com"]
  }'

# Execute playbook
curl -X POST http://localhost:3000/api/integrations/ansible/playbook \
  -H "Content-Type: application/json" \
  -d '{
    "playbook": "deploy.yml",
    "targets": ["webservers"],
    "extraVars": {
      "app_version": "1.2.3"
    }
  }'
```

### Using CLI

Test using Pabawi CLI:

```bash
# List inventory
pab ansible inventory

# Execute command
pab ansible run "hostname" --targets web01.example.com

# Execute command on group
pab ansible run "uptime" --targets webservers

# Execute playbook
pab ansible playbook deploy.yml --targets webservers
```

### Manual Verification

Test Ansible directly:

```bash
# Test inventory
ansible-inventory -i /etc/ansible/hosts --list

# Test connectivity
ansible all -m ping -i /etc/ansible/hosts

# Test ad-hoc command
ansible webservers -m command -a "uptime" -i /etc/ansible/hosts

# Test playbook
ansible-playbook /etc/ansible/playbooks/deploy.yml -i /etc/ansible/hosts --check
```

## Troubleshooting

### Connection Issues

#### Problem: "Ansible not found in PATH"

**Symptoms:**

- Error message: "ansible: command not found"
- Integration status shows "Error"

**Solutions:**

1. **Install Ansible:**

   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install ansible
   
   # RHEL/CentOS
   sudo yum install ansible
   
   # macOS
   brew install ansible
   
   # Python pip
   pip install ansible
   ```

2. **Verify installation:**

   ```bash
   which ansible
   ansible --version
   ```

3. **Add to PATH if needed:**

   ```bash
   export PATH=$PATH:/usr/local/bin
   ```

#### Problem: "Inventory file not found"

**Symptoms:**

- Error message: "Unable to parse inventory"
- No nodes appear in inventory

**Solutions:**

1. **Verify file exists:**

   ```bash
   ls -la /etc/ansible/hosts
   ```

2. **Check file permissions:**

   ```bash
   chmod 644 /etc/ansible/hosts
   ```

3. **Test inventory manually:**

   ```bash
   ansible-inventory -i /etc/ansible/hosts --list
   ```

4. **Check configuration:**

   ```bash
   echo $ANSIBLE_INVENTORY_PATH
   ```

#### Problem: "SSH connection failed"

**Symptoms:**

- Error message: "Failed to connect to the host via ssh"
- Timeout errors

**Solutions:**

1. **Test SSH manually:**

   ```bash
   ssh -i ~/.ssh/ansible_key user@target-node
   ```

2. **Check SSH key permissions:**

   ```bash
   chmod 600 ~/.ssh/ansible_key
   ```

3. **Verify SSH key is added:**

   ```bash
   ssh-copy-id -i ~/.ssh/ansible_key.pub user@target-node
   ```

4. **Check firewall:**

   ```bash
   # On target node
   sudo ufw status
   sudo firewall-cmd --list-ports
   ```

5. **Increase SSH timeout:**

   ```bash
   export ANSIBLE_SSH_TIMEOUT=30
   ```

### Execution Issues

#### Problem: "Permission denied" errors

**Symptoms:**

- Error message: "Permission denied"
- Sudo password prompts

**Solutions:**

1. **Configure passwordless sudo:**

   ```bash
   # On target node
   sudo visudo -f /etc/sudoers.d/ansible
   # Add: ansible ALL=(ALL) NOPASSWD: ALL
   ```

2. **Use become in playbooks:**

   ```yaml
   - name: Task requiring sudo
     become: yes
     apt:
       name: nginx
       state: present
   ```

3. **Specify become method:**

   ```bash
   export ANSIBLE_BECOME_METHOD=sudo
   export ANSIBLE_BECOME_USER=root
   ```

#### Problem: "Playbook not found"

**Symptoms:**

- Error message: "Could not find playbook"
- Playbook doesn't appear in UI

**Solutions:**

1. **Verify playbook path:**

   ```bash
   ls -la /etc/ansible/playbooks/
   ```

2. **Check file permissions:**

   ```bash
   chmod 644 /etc/ansible/playbooks/*.yml
   ```

3. **Verify configuration:**

   ```bash
   echo $ANSIBLE_PLAYBOOK_PATH
   ```

4. **Use absolute path:**

   ```bash
   export ANSIBLE_PLAYBOOK_PATH=/etc/ansible/playbooks
   ```

#### Problem: "Timeout during execution"

**Symptoms:**

- Long-running playbooks fail
- Error message: "Execution timeout"

**Solutions:**

1. **Increase timeout:**

   ```bash
   export ANSIBLE_EXECUTION_TIMEOUT=600000  # 10 minutes
   ```

2. **Optimize playbook:**
   - Use async tasks for long operations
   - Increase forks for parallel execution
   - Remove unnecessary tasks

3. **Monitor execution:**

   ```bash
   # Run playbook manually to check duration
   time ansible-playbook playbook.yml
   ```

### Performance Issues

#### Problem: "Slow playbook execution"

**Symptoms:**

- Playbooks take longer than expected
- Sequential execution on multiple hosts

**Solutions:**

1. **Increase forks:**

   ```bash
   export ANSIBLE_FORKS=20
   ```

2. **Use strategy plugins:**

   ```yaml
   - hosts: all
     strategy: free  # Don't wait for all hosts
   ```

3. **Enable pipelining:**

   ```bash
   export ANSIBLE_PIPELINING=True
   ```

4. **Use async tasks:**

   ```yaml
   - name: Long running task
     command: /usr/bin/long_task
     async: 300
     poll: 0
   ```

#### Problem: "High memory usage"

**Symptoms:**

- Pabawi process using excessive memory
- System slowdown during execution

**Solutions:**

1. **Reduce forks:**

   ```bash
   export ANSIBLE_FORKS=5
   ```

2. **Limit fact gathering:**

   ```yaml
   - hosts: all
     gather_facts: no
   ```

3. **Use serial execution:**

   ```yaml
   - hosts: all
     serial: 5  # Process 5 hosts at a time
   ```

## Best Practices

### Inventory Management

1. **Use groups for organization**
2. **Define variables at appropriate levels**
3. **Use dynamic inventory for cloud environments**
4. **Keep inventory in version control**
5. **Document host variables and groups**

### Playbook Development

1. **Use roles for modularity**
2. **Implement idempotency**
3. **Add error handling with blocks**
4. **Use tags for selective execution**
5. **Test with --check mode first**
6. **Keep playbooks in version control**

### Security

1. **Use Ansible Vault for secrets**
2. **Implement least privilege access**
3. **Rotate SSH keys regularly**
4. **Audit playbook execution logs**
5. **Restrict playbook access via whitelisting**
6. **Use dedicated service account**

### Performance

1. **Optimize fact gathering**
2. **Use appropriate fork count**
3. **Enable pipelining when possible**
4. **Use async for long-running tasks**
5. **Implement caching for facts**

### Monitoring

1. **Enable execution logging**
2. **Monitor playbook duration**
3. **Track failure rates**
4. **Set up alerts for failures**
5. **Review logs regularly**

## Configuration Checklist

Before deploying to production:

- [ ] Ansible installed and accessible in PATH
- [ ] Inventory file configured and tested
- [ ] SSH keys configured for all target nodes
- [ ] Passwordless sudo configured on target nodes
- [ ] Playbook directory configured (if using playbooks)
- [ ] Execution timeout appropriate for workload
- [ ] Ansible Vault configured for secrets
- [ ] Integration tested via UI and API
- [ ] Command execution tested on sample nodes
- [ ] Playbook execution tested (if applicable)
- [ ] Error handling tested
- [ ] Logs reviewed for errors or warnings
- [ ] Security best practices followed
- [ ] Documentation updated with environment details

## Additional Resources

- [Ansible Documentation](https://docs.ansible.com/)
- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/user_guide/playbooks_best_practices.html)
- [Ansible Vault Guide](https://docs.ansible.com/ansible/latest/user_guide/vault.html)
- [Pabawi Configuration Guide](../configuration.md)
- [Pabawi API Documentation](../api.md)
- [Pabawi User Guide](../user-guide.md)

## Support

For Ansible integration issues:

1. Check this setup guide and troubleshooting section
2. Test Ansible connectivity manually
3. Review Pabawi logs with `LOG_LEVEL=debug`
4. Check Ansible logs and output
5. Consult Ansible documentation
6. Verify SSH connectivity and permissions
