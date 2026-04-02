# Proxmox Integration

The Proxmox integration enables Pabawi to manage Proxmox Virtual Environment (VE) infrastructure, including virtual machines (VMs) and Linux containers (LXC). This integration provides inventory discovery, lifecycle management, and provisioning capabilities for your Proxmox cluster.

## Features

- **Inventory Discovery**: Automatically discover all VMs and containers across your Proxmox cluster
- **Group Management**: Organize resources by node, status, and type
- **Facts Retrieval**: Get detailed configuration and status information for any guest
- **Lifecycle Actions**: Start, stop, shutdown, reboot, suspend, and resume VMs and containers
- **Provisioning**: Create and destroy VMs and LXC containers programmatically
- **Health Monitoring**: Monitor the health and connectivity of your Proxmox cluster

## Configuration

All Proxmox configuration is done via environment variables in `backend/.env`. You can also use the **Proxmox Setup Guide** in the Pabawi web UI to generate the `.env` snippet — it walks you through the settings and lets you copy the result to your clipboard.

### Environment Variables

Add the following to your `backend/.env`:

```bash
# Enable Proxmox integration
PROXMOX_ENABLED=true

# Required
PROXMOX_HOST=proxmox.example.com
PROXMOX_PORT=8006

# Token authentication (recommended)
PROXMOX_TOKEN=user@realm!tokenid=uuid

# OR password authentication
PROXMOX_USERNAME=root
PROXMOX_PASSWORD=secret
PROXMOX_REALM=pam

# Optional SSL configuration
PROXMOX_SSL_VERIFY=true
PROXMOX_CA_CERT=/path/to/ca.pem
PROXMOX_CLIENT_CERT=/path/to/client.pem
PROXMOX_CLIENT_KEY=/path/to/client-key.pem
```

### Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROXMOX_ENABLED` | Yes | `false` | Enable Proxmox integration |
| `PROXMOX_HOST` | Yes | - | Proxmox server hostname or IP address |
| `PROXMOX_PORT` | No | `8006` | Proxmox API port |
| `PROXMOX_TOKEN` | No* | - | API token for authentication (recommended) |
| `PROXMOX_USERNAME` | No* | - | Username for password authentication |
| `PROXMOX_PASSWORD` | No* | - | Password for password authentication |
| `PROXMOX_REALM` | No | - | Authentication realm (required for password auth) |
| `PROXMOX_SSL_VERIFY` | No | `true` | Verify TLS certificates |
| `PROXMOX_CA_CERT` | No | - | Path to custom CA certificate |
| `PROXMOX_CLIENT_CERT` | No | - | Path to client certificate |
| `PROXMOX_CLIENT_KEY` | No | - | Path to client certificate key |
| `PROXMOX_TIMEOUT` | No | `30000` | Request timeout in milliseconds |

*Either `PROXMOX_TOKEN` or `PROXMOX_USERNAME`/`PROXMOX_PASSWORD` must be provided.

## Authentication

### Token Authentication (Recommended)

Token authentication is more secure and provides fine-grained permission control.

#### Creating an API Token

1. Log in to your Proxmox web interface
2. Navigate to **Datacenter → Permissions → API Tokens**
3. Click **Add** to create a new token
4. Select the user and enter a token ID
5. Optionally disable **Privilege Separation** for full user permissions
6. Click **Add** and copy the generated token
7. The token format is: `user@realm!tokenid=uuid`

#### Required Permissions

Grant the following permissions to the token user:

- `VM.Allocate` - Create VMs and containers
- `VM.Config.*` - Configure VMs and containers
- `VM.PowerMgmt` - Start, stop, and manage power state
- `VM.Audit` - Read VM information
- `Datastore.Allocate` - Allocate disk space

#### Configuration Example

```bash
PROXMOX_ENABLED=true
PROXMOX_HOST=proxmox.example.com
PROXMOX_PORT=8006
PROXMOX_TOKEN=automation@pve!api-token=12345678-1234-1234-1234-123456789abc
```

### Password Authentication

Password authentication uses username and password to obtain a temporary authentication ticket.

#### Configuration Example

