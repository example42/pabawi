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
SSH_HOST_FINGERPRINTS_PATH=/etc/pabawi/ssh-host-fingerprints.json
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

Host trust uses an operator-managed JSON map of destination hostname and port to
accepted OpenSSH SHA-256 fingerprints. It does not read `known_hosts`, implement
trust on first use, or accept SSH host certificates. Unknown or changed keys,
missing configuration, and unreadable or malformed trust files reject the
handshake before authentication. `SSH_HOST_KEY_CHECK=false` explicitly disables
this protection and emits a warning.

Example structure (replace the illustrative fingerprint with the verified value):

```json
{
  "[192.168.1.10]:22": ["SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
  "[db.example.com]:2222": ["SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"]
}
```

Use lowercase destination names, brackets and an explicit port, including port 22.
IPv6 entries use the same form, for example `[::1]:2222`. An inventory alias uses
its `HostName` and `Port`, not its display name. If connecting by DNS name, enroll
that name rather than its resolved IP. An explicit host port overrides a URI port;
otherwise the URI port or configured default is used.

Obtain each host's fingerprint through a trusted console or configuration
management. On that host, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256`
prints the fingerprint. Enroll every server key algorithm you intend to allow.
Network collection with `ssh-keyscan` alone is not proof of identity. Record who
approved enrollment or rotation and the trusted source in your configuration
management audit history. Investigate unexpected changes before modifying pins.

Mount the fingerprint file read-only and restrict writes to trusted operators.
Protect private keys with mode 0600. Never commit private keys to version control.
New handshakes read the fingerprint file. Restart the SSH integration/application
after trust changes to close already authenticated pooled connections; updating
pins does not revoke an existing SSH session. Multiple fingerprints per endpoint
allow a planned, explicitly approved key rotation.

## Docker Volume Mounts

```yaml
services:
  pabawi:
    volumes:
      - ./ssh_config:/etc/pabawi/ssh_config:ro
      - ./keys:/keys:ro
      - ./ssh-host-fingerprints.json:/etc/pabawi/ssh-host-fingerprints.json:ro
    environment:
      SSH_ENABLED: "true"
      SSH_CONFIG_PATH: "/etc/pabawi/ssh_config"
      SSH_DEFAULT_KEY: "/keys/deploy_key"
      SSH_HOST_KEY_CHECK: "true"
      SSH_HOST_FINGERPRINTS_PATH: "/etc/pabawi/ssh-host-fingerprints.json"
```

## Troubleshooting

| Problem | Fix |
|---|---|
| No nodes in inventory | Check `SSH_CONFIG_PATH` exists and contains valid `Host` entries |
| "Connection refused" | Verify `HostName` and `Port`. Check firewall. Test manually: `ssh -i $key user@host` |
| "Permission denied" | Check `IdentityFile` path and permissions (`chmod 600`). Verify public key is in `authorized_keys`. |
| "Host key verification failed" | Verify the destination and port, inspect the managed fingerprint file, and investigate changed keys through a trusted channel before enrollment. |
| Sudo fails | Verify `SSH_SUDO_ENABLED=true` and that the user has passwordless sudo. Test: `ssh user@host sudo whoami`. |
