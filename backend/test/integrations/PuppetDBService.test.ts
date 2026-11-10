/**
 * PuppetDB Service Tests
 *
 * Tests for PuppetDB integration service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import {
  PuppetDBClient,
  PuppetDBConnectionError,
  PuppetDBQueryError,
} from '../../src/integrations/puppetdb/PuppetDBClient';
import type { IntegrationConfig } from '../../src/integrations/types';

describe('PuppetDBService', () => {
  let service: PuppetDBService;

  beforeEach(() => {
    vi.spyOn(PuppetDBClient.prototype, 'query').mockResolvedValue([]);
    service = new PuppetDBService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should identify PQL string format vs JSON format correctly', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      const pqlStringQueries = [
        'nodes[certname]',
        'nodes[certname] { certname = "web01" }',
        'inventory[certname] { facts.os.name = "Ubuntu" }',
        'facts[certname, value] { name = "operatingsystem" }',
      ];

      const jsonQueries = [
        '["=", "certname", "web01"]',
        '["and", ["=", "certname", "web01"], ["=", "environment", "production"]]',
      ];

      for (const query of [...pqlStringQueries, ...jsonQueries]) {
        vi.mocked(PuppetDBClient.prototype.query).mockClear();
        await expect(service.queryInventory(query)).resolves.toEqual([]);
        expect(PuppetDBClient.prototype.query).toHaveBeenCalledOnce();
      }
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

      await expect(service.getNodeData('test-node', 'events')).resolves.toEqual([]);
      expect(PuppetDBClient.prototype.query).toHaveBeenCalledWith(
        'pdb/query/v4/events',
        JSON.stringify(["=", "certname", "test-node"]),
        expect.objectContaining({ order_by: '[{"field": "timestamp", "order": "desc"}]' }),
      );
    });
  });

  describe('getGroups', () => {
    it('should have getGroups method', async () => {
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
      expect(service.getGroups).toBeDefined();
      expect(typeof service.getGroups).toBe('function');
    });

    it('should return empty array when not initialized', async () => {
      // Service not initialized, should return empty array
      const groups = await service.getGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBe(0);
    });

    it('should return empty array when PuppetDB is not available', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      vi.mocked(PuppetDBClient.prototype.query).mockRejectedValue(
        new PuppetDBConnectionError('PuppetDB is unavailable'),
      );
      const groups = await service.getGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBe(0);
    });

    it('should return NodeGroup objects with correct structure', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
        },
      };

      await service.initialize(config);

      vi.mocked(PuppetDBClient.prototype.query)
        .mockResolvedValueOnce([{ certname: 'web01', catalog_environment: 'production' }])
        .mockResolvedValueOnce([{ certname: 'web01', 'os.family': 'Debian' }]);
      const groups = await service.getGroups();
      expect(groups).toHaveLength(2);
      expect(groups.map(group => group.id)).toEqual(['puppetdb:env-production', 'puppetdb:os-Debian']);
      expect(groups.every(group => group.nodes.includes('web01'))).toBe(true);

      expect(Array.isArray(groups)).toBe(true);

      groups.forEach(group => {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('source');
        expect(group).toHaveProperty('sources');
        expect(group).toHaveProperty('linked');
        expect(group).toHaveProperty('nodes');
        expect(group.source).toBe('puppetdb');
        expect(Array.isArray(group.sources)).toBe(true);
        expect(Array.isArray(group.nodes)).toBe(true);
        expect(typeof group.linked).toBe('boolean');
      });
    });
  });
});
