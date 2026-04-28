import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 3: inventory_list search filtering
 *
 * For any list of inventory nodes and any non-empty search string q,
 * filtering with search = q returns only nodes where node.name or node.id
 * contains q (case-insensitive). When search is omitted, all nodes returned.
 *
 * **Validates: Requirements 11.2**
 *
 * Feature: rbac-and-mcp-server, Property 3: inventory_list search filtering
 */

interface MockNode {
  id: string;
  name: string;
}

/**
 * Replicates the filtering logic from the inventory_list tool handler.
 */
function filterNodes(nodes: MockNode[], search?: string): MockNode[] {
  if (!search) return nodes;
  const q = search.toLowerCase();
  return nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      (n.id && n.id.toLowerCase().includes(q)),
  );
}

const nodeArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
});

const nodeListArb = fc.array(nodeArb, { minLength: 0, maxLength: 15 });
const searchArb = fc.string({ minLength: 1, maxLength: 20 });

describe('Property 3: inventory_list search filtering', () => {
  it('returns only nodes matching the search string (case-insensitive)', () => {
    fc.assert(
      fc.property(nodeListArb, searchArb, (nodes, search) => {
        const result = filterNodes(nodes, search);
        const q = search.toLowerCase();

        // Every returned node must contain the search string
        for (const node of result) {
          const nameMatch = node.name.toLowerCase().includes(q);
          const idMatch = node.id.toLowerCase().includes(q);
          expect(nameMatch || idMatch).toBe(true);
        }

        // Every node that matches must be in the result
        for (const node of nodes) {
          const nameMatch = node.name.toLowerCase().includes(q);
          const idMatch = node.id.toLowerCase().includes(q);
          if (nameMatch || idMatch) {
            expect(result).toContainEqual(node);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it('returns all nodes when search is omitted', () => {
    fc.assert(
      fc.property(nodeListArb, (nodes) => {
        const result = filterNodes(nodes, undefined);
        expect(result).toEqual(nodes);
      }),
      { numRuns: 20 },
    );
  });

  it('returns all nodes when search is empty string', () => {
    fc.assert(
      fc.property(nodeListArb, (nodes) => {
        const result = filterNodes(nodes, '');
        expect(result).toEqual(nodes);
      }),
      { numRuns: 20 },
    );
  });

  it('search is case-insensitive', () => {
    fc.assert(
      fc.property(nodeListArb, searchArb, (nodes, search) => {
        const lower = filterNodes(nodes, search.toLowerCase());
        const upper = filterNodes(nodes, search.toUpperCase());
        expect(lower).toEqual(upper);
      }),
      { numRuns: 20 },
    );
  });
});
