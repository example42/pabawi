# Pabawi Plugin System

This directory contains all Pabawi plugins, both native (shipped with Pabawi) and external (third-party).

## Directory Structure

```
plugins/
├── native/                          # Native plugins shipped with Pabawi
│   ├── bolt/                        # Puppet Bolt integration
│   ├── puppetdb/                    # PuppetDB integration
│   ├── puppetserver/                # Puppetserver integration
│   └── hiera/                       # Hiera integration
├── external/                        # External/third-party plugins
│   └── .gitkeep
└── README.md                        # This file
```

## Plugin Structure

Each plugin follows a standard directory structure:

```
plugin-name/
├── plugin.json                      # Plugin manifest (required)
├── backend/                         # Backend code
│   ├── index.ts                     # Plugin entry point
│   ├── capabilities/                # Capability handlers
│   └── services/                    # Internal services
├── frontend/                        # Frontend widgets (Svelte components)
│   ├── HomeWidget.svelte            # Home page summary widget
│   └── ...                          # Other widgets
├── cli/                             # CLI command definitions
│   └── commands.ts
├── config/                          # Default configuration
│   └── defaults.yaml
└── README.md                        # Plugin documentation
```

## Plugin Manifest (plugin.json)

Every plugin must have a `plugin.json` manifest file that describes the plugin:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Description of what the plugin does",
  "integrationType": "RemoteExecution",
  "color": "#FFAE1A",
  "icon": "terminal",
  "tags": ["automation", "remote-execution"],
  "entryPoint": "backend/index.ts",
  "capabilities": [
    {
      "name": "command.execute",
      "category": "command",
      "description": "Execute commands on remote nodes",
      "riskLevel": "execute",
      "requiredPermissions": ["command.execute"]
    }
  ],
  "widgets": [
    {
      "id": "my-plugin:home-widget",
      "name": "My Plugin Summary",
      "component": "frontend/HomeWidget.svelte",
      "slots": ["home-summary"],
      "size": "medium",
      "requiredCapabilities": ["command.execute"]
    }
  ],
  "cliCommands": [
    {
      "name": "myplugin",
      "actions": [
        {
          "name": "run",
          "capability": "command.execute",
          "description": "Run a command"
        }
      ]
    }
  ],
  "dependencies": [],
  "minPabawiVersion": "1.0.0"
}
```

## Creating a New Plugin

1. Create a new directory under `plugins/external/` (or `plugins/native/` for core plugins)
2. Create a `plugin.json` manifest file
3. Implement the backend plugin class in `backend/index.ts`
4. Add frontend widgets in `frontend/`
5. Define CLI commands in `cli/commands.ts`
6. Document your plugin in `README.md`

## Plugin Development Guide

### Backend Implementation

Your plugin must implement the `BasePluginInterface`:

```typescript
import type { BasePluginInterface, PluginMetadata, PluginCapability } from '@pabawi/types';

export class MyPlugin implements BasePluginInterface {
  metadata: PluginMetadata = {
    name: 'my-plugin',
    version: '1.0.0',
    author: 'Your Name',
    description: 'My awesome plugin',
    integrationType: IntegrationType.RemoteExecution,
    color: '#FFAE1A',
    icon: 'terminal',
    tags: ['automation']
  };

  capabilities: PluginCapability[] = [
    {
      category: 'command',
      name: 'command.execute',
      description: 'Execute commands',
      handler: async (params, context) => {
        // Implementation
      },
      requiredPermissions: ['command.execute'],
      riskLevel: 'execute'
    }
  ];

  async initialize(): Promise<void> {
    // Setup code
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, lastCheck: new Date().toISOString() };
  }

  getConfig(): Record<string, unknown> {
    return this.config;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export function createPlugin(): BasePluginInterface {
  return new MyPlugin();
}
```

### Frontend Widgets

Widgets are Svelte components that render in designated UI slots:

```svelte
<script lang="ts">
  export let pluginName: string;
  export let pluginColor: string;
  
  // Widget implementation
</script>

<div class="widget" style="--plugin-color: {pluginColor}">
  <!-- Widget content -->
</div>
```

### Available Widget Slots

- `home-summary` - Home page integration tiles
- `dashboard` - Dashboard widgets
- `node-detail` - Node detail page widgets
- `node-journal` - Node journal timeline
- `inventory-panel` - Inventory list panel
- `standalone-page` - Full-page widgets
- `sidebar` - Sidebar widgets
- `modal` - Modal dialogs

## Integration Types

Plugins can provide one or more integration types:

- `InventorySource` - Node discovery and inventory
- `RemoteExecution` - Command/task execution
- `Info` - Information retrieval (facts, reports, data)
- `ConfigurationManagement` - Configuration management
- `Event` - Events that happened on systems
- `Monitoring` - Metrics and monitoring
- `Provisioning` - Infrastructure provisioning
- `Deployment` - Application deployment automation
- `SecretManagement` - Secret/credential management
- `Schedule` - Scheduled operations and jobs
- `SoftwareInstall` - Software installation via package managers
- `Orchestration` - Workflow orchestration
- `Logging` - Logging and analytics
- `AuditCompliance` - Audit and compliance
- `BackupRecovery` - Backup and recovery

### Node Journal Integration

Every integration type can write entries to the Node Journal. This is configurable per-plugin:

- When to write (on success, failure, always)
- What to write (summary, details, raw output)
- Logging level (info, warning, error)

## Native Plugins

The following native plugins are included with Pabawi:

| Plugin | Description | Integration Types |
|--------|-------------|-------------------|
| Bolt | Puppet Bolt integration | RemoteExecution, InventorySource |
| PuppetDB | PuppetDB integration | Info, InventorySource, Event |
| Puppetserver | Puppetserver integration | ConfigurationManagement, Info |
| Hiera | Hiera integration | ConfigurationManagement, Info |

## License

Plugins in this directory are subject to the Pabawi license unless otherwise specified.
