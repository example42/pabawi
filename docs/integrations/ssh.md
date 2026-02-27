# SSH Integration Setup Guide

## Overview

The SSH integration provides native remote execution capabilities for Pabawi, enabling direct command execution, package management, and inventory management on remote hosts via SSH without requiring external automation tools like Ansible or Bolt.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [SSH Config File](#ssh-config-file)
- [Security Best Practices](#security-best-practices)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

## Features

- **Remote Command Execution**: Execute shell commands on remote hosts via SSH
- **Connection Pooling**: Efficient connection reuse for improved performance
- **Package Management**: Install, remove, and update packages across multiple Linux distributions (apt, yum, dnf, zypper, pacman)
- **Concurrent Execution**: Execute commands on multiple hosts in parallel with configurable limits
- **SSH Config Support**: Use standard OpenSSH config files for host definitions
- **Privilege Escalation**: Execute commands with sudo support
- **Inventory Management**: Integrate with Pabawi's unified inventory system
- **Health Monitoring**: Built-in health checks for connection verification

## Prerequisites

- SSH access to target hosts
- SSH keys configured for authentication (recommended) or password authentication
- Target hosts' public keys in `known_hosts` (if host key checking is enabled)
- Appropriate user permissions on target hosts

## Configuration

The SSH integration is configured entirely through environment variables.

### Core Configuration

```bash
# Enable SSH integration
SSH_ENABLED=true

# Path to SSH config file (OpenSSH format)
SSH_CONFIG_PATH=/etc/pabawi/ssh_config

# Default SSH username (required when enabled)
SSH_DEFAULT_USER=deploy

# Default SSH port (1-65535)
SSH_DEFAULT_PORT=22

# Default private key path
SSH_DEFAULT_KEY=/path/to/private_key
```

### Connection Settings

```bash
# Verify SSH host keys against known_hosts
SSH_HOST_KEY_CHECK=true

# Connection timeout in seconds (5-300)
SSH_CONNECTION_TIMEOUT=30

# Command execution timeout in seconds (10-3600)
SSH_COMMAND_TIMEOUT=300

# Maximum total connections in pool (1-1000)
SSH_MAX_CONNECTIONS=50

# Maximum connections per host (1-100)
SSH_MAX_CONNECTIONS_PER_HOST=5

# Idle connection timeout in seconds (10-3600)
SSH_IDLE_TIMEOUT=300

# Maximum concurrent command executions (1-100)
SSH_CONCURRENCY_LIMIT=10
```

### Sudo Configuration

```bash
# Enable sudo for privilege escalation
SSH_SUDO_ENABLED=true

# Sudo command prefix
SSH_SUDO_COMMAND=sudo

# Whether sudo is passwordless
SSH_SUDO_PASSWORDLESS=true

# Sudo password (if not passwordless)
SSH_SUDO_PASSWORD=

# User to run commands as with sudo
SSH_SUDO_USER=root
```

### Plugin Priority

```bash
# Plugin priority for inventory deduplication (0-100)
SSH_PRIORITY=50
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  pabawi:
    image: pabawi:latest
    environment:
      # SSH Integration
      SSH_ENABLED: "true"
      SSH_CONFIG_PATH: "/config/ssh_config"
      SSH_DEFAULT_USER: "deploy"
      SSH_DEFAULT_KEY: "/keys/deploy_key"
      SSH_HOST_KEY_CHECK: "true"
      SSH_CONNECTION_TIMEOUT: "30"
      SSH_COMMAND_TIMEOUT: "300"
      SSH_MAX_CONNECTIONS: "50"
      SSH_CONCURRENCY_LIMIT: "10"
      
      # Sudo Configuration
      SSH_SUDO_ENABLED: "true"
      SSH_SUDO_PASSWORDLESS: "true"
      SSH_SUDO_USER: "root"
    volumes:
      - ./ssh_config:/config/ssh_config:ro
      - ./keys:/keys:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro
```

### Kubernetes ConfigMap Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pabawi-ssh-config
data:
  SSH_ENABLED: "true"
  SSH_CONFIG_PATH: "/config/ssh_config"
  SSH_DEFAULT_USER: "deploy"
  SSH_DEFAULT_PORT: "22"
  SSH_HOST_KEY_CHECK: "true"
  SSH_CONNECTION_TIMEOUT: "30"
  SSH_COMMAND_TIMEOUT: "300"
  SSH_MAX_CONNECTIONS: "50"
  SSH_MAX_CONNECTIONS_PER_HOST: "5"
  SSH_IDLE_TIMEOUT: "300"
  SSH_CONCURRENCY_LIMIT: "10"
  SSH_SUDO_ENABLED: "true"
  SSH_SUDO_PASSWORDLESS: "true"
  SSH_SUDO_USER: "root"
  SSH_PRIORITY: "50"
---
apiVersion: v1
kind: Secret
metadata:
  name: pabawi-ssh-keys
type: Opaque
data:
  deploy_key: <base64-encoded-private-key>
```

## SSH Config File

The SSH integration uses the standard OpenSSH client configuration file format (`~/.ssh/config` syntax). This provides compatibility with existing SSH configurations.

### Basic Example

```ssh-config
# Web servers
Host web-server-01 web01
    HostName 192.168.1.10
    User deploy
    Port 22
    IdentityFile ~/.ssh/deploy_key
    # Groups: webservers,production

Host db-server-01 db01
    HostName 192.168.1.20
    User dbadmin
    Port 2222
    IdentityFile ~/.ssh/db_key
    # Groups: databases,production

# Development servers
Host dev-*.example.com
    User developer
    Port 22
    IdentityFile ~/.ssh/dev_key
    # Groups: development

# Default settings for all hosts
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking yes
```

### Supported Keywords

- `Host` - Host pattern/alias (first value used as node name)
- `HostName` - Target hostname or IP address
- `User` - SSH username
- `Port` - SSH port (default: 22)
- `IdentityFile` - Path to private key file

### Custom Metadata

Use comments to add custom metadata for Pabawi:

```ssh-config
# Groups: group1,group2,group3
```

This allows organizing hosts into logical groups for inventory management.

## Security Best Practices

### Private Key Management

#### File Permissions

Ensure private keys have restrictive permissions:

```bash
chmod 600 ~/.ssh/pabawi_key
```

#### Key Storage

- Use encrypted volumes in Docker
- Use Kubernetes Secrets for key storage
- Never commit keys to version control

#### Key Rotation

Regularly rotate SSH keys:

```bash
# Generate new key pair
ssh-keygen -t ed25519 -f ~/.ssh/pabawi_key_new -C "pabawi@example.com"

# Deploy new public key to hosts
ssh-copy-id -i ~/.ssh/pabawi_key_new.pub user@host

# Update SSH_DEFAULT_KEY configuration
export SSH_DEFAULT_KEY=~/.ssh/pabawi_key_new
```

### Host Key Verification

#### Enable Host Key Checking

Always verify host keys in production:

```bash
SSH_HOST_KEY_CHECK=true
```

#### Maintain known_hosts

Keep known_hosts file up to date:

```bash
# Add host key manually
ssh-keyscan -H 192.168.1.10 >> ~/.ssh/known_hosts

# Or connect once to accept key
ssh user@192.168.1.10
```

#### Disable Only for Testing

Only disable host key checking in isolated test environments:

```bash
# NOT recommended for production
SSH_HOST_KEY_CHECK=false
```

### Sudo Configuration

#### Prefer Passwordless Sudo

Configure NOPASSWD in sudoers:

```bash
# /etc/sudoers.d/pabawi
deploy ALL=(ALL) NOPASSWD: ALL
```

#### Limit Sudo Commands

Restrict sudo to specific commands:

```bash
# /etc/sudoers.d/pabawi
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/systemctl
```

#### Avoid Password Storage

Never store sudo passwords in plain text:

- Use passwordless sudo when possible
- Use secure secret management if passwords are required

### Network Security

#### Use SSH Key Authentication

Disable password authentication:

```ssh-config
# /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
```

#### Restrict SSH Access

Limit SSH access by IP:

```bash
# Using firewall rules
ufw allow from 10.0.0.0/8 to any port 22
```

#### Use Non-Standard Ports

Consider using non-standard SSH ports:

```ssh-config
Host production-*
    Port 2222
```

### Connection Limits

Set appropriate limits based on infrastructure size:

```bash
# For small deployments (< 50 hosts)
SSH_MAX_CONNECTIONS=50
SSH_MAX_CONNECTIONS_PER_HOST=5

# For large deployments (> 100 hosts)
SSH_MAX_CONNECTIONS=200
SSH_MAX_CONNECTIONS_PER_HOST=10
```

### Timeout Configuration

Balance responsiveness with reliability:

```bash
# Quick operations
SSH_CONNECTION_TIMEOUT=10
SSH_COMMAND_TIMEOUT=60

# Long-running operations
SSH_CONNECTION_TIMEOUT=30
SSH_COMMAND_TIMEOUT=1800
```

## Usage Examples

### Basic Command Execution

Execute a command on a single host through the Pabawi UI or API:

```bash
# Via API
curl -X POST http://pabawi:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "integration": "ssh",
    "target": "web-server-01",
    "command": "uptime"
  }'
```

### Multi-Host Execution

Execute a command on multiple hosts:

```bash
curl -X POST http://pabawi:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "integration": "ssh",
    "target": ["web-server-01", "web-server-02"],
    "command": "systemctl status nginx"
  }'
