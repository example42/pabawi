# Proxmox Integration Configuration Examples

This document provides complete, working examples for configuring and using the Proxmox integration in Pabawi.

## Table of Contents

- [Basic Configuration](#basic-configuration)
- [Authentication Examples](#authentication-examples)
- [Environment Variable Configuration](#environment-variable-configuration)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Lifecycle Action Examples](#lifecycle-action-examples)
- [Provisioning Examples](#provisioning-examples)
- [Advanced Use Cases](#advanced-use-cases)

## Basic Configuration

### Minimal Configuration with Token

```typescript
// config/integrations.ts
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc'
    }
  }
};
```

### Configuration with Custom Port

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8007, // Custom port
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc'
    }
  }
};
```

## Authentication Examples

### Token Authentication (Recommended)

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc'
    }
  }
};
```

**Creating the API Token in Proxmox:**

```bash
# Via Proxmox CLI
pveum user token add automation@pve api-token --privsep 0

# The output will be:
# ┌──────────────┬──────────────────────────────────────┐
# │ key          │ value                                │
# ╞══════════════╪══════════════════════════════════════╡
# │ full-tokenid │ automation@pve!api-token             │
# ├──────────────┼──────────────────────────────────────┤
# │ info         │ {"privsep":0}                        │
# ├──────────────┼──────────────────────────────────────┤
# │ value        │ 12345678-1234-1234-1234-123456789abc │
# └──────────────┴──────────────────────────────────────┘

# Set permissions for the token user
pveum acl modify / --users automation@pve --roles PVEVMAdmin
```

### Password Authentication with PAM

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      username: 'root',
      password: 'your-secure-password',
      realm: 'pam'
    }
  }
};
```

### Password Authentication with PVE Realm

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      username: 'automation',
      password: 'your-secure-password',
      realm: 'pve'
    }
  }
};
```

## Environment Variable Configuration

### .env File

```bash
# .env
# Proxmox Connection
PROXMOX_HOST=proxmox.example.com
PROXMOX_PORT=8006

# Token Authentication (recommended)
PROXMOX_TOKEN=automation@pve!api-token=12345678-1234-1234-1234-123456789abc

# OR Password Authentication
# PROXMOX_USERNAME=root
# PROXMOX_PASSWORD=your-secure-password
# PROXMOX_REALM=pam

# SSL Configuration
PROXMOX_SSL_VERIFY=true
PROXMOX_CA_CERT=/etc/pabawi/certs/proxmox-ca.pem

# Optional: Client Certificate Authentication
# PROXMOX_CLIENT_CERT=/etc/pabawi/certs/client.pem
# PROXMOX_CLIENT_KEY=/etc/pabawi/certs/client-key.pem

# Timeout Configuration
PROXMOX_TIMEOUT=30000
```

### Configuration Using Environment Variables

```typescript
// config/integrations.ts
import * as dotenv from 'dotenv';
dotenv.config();

export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: process.env.PROXMOX_HOST!,
      port: parseInt(process.env.PROXMOX_PORT || '8006'),
      token: process.env.PROXMOX_TOKEN,
      // Fallback to password auth if token not provided
      username: process.env.PROXMOX_USERNAME,
      password: process.env.PROXMOX_PASSWORD,
      realm: process.env.PROXMOX_REALM,
      ssl: {
        rejectUnauthorized: process.env.PROXMOX_SSL_VERIFY !== 'false',
        ca: process.env.PROXMOX_CA_CERT,
        cert: process.env.PROXMOX_CLIENT_CERT,
        key: process.env.PROXMOX_CLIENT_KEY
      },
      timeout: parseInt(process.env.PROXMOX_TIMEOUT || '30000')
    }
  }
};
```

### Docker Environment Variables

```yaml
# docker-compose.yml
version: '3.8'
services:
  pabawi:
    image: pabawi:latest
    environment:
      - PROXMOX_HOST=proxmox.example.com
      - PROXMOX_PORT=8006
      - PROXMOX_TOKEN=automation@pve!api-token=12345678-1234-1234-1234-123456789abc
      - PROXMOX_SSL_VERIFY=true
    volumes:
      - ./certs:/etc/pabawi/certs:ro
```

## SSL/TLS Configuration

### Self-Signed Certificate

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc',
      ssl: {
        rejectUnauthorized: true,
        ca: '/etc/pabawi/certs/proxmox-ca.pem'
      }
    }
  }
};
```

**Exporting Proxmox CA Certificate:**

```bash
# On Proxmox server
cat /etc/pve/pve-root-ca.pem > proxmox-ca.pem

