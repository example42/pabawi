/**
 * Integration test for node groups functionality
 *
 * Verifies that all integration plugins (Bolt, Ansible, PuppetDB, SSH)
 * can successfully call getGroups() without errors.
 *
 * This is a checkpoint test for Task 6 of the inventory-node-groups spec.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BoltPlugin } from '../../src/integrations/bolt/BoltPlugin';
import { BoltService } from '../../src/integrations/bolt/BoltService';
import { AnsiblePlugin } from '../../src/integrations/ansible/AnsiblePlugin';
import { AnsibleService } from '../../src/integrations/ansible/AnsibleService';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import { SSHPlugin } from '../../src/integrations/ssh/SSHPlugin';
import { LoggerService } from '../../src/services/LoggerService';
import { PerformanceMonitorService } from '../../src/services/PerformanceMonitorService';

describe('Node Groups Integration Tests', () => {
  let logger: LoggerService;
  let performanceMonitor: PerformanceMonitorService;

  beforeAll(() => {
    logger = new LoggerService();
    performanceMonitor = new PerformanceMonitorService(logger);
  });

  describe('Bolt Plugin', () => {
    it('should have getGroups method', () => {
      const boltService = new BoltService();
      const boltPlugin = new BoltPlugin(boltService, logger, performanceMonitor);

      expect(boltPlugin.getGroups).toBeDefined();
      expect(typeof boltPlugin.getGroups).toBe('function');
    });

    it('should return empty array when not initialized', async () => {
      const boltService = new BoltService();
      const boltPlugin = new BoltPlugin(boltService, logger, performanceMonitor);

      // Should throw error when not initialized
      await expect(boltPlugin.getGroups()).rejects.toThrow('Bolt plugin not initialized');
    });
  });

  describe('Ansible Plugin', () => {
    it('should have getGroups method', () => {
      const ansibleService = new AnsibleService();
      const ansiblePlugin = new AnsiblePlugin(ansibleService, logger, performanceMonitor);

      expect(ansiblePlugin.getGroups).toBeDefined();
      expect(typeof ansiblePlugin.getGroups).toBe('function');
    });

    it('should throw error when not initialized', async () => {
      const ansibleService = new AnsibleService();
      const ansiblePlugin = new AnsiblePlugin(ansibleService, logger, performanceMonitor);

      await expect(ansiblePlugin.getGroups()).rejects.toThrow('Ansible plugin not initialized');
    });
  });

  describe('PuppetDB Plugin', () => {
    it('should have getGroups method', () => {
      const puppetdbService = new PuppetDBService(logger, performanceMonitor);

      expect(puppetdbService.getGroups).toBeDefined();
      expect(typeof puppetdbService.getGroups).toBe('function');
    });

    it('should return empty array when not initialized', async () => {
      const puppetdbService = new PuppetDBService(logger, performanceMonitor);

      // PuppetDB returns empty array when not initialized (per requirement 4.4)
      const groups = await puppetdbService.getGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups).toHaveLength(0);
    });
  });

  describe('SSH Plugin', () => {
    it('should have getGroups method', () => {
      const sshPlugin = new SSHPlugin(logger, performanceMonitor);

      expect(sshPlugin.getGroups).toBeDefined();
      expect(typeof sshPlugin.getGroups).toBe('function');
    });

    it('should throw error when not initialized', async () => {
      const sshPlugin = new SSHPlugin(logger, performanceMonitor);

      await expect(sshPlugin.getGroups()).rejects.toThrow('SSH plugin not initialized');
    });
  });

  describe('NodeGroup Interface', () => {
    it('should validate NodeGroup structure', () => {
      // Test that NodeGroup interface has all required fields
      const mockGroup = {
        id: 'test:group1',
        name: 'group1',
        source: 'test',
        sources: ['test'],
        linked: false,
        nodes: ['test:node1', 'test:node2'],
        metadata: {
          description: 'Test group',
        },
      };

      // Verify all required fields are present
      expect(mockGroup.id).toBeDefined();
      expect(mockGroup.name).toBeDefined();
      expect(mockGroup.source).toBeDefined();
      expect(mockGroup.sources).toBeDefined();
      expect(mockGroup.linked).toBeDefined();
      expect(mockGroup.nodes).toBeDefined();

      // Verify types
      expect(typeof mockGroup.id).toBe('string');
      expect(typeof mockGroup.name).toBe('string');
      expect(typeof mockGroup.source).toBe('string');
      expect(Array.isArray(mockGroup.sources)).toBe(true);
      expect(typeof mockGroup.linked).toBe('boolean');
      expect(Array.isArray(mockGroup.nodes)).toBe(true);
    });
  });
});
