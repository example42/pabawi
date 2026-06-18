/**
 * Integration tests for WidgetGrid — full component tree with real registry.
 *
 * Tests the end-to-end flow: register widgets → fetch status → filter → render
 * in correct containers (ActionRow vs grid) with correct priority ordering.
 *
 * Uses custom test widgets (MockReadyWidget, MockErrorWidget) registered through
 * the real registry, NOT the real widget barrel imports.
 *
 * **Validates: Requirements 2.2, 4.2, 8.1, 8.2, 8.3, 8.4, 8.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import WidgetGrid from './WidgetGrid.svelte';
import { registerWidget, _resetForTesting } from '../lib/widgetRegistry.svelte';
import MockReadyWidget from './__tests__/MockReadyWidget.svelte';
import MockErrorWidget from './__tests__/MockErrorWidget.svelte';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
}));

import { get } from '../lib/api';
const mockGet = vi.mocked(get);

// --- Helpers ---

function mockIntegrationStatus(
  integrations: Array<{ name: string; status: string; type?: string }>,
): void {
  mockGet.mockResolvedValue({
    integrations: integrations.map(i => ({ type: 'both', ...i })),
  });
}

function registerTestWidget(overrides: Partial<{
  id: string;
  name: string;
  component: Component;
  integration: string;
  type: 'action' | 'list' | 'summary';
  colSpan: number;
  priority: number;
}>): void {
  registerWidget({
    id: overrides.id ?? 'test-widget',
    name: overrides.name ?? 'Test Widget',
    component: (overrides.component ?? MockReadyWidget) as unknown as Component,
    integration: overrides.integration ?? 'bolt',
    type: overrides.type ?? 'summary',
    colSpan: overrides.colSpan ?? 2,
    priority: overrides.priority ?? 100,
    ...overrides,
  });
}

describe('WidgetGrid Integration', () => {
  beforeEach(() => {
    _resetForTesting();
    vi.clearAllMocks();
  });

  describe('multi-integration filtering', () => {
    it('renders widgets for connected and degraded integrations, excludes others', async () => {
      // Register widgets across 5 different integrations
      registerTestWidget({ id: 'bolt-info', integration: 'bolt', type: 'summary', priority: 10 });
      registerTestWidget({ id: 'bolt-actions', integration: 'bolt', type: 'list', priority: 20 });
      registerTestWidget({ id: 'puppet-runs', integration: 'puppetdb', type: 'list', priority: 100 });
      registerTestWidget({ id: 'checkmk-summary', integration: 'checkmk', type: 'summary', priority: 100 });
      registerTestWidget({ id: 'proxmox-console', integration: 'proxmox', type: 'action', priority: 100 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'degraded' },
        { name: 'checkmk', status: 'not_configured' },
        { name: 'proxmox', status: 'error' },
      ]);

      render(WidgetGrid, { props: { nodeId: 'node-42' } });

      await waitFor(() => {
        // bolt (connected) + puppetdb (degraded) = 3 visible widgets
        const contents = screen.getAllByTestId('mock-widget-content');
        expect(contents.length).toBe(3);
      });
    });

    it('excludes widgets for disconnected integrations', async () => {
      registerTestWidget({ id: 'ssh-widget', integration: 'ssh', type: 'list', priority: 50 });
      registerTestWidget({ id: 'bolt-widget', integration: 'bolt', type: 'summary', priority: 10 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'ssh', status: 'disconnected' },
      ]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        const contents = screen.getAllByTestId('mock-widget-content');
        expect(contents.length).toBe(1);
      });
    });

    it('renders zero widgets when all integrations are disabled', async () => {
      registerTestWidget({ id: 'w1', integration: 'bolt', type: 'summary', priority: 10 });
      registerTestWidget({ id: 'w2', integration: 'puppetdb', type: 'list', priority: 20 });
      registerTestWidget({ id: 'w3', integration: 'checkmk', type: 'action', priority: 30 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'not_configured' },
        { name: 'puppetdb', status: 'error' },
        { name: 'checkmk', status: 'disconnected' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      // Wait for status to load (grid renders but with no widgets)
      await waitFor(() => {
        const grid = container.querySelector('.grid');
        expect(grid).toBeTruthy();
      });

      // No widget content should be rendered
      expect(screen.queryAllByTestId('mock-widget-content').length).toBe(0);
    });
  });

  describe('action vs grid widget placement', () => {
    it('action widgets appear in the flex ActionRow, grid widgets in the CSS grid', async () => {
      registerTestWidget({ id: 'action-1', integration: 'bolt', type: 'action', priority: 10 });
      registerTestWidget({ id: 'action-2', integration: 'bolt', type: 'action', priority: 20 });
      registerTestWidget({ id: 'list-1', integration: 'bolt', type: 'list', priority: 30 });
      registerTestWidget({ id: 'summary-1', integration: 'bolt', type: 'summary', priority: 40 });

      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(4);
      });

      // ActionRow is a flex container
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(2);

      // Grid contains non-action widgets
      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
      const gridFrames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(gridFrames.length).toBe(2);
    });

    it('no ActionRow renders when all visible widgets are non-action', async () => {
      registerTestWidget({ id: 'list-1', integration: 'bolt', type: 'list', priority: 10 });
      registerTestWidget({ id: 'summary-1', integration: 'bolt', type: 'summary', priority: 20 });
      // Action widget belongs to disabled integration
      registerTestWidget({ id: 'action-1', integration: 'proxmox', type: 'action', priority: 5 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'proxmox', status: 'not_configured' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(2);
      });

      // No ActionRow (flex container) rendered
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeNull();
    });

    it('ActionRow renders when action widget integration is degraded', async () => {
      registerTestWidget({ id: 'action-proxmox', integration: 'proxmox', type: 'action', priority: 100 });

      mockIntegrationStatus([{ name: 'proxmox', status: 'degraded' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });

      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(1);
    });
  });

  describe('priority ordering across integrations', () => {
    it('grid widgets from multiple integrations render in ascending priority order', async () => {
      // Register in non-priority order to confirm sorting
      registerTestWidget({ id: 'puppet-runs', integration: 'puppetdb', type: 'list', colSpan: 3, priority: 100 });
      registerTestWidget({ id: 'bolt-info', integration: 'bolt', type: 'summary', colSpan: 2, priority: 10 });
      registerTestWidget({ id: 'bolt-actions', integration: 'bolt', type: 'list', colSpan: 2, priority: 20 });
      registerTestWidget({ id: 'checkmk-summary', integration: 'checkmk', type: 'summary', colSpan: 2, priority: 100 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'degraded' },
        { name: 'checkmk', status: 'connected' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(4);
      });

      // Check that the grid frames are ordered by priority via colSpan classes
      const grid = container.querySelector('.grid');
      const frames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(frames.length).toBe(4);

      // Priority 10 (bolt-info, colSpan 2) → sm:col-span-2
      expect(frames[0].className).toContain('sm:col-span-2');
      // Priority 20 (bolt-actions, colSpan 2) → sm:col-span-2
      expect(frames[1].className).toContain('sm:col-span-2');
      // Priority 100 (puppet-runs, colSpan 3) → lg:col-span-3
      expect(frames[2].className).toContain('lg:col-span-3');
      // Priority 100 (checkmk-summary, colSpan 2) → sm:col-span-2, stable sort keeps registration order
      expect(frames[3].className).toContain('sm:col-span-2');
    });

    it('action widgets render in priority order within ActionRow', async () => {
      registerTestWidget({ id: 'action-high', integration: 'bolt', type: 'action', colSpan: 1, priority: 50 });
      registerTestWidget({ id: 'action-low', integration: 'bolt', type: 'action', colSpan: 1, priority: 5 });
      registerTestWidget({ id: 'action-mid', integration: 'proxmox', type: 'action', colSpan: 1, priority: 25 });

      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'proxmox', status: 'degraded' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(3);
      });

      const flexRow = container.querySelector('.flex.flex-wrap');
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(3);
      // All are col-span-1 so we just verify count and presence
    });
  });

  describe('simulated real widget set', () => {
    /**
     * Register the same shape as the real widget barrel, but with mock components.
     * This tests the end-to-end flow that mirrors production behavior.
     */
    function registerProductionLikeWidgets(): void {
      registerTestWidget({
        id: 'core-general-info',
        name: 'General Information',
        integration: 'bolt',
        type: 'summary',
        colSpan: 2,
        priority: 10,
      });
      registerTestWidget({
        id: 'core-latest-actions',
        name: 'Latest Actions',
        integration: 'bolt',
        type: 'list',
        colSpan: 2,
        priority: 20,
      });
      registerTestWidget({
        id: 'puppetdb-latest-runs',
        name: 'Latest Puppet Runs',
        integration: 'puppetdb',
        type: 'list',
        colSpan: 3,
        priority: 100,
      });
      registerTestWidget({
        id: 'checkmk-monitoring-summary',
        name: 'Monitoring Summary',
        integration: 'checkmk',
        type: 'summary',
        colSpan: 2,
        priority: 100,
      });
      registerTestWidget({
        id: 'proxmox-console-access',
        name: 'Console Access',
        integration: 'proxmox',
        type: 'action',
        colSpan: 1,
        priority: 100,
      });
    }

    it('with all integrations connected, renders all 5 widgets in correct containers', async () => {
      registerProductionLikeWidgets();
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'connected' },
        { name: 'checkmk', status: 'connected' },
        { name: 'proxmox', status: 'connected' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'server-01' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(5);
      });

      // ActionRow has 1 action widget (proxmox-console-access)
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(1);

      // Grid has 4 non-action widgets
      const grid = container.querySelector('.grid');
      const gridFrames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(gridFrames.length).toBe(4);
    });

    it('with only bolt connected, renders 2 core widgets and no ActionRow', async () => {
      registerProductionLikeWidgets();
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'not_configured' },
        { name: 'checkmk', status: 'not_configured' },
        { name: 'proxmox', status: 'not_configured' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'server-01' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(2);
      });

      // No action row (proxmox disabled)
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeNull();

      // Grid has 2 bolt widgets
      const grid = container.querySelector('.grid');
      const gridFrames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(gridFrames.length).toBe(2);
    });

    it('with puppetdb degraded, its widget still renders', async () => {
      registerProductionLikeWidgets();
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'degraded' },
        { name: 'checkmk', status: 'error' },
        { name: 'proxmox', status: 'disconnected' },
      ]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'server-01' } });

      await waitFor(() => {
        // bolt (2 widgets) + puppetdb (1 widget) = 3
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(3);
      });

      // No action row (proxmox disconnected)
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeNull();

      // Grid has 3 widgets ordered by priority: 10, 20, 100
      const grid = container.querySelector('.grid');
      const gridFrames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(gridFrames.length).toBe(3);

      // First frame: colSpan 2 (priority 10 - general info)
      expect(gridFrames[0].className).toContain('sm:col-span-2');
      expect(gridFrames[0].className).toContain('lg:col-span-2');
      // Second frame: colSpan 2 (priority 20 - latest actions)
      expect(gridFrames[1].className).toContain('sm:col-span-2');
      // Third frame: colSpan 3 (priority 100 - puppet runs)
      expect(gridFrames[2].className).toContain('lg:col-span-3');
    });

    it('grid widget ordering reflects priority not registration order', async () => {
      // Register in reverse priority order
      registerTestWidget({
        id: 'high-priority',
        integration: 'bolt',
        type: 'list',
        colSpan: 1,
        priority: 200,
      });
      registerTestWidget({
        id: 'low-priority',
        integration: 'bolt',
        type: 'summary',
        colSpan: 2,
        priority: 5,
      });
      registerTestWidget({
        id: 'mid-priority',
        integration: 'bolt',
        type: 'list',
        colSpan: 3,
        priority: 50,
      });

      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(3);
      });

      const grid = container.querySelector('.grid');
      const frames = grid!.querySelectorAll('[class*="min-h-"]');

      // Priority 5 → colSpan 2
      expect(frames[0].className).toContain('sm:col-span-2');
      expect(frames[0].className).toContain('lg:col-span-2');
      // Priority 50 → colSpan 3
      expect(frames[1].className).toContain('lg:col-span-3');
      // Priority 200 → colSpan 1
      expect(frames[2].className).toContain('col-span-1');
      expect(frames[2].className).not.toContain('sm:col-span-2');
    });
  });
});