```

### Package Management

Install a package on a host:

```bash
curl -X POST http://pabawi:3000/api/package \
  -H "Content-Type: application/json" \
  -d '{
    "integration": "ssh",
    "target": "web-server-01",
    "operation": "install",
    "package": "nginx"
  }'
```

### Sudo Execution

Execute a command with sudo:

```bash
curl -X POST http://pabawi:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "integration": "ssh",
    "target": "web-server-01",
    "command": "systemctl restart nginx",
    "sudo": true
  }'
```

## Troubleshooting

### Connection Issues

#### Connection Timeout

**Error**: `Connection timeout after 30 seconds`

**Solutions**:

1. Verify host is reachable: `ping <hostname>`
2. Check SSH service is running: `systemctl status sshd`
3. Verify firewall rules allow SSH
4. Increase connection timeout: `SSH_CONNECTION_TIMEOUT=60`

#### Authentication Failed

**Error**: `Authentication failed for user@host`

**Solutions**:

1. Verify private key path is correct
2. Check private key permissions: `ls -l ~/.ssh/key`
3. Ensure public key is in `~/.ssh/authorized_keys` on target
4. Check SSH logs on target: `journalctl -u sshd`

#### Host Key Verification Failed

**Error**: `Host key verification failed`

**Solutions**:

1. Add host key to known_hosts: `ssh-keyscan -H <host> >> ~/.ssh/known_hosts`
2. Remove old host key: `ssh-keygen -R <host>`
3. Temporarily disable checking (testing only): `SSH_HOST_KEY_CHECK=false`

### Command Execution Issues

#### Command Timeout

**Error**: `Command timeout after 300 seconds`

**Solutions**:

1. Increase command timeout: `SSH_COMMAND_TIMEOUT=600`
2. Optimize command to run faster
3. Check if command is hanging on target

#### Permission Denied

**Error**: `Permission denied (publickey)`

**Solutions**:

1. Verify user has permission to execute command
2. Enable sudo if needed: `SSH_SUDO_ENABLED=true`
3. Check sudo configuration on target

### Configuration Issues

#### Missing Required Configuration

**Error**: `SSH_DEFAULT_USER is required when SSH_ENABLED is true`

**Solutions**:

1. Set SSH_DEFAULT_USER: `export SSH_DEFAULT_USER=deploy`
2. Or disable SSH: `export SSH_ENABLED=false`

#### Invalid Timeout Range

**Error**: `SSH_CONNECTION_TIMEOUT must be between 5 and 300, got: 3`

**Solutions**:

1. Use value within valid range: `export SSH_CONNECTION_TIMEOUT=30`
2. Check documentation for valid ranges

### Performance Issues

#### Slow Command Execution

**Solutions**:

1. Enable connection pooling (enabled by default)
2. Increase max connections: `SSH_MAX_CONNECTIONS=100`
3. Increase concurrency: `SSH_CONCURRENCY_LIMIT=20`
4. Reduce idle timeout to free connections faster: `SSH_IDLE_TIMEOUT=120`

#### Connection Pool Exhausted

**Error**: `POOL_EXHAUSTED - Maximum connections reached`

**Solutions**:

1. Increase max connections: `SSH_MAX_CONNECTIONS=100`
2. Increase max connections per host: `SSH_MAX_CONNECTIONS_PER_HOST=10`
3. Reduce concurrency limit: `SSH_CONCURRENCY_LIMIT=5`
4. Check for connection leaks in logs

### Health Check Issues

#### Health Check Degraded

**Status**: `Degraded - Some hosts unreachable`

**Solutions**:

1. Check which hosts are failing in health check details
2. Verify network connectivity to failed hosts
3. Check SSH service status on failed hosts
4. Review SSH logs for connection errors

#### Health Check Unhealthy

**Status**: `Unhealthy - No hosts reachable`

**Solutions**:

1. Verify SSH_CONFIG_PATH is correct
2. Check SSH config file exists and is readable
3. Verify at least one host is defined in SSH config
4. Test manual SSH connection to hosts
5. Check network connectivity and firewall rules

## Performance Tuning

### Connection Pool Sizing

Adjust based on infrastructure size:

```bash
# Small deployments (< 50 hosts)
SSH_MAX_CONNECTIONS=50
SSH_MAX_CONNECTIONS_PER_HOST=5

