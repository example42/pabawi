# Pabawi Integration Implementation Plan

Based on Pabawi's current architecture and your multi-source inventory pattern, here's a detailed implementation plan for the top 3 integrations:

---

## 1. Ansible Integration (Priority 1)

### Architecture

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Integration, IntegrationHealth, Node } from '../base/integration.js';

const execAsync = promisify(exec);

export class AnsibleClient implements Integration {
  name = 'ansible';
  enabled: boolean;
  
  private inventoryPath: string;
  private configPath?: string;
  
  constructor(config: AnsibleConfig) {
    this.enabled = config.enabled;
    this.inventoryPath = config.inventoryPath;
    this.configPath = config.configPath;
  }
  
  async healthCheck(): Promise<IntegrationHealth> {
    try {
      const { stdout } = await execAsync('ansible --version');
      return {
        status: 'connected',
        message: `Ansible ${stdout.split('\n')[0]}`,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'disconnected',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }
  
  async getInventory(): Promise<Node[]> {
    const { stdout } = await execAsync(
      `ansible-inventory -i ${this.inventoryPath} --list`
    );
    const inventory = JSON.parse(stdout);
    return this.parseInventory(inventory);
  }
  
  async executePlaybook(playbook: string, params: PlaybookParams): Promise<ExecutionResult> {
    const cmd = this.buildPlaybookCommand(playbook, params);
    return this.executeCommand(cmd);
  }
  
  async executeAdHoc(pattern: string, module: string, args: string): Promise<ExecutionResult> {
    const cmd = `ansible ${pattern} -m ${module} -a "${args}" -i ${this.inventoryPath}`;
    return this.executeCommand(cmd);
  }
  
  private parseInventory(inventory: any): Node[] {
    const nodes: Node[] = [];
    
    // Parse hosts from inventory
    Object.entries(inventory._meta?.hostvars || {}).forEach(([host, vars]: [string, any]) => {
      nodes.push({
        name: host,
        uri: vars.ansible_host || host,
        source: 'ansible',
        metadata: {
          groups: this.getHostGroups(inventory, host),
          facts: vars
        }
      });
    });
    
    return nodes;
  }
}
```

### Database Schema Extension

```sql
-- Add Ansible-specific execution types
ALTER TABLE executions ADD COLUMN playbook TEXT;
ALTER TABLE executions ADD COLUMN ansible_pattern TEXT;
ALTER TABLE executions ADD COLUMN ansible_module TEXT;

-- Create playbook history table
CREATE TABLE IF NOT EXISTS ansible_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  playbook_path TEXT NOT NULL,
  parameters TEXT, -- JSON
  results TEXT, -- JSON per host
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_ansible_playbooks_execution ON ansible_playbooks(execution_id);
```

### API Routes

```typescript
import express from 'express';
import { AnsibleService } from '../services/ansible-service.js';

const router = express.Router();
const ansibleService = new AnsibleService();

// Get Ansible inventory
router.get('/inventory', async (req, res) => {
  const nodes = await ansibleService.getInventory();
  res.json(nodes);
});

// Execute playbook
router.post('/playbook', async (req, res) => {
  const { playbook, targets, parameters, limit, tags } = req.body;
  
  const execution = await ansibleService.executePlaybook({
    playbook,
    targets,
    parameters,
    limit,
    tags
  });
  
  res.json(execution);
});

// Execute ad-hoc command
router.post('/adhoc', async (req, res) => {
  const { pattern, module, args, targets } = req.body;
  
  const execution = await ansibleService.executeAdHoc({
    pattern,
    module,
    args,
    targets
  });
  
  res.json(execution);
});

// Get playbook list
router.get('/playbooks', async (req, res) => {
  const playbooks = await ansibleService.getAvailablePlaybooks();
  res.json(playbooks);
});

export default router;
```

### Frontend Components

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  
  let playbooks = $state([]);
  let selectedPlaybook = $state(null);
  let parameters = $state({});
  let selectedTargets = $state([]);
  
  onMount(async () => {
    const response = await fetch('/api/ansible/playbooks');
    playbooks = await response.json();
  });
  
  async function executePlaybook() {
    const response = await fetch('/api/ansible/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playbook: selectedPlaybook,
        targets: selectedTargets,
        parameters
      })
    });
    
    const execution = await response.json();
    // Navigate to execution detail or show streaming output
  }
</script>

<div class="playbooks-page">
  <h1>Ansible Playbooks</h1>
  
  <div class="playbook-selector">
    <select bind:value={selectedPlaybook}>
      <option value={null}>Select playbook...</option>
      {#each playbooks as playbook}
        <option value={playbook.path}>{playbook.name}</option>
      {/each}
    </select>
  </div>
  
  {#if selectedPlaybook}
    <div class="execution-form">
      <h3>Targets</h3>
      <!-- Target selection component -->
      
      <h3>Parameters</h3>
      <!-- Dynamic parameter inputs based on playbook vars -->
      
      <button onclick={executePlaybook}>Execute Playbook</button>
    </div>
  {/if}
</div>
```

### Environment Configuration

```bash
# ...existing code...

# Ansible Integration (Optional)
ANSIBLE_ENABLED=true
ANSIBLE_INVENTORY_PATH=./ansible/inventory
ANSIBLE_PLAYBOOK_DIR=./ansible/playbooks
ANSIBLE_CONFIG_PATH=./ansible/ansible.cfg
ANSIBLE_TIMEOUT=600000
```

---

## 2. Prometheus Integration (Priority 2)

### Architecture

```typescript
import fetch from 'node-fetch';
import type { Integration, IntegrationHealth } from '../base/integration.js';

export class PrometheusClient implements Integration {
  name = 'prometheus';
  enabled: boolean;
  
  private baseUrl: string;
  private timeout: number;
  
  constructor(config: PrometheusConfig) {
    this.enabled = config.enabled;
    this.baseUrl = config.serverUrl;
    this.timeout = config.timeout || 30000;
  }
  
  async healthCheck(): Promise<IntegrationHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/-/healthy`, {
        timeout: this.timeout
      });
      
