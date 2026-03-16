import { describe, it, expect } from 'vitest';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_LABELS,
  ACTION_LABELS,
  getResourceCategory,
  type PermissionResource,
  type PermissionAction,
} from './permissions';

describe('permissions', () => {
  describe('RESOURCE_CATEGORIES', () => {
    it('should define infrastructure category with proxmox and aws', () => {
      expect(RESOURCE_CATEGORIES.infrastructure.label).toBe('Infrastructure');
      expect(RESOURCE_CATEGORIES.infrastructure.resources).toContain('proxmox');
      expect(RESOURCE_CATEGORIES.infrastructure.resources).toContain('aws');
    });

    it('should define operations category with journal', () => {
      expect(RESOURCE_CATEGORIES.operations.label).toBe('Operations');
      expect(RESOURCE_CATEGORIES.operations.resources).toContain('journal');
    });

    it('should define configuration category with integration_config', () => {
      expect(RESOURCE_CATEGORIES.configuration.label).toBe('Configuration');
      expect(RESOURCE_CATEGORIES.configuration.resources).toContain('integration_config');
    });

    it('should define system category with existing resources', () => {
      expect(RESOURCE_CATEGORIES.system.label).toBe('System');
      expect(RESOURCE_CATEGORIES.system.resources).toEqual(
        expect.arrayContaining(['users', 'groups', 'roles', 'ansible', 'bolt', 'puppetdb'])
      );
    });
  });

  describe('RESOURCE_LABELS', () => {
    it('should have labels for all new permission resources', () => {
      const expectedResources: PermissionResource[] = [
        'proxmox', 'aws', 'journal', 'integration_config',
        'ansible', 'bolt', 'puppetdb', 'users', 'groups', 'roles',
      ];
      for (const resource of expectedResources) {
        expect(RESOURCE_LABELS[resource]).toBeDefined();
        expect(typeof RESOURCE_LABELS[resource]).toBe('string');
      }
    });
  });

  describe('ACTION_LABELS', () => {
    it('should have labels for all permission actions including new ones', () => {
      const expectedActions: PermissionAction[] = [
        'read', 'write', 'execute', 'admin',
        'provision', 'destroy', 'lifecycle', 'configure', 'note', 'export',
      ];
      for (const action of expectedActions) {
        expect(ACTION_LABELS[action]).toBeDefined();
        expect(typeof ACTION_LABELS[action]).toBe('string');
      }
    });
  });

  describe('getResourceCategory', () => {
    it('should return infrastructure for proxmox and aws', () => {
      expect(getResourceCategory('proxmox')).toBe('infrastructure');
      expect(getResourceCategory('aws')).toBe('infrastructure');
    });

    it('should return operations for journal', () => {
      expect(getResourceCategory('journal')).toBe('operations');
    });

    it('should return configuration for integration_config', () => {
      expect(getResourceCategory('integration_config')).toBe('configuration');
    });

    it('should return system for existing resources', () => {
      expect(getResourceCategory('users')).toBe('system');
      expect(getResourceCategory('roles')).toBe('system');
      expect(getResourceCategory('ansible')).toBe('system');
    });

    it('should return null for unknown resources', () => {
      expect(getResourceCategory('unknown')).toBeNull();
    });
  });
});