# Copy to Pabawi server
scp proxmox-ca.pem pabawi-server:/etc/pabawi/certs/
```

### Client Certificate Authentication

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc',
      ssl: {
        rejectUnauthorized: true,
        ca: '/etc/pabawi/certs/proxmox-ca.pem',
        cert: '/etc/pabawi/certs/client.pem',
        key: '/etc/pabawi/certs/client-key.pem'
      }
    }
  }
};
```

### Disable Certificate Verification (Testing Only)

```typescript
export const integrationsConfig = {
  proxmox: {
    enabled: true,
    name: 'proxmox',
    type: 'both',
    config: {
      host: 'proxmox.example.com',
      port: 8006,
      token: 'automation@pve!api-token=12345678-1234-1234-1234-123456789abc',
      ssl: {
        rejectUnauthorized: false // WARNING: Insecure, testing only!
      }
    }
  }
};
```

**⚠️ Warning**: Disabling certificate verification is insecure and should only be used in testing environments.

## Lifecycle Action Examples

### Start a VM

```typescript
import { integrationManager } from './integrations';

async function startVM() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:100',
    action: 'start',
    parameters: {}
  });

  if (result.success) {
    console.log('VM started successfully');
  } else {
    console.error('Failed to start VM:', result.error);
  }
}
```

### Graceful Shutdown

```typescript
async function shutdownVM() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:100',
    action: 'shutdown',
    parameters: {}
  });

  if (result.success) {
    console.log('VM shutdown initiated');
  } else {
    console.error('Failed to shutdown VM:', result.error);
  }
}
```

### Force Stop

```typescript
async function stopVM() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:100',
    action: 'stop',
    parameters: {}
  });

  if (result.success) {
    console.log('VM stopped');
  } else {
    console.error('Failed to stop VM:', result.error);
  }
}
```

### Reboot a Container

```typescript
async function rebootContainer() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:101',
    action: 'reboot',
    parameters: {}
  });

  if (result.success) {
    console.log('Container rebooted');
  } else {
    console.error('Failed to reboot container:', result.error);
  }
}
```

### Suspend and Resume

```typescript
async function suspendVM() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:100',
    action: 'suspend',
    parameters: {}
  });

  if (result.success) {
    console.log('VM suspended');
  }
}

async function resumeVM() {
  const result = await integrationManager.executeAction({
    type: 'lifecycle',
    target: 'proxmox:node1:100',
    action: 'resume',
    parameters: {}
  });

  if (result.success) {
    console.log('VM resumed');
  }
}
```

## Provisioning Examples

### Create a Basic VM

```typescript
async function createBasicVM() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'create_vm',
    parameters: {
      vmid: 100,
      name: 'web-server-01',
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

  if (result.success) {
    console.log('VM created:', result.metadata);
  } else {
    console.error('Failed to create VM:', result.error);
  }
}
```

### Create a VM with Advanced Configuration

```typescript
async function createAdvancedVM() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'create_vm',
    parameters: {
      vmid: 101,
      name: 'database-server',
      node: 'node1',
      cores: 4,
      sockets: 2,
      memory: 8192,
      cpu: 'host',
      ostype: 'l26',
      disk: 'local-lvm:100',
      scsi0: 'local-lvm:100,cache=writeback,discard=on',
      network: {
        model: 'virtio',
        bridge: 'vmbr0',
        firewall: 1,
        tag: 100
      },
      ide2: 'local:iso/ubuntu-22.04-server-amd64.iso,media=cdrom'
    }
  });

  if (result.success) {
    console.log('Advanced VM created:', result.metadata);
  } else {
    console.error('Failed to create VM:', result.error);
  }
}
```

### Create an LXC Container

```typescript
async function createContainer() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'create_lxc',
    parameters: {
      vmid: 200,
      hostname: 'app-container-01',
      node: 'node1',
      ostemplate: 'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst',
      cores: 2,
      memory: 1024,
      rootfs: 'local-lvm:8',
      network: {
        name: 'eth0',
        bridge: 'vmbr0',
        ip: 'dhcp',
        firewall: 1
      },
      password: 'secure-root-password'
    }
  });

  if (result.success) {
    console.log('Container created:', result.metadata);
  } else {
    console.error('Failed to create container:', result.error);
  }
}
```

### Create Container with Static IP

```typescript
async function createContainerWithStaticIP() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'create_lxc',
    parameters: {
      vmid: 201,
      hostname: 'web-container',
      node: 'node1',
      ostemplate: 'local:vztmpl/debian-11-standard_11.7-1_amd64.tar.zst',
      cores: 1,
      memory: 512,
      rootfs: 'local-lvm:8',
      network: {
        name: 'eth0',
        bridge: 'vmbr0',
        ip: '192.168.1.100/24',
        gw: '192.168.1.1'
      }
    }
  });

  if (result.success) {
    console.log('Container with static IP created');
  }
}
```

