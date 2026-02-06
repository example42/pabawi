# Standardized Capability Types Reference

## Overview

This document defines all standardized capability types that plugins can implement. Each capability type represents a category of functionality that can be provided by one or more plugins.

## Core Capability Types (Phase 1)

### 1. Inventory Capability

**Purpose**: Discover and manage target nodes/systems

**Capabilities:**

- `inventory.list` - List all nodes from this source
- `inventory.get` - Get specific node details by ID
- `inventory.groups` - List available node groups
- `inventory.filter` - Filter nodes by criteria (group, tags, etc.)

**Example Plugins**: Bolt, PuppetDB, Ansible, SSH, Terraform

**Use Cases**:

- Discover available nodes for management
- Group nodes by environment, role, or location
- Query node metadata and connection details

---

### 2. Facts Capability

**Purpose**: Collect and retrieve system information about nodes

**Capabilities:**

- `info.facts` - Get facts for a specific node
- `info.refresh` - Force refresh facts (bypass cache)

**Example Plugins**: Bolt, PuppetDB, Ansible

**Use Cases**:

- Get OS version, IP addresses, installed packages
- Retrieve hardware information (CPU, memory, disk)
- Query custom facts defined by configuration management

---

### 3. Remote Execution Capability

**Purpose**: Execute commands, tasks, and scripts on remote systems

**Capabilities:**

- `command.execute` - Execute shell command on target nodes
- `task.execute` - Execute task/playbook on target nodes
- `script.execute` - Execute script file on target nodes

**Example Plugins**: Bolt, Ansible, SSH

**Use Cases**:

- Run ad-hoc commands across infrastructure
- Execute automation tasks and playbooks
- Deploy scripts for maintenance or troubleshooting

**Integration Points**:

- ExecutionQueue for concurrency control
- StreamingExecutionManager for real-time output

---

### 4. Reports Capability

**Purpose**: Query and retrieve execution reports and history

**Capabilities:**

- `reports.list` - List available reports
- `reports.get` - Get specific report by ID
- `reports.query` - Query reports with filters (time range, status, node)

**Example Plugins**: PuppetDB, Ansible Tower

**Use Cases**:

- View execution history and results
- Audit configuration changes
- Track compliance and drift

---

### 5. Events Capability

**Purpose**: Stream and query system events and changes

**Capabilities:**

- `events.list` - List events for a node or time range
- `events.stream` - Stream live events as they occur
- `events.query` - Query events with filters

**Example Plugins**: PuppetDB, Monitoring tools (Prometheus, Datadog)

**Use Cases**:

- Monitor real-time system changes
- Track configuration drift
- Alert on specific event patterns

---

## Future Capability Types (Phase 4+)

### 6. Provisioning Capability

**Purpose**: Provision and decommission infrastructure

**Capabilities:**

- `provision.create` - Provision new infrastructure/nodes
- `provision.status` - Get provisioning status
- `provision.list` - List provisioned resources
- `decommission.execute` - Decommission infrastructure/nodes
- `decommission.status` - Get decommissioning status

**Example Plugins**: Terraform, CloudFormation, Vagrant

**Use Cases**:

- Provision VMs, containers, cloud resources
- Decommission unused infrastructure
- Track provisioning state and history

**Integration Points**:

- ExecutionQueue for long-running operations
- Node Journal for provisioning events

---

### 7. Software Installation Capability

**Purpose**: Install, update, and manage software packages

**Capabilities:**

- `package.install` - Install software packages
- `package.uninstall` - Uninstall software packages
- `package.update` - Update software packages
- `package.list` - List installed packages on a node
- `package.search` - Search available packages

**Example Plugins**: apt, yum, dnf, chocolatey, Puppet, Ansible

**Use Cases**:

- Install software across infrastructure
- Update packages to latest versions
- Audit installed software inventory

**Integration Points**:

- ExecutionQueue for concurrent installations
- Node Journal for package change tracking

---

### 8. Deployment Capability

**Purpose**: Deploy applications and services

**Capabilities:**

- `deploy.execute` - Deploy application/service
- `deploy.status` - Get deployment status
- `deploy.rollback` - Rollback to previous deployment
- `deploy.history` - Get deployment history

**Example Plugins**: Jenkins, GitLab CI, GitHub Actions, Kubernetes, Docker

**Use Cases**:

- Deploy applications to production
- Rollback failed deployments
- Track deployment history and versions

**Integration Points**:

- ExecutionQueue for deployment orchestration
- Events for deployment notifications
- Node Journal for deployment tracking

---

### 9. Alert Capability

**Purpose**: Manage alerts and notifications

**Capabilities:**

- `alert.list` - List alerts for nodes/services
- `alert.get` - Get specific alert details
- `alert.acknowledge` - Acknowledge an alert
- `alert.resolve` - Resolve an alert
- `alert.subscribe` - Subscribe to alert notifications

**Example Plugins**: Prometheus, Grafana, Nagios, Datadog, PagerDuty

**Use Cases**:

- Monitor system health and performance
- Acknowledge and resolve incidents
- Subscribe to critical alerts

**Integration Points**:

- Events for alert streaming
- Node Journal for alert history

---

## Capability Naming Convention

All capabilities follow the pattern: `<category>.<action>`

**Categories:**

- `inventory` - Node discovery and management
- `info` - Information retrieval (facts, metadata)
- `command` - Command execution
- `task` - Task/playbook execution
- `script` - Script execution
- `reports` - Report querying
- `events` - Event streaming and querying
- `provision` - Infrastructure provisioning
- `decommission` - Infrastructure decommissioning
- `package` - Software package management
- `deploy` - Application deployment
- `alert` - Alert management

**Actions:**

- `list` - List resources
- `get` - Get specific resource
- `query` - Query with filters
- `execute` - Execute operation
- `create` - Create resource
- `update` - Update resource
- `delete` - Delete resource
- `status` - Get status
- `stream` - Stream real-time data
- `refresh` - Force refresh
- `rollback` - Rollback operation
- `acknowledge` - Acknowledge item
- `resolve` - Resolve item
- `subscribe` - Subscribe to notifications

---

## Plugin Composition Examples

### Example 1: Bolt Plugin (Multi-Type)

```typescript
capabilities = [
  // Inventory
  { name: 'inventory.list', ... },
  { name: 'inventory.get', ... },
  
  // Facts
  { name: 'info.facts', ... },
  
  // Remote Execution
  { name: 'command.execute', ... },
  { name: 'task.execute', ... },
  { name: 'script.execute', ... }
]
```

**Types**: Inventory Source + Facts Provider + Remote Execution

---

### Example 2: PuppetDB Plugin (Multi-Type)

```typescript
capabilities = [
  // Inventory
  { name: 'inventory.list', ... },
  { name: 'inventory.get', ... },
  { name: 'inventory.groups', ... },
  
  // Facts
  { name: 'info.facts', ... },
  
  // Reports
  { name: 'reports.list', ... },
  { name: 'reports.get', ... },
  { name: 'reports.query', ... },
  
  // Events
  { name: 'events.list', ... },
  { name: 'events.query', ... }
]
```

**Types**: Inventory Source + Facts Provider + Reports Provider + Events Provider

---

### Example 3: Terraform Plugin (Single-Type)

```typescript
capabilities = [
  // Provisioning
  { name: 'provision.create', ... },
  { name: 'provision.status', ... },
  { name: 'provision.list', ... },
  { name: 'decommission.execute', ... },
  { name: 'decommission.status', ... }
]
```

**Types**: Provisioning Tool

---

### Example 4: Prometheus Plugin (Multi-Type)

```typescript
capabilities = [
  // Alerts
  { name: 'alert.list', ... },
  { name: 'alert.get', ... },
  { name: 'alert.acknowledge', ... },
  
  // Events
  { name: 'events.stream', ... },
  { name: 'events.query', ... }
]
```

**Types**: Monitoring/Alerting + Events Provider

---

## Implementation Priority

1. **Phase 1** (Core): Inventory, Facts, Remote Execution, Reports, Events
2. **Phase 2**: Bolt plugin implementing core capabilities
3. **Phase 3**: PuppetDB, Puppetserver plugins
4. **Phase 4**: Provisioning, Software Installation capabilities
5. **Phase 5**: Deployment, Alert capabilities
6. **Phase 6**: Additional plugins (Terraform, package managers, CI/CD, monitoring)

---

## Benefits of Standardization

1. **Interoperability**: Plugins providing the same capability type are interchangeable
2. **Consistency**: Users learn one interface, works across all plugins
3. **Composability**: Mix and match capabilities from different plugins
4. **Discovery**: Frontend can auto-discover available capabilities
5. **Routing**: CapabilityRegistry routes to best provider automatically
6. **Testing**: Standard interfaces enable generic test suites
7. **Documentation**: Auto-generate docs from capability schemas