      if (response.ok) {
        return {
          status: 'connected',
          message: 'Prometheus server healthy',
          lastCheck: new Date()
        };
      }
      
      return {
        status: 'degraded',
        message: `HTTP ${response.status}`,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'disconnected',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }
  
  async getNodeMetrics(nodeName: string): Promise<NodeMetrics> {
    const queries = {
      cpu: `100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}.*"}[5m])) * 100)`,
      memory: `(node_memory_MemTotal_bytes{instance=~"${nodeName}.*"} - node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"}) / node_memory_MemTotal_bytes{instance=~"${nodeName}.*"} * 100`,
      disk: `100 - ((node_filesystem_avail_bytes{instance=~"${nodeName}.*",mountpoint="/"} * 100) / node_filesystem_size_bytes{instance=~"${nodeName}.*",mountpoint="/"})`
    };
    
    const results = await Promise.all(
      Object.entries(queries).map(([metric, query]) =>
        this.query(query).then(result => [metric, result])
      )
    );
    
    return Object.fromEntries(results);
  }
  
  async getAlerts(nodeName?: string): Promise<Alert[]> {
    const url = `${this.baseUrl}/api/v1/alerts`;
    const response = await fetch(url, { timeout: this.timeout });
    const data = await response.json();
    
    let alerts = data.data.alerts;
    
    if (nodeName) {
      alerts = alerts.filter(alert =>
        alert.labels.instance?.includes(nodeName)
      );
    }
    
    return alerts;
  }
  
  private async query(promql: string): Promise<any> {
    const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const response = await fetch(url, { timeout: this.timeout });
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(`Prometheus query failed: ${data.error}`);
    }
    
    return data.data.result;
  }
}
```

### API Routes

```typescript
import express from 'express';
import { PrometheusService } from '../services/prometheus-service.js';

const router = express.Router();
const prometheusService = new PrometheusService();

// Get metrics for a node
router.get('/nodes/:name/metrics', async (req, res) => {
  const { name } = req.params;
  const metrics = await prometheusService.getNodeMetrics(name);
  res.json(metrics);
});

