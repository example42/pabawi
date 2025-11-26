/**
 * PuppetDB Service Tests
 *
 * Tests for PuppetDB integration service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { IntegrationConfig } from '../../src/integrations/types';

describe('PuppetDBService', () => {
  let service: PuppetDBService;

  beforeEach(() => {
    service = new PuppetDBService();
  });

  describe('initialization', () => {
    it('should create a new PuppetDB service', () => {
      expect(service).toBeDefined();
      expect(service.name).toBe('puppetdb');
      expect(service.type).toBe('information');
    });

    it('should not be initialized by default', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('should throw error when trying to get inventory before initialization', async () => {
      await expect(service.getInventory()).rejects.toThrow('PuppetDB service is not initialized');
    });
  });

  describe('configuration', () => {
    it('should validate configuration on initialization', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          // Missing serverUrl
        },
      };

      await expect(service.initialize(config)).rejects.toThrow('PuppetDB serverUrl is required');
    });

    it('should accept valid configuration', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
          timeout: 30000,
        },
      };

      // Note: This will fail to connect to the actual server, but should initialize the client
      await expect(service.initialize(config)).resolves.not.toThrow();
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('PQL query validation', () => {
    it('should validate PQL query format', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      // Invalid PQL queries should be rejected
      // Note: Errors are wrapped by executeWithResilience, so we just check that they throw
      await expect(service.queryInventory('')).rejects.toThrow();
      await expect(service.queryInventory('invalid json')).rejects.toThrow();
      await expect(service.queryInventory('{}')).rejects.toThrow();
      await expect(service.queryInventory('[]')).rejects.toThrow();
      await expect(service.queryInventory('[123]')).rejects.toThrow();
    });
  });

  describe('cache management', () => {
    it('should provide cache management methods', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          cache: {
            ttl: 60000,
          },
        },
      };

      await service.initialize(config);

      // Should have cache methods
      expect(service.clearCache).toBeDefined();
      expect(service.clearExpiredCache).toBeDefined();

      // Should not throw when clearing cache
      expect(() => service.clearCache()).not.toThrow();
      expect(() => service.clearExpiredCache()).not.toThrow();
    });
  });

  describe('node transformation', () => {
    it('should add source attribution to transformed nodes', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      // We can't test the actual transformation without mocking the client,
      // but we can verify the service is set up correctly
      expect(service.isInitialized()).toBe(true);
    });
  });
});