### Destroy a VM

```typescript
async function destroyVM() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'destroy_vm',
    parameters: {
      vmid: 100,
      node: 'node1'
    }
  });

  if (result.success) {
    console.log('VM destroyed successfully');
  } else {
    console.error('Failed to destroy VM:', result.error);
  }
}
```

### Destroy a Container

```typescript
async function destroyContainer() {
  const result = await integrationManager.executeAction({
    type: 'provision',
    action: 'destroy_lxc',
    parameters: {
      vmid: 200,
      node: 'node1'
    }
  });

  if (result.success) {
    console.log('Container destroyed successfully');
  } else {
    console.error('Failed to destroy container:', result.error);
  }
}
```

## Advanced Use Cases

### Batch VM Creation

```typescript
async function createMultipleVMs() {
  const vmConfigs = [
    { vmid: 100, name: 'web-01', cores: 2, memory: 2048 },
    { vmid: 101, name: 'web-02', cores: 2, memory: 2048 },
    { vmid: 102, name: 'web-03', cores: 2, memory: 2048 }
  ];

  const results = await Promise.all(
    vmConfigs.map(config =>
      integrationManager.executeAction({
        type: 'provision',
        action: 'create_vm',
        parameters: {
          ...config,
          node: 'node1',
          disk: 'local-lvm:32',
          network: { model: 'virtio', bridge: 'vmbr0' }
        }
      })
    )
  );

  const successful = results.filter(r => r.success).length;
  console.log(`Created ${successful}/${vmConfigs.length} VMs`);
}
```

### Rolling Restart of VMs

```typescript
async function rollingRestart(vmids: number[]) {
  for (const vmid of vmids) {
    const target = `proxmox:node1:${vmid}`;
    
    // Graceful shutdown
    await integrationManager.executeAction({
      type: 'lifecycle',
      target,
      action: 'shutdown',
      parameters: {}
    });

    // Wait for shutdown
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Start VM
    await integrationManager.executeAction({
      type: 'lifecycle',
      target,
      action: 'start',
      parameters: {}
    });

    // Wait before next VM
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Usage
rollingRestart([100, 101, 102]);
```

### Get VM Facts and Display

```typescript
async function displayVMInfo(vmid: number) {
  const nodeId = `proxmox:node1:${vmid}`;
  const facts = await integrationManager.getNodeFacts(nodeId);

  console.log('VM Information:');
  console.log('  Name:', facts.name);
  console.log('  Status:', facts.status);
  console.log('  CPU Cores:', facts.cpu?.cores);
  console.log('  Memory:', facts.memory?.total, 'MB');
  console.log('  Disk:', facts.disk?.size, 'GB');
  console.log('  IP Address:', facts.network?.ip);
  
  if (facts.status === 'running') {
    console.log('  Uptime:', facts.uptime, 'seconds');
    console.log('  Memory Usage:', facts.memory?.used, 'MB');
    console.log('  CPU Usage:', facts.cpu?.usage, '%');
  }
}
```

### Monitor VM Status

```typescript
async function monitorVMStatus(vmid: number, interval: number = 5000) {
  const nodeId = `proxmox:node1:${vmid}`;
  
  setInterval(async () => {
    try {
      const facts = await integrationManager.getNodeFacts(nodeId);
      console.log(`[${new Date().toISOString()}] VM ${vmid}:`, {
        status: facts.status,
        cpu: facts.cpu?.usage,
        memory: facts.memory?.used,
        uptime: facts.uptime
      });
    } catch (error) {
      console.error('Failed to get VM status:', error);
    }
  }, interval);
}
```

### Inventory Report

```typescript
async function generateInventoryReport() {
  const inventory = await integrationManager.getInventory();
  const proxmoxNodes = inventory.filter(n => n.id.startsWith('proxmox:'));

  const report = {
    total: proxmoxNodes.length,
    running: proxmoxNodes.filter(n => n.status === 'running').length,
    stopped: proxmoxNodes.filter(n => n.status === 'stopped').length,
    vms: proxmoxNodes.filter(n => n.metadata?.type === 'qemu').length,
    containers: proxmoxNodes.filter(n => n.metadata?.type === 'lxc').length,
    byNode: {} as Record<string, number>
  };

  proxmoxNodes.forEach(node => {
    const nodeName = node.metadata?.node as string;
    report.byNode[nodeName] = (report.byNode[nodeName] || 0) + 1;
  });

  console.log('Proxmox Inventory Report:');
  console.log('  Total Guests:', report.total);
  console.log('  Running:', report.running);
  console.log('  Stopped:', report.stopped);
  console.log('  VMs:', report.vms);
  console.log('  Containers:', report.containers);
  console.log('  By Node:', report.byNode);
}
```

