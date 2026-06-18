/**
 * Property-based tests for widgetRegistry.svelte.ts
 *
 * Uses fast-check to verify universal invariants of the widget registry,
 * integration filtering, and priority sorting.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.2, 2.4, 3.2, 3.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { Component } from 'svelte';
import {
  registerWidget,
  getWidgets,
  _resetForTesting,
  filterWidgetsByStatus,
  stableSortByPriority,
} from './widgetRegistry.svelte';
import type { WidgetDefinition, WidgetType, IntegrationStatusEntry } from './widgetRegistry.svelte';

// Stub component for property tests (never rendered)
const stubComponent = {} as Component;

// --- Generators ---

const widgetTypeArb: fc.Arbitrary<WidgetType> = fc.constantFrom('action', 'list', 'summary');

const integrationNameArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{1,12}$/);

const widgetIdArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z0-9-]{1,20}$/);

function widgetDefinitionArb(): fc.Arbitrary<WidgetDefinition> {
  return fc.record({
    id: widgetIdArb,
    name: fc.string({ minLength: 1, maxLength: 30 }),
    component: fc.constant(stubComponent),
    integration: integrationNameArb,
    type: widgetTypeArb,
    colSpan: fc.integer({ min: -10, max: 10 }),
    priority: fc.integer({ min: -1000, max: 1000 }),
  });
}

function validWidgetDefinitionArb(): fc.Arbitrary<WidgetDefinition> {
  return fc.record({
    id: widgetIdArb,
    name: fc.string({ minLength: 1, maxLength: 30 }),
    component: fc.constant(stubComponent),
    integration: integrationNameArb,
    type: widgetTypeArb,
    colSpan: fc.integer({ min: 1, max: 3 }),
    priority: fc.integer({ min: 0, max: 1000 }),
  });
}

const integrationStatusArb: fc.Arbitrary<IntegrationStatusEntry> = fc.record({
  name: integrationNameArb,
  status: fc.constantFrom('connected', 'degraded', 'not_configured', 'error', 'disconnected'),
  type: fc.constantFrom('execution', 'information', 'both'),
});

// --- Tests ---

describe('widgetRegistry property tests', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  /**
   * Property 1: Registration preserves widget definitions
   *
   * For any valid WidgetDefinition, registering it and querying the registry
   * SHALL return a definition with all original fields preserved (except colSpan
   * which may be clamped).
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  describe('Property 1: Registration preserves widget definitions', () => {
    it('all fields except colSpan are preserved after registration', () => {
      fc.assert(
        fc.property(widgetDefinitionArb(), (def) => {
          _resetForTesting();
          registerWidget(def);
          const stored = getWidgets();
          expect(stored).toHaveLength(1);

          const result = stored[0];
          expect(result.id).toBe(def.id);
          expect(result.name).toBe(def.name);
          // Component reference equality checked via toStrictEqual due to Svelte reactivity proxy
          expect(result.component).toStrictEqual(def.component);
          expect(result.integration).toBe(def.integration);
          expect(result.type).toBe(def.type);
          expect(result.priority).toBe(def.priority);
        }),
        { numRuns: 200 },
      );
    });

    it('multiple registrations are all preserved in order', () => {
      fc.assert(
        fc.property(fc.array(widgetDefinitionArb(), { minLength: 1, maxLength: 20 }), (defs) => {
          _resetForTesting();
          for (const def of defs) {
            registerWidget(def);
          }
          const stored = getWidgets();
          expect(stored).toHaveLength(defs.length);

          for (let i = 0; i < defs.length; i++) {
            expect(stored[i].id).toBe(defs[i].id);
            expect(stored[i].integration).toBe(defs[i].integration);
            expect(stored[i].type).toBe(defs[i].type);
            expect(stored[i].priority).toBe(defs[i].priority);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Column span clamping
   *
   * For any integer value provided as colSpan during registration, the stored
   * colSpan SHALL equal `Math.max(1, Math.min(3, Math.round(value)))`.
   *
   * **Validates: Requirements 1.3**
   */
  describe('Property 2: Column span clamping', () => {
    it('stored colSpan equals Math.max(1, Math.min(3, Math.round(value)))', () => {
      fc.assert(
        fc.property(
          widgetDefinitionArb(),
          fc.integer({ min: -100, max: 100 }),
          (def, rawColSpan) => {
            _resetForTesting();
            const input = { ...def, colSpan: rawColSpan };
            registerWidget(input);
            const stored = getWidgets()[0];
            const expected = Math.max(1, Math.min(3, Math.round(rawColSpan)));
            expect(stored.colSpan).toBe(expected);
          },
        ),
        { numRuns: 300 },
      );
    });

    it('colSpan is always in [1, 3] regardless of input', () => {
      fc.assert(
        fc.property(widgetDefinitionArb(), (def) => {
          _resetForTesting();
          registerWidget(def);
          const stored = getWidgets()[0];
          expect(stored.colSpan).toBeGreaterThanOrEqual(1);
          expect(stored.colSpan).toBeLessThanOrEqual(3);
        }),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property 3: Integration filtering
   *
   * For any set of registered WidgetDefinitions and any integration status
   * response, the visible widget set SHALL contain exactly those widgets whose
   * integration name appears in the status response with status "connected" or
   * "degraded".
   *
   * **Validates: Requirements 2.2, 2.4**
   */
  describe('Property 3: Integration filtering', () => {
    it('returns exactly widgets whose integration is connected or degraded', () => {
      fc.assert(
        fc.property(
          fc.array(validWidgetDefinitionArb(), { minLength: 0, maxLength: 15 }),
          fc.array(integrationStatusArb, { minLength: 0, maxLength: 10 }),
          (widgets, integrations) => {
            const enabledNames = new Set(
              integrations
                .filter((i) => i.status === 'connected' || i.status === 'degraded')
                .map((i) => i.name),
            );

            const result = filterWidgetsByStatus(widgets, integrations);

            // Every result widget has an enabled integration
            for (const w of result) {
              expect(enabledNames.has(w.integration)).toBe(true);
            }

            // Every widget with an enabled integration is in the result
            const expectedWidgets = widgets.filter((w) => enabledNames.has(w.integration));
            expect(result).toHaveLength(expectedWidgets.length);

            // Preserves order from input
            for (let i = 0; i < result.length; i++) {
              expect(result[i]).toBe(expectedWidgets[i]);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('widgets with integration names absent from status are excluded', () => {
      fc.assert(
        fc.property(
          fc.array(validWidgetDefinitionArb(), { minLength: 1, maxLength: 10 }),
          (widgets) => {
            // Empty integration status → all widgets excluded
            const result = filterWidgetsByStatus(widgets, []);
            expect(result).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Stable priority ordering
   *
   * For any set of widgets, the rendered sequence SHALL be sorted by ascending
   * priority weight, and widgets with equal priority weight SHALL appear in their
   * original registration order (stable sort).
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  describe('Property 4: Stable priority ordering', () => {
    it('output is sorted by ascending priority', () => {
      fc.assert(
        fc.property(
          fc.array(validWidgetDefinitionArb(), { minLength: 0, maxLength: 20 }),
          (widgets) => {
            const sorted = stableSortByPriority(widgets);
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i].priority).toBeGreaterThanOrEqual(sorted[i - 1].priority);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('widgets with equal priority preserve original order (stable sort)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 100 }),
          fc.array(validWidgetDefinitionArb(), { minLength: 2, maxLength: 15 }),
          (samePriority, widgets) => {
            // Give all widgets the same priority to test stability
            const samePriorityWidgets = widgets.map((w, i) => ({
              ...w,
              priority: samePriority,
              id: `widget-${i}`,
            }));

            const sorted = stableSortByPriority(samePriorityWidgets);

            // All same priority → original order preserved
            expect(sorted).toHaveLength(samePriorityWidgets.length);
            for (let i = 0; i < sorted.length; i++) {
              expect(sorted[i].id).toBe(samePriorityWidgets[i].id);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('does not mutate the input array', () => {
      fc.assert(
        fc.property(
          fc.array(validWidgetDefinitionArb(), { minLength: 1, maxLength: 10 }),
          (widgets) => {
            const original = [...widgets];
            stableSortByPriority(widgets);
            expect(widgets).toEqual(original);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
