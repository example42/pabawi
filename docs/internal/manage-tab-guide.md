# Manage Tab Usage Guide

## Overview

The Manage tab on the Node Detail page provides lifecycle management controls for virtual machines and containers. This guide explains how to use the Manage tab to start, stop, reboot, and destroy resources through the Pabawi interface.

## Table of Contents

- [Accessing the Manage Tab](#accessing-the-manage-tab)
- [Understanding the Interface](#understanding-the-interface)
- [Lifecycle Actions](#lifecycle-actions)
- [Action Availability](#action-availability)
- [Destructive Actions](#destructive-actions)
- [Monitoring Operations](#monitoring-operations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Accessing the Manage Tab

### Prerequisites

Before you can use the Manage tab:

- **Management Permissions**: Your user account must have lifecycle management permissions
- **Configured Integration**: The resource must be managed by a configured integration (e.g., Proxmox)
- **Resource Access**: You must have access to the specific resource

### Navigation

1. **From Inventory**:
   - Navigate to the Inventory page
   - Click on a VM or container
   - The Node Detail page opens

2. **Locate the Manage Tab**:
   - Look for the tab navigation on the Node Detail page
   - Tabs may include: Overview, Facts, Manage, Reports
   - Click on the **"Manage"** tab

3. **Permission-Based Access**:
   - The Manage tab only appears if you have lifecycle permissions
   - If you don't see the tab, you may lack management permissions
   - Contact your administrator for access

## Understanding the Interface

### Page Layout

The Manage tab consists of several sections:

1. **Resource Status**:
   - Current state of the resource (running, stopped, suspended)
   - Status indicator (green, red, yellow)
   - Last updated timestamp

2. **Available Actions**:
   - Action buttons for lifecycle operations
   - Buttons are enabled/disabled based on resource state
   - Only actions you have permission for are shown

3. **Action History** (optional):
   - Recent actions performed on this resource
   - Action status and timestamps
   - Links to execution details

4. **Resource Information**:
   - Resource type (VM or LXC)
   - Integration managing the resource
   - Node location

### Status Indicators

**Resource States**:

- **Running** (Green): Resource is active and operational
- **Stopped** (Red): Resource is powered off
- **Suspended** (Yellow): VM is suspended (saved to disk)
- **Paused** (Yellow): VM is paused (saved to memory)
- **Unknown** (Gray): Status cannot be determined

**Action Status**:

- **Available**: Button is enabled and clickable
- **Unavailable**: Button is disabled (grayed out)
- **In Progress**: Loading indicator, all buttons disabled
- **Hidden**: Action not available for this resource type or state

## Lifecycle Actions

### Start Action

**Purpose**: Power on a stopped VM or container

**When Available**:

- Resource state is "stopped"
- You have `lifecycle:start` permission

**How to Use**:

1. Verify resource is stopped (red status indicator)
2. Click the **"Start"** button
3. Wait for operation to complete (typically 5-30 seconds)
4. Success notification appears
5. Resource status updates to "running"

**What Happens**:

- VM/container boots up
- Operating system starts
- Network interfaces activate
- Services start automatically

**Use Cases**:

- Starting a VM after maintenance
- Bringing a container online
- Recovering from a shutdown

**Example**:

```
Resource: web-server-01
Current State: Stopped
Action: Start
Result: Resource started successfully
New State: Running
```

### Stop Action

**Purpose**: Force power off a running VM or container

**When Available**:

- Resource state is "running"
- You have `lifecycle:stop` permission

**How to Use**:

1. Verify resource is running (green status indicator)
2. Click the **"Stop"** button
3. Wait for operation to complete (typically 5-15 seconds)
4. Success notification appears
5. Resource status updates to "stopped"

**What Happens**:

- VM/container is immediately powered off
- Similar to pulling the power plug
- No graceful shutdown
- May cause data loss if not saved

**Warning**: This is a forced stop. Use "Shutdown" for graceful shutdown.

**Use Cases**:

- Emergency stop
- Unresponsive VM/container
- When graceful shutdown fails

**Example**:

```
Resource: app-server-02
Current State: Running
Action: Stop
Result: Resource stopped successfully
New State: Stopped
```

### Shutdown Action

**Purpose**: Gracefully shut down a running VM or container

**When Available**:

- Resource state is "running"
- You have `lifecycle:shutdown` permission

**How to Use**:

1. Verify resource is running (green status indicator)
2. Click the **"Shutdown"** button
3. Wait for operation to complete (typically 30-120 seconds)
4. Success notification appears
5. Resource status updates to "stopped"

**What Happens**:

- Shutdown signal sent to guest OS
- Operating system performs graceful shutdown
- Services stop cleanly
- Data is saved
- VM/container powers off

**Advantages**:

- Safe shutdown process
- No data loss
- Services stop cleanly
- Recommended method

**Use Cases**:

- Normal shutdown operations
- Maintenance preparation
- Before taking snapshots
- Planned downtime

**Example**:

```
Resource: database-prod
Current State: Running
Action: Shutdown
Result: Resource shutdown successfully
New State: Stopped
Duration: 45 seconds
```

### Reboot Action

**Purpose**: Restart a running VM or container

**When Available**:

- Resource state is "running"
- You have `lifecycle:reboot` permission

**How to Use**:

1. Verify resource is running (green status indicator)
2. Click the **"Reboot"** button
3. Wait for operation to complete (typically 30-90 seconds)
4. Success notification appears
5. Resource status remains "running" (after reboot)

**What Happens**:

- Reboot signal sent to guest OS
- Operating system performs graceful reboot
- Services restart
- VM/container comes back online

**Use Cases**:

- Applying system updates
- Clearing memory issues
- Restarting services
- Configuration changes

**Example**:

```
Resource: web-server-03
Current State: Running
Action: Reboot
Result: Resource rebooted successfully
New State: Running
Duration: 60 seconds
```

### Suspend Action

**Purpose**: Suspend a running VM (save state to disk)

**When Available**:

- Resource type is VM (not available for LXC)
- Resource state is "running"
- You have `lifecycle:suspend` permission

**How to Use**:

1. Verify resource is a VM and running
2. Click the **"Suspend"** button
3. Wait for operation to complete (typically 10-60 seconds)
4. Success notification appears
5. Resource status updates to "suspended"

**What Happens**:

- VM state saved to disk
- Memory contents written to storage
- VM powered off
- Can be resumed later with exact state

**Advantages**:

- Faster than shutdown/start
- Preserves exact state
- No boot time when resuming
- Applications remain open

**Use Cases**:

- Temporary pause
- Saving work state
- Quick maintenance
- Resource conservation

**Example**:

```
Resource: dev-workstation
Current State: Running
Action: Suspend
Result: VM suspended successfully
New State: Suspended
Duration: 25 seconds
```

### Resume Action

**Purpose**: Resume a suspended VM

**When Available**:

- Resource type is VM
- Resource state is "suspended"
- You have `lifecycle:resume` permission

**How to Use**:

1. Verify resource is suspended (yellow status indicator)
2. Click the **"Resume"** button
3. Wait for operation to complete (typically 5-30 seconds)
4. Success notification appears
5. Resource status updates to "running"

**What Happens**:

- VM state restored from disk
- Memory contents loaded
- VM resumes exactly where it left off
- Applications continue running

**Advantages**:

- Instant resume
- No boot process
- Applications remain open
- Work state preserved

**Use Cases**:

- Resuming after suspend
- Quick return to work
- Continuing interrupted tasks

**Example**:

```
Resource: dev-workstation
Current State: Suspended
Action: Resume
Result: VM resumed successfully
New State: Running
Duration: 15 seconds
```

### Destroy Action

**Purpose**: Permanently delete a VM or container

**When Available**:

- Any resource state
- You have `lifecycle:destroy` permission

**How to Use**:

1. Click the **"Destroy"** button
2. **Confirmation dialog appears**:
   - Shows resource name and ID
   - Warns about permanent deletion
   - Requires explicit confirmation
3. Review the warning carefully
4. Click **"Confirm"** to proceed or **"Cancel"** to abort
5. If confirmed, wait for operation to complete
6. Success notification appears
7. Redirected away from node detail page

**What Happens**:

- VM/container is stopped (if running)
- All data is deleted
- Disk images removed
- Configuration deleted
- Resource removed from inventory

**Warning**: This action is permanent and cannot be undone!

**Use Cases**:

- Decommissioning resources
- Cleaning up test environments
- Removing failed deployments
- Freeing up resources

**Safety Features**:

- Confirmation dialog required
- Resource name displayed for verification
- Cannot be performed accidentally
- Logged for audit purposes

**Example**:

```
Resource: test-vm-temp
Current State: Stopped
Action: Destroy
Confirmation: "Are you sure you want to destroy test-vm-temp (ID: 105)?"
User Action: Confirm
Result: Resource destroyed successfully
```

## Action Availability

### State-Based Availability

Actions are only available when the resource is in an appropriate state:

**When Stopped**:

- ✓ Start
- ✗ Stop
- ✗ Shutdown
- ✗ Reboot
- ✗ Suspend
- ✗ Resume
- ✓ Destroy

**When Running**:

- ✗ Start
- ✓ Stop
- ✓ Shutdown
- ✓ Reboot
- ✓ Suspend (VMs only)
- ✗ Resume
- ✓ Destroy

**When Suspended**:

- ✗ Start
- ✗ Stop
- ✗ Shutdown
- ✗ Reboot
- ✗ Suspend
- ✓ Resume
- ✓ Destroy

### Permission-Based Availability

Actions are only visible if you have the required permission:

**Required Permissions**:

- Start: `lifecycle:start`
- Stop: `lifecycle:stop`
- Shutdown: `lifecycle:shutdown`
- Reboot: `lifecycle:reboot`
- Suspend: `lifecycle:suspend`
- Resume: `lifecycle:resume`
- Destroy: `lifecycle:destroy`

**Permission Wildcards**:

- `lifecycle:*` - All lifecycle actions
- `*:lifecycle:*` - All lifecycle actions on all integrations

### Resource Type Restrictions

Some actions are only available for specific resource types:

**VM Only**:

- Suspend
- Resume

**Both VM and LXC**:

- Start
- Stop
- Shutdown
- Reboot
- Destroy

### Integration-Specific Actions

Different integrations may support different actions:

**Proxmox**:

- All actions supported

**Future Integrations**:

- EC2: Start, Stop, Reboot, Terminate
- Azure: Start, Stop, Restart, Delete
- May have integration-specific actions

## Destructive Actions

### Understanding Destructive Actions

**Destructive Actions** are operations that permanently delete data or resources:

- **Destroy**: Permanently deletes VM/container

**Non-Destructive Actions**:

- Start, Stop, Shutdown, Reboot, Suspend, Resume

### Safety Mechanisms

**Confirmation Dialogs**:

- Required for all destructive actions
- Display resource name and ID
- Show warning message
- Require explicit confirmation
- Cannot be bypassed

**Visual Indicators**:

- Destroy button styled differently (red)
- Warning icons displayed
- Confirmation dialog uses warning colors

**Audit Logging**:

- All destructive actions logged
- User, timestamp, and resource recorded
- Available for compliance and auditing

### Best Practices for Destructive Actions

**Before Destroying**:

1. **Verify Resource**:
   - Confirm you have the correct resource
   - Check resource name and ID
   - Review resource details

2. **Backup Data**:
   - Take snapshots if needed
   - Backup important data
   - Export configurations

3. **Check Dependencies**:
   - Verify no other resources depend on this one
   - Check for network dependencies
   - Review application dependencies

4. **Communicate**:
   - Notify team members
   - Update documentation
   - Record the action

**During Destruction**:

1. Read confirmation dialog carefully
2. Verify resource name matches
3. Confirm you want to proceed
4. Wait for operation to complete
5. Don't interrupt the process

**After Destruction**:

1. Verify resource is removed
2. Check inventory is updated
3. Update documentation
4. Notify stakeholders

## Monitoring Operations

### Real-Time Feedback

During lifecycle operations:

1. **Loading Indicators**:
   - All action buttons disabled
   - Spinner or progress indicator appears
   - Status shows "Operation in progress"

2. **Status Updates**:
   - Operation progress displayed
   - Current step shown (if available)
   - Estimated time remaining

3. **Completion Notifications**:
   - Success: Green toast notification
   - Failure: Red toast notification with error
   - Auto-dismiss (success) or manual dismiss (errors)

### Status Refresh

After operations complete:

1. **Automatic Refresh**:
   - Resource status automatically updates
   - New state reflected in UI
   - Available actions update

2. **Manual Refresh**:
   - Click refresh button if needed
   - Reload page to force update
   - Check execution history

### Execution History

View past operations:

1. **On Node Detail Page**:
   - Scroll to Execution History section
   - View recent operations on this resource
   - Filter by action type

2. **On Executions Page**:
   - Navigate to Executions from main menu
   - Filter by node name
   - View detailed execution logs

## Best Practices

### Planning Operations

**Before Performing Actions**:

1. **Verify Resource State**:
   - Check current status
   - Ensure resource is in expected state
   - Review recent changes

2. **Check Dependencies**:
   - Identify dependent services
   - Check for active connections
   - Review application dependencies

3. **Plan Timing**:
   - Choose appropriate time window
   - Consider user impact
   - Schedule during maintenance windows

4. **Communicate**:
   - Notify affected users
   - Update team members
   - Document planned actions

### Safe Operations

**Operational Safety**:

1. **Use Graceful Actions**:
   - Prefer Shutdown over Stop
   - Allow time for graceful shutdown
   - Don't force stop unless necessary

2. **Monitor Progress**:
   - Watch for completion
   - Check for errors
   - Verify expected outcome

3. **Verify Results**:
   - Confirm resource is in expected state
   - Test functionality after changes
   - Check dependent services

4. **Document Actions**:
   - Record what was done
   - Note any issues
   - Update runbooks

### Emergency Procedures

**When Things Go Wrong**:

1. **Unresponsive Resource**:
   - Try graceful shutdown first
   - Wait reasonable time
   - Use force stop if necessary
   - Document the issue

2. **Failed Operations**:
   - Review error message
   - Check resource state
   - Try again if appropriate
   - Contact administrator if needed

3. **Unexpected Behavior**:
   - Don't panic
   - Document what happened
   - Check logs
   - Seek help if needed

## Troubleshooting

### Problem: Manage Tab Not Visible

**Symptoms**:

- Manage tab missing from Node Detail page
- Cannot access lifecycle actions

**Solutions**:

1. **Check Permissions**:
   - Verify you have lifecycle permissions
   - Contact administrator for access
   - Review your assigned roles

2. **Check Resource Type**:
   - Verify resource is managed by an integration
   - Check integration is configured
   - Ensure integration is connected

3. **Refresh Page**:
   - Reload the page
   - Clear browser cache
   - Log out and log back in

### Problem: All Action Buttons Disabled

**Symptoms**:

- Action buttons appear but are grayed out
- Cannot click any actions
- No actions available message

**Solutions**:

1. **Check Resource State**:
   - Verify resource state allows actions
   - Example: Can't start a running VM
   - Wait for current operation to complete

2. **Check Permissions**:
   - Verify you have required permissions
   - Check specific action permissions
   - Contact administrator if needed

3. **Check Integration Health**:
   - Verify integration is connected
   - Test integration connectivity
   - Check for integration errors

### Problem: Action Fails with Error

**Symptoms**:

```
Error: Failed to start VM
Error: Operation timeout
Error: Resource not found
```

**Solutions**:

1. **Review Error Message**:
   - Read error carefully
   - Look for specific error codes
   - Note any suggested actions

2. **Check Resource State**:
   - Verify resource exists
   - Check resource is accessible
   - Ensure resource is in expected state

3. **Check Integration**:
   - Verify integration is connected
   - Test integration health
   - Check integration logs

4. **Retry Operation**:
   - Wait a moment
   - Try again
   - Contact administrator if persists

### Problem: Operation Hangs

**Symptoms**:

- Operation never completes
- Loading indicator stays forever
- No error or success message

**Solutions**:

1. **Wait Longer**:
   - Some operations take time
   - Shutdown can take 2-3 minutes
   - Check resource directly if possible

2. **Check Resource**:
   - Navigate to integration directly (e.g., Proxmox web UI)
   - Verify operation status
   - Check for errors

3. **Refresh Page**:
   - Reload the page
   - Check if operation completed
   - Review execution history

4. **Contact Administrator**:
   - Report the issue
   - Provide operation details
   - Include error messages

### Problem: Destroy Confirmation Not Appearing

**Symptoms**:

- Clicked Destroy but nothing happens
- No confirmation dialog
- Action seems to do nothing

**Solutions**:

1. **Check Browser**:
   - Disable popup blockers
   - Allow dialogs from Pabawi
   - Try different browser

2. **Check JavaScript**:
   - Ensure JavaScript is enabled
   - Check browser console for errors
   - Clear browser cache

3. **Refresh Page**:
   - Reload the page
   - Try action again
   - Log out and log back in

## Related Documentation

- [Provisioning Guide](provisioning-guide.md) - How to create VMs and containers
- [Permissions and RBAC](permissions-rbac.md) - Permission requirements
- [Proxmox Integration](integrations/proxmox.md) - Proxmox-specific details
- [Troubleshooting Guide](troubleshooting.md) - General troubleshooting

## Support

For additional help:

- **Documentation**: [pabawi.dev/docs](https://pabawi.dev/docs)
- **GitHub Issues**: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- **Administrator**: Contact your Pabawi administrator for assistance