### Health Check with Alerting

```typescript
async function checkHealthWithAlert() {
  const health = await integrationManager.healthCheckAll();
  const proxmoxHealth = health.get('proxmox');

  if (!proxmoxHealth?.healthy) {
    // Send alert (example using console, replace with your alerting system)
    console.error('ALERT: Proxmox integration unhealthy!', {
      message: proxmoxHealth?.message,
      details: proxmoxHealth?.details,
      timestamp: new Date().toISOString()
    });

    // Could send email, Slack notification, PagerDuty alert, etc.
    // await sendAlert('Proxmox integration unhealthy', proxmoxHealth);
  } else {
    console.log('Proxmox integration healthy');
  }
}

// Run health check every 5 minutes
setInterval(checkHealthWithAlert, 5 * 60 * 1000);
```

### Auto-scaling Example

```typescript
async function autoScaleWebServers(targetCount: number) {
  const inventory = await integrationManager.getInventory();
  const webServers = inventory.filter(n => 
    n.name?.startsWith('web-') && n.id.startsWith('proxmox:')
  );

  const currentCount = webServers.length;
  
  if (currentCount < targetCount) {
    // Scale up
    const toCreate = targetCount - currentCount;
    console.log(`Scaling up: creating ${toCreate} web servers`);
    
    for (let i = 0; i < toCreate; i++) {
      const vmid = 100 + currentCount + i;
      await integrationManager.executeAction({
        type: 'provision',
        action: 'create_vm',
        parameters: {
          vmid,
          name: `web-${vmid}`,
          node: 'node1',
          cores: 2,
          memory: 2048,
          disk: 'local-lvm:32',
          network: { model: 'virtio', bridge: 'vmbr0' }
        }
      });
    }
  } else if (currentCount > targetCount) {
    // Scale down
    const toRemove = currentCount - targetCount;
    console.log(`Scaling down: removing ${toRemove} web servers`);
    
    const serversToRemove = webServers.slice(-toRemove);
    for (const server of serversToRemove) {
      const vmid = server.metadata?.vmid as number;
      await integrationManager.executeAction({
        type: 'provision',
        action: 'destroy_vm',
        parameters: {
          vmid,
          node: server.metadata?.node as string
        }
      });
    }
  } else {
    console.log('Already at target count');
  }
}
```

## Testing Configuration

### Test Connection

```typescript
async function testConnection() {
  try {
    const health = await integrationManager.healthCheckAll();
    const proxmoxHealth = health.get('proxmox');
    
    if (proxmoxHealth?.healthy) {
      console.log('✓ Connection successful');
      console.log('  Proxmox version:', proxmoxHealth.details?.version);
    } else {
      console.error('✗ Connection failed:', proxmoxHealth?.message);
    }
  } catch (error) {
    console.error('✗ Connection error:', error);
  }
}
```

### Validate Permissions

```typescript
async function validatePermissions() {
  const tests = [
    { name: 'List VMs', fn: () => integrationManager.getInventory() },
    { name: 'Get VM Facts', fn: () => integrationManager.getNodeFacts('proxmox:node1:100') },
    { name: 'List Capabilities', fn: () => integrationManager.listCapabilities() }
  ];

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✓ ${test.name}`);
    } catch (error) {
      console.error(`✗ ${test.name}:`, error);
    }
  }
}
```

## Troubleshooting Examples

### Debug Logging

```typescript
// Enable debug logging
import { LoggerService } from './services/logger';

const logger = new LoggerService({
  level: 'debug',
  component: 'proxmox-integration'
});

// All Proxmox API calls will now be logged
```

### Connection Test Script

```bash
#!/bin/bash
# test-proxmox-connection.sh

echo "Testing Proxmox connection..."

# Test basic connectivity
curl -k "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/version" \
  -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
  | jq .

# Test authentication
curl -k "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/cluster/resources?type=vm" \
  -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
  | jq '.data | length'

echo "Connection test complete"
```

## Additional Resources

- [Proxmox Integration Documentation](../integrations/proxmox.md)
- [Proxmox VE API Documentation](https://pve.proxmox.com/pve-docs/api-viewer/)
- [Proxmox VE Administration Guide](https://pve.proxmox.com/pve-docs/pve-admin-guide.html)
- [Pabawi Documentation](https://pabawi.dev/docs)
