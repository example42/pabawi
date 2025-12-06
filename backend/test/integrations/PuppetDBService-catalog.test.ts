/**
 * PuppetDB Service Catalog Tests
 *
 * Tests for catalog retrieval and parsing from PuppetDB
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { IntegrationConfig } from '../../src/integrations/types';
import type { Catalog } from '../../src/integrations/puppetdb/types';

describe('PuppetDBService - Catalog Operations', () => {
  let service: PuppetDBService;

  beforeEach(() => {
    service = new PuppetDBService();
  });

  describe('getNodeCatalog', () => {
    it('should handle catalog with resources correctly', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock the client query method to return a sample catalog
      const mockCatalog = {
        certname: 'test-node.example.com',
        version: '1642248000',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        environment: 'production',
        producer_timestamp: '2024-01-15T10:00:00.000Z',
        hash: 'catalog123hash456',
        resources: [
          {
            type: 'File',
            title: '/etc/nginx/nginx.conf',
            tags: ['file', 'nginx', 'class', 'nginx::config'],
            exported: false,
            file: '/etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp',
            line: 42,
            parameters: {
              ensure: 'file',
              owner: 'root',
              group: 'root',
              mode: '0644',
              content: '# Nginx configuration...',
            },
          },
          {
            type: 'Service',
            title: 'nginx',
            tags: ['service', 'nginx', 'class', 'nginx::service'],
            exported: false,
            parameters: {
              ensure: 'running',
              enable: true,
            },
          },
          {
            type: 'Package',
            title: 'nginx',
            tags: ['package', 'nginx'],
            exported: false,
            parameters: {
              ensure: 'installed',
            },
          },
        ],
        edges: [
          {
            source: {
              type: 'Package',
              title: 'nginx',
            },
            target: {
              type: 'File',
              title: '/etc/nginx/nginx.conf',
            },
            relationship: 'before',
          },
          {
            source: {
              type: 'File',
              title: '/etc/nginx/nginx.conf',
            },
            target: {
              type: 'Service',
              title: 'nginx',
            },
            relationship: 'notify',
          },
        ],
      };

      // Mock the executeWithResilience method
      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([mockCatalog]);

      const result = await service.getNodeCatalog('test-node.example.com');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        // Verify catalog metadata
        expect(result.certname).toBe('test-node.example.com');
        expect(result.version).toBe('1642248000');
        expect(result.environment).toBe('production');
        expect(result.hash).toBe('catalog123hash456');

        // Verify resources were parsed correctly
        expect(result.resources).toBeDefined();
        expect(Array.isArray(result.resources)).toBe(true);
        expect(result.resources.length).toBe(3);

        // Verify first resource (File)
        const fileResource = result.resources[0];
        expect(fileResource.type).toBe('File');
        expect(fileResource.title).toBe('/etc/nginx/nginx.conf');
        expect(fileResource.tags).toEqual(['file', 'nginx', 'class', 'nginx::config']);
        expect(fileResource.exported).toBe(false);
        expect(fileResource.file).toBe('/etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp');
        expect(fileResource.line).toBe(42);
        expect(fileResource.parameters).toBeDefined();
        expect(fileResource.parameters.ensure).toBe('file');
        expect(fileResource.parameters.owner).toBe('root');

        // Verify second resource (Service)
        const serviceResource = result.resources[1];
        expect(serviceResource.type).toBe('Service');
        expect(serviceResource.title).toBe('nginx');
        expect(serviceResource.parameters.ensure).toBe('running');
        expect(serviceResource.parameters.enable).toBe(true);

        // Verify third resource (Package)
        const packageResource = result.resources[2];
        expect(packageResource.type).toBe('Package');
        expect(packageResource.title).toBe('nginx');
        expect(packageResource.parameters.ensure).toBe('installed');

        // Verify edges were parsed correctly
        expect(result.edges).toBeDefined();
        expect(Array.isArray(result.edges)).toBe(true);
        expect(result.edges.length).toBe(2);

        // Verify first edge
        const firstEdge = result.edges[0];
        expect(firstEdge.source.type).toBe('Package');
        expect(firstEdge.source.title).toBe('nginx');
        expect(firstEdge.target.type).toBe('File');
        expect(firstEdge.target.title).toBe('/etc/nginx/nginx.conf');
        expect(firstEdge.relationship).toBe('before');

        // Verify second edge
        const secondEdge = result.edges[1];
        expect(secondEdge.source.type).toBe('File');
        expect(secondEdge.target.type).toBe('Service');
        expect(secondEdge.relationship).toBe('notify');
      }
    });

    it('should handle empty catalog gracefully', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock catalog with no resources
      const mockCatalog = {
        certname: 'test-node.example.com',
        version: '1642248000',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        environment: 'production',
        producer_timestamp: '2024-01-15T10:00:00.000Z',
        hash: 'catalog123hash456',
        resources: [],
        edges: [],
      };

      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([mockCatalog]);

      const result = await service.getNodeCatalog('test-node.example.com');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        expect(result.resources).toBeDefined();
        expect(result.resources.length).toBe(0);
        expect(result.edges.length).toBe(0);
      }
    });

    it('should return null when catalog not found', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock empty result
      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([]);

      const result = await service.getNodeCatalog('nonexistent-node.example.com');

      expect(result).toBeNull();
    });

    it('should handle resources without optional fields', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock catalog with minimal resource data
      const mockCatalog = {
        certname: 'test-node.example.com',
        version: '1642248000',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        environment: 'production',
        producer_timestamp: '2024-01-15T10:00:00.000Z',
        hash: 'catalog123hash456',
        resources: [
          {
            type: 'User',
            title: 'testuser',
            tags: [],
            exported: false,
            // No file or line
            parameters: {
              ensure: 'present',
            },
          },
        ],
        edges: [],
      };

      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([mockCatalog]);

      const result = await service.getNodeCatalog('test-node.example.com');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      if (result) {
        expect(result.resources.length).toBe(1);
        const resource = result.resources[0];
        expect(resource.type).toBe('User');
        expect(resource.title).toBe('testuser');
        expect(resource.file).toBeUndefined();
        expect(resource.line).toBeUndefined();
        expect(resource.parameters.ensure).toBe('present');
      }
    });
  });

  describe('getCatalogResources', () => {
    it('should organize resources by type', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock catalog with multiple resource types
      const mockCatalog = {
        certname: 'test-node.example.com',
        version: '1642248000',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        environment: 'production',
        producer_timestamp: '2024-01-15T10:00:00.000Z',
        hash: 'catalog123hash456',
        resources: [
          {
            type: 'File',
            title: '/etc/nginx/nginx.conf',
            tags: [],
            exported: false,
            parameters: {},
          },
          {
            type: 'File',
            title: '/etc/nginx/sites-enabled/default',
            tags: [],
            exported: false,
            parameters: {},
          },
          {
            type: 'Service',
            title: 'nginx',
            tags: [],
            exported: false,
            parameters: {},
          },
          {
            type: 'Package',
            title: 'nginx',
            tags: [],
            exported: false,
            parameters: {},
          },
        ],
        edges: [],
      };

      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([mockCatalog]);

      const result = await service.getCatalogResources('test-node.example.com');

      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(3);
      expect(result['File']).toBeDefined();
      expect(result['File'].length).toBe(2);
      expect(result['Service']).toBeDefined();
      expect(result['Service'].length).toBe(1);
      expect(result['Package']).toBeDefined();
      expect(result['Package'].length).toBe(1);
    });

    it('should filter resources by type', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: 'puppetdb',
        type: 'information',
        config: {
          serverUrl: 'https://puppetdb.example.com',
          port: 8081,
        },
      };

      await service.initialize(config);

      // Mock catalog with multiple resource types
      const mockCatalog = {
        certname: 'test-node.example.com',
        version: '1642248000',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        environment: 'production',
        producer_timestamp: '2024-01-15T10:00:00.000Z',
        hash: 'catalog123hash456',
        resources: [
          {
            type: 'File',
            title: '/etc/nginx/nginx.conf',
            tags: [],
            exported: false,
            parameters: {},
          },
          {
            type: 'Service',
            title: 'nginx',
            tags: [],
            exported: false,
            parameters: {},
          },
        ],
        edges: [],
      };

      const executeSpy = vi.spyOn(service as any, 'executeWithResilience');
      executeSpy.mockResolvedValue([mockCatalog]);

      const result = await service.getCatalogResources('test-node.example.com', 'File');

      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(1);
      expect(result['File']).toBeDefined();
      expect(result['File'].length).toBe(1);
      expect(result['Service']).toBeUndefined();
    });
  });
});
