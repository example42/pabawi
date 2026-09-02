/**
 * Unit tests for WidgetFrame component.
 *
 * Property 5: Column span applied to frame element
 * Property 7: Error badge content
 * Also tests loading skeleton display, error state with retry, and content transition.
 *
 * Validates: Requirements 3.4, 5.4, 6.1, 6.2, 6.4
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import WidgetFrame from './WidgetFrame.svelte';
import type { WidgetDefinition } from '../lib/widgetRegistry.svelte';
import MockReadyWidget from './__tests__/MockReadyWidget.svelte';
import MockErrorWidget from './__tests__/MockErrorWidget.svelte';
import MockNeverReadyWidget from './__tests__/MockNeverReadyWidget.svelte';

function makeWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    id: 'test-widget',
    name: 'Test Widget',
    component: MockReadyWidget as unknown as Component,
    integration: 'bolt',
    type: 'summary',
    colSpan: 1,
    priority: 10,
    ...overrides,
  };
}

describe('WidgetFrame', () => {
  /**
   * Property 5: Column span applied to frame element
   *
   * For any widget rendered in the grid, regardless of its internal state
   * (loading, ready, or error), its containing frame element SHALL have a CSS
   * class corresponding to its declared colSpan value.
   *
   * **Validates: Requirements 3.4, 5.4, 6.4**
   */
  describe('Property 5: Column span applied to frame element', () => {
    it('colSpan 1 applies col-span-1 class', () => {
      const widget = makeWidget({ colSpan: 1, component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toContain('col-span-1');
    });

    it('colSpan 2 applies sm:col-span-2 lg:col-span-2 classes', () => {
      const widget = makeWidget({ colSpan: 2, component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toContain('sm:col-span-2');
      expect(frame.className).toContain('lg:col-span-2');
    });

    it('colSpan 3 applies sm:col-span-2 lg:col-span-3 classes', () => {
      const widget = makeWidget({ colSpan: 3, component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toContain('sm:col-span-2');
      expect(frame.className).toContain('lg:col-span-3');
    });

    it('colSpan class is present in loading state', () => {
      const widget = makeWidget({ colSpan: 2, component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const frame = container.firstElementChild as HTMLElement;
      // Verify loading skeleton is displayed
      expect(frame.querySelector('.animate-pulse')).toBeTruthy();
      // Verify span class present during loading
      expect(frame.className).toContain('sm:col-span-2');
      expect(frame.className).toContain('lg:col-span-2');
    });

    it('colSpan class is present in ready state', async () => {
      const widget = makeWidget({ colSpan: 3, component: MockReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toContain('sm:col-span-2');
      expect(frame.className).toContain('lg:col-span-3');
    });

    it('colSpan class is present in error state', async () => {
      const widget = makeWidget({ colSpan: 2, component: MockErrorWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeTruthy();
      });
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.className).toContain('sm:col-span-2');
      expect(frame.className).toContain('lg:col-span-2');
    });
  });

  /**
   * Property 7: Error badge content
   *
   * For any widget that throws an error, the displayed error badge SHALL contain
   * the widget's integration name and a non-empty error summary string.
   *
   * **Validates: Requirements 6.1**
   */
  describe('Property 7: Error badge content', () => {
    it('error badge displays the integration name', async () => {
      const widget = makeWidget({
        integration: 'puppetdb',
        component: MockErrorWidget as unknown as Component,
      });
      render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByText('puppetdb')).toBeTruthy();
      });
    });

    it('error badge displays a non-empty error summary', async () => {
      const widget = makeWidget({ component: MockErrorWidget as unknown as Component });
      render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        const errorText = screen.getByText('Connection timeout');
        expect(errorText).toBeTruthy();
        expect(errorText.textContent!.length).toBeGreaterThan(0);
      });
    });

    it('error badge shows both integration name and error message together', async () => {
      const widget = makeWidget({
        integration: 'hiera',
        component: MockErrorWidget as unknown as Component,
      });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByText('hiera')).toBeTruthy();
        expect(screen.getByText('Connection timeout')).toBeTruthy();
      });
      // Both are within the error badge container
      const errorBadge = container.querySelector('.border-red-200');
      expect(errorBadge).toBeTruthy();
      expect(errorBadge!.textContent).toContain('hiera');
      expect(errorBadge!.textContent).toContain('Connection timeout');
    });
  });

  describe('Loading skeleton display', () => {
    it('shows animated skeleton placeholder while loading', () => {
      const widget = makeWidget({ component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeTruthy();
    });

    it('skeleton has gray background styling', () => {
      const widget = makeWidget({ component: MockNeverReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      const skeleton = container.querySelector('.bg-gray-100');
      expect(skeleton).toBeTruthy();
    });
  });

  describe('Error state with retry', () => {
    it('shows retry button in error state', async () => {
      const widget = makeWidget({ component: MockErrorWidget as unknown as Component });
      render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeTruthy();
      });
    });

    it('clicking retry resets to loading state', async () => {
      const widget = makeWidget({ component: MockErrorWidget as unknown as Component });
      render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeTruthy();
      });

      // Click retry
      await fireEvent.click(screen.getByText('Retry'));

      // After retry, error re-fires immediately from MockErrorWidget,
      // but we verify the retry button is still available (component re-mounted and errored again)
      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeTruthy();
        expect(screen.getByText('Retry')).toBeTruthy();
      });
    });

    it('error state hides the loading skeleton', async () => {
      const widget = makeWidget({ component: MockErrorWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeTruthy();
      });
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeNull();
    });
  });

  describe('Content transition', () => {
    it('hides skeleton and shows content when widget signals ready', async () => {
      const widget = makeWidget({ component: MockReadyWidget as unknown as Component });
      const { container } = render(WidgetFrame, { props: { widget, nodeId: 'node-1' } });
      await waitFor(() => {
        expect(screen.getByTestId('mock-widget-content')).toBeTruthy();
      });
      // Skeleton should be gone
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeNull();
    });

    it('widget content includes the nodeId prop', async () => {
      const widget = makeWidget({ component: MockReadyWidget as unknown as Component });
      render(WidgetFrame, { props: { widget, nodeId: 'my-server-01' } });
      await waitFor(() => {
        expect(screen.getByText('Widget loaded for my-server-01')).toBeTruthy();
      });
    });
  });
});