// Get alerts for a node
router.get('/nodes/:name/alerts', async (req, res) => {
  const { name } = req.params;
  const alerts = await prometheusService.getAlerts(name);
  res.json(alerts);
});

// Get all active alerts
router.get('/alerts', async (req, res) => {
  const alerts = await prometheusService.getAlerts();
  res.json(alerts);
});

export default router;
```

### Frontend Components

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  
  let { nodeName } = $props();
  let metrics = $state(null);
  let loading = $state(true);
  
  onMount(async () => {
    try {
      const response = await fetch(`/api/metrics/nodes/${nodeName}/metrics`);
      metrics = await response.json();
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      loading = false;
    }
  });
  
  function getStatusClass(value: number, thresholds: { warning: number, critical: number }) {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'ok';
  }
</script>

{#if !loading && metrics}
  <div class="metrics-badges">
    <span class="metric-badge {getStatusClass(metrics.cpu, { warning: 70, critical: 90 })}">
      CPU: {metrics.cpu.toFixed(1)}%
    </span>
    <span class="metric-badge {getStatusClass(metrics.memory, { warning: 80, critical: 95 })}">
      MEM: {metrics.memory.toFixed(1)}%
    </span>
    <span class="metric-badge {getStatusClass(metrics.disk, { warning: 80, critical: 95 })}">
      DISK: {metrics.disk.toFixed(1)}%
    </span>
  </div>
{/if}

<style>
  .metrics-badges {
    display: flex;
    gap: 0.5rem;
  }
  
  .metric-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .metric-badge.ok {
    background-color: #10b981;
    color: white;
  }
  
  .metric-badge.warning {
    background-color: #f59e0b;
    color: white;
  }
  
  .metric-badge.critical {
    background-color: #ef4444;
    color: white;
  }
</style>
```

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  
  let { nodeName, grafanaUrl } = $props();
  let alerts = $state([]);
  
  onMount(async () => {
    const response = await fetch(`/api/metrics/nodes/${nodeName}/alerts`);
    alerts = await response.json();
  });
</script>

