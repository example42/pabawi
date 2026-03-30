# Provisioning Guide

## Overview

The Provisioning page in Pabawi allows you to create new virtual machines (VMs) and Linux containers (LXC) through integrated provisioning systems. This guide covers how to access and use the provisioning interface to deploy new infrastructure resources.

## Table of Contents

- [Accessing the Provision Page](#accessing-the-provision-page)
- [Understanding the Interface](#understanding-the-interface)
- [Creating Virtual Machines](#creating-virtual-machines)
- [Creating LXC Containers](#creating-lxc-containers)
- [Monitoring Provisioning Operations](#monitoring-provisioning-operations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Accessing the Provision Page

### Prerequisites

Before you can access the Provision page, you need:

- **Provisioning Permissions**: Your user account must have provisioning permissions
- **Configured Integration**: At least one provisioning integration (e.g., Proxmox) must be configured and connected
- **Available Resources**: The target infrastructure must have available resources (CPU, memory, storage)

### Navigation

1. **From the Main Menu**:
   - Look for the **"Provision"** menu item in the top navigation bar
   - Click on "Provision" to access the provisioning interface
   - If you don't see this menu item, you may lack provisioning permissions

2. **Permission-Based Access**:
   - The Provision menu item only appears for users with provisioning permissions
   - Contact your administrator if you need access

## Understanding the Interface

### Page Layout

The Provision page consists of several key sections:

1. **Integration Selector** (if multiple integrations available):
   - Dropdown or tabs to switch between different provisioning systems
   - Shows available integrations (Proxmox, EC2, Azure, etc.)
   - Displays connection status for each integration

2. **Provisioning Forms**:
   - Tabbed interface for different resource types (VM, LXC)
   - Form fields for configuration parameters
   - Real-time validation feedback
   - Submit button (enabled when form is valid)

3. **Status Indicators**:
   - Loading indicators during operations
   - Success/error notifications
   - Progress feedback

### Available Integrations

The page automatically discovers and displays available provisioning integrations:

- **Proxmox**: Create VMs and LXC containers on Proxmox Virtual Environment
- **EC2** (future): Create AWS EC2 instances
- **Azure** (future): Create Azure virtual machines
- **Terraform** (future): Deploy infrastructure as code

Only integrations that are configured and connected will appear.

## Creating Virtual Machines

### VM Creation Workflow

#### Step 1: Select VM Tab

1. Navigate to the Provision page
2. If multiple integrations are available, select your target integration (e.g., Proxmox)
3. Click on the **"VM"** tab to access the VM creation form

#### Step 2: Configure Required Parameters

**VM ID (Required)**:

- Unique identifier for the VM
- Must be between 100 and 999999999
- Cannot conflict with existing VMs
- Example: `100`, `1001`, `5000`

**VM Name (Required)**:

- Descriptive name for the VM
- Used for identification and management
- Should be meaningful and follow your naming convention
- Example: `web-server-01`, `database-prod`, `app-staging`

**Target Node (Required)**:

- Proxmox node where the VM will be created
- Select from available nodes in your cluster
- Consider resource availability and location
- Example: `pve1`, `node-01`, `proxmox-host`

#### Step 3: Configure Optional Parameters

**CPU Configuration**:

- **Cores**: Number of CPU cores (default: 1)
  - Range: 1-128 (depending on host)
  - Example: `2`, `4`, `8`
- **Sockets**: Number of CPU sockets (default: 1)
  - Usually 1 for most workloads
  - Example: `1`, `2`
- **CPU Type**: CPU model to emulate
  - Options: `host`, `kvm64`, `qemu64`
  - `host` provides best performance
  - Example: `host`

**Memory Configuration**:

- **Memory**: RAM in megabytes (default: 512)
  - Minimum: 512 MB
  - Example: `2048` (2 GB), `4096` (4 GB), `8192` (8 GB)

**Storage Configuration**:

- **Disk (scsi0)**: Primary disk configuration
  - Format: `storage:size`
  - Example: `local-lvm:32` (32 GB on local-lvm storage)
  - Example: `ceph-pool:100` (100 GB on Ceph storage)

- **CD/DVD (ide2)**: ISO image for installation
  - Format: `storage:iso/image.iso`
  - Example: `local:iso/ubuntu-22.04-server.iso`
  - Leave empty if not needed

**Network Configuration**:

- **Network (net0)**: Network interface configuration
  - Format: `model=virtio,bridge=vmbr0`
  - Example: `model=virtio,bridge=vmbr0,firewall=1`
  - Common models: `virtio`, `e1000`, `rtl8139`

**Operating System**:

- **OS Type**: Operating system type
  - Options: `l26` (Linux 2.6+), `win10`, `win11`, `other`
  - Helps Proxmox optimize settings
  - Example: `l26`

#### Step 4: Review and Submit

1. **Validate Configuration**:
   - Check all required fields are filled
   - Verify values are within acceptable ranges
   - Review validation messages (if any)

2. **Submit Creation Request**:
   - Click the **"Create VM"** button
   - A loading indicator appears
   - Wait for the operation to complete

3. **Review Results**:
   - Success: Green notification with VM ID and details
   - Failure: Red notification with error message
   - Task ID for tracking the operation

### VM Creation Examples

**Example 1: Basic Web Server**

```
VM ID: 100
Name: web-server-01
Node: pve1
Cores: 2
Memory: 2048
Disk: local-lvm:32
Network: model=virtio,bridge=vmbr0
OS Type: l26
```

**Example 2: Database Server**

```
VM ID: 200
Name: postgres-prod
Node: pve2
Cores: 4
Memory: 8192
Sockets: 1
CPU: host
Disk: ceph-pool:100
Network: model=virtio,bridge=vmbr0,firewall=1
OS Type: l26
```

**Example 3: Windows Desktop**

```
VM ID: 300
Name: win11-desktop
Node: pve1
Cores: 4
Memory: 8192
Disk: local-lvm:64
CD/DVD: local:iso/windows11.iso
Network: model=e1000,bridge=vmbr0
OS Type: win11
```

## Creating LXC Containers

### LXC Creation Workflow

#### Step 1: Select LXC Tab

1. Navigate to the Provision page
2. Select your target integration (e.g., Proxmox)
3. Click on the **"LXC"** tab to access the container creation form

#### Step 2: Configure Required Parameters

**Container ID (Required)**:

- Unique identifier for the container
- Must be between 100 and 999999999
- Cannot conflict with existing containers or VMs
- Example: `101`, `1002`, `5001`

**Hostname (Required)**:

- Container hostname
- Must be lowercase alphanumeric with hyphens
- Used for network identification
- Example: `web-container`, `app-01`, `cache-server`

**Target Node (Required)**:

- Proxmox node where the container will be created
- Select from available nodes in your cluster
- Example: `pve1`, `node-01`

**OS Template (Required)**:

- Container template to use
- Format: `storage:vztmpl/template-name.tar.zst`
- Must exist on the target node
- Example: `local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst`
- Example: `local:vztmpl/debian-11-standard_11.7-1_amd64.tar.zst`

#### Step 3: Configure Optional Parameters

**CPU Configuration**:

- **Cores**: Number of CPU cores (default: 1)
  - Range: 1-128
  - Example: `1`, `2`, `4`

**Memory Configuration**:

- **Memory**: RAM in megabytes (default: 512)
  - Minimum: 512 MB
  - Example: `512`, `1024`, `2048`

**Storage Configuration**:

- **Root Filesystem (rootfs)**: Root filesystem size
  - Format: `storage:size`
  - Example: `local-lvm:8` (8 GB)
  - Example: `ceph-pool:16` (16 GB)

**Network Configuration**:

- **Network (net0)**: Network interface configuration
  - Format: `name=eth0,bridge=vmbr0,ip=dhcp`
  - Example: `name=eth0,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.1`
  - Use `ip=dhcp` for automatic IP assignment

**Security**:

- **Root Password**: Root password for the container
  - Optional but recommended
  - Use a strong password
  - Store securely

#### Step 4: Review and Submit

1. **Validate Configuration**:
   - Check all required fields are filled
   - Verify hostname format is correct
   - Ensure template exists on target node

2. **Submit Creation Request**:
   - Click the **"Create LXC"** button
   - A loading indicator appears
   - Wait for the operation to complete

3. **Review Results**:
   - Success: Green notification with container ID
   - Failure: Red notification with error message
   - Task ID for tracking

### LXC Creation Examples

**Example 1: Basic Web Container**

```
Container ID: 101
Hostname: web-container-01
Node: pve1
Template: local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
Cores: 1
Memory: 1024
Root FS: local-lvm:8
Network: name=eth0,bridge=vmbr0,ip=dhcp
```

**Example 2: Application Container with Static IP**

```
Container ID: 102
Hostname: app-backend
Node: pve2
Template: local:vztmpl/debian-11-standard_11.7-1_amd64.tar.zst
Cores: 2
Memory: 2048
Root FS: ceph-pool:16
Network: name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1
Password: (set securely)
```

**Example 3: Development Container**

```
Container ID: 103
Hostname: dev-env
Node: pve1
Template: local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
Cores: 2
Memory: 2048
Root FS: local-lvm:16
Network: name=eth0,bridge=vmbr0,ip=dhcp
```

## Monitoring Provisioning Operations

### Real-Time Feedback

During provisioning operations:

1. **Loading Indicators**:
   - Submit button becomes disabled
   - Spinner or progress indicator appears
   - Form fields are locked

2. **Status Updates**:
   - Operation progress displayed
   - Estimated time remaining (if available)
   - Current step in the process

3. **Completion Notifications**:
   - Success: Green toast notification with details
   - Failure: Red toast notification with error
   - Auto-dismiss after 5 seconds (success) or manual dismiss (errors)

### Viewing Created Resources

After successful provisioning:

1. **Navigate to Inventory**:
   - Click "Inventory" in the main menu
   - New VM or container appears in the list
   - May take a few moments to sync

2. **Access Node Detail Page**:
   - Click on the newly created resource
   - View configuration and status
   - Access management actions

3. **Check Execution History**:
   - View provisioning operation in execution history
   - Review operation details and output
   - Track task completion

## Best Practices

### Planning

**Before Creating Resources**:

1. **Plan Resource Allocation**:
   - Determine CPU, memory, and storage requirements
   - Check available resources on target nodes
   - Consider future growth and scaling

2. **Choose Appropriate IDs**:
   - Use a consistent numbering scheme
   - Document ID ranges for different purposes
   - Example: 100-199 for web servers, 200-299 for databases

3. **Follow Naming Conventions**:
   - Use descriptive, meaningful names
   - Include environment indicators (prod, dev, staging)
   - Example: `web-prod-01`, `db-staging-02`

4. **Select Appropriate Templates**:
   - Use official, up-to-date templates
   - Verify template compatibility with your needs
   - Test templates in development first

### Security

**Secure Configuration**:

1. **Disable Destructive Actions in Production**:
   - Set `ALLOW_DESTRUCTIVE_PROVISIONING=false` to prevent VM/container destruction
   - This blocks Proxmox destroy and AWS terminate across all integrations
   - Non-destructive lifecycle actions (start, stop, reboot) remain available

2. **Use Strong Passwords**:
   - Generate random, complex passwords
   - Store passwords in a password manager
   - Never hardcode passwords in scripts

3. **Network Segmentation**:
   - Place resources in appropriate network segments
   - Use firewalls to restrict access
   - Configure security groups properly

4. **Minimal Permissions**:
   - Grant only necessary permissions
   - Use separate accounts for different purposes
   - Audit permission usage regularly

### Resource Management

**Efficient Resource Usage**:

1. **Right-Size Resources**:
   - Don't over-provision CPU and memory
   - Start small and scale up as needed
   - Monitor resource utilization

2. **Storage Planning**:
   - Allocate appropriate disk space
   - Use thin provisioning when possible
   - Plan for backups and snapshots

3. **Network Configuration**:
   - Use DHCP for dynamic environments
   - Use static IPs for servers
   - Document IP allocations

### Testing

**Test Before Production**:

1. **Development Environment**:
   - Test provisioning in development first
   - Verify configurations work as expected
   - Document successful configurations

2. **Validation**:
   - Test VM/container starts successfully
   - Verify network connectivity
   - Check resource allocation

3. **Documentation**:
   - Document provisioning procedures
   - Keep configuration templates
   - Maintain inventory records

## Troubleshooting

### Common Issues

#### Problem: "VMID already exists"

**Symptoms**:

```
Error: VM with VMID 100 already exists on node pve1
```

**Solutions**:

1. Choose a different VMID
2. Check existing VMs: Navigate to Inventory and search
3. If the VM should be removed, delete it first via the Manage tab

#### Problem: "Insufficient resources"

**Symptoms**:

```
Error: Not enough memory available on node
Error: Storage full
```

**Solutions**:

1. Check available resources on the target node
2. Choose a node with more available resources
3. Reduce resource allocation (CPU, memory, disk)
4. Clean up unused VMs or containers

#### Problem: "Template not found"

**Symptoms**:

```
Error: Template 'local:vztmpl/ubuntu-22.04.tar.zst' not found
```

**Solutions**:

1. Verify the template name is correct
2. Check templates are downloaded on the target node
3. Download missing templates via Proxmox web interface
4. Use a different template that exists

#### Problem: "Invalid hostname format"

**Symptoms**:

```
Error: Hostname must contain only lowercase letters, numbers, and hyphens
```

**Solutions**:

1. Use only lowercase letters (a-z)
2. Use numbers (0-9)
3. Use hyphens (-) but not at start or end
4. No underscores, spaces, or special characters
5. Example: `web-server-01` ✓, `Web_Server_01` ✗

#### Problem: "Network configuration error"

**Symptoms**:

```
Error: Invalid network configuration
Error: Bridge 'vmbr1' does not exist
```

**Solutions**:

1. Verify bridge name exists on target node
2. Check network configuration syntax
3. Use correct format: `model=virtio,bridge=vmbr0`
4. Consult Proxmox documentation for network options

#### Problem: "Permission denied"

**Symptoms**:

```
Error: User does not have permission to create VMs
Error: Insufficient privileges
```

**Solutions**:

1. Contact your administrator for provisioning permissions
2. Verify your user account has the correct role
3. Check integration permissions are configured correctly

#### Problem: "Operation timeout"

**Symptoms**:

```
Error: Provisioning operation timed out
```

**Solutions**:

1. Check target node is responsive
2. Verify network connectivity to Proxmox
3. Try again - the node may have been busy
4. Contact administrator if problem persists

### Getting Help

If you encounter issues not covered here:

1. **Check Integration Status**:
   - Navigate to Setup page
   - Verify integration is connected
   - Test connection

2. **Review Error Messages**:
   - Read error messages carefully
   - Look for specific error codes
   - Note any suggested actions

3. **Check Logs**:
   - Enable Expert Mode for detailed errors
   - Review execution history
   - Check Proxmox logs on the server

4. **Contact Support**:
   - Provide error messages
   - Include configuration details (without sensitive data)
   - Describe steps to reproduce

## Related Documentation

- [Proxmox Integration Setup](integrations/proxmox.md) - Configure Proxmox integration
- [Manage Tab Guide](manage-tab-guide.md) - Manage VM and container lifecycle
- [Permissions and RBAC](permissions-rbac.md) - Understand permission requirements
- [Troubleshooting Guide](troubleshooting.md) - General troubleshooting

## Support

For additional help:

- **Documentation**: [pabawi.dev/docs](https://pabawi.dev/docs)
- **GitHub Issues**: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- **Proxmox Documentation**: [pve.proxmox.com/wiki](https://pve.proxmox.com/wiki)
