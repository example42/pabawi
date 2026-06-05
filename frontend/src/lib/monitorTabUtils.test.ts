/**
 * Property-based tests for Monitor tab utility functions
 * Feature: checkmk-integration
 *
 * Property 9: Service grouping order
 * For any array of services with mixed states, the Monitor tab grouping function
 * SHALL produce groups in the order: CRIT (state 2) first, then WARN (state 1),
 * then UNKNOWN (state 3), then OK (state 0), with each group containing the
 * correct count of services.
 *
 * **Validates: Requirements 9.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { groupServicesByState, STATE_ORDER } from './monitorTabUtils';
import type { ServiceStatus } from './checkmkApi';

/** Generator for valid ServiceStatus state numbers */
const serviceStateArb = fc.constantFrom<0 | 1 | 2 | 3>(0, 1, 2, 3);

/** Generator for a single ServiceStatus object */
const serviceStatusArb: fc.Arbitrary<ServiceStatus> = fc.record({
  description: fc.string({ minLength: 1, maxLength: 100 }),
  state: serviceStateArb,
  stateType: fc.oneof(fc.constant(0 as const), fc.constant(1 as const)),
  pluginOutput: fc.string({ maxLength: 200 }),
  lastCheck: fc.integer({ min: 946684800, max: 1924905600 }),
  lastStateChange: fc.integer({ min: 0, max: 1924905600 }),
});

/** Generator for arrays of ServiceStatus with at least one service */
const servicesArb = fc.array(serviceStatusArb, { minLength: 1, maxLength: 50 });

/** Expected group order: CRIT=2, WARN=1, UNKNOWN=3, OK=0 */
const EXPECTED_ORDER = [2, 1, 3, 0];

describe('Feature: checkmk-integration, Property 9: Service grouping order', () => {
  it('groups are produced in CRIT → WARN → UNKNOWN → OK order', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const groups = groupServicesByState(services);

        // Extract the state numbers from the returned groups
        const groupStates = groups.map(g => g.state);

        // Verify ordering: each group's state must appear in EXPECTED_ORDER
        // and their relative order must match EXPECTED_ORDER
        for (let i = 0; i < groupStates.length - 1; i++) {
          const currentIdx = EXPECTED_ORDER.indexOf(groupStates[i]);
          const nextIdx = EXPECTED_ORDER.indexOf(groupStates[i + 1]);
          expect(currentIdx).toBeLessThan(nextIdx);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each group contains the correct count of services matching that state', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const groups = groupServicesByState(services);

        for (const group of groups) {
          const expectedCount = services.filter(s => s.state === group.state).length;
          expect(group.services.length).toBe(expectedCount);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no services are lost — total count matches input', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const groups = groupServicesByState(services);
        const totalInGroups = groups.reduce((sum, g) => sum + g.services.length, 0);
        expect(totalInGroups).toBe(services.length);
      }),
      { numRuns: 100 },
    );
  });

  it('empty groups are omitted from the output', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const groups = groupServicesByState(services);

        // Every returned group must have at least one service
        for (const group of groups) {
          expect(group.services.length).toBeGreaterThan(0);
        }

        // States not present in input must not appear in output
        const inputStates = new Set(services.map(s => s.state));
        for (const group of groups) {
          expect(inputStates.has(group.state)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('group name matches the expected state name', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const groups = groupServicesByState(services);
        const numToName: Record<number, string> = {
          0: 'OK',
          1: 'WARN',
          2: 'CRIT',
          3: 'UNKNOWN',
        };

        for (const group of groups) {
          expect(group.name).toBe(numToName[group.state]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty input produces empty output', () => {
    const groups = groupServicesByState([]);
    expect(groups).toEqual([]);
  });

  it('STATE_ORDER constant matches expected severity order', () => {
    expect(STATE_ORDER).toEqual([2, 1, 3, 0]);
  });
});