<div class="metrics-tab">
  <div class="section">
    <h3>Active Alerts</h3>
    {#if alerts.length === 0}
      <p class="no-alerts">No active alerts</p>
    {:else}
      <div class="alerts-list">
        {#each alerts as alert}
          <div class="alert alert-{alert.labels.severity}">
            <strong>{alert.labels.alertname}</strong>
            <p>{alert.annotations.description || alert.annotations.summary}</p>
            <small>Since: {new Date(alert.activeAt).toLocaleString()}</small>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  {#if grafanaUrl}
    <div class="section">
      <h3>Grafana Dashboard</h3>
      <a href="{grafanaUrl}/d/node-exporter?var-instance={nodeName}" 
         target="_blank" 
         class="button">
        Open in Grafana →
      </a>
    </div>
  {/if}
</div>
```

### Environment Configuration

```bash
# ...existing code...

# Prometheus Integration (Optional)
PROMETHEUS_ENABLED=true
PROMETHEUS_SERVER_URL=http://prometheus:9090
PROMETHEUS_TIMEOUT=30000
GRAFANA_URL=http://grafana:3000
```

---

## 3. Terraform Integration (Priority 3)

### Architecture

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import type { Integration, IntegrationHealth } from '../base/integration.js';

const execAsync = promisify(exec);

export class TerraformClient implements Integration {
  name = 'terraform';
  enabled: boolean;
  
  private workingDir: string;
  private stateBackend: 'local' | 's3' | 'remote';
  
  constructor(config: TerraformConfig) {
    this.enabled = config.enabled;
    this.workingDir = config.workingDir;
    this.stateBackend = config.stateBackend || 'local';
  }
  
  async healthCheck(): Promise<IntegrationHealth> {
    try {
      const { stdout } = await execAsync('terraform version');
      return {
        status: 'connected',
        message: stdout.split('\n')[0],
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'disconnected',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }
  
  async getState(): Promise<TerraformState> {
    const { stdout } = await execAsync('terraform show -json', {
      cwd: this.workingDir
    });
    return JSON.parse(stdout);
  }
  
  async getResources(): Promise<TerraformResource[]> {
    const state = await this.getState();
    return state.values?.root_module?.resources || [];
  }
  
  async getResourcesByNode(nodeName: string): Promise<TerraformResource[]> {
    const resources = await this.getResources();
    return resources.filter(r =>
      r.values?.tags?.Name === nodeName ||
      r.values?.name === nodeName ||
      r.address.includes(nodeName)
    );
  }
  
  async plan(targets?: string[]): Promise<TerraformPlan> {
    let cmd = 'terraform plan -json';
    if (targets) {
      cmd += targets.map(t => ` -target=${t}`).join('');
    }
    
    const { stdout } = await execAsync(cmd, {
      cwd: this.workingDir
    });
    
    return this.parsePlanOutput(stdout);
  }
  
  async apply(targets?: string[]): Promise<ExecutionResult> {
    let cmd = 'terraform apply -auto-approve';
    if (targets) {
      cmd += targets.map(t => ` -target=${t}`).join('');
    }
    
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: this.workingDir
    });
    
    return {
      success: !stderr.includes('Error'),
      stdout,
      stderr,
      timestamp: new Date()
    };
  }
}
```

### API Routes

```typescript
import express from 'express';
import { TerraformService } from '../services/terraform-service.js';

const router = express.Router();
const terraformService = new TerraformService();

// Get Terraform state
router.get('/state', async (req, res) => {
  const state = await terraformService.getState();
  res.json(state);
});

// Get all resources
router.get('/resources', async (req, res) => {
  const resources = await terraformService.getResources();
  res.json(resources);
});

// Get resources for a specific node
router.get('/nodes/:name/resources', async (req, res) => {
  const { name } = req.params;
  const resources = await terraformService.getResourcesByNode(name);
  res.json(resources);
});

// Run terraform plan
router.post('/plan', async (req, res) => {
  const { targets } = req.body;
  const plan = await terraformService.plan(targets);
  res.json(plan);
});

// Run terraform apply
router.post('/apply', async (req, res) => {
  const { targets } = req.body;
  const result = await terraformService.apply(targets);
  res.json(result);
});

export default router;
```

### Frontend Components

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  
  let { nodeName } = $props();
  let resources = $state([]);
  let loading = $state(true);
  
  onMount(async () => {
    try {
      const response = await fetch(`/api/terraform/nodes/${nodeName}/resources`);
      resources = await response.json();
    } finally {
      loading = false;
    }
  });
  
  function getResourceIcon(type: string) {
    if (type.includes('instance')) return '🖥️';
    if (type.includes('volume')) return '💾';
    if (type.includes('network')) return '🌐';
    if (type.includes('security')) return '🔒';
    return '📦';
  }
</script>

<div class="terraform-tab">
  {#if loading}
    <p>Loading Terraform resources...</p>
  {:else if resources.length === 0}
    <p>No Terraform resources found for this node</p>
  {:else}
    <div class="resources-list">
      {#each resources as resource}
        <div class="resource-card">
          <div class="resource-header">
            <span class="resource-icon">{getResourceIcon(resource.type)}</span>
            <h4>{resource.name}</h4>
            <span class="resource-type">{resource.type}</span>
          </div>
          
          <div class="resource-details">
            <dl>
              {#each Object.entries(resource.values || {}) as [key, value]}
                <dt>{key}</dt>
                <dd>{JSON.stringify(value)}</dd>
              {/each}
            </dl>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

### Update Node Detail Page

```typescript
// ...existing code...

const tabs = [
  { id: 'overview', label: 'Overview', sources: ['all'] },
  { id: 'facts', label: 'Facts', sources: ['puppetdb'] },
  { id: 'reports', label: 'Puppet Reports', sources: ['puppetdb'] },
  { id: 'catalog', label: 'Catalog', sources: ['puppetdb'] },
  { id: 'events', label: 'Events', sources: ['puppetdb'] },
  { id: 'metrics', label: 'Metrics', sources: ['prometheus'] }, // NEW
  { id: 'terraform', label: 'Terraform', sources: ['terraform'] }, // NEW
  { id: 'ansible', label: 'Ansible', sources: ['ansible'] }, // NEW
];

// ...existing code...
```

---

## Integration Manager

```typescript
import { PuppetDBClient } from './puppetdb/puppetdb-client.js';
import { AnsibleClient } from './ansible/ansible-client.js';
import { PrometheusClient } from './prometheus/prometheus-client.js';
import { TerraformClient } from './terraform/terraform-client.js';
import type { Integration, Node } from './base/integration.js';

export class IntegrationManager {
  private integrations: Map<string, Integration> = new Map();
  
  constructor() {
    this.initializeIntegrations();
  }
  
  private initializeIntegrations() {
    // PuppetDB
    if (process.env.PUPPETDB_ENABLED === 'true') {
      this.integrations.set('puppetdb', new PuppetDBClient({
        enabled: true,
        serverUrl: process.env.PUPPETDB_SERVER_URL!,
        // ... other config
      }));
    }
    
    // Ansible
    if (process.env.ANSIBLE_ENABLED === 'true') {
      this.integrations.set('ansible', new AnsibleClient({
        enabled: true,
        inventoryPath: process.env.ANSIBLE_INVENTORY_PATH!,
        // ... other config
      }));
    }
    
    // Prometheus
    if (process.env.PROMETHEUS_ENABLED === 'true') {
      this.integrations.set('prometheus', new PrometheusClient({
        enabled: true,
        serverUrl: process.env.PROMETHEUS_SERVER_URL!,
        // ... other config
      }));
    }
    
    // Terraform
    if (process.env.TERRAFORM_ENABLED === 'true') {
      this.integrations.set('terraform', new TerraformClient({
        enabled: true,
        workingDir: process.env.TERRAFORM_WORKING_DIR!,
        // ... other config
      }));
    }
  }
  
  async getMultiSourceInventory(): Promise<Node[]> {
    const allNodes: Node[] = [];
    
    for (const [name, integration] of this.integrations) {
      if (integration.enabled && integration.getInventory) {
        try {
          const nodes = await integration.getInventory();
          allNodes.push(...nodes);
        } catch (error) {
          console.error(`Failed to get inventory from ${name}:`, error);
        }
      }
    }
    
    return this.deduplicateNodes(allNodes);
  }
  
  async getIntegrationStatus() {
    const statuses = [];
    
    for (const [name, integration] of this.integrations) {
      const health = await integration.healthCheck();
      statuses.push({
        name,
        enabled: integration.enabled,
        ...health
      });
    }
    
    return statuses;
  }
  
  private deduplicateNodes(nodes: Node[]): Node[] {
    const nodeMap = new Map<string, Node>();
    
    for (const node of nodes) {
      const existing = nodeMap.get(node.name);
      if (!existing) {
        nodeMap.set(node.name, node);
      } else {
        // Merge metadata from multiple sources
        existing.metadata = {
          ...existing.metadata,
          ...node.metadata
        };
        if (!existing.sources) existing.sources = [];
        existing.sources.push(node.source);
      }
    }
    
    return Array.from(nodeMap.values());
  }
}
```

---

## Rollout Plan

### Phase 1: Foundation (Week 1)
1. Create integration base interface
2. Implement IntegrationManager
3. Add integration status endpoint
4. Update home page with integration status cards

### Phase 2: Prometheus (Week 2)
1. Implement PrometheusClient
2. Add metrics API routes
3. Create MetricsBadge component
4. Add Metrics tab to node detail page
5. Update inventory cards with metrics

### Phase 3: Ansible (Weeks 3-4)
1. Implement AnsibleClient
2. Add Ansible API routes
3. Create playbook execution UI
4. Add Ansible tab to node detail
5. Integrate Ansible inventory into multi-source inventory

### Phase 4: Terraform (Week 5)
1. Implement TerraformClient
2. Add Terraform API routes
3. Create resource visualization components
4. Add Terraform tab to node detail
5. Link nodes to Terraform resources

This approach leverages Pabawi's existing multi-source inventory pattern and extends it seamlessly. Each integration adds independent value while contributing to a unified infrastructure view.
