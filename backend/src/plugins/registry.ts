/**
 * Plugin Registry
 *
 * Declarative registry of all integration plugins. Each entry specifies
 * how to detect configuration, how to instantiate the plugin, and its
 * IntegrationManager metadata (type, priority).
 *
 * The registry array order and priority values reproduce the same
 * registration order as the previous nine copy-pasted blocks in server.ts.
 */

import fs from "fs";
import path from "path";
import type { ConfigService } from "../config/ConfigService";
import type { LoggerService } from "../services/LoggerService";
import type { PerformanceMonitorService } from "../services/PerformanceMonitorService";
import type { IntegrationPlugin } from "../integrations/types";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { BoltService } from "../integrations/bolt/BoltService";
import { BoltPlugin } from "../integrations/bolt/BoltPlugin";
import { AnsibleService } from "../integrations/ansible/AnsibleService";
import { AnsiblePlugin } from "../integrations/ansible/AnsiblePlugin";
import { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import { HieraPlugin } from "../integrations/hiera/HieraPlugin";
import { SSHPlugin } from "../integrations/ssh/SSHPlugin";
import { loadSSHConfig } from "../integrations/ssh/config";
import { ProxmoxIntegration } from "../integrations/proxmox/ProxmoxIntegration";
import { AWSPlugin } from "../integrations/aws/AWSPlugin";
import { AzurePlugin } from "../integrations/azure/AzurePlugin";
import { CheckmkPlugin } from "../integrations/checkmk/CheckmkPlugin";

export interface PluginRegistryEntry {
  /** Integration name (matches IntegrationConfig.name) */
  name: string;
  /** Returns config object if integration is configured, null to skip */
  resolveConfig: (configService: ConfigService) => Record<string, unknown> | null;
  /** Factory that creates the plugin instance */
  create: (deps: PluginDeps) => IntegrationPlugin | Promise<IntegrationPlugin>;
  /** Integration type for IntegrationConfig */
  type: "execution" | "information" | "both";
  /** Priority for IntegrationManager ordering */
  priority: number;
}

export interface PluginDeps {
  configService: ConfigService;
  logger: LoggerService;
  performanceMonitor: PerformanceMonitorService;
  integrationManager: IntegrationManager;
  boltService: BoltService;
}

/**
 * Declarative plugin registry. Order matches the original server.ts
 * initialisation sequence. Priority values are preserved exactly.
 */
export const pluginRegistry: PluginRegistryEntry[] = [
  // 1. Bolt — priority 5
  {
    name: "bolt",
    type: "both",
    priority: 5,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const boltProjectPath = configService.getBoltProjectPath();
      if (!boltProjectPath || boltProjectPath === ".") {
        return null;
      }

      const inventoryYaml = path.join(boltProjectPath, "inventory.yaml");
      const inventoryYml = path.join(boltProjectPath, "inventory.yml");
      const boltProjectYaml = path.join(boltProjectPath, "bolt-project.yaml");
      const boltProjectYml = path.join(boltProjectPath, "bolt-project.yml");

      const hasInventory = fs.existsSync(inventoryYaml) || fs.existsSync(inventoryYml);
      const hasBoltProject = fs.existsSync(boltProjectYaml) || fs.existsSync(boltProjectYml);

      if (!hasInventory && !hasBoltProject) {
        return null;
      }

      return { projectPath: boltProjectPath };
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new BoltPlugin(deps.boltService, deps.logger, deps.performanceMonitor);
    },
  },

  // 2. Ansible — priority 5
  {
    name: "ansible",
    type: "both",
    priority: 5,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const ansibleConfig = configService.getIntegrationsConfig().ansible;
      if (ansibleConfig?.enabled !== true) {
        return null;
      }
      return {
        projectPath: ansibleConfig.projectPath,
        inventoryPath: ansibleConfig.inventoryPath,
        timeout: ansibleConfig.timeout,
      };
    },
    create(deps: PluginDeps): IntegrationPlugin {
      const ansibleConfig = deps.configService.getIntegrationsConfig().ansible;
      if (!ansibleConfig) {
        throw new Error("Ansible config missing during plugin creation");
      }
      const ansibleService = new AnsibleService(
        ansibleConfig.projectPath,
        ansibleConfig.inventoryPath,
        ansibleConfig.timeout,
      );
      return new AnsiblePlugin(ansibleService, deps.logger, deps.performanceMonitor);
    },
  },

  // 3. PuppetDB — priority 10
  {
    name: "puppetdb",
    type: "information",
    priority: 10,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const puppetDBConfig = configService.getIntegrationsConfig().puppetdb;
      if (!puppetDBConfig?.serverUrl) {
        return null;
      }
      return puppetDBConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new PuppetDBService(deps.logger, deps.performanceMonitor);
    },
  },

  // 4. Puppetserver — priority 8
  {
    name: "puppetserver",
    type: "information",
    priority: 8,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const puppetserverConfig = configService.getIntegrationsConfig().puppetserver;
      if (!puppetserverConfig?.serverUrl) {
        return null;
      }
      return puppetserverConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new PuppetserverService(deps.logger, deps.performanceMonitor);
    },
  },

  // 5. Hiera — priority 6
  {
    name: "hiera",
    type: "information",
    priority: 6,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const hieraConfig = configService.getIntegrationsConfig().hiera;
      if (!hieraConfig?.controlRepoPath) {
        return null;
      }
      return hieraConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      const plugin = new HieraPlugin(deps.logger, deps.performanceMonitor);
      plugin.setIntegrationManager(deps.integrationManager);
      return plugin;
    },
  },

  // 6. SSH — priority from config (default 50)
  {
    name: "ssh",
    type: "both",
    priority: 50, // Default; actual priority resolved at registration time
    resolveConfig(_configService: ConfigService): Record<string, unknown> | null {
      try {
        const sshConfig = loadSSHConfig();
        if (!sshConfig.enabled) {
          return null;
        }
        return { ...sshConfig };
      } catch {
        return null;
      }
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new SSHPlugin(deps.logger, deps.performanceMonitor);
    },
  },

  // 7. Proxmox — priority from config (default 7)
  {
    name: "proxmox",
    type: "both",
    priority: 7, // Default; actual priority resolved at registration time
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const proxmoxConfig = configService.getIntegrationsConfig().proxmox;
      if (proxmoxConfig?.enabled !== true) {
        return null;
      }
      return proxmoxConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new ProxmoxIntegration(deps.logger, deps.performanceMonitor);
    },
  },

  // 8. AWS — priority 7
  {
    name: "aws",
    type: "both",
    priority: 7,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const awsConfig = configService.getIntegrationsConfig().aws;
      if (awsConfig?.enabled !== true) {
        return null;
      }
      return awsConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new AWSPlugin(deps.logger, deps.performanceMonitor);
    },
  },

  // 9. Azure — priority 7
  {
    name: "azure",
    type: "both",
    priority: 7,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const azureConfig = configService.getIntegrationsConfig().azure;
      if (azureConfig?.enabled !== true) {
        return null;
      }
      return azureConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new AzurePlugin(deps.logger, deps.performanceMonitor);
    },
  },

  // 10. Checkmk — priority 8
  {
    name: "checkmk",
    type: "information",
    priority: 8,
    resolveConfig(configService: ConfigService): Record<string, unknown> | null {
      const checkmkConfig = configService.getIntegrationsConfig().checkmk;
      if (!checkmkConfig?.serverUrl) {
        return null;
      }
      return checkmkConfig;
    },
    create(deps: PluginDeps): IntegrationPlugin {
      return new CheckmkPlugin(deps.logger, deps.performanceMonitor);
    },
  },
];