```bash
PROXMOX_ENABLED=true
PROXMOX_HOST=proxmox.example.com
PROXMOX_PORT=8006
PROXMOX_USERNAME=root
PROXMOX_PASSWORD=your-secure-password
PROXMOX_REALM=pam
```

#### Available Realms

- `pam` - Linux PAM authentication
- `pve` - Proxmox VE authentication

**Note**: Authentication tickets expire after 2 hours by default. The integration automatically refreshes tickets when they expire.

## Inventory Discovery

The Proxmox integration automatically discovers all VMs and containers in your cluster.

### Node Format

Each discovered guest is represented as a Node with the following format:

```typescript
{
  id: 'proxmox:node-name:vmid',
  name: 'vm-name',
  status: 'running' | 'stopped' | 'paused',
  ip: '192.168.1.100', // Optional
  metadata: {
    node: 'node-name',
    type: 'qemu' | 'lxc',
    vmid: 100,
    source: 'proxmox'
  }
}
```

### Groups

Resources are automatically organized into groups:

- **By Node**: `proxmox:node:node-name` - All guests on a specific Proxmox node
- **By Status**: `proxmox:status:running` - All guests with a specific status
- **By Type**: `proxmox:type:qemu` or `proxmox:type:lxc` - All VMs or all containers

### Caching

Inventory data is cached for 60 seconds to reduce API load. Groups are also cached for 60 seconds.

## Facts Retrieval

Get detailed information about a specific VM or container:

```typescript
const facts = await integrationManager.getNodeFacts('proxmox:node1:100');
```

Facts include:

- CPU configuration (cores, sockets, CPU type)
- Memory configuration (total, current usage)
- Disk configuration (size, usage)
- Network configuration (interfaces, IP addresses)
- Current status and uptime
- Resource usage statistics (when running)

Facts are cached for 30 seconds.

## Lifecycle Actions

### Supported Actions

| Action | Description | Applies To |
|--------|-------------|------------|
| `start` | Start a VM or container | VMs, LXC |
| `stop` | Force stop a VM or container | VMs, LXC |
| `shutdown` | Gracefully shutdown a VM or container | VMs, LXC |
| `reboot` | Reboot a VM or container | VMs, LXC |
| `suspend` | Suspend a VM (save state to disk) | VMs only |
| `resume` | Resume a suspended VM | VMs only |

### Action Examples

#### Start a VM

```typescript
const result = await integrationManager.executeAction({
  type: 'lifecycle',
  target: 'proxmox:node1:100',
  action: 'start',
  parameters: {}
});
```

#### Graceful Shutdown

```typescript
const result = await integrationManager.executeAction({
  type: 'lifecycle',
  target: 'proxmox:node1:100',
  action: 'shutdown',
  parameters: {}
});
```

#### Suspend a VM

```typescript
const result = await integrationManager.executeAction({
  type: 'lifecycle',
  target: 'proxmox:node1:100',
  action: 'suspend',
  parameters: {}
});
```

### Action Results

All actions return an `ExecutionResult`:

```typescript
{
  success: true,
  output: 'VM started successfully',
  metadata: {
    vmid: 100,
    node: 'node1'
  }
}
```

## Provisioning

### Create a Virtual Machine

```typescript
const result = await integrationManager.executeAction({
  type: 'provision',
  action: 'create_vm',
  parameters: {
    vmid: 100,
    name: 'my-vm',
    node: 'node1',
    cores: 2,
    memory: 2048,
    disk: 'local-lvm:32',
    network: {
      model: 'virtio',
      bridge: 'vmbr0'
    }
  }
});
```

#### VM Creation Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `vmid` | number | Yes | - | Unique VM ID (100-999999999) |
| `name` | string | Yes | - | VM name |
| `node` | string | Yes | - | Target Proxmox node |
| `cores` | number | No | 1 | Number of CPU cores |
| `memory` | number | No | 512 | Memory in MB |
| `sockets` | number | No | 1 | Number of CPU sockets |
| `cpu` | string | No | - | CPU type (e.g., 'host') |
| `disk` | string | No | - | Disk configuration (e.g., 'local-lvm:32') |
| `network` | object | No | - | Network configuration |
| `ostype` | string | No | - | OS type (e.g., 'l26' for Linux 2.6+) |

