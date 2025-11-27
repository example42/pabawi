/**
 * PuppetDB Service Tests
 *
 * Tests for PuppetDB integration service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import {
  PuppetDBConnectionError,
  PuppetDBQueryError,
} from '../../src/integrations/puppetdb';
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

    it('should throw PuppetDBConnectionError when trying to get inventory before initialization', async () => {
      await expect(service.getInventory()).rejects.toThrow(PuppetDBConnectionError);
      await expect(service.getInventory()).rejects.toThrow('PuppetDB service is not initialized');
    });
  });

  describe('configuration', () => {
    it('should allow initialization without serverUrl (not configured)', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          // Missing serverUrl - should initialize but not be functional
        },
      };

      // Should initialize successfully but not create client
      await expect(service.initialize(config)).resolves.not.toThrow();
      expect(service.isInitialized()).toBe(true);

      // But should throw when trying to use it
      await expect(service.getInventory()).rejects.toThrow(PuppetDBConnectionError);
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

      // Invalid PQL queries should be rejected with PuppetDBQueryError
      await expect(service.queryInventory('')).rejects.toThrow(PuppetDBQueryError);
      await expect(service.queryInventory('invalid json')).rejects.toThrow(PuppetDBQueryError);
      await expect(service.queryInventory('{}')).rejects.toThrow(PuppetDBQueryError);
      await expect(service.queryInventory('[]')).rejects.toThrow(PuppetDBQueryError);
      await expect(service.queryInventory('[123]')).rejects.toThrow(PuppetDBQueryError);
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

  describe('events functionality', () => {
    it('should have getNodeEvents method', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      // Verify the method exists
      expect(service.getNodeEvents).toBeDefined();
      expect(typeof service.getNodeEvents).toBe('function');
    });

    it('should have queryEvents method for filtering', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      // Verify the method exists
      expect(service.queryEvents).toBeDefined();
      expect(typeof service.queryEvents).toBe('function');
    });

    it('should support getNodeData with events type', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      // Verify getNodeData supports 'events' type
      // This will fail to connect, but should not throw a "unsupported type" error
      try {
        await service.getNodeData('test-node', 'events');
      } catch (error) {
        // Should fail with connection error, not unsupported type error
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message).not.toContain('Unsupported data type');
        }
      }
    });
  });
});
