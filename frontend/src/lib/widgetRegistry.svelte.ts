/**
 * Widget Registry — frontend-only reactive store for plugin-contributed widgets.
 *
 * Integration plugins register widgets at module load time via static import
 * side-effects. The registry maintains an ordered collection accessible to
 * WidgetGrid for filtering and rendering.
 *
 * Uses Svelte 5 $state rune for reactive state.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1
 */

import type { Component } from 'svelte';

export type WidgetType = 'action' | 'list' | 'summary';

export interface WidgetDefinition {
  /** Unique identifier for the widget */
  id: string;
  /** Display name shown in error badges */
  name: string;
  /** Svelte component to render */
  component: Component;
  /** Integration name (must match /api/integrations/status response) */
  integration: string;
  /** Widget category: determines placement (action → ActionRow, others → grid) */
  type: WidgetType;
  /** Column span in the grid: 1, 2, or 3. Clamped to [1,3] on registration. */
  colSpan: number;
  /** Numeric priority weight. Lower renders first. */
  priority: number;
}

export interface IntegrationStatusEntry {
  name: string;
  status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
  type: 'execution' | 'information' | 'both';
}

// Internal reactive state
let definitions = $state<WidgetDefinition[]>([]);

/**
 * Register a widget definition. Column span is clamped to [1,3].
 * Called at module load time as a side-effect of static imports.
 */
export function registerWidget(def: WidgetDefinition): void {
  const clamped: WidgetDefinition = {
    ...def,
    colSpan: Math.max(1, Math.min(3, Math.round(def.colSpan))),
  };
  definitions.push(clamped);
}

/**
 * Get all registered widget definitions (readonly snapshot).
 */
export function getWidgets(): readonly WidgetDefinition[] {
  return definitions;
}

/**
 * Reset registry state. For use in tests only.
 */
export function _resetForTesting(): void {
  definitions = [];
}

/**
 * Filter widgets to only those whose integration is connected or degraded.
 * Pure function — no side effects, easily testable.
 */
export function filterWidgetsByStatus(
  widgets: readonly WidgetDefinition[],
  integrations: readonly IntegrationStatusEntry[],
): WidgetDefinition[] {
  const enabled = new Set(
    integrations
      .filter(i => i.status === 'connected' || i.status === 'degraded')
      .map(i => i.name),
  );
  return widgets.filter(w => enabled.has(w.integration));
}

/**
 * Sort widgets by ascending priority weight, preserving registration order
 * for widgets with equal priority (stable sort).
 * Pure function — no side effects, easily testable.
 */
export function stableSortByPriority(widgets: readonly WidgetDefinition[]): WidgetDefinition[] {
  return [...widgets].sort((a, b) => a.priority - b.priority);
}