### Create an LXC Container

```typescript
const result = await integrationManager.executeAction({
  type: 'provision',
  action: 'create_lxc',
  parameters: {
    vmid: 101,
    hostname: 'my-container',
    node: 'node1',
    ostemplate: 'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst',
    cores: 1,
    memory: 512,
    rootfs: 'local-lvm:8',
    network: {
      name: 'eth0',
      bridge: 'vmbr0',
      ip: 'dhcp'
    }
  }
});
```

#### LXC Creation Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `vmid` | number | Yes | - | Unique container ID (100-999999999) |
| `hostname` | string | Yes | - | Container hostname |
| `node` | string | Yes | - | Target Proxmox node |
| `ostemplate` | string | Yes | - | OS template path |
| `cores` | number | No | 1 | Number of CPU cores |
| `memory` | number | No | 512 | Memory in MB |
| `rootfs` | string | No | - | Root filesystem (e.g., 'local-lvm:8') |
| `network` | object | No | - | Network configuration |
| `password` | string | No | - | Root password |

### Destroy a Guest

```typescript
const result = await integrationManager.executeAction({
  type: 'provision',
  action: 'destroy_vm', // or 'destroy_lxc'
  parameters: {
    vmid: 100,
    node: 'node1'
  }
});
```

**Note**: If the guest is running, it will be automatically stopped before deletion.

## Health Monitoring

Check the health of the Proxmox integration:

```typescript
const health = await integrationManager.healthCheckAll();
const proxmoxHealth = health.get('proxmox');

console.log(proxmoxHealth);
// {
//   healthy: true,
//   message: 'Proxmox API is reachable',
//   details: { version: '7.4-3' },
//   lastCheck: 1234567890
// }
```

### Health States

- **Healthy**: API is reachable and responding
- **Degraded**: Authentication issues detected
- **Unhealthy**: API is unreachable or returning errors

Health check results are cached for 30 seconds.

## Error Handling

### Error Types

The integration provides specific error types for different failure scenarios:

- `ProxmoxAuthenticationError` - Authentication failures (401, 403)
- `ProxmoxConnectionError` - Network connectivity issues
- `ProxmoxError` - General API errors

### Common Errors

#### Authentication Failed

```
ProxmoxAuthenticationError: Failed to authenticate with Proxmox API
```

**Solution**: Verify your credentials or token are correct and have not expired.

#### Guest Not Found

```
ProxmoxError: Guest 100 not found on node node1
```

**Solution**: Verify the VMID and node name are correct.

#### VMID Already Exists

```
VM with VMID 100 already exists on node node1
```

**Solution**: Choose a different VMID or destroy the existing guest first.

#### Connection Timeout

```
ProxmoxConnectionError: Request timeout after 30000ms
```

**Solution**: Check network connectivity to the Proxmox server or increase the timeout value.

### Retry Logic

The integration automatically retries transient failures:

- Network timeouts (ETIMEDOUT)
- Connection resets (ECONNRESET)
- DNS resolution failures (ENOTFOUND)
- Rate limiting (429)
- Server errors (5xx)

Retry configuration:

- Maximum attempts: 3
- Initial delay: 1 second
- Exponential backoff with 2x multiplier
- Maximum delay: 10 seconds

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to Proxmox API

**Solutions**:

1. Verify the host and port are correct
2. Check firewall rules allow access to port 8006
3. Ensure Proxmox API is enabled and running
4. Test connectivity: `curl -k https://proxmox.example.com:8006/api2/json/version`

### Authentication Issues

**Problem**: Authentication fails with valid credentials

**Solutions**:

1. For token auth: Verify the token format is `user@realm!tokenid=uuid`
2. For password auth: Verify the realm is correct (`pam` or `pve`)
3. Check user permissions in Proxmox
4. Verify the user account is not locked or expired

### SSL Certificate Issues

**Problem**: SSL certificate verification fails

**Solutions**:

1. For self-signed certificates, provide the CA certificate path:

   ```bash
   PROXMOX_CA_CERT=/path/to/ca.pem
   ```

2. For testing only, disable certificate verification:

   ```bash
   PROXMOX_SSL_VERIFY=false
   ```

   **Warning**: This is insecure and should not be used in production.

### Permission Issues

**Problem**: Operations fail with permission denied errors

**Solutions**:

1. Verify the user has the required permissions:
   - `VM.Allocate` for creating VMs
   - `VM.PowerMgmt` for lifecycle actions
   - `VM.Config.*` for configuration changes
2. Check permissions at both user and token level
3. Ensure permissions are set on the correct path (/, /vms/, etc.)

### Performance Issues

**Problem**: Slow response times or timeouts

**Solutions**:

1. Check Proxmox server load and performance
2. Increase cache TTL to reduce API calls
3. Increase timeout value in configuration
4. Use token authentication instead of password authentication
5. Monitor network latency between Pabawi and Proxmox

### Task Timeout

**Problem**: Long-running operations timeout

**Solutions**:

1. Increase the timeout value in configuration
2. Check Proxmox task logs for the specific operation
3. Verify sufficient resources are available on the target node
4. For VM creation, ensure the storage is not slow or full

## Best Practices

### Security

1. **Use Token Authentication**: More secure than password authentication
2. **Enable Certificate Verification**: Always verify TLS certificates in production
3. **Least Privilege**: Grant only required permissions to API tokens
4. **Rotate Credentials**: Regularly rotate API tokens and passwords
5. **Secure Storage**: Store credentials in `backend/.env` with restricted file permissions (`chmod 600`) and never commit to version control

### Performance

1. **Use Caching**: Default cache TTLs are optimized for most use cases
2. **Batch Operations**: When possible, perform multiple operations in parallel
3. **Monitor Health**: Regularly check integration health to detect issues early
4. **Connection Pooling**: The integration reuses connections automatically

### Reliability

1. **Handle Errors**: Always check `ExecutionResult.success` before proceeding
2. **Retry Logic**: The integration handles transient failures automatically
3. **Health Checks**: Monitor health status and alert on failures
4. **Logging**: Enable debug logging for troubleshooting

### Operations

1. **Test First**: Test provisioning operations in a development environment
2. **Unique VMIDs**: Use a VMID allocation strategy to avoid conflicts
3. **Resource Limits**: Monitor Proxmox cluster resources before provisioning
4. **Backup**: Always backup important VMs before destructive operations

## API Reference

### Integration Methods

#### getInventory()

Returns all VMs and containers in the Proxmox cluster.

```typescript
const nodes = await proxmoxIntegration.getInventory();
```

#### getGroups()

Returns groups organized by node, status, and type.

```typescript
const groups = await proxmoxIntegration.getGroups();
```

#### getNodeFacts(nodeId: string)

Returns detailed facts for a specific guest.

```typescript
const facts = await proxmoxIntegration.getNodeFacts('proxmox:node1:100');
```

#### executeAction(action: Action)

Executes a lifecycle or provisioning action.

```typescript
const result = await proxmoxIntegration.executeAction({
  type: 'lifecycle',
  target: 'proxmox:node1:100',
  action: 'start',
  parameters: {}
});
```

#### listCapabilities()

Returns available lifecycle actions.

```typescript
const capabilities = proxmoxIntegration.listCapabilities();
```

#### listProvisioningCapabilities()

Returns available provisioning operations.

```typescript
const capabilities = proxmoxIntegration.listProvisioningCapabilities();
```

#### performHealthCheck()

Checks the health of the Proxmox connection.

```typescript
const health = await proxmoxIntegration.performHealthCheck();
```

## Examples

See the [Configuration Examples](../examples/proxmox-examples.md) document for complete working examples.

## Support

For issues, questions, or contributions:

- GitHub Issues: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- Documentation: [pabawi.dev/docs](https://pabawi.dev/docs)
- Proxmox API Docs: [pve.proxmox.com/pve-docs/api-viewer](https://pve.proxmox.com/pve-docs/api-viewer/)
