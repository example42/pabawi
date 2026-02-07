# SSH Plugin

SSH integration plugin for Pabawi that provides remote command execution and inventory management capabilities using OpenSSH.

## Features

- **Remote Command Execution**: Execute shell commands on remote nodes via SSH
- **Script Execution**: Run bash, python, and ruby scripts on remote nodes
- **Inventory Management**: Automatically discover nodes from SSH config file
- **Standardized Interfaces**: Implements InventoryCapability and RemoteExecutionCapability

## Requirements

- OpenSSH client installed and available in PATH
- SSH config file at `~/.ssh/config` (or custom path)
- SSH keys configured for passwordless authentication to target nodes

## Configuration

The plugin reads node inventory from your SSH config file (`~/.ssh/config`). Example SSH config:

```
Host web-server-01
    HostName 192.168.1.10
    User admin
    Port 22
    IdentityFile ~/.ssh/id_rsa

Host db-server-01
    HostName 192.168.1.20
    User root
    IdentityFile ~/.ssh/db_key
```

### Plugin Configuration Options

```yaml
ssh:
  enabled: true
  sshConfigPath: ~/.ssh/config  # Optional: custom SSH config path
  executionTimeout: 30000        # Optional: default timeout in milliseconds
```

## Capabilities

### Remote Execution

- `command.execute` - Execute shell commands on target nodes
- `script.execute` - Execute scripts (bash, python, ruby) on target nodes

### Inventory Management

- `inventory.list` - List all nodes from SSH config
- `inventory.get` - Get specific node details
- `inventory.groups` - List available groups
- `inventory.filter` - Filter nodes by criteria

## Usage Examples

### CLI

```bash
# Execute command on a node
pab ssh run "uptime" --targets web-server-01

# List inventory
pab ssh inventory

# Execute command on multiple nodes
pab ssh run "hostname" --targets web-server-01,db-server-01
```

### API

```typescript
// Execute command
const result = await capabilityRegistry.executeCapability(
  "command.execute",
  {
    command: "uptime",
    targets: ["web-server-01"],
  },
  context
);

// List inventory
const nodes = await capabilityRegistry.executeCapability(
  "inventory.list",
  { refresh: false },
  context
);
```

## Limitations

- Executions are synchronous (no async execution support yet)
- Multi-target execution processes targets sequentially
- Requires SSH key-based authentication (no password prompts)
- PowerShell scripts not supported on Unix-like systems

## Security Considerations

- SSH keys should be properly secured with appropriate file permissions
- Use SSH agent for key management in production environments
- Consider using SSH certificates for better key management at scale
- Review SSH config for security best practices (disable password auth, etc.)

## Future Enhancements

- Async execution support via ExecutionQueue integration
- Parallel multi-target execution
- SSH agent integration
- Support for SSH jump hosts/bastion servers
- Integration with Node Journal for execution logging
