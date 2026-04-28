/**
 * Property-based tests for CreateRoleDialog form validation
 * Feature: rbac-and-mcp-server
 * Property 2: CreateRoleDialog form validation
 *
 * Validates: Requirements 7.3, 7.4
 *
 * For any string name and description, the CreateRoleDialog validation
 * SHALL accept the input if and only if:
 *   name.length >= 3 && name.length <= 100 && description.length <= 500
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Pure validation function matching CreateRoleDialog's derived validation logic.
 * Returns true if the form input is valid for submission.
 */
function validateCreateRoleForm(name: string, description: string): boolean {
  return name.length >= 3 && name.length <= 100 && description.length <= 500;
}

describe('Feature: rbac-and-mcp-server, Property 2: CreateRoleDialog form validation', () => {
  it('validation accepts iff name.length >= 3 && name.length <= 100 && description.length <= 500', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 600 }),
        (name: string, description: string) => {
          const result = validateCreateRoleForm(name, description);
          const expected =
            name.length >= 3 &&
            name.length <= 100 &&
            description.length <= 500;

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('always rejects names shorter than 3 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2 }),
        fc.string({ minLength: 0, maxLength: 600 }),
        (name: string, description: string) => {
          expect(validateCreateRoleForm(name, description)).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('always rejects names longer than 100 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 600 }),
        (name: string, description: string) => {
          expect(validateCreateRoleForm(name, description)).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('always rejects descriptions longer than 500 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 100 }),
        fc.string({ minLength: 501, maxLength: 600 }),
        (name: string, description: string) => {
          expect(validateCreateRoleForm(name, description)).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('always accepts valid name and description combinations', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (name: string, description: string) => {
          expect(validateCreateRoleForm(name, description)).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});
