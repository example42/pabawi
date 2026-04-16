# SSH Integration

Direct SSH execution without Bolt or Ansible. Useful for nodes that aren't in a Bolt inventory or Ansible inventory, or when you want lower-level access.

## Configuration

```bash
SSH_ENABLED=true
SSH_CONFIG_PATH=/etc/pabawi/ssh_config   # OpenSSH config file defining hosts
SSH_DEFAULT_USER=deploy
SSH_DEFAULT_PORT=22
SSH_DEFAULT_KEY=/path/to/private_key
SSH_PRIORITY=50                          # inventory priority (default 50, highest of all sources)
```

**Connection settings:**

```bash
SSH_HOST_KEY_CHECK=true          # always true in production
SSH_CONNECTION_TIMEOUT=30        # seconds
SSH_COMMAND_TIMEOUT=300          # seconds
SSH_MAX_CONNECTIONS=50           # total connection pool size
SSH_MAX_CONNECTIONS_PER_HOST=5
SSH_IDLE_TIMEOUT=300             # seconds before idle connection is closed
SSH_CONCURRENCY_LIMIT=10        # max parallel command executions
```

**Sudo:**

```bash
SSH_SUDO_ENABLED=true
SSH_SUDO_COMMAND=sudo
SSH_SUDO_PASSWORDLESS=true
SSH_SUDO_USER=root
# SSH_SUDO_PASSWORD=             # only if not passwordless
```

Use the **SSH Setup Guide** in the Pabawi web UI to generate the `.env` snippet.

## SSH Config File

Pabawi reads an OpenSSH-format config file to discover hosts. The config file path is set by `SSH_CONFIG_PATH`.

```
Host web01 web-server-01
    HostName 192.168.1.10
    User deploy
    Port 22
    IdentityFile ~/.ssh/deploy_key
    # Groups: webservers,production

Host db01
    HostName 192.168.1.20
    User dbadmin
    Port 2222
    IdentityFile ~/.ssh/db_key
    # Groups: databases,production

Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking yes
```

**Supported keywords:** `Host`, `HostName`, `User`, `Port`, `IdentityFile`

**Groups:** Use a comment `# Groups: group1,group2` on the line before a `Host` block to assign nodes to inventory groups.

## Security

```bash
# Set restrictive permissions on private keys
chmod 600 ~/.ssh/pabawi_key

# Add host keys to known_hosts before enabling SSH_HOST_KEY_CHECK=true
ssh-keyscan -H 192.168.1.10 >> ~/.ssh/known_hosts
```

Never commit private keys to version control. Use Kubernetes Secrets or encrypted Docker volumes for key storage.

## Docker Volume Mounts

```yaml
services:
  pabawi:
    volumes:
      - ./ssh_config:/etc/pabawi/ssh_config:ro
      - ./keys:/keys:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro
    environment:
      SSH_ENABLED: "true"
      SSH_CONFIG_PATH: "/etc/pabawi/ssh_config"
      SSH_DEFAULT_KEY: "/keys/deploy_key"
      SSH_HOST_KEY_CHECK: "true"
```

## Troubleshooting

| Problem | Fix |
|---|---|
| No nodes in inventory | Check `SSH_CONFIG_PATH` exists and contains valid `Host` entries |
| "Connection refused" | Verify `HostName` and `Port`. Check firewall. Test manually: `ssh -i $key user@host` |
| "Permission denied" | Check `IdentityFile` path and permissions (`chmod 600`). Verify public key is in `authorized_keys`. |
| "Host key verification failed" | Add the host key: `ssh-keyscan -H <host> >> ~/.ssh/known_hosts`. Or disable: `SSH_HOST_KEY_CHECK=false` (not for production). |
| Sudo fails | Verify `SSH_SUDO_ENABLED=true` and that the user has passwordless sudo. Test: `ssh user@host sudo whoami`. |
