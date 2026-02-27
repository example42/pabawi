/**
 * Unit tests for SSHPlugin
 *
 * Tests plugin initialization, configuration validation, and basic functionality.
 *
 * Validates: Requirements 1.5, 10.11
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSHPlugin } from '../SSHPlugin';
import { LoggerService } from '../../../services/LoggerService';
import { PerformanceMonitorService } from '../../../services/PerformanceMonitorService';
import type { IntegrationConfig } from '../../types';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('fs');

describe('SSHPlugin', () => {
  let plugin: SSHPlugin;
  let logger: LoggerService;
  let performanceMonitor: PerformanceMonitorService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear SSH environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SSH_')) {
        delete process.env[key];
      }
    });

    // Create logger and performance monitor
    logger = new LoggerService();
    performanceMonitor = new PerformanceMonitorService();

    // Spy on logger methods
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});

    // Create plugin instance
    plugin = new SSHPlugin(logger, performanceMonitor);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create plugin with correct name and type', () => {
      expect(plugin.name).toBe('ssh');
      expect(plugin.type).toBe('both');
    });
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Set up environment variables
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      // Mock file operations
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('Host test\n    HostName 192.168.1.10\n');

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized successfully'),
        expect.any(Object)
      );
    });

    it('should not initialize when plugin is disabled in config', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';

      const config: IntegrationConfig = {
        enabled: false, // Plugin disabled in config
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('disabled in configuration'),
        expect.any(Object)
      );
    });

    it('should not initialize when SSH_ENABLED is false', async () => {
      process.env.SSH_ENABLED = 'false';
      process.env.SSH_DEFAULT_USER = 'testuser';

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      // Plugin will initialize but SSH service won't be started
      expect(plugin.isInitialized()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('SSH plugin is disabled'),
        expect.any(Object)
      );
    });

    it('should fail initialization when SSH_DEFAULT_USER is missing', async () => {
      process.env.SSH_ENABLED = 'true';
      // SSH_DEFAULT_USER not set

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        'SSH_DEFAULT_USER is required'
      );

      expect(plugin.isInitialized()).toBe(false);
    });

    it('should initialize without SSH config file', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      // SSH_CONFIG_PATH not set

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No SSH config path configured'),
        expect.any(Object)
      );
    });

    it('should handle SSH config file parse errors gracefully', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('Invalid SSH config\nHost\n');

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      // Should still initialize successfully (graceful error handling)
      expect(plugin.isInitialized()).toBe(true);
    });
  });

  describe('listCapabilities', () => {
    it('should return list of supported capabilities', () => {
      const capabilities = plugin.listCapabilities();

      expect(capabilities).toHaveLength(2);
      expect(capabilities[0].name).toBe('command');
      expect(capabilities[1].name).toBe('package');
    });

    it('should include command capability with parameters', () => {
      const capabilities = plugin.listCapabilities();
      const commandCap = capabilities.find(c => c.name === 'command');

      expect(commandCap).toBeDefined();
      expect(commandCap?.parameters).toBeDefined();
      expect(commandCap?.parameters?.length).toBeGreaterThan(0);
    });
  });

  describe('getInventory', () => {
    it('should return empty inventory when not initialized', async () => {
      const inventory = await plugin.getInventory();

      expect(inventory).toEqual([]);
    });

    it('should return inventory with source tagged as ssh', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        'Host web-server\n    HostName 192.168.1.10\n    User deploy\n'
      );

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const inventory = await plugin.getInventory();

      expect(inventory.length).toBeGreaterThan(0);
      expect(inventory[0].source).toBe('ssh');
      expect(inventory[0].transport).toBe('ssh');
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when not initialized', async () => {
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not initialized');
    });

    it('should return healthy with empty inventory', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('empty');
    });

    it('should return unhealthy when config file not found', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/nonexistent/ssh_config';

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      vi.mocked(existsSync).mockReturnValue(false);

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not found');
    });
  });

  describe('getNodeFacts', () => {
    it('should return placeholder facts for any node', async () => {
      const facts = await plugin.getNodeFacts('test-node');

      expect(facts.nodeId).toBe('test-node');
      expect(facts.source).toBe('ssh');
      expect(facts.facts).toBeDefined();
      expect(facts.facts.os).toBeDefined();
    });
  });

  describe('getNodeData', () => {
    it('should return null for any node data request', async () => {
      const data = await plugin.getNodeData('test-node', 'reports');

      expect(data).toBeNull();
    });
  });

  describe('getGroups', () => {
    it('should throw error when not initialized', async () => {
      await expect(plugin.getGroups()).rejects.toThrow('SSH plugin not initialized');
    });

    it('should return empty array when no config path', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      // No SSH_CONFIG_PATH

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();
      expect(groups).toEqual([]);
    });

    it('should extract groups from Host patterns', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      const sshConfig = `
Host web-prod-*
    HostName 192.168.1.10
    User deploy

Host web-prod-01
    HostName 192.168.1.11
    User deploy

Host web-prod-02
    HostName 192.168.1.12
    User deploy

Host db-*
    HostName 192.168.2.10
    User dbadmin
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(sshConfig);

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();

      expect(groups.length).toBeGreaterThan(0);

      const webProdGroup = groups.find(g => g.name === 'web-prod');
      expect(webProdGroup).toBeDefined();
      expect(webProdGroup?.source).toBe('ssh');
      expect(webProdGroup?.nodes.length).toBeGreaterThan(0);
    });

    it('should handle multi-host patterns', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      const sshConfig = `
Host app-* db-* redis-*
    User admin
    Port 22

Host app-server-01
    HostName 192.168.1.10

Host db-server-01
    HostName 192.168.2.10

Host redis-server-01
    HostName 192.168.3.10
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(sshConfig);

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();

      const appGroup = groups.find(g => g.name === 'app');
      const dbGroup = groups.find(g => g.name === 'db');
      const redisGroup = groups.find(g => g.name === 'redis');

      expect(appGroup).toBeDefined();
      expect(dbGroup).toBeDefined();
      expect(redisGroup).toBeDefined();
    });

    it('should detect environment-based patterns', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      const sshConfig = `
Host web-prod-01
    HostName 192.168.1.10

Host web-stg-01
    HostName 192.168.1.20

Host web-dev-01
    HostName 192.168.1.30
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(sshConfig);

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();

      const prodGroup = groups.find(g => g.name === 'production');
      const stgGroup = groups.find(g => g.name === 'staging');
      const devGroup = groups.find(g => g.name === 'development');

      expect(prodGroup).toBeDefined();
      expect(stgGroup).toBeDefined();
      expect(devGroup).toBeDefined();
    });

    it('should handle Match directives with Host patterns', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      const sshConfig = `
Match Host web-*
    User webadmin

Host web-server-01
    HostName 192.168.1.10

Host web-server-02
    HostName 192.168.1.11
`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(sshConfig);

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();

      const webGroup = groups.find(g => g.name === 'web');
      expect(webGroup).toBeDefined();
    });

    it('should return empty array on parse error', async () => {
      process.env.SSH_ENABLED = 'true';
      process.env.SSH_DEFAULT_USER = 'testuser';
      process.env.SSH_CONFIG_PATH = '/tmp/ssh_config';

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockRejectedValue(new Error('File read error'));

      const config: IntegrationConfig = {
        enabled: true,
        name: 'ssh',
        type: 'both',
        config: {},
      };

      await plugin.initialize(config);

      const groups = await plugin.getGroups();
      expect(groups).toEqual([]);
    });
  });
});
