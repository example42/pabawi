# Pabawi User Guide

Version: 0.5.0

## Overview

Pabawi is a web-based interface for the Bolt automation tool that allows you to manage infrastructure, execute commands, run tasks, and monitor operations through an intuitive browser interface. This guide will walk you through all features and workflows.

## Table of Contents

- [Getting Started](#getting-started)
- [Navigating the Interface](#navigating-the-interface)
- [Viewing Node Inventory](#viewing-node-inventory)
- [Node Detail Page](#node-detail-page)
- [Gathering Facts](#gathering-facts)
- [Executing Commands](#executing-commands)
- [Running Bolt Tasks](#running-bolt-tasks)
- [Running Puppet](#running-puppet)
- [Installing Packages](#installing-packages)
- [Viewing Execution History](#viewing-execution-history)
- [Integration Color Coding](#integration-color-coding)
- [Expert Mode](#expert-mode)
- [Realtime Streaming Output](#realtime-streaming-output)
- [Interpreting Bolt Command Output](#interpreting-bolt-command-output)
- [Puppet Reports Filtering](#puppet-reports-filtering)
- [Puppet Run Visualization](#puppet-run-visualization)
- [Tips and Best Practices](#tips-and-best-practices)

## Getting Started

### Accessing Pabawi

1. Open your web browser
2. Navigate to the Pabawi URL (default: `http://localhost:3000`)
3. The application loads with the home page

### First Time Setup

Before using Pabawi, ensure:

- Bolt CLI is installed and configured
- Your Bolt project has a valid `inventory.yaml` file
- Target nodes are accessible from the Pabawi server
- Necessary Bolt modules are installed

## Navigating the Interface

### Main Navigation

The navigation bar at the top provides access to all major sections:

- **Home**: Dashboard and quick access
- **Inventory**: View and manage all nodes
- **Executions**: View execution history and results
- **Expert Mode Toggle**: Enable detailed diagnostic information

### Page Layout

Each page follows a consistent layout:

- **Header**: Navigation and controls
- **Main Content**: Primary information and actions
- **Status Indicators**: Visual feedback for operations

## Viewing Node Inventory

The Inventory page displays all nodes from your Bolt inventory, allowing you to browse, search, and access individual nodes.

### Accessing the Inventory

1. Click **Inventory** in the main navigation
2. The page loads and displays all nodes from your Bolt inventory

### Understanding the Inventory Display

Each node card shows:

- **Node Name**: The unique identifier for the node
- **URI**: The connection address (hostname or IP)
- **Transport**: Connection method (SSH, WinRM, Docker, Local)
- **Status Indicator**: Visual indicator of node availability

### Searching and Filtering

**Search by Name:**

1. Locate the search box at the top of the inventory page
2. Type the node name or partial name
3. Results filter automatically as you type (300ms debounce)
4. Clear the search to show all nodes

**Filter by Transport:**

1. Use the transport filter dropdown
2. Select a transport type (SSH, WinRM, Docker, Local)
3. Only nodes using that transport are displayed
4. Select "All" to show all nodes

### View Options

**Grid View** (default):

- Displays nodes as cards in a grid layout
- Shows key information at a glance
- Best for browsing many nodes

**List View**:

- Displays nodes in a compact list
- Shows more details per node
- Best for scanning specific information

Toggle between views using the view switcher button.

### Performance with Large Inventories

For inventories with 100+ nodes:

- Virtual scrolling renders only visible nodes
- Smooth scrolling performance maintained
- Search and filter remain responsive
- Tested with inventories up to 1000 nodes

### Accessing Node Details

1. Click on any node card or list item
2. The Node Detail page opens
3. All node-specific operations are available

## Node Detail Page

The Node Detail page is the central hub for all operations on a specific node. It provides comprehensive information and controls for managing the node.

### Page Sections

The Node Detail page is organized into collapsible sections:

1. **Node Information**: Basic node metadata
2. **Facts**: System information gathered from the node
3. **Run Puppet**: Execute Puppet agent runs
4. **Execute Command**: Run ad-hoc commands
5. **Run Task**: Execute Bolt tasks
6. **Install Package**: Install software packages
7. **Execution History**: Recent operations on this node

### Node Information Section

Displays essential node metadata:

- **Name**: Node identifier
- **URI**: Connection address
- **Transport**: Connection method (SSH, WinRM, etc.)
- **Configuration**: Transport-specific settings (user, port, etc.)

This information is read-only and comes from your Bolt inventory.

### Navigating Between Sections

- Click section headers to expand/collapse
- Multiple sections can be open simultaneously
- Scroll to view all sections
- Use browser back button to return to inventory

## Gathering Facts

Facts are system information collected from target nodes, including operating system details, hardware specifications, network configuration, and more.

### When to Gather Facts

- When you need current system information
- Before making configuration changes
- For troubleshooting system issues
- To verify system state after changes

### Gathering Facts: Step-by-Step

1. **Navigate to Node Detail page**
   - Go to Inventory
   - Click on the target node

2. **Locate the Facts section**
   - Find the "Facts" collapsible section
   - Click to expand if collapsed

3. **Trigger Fact Gathering**
   - Click the **"Gather Facts"** button
   - A loading indicator appears
   - Wait for the operation to complete (typically 5-30 seconds)

4. **View Results**
   - Facts display in a collapsible tree structure
   - Expand/collapse sections to explore
   - Common facts include:
     - Operating System (family, name, version)
     - Processors (count, models)
     - Memory (total, available)
     - Networking (hostname, interfaces, IP addresses)
     - Disks and filesystems

### Understanding the Facts Display

**Tree Structure:**

- Facts are organized hierarchically
- Click arrows to expand/collapse sections
- Nested data shows parent-child relationships

**Data Types:**

- Strings: Text values (e.g., "Ubuntu")
- Numbers: Numeric values (e.g., 4 for CPU count)
- Booleans: true/false values
- Arrays: Lists of items
- Objects: Nested structures

**Example Facts:**

```
os
  ├─ family: "Debian"
  ├─ name: "Ubuntu"
  └─ release
      ├─ full: "20.04"
      └─ major: "20"
processors
  ├─ count: 4
  └─ models: ["Intel(R) Core(TM) i7-9750H"]
memory
  └─ system
      ├─ total: "16.00 GiB"
      └─ available: "8.23 GiB"
```

### Facts Caching

- Facts are cached for 5 minutes by default
- Subsequent requests within the cache period return cached data
- Click "Gather Facts" again to force a refresh
- Cache improves performance and reduces load on target nodes

### Troubleshooting Fact Gathering

**Problem: "Node unreachable"**

- Verify network connectivity to the node
- Check SSH credentials in Bolt inventory
- Test connection: `bolt command run 'uptime' --targets <node>`

**Problem: "Permission denied"**

- Verify SSH user has sufficient permissions
- Check SSH key is authorized on target node
- Review Bolt inventory configuration

**Problem: "Timeout"**

- Node may be slow to respond
- Increase timeout in configuration
- Check node system load

## Executing Commands

Execute ad-hoc shell commands on target nodes directly from the web interface. This is useful for quick diagnostics, system checks, and one-off operations.

### Command Execution Workflow

#### Step 1: Navigate to Node Detail

1. Go to **Inventory**
2. Click on the target node
3. Locate the **"Execute Command"** section
4. Expand the section if collapsed

#### Step 2: Enter Command

1. Find the command input field
2. Type your command (e.g., `uptime`, `df -h`, `systemctl status nginx`)
3. The command is validated as you type

**Command Examples:**

- System info: `uname -a`, `uptime`, `hostname`
- Disk usage: `df -h`, `du -sh /var/log`
- Memory: `free -m`, `cat /proc/meminfo`
- Processes: `ps aux`, `top -bn1`
- Network: `ip addr`, `netstat -tulpn`
- Services: `systemctl status <service>`

#### Step 3: Execute

1. Click the **"Execute"** button
2. A loading indicator appears
3. Wait for execution to complete
4. Results display below the form

#### Step 4: Review Results

The execution results show:

- **Status**: Success (green) or Failed (red)
- **Exit Code**: Command exit code (0 = success)
- **Standard Output (stdout)**: Command output
- **Standard Error (stderr)**: Error messages (if any)
- **Duration**: Execution time in milliseconds
- **Timestamp**: When the command was executed

**In Expert Mode:**

- **Bolt Command**: The exact Bolt CLI command executed
- **Additional diagnostics**: Request ID, execution context

### Command Whitelist Security

For security, Pabawi enforces a command whitelist:

**Whitelist Modes:**

1. **Locked Down** (Production):
   - Only specific commands allowed
   - Commands must match whitelist exactly
   - Example: `["ls", "pwd", "uptime"]`

2. **Flexible** (Development):
   - Commands with arguments allowed
   - Prefix matching enabled
   - Example: `["ls", "systemctl"]` allows `ls -la`, `systemctl status nginx`

3. **Open** (Development Only):
   - All commands allowed
   - Not recommended for production

**Whitelist Error:**
If you see "Command not in whitelist":

1. Contact your administrator
2. Request the command be added to whitelist
3. Or use a whitelisted alternative

### Command Execution Best Practices

**Do:**

- Test commands locally first
- Use read-only commands when possible
- Check command syntax before executing
- Review output carefully
- Use expert mode for troubleshooting

**Don't:**

- Run destructive commands without verification
- Execute commands you don't understand
- Ignore error messages
- Run long-running commands (use tasks instead)
- Execute commands requiring interactive input

### Understanding Command Output

**Exit Codes:**

- `0`: Success
- `1`: General error
- `2`: Misuse of shell command
- `126`: Command cannot execute
- `127`: Command not found
- `130`: Terminated by Ctrl+C
- Other: Command-specific error codes

**Reading stdout:**

- Normal command output
- May include warnings (non-fatal)
- Check for expected results

**Reading stderr:**

- Error messages
- Warnings
- Diagnostic information
- Not always an error (some commands use stderr for normal output)

### Troubleshooting Command Execution

**Problem: "Command not found"**

- Command doesn't exist on target node
- Check command is installed: `which <command>`
- Verify PATH includes command location

**Problem: "Permission denied"**

- Insufficient permissions
- Try with sudo: `sudo <command>`
- Check user permissions in Bolt inventory

**Problem: "Connection timeout"**

- Network connectivity issues
- Target node unresponsive
- Increase timeout in configuration

**Problem: "Command hangs"**

- Command requires interactive input
- Use non-interactive flags
- Or use a Bolt task instead

## Running Bolt Tasks

Bolt tasks are predefined automation scripts that can accept parameters and perform complex operations. Pabawi provides an intuitive interface for discovering, configuring, and executing tasks.

### Understanding Bolt Tasks

**What are Bolt Tasks?**

- Reusable automation scripts
- Can be written in any language (Shell, Python, Ruby, etc.)
- Accept parameters for customization
- Provide structured output
- Installed via Bolt modules

**Common Task Types:**

- System management (package installation, service control)
- Configuration management
- Deployment operations
- Diagnostic and troubleshooting
- Custom automation workflows

### Task Execution Workflow

#### Step 1: Browse Available Tasks

**From Node Detail Page:**

1. Navigate to the target node
2. Locate the **"Run Task"** section
3. Expand the section
4. Click **"Browse Tasks"** or use the task dropdown

**Task Organization:**

- Tasks are grouped by module
- Module names appear as collapsible sections
- Example modules: `psick`, `tp`, `stdlib`
- Each module contains related tasks

#### Step 2: Select a Task

1. **Browse by Module:**
   - Expand module sections to see tasks
   - Modules displayed in grid layout for easy scanning
   - Hover over task names to see descriptions

2. **Search for Tasks:**
   - Use the search box to filter tasks
   - Search by task name or module name
   - Results update as you type

3. **View Task Details:**
   - Click on a task name
   - Task description appears
   - Parameters are listed with types and requirements

#### Step 3: Configure Parameters

Each task may have different parameters:

**Parameter Types:**

1. **String Parameters:**
   - Text input field
   - Example: `environment` = "production"

2. **Integer Parameters:**
   - Number input field
   - Validation ensures numeric values
   - Example: `timeout` = 300

3. **Boolean Parameters:**
   - Checkbox or toggle
   - Example: `noop` = true/false

4. **Array Parameters:**
   - Multi-line text area
   - JSON format: `["item1", "item2"]`
   - Example: `tags` = ["web", "database"]

5. **Hash Parameters:**
   - JSON editor
   - Key-value pairs
   - Example: `settings` = `{"key": "value"}`

**Required vs Optional:**

- Required parameters marked with asterisk (*)
- Form validates required fields before submission
- Optional parameters can be left empty

**Parameter Examples:**

```
Task: psick::puppet_agent
Parameters:
  - noop (Boolean, optional): Run in dry-run mode
  - tags (String, optional): Comma-separated Puppet tags
  - environment (String, optional): Puppet environment
  - debug (Boolean, optional): Enable debug output

Task: tp::install
Parameters:
  - app (String, required): Package name to install
  - ensure (String, optional): present/absent/latest
  - settings (Hash, optional): Additional settings
```

#### Step 4: Execute the Task

1. **Review Configuration:**
   - Verify all required parameters are filled
   - Check parameter values are correct
   - Review task description

2. **Click Execute:**
   - Click the **"Execute Task"** button
   - Loading indicator appears
   - Task executes on target node

3. **Monitor Progress:**
   - Status updates appear
   - In expert mode with streaming: see real-time output
   - Wait for completion

#### Step 5: Review Results

**Success Response:**

- Green success indicator
- Task output displayed
- Structured results (if provided by task)
- Execution time shown

**Failure Response:**

- Red error indicator
- Error message displayed
- stderr output (if any)
- Troubleshooting guidance

**In Expert Mode:**

- Full Bolt command shown
- Raw task output available
- Request ID for log correlation
- Detailed error diagnostics

### Common Bolt Tasks

#### System Management Tasks

**package (built-in):**

- Install, remove, or update packages
- Parameters: `name`, `action` (install/remove/upgrade)
- Works across different package managers

**service (built-in):**

- Manage system services
- Parameters: `name`, `action` (start/stop/restart/status)
- Cross-platform service management

#### Puppet Tasks

**psick::puppet_agent:**

- Run Puppet agent on target node
- Parameters: `noop`, `tags`, `environment`, `debug`
- See "Running Puppet" section for details

#### Tiny Puppet Tasks

**tp::install:**

- Install packages using Tiny Puppet
- Parameters: `app`, `ensure`, `settings`
- Supports many applications out of the box

**tp::test:**

- Test if application is correctly installed
- Parameters: `app`
- Validates installation and configuration

### Task Execution Best Practices

**Before Executing:**

- Read task description carefully
- Understand what the task does
- Verify parameters are correct
- Test on non-production nodes first
- Use noop mode when available

**During Execution:**

- Monitor progress
- Don't close browser during execution
- Enable expert mode for detailed output
- Watch for warnings or errors

**After Execution:**

- Review results thoroughly
- Verify expected changes occurred
- Check execution history
- Document any issues

### Troubleshooting Task Execution

**Problem: "Task not found"**

- Module not installed
- Install module: `bolt module install <module-name>`
- Verify module in `modules/` directory

**Problem: "Parameter validation failed"**

- Missing required parameter
- Wrong parameter type
- Invalid parameter value
- Review task metadata: `bolt task show <task-name>`

**Problem: "Task execution failed"**

- Check task output for error details
- Enable expert mode for full diagnostics
- Test task with Bolt CLI: `bolt task run <task> --targets <node>`
- Review target node logs

**Problem: "Task timeout"**

- Task takes longer than configured timeout
- Increase `BOLT_EXECUTION_TIMEOUT` setting
- Optimize task for faster execution
- Check target node performance

## Running Puppet

The Puppet run interface allows you to execute Puppet agent runs on target nodes with full control over execution parameters. This is ideal for applying configuration changes, testing Puppet code, and managing infrastructure state.

### When to Run Puppet

- Apply configuration changes to nodes
- Test Puppet code in noop mode
- Enforce desired state on nodes
- Troubleshoot Puppet issues with debug mode
- Apply specific Puppet tags for targeted changes

### Puppet Run Workflow

#### Step 1: Access Puppet Run Interface

1. Navigate to the target node's detail page
2. Locate the **"Run Puppet"** section
3. Expand the section if collapsed
4. The Puppet run form appears

#### Step 2: Configure Basic Options

**Tags (Optional):**

- Specify which Puppet tags to apply
- Comma-separated list: `web,database,security`
- Leave empty to apply all tags
- Use tags to limit scope of changes

**Environment (Optional):**

- Specify Puppet environment
- Examples: `production`, `development`, `staging`
- Leave empty to use node's default environment
- Overrides environment configured in Puppet

#### Step 3: Configure Advanced Options

Click **"Show Advanced Options"** to reveal additional settings:

**Noop Mode:**

- Enable for dry-run execution
- Shows what would change without making changes
- Useful for testing before applying
- Toggle on/off with checkbox

**No-Noop Mode:**

- Override noop setting on target node
- Forces actual changes even if node configured for noop
- Use carefully in production
- Toggle on/off with checkbox

**Debug Mode:**

- Enable verbose Puppet output
- Shows detailed execution information
- Useful for troubleshooting
- Increases output volume significantly

**Additional Options:**

- Expand for more Puppet agent options
- Configure verbosity, trace, logging
- Advanced users only

#### Step 4: Execute Puppet Run

1. **Review Configuration:**
   - Verify tags are correct
   - Check environment setting
   - Confirm noop/no-noop settings
   - Review debug mode selection

2. **Click "Run Puppet":**
   - Button starts execution
   - Loading indicator appears
   - Puppet agent runs on target node

3. **Monitor Execution:**
   - Status updates appear
   - With streaming enabled: see real-time output
   - Execution typically takes 30 seconds to 5 minutes

#### Step 5: Review Results

**Puppet Output Display:**

The results show:

- **Execution Status**: Success, Failed, or Noop
- **Resource Changes**: Number of resources changed
- **Failed Resources**: Number of failures (if any)
- **Execution Time**: Total run duration
- **Detailed Output**: Puppet agent output with syntax highlighting

**Resource Change Summary:**

```
Changed Resources: 5
Failed Resources: 0
Skipped Resources: 2
Total Resources: 47
Execution Time: 45.3 seconds
```

**Resource Changes Detail:**

- Each changed resource listed
- Resource type and title shown
- Change status indicated (changed/failed/skipped)
- Change details provided

**Example Output:**

```
File[/etc/nginx/nginx.conf]
  Status: changed
  Message: content changed '{md5}abc123' to '{md5}def456'

Service[nginx]
  Status: changed
  Message: ensure changed 'stopped' to 'running'

Package[nginx]
  Status: unchanged
  Message: already installed
```

### Understanding Puppet Run Modes

**Normal Mode:**

- Applies all changes
- Modifies system state
- Use in production with caution
- Verify changes in noop mode first

**Noop Mode (Dry Run):**

- Shows what would change
- Makes no actual changes
- Safe for testing
- Recommended before production runs

**No-Noop Mode:**

- Overrides node's noop setting
- Forces changes even if node in noop
- Use when you need to override
- Requires careful consideration

**Debug Mode:**

- Verbose output
- Shows execution details
- Useful for troubleshooting
- Generates large output

### Puppet Run Best Practices

**Before Running:**

- Test in noop mode first
- Verify Puppet code is correct
- Check node is in correct environment
- Review tags to apply
- Ensure node is accessible

**During Execution:**

- Monitor output for errors
- Watch for unexpected changes
- Don't interrupt execution
- Enable streaming for real-time feedback

**After Execution:**

- Review all resource changes
- Verify expected changes occurred
- Check for failed resources
- Investigate any failures
- Document results

**Safety Guidelines:**

- Always test in noop mode first
- Use tags to limit scope
- Run on test nodes before production
- Have rollback plan ready
- Monitor system after changes

### Common Puppet Run Scenarios

**Scenario 1: Test Configuration Changes**

```
Tags: (empty - apply all)
Environment: development
Noop Mode: ✓ Enabled
Debug Mode: ✗ Disabled
```

Result: Shows what would change without applying

**Scenario 2: Apply Specific Changes**

```
Tags: web,ssl
Environment: production
Noop Mode: ✗ Disabled
No-Noop Mode: ✗ Disabled
```

Result: Applies only web and SSL related changes

**Scenario 3: Troubleshoot Puppet Issues**

```
Tags: (empty)
Environment: (default)
Noop Mode: ✓ Enabled
Debug Mode: ✓ Enabled
```

Result: Detailed output showing execution flow

**Scenario 4: Force Changes on Noop Node**

```
Tags: (empty)
Environment: production
Noop Mode: ✗ Disabled
No-Noop Mode: ✓ Enabled
```

Result: Applies changes even if node configured for noop

### Troubleshooting Puppet Runs

**Problem: "Puppet agent not installed"**

- Install Puppet agent on target node
- Verify installation: `puppet --version`
- Check Puppet is in PATH

**Problem: "Catalog compilation failed"**

- Puppet code has errors
- Check Puppet server logs
- Verify node facts are correct
- Test catalog compilation: `puppet agent --test --noop`

**Problem: "Resource failed to apply"**

- Check resource dependencies
- Verify permissions
- Review error message in output
- Enable debug mode for details

**Problem: "Puppet run timeout"**

- Increase execution timeout
- Optimize Puppet code
- Check node performance
- Reduce catalog size

**Problem: "No changes applied in normal mode"**

- Node may be in noop mode
- Enable no-noop mode to override
- Check Puppet code is correct
- Verify environment is correct

## Installing Packages

The package installation interface provides a streamlined way to install software packages on target nodes using Bolt tasks. This feature supports multiple package installation backends and provides a consistent interface.

### Package Installation Workflow

#### Step 1: Access Package Installation

1. Navigate to the target node's detail page
2. Locate the **"Install Package"** section
3. Expand the section if collapsed
4. The package installation form appears

#### Step 2: Select Package Task

If multiple package tasks are configured:

1. Use the task dropdown to select installation method
2. Common options:
   - **Package (built-in)**: Native Bolt package task
   - **Tiny Puppet (tp::install)**: Example42 Tiny Puppet
   - **Custom tasks**: Organization-specific tasks

Each task may have different capabilities and parameter requirements.

#### Step 3: Configure Package

**Package Name (Required):**

- Enter the package name
- Examples: `nginx`, `postgresql`, `docker-ce`
- Must match package name in repository
- Case-sensitive on some systems

**Version (Optional):**

- Specify exact version to install
- Leave empty for latest version
- Examples: `1.18.0`, `12.5-1`
- Format depends on package manager

**Ensure (Required):**

- Select installation action from dropdown:
  - **present**: Install if not present
  - **absent**: Remove if installed
  - **latest**: Install or upgrade to latest version

**Settings (Optional):**

- Additional configuration in JSON format
- Task-specific settings
- Example for Tiny Puppet:

  ```json
  {
    "repo": "custom-repo",
    "options": {
      "enable_service": true
    }
  }
  ```

#### Step 4: Execute Installation

1. **Review Configuration:**
   - Verify package name is correct
   - Check version if specified
   - Confirm ensure action
   - Review additional settings

2. **Click "Install Package":**
   - Button starts installation
   - Loading indicator appears
   - Task executes on target node

3. **Monitor Progress:**
   - Status updates appear
   - With streaming: see real-time output
   - Installation time varies by package

#### Step 5: Review Results

**Success Response:**

- Green success indicator
- Installation details displayed
- Installed version shown
- Any warnings or notices

**Failure Response:**

- Red error indicator
- Error message displayed
- Troubleshooting guidance
- Common issues highlighted

**In Expert Mode:**

- Full Bolt command shown
- Raw task output available
- Package manager output visible
- Detailed diagnostics

### Package Installation Examples

**Example 1: Install Nginx**

```
Task: tp::install
Package Name: nginx
Version: (empty - latest)
Ensure: present
Settings: (empty)
```

Result: Installs latest nginx version

**Example 2: Install Specific PostgreSQL Version**

```
Task: package
Package Name: postgresql-12
Version: 12.5-1
Ensure: present
Settings: (empty)
```

Result: Installs PostgreSQL 12.5-1

**Example 3: Remove Package**

```
Task: tp::install
Package Name: apache2
Version: (empty)
Ensure: absent
Settings: (empty)
```

Result: Removes apache2 package

**Example 4: Upgrade to Latest**

```
Task: package
Package Name: docker-ce
Version: (empty)
Ensure: latest
Settings: (empty)
```

Result: Upgrades docker-ce to latest version

**Example 5: Install with Custom Settings**

```
Task: tp::install
Package Name: mysql
Version: (empty)
Ensure: present
Settings: {
  "repo": "mysql-community",
  "settings": {
    "enable_service": true,
    "start_service": true
  }
}
```

Result: Installs MySQL with custom configuration

### Understanding Package Tasks

**Built-in Package Task:**

- Uses native package manager (apt, yum, etc.)
- Cross-platform support
- Basic functionality
- No additional modules required

**Tiny Puppet (tp::install):**

- Advanced package management
- Application-aware installation
- Supports many applications out of the box
- Handles dependencies and configuration
- Requires `example42/tp` module

**Custom Package Tasks:**

- Organization-specific tasks
- May have additional features
- Custom parameter requirements
- Consult your organization's documentation

### Package Installation Best Practices

**Before Installing:**

- Verify package name is correct
- Check package is available in repositories
- Review package dependencies
- Test on non-production nodes first
- Have rollback plan ready

**During Installation:**

- Monitor output for errors
- Watch for dependency issues
- Don't interrupt installation
- Enable streaming for real-time feedback

**After Installation:**

- Verify package is installed correctly
- Test application functionality
- Check service status if applicable
- Review installation logs
- Document installation

**Safety Guidelines:**

- Test installations on development nodes first
- Use specific versions for production
- Understand package dependencies
- Monitor disk space before installing
- Keep track of installed packages

### Viewing Package Installation History

1. Scroll to **"Execution History"** section on node detail page
2. Filter by execution type: "Package Installation"
3. View recent package operations
4. Click on execution to see details
5. Review installation results and output

### Troubleshooting Package Installation

**Problem: "Package not found"**

- Package name incorrect
- Package not in configured repositories
- Update package cache: `apt update` or `yum makecache`
- Verify repository configuration

**Problem: "Dependency errors"**

- Missing dependencies
- Conflicting packages
- Review error message for details
- Install dependencies manually first

**Problem: "Permission denied"**

- Insufficient privileges
- Verify Bolt user has sudo access
- Check sudoers configuration
- May need to run with elevated privileges

**Problem: "Disk space full"**

- Insufficient disk space
- Check available space: `df -h`
- Clean up old packages
- Free up disk space before retrying

**Problem: "Package installation timeout"**

- Large package or slow network
- Increase execution timeout
- Check network connectivity
- Verify repository accessibility

**Problem: "Version not available"**

- Specified version doesn't exist
- Check available versions in repository
- Use latest version instead
- Verify repository configuration

## Viewing Execution History

The Executions page provides a comprehensive view of all operations performed through Pabawi, allowing you to track, filter, and review past executions.

### Accessing Execution History

**From Main Navigation:**

1. Click **"Executions"** in the navigation bar
2. The executions page loads with recent executions

**From Node Detail Page:**

1. Scroll to **"Execution History"** section
2. View executions for that specific node
3. Click "View All Executions" to see full history

### Understanding the Executions Page

**Page Layout:**

1. **Summary Cards** (top):
   - Total executions
   - Successful executions
   - Failed executions
   - Running executions

2. **Filter Controls**:
   - Date range selector
   - Status filter
   - Target node filter
   - Search box

3. **Execution List**:
   - Paginated list of executions
   - 50 executions per page
   - Sorted by most recent first

### Execution List Columns

Each execution entry shows:

- **Type**: Command, Task, Facts, Puppet Run, Package Installation
- **Target**: Node(s) where executed
- **Action**: Command string or task name
- **Status**: Running, Success, Failed, Partial
- **Started**: Timestamp when execution began
- **Duration**: How long execution took
- **Actions**: View details button

**Status Indicators:**

- 🟢 **Success**: Completed successfully
- 🔴 **Failed**: Execution failed
- 🟡 **Running**: Currently executing
- 🟠 **Partial**: Some nodes succeeded, some failed

### Filtering Executions

**By Date Range:**

1. Click the date range selector
2. Choose preset range (Today, Last 7 days, Last 30 days)
3. Or select custom start and end dates
4. Executions update automatically

**By Status:**

1. Use the status dropdown
2. Select: All, Success, Failed, Running, Partial
3. List filters to show only matching executions

**By Target Node:**

1. Use the target filter dropdown
2. Select a specific node
3. Or type node name to search
4. Shows only executions for that node

**By Search:**

1. Use the search box
2. Search by action (command or task name)
3. Results filter as you type
4. Clear search to show all

**Combining Filters:**

- Multiple filters can be active simultaneously
- Filters are cumulative (AND logic)
- Example: "Failed executions on web-01 in last 7 days"

### Viewing Execution Details

**Opening Details:**

1. Click on any execution row
2. Or click the "View Details" button
3. Execution detail modal/panel opens

**Detail View Contents:**

**Execution Metadata:**

- Execution ID
- Type (Command, Task, etc.)
- Started timestamp
- Completed timestamp
- Total duration
- Status

**Target Information:**

- List of target nodes
- Per-node status
- Per-node results

**Execution Parameters:**

- Command string (for commands)
- Task name and parameters (for tasks)
- Configuration options (for Puppet runs)

**Results:**

- Standard output (stdout)
- Standard error (stderr)
- Exit code (for commands)
- Task output (for tasks)
- Resource changes (for Puppet runs)

**In Expert Mode:**

- Full Bolt command executed
- Request ID for log correlation
- Raw execution output
- Detailed diagnostics

### Execution Detail Examples

**Command Execution:**

```
Type: Command
Target: web-01
Action: df -h
Status: Success
Duration: 1.2s

Output:
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   20G   28G  42% /
tmpfs           7.8G     0  7.8G   0% /dev/shm
```

**Task Execution:**

```
Type: Task
Target: db-01
Action: psick::puppet_agent
Status: Success
Duration: 45.3s

Parameters:
  noop: true
  tags: database,security

Results:
  Changed Resources: 3
  Failed Resources: 0
  Execution Time: 45.3s
```

**Failed Execution:**

```
Type: Command
Target: app-02
Action: systemctl restart nginx
Status: Failed
Duration: 5.1s

Error:
  Exit Code: 1
  stderr: Failed to restart nginx.service: Unit not found
```

### Pagination

**Navigating Pages:**

- Use page numbers at bottom of list
- Click "Next" or "Previous"
- Jump to specific page number
- Shows current page and total pages

**Items Per Page:**

- Default: 50 executions per page
- Adjustable in settings (if available)
- Balance between performance and convenience

### Auto-Refresh for Running Executions

**Automatic Updates:**

- Running executions update automatically
- Status changes reflected in real-time
- No manual refresh needed
- Updates every 5 seconds

**Manual Refresh:**

- Click refresh button to update immediately
- Useful after filtering
- Ensures latest data displayed

### Execution History Best Practices

**Regular Review:**

- Check execution history regularly
- Identify patterns in failures
- Monitor execution duration trends
- Track system changes over time

**Troubleshooting:**

- Use filters to find specific executions
- Review failed executions for patterns
- Enable expert mode for detailed diagnostics
- Correlate with system logs using request IDs

**Auditing:**

- Track who executed what and when
- Review changes made to systems
- Verify compliance with procedures
- Document significant operations

**Performance Monitoring:**

- Monitor execution duration trends
- Identify slow operations
- Optimize frequently-run commands
- Track system performance over time

### Troubleshooting Execution History

**Problem: "No executions shown"**

- Check date range filter
- Verify status filter not too restrictive
- Clear all filters
- Ensure executions have been performed

**Problem: "Execution details not loading"**

- Check network connectivity
- Verify execution ID is valid
- Try refreshing the page
- Check browser console for errors

**Problem: "Slow page loading"**

- Large execution history
- Reduce date range
- Use more specific filters
- Consider archiving old executions

**Problem: "Missing execution data"**

- Database may have been cleared
- Execution may have been deleted
- Check database configuration
- Verify data retention policy

## Integration Color Coding

**New in v0.5.0**: Pabawi now uses a consistent color coding system to help you quickly identify which integration provides specific data. Each integration has a unique color that appears throughout the interface.

### Integration Colors

Each integration has three color variants for different UI contexts:

- **Bolt**: Bright orange (#FFAE1A) - Puppet logo color
- **PuppetDB**: Violet/purple (#9063CD) - Puppet logo color
- **Puppetserver**: Dark blue (#2E3A87) - Puppet logo color
- **Hiera**: Dark red (#C1272D)

### Where You'll See Integration Colors

#### Integration Badges

Integration badges appear throughout the interface to indicate data sources:

- **Dot variant**: Small colored dot next to labels
- **Label variant**: Colored text label with integration name
- **Badge variant**: Colored badge with icon and name

**Example locations:**

- Node detail page tabs (Facts, Hiera, Catalog)
- Inventory page source indicators
- Home page integration status
- Report source indicators

#### Integration Status (Home Page)

The home page displays integration status with colored icons:

- **Connected**: Integration icon in full color with checkmark
- **Degraded**: Integration icon in warning color (yellow/orange) with alert symbol
- **Error**: Integration icon in error color (red) with X symbol
- **Not Configured**: Integration icon in gray with info symbol

#### Tab Indicators

When viewing node details, tabs show colored dots indicating the data source:

- **Facts tab**: May show Bolt (orange) or PuppetDB (purple) dot
- **Hiera tab**: Shows Hiera (red) dot
- **Catalog tab**: Shows PuppetDB (purple) or Puppetserver (blue) dot
- **Reports tab**: Shows PuppetDB (purple) dot

### Multi-Source Data

When data can come from multiple sources, you'll see multiple integration badges:

**Example: Node Facts**

```
Facts (Bolt • PuppetDB)
```

This indicates facts can be gathered from either Bolt or PuppetDB.

### Benefits of Color Coding

1. **Quick Identification**: Instantly see which integration provides data
2. **Troubleshooting**: Identify integration-specific issues faster
3. **Data Source Awareness**: Understand where information comes from
4. **Visual Consistency**: Consistent colors across all pages and components

### Accessibility

Integration colors are chosen for:

- **Sufficient contrast**: All colors meet WCAG AA standards
- **Color blindness**: Colors are distinguishable for common types of color blindness
- **Text labels**: Colors are always accompanied by text labels
- **Icon support**: Icons provide additional visual cues beyond color

## Troubleshooting

For detailed troubleshooting steps, common error messages, and solutions, please refer to the dedicated [Troubleshooting Guide](./troubleshooting.md).

## Expert Mode

**Enhanced in v0.5.0**: Expert Mode now provides comprehensive debugging information including frontend logs, backend debug info, performance metrics, and full request lifecycle visibility.

Expert Mode is a powerful feature that provides detailed diagnostic information, making it invaluable for troubleshooting complex issues and understanding exactly what Pabawi is doing behind the scenes.

### What is Expert Mode?

Expert Mode enhances the interface with additional technical details:

- Full error stack traces
- Raw Bolt CLI commands
- Request IDs and correlation IDs for log correlation
- Detailed execution context
- Raw API responses
- Frontend and backend logs with timeline view
- Performance metrics and monitoring data
- External API error details (PuppetDB, Puppetserver, Bolt, Hiera)
- Additional diagnostic information

### When to Use Expert Mode

**Enable Expert Mode when:**

- Troubleshooting execution failures
- Debugging connectivity issues
- Understanding Bolt command construction
- Reporting bugs or issues
- Learning how Pabawi works
- Correlating with server logs

**Disable Expert Mode when:**

- Normal day-to-day operations
- Information overload is a concern
- Working with less technical users
- Simplified interface is preferred

### Enabling Expert Mode

#### Via Web Interface

1. **Locate the Toggle:**
   - Find "Expert Mode" toggle in navigation bar
   - Usually in top-right corner
   - May be in settings menu

2. **Enable:**
   - Click the toggle switch
   - Toggle turns on (usually green or highlighted)
   - "Expert Mode" indicator appears

3. **Persistence:**
   - Setting saved in browser localStorage
   - Remains enabled across sessions
   - Persists after browser restart
   - Per-browser setting (not per-user)

#### Via API

Include the `X-Expert-Mode` header in API requests:

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -H "X-Expert-Mode: true" \
  -d '{"command": "uptime"}'
```

### Expert Mode Features

#### 1. Bolt Command Display

**What You See:**

- The exact Bolt CLI command executed
- All parameters and flags
- Target specification
- Output format

**Example:**

```
Bolt Command:
bolt command run 'systemctl status nginx' \
  --targets web-01 \
  --format json \
  --no-color
```

**Why It's Useful:**

- Verify command construction is correct
- Test command manually for debugging
- Learn Bolt CLI syntax
- Reproduce issues outside Pabawi

**Where It Appears:**

- Command execution results
- Task execution results
- Puppet run results
- Package installation results
- Error messages

#### 2. Detailed Error Information

**Standard Error Display:**

```
Error: Command execution failed
```

**Expert Mode Error Display:**

```
Error: Command execution failed

Stack Trace:
Error: Command execution failed
    at BoltService.runCommand (/app/dist/bolt/BoltService.js:123:15)
    at async /app/dist/routes/command.js:45:20
    at async /app/dist/middleware/errorHandler.js:12:5

Request ID: req-abc123-def456

Timestamp: 2024-01-15T10:30:45.123Z

Execution Context:
  Endpoint: /api/nodes/web-01/command
  Method: POST
  Node: web-01
  Command: systemctl status nginx

Raw Bolt Output:
Error: Connection timeout after 30s
Failed to connect to web-01.example.com:22
Connection refused by remote host

Bolt Command:
bolt command run 'systemctl status nginx' --targets web-01 --format json
```

**Components Explained:**

- **Stack Trace**: Shows code execution path, useful for developers
- **Request ID**: Unique identifier for correlating with server logs
- **Timestamp**: Exact time of error
- **Execution Context**: What was being attempted
- **Raw Bolt Output**: Unprocessed output from Bolt CLI
- **Bolt Command**: Exact command that was executed

#### 3. Request ID Correlation

**What is a Request ID?**

- Unique identifier for each API request
- Format: `req-` followed by random string
- Example: `req-abc123-def456`

**How to Use:**

1. **Copy Request ID** from error message
2. **Search Server Logs:**

   ```bash
   sudo journalctl -u pabawi | grep "req-abc123-def456"
   ```

3. **Find Related Log Entries:**
   - All logs for that request
   - Detailed execution flow
   - Internal error details

**Example Log Correlation:**

```
# In Expert Mode error:
Request ID: req-abc123-def456

# In server logs:
[2024-01-15T10:30:45.000Z] INFO [req-abc123-def456] Executing command on web-01
[2024-01-15T10:30:45.100Z] DEBUG [req-abc123-def456] Bolt command: bolt command run...
[2024-01-15T10:31:15.200Z] ERROR [req-abc123-def456] Connection timeout after 30s
```

#### 4. Raw API Responses

**What You See:**

- Complete JSON response from API
- All fields and metadata
- Unformatted data

**Example:**

```json
{
  "id": "exec-123",
  "type": "command",
  "targetNodes": ["web-01"],
  "action": "uptime",
  "status": "success",
  "startedAt": "2024-01-15T10:30:00.000Z",
  "completedAt": "2024-01-15T10:30:01.234Z",
  "results": [
    {
      "nodeId": "web-01",
      "status": "success",
      "output": {
        "stdout": " 10:30:01 up 45 days,  3:15,  2 users,  load average: 0.15, 0.10, 0.08",
        "stderr": "",
        "exitCode": 0
      },
      "duration": 1234
    }
  ],
  "boltCommand": "bolt command run 'uptime' --targets web-01 --format json"
}
```

**Why It's Useful:**

- See all available data
- Understand API structure
- Debug frontend issues
- Verify data integrity

#### 5. Execution Context

**Information Provided:**

- API endpoint called
- HTTP method used
- Request timestamp
- Target node(s)
- Operation parameters
- User information (if authentication enabled)

**Example:**

```
Execution Context:
  Endpoint: /api/nodes/web-01/task
  Method: POST
  Timestamp: 2024-01-15T10:30:45.123Z
  Node: web-01
  Task: psick::puppet_agent
  Parameters: {"noop": true, "tags": "web"}
  Request ID: req-abc123-def456
```

### Using Expert Mode for Troubleshooting

#### Scenario 1: Command Fails with Unclear Error

**Without Expert Mode:**

```
Error: Command execution failed
```

**With Expert Mode:**

1. Enable expert mode
2. Retry the command
3. Review detailed error:
   - Check Bolt command syntax
   - Review raw Bolt output
   - Identify specific error
4. Test Bolt command manually:

   ```bash
   bolt command run 'your-command' --targets node-name --format json
   ```

5. Fix the issue based on detailed information

#### Scenario 2: Task Parameter Issues

**Problem:** Task fails with parameter error

**With Expert Mode:**

1. View the Bolt command executed
2. Verify parameter names and values
3. Check parameter format
4. Test command manually with corrections
5. Update task parameters in Pabawi

#### Scenario 3: Connection Problems

**Problem:** Cannot connect to node

**With Expert Mode:**

1. Review raw Bolt output for connection details
2. Check exact error message
3. Verify connection parameters in Bolt command
4. Test connectivity manually:

   ```bash
   ssh user@node-hostname
   ```

5. Fix inventory configuration

#### Scenario 4: Reporting Bugs

**When reporting issues:**

1. Enable expert mode
2. Reproduce the issue
3. Copy the following information:
   - Request ID
   - Bolt command
   - Raw error output
   - Stack trace
   - Execution context
4. Include in bug report
5. Helps developers diagnose quickly

### Expert Mode Best Practices

**Do:**

- Enable when troubleshooting
- Copy relevant information for support
- Use request IDs to correlate logs
- Test Bolt commands manually
- Learn from the detailed output

**Don't:**

- Leave enabled for normal users
- Share sensitive information from output
- Ignore security warnings
- Assume all users need expert mode
- Forget to disable after troubleshooting

### Security Considerations

**Information Exposed in Expert Mode:**

- Internal file paths
- System configuration details
- Bolt project structure
- Full error stack traces
- Server implementation details

**Best Practices:**

- Only enable for trusted users
- Disable in production by default
- Review output before sharing
- Sanitize sensitive data
- Use for troubleshooting only

### Disabling Expert Mode

1. Click the Expert Mode toggle again
2. Toggle turns off
3. Interface returns to normal mode
4. Detailed information no longer displayed
5. Setting persists until re-enabled

## Realtime Streaming Output

Realtime streaming provides live output from command and task executions as they run, giving you immediate feedback and visibility into long-running operations.

### What is Realtime Streaming?

**Traditional Execution:**

- Submit command/task
- Wait for completion
- View results when finished

**Streaming Execution:**

- Submit command/task
- See output as it's generated
- Monitor progress in real-time
- View results incrementally

### When Streaming is Available

Streaming is available when:

- Expert mode is enabled
- Execution is currently running
- Server supports Server-Sent Events (SSE)
- Browser supports EventSource API

**Supported Operations:**

- Command execution
- Task execution
- Puppet runs
- Package installation
- Any Bolt operation

### Enabling Streaming

#### Prerequisites

1. **Enable Expert Mode:**
   - Click Expert Mode toggle in navigation
   - Streaming requires expert mode
   - Setting persists across sessions

2. **Verify Browser Support:**
   - Modern browsers support SSE
   - Chrome, Firefox, Safari, Edge all supported
   - Internet Explorer not supported

#### Automatic Activation

Once expert mode is enabled:

- Streaming activates automatically for new executions
- No additional configuration needed
- Works for all execution types
- Falls back gracefully if unavailable

### Using Streaming Output

#### Starting an Execution with Streaming

1. **Enable Expert Mode** (if not already enabled)
2. **Start any execution:**
   - Execute a command
   - Run a task
   - Start a Puppet run
   - Install a package
3. **Streaming begins automatically:**
   - Output appears in real-time
   - Updates as execution progresses
   - Shows stdout and stderr separately

#### Understanding the Streaming Display

**Components:**

- **Status Bar**: Shows active connection status
- **Output Window**: Displays text as it arrives
- **Scroll Lock**: Option to auto-scroll or pause
- **Stop Button**: Cancel execution (if supported)

### Troubleshooting Streaming

**Problem: "Streaming connection failed"**

- Check network connection
- Verify SSE support on server
- Check for proxy interference
- Streaming may fall back to polling

**Problem: "No output appears"**

- Command may not produce output yet
- Buffering may cause slight delay
- Check if execution is actually running

## Interpreting Bolt Command Output

When working with Bolt, understanding its output format is crucial for diagnosing issues. This section explains how to interpret standard Bolt JSON output.

### Standard Success Response

A successful command execution returns a JSON structure like this:

```json
{
  "items": [
    {
      "target": "web-01",
      "status": "success",
      "result": {
        "stdout": "up 10 days\n",
        "stderr": "",
        "exit_code": 0
      }
    }
  ],
  "target_count": 1,
  "elapsed_time": 1
}
```

**Key Fields:**

- `status`: "success" indicates command ran without error
- `stdout`: The actual output from the command
- `stderr`: Any error messages (usually empty on success)
- `exit_code`: Should be 0 for success

### Task Execution Response

Task results are more structured:

```json
{
  "items": [
    {
      "target": "db-01",
      "status": "success",
      "result": {
        "output": "Service postgresql restarted",
        "changed": true,
        "_output": "Service postgresql restarted"
      }
    }
  ]
}
```

**Key Fields:**

- `result`: Contains task-specific return values
- `_output`: The human-readable output string

### Common Error Responses

**1. Connection Failure:**

```json
{
  "target": "web-02",
  "status": "failure",
  "result": {
    "_error": {
      "kind": "puppetlabs.tasks/connect-error",
      "msg": "Failed to connect to web-02: Connection refused",
      "details": {}
    }
  }
}
```

**2. Command Failure (Non-zero exit code):**

```json
{
  "target": "web-01",
  "status": "failure",
  "result": {
    "stdout": "",
    "stderr": "cat: /nonexistent: No such file or directory\n",
    "exit_code": 1,
    "_error": {
      "kind": "puppetlabs.tasks/command-error",
      "msg": "The command failed with exit code 1",
      "details": { "exit_code": 1 }
    }
  }
}
```

## Puppet Reports Filtering

**New in v0.5.0**: The PuppetDB integration now includes powerful report filtering capabilities that allow you to find exactly the reports you need based on time, status, and environment.

### Filter Options

When viewing Puppet reports for a node, you can use the following filters:

1. **Time Period**:
   - **Last 24 Hours** (default): Shows recent activity
   - **Last 7 Days**: Weekly overview
   - **Last 30 Days**: Monthly history
   - **All Time**: Complete history (paginated)

2. **Status**:
   - **All Statuses**: Show every report
   - **Changed**: Only reports where resources were modified
   - **Unchanged**: Reports with no changes
   - **Failed**: Reports with errors

3. **Environment**:
   - Filter by Puppet environment (production, development, etc.)
   - Dropdown populates automatically based on available reports

### Using Report Filters

1. Navigate to a node's detail page
2. Click the **"Reports"** tab
3. Locate the filter bar above the reports list
4. Select your desired criteria
5. The list updates automatically to show matching reports

### Report Status Indicators

Reports in the list are color-coded by status:

- **Blue**: Changed (resources were modified)
- **Green**: Unchanged (no modifications needed)
- **Red**: Failed (errors occurred during run)

## Puppet Run Visualization

**New in v0.5.0**: Visualize Puppet runs with an interactive timeline and resource graph to better understand execution flow and resource relationships.

### Timeline View

The timeline view shows the sequence of events during a Puppet run:

- **Execution Flow**: See which resources were applied in what order
- **Duration**: Visual representation of how long each resource took
- **Status Colors**: Quickly identify failed or changed resources
- **Filtering**: Focus on specific resource types or statuses

### Resource Graph

The resource graph displays dependencies between resources:

- **Nodes**: Represent individual resources (File, Package, Service, etc.)
- **Edges**: Represent dependencies (require, subscribe, notify, before)
- **Interactive**: Zoom, pan, and click nodes for details
- **Layout**: Automatic layout to minimize crossing lines

### Accessing Visualizations

1. Navigate to a node's detail page
2. Go to the **"Reports"** tab
3. Click on a specific report to view details
4. Look for the **"Visualization"** toggle or tab within the report detail view

## Tips and Best Practices

### General Usage

- **Check Connectivity First**: Before running complex tasks, verify node connectivity with a simple `uptime` command.
- **Use Expert Mode for Learning**: Enable Expert Mode to see the underlying Bolt commands and learn how they are constructed.
- **Refresh Inventory**: If you add new nodes to your Bolt inventory file, restart the Pabawi server or wait for the inventory cache to expire.

### Performance

- **Limit Target Count**: For better performance, avoid running commands on hundreds of nodes simultaneously unless necessary.
- **Use Inventory Groups**: Define groups in your `inventory.yaml` to target logical sets of nodes easily.
- **Streaming for Long Tasks**: Always use Expert Mode/Streaming for tasks that take more than a few seconds to avoid timeouts.

### Security

- **Review Whitelists**: In production environments, strictly configure the command whitelist to prevent unauthorized execution.
- **Least Privilege**: Ensure the SSH user used by Bolt has only the necessary permissions on target nodes (e.g., specific sudo capabilities).
- **Audit Logs**: Regularly review the Execution History for any unusual activity.

---
*End of User Guide*
