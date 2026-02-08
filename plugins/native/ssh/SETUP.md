# SSH Integration Setup Guide

## Overview

The SSH plugin enables Pabawi to execute commands and scripts on remote nodes using OpenSSH. It provides a lightweight alternative to Bolt or Ansible for simple remote execution tasks, with automatic inventory discovery from SSH config files.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [SSH Config Setup](#ssh-config-setup)
- [Authentication](#authentication)
- [Script Execution](#script-execution)
- [Testing the Integration](#testing-the-integration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Prerequisites

- OpenSSH client installed and available in PATH
- SSH config file at `~/.ssh/config` (or custom path)
- SSH keys configured for passwordless authentication to target nodes
- Target nodes accessible via SSH

Test SSH installation:

```bash
# Verify SSH is installed
ssh -V

# Test SSH config
ssh -G hostname

# Test connection to a node
ssh user@hostname "echo 'Connection successful'"
```

## Quick Start

### Basic Configuration

**Using Environment Variables:**

```bash
# Enable SSH integration
export SSH_ENABLED=true

# Optional: Custom SSH config path
export SSH_CONFIG_PATH=~/.ssh/config

# Optional: Default execution timeout
export SSH_EXECUTION_TIMEOUT=30000
```

**Using Configuration File:**

Create or edit `backend/config/integrations.yaml`:

```yaml
ssh:
  enabled: true
  sshConfigPath: ~/.ssh/config
  executionTimeout: 30000
  priority: 5
```

### Minimal Setup

For a quick test with default settings:

```bash
# Enable with defaults (uses ~/.ssh/config)
export SSH_ENABLED=true
```

## Configuration Options

### Core Settings

#### SSH_ENABLED

- **Type:** Boolean (`true` or `false`)
- **Default:** `false`
- **Description:** Enable or disable SSH integration
- **Example:** `SSH_ENABLED=true`

#### SSH_CONFIG_PATH

- **Type:** String (file path)
- **Default:** `~/.ssh/config`
- **Description:** Path to SSH config file for inventory discovery
- **Example:** `SSH_CONFIG_PATH=/etc/ssh/ssh_config`
- **Notes:**
  - Can use `~` for home directory
  - File must be readable by Pabawi process
  - Supports standard OpenSSH config format

#### SSH_EXECUTION_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `30000` (30 seconds)
- **Description:** Default timeout for SSH command execution
- **Example:** `SSH_EXECUTION_TIMEOUT=60000` (60 seconds)
- **Notes:**
  - Can be overridden per-execution via API
  - Set higher for long-running commands
  - Applies to both commands and scripts

### Connection Settings

#### SSH_CONNECT_TIMEOUT

- **Type:** Integer (seconds)
- **Default:** `10`
- **Description:** SSH connection timeout
- **Example:** `SSH_CONNECT_TIMEOUT=30`
- **Notes:**
  - Passed to SSH via `-o ConnectTimeout`
  - Useful for slow networks

#### SSH_STRICT_HOST_KEY_CHECKING

- **Type:** Boolean (`true` or `false`)
- **Default:** `true`
- **Description:** Enable strict host key checking
- **Example:** `SSH_STRICT_HOST_KEY_CHECKING=false`
- **Notes:**
  - Set to `false` for development only
  - Always use `true` in production
  - Prevents MITM attacks

#### SSH_COMPRESSION

- **Type:** Boolean (`true` or `false`)
- **Default:** `false`
- **Description:** Enable SSH compression
- **Example:** `SSH_COMPRESSION=true`
- **Notes:**
  - Useful for slow networks
  - May increase CPU usage

### Integration Priority

#### SSH_PRIORITY

- **Type:** Integer
- **Default:** `5`
- **Description:** Priority when multiple inventory sources are configured
- **Example:** `SSH_PRIORITY=10`
- **Notes:**
  - Higher number = higher priority
  - Affects node display order in inventory

## SSH Config Setup

### Basic SSH Config

Create or edit `~/.ssh/config`:

```
# Web server
Host web-server-01
    HostName 192.168.1.10
    User admin
    Port 22
    IdentityFile ~/.ssh/id_rsa

# Database server
Host db-server-01
    HostName 192.168.1.20
    User root
    Port 22
    IdentityFile ~/.ssh/db_key

# Application server with jump host
Host app-server-01
    HostName 10.0.1.30
    User deploy
    ProxyJump bastion.example.com
    IdentityFile ~/.ssh/app_key
```

### Advanced SSH Config

```
# Global defaults
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking yes
    UserKnownHostsFile ~/.ssh/known_hosts
    Compression yes

# Production web servers (pattern matching)
Host web-prod-*
    User www-data
    Port 22
    IdentityFile ~/.ssh/prod_key
    ForwardAgent no

# Specific hosts
Host web-prod-01
    HostName 192.168.1.10

Host web-prod-02
    HostName 192.168.1.11

# Development servers
Host web-dev-*
    User developer
    Port 2222
    IdentityFile ~/.ssh/dev_key

Host web-dev-01
    HostName 192.168.2.10

# Bastion/Jump host
Host bastion
    HostName bastion.example.com
    User jump-user
    IdentityFile ~/.ssh/bastion_key
    ForwardAgent yes

# Servers behind bastion
Host internal-*
    ProxyJump bastion
    User admin
    IdentityFile ~/.ssh/internal_key

Host internal-db-01
    HostName 10.0.1.20

Host internal-app-01
    HostName 10.0.1.30
```

### SSH Config Best Practices

1. **Use descriptive host names**
2. **Group related hosts with patterns**
3. **Set global defaults in `Host *` section**
4. **Use separate keys for different environments**
5. **Document special configurations with comments**
6. **Keep config file permissions secure (600)**

Set proper permissions:

```bash
chmod 600 ~/.ssh/config
chmod 700 ~/.ssh
```

## Authentication

### SSH Key Setup

**Generate SSH key:**

```bash
# Generate ED25519 key (recommended)
ssh-keygen -t ed25519 -f ~/.ssh/pabawi_key -C "pabawi@$(hostname)"

# Or generate RSA key (if ED25519 not supported)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/pabawi_key -C "pabawi@$(hostname)"
```

**Copy key to target nodes:**

```bash
# Copy public key to remote host
ssh-copy-id -i ~/.ssh/pabawi_key.pub user@hostname

# Or manually append to authorized_keys
cat ~/.ssh/pabawi_key.pub | ssh user@hostname "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

**Configure SSH config to use key:**

```
Host web-server-01
    HostName 192.168.1.10
    User admin
    IdentityFile ~/.ssh/pabawi_key
```

### SSH Agent

Use SSH agent for better key management:

```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add key to agent
ssh-add ~/.ssh/pabawi_key

# List loaded keys
ssh-add -l

# Configure SSH to use agent
# Add to ~/.ssh/config:
Host *
    AddKeysToAgent yes
    UseKeychain yes  # macOS only
```

### Multiple Keys

Manage multiple keys for different environments:

```
# Production key
Host prod-*
    IdentityFile ~/.ssh/prod_key

# Staging key
Host staging-*
    IdentityFile ~/.ssh/staging_key

# Development key
Host dev-*
    IdentityFile ~/.ssh/dev_key
```

### Jump Hosts / Bastion Servers

Access internal servers through bastion:

```
# Bastion host
Host bastion
    HostName bastion.example.com
    User jump-user
    IdentityFile ~/.ssh/bastion_key

# Internal servers via bastion
Host internal-*
    ProxyJump bastion
    User admin
    IdentityFile ~/.ssh/internal_key

# Specific internal host
Host internal-db-01
    HostName 10.0.1.20
```

Test jump host connection:

```bash
ssh -J bastion internal-db-01 "hostname"
```

## Script Execution

The SSH plugin supports executing scripts on remote nodes.

### Supported Script Types

- **Bash scripts** (`.sh`)
- **Python scripts** (`.py`)
- **Ruby scripts** (`.rb`)

### Script Execution Methods

#### Inline Script

Execute script content directly:

```bash
# Via API
curl -X POST http://localhost:3000/api/integrations/ssh/script \
  -H "Content-Type: application/json" \
  -d '{
    "script": "#!/bin/bash\necho \"Hello from $(hostname)\"\nuptime",
    "scriptType": "bash",
    "targets": ["web-server-01"]
  }'
```

#### Script File

Execute script from file:

```bash
# Create script
cat > /tmp/check-disk.sh << 'EOF'
#!/bin/bash
df -h | grep -v tmpfs
echo "---"
du -sh /var/log/* | sort -h | tail -5
EOF

# Execute via Pabawi CLI
pab ssh script /tmp/check-disk.sh --targets web-server-01
```

### Script Examples

#### System Health Check (Bash)

```bash
#!/bin/bash
echo "=== System Health Check ==="
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime)"
echo "Load Average: $(cat /proc/loadavg)"
echo "Memory Usage:"
free -h
echo "Disk Usage:"
df -h | grep -v tmpfs
echo "Top 5 Processes:"
ps aux --sort=-%mem | head -6
```

#### Log Analysis (Python)

```python
#!/usr/bin/env python3
import os
import sys
from collections import Counter

log_file = "/var/log/syslog"

if not os.path.exists(log_file):
    print(f"Log file {log_file} not found")
    sys.exit(1)

with open(log_file, 'r') as f:
    lines = f.readlines()

# Count error levels
errors = Counter()
for line in lines:
    if 'ERROR' in line:
        errors['ERROR'] += 1
    elif 'WARNING' in line:
        errors['WARNING'] += 1
    elif 'CRITICAL' in line:
        errors['CRITICAL'] += 1

print("Log Analysis Results:")
for level, count in errors.most_common():
    print(f"{level}: {count}")
```

#### Service Check (Ruby)

```ruby
#!/usr/bin/env ruby

services = ['nginx', 'postgresql', 'redis']

puts "=== Service Status Check ==="

services.each do |service|
  status = `systemctl is-active #{service}`.strip
  enabled = `systemctl is-enabled #{service}`.strip
  
  puts "#{service}:"
  puts "  Status: #{status}"
  puts "  Enabled: #{enabled}"
end
```

## Testing the Integration

### Using Pabawi UI

1. **Start Pabawi:**

   ```bash
   npm run dev:backend
   ```

2. **Check Integration Status:**
   - Navigate to **Home** page
   - Look for **SSH** in Integration Status
   - Should show: Status: Connected (green)

3. **Test Inventory:**
   - Go to **Inventory** page
   - Nodes from SSH config should appear
   - Each node should show "SSH" as source

4. **Test Command Execution:**
   - Select a node
   - Navigate to **Execute** tab
   - Choose "SSH" as execution method
   - Run command: `hostname`
   - Verify output appears

5. **Test Script Execution:**
   - Navigate to **SSH** integration page
   - Select script type (bash/python/ruby)
   - Enter script content or upload file
   - Choose target hosts
   - Click "Execute Script"
   - Monitor execution progress

### Using API

Test SSH integration via API:

```bash
# Check integration status
curl http://localhost:3000/api/integrations/status

# List inventory
curl http://localhost:3000/api/integrations/ssh/inventory

# Execute command
curl -X POST http://localhost:3000/api/integrations/ssh/command \
  -H "Content-Type: application/json" \
  -d '{
    "command": "uptime",
    "targets": ["web-server-01"]
  }'

# Execute script
curl -X POST http://localhost:3000/api/integrations/ssh/script \
  -H "Content-Type: application/json" \
  -d '{
    "script": "#!/bin/bash\necho \"Test from $(hostname)\"",
    "scriptType": "bash",
    "targets": ["web-server-01"]
  }'
```

### Using CLI

Test using Pabawi CLI:

```bash
# List inventory
pab ssh inventory

# Execute command
pab ssh run "hostname" --targets web-server-01

# Execute command on multiple nodes
pab ssh run "uptime" --targets web-server-01,db-server-01

# Execute script
pab ssh script /path/to/script.sh --targets web-server-01
```

### Manual Verification

Test SSH connectivity directly:

```bash
# Test SSH connection
ssh web-server-01 "echo 'Connection successful'"

# Test command execution
ssh web-server-01 "uptime"

# Test script execution
ssh web-server-01 "bash -s" < /path/to/script.sh

# Test with specific config
ssh -F ~/.ssh/config web-server-01 "hostname"
```

## Troubleshooting

### Connection Issues

#### Problem: "SSH not found in PATH"

**Symptoms:**

- Error message: "ssh: command not found"
- Integration status shows "Error"

**Solutions:**

1. **Install OpenSSH client:**

   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install openssh-client
   
   # RHEL/CentOS
   sudo yum install openssh-clients
   
   # macOS (usually pre-installed)
   # If needed: brew install openssh
   ```

2. **Verify installation:**

   ```bash
   which ssh
   ssh -V
   ```

#### Problem: "SSH config file not found"

**Symptoms:**

- Error message: "Config file not found"
- No nodes appear in inventory

**Solutions:**

1. **Create SSH config:**

   ```bash
   mkdir -p ~/.ssh
   touch ~/.ssh/config
   chmod 600 ~/.ssh/config
   ```

2. **Verify path:**

   ```bash
   ls -la ~/.ssh/config
   echo $SSH_CONFIG_PATH
   ```

3. **Check permissions:**

   ```bash
   chmod 600 ~/.ssh/config
   chmod 700 ~/.ssh
   ```

#### Problem: "Permission denied (publickey)"

**Symptoms:**

- Error message: "Permission denied (publickey)"
- Cannot connect to nodes

**Solutions:**

1. **Verify SSH key exists:**

   ```bash
   ls -la ~/.ssh/
   ```

2. **Check key permissions:**

   ```bash
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub
   ```

3. **Copy key to remote host:**

   ```bash
   ssh-copy-id -i ~/.ssh/id_rsa.pub user@hostname
   ```

4. **Test SSH connection manually:**

   ```bash
   ssh -v user@hostname
   ```

5. **Check authorized_keys on remote:**

   ```bash
   # On remote host
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   cat ~/.ssh/authorized_keys  # Verify key is present
   ```

#### Problem: "Connection timeout"

**Symptoms:**

- Error message: "Connection timed out"
- Long wait before failure

**Solutions:**

1. **Verify host is reachable:**

   ```bash
   ping hostname
   telnet hostname 22
   ```

2. **Check firewall:**

   ```bash
   # On target node
   sudo ufw status
   sudo firewall-cmd --list-ports
   ```

3. **Increase timeout:**

   ```bash
   export SSH_CONNECT_TIMEOUT=30
   export SSH_EXECUTION_TIMEOUT=60000
   ```

4. **Check SSH config:**

   ```
   Host hostname
       ConnectTimeout 30
       ServerAliveInterval 60
   ```

#### Problem: "Host key verification failed"

**Symptoms:**

- Error message: "Host key verification failed"
- Warning about changed host key

**Solutions:**

1. **Remove old host key:**

   ```bash
   ssh-keygen -R hostname
   ```

2. **Accept new host key:**

   ```bash
   ssh-keyscan hostname >> ~/.ssh/known_hosts
   ```

3. **For development only:**

   ```bash
   export SSH_STRICT_HOST_KEY_CHECKING=false
   ```

   Or in SSH config:

   ```
   Host hostname
       StrictHostKeyChecking no
       UserKnownHostsFile /dev/null
   ```

### Execution Issues

#### Problem: "Command execution timeout"

**Symptoms:**

- Long-running commands fail
- Error message: "Execution timeout"

**Solutions:**

1. **Increase timeout:**

   ```bash
   export SSH_EXECUTION_TIMEOUT=120000  # 2 minutes
   ```

2. **Run command in background:**

   ```bash
   # Use nohup for long-running commands
   ssh hostname "nohup long-command > /tmp/output.log 2>&1 &"
   ```

3. **Check command manually:**

   ```bash
   time ssh hostname "your-command"
   ```

#### Problem: "Script execution failed"

**Symptoms:**

- Scripts fail to execute
- Error message: "Script error"

**Solutions:**

1. **Verify script syntax:**

   ```bash
   # For bash
   bash -n script.sh
   
   # For python
   python3 -m py_compile script.py
   
   # For ruby
   ruby -c script.rb
   ```

2. **Check interpreter availability:**

   ```bash
   ssh hostname "which bash python3 ruby"
   ```

3. **Test script manually:**

   ```bash
   ssh hostname "bash -s" < script.sh
   ```

4. **Check script permissions:**

   ```bash
   chmod +x script.sh
   ```

#### Problem: "No output from command"

**Symptoms:**

- Command executes but returns no output
- Empty result in UI

**Solutions:**

1. **Test command manually:**

   ```bash
   ssh hostname "your-command"
   ```

2. **Check stderr:**

   ```bash
   ssh hostname "your-command 2>&1"
   ```

3. **Verify command exists:**

   ```bash
   ssh hostname "which command-name"
   ```

### Performance Issues

#### Problem: "Slow command execution"

**Symptoms:**

- Commands take longer than expected
- High latency

**Solutions:**

1. **Enable compression:**

   ```bash
   export SSH_COMPRESSION=true
   ```

   Or in SSH config:

   ```
   Host *
       Compression yes
   ```

2. **Use connection multiplexing:**

   ```
   Host *
       ControlMaster auto
       ControlPath ~/.ssh/control-%r@%h:%p
       ControlPersist 10m
   ```

3. **Disable DNS lookup:**

   ```
   Host *
       UseDNS no
   ```

4. **Use faster cipher:**

   ```
   Host *
       Ciphers aes128-gcm@openssh.com
   ```

## Best Practices

### SSH Configuration

1. **Use descriptive host names in SSH config**
2. **Group related hosts with patterns**
3. **Set global defaults for common settings**
4. **Use separate keys for different environments**
5. **Keep SSH config in version control (without private keys)**
6. **Document special configurations**

### Security

1. **Use ED25519 keys (or RSA 4096-bit minimum)**
2. **Protect private keys with proper permissions (600)**
3. **Use SSH agent for key management**
4. **Enable strict host key checking in production**
5. **Rotate SSH keys regularly**
6. **Use dedicated service account for Pabawi**
7. **Implement jump hosts for internal networks**
8. **Audit SSH access logs regularly**

### Performance

1. **Enable connection multiplexing for repeated connections**
2. **Use compression for slow networks**
3. **Set appropriate timeouts**
4. **Use SSH agent to avoid repeated key loading**
5. **Keep SSH config organized and optimized**

### Monitoring

1. **Enable execution logging**
2. **Monitor command duration**
3. **Track failure rates**
4. **Set up alerts for connection failures**
5. **Review logs regularly**

### Script Management

1. **Test scripts locally before remote execution**
2. **Use proper shebang lines**
3. **Handle errors gracefully**
4. **Log script output**
5. **Keep scripts in version control**
6. **Document script purpose and usage**

## Configuration Checklist

Before deploying to production:

- [ ] OpenSSH client installed and accessible
- [ ] SSH config file created and configured
- [ ] SSH keys generated and distributed to all nodes
- [ ] Key permissions set correctly (600 for private, 644 for public)
- [ ] SSH connectivity tested to all nodes
- [ ] Host keys added to known_hosts
- [ ] Strict host key checking enabled
- [ ] Execution timeout appropriate for workload
- [ ] Integration tested via UI and API
- [ ] Command execution tested on sample nodes
- [ ] Script execution tested (if applicable)
- [ ] Error handling tested
- [ ] Logs reviewed for errors or warnings
- [ ] Security best practices followed
- [ ] Documentation updated with environment details

## Additional Resources

- [OpenSSH Documentation](https://www.openssh.com/manual.html)
- [SSH Config File Guide](https://www.ssh.com/academy/ssh/config)
- [SSH Key Management](https://www.ssh.com/academy/ssh/keygen)
- [SSH Agent Guide](https://www.ssh.com/academy/ssh/agent)
- [Pabawi Configuration Guide](../configuration.md)
- [Pabawi API Documentation](../api.md)
- [Pabawi User Guide](../user-guide.md)

## Support

For SSH integration issues:

1. Check this setup guide and troubleshooting section
2. Test SSH connectivity manually
3. Review Pabawi logs with `LOG_LEVEL=debug`
4. Check SSH client logs with `-v` flag
5. Verify SSH config syntax
6. Check SSH key permissions and distribution
