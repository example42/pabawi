/**
 * Test: Verify inventory endpoints for all plugins
 *
 * This test verifies that ansible, bolt, puppetdb, and ssh plugins
 * expose the standardized inventory endpoints:
 * - inventory.list
 * - inventory.get
 * - inventory.groups
 * - inventory.filter
 *
 * Validates Requirement 6.1
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { IntegrationManager } from '../../src/integrations/IntegrationManager.js';
import { CapabilityRegistry } from '../../src/integrations/CapabilityRegistry.js';
import { ConfigService } from '../../src/config/ConfigService.js';
import { LoggerService } from '../../src/services/LoggerService.js';

describe('Inventory Endpoints Verification', () => {
  let integrationManager: IntegrationManager;
  let capabilityRegistry: CapabilityRegistry;

  beforeAll(async () => {
    const logger = new LoggerService();

    integrationManager = new IntegrationManager({ logger });
    capabilityRegistry = integrationManager.getCapabilityRegistry();

    // Initialize the integration manager to load plugins
    await integrationManager.initializePlugins();
  });

  const inventoryPlugins = ['ansible', 'bolt', 'puppetdb', 'ssh'];
  const requiredCapabilities = [
    'inventory.list',
    'inventory.get',
    'inventory.groups',
    'inventory.filter',
  ];

  describe.each(inventoryPlugins)('%s plugin', (pluginName) => {
    it.each(requiredCapabilities)('should expose %s capability', (capability) => {
      const providers = capabilityRegistry.getProvidersForCapability(capability);
      const hasCapability = providers.some(p => p.pluginName === pluginName);

      expect(hasCapability).toBe(true);
    });
  });

  it('should have all four plugins providing inventory.list', () => {
    const providers = capabilityRegistry.getProvidersForCapability('inventory.list');
    const providerNames = providers.map(p => p.pluginName);

    for (const pluginName of inventoryPlugins) {
      expect(providerNames).toContain(pluginName);
    }
  });

  it('should have consistent capability exposure across all inventory plugins', () => {
    for (const pluginName of inventoryPlugins) {
      for (const capability of requiredCapabilities) {
        const providers = capabilityRegistry.getProvidersForCapability(capability);
        const hasCapability = providers.some(p => p.pluginName === pluginName);

        expect(hasCapability).toBe(true);
      }
    }
  });
});
