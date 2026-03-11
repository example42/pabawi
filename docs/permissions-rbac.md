# Permissions and RBAC Guide

## Overview

Pabawi implements Role-Based Access Control (RBAC) to manage user permissions for provisioning and infrastructure management operations. This guide explains the permission system, required permissions for each action, and how permissions affect the user interface.

## Table of Contents

- [Understanding RBAC](#understanding-rbac)
- [Permission Levels](#permission-levels)
- [Provisioning Permissions](#provisioning-permissions)
- [Management Permissions](#management-permissions)
- [UI Visibility Rules](#ui-visibility-rules)
- [Permission Enforcement](#permission-enforcement)
- [Configuring Permissions](#configuring-permissions)
- [Troubleshooting](#troubleshooting)

## Understanding RBAC

### What is RBAC?

Role-Based Access Control (RBAC) is a security model that restricts system access based on user roles. In Pabawi:

- **Users** are assigned **Roles**
- **Roles** contain **Permissions**
- **Permissions** grant access to specific **Actions**

### Key Concepts

**User**:

- Individual account in Pabawi
- Can have one or more roles
- Inherits permissions from all assigned roles

**Role**:

- Named collection of permissions
- Examples: Administrator, Operator, Viewer
- Can be assigned to multiple users

**Permission**:

- Specific authorization to perform an action
- Examples: `provision:create_vm`, `vm:start`, `vm:destroy`
- Granular control over operations

**Action**:

- Specific operation in the system
- Examples: Create VM, Start VM, View Inventory
- Requires corresponding permission

### Permission Model

Pabawi uses a hierarchical permission model:

```
Integration Level
  └─ Action Type
      └─ Specific Action
          └─ Resource Type (optional)
```

Examples:

- `proxmox:provision:create_vm` - Create VMs via Proxmox
- `proxmox:lifecycle:start` - Start VMs/containers
- `proxmox:lifecycle:destroy` - Destroy VMs/containers
- `*:provision:*` - All provisioning actions on all integrations
- `*:*:*` - All actions (administrator)

## Permission Levels

### Administrator

**Full Access**: All permissions across all integrations

**Permissions**:

- `*:*:*` (wildcard - all actions)

**Capabilities**:

- Create, modify, and delete VMs and containers
- Start, stop, and manage all resources
- Configure integrations
- Manage user permissions
- Access all features

**UI Access**:

- All menu items visible
- All actions available
- No restrictions

### Operator

**Operational Access**: Provision and manage resources

**Permissions**:

- `*:provision:*` - All provisioning actions
- `*:lifecycle:*` - All lifecycle actions
- `*:inventory:read` - View inventory

**Capabilities**:

- Create VMs and containers
- Start, stop, reboot resources
- View inventory and facts
- Cannot destroy resources
- Cannot configure integrations

**UI Access**:

- Provision menu visible
- Manage tab visible (limited actions)
- Setup menu hidden

### Viewer

**Read-Only Access**: View resources only

**Permissions**:

- `*:inventory:read` - View inventory
- `*:facts:read` - View facts

**Capabilities**:

- View inventory
- View node details
- View facts
- Cannot modify anything

**UI Access**:

- Inventory menu visible
- Node detail pages visible (read-only)
- Provision menu hidden
- Manage tab hidden

### Custom Roles

Organizations can create custom roles with specific permission combinations:

**Example: VM Manager**:

- `proxmox:provision:create_vm` - Create VMs only
- `proxmox:lifecycle:start` - Start VMs
- `proxmox:lifecycle:stop` - Stop VMs
- `proxmox:lifecycle:reboot` - Reboot VMs

**Example: Container Manager**:

- `proxmox:provision:create_lxc` - Create containers only
- `proxmox:lifecycle:*` - All lifecycle actions for containers

**Example: Development Team**:

- `proxmox:provision:*` - All provisioning (dev environment only)
- `proxmox:lifecycle:*` - All lifecycle actions
- `proxmox:lifecycle:destroy` - Can destroy resources

## Provisioning Permissions

### Create VM Permission

**Permission**: `<integration>:provision:create_vm`

**Grants Access To**:

- Provision page (VM tab)
- VM creation form
- Submit VM creation requests

**Required For**:

- Creating new virtual machines
- Accessing VM provisioning interface

**UI Impact**:

- Provision menu item appears (if any provision permission exists)
- VM tab visible on Provision page
- VM creation form enabled

**Example**:

```
proxmox:provision:create_vm
ec2:provision:create_vm
*:provision:create_vm  (all integrations)
```

### Create LXC Permission

**Permission**: `<integration>:provision:create_lxc`

**Grants Access To**:

- Provision page (LXC tab)
- LXC creation form
- Submit LXC creation requests

**Required For**:

- Creating new LXC containers
- Accessing LXC provisioning interface

**UI Impact**:

- Provision menu item appears (if any provision permission exists)
- LXC tab visible on Provision page
- LXC creation form enabled

**Example**:

```
proxmox:provision:create_lxc
*:provision:create_lxc  (all integrations)
```

### General Provisioning Permission

**Permission**: `<integration>:provision:*`

**Grants Access To**:

- All provisioning actions for the integration
- Both VM and LXC creation
- Future provisioning capabilities

**Required For**:

- Full provisioning access
- Creating any resource type

**UI Impact**:

- Provision menu item appears
- All provisioning tabs visible
- All creation forms enabled

**Example**:

```
proxmox:provision:*
*:provision:*  (all integrations, all resource types)
```

## Management Permissions

### Lifecycle Actions

#### Start Permission

**Permission**: `<integration>:lifecycle:start`

**Grants Access To**:

- Start button on Manage tab
- Start action for stopped VMs/containers

**Required For**:

- Starting stopped resources

**UI Impact**:

- Start button visible when resource is stopped
- Start action enabled in action menu

#### Stop Permission

**Permission**: `<integration>:lifecycle:stop`

**Grants Access To**:

- Stop button on Manage tab
- Force stop action for running VMs/containers

**Required For**:

- Stopping running resources (forced)

**UI Impact**:

- Stop button visible when resource is running
- Stop action enabled in action menu

#### Shutdown Permission

**Permission**: `<integration>:lifecycle:shutdown`

**Grants Access To**:

- Shutdown button on Manage tab
- Graceful shutdown action

**Required For**:

- Gracefully shutting down resources

**UI Impact**:

- Shutdown button visible when resource is running
- Shutdown action enabled in action menu

#### Reboot Permission

**Permission**: `<integration>:lifecycle:reboot`

**Grants Access To**:

- Reboot button on Manage tab
- Reboot action for running VMs/containers

**Required For**:

- Rebooting resources

**UI Impact**:

- Reboot button visible when resource is running
- Reboot action enabled in action menu

#### Suspend/Resume Permissions

**Permission**:

- `<integration>:lifecycle:suspend`
- `<integration>:lifecycle:resume`

**Grants Access To**:

- Suspend button (VMs only)
- Resume button (suspended VMs)

**Required For**:

- Suspending running VMs
- Resuming suspended VMs

**UI Impact**:

- Suspend button visible when VM is running
- Resume button visible when VM is suspended

#### Destroy Permission

**Permission**: `<integration>:lifecycle:destroy`

**Grants Access To**:

- Destroy button on Manage tab
- Delete VM/container action
- Confirmation dialog

**Required For**:

- Permanently deleting resources

**UI Impact**:

- Destroy button visible (with confirmation)
- Destroy action enabled in action menu
- Warning indicators shown

**Security Note**: This is a destructive action. Grant carefully.

### General Lifecycle Permission

**Permission**: `<integration>:lifecycle:*`

**Grants Access To**:

- All lifecycle actions for the integration
- Start, stop, reboot, suspend, resume, destroy

**Required For**:

- Full lifecycle management access

**UI Impact**:

- Manage tab visible
- All action buttons visible (based on resource state)
- All lifecycle operations enabled

**Example**:

```
proxmox:lifecycle:*
*:lifecycle:*  (all integrations)
```

## UI Visibility Rules

### Menu Items

**Provision Menu**:

- **Visible**: User has any `*:provision:*` permission
- **Hidden**: User has no provisioning permissions

**Inventory Menu**:

- **Visible**: User has `*:inventory:read` permission
- **Hidden**: User has no inventory read permission

**Setup Menu**:

- **Visible**: User has administrator role
- **Hidden**: Non-administrator users

### Page Elements

**Provision Page**:

- **VM Tab**: Visible if user has `*:provision:create_vm`
- **LXC Tab**: Visible if user has `*:provision:create_lxc`
- **Integration Selector**: Shows only integrations user can access

**Node Detail Page**:

- **Manage Tab**: Visible if user has any `*:lifecycle:*` permission
- **Facts Section**: Visible if user has `*:facts:read` permission
- **Configuration Section**: Always visible (read-only)

**Manage Tab**:

- **Action Buttons**: Only visible if user has corresponding permission
- **Destroy Button**: Only visible if user has `*:lifecycle:destroy`
- **No Actions Message**: Shown if user has no lifecycle permissions

### Form Elements

**Provisioning Forms**:

- **Submit Button**: Enabled only if user has create permission
- **Form Fields**: All visible (validation applies)
- **Integration Dropdown**: Shows only permitted integrations

**Action Buttons**:

- **Enabled**: User has permission and resource state allows action
- **Disabled**: User lacks permission or resource state prevents action
- **Hidden**: User has no related permissions

## Permission Enforcement

### Frontend Enforcement

**UI-Level Security**:

- Menu items hidden based on permissions
- Buttons disabled or hidden
- Forms not rendered without permissions
- Provides user-friendly experience

**Limitations**:

- Not a security boundary
- Can be bypassed by API calls
- Relies on backend enforcement

### Backend Enforcement

**API-Level Security**:

- All API endpoints check permissions
- Requests without permission return 403 Forbidden
- Cannot be bypassed
- True security boundary

**Enforcement Points**:

1. **Authentication**: Verify user is logged in
2. **Authorization**: Check user has required permission
3. **Resource Access**: Verify user can access specific resource
4. **Action Execution**: Validate permission before executing

**Error Responses**:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "User does not have permission to perform this action",
    "requiredPermission": "proxmox:provision:create_vm"
  }
}
```

### Permission Checks

**Before Every Action**:

1. Extract user from authentication token
2. Load user's roles and permissions
3. Check if user has required permission
4. Allow or deny action
5. Log authorization decision

**Permission Matching**:

- Exact match: `proxmox:provision:create_vm`
- Wildcard integration: `*:provision:create_vm`
- Wildcard action: `proxmox:provision:*`
- Full wildcard: `*:*:*`

## Configuring Permissions

### User Management

**Creating Users**:

1. Navigate to Admin → Users
2. Click "Add User"
3. Enter user details
4. Assign roles
5. Save

**Assigning Roles**:

1. Navigate to user details
2. Click "Edit Roles"
3. Select roles from list
4. Save changes
5. User inherits all role permissions

### Role Management

**Creating Roles**:

1. Navigate to Admin → Roles
2. Click "Add Role"
3. Enter role name and description
4. Select permissions
5. Save

**Editing Roles**:

1. Navigate to role details
2. Click "Edit Permissions"
3. Add or remove permissions
4. Save changes
5. All users with role get updated permissions

### Permission Syntax

**Format**: `<integration>:<action_type>:<specific_action>`

**Components**:

- **Integration**: `proxmox`, `ec2`, `azure`, or `*` (all)
- **Action Type**: `provision`, `lifecycle`, `inventory`, `facts`, or `*` (all)
- **Specific Action**: `create_vm`, `start`, `destroy`, or `*` (all)

**Examples**:

```
proxmox:provision:create_vm     # Specific permission
proxmox:provision:*             # All provisioning on Proxmox
*:provision:create_vm           # Create VMs on any integration
proxmox:lifecycle:*             # All lifecycle actions on Proxmox
*:*:*                           # All permissions (admin)
```

### Best Practices

**Principle of Least Privilege**:

- Grant minimum permissions needed
- Start with restrictive permissions
- Add permissions as needed
- Review permissions regularly

**Role Design**:

- Create roles for job functions
- Don't create user-specific roles
- Use descriptive role names
- Document role purposes

**Permission Auditing**:

- Review permissions quarterly
- Remove unused permissions
- Check for over-privileged users
- Log permission changes

**Separation of Duties**:

- Separate provisioning and destruction
- Different roles for different environments
- Require approval for sensitive actions

## Troubleshooting

### Problem: "Permission Denied" Error

**Symptoms**:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "User does not have permission to perform this action"
  }
}
```

**Solutions**:

1. **Check User Roles**:
   - Navigate to user profile
   - Review assigned roles
   - Verify roles are active

2. **Check Role Permissions**:
   - Navigate to role details
   - Review permissions list
   - Verify required permission is included

3. **Check Permission Format**:
   - Verify permission syntax is correct
   - Check for typos
   - Ensure wildcards are used correctly

4. **Contact Administrator**:
   - Request required permission
   - Explain use case
   - Provide error details

### Problem: Menu Items Not Visible

**Symptoms**:

- Provision menu missing
- Manage tab not showing
- Expected features hidden

**Solutions**:

1. **Verify Permissions**:
   - Check user has required permissions
   - Review role assignments
   - Confirm permissions are active

2. **Check Integration Status**:
   - Verify integration is enabled
   - Check integration is connected
   - Test integration health

3. **Clear Browser Cache**:
   - Clear browser cache and cookies
   - Refresh the page
   - Log out and log back in

4. **Check Permission Propagation**:
   - Permissions may take time to propagate
   - Wait a few minutes
   - Refresh the page

### Problem: Action Buttons Disabled

**Symptoms**:

- Buttons appear but are disabled
- Cannot click action buttons
- Grayed out controls

**Solutions**:

1. **Check Resource State**:
   - Verify resource is in correct state for action
   - Example: Can't start a running VM
   - Check resource status

2. **Check Permissions**:
   - Verify user has permission for specific action
   - Check role includes required permission
   - Review permission wildcards

3. **Check Integration Health**:
   - Verify integration is connected
   - Test integration connectivity
   - Check for integration errors

### Problem: Inconsistent Permissions

**Symptoms**:

- Permissions work in some places but not others
- Inconsistent UI behavior
- Some actions allowed, others denied

**Solutions**:

1. **Check Permission Wildcards**:
   - Verify wildcard usage is correct
   - Check for conflicting permissions
   - Review permission hierarchy

2. **Check Multiple Roles**:
   - User may have multiple roles
   - Permissions are combined
   - Check all assigned roles

3. **Check Backend Logs**:
   - Review authorization logs
   - Look for permission check failures
   - Identify specific permission issues

4. **Verify Permission Sync**:
   - Ensure frontend and backend are in sync
   - Check for caching issues
   - Restart services if needed

## Related Documentation

- [Provisioning Guide](provisioning-guide.md) - How to use provisioning features
- [Manage Tab Guide](manage-tab-guide.md) - How to manage resources
- [Proxmox Setup Guide](proxmox-setup-guide.md) - Configure Proxmox integration
- [User Guide](user-guide.md) - General Pabawi usage

## Support

For additional help:

- **Documentation**: [pabawi.dev/docs](https://pabawi.dev/docs)
- **GitHub Issues**: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- **Administrator**: Contact your Pabawi administrator for permission requests