# Medium deployments (50-200 hosts)
SSH_MAX_CONNECTIONS=100
SSH_MAX_CONNECTIONS_PER_HOST=10

# Large deployments (> 200 hosts)
SSH_MAX_CONNECTIONS=200
SSH_MAX_CONNECTIONS_PER_HOST=15
```

### Concurrency Tuning

Balance parallelism with resource usage:

```bash
# Conservative (low resource usage)
SSH_CONCURRENCY_LIMIT=5

# Balanced (default)
SSH_CONCURRENCY_LIMIT=10

# Aggressive (high throughput)
SSH_CONCURRENCY_LIMIT=20
```

### Timeout Optimization

Adjust timeouts based on network conditions:

```bash
# Fast, reliable networks
SSH_CONNECTION_TIMEOUT=10
SSH_COMMAND_TIMEOUT=60
SSH_IDLE_TIMEOUT=120

# Slow or unreliable networks
SSH_CONNECTION_TIMEOUT=60
SSH_COMMAND_TIMEOUT=1800
SSH_IDLE_TIMEOUT=600
```

## Integration with Other Pabawi Features

### Inventory Deduplication

When multiple integrations provide the same node, priority determines which source is used:

```bash
# SSH has lower priority than PuppetDB by default
SSH_PRIORITY=50
PUPPETDB_PRIORITY=100
```

### Execution History

All SSH command executions are stored in Pabawi's execution history and can be re-executed from the UI.

### Health Monitoring

SSH integration health status is displayed in the Pabawi dashboard alongside other integrations.

## Best Practices

1. **Start with restrictive settings**: Begin with conservative connection limits and timeouts, then adjust based on actual usage
2. **Use SSH config files**: Leverage standard SSH config format for easier management and compatibility
3. **Enable host key checking**: Always verify host keys in production environments
4. **Prefer key-based authentication**: Use SSH keys instead of passwords for better security
5. **Configure passwordless sudo**: Set up NOPASSWD in sudoers for smoother operations
6. **Monitor connection pool usage**: Watch for pool exhaustion and adjust limits accordingly
7. **Regular key rotation**: Rotate SSH keys periodically for security
8. **Test in development first**: Validate configuration in a test environment before production deployment
9. **Use appropriate timeouts**: Set timeouts based on expected command execution times
10. **Document your SSH config**: Keep comments in SSH config file explaining host purposes and groups

## See Also

- [Bolt Integration](bolt.md) - Alternative execution tool integration
- [Ansible Integration](ansible.md) - Alternative automation tool integration
- [Configuration Guide](../configuration.md) - General Pabawi configuration
- [Troubleshooting Guide](../troubleshooting.md) - General troubleshooting information
