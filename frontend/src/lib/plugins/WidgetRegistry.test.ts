/**
 * Unit tests for WidgetRegistry permission-based filtering
 *
 * Tests Requirements 4.5 and 7.4:
 * - Widgets should be filtered based on user permissions
 * - Users should only see widgets they have permission to access
 * - Permission matching should support wildcards
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WidgetRegistry } from './WidgetRegistry.svelte';
import type { LoadedWidget } from './types';

describe('WidgetRegistry - Permission-Based Filtering', () => {
  let registry: WidgetRegistry;

  beforeEach(() => {
    registry = new WidgetRegistry();
  });

  describe('Basic Permission Filtering', () => {
    it('should show widget when user has exact required capability', () => {
      // Register a widget that requires 'inventory.list'
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has the exact capability
      const userCapabilities = ['inventory.list'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });

    it('should hide widget when user lacks required capability', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['command.execute'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User does not have the required capability
      const userCapabilities = ['inventory.list'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(0);
    });

    it('should show widget when user has all required capabilities', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list', 'inventory.get'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has both required capabilities
      const userCapabilities = ['inventory.list', 'inventory.get', 'command.execute'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });

    it('should hide widget when user is missing one required capability', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list', 'inventory.get'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has only one of the two required capabilities
      const userCapabilities = ['inventory.list'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(0);
    });
  });

  describe('Wildcard Permission Matching', () => {
    it('should show widget when user has wildcard permission (*)', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['command.execute'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has wildcard permission
      const userCapabilities = ['*'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });

    it('should show widget when user has category wildcard (inventory.*)', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has category wildcard
      const userCapabilities = ['inventory.*'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });

    it('should hide widget when wildcard does not match category', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['command.execute'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has inventory wildcard, but widget requires command capability
      const userCapabilities = ['inventory.*'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(0);
    });

    it('should match multiple capabilities with wildcards', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list', 'command.execute'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has wildcards that cover both required capabilities
      const userCapabilities = ['inventory.*', 'command.*'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });
  });

  describe('Widgets Without Required Capabilities', () => {
    it('should show widget with no required capabilities to all users', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: [],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User with no capabilities
      const userCapabilities: string[] = [];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });

    it('should show widget with no required capabilities even when userCapabilities is undefined', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: [],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // No user capabilities provided
      const widgets = registry.getWidgetsForSlot('dashboard', undefined);

      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget');
    });
  });

  describe('Multiple Widgets with Different Permissions', () => {
    it('should filter multiple widgets based on user permissions', () => {
      // Register three widgets with different requirements
      const widget1: LoadedWidget = {
        id: 'test:widget1',
        name: 'Widget 1',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      const widget2: LoadedWidget = {
        id: 'test:widget2',
        name: 'Widget 2',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['command.execute'],
        priority: 0,
        componentRef: null,
      };

      const widget3: LoadedWidget = {
        id: 'test:widget3',
        name: 'Widget 3',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['task.execute'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget1);
      registry.registerWidget(widget2);
      registry.registerWidget(widget3);

      // User has only inventory and command capabilities
      const userCapabilities = ['inventory.list', 'command.execute'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      expect(widgets).toHaveLength(2);
      expect(widgets.map(w => w.id)).toContain('test:widget1');
      expect(widgets.map(w => w.id)).toContain('test:widget2');
      expect(widgets.map(w => w.id)).not.toContain('test:widget3');
    });

    it('should handle gracefully when user has no permissions', () => {
      const widget1: LoadedWidget = {
        id: 'test:widget1',
        name: 'Widget 1',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      const widget2: LoadedWidget = {
        id: 'test:widget2',
        name: 'Widget 2',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: [],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget1);
      registry.registerWidget(widget2);

      // User has no capabilities
      const userCapabilities: string[] = [];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      // Should only show widget2 (no required capabilities)
      expect(widgets).toHaveLength(1);
      expect(widgets[0].id).toBe('test:widget2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty slot gracefully', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // Query a different slot
      const userCapabilities = ['inventory.list'];
      const widgets = registry.getWidgetsForSlot('home-summary', userCapabilities);

      expect(widgets).toHaveLength(0);
    });

    it('should handle case-sensitive capability matching', () => {
      const widget: LoadedWidget = {
        id: 'test:widget',
        name: 'Test Widget',
        pluginName: 'test',
        slots: ['dashboard'],
        size: 'medium',
        requiredCapabilities: ['inventory.list'],
        priority: 0,
        componentRef: null,
      };

      registry.registerWidget(widget);

      // User has capability with different case
      const userCapabilities = ['Inventory.List'];
      const widgets = registry.getWidgetsForSlot('dashboard', userCapabilities);

      // Should not match (case-sensitive)
      expect(widgets).toHaveLength(0);
    });
  });
});
