/**
 * Tests for BasePlugin class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BasePlugin } from '../../src/integrations/BasePlugin';
import type { IntegrationConfig, HealthStatus } from '../../src/integrations/types';

/**
 * Mock plugin implementation for testing
 */
class MockPlugin extends BasePlugin {
  public initializationCalled = false;
  public healthCheckCalled = false;
  public shouldFailHealthCheck = false;

  constructor(name: string, type: 'execution' | 'information' | 'both') {
    super(name, type);
  }

  protected async performInitialization(): Promise<void> {
    this.initializationCalled = true;
  }

  protected async performHealthCheck(): Promise<Omit<HealthStatus, 'lastCheck'>> {
    this.healthCheckCalled = true;

    if (this.shouldFailHealthCheck) {
      throw new Error('Health check failed');
    }

    return {
      healthy: true,
      message: 'Mock plugin is healthy',
    };
  }
}

describe('BasePlugin', () => {
  let plugin: MockPlugin;
  let config: IntegrationConfig;

  beforeEach(() => {
    plugin = new MockPlugin('test-plugin', 'information');
    config = {
      enabled: true,
      name: 'test-plugin',
      type: 'information',
      config: {
        testOption: 'value',
      },
    };
  });

  describe('initialization', () => {
    it('should initialize with valid configuration', async () => {
      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
      expect(plugin.initializationCalled).toBe(true);
      expect(plugin.getConfig()).toEqual(config);
    });

    it('should not initialize when disabled', async () => {
      const disabledConfig = { ...config, enabled: false };
      await plugin.initialize(disabledConfig);

      expect(plugin.isInitialized()).toBe(false);
      expect(plugin.initializationCalled).toBe(false);
    });

    it('should throw error for mismatched plugin name', async () => {
      const invalidConfig = { ...config, name: 'wrong-name' };

      await expect(plugin.initialize(invalidConfig)).rejects.toThrow(
        "Configuration name 'wrong-name' does not match plugin name 'test-plugin'"
      );
    });

    it('should throw error for mismatched plugin type', async () => {
      const invalidConfig = { ...config, type: 'execution' as const };

      await expect(plugin.initialize(invalidConfig)).rejects.toThrow(
        "Configuration type 'execution' does not match plugin type 'information'"
      );
    });

    it('should throw error for missing name', async () => {
      const invalidConfig = { ...config, name: '' };

      await expect(plugin.initialize(invalidConfig)).rejects.toThrow(
        'Plugin configuration must include a name'
      );
    });
  });

  describe('health check', () => {
    it('should return unhealthy when not initialized', async () => {
      const status = await plugin.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Plugin is not initialized');
      expect(status.lastCheck).toBeDefined();
    });

    it('should return unhealthy when disabled', async () => {
      const disabledConfig = { ...config, enabled: false };
      await plugin.initialize(disabledConfig);

      const status = await plugin.healthCheck();

      expect(status.healthy).toBe(false);
      // When disabled, plugin is not initialized, so we get "not initialized" message
      expect(status.message).toBe('Plugin is not initialized');
    });

    it('should return healthy when initialized and enabled', async () => {
      await plugin.initialize(config);

      const status = await plugin.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.message).toBe('Mock plugin is healthy');
      expect(plugin.healthCheckCalled).toBe(true);
    });

    it('should handle health check errors', async () => {
      await plugin.initialize(config);
      plugin.shouldFailHealthCheck = true;

      const status = await plugin.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Health check failed');
      expect(status.details).toBeDefined();
    });

    it('should cache last health check result', async () => {
      await plugin.initialize(config);
      await plugin.healthCheck();

      const lastCheck = plugin.getLastHealthCheck();

      expect(lastCheck).toBeDefined();
      expect(lastCheck?.healthy).toBe(true);
    });
  });

  describe('configuration management', () => {
    it('should return configuration copy', async () => {
      await plugin.initialize(config);

      const retrievedConfig = plugin.getConfig();

      expect(retrievedConfig).toEqual(config);
      expect(retrievedConfig).not.toBe(config); // Should be a copy
    });

    it('should check if plugin is enabled', async () => {
      await plugin.initialize(config);
      expect(plugin.isEnabled()).toBe(true);

      const disabledConfig = { ...config, enabled: false };
      await plugin.initialize(disabledConfig);
      expect(plugin.isEnabled()).toBe(false);
    });

    it('should return priority from config', async () => {
      const configWithPriority = { ...config, priority: 10 };
      await plugin.initialize(configWithPriority);

      expect(plugin.getPriority()).toBe(10);
    });

    it('should return default priority when not specified', async () => {
      await plugin.initialize(config);

      expect(plugin.getPriority()).toBe(0);
    });
  });

  describe('plugin properties', () => {
    it('should have correct name', () => {
      expect(plugin.name).toBe('test-plugin');
    });

    it('should have correct type', () => {
      expect(plugin.type).toBe('information');
    });
  });
});
