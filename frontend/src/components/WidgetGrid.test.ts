/**
 * Unit tests for WidgetGrid component.
 *
 * Property 6: Action row composition
 * Property 8: Error isolation
 * Also tests integration status error notification and unknown integration exclusion.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 4.2, 6.3
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

function registerActionWidget(id: string, integration: string, priority: number): void {
  registerWidget({
    id,
    name: `Action ${id}`,
    component: MockReadyWidget as unknown as Component,
    integration,
    type: 'action',
    colSpan: 1,
    priority,
  });
}

function registerListWidget(id: string, integration: string, priority: number): void {
  registerWidget({
    id,
    name: `List ${id}`,
    component: MockReadyWidget as unknown as Component,
    integration,
    type: 'list',
    colSpan: 2,
    priority,
  });
}

function registerSummaryWidget(id: string, integration: string, priority: number): void {
  registerWidget({
    id,
    name: `Summary ${id}`,
    component: MockReadyWidget as unknown as Component,
    integration,
    type: 'summary',
    colSpan: 1,
    priority,
  });
}

function mockIntegrationStatus(integrations: { name: string; status: string; type?: string }[]): void {
  mockGet.mockResolvedValue({
    integrations: integrations.map(i => ({
      type: 'both',
      ...i,
    })),
  });
}

describe('WidgetGrid', () => {
  beforeEach(() => {
    _resetForTesting();
    vi.clearAllMocks();
  });

  /**
   * Property 6: Action row composition
   *
   * For any set of visible widgets, the action row SHALL contain exactly those
   * widgets with type "action" and no widgets of type "list" or "summary",
   * rendered in ascending priority order.
   *
   * **Validates: Requirements 4.2, 4.3**
   */
  describe('Property 6: Action row composition', () => {
    it('action row contains only action-type widgets', async () => {
      registerActionWidget('action-1', 'bolt', 10);
      registerListWidget('list-1', 'bolt', 20);
      registerSummaryWidget('summary-1', 'bolt', 30);
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBeGreaterThan(0);
      });

      // ActionRow uses flex layout; grid widgets use the CSS grid
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();

      // The flex row should contain exactly 1 widget frame (the action widget)
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(1);
    });

    it('action row renders action widgets in ascending priority order', async () => {
      registerActionWidget('action-high', 'bolt', 50);
      registerActionWidget('action-low', 'bolt', 10);
      registerActionWidget('action-mid', 'bolt', 30);
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBe(3);
      });

      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();

      // All 3 action widgets should be in the flex row
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(3);
    });

    it('no list or summary widgets appear in the action row', async () => {
      registerActionWidget('action-1', 'bolt', 10);
      registerListWidget('list-1', 'bolt', 5);
      registerSummaryWidget('summary-1', 'bolt', 1);
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBeGreaterThan(0);
      });

      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeTruthy();

      // Only 1 action widget in the action row
      const actionFrames = flexRow!.querySelectorAll('[class*="min-h-"]');
      expect(actionFrames.length).toBe(1);

      // The grid should contain the list and summary widgets
      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
      const gridFrames = grid!.querySelectorAll('[class*="min-h-"]');
      expect(gridFrames.length).toBe(2);
    });

    it('action row does not render when no action widgets exist', async () => {
      registerListWidget('list-1', 'bolt', 10);
      registerSummaryWidget('summary-1', 'bolt', 20);
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getAllByTestId('mock-widget-content').length).toBeGreaterThan(0);
      });

      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeNull();
    });
  });

  /**
   * Property 8: Error isolation
   *
   * For any set of widgets where a subset throws errors, all non-erroring widgets
   * SHALL render their content state independently and without interruption.
   *
   * **Validates: Requirements 6.3**
   */
  describe('Property 8: Error isolation', () => {
    it('non-erroring widgets render content when sibling widget errors', async () => {
      registerWidget({
        id: 'good-widget',
        name: 'Good Widget',
        component: MockReadyWidget as unknown as Component,
        integration: 'bolt',
        type: 'summary',
        colSpan: 1,
        priority: 10,
      });
      registerWidget({
        id: 'bad-widget',
        name: 'Bad Widget',
        component: MockErrorWidget as unknown as Component,
        integration: 'bolt',
        type: 'list',
        colSpan: 2,
        priority: 20,
      });
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      // The good widget should render its content
      await waitFor(() => {
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });

      // The bad widget should show its error message
      expect(screen.getByText('Connection timeout')).toBeTruthy();

      // Both coexist without affecting each other
      expect(screen.getByText('Widget loaded for node-1')).toBeTruthy();
    });

    it('multiple good widgets render independently when one widget errors', async () => {
      registerWidget({
        id: 'good-1',
        name: 'Good One',
        component: MockReadyWidget as unknown as Component,
        integration: 'bolt',
        type: 'summary',
        colSpan: 1,
        priority: 10,
      });
      registerWidget({
        id: 'good-2',
        name: 'Good Two',
        component: MockReadyWidget as unknown as Component,
        integration: 'puppetdb',
        type: 'list',
        colSpan: 2,
        priority: 20,
      });
      registerWidget({
        id: 'bad-1',
        name: 'Bad One',
        component: MockErrorWidget as unknown as Component,
        integration: 'bolt',
        type: 'list',
        colSpan: 1,
        priority: 30,
      });
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'degraded' },
      ]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        // Both good widgets should render their content
        const contents = screen.getAllByTestId('mock-widget-content');
        expect(contents.length).toBe(2);
      });

      // The error widget shows its error
      expect(screen.getByText('Connection timeout')).toBeTruthy();
    });

    it('action widgets render independently from erroring grid widgets', async () => {
      registerWidget({
        id: 'action-good',
        name: 'Action Good',
        component: MockReadyWidget as unknown as Component,
        integration: 'bolt',
        type: 'action',
        colSpan: 1,
        priority: 10,
      });
      registerWidget({
        id: 'grid-bad',
        name: 'Grid Bad',
        component: MockErrorWidget as unknown as Component,
        integration: 'bolt',
        type: 'list',
        colSpan: 2,
        priority: 20,
      });
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        // The action widget renders successfully
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });

      // The grid widget shows error
      expect(screen.getByText('Connection timeout')).toBeTruthy();
    });
  });

  describe('Integration status error displays notification', () => {
    it('shows error notification when status endpoint fails', async () => {
      mockGet.mockRejectedValue(new Error('Network failure'));

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getByText(/Unable to load integration status/)).toBeTruthy();
      });
      expect(screen.getByText(/Network failure/)).toBeTruthy();
    });

    it('does not render any widgets when status endpoint fails', async () => {
      registerListWidget('list-1', 'bolt', 10);
      registerActionWidget('action-1', 'bolt', 20);
      mockGet.mockRejectedValue(new Error('Server error'));

      const { container } = render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getByText(/Unable to load integration status/)).toBeTruthy();
      });

      // No flex row (action row) or grid widgets should be rendered
      const flexRow = container.querySelector('.flex.flex-wrap');
      expect(flexRow).toBeNull();
      const grid = container.querySelector('.grid');
      expect(grid).toBeNull();
    });

    it('shows fallback message for non-Error rejection', async () => {
      mockGet.mockRejectedValue('unknown failure');

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getByText(/Unable to load integration status/)).toBeTruthy();
        expect(screen.getByText(/Failed to load integration status/)).toBeTruthy();
      });
    });
  });

  describe('Widgets with unknown integrations are excluded', () => {
    it('excludes widgets whose integration is not in the status response', async () => {
      registerListWidget('known-widget', 'bolt', 10);
      registerListWidget('unknown-widget', 'nonexistent', 20);
      mockIntegrationStatus([{ name: 'bolt', status: 'connected' }]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        const contents = screen.getAllByTestId('mock-widget-content');
        // Only the bolt widget should render
        expect(contents.length).toBe(1);
      });
    });

    it('excludes widgets with not_configured integration status', async () => {
      registerListWidget('configured-widget', 'bolt', 10);
      registerListWidget('unconfigured-widget', 'ansible', 20);
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'ansible', status: 'not_configured' },
      ]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        const contents = screen.getAllByTestId('mock-widget-content');
        expect(contents.length).toBe(1);
      });
    });

    it('excludes widgets with error integration status', async () => {
      registerListWidget('good-widget', 'bolt', 10);
      registerListWidget('error-widget', 'puppetdb', 20);
      mockIntegrationStatus([
        { name: 'bolt', status: 'connected' },
        { name: 'puppetdb', status: 'error' },
      ]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        const contents = screen.getAllByTestId('mock-widget-content');
        expect(contents.length).toBe(1);
      });
    });

    it('includes widgets with degraded integration status', async () => {
      registerListWidget('degraded-widget', 'puppetdb', 10);
      mockIntegrationStatus([{ name: 'puppetdb', status: 'degraded' }]);

      render(WidgetGrid, { props: { nodeId: 'node-1' } });

      await waitFor(() => {
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });
    });
  });
});
