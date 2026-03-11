/**
 * Property-based tests for validation utilities
 * Feature: proxmox-frontend-ui
 *
 * These tests verify universal properties that should hold across all inputs:
 * - Property 8: Form Validation Completeness
 * - Property 9: Valid Form Enables Submission
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateVMID,
  validateHostname,
  validateMemory,
  validateRequired,
  validateNumericRange,
  validateStringPattern,
  validateForm,
  type ValidationRules
} from './validation';

describe('Feature: proxmox-frontend-ui, Property 8: Form Validation Completeness', () => {
  it('validateVMID rejects values outside valid range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000000000 }),
        (vmid) => {
          const result = validateVMID(vmid);
          const isValid = vmid >= 100 && vmid <= 999999999;

          if (isValid) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe('VMID must be between 100 and 999999999');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateHostname rejects invalid formats', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (hostname) => {
          const result = validateHostname(hostname);
          const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          const isValid = pattern.test(hostname);

          if (isValid) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe('Hostname must contain only lowercase letters, numbers, and hyphens');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateMemory rejects values below minimum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        (memory) => {
          const result = validateMemory(memory);

          if (memory >= 512) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe('Memory must be at least 512 MB');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateRequired rejects empty values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.string({ minLength: 1 }),
          fc.integer(),
          fc.boolean()
        ),
        fc.string({ minLength: 1 }),
        (value, fieldName) => {
          const result = validateRequired(value, fieldName);
          const isEmpty = value === null || value === undefined || value === '';

          if (isEmpty) {
            expect(result).toBe(`${fieldName} is required`);
          } else {
            expect(result).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateNumericRange enforces min and max bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 501, max: 1000 }),
        fc.string({ minLength: 1 }),
        (value, min, max, fieldName) => {
          const result = validateNumericRange(value, min, max, fieldName);
          const isValid = value >= min && value <= max;

          if (isValid) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe(`${fieldName} must be between ${min} and ${max}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateStringPattern enforces regex patterns', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        (value, fieldName) => {
          // Test with a simple alphanumeric pattern
          const pattern = /^[a-z0-9]+$/;
          const result = validateStringPattern(value, pattern, fieldName);
          const isValid = pattern.test(value);

          if (isValid) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe(`${fieldName} format is invalid`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validateStringPattern uses custom error messages', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (value, fieldName, customMessage) => {
          const pattern = /^[a-z0-9]+$/;
          const result = validateStringPattern(value, pattern, fieldName, customMessage);
          const isValid = pattern.test(value);

          if (isValid) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe(customMessage);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: proxmox-frontend-ui, Property 8 & 9: Form Validation with validateForm', () => {
  it('Property 8: invalid required fields prevent submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(''), fc.integer({ min: 0, max: 50 })),
          name: fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant('')),
          memory: fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(''), fc.integer({ min: 0, max: 400 }))
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', required: true, type: 'number', min: 100 },
            name: { label: 'Name', required: true, type: 'string' },
            memory: { label: 'Memory', required: true, type: 'number', min: 512 }
          };

          const result = validateForm(formData, rules);

          // Form should be invalid
          expect(result.valid).toBe(false);
          // Should have at least one error
          expect(Object.keys(result.errors).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: invalid numeric ranges prevent submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.integer({ min: -1000, max: 1000000000 }),
          cores: fc.integer({ min: -10, max: 200 }),
          memory: fc.integer({ min: 0, max: 100000 })
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', type: 'number', min: 100, max: 999999999 },
            cores: { label: 'Cores', type: 'number', min: 1, max: 64 },
            memory: { label: 'Memory', type: 'number', min: 512 }
          };

          const result = validateForm(formData, rules);

          const hasInvalidVMID = formData.vmid < 100 || formData.vmid > 999999999;
          const hasInvalidCores = formData.cores < 1 || formData.cores > 64;
          const hasInvalidMemory = formData.memory < 512;

          if (hasInvalidVMID || hasInvalidCores || hasInvalidMemory) {
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: invalid string patterns prevent submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          hostname: fc.string(),
          name: fc.string()
        }),
        (formData) => {
          const rules: ValidationRules = {
            hostname: {
              label: 'Hostname',
              type: 'string',
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
              patternMessage: 'Invalid hostname format'
            },
            name: {
              label: 'Name',
              type: 'string',
              pattern: /^[a-zA-Z0-9-]+$/,
              patternMessage: 'Invalid name format'
            }
          };

          const result = validateForm(formData, rules);

          const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          const namePattern = /^[a-zA-Z0-9-]+$/;
          const hasInvalidHostname = formData.hostname && !hostnamePattern.test(formData.hostname);
          const hasInvalidName = formData.name && !namePattern.test(formData.name);

          if (hasInvalidHostname || hasInvalidName) {
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8: invalid string lengths prevent submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ maxLength: 100 }),
          description: fc.string({ maxLength: 500 })
        }),
        (formData) => {
          const rules: ValidationRules = {
            name: { label: 'Name', type: 'string', minLength: 3, maxLength: 50 },
            description: { label: 'Description', type: 'string', minLength: 10, maxLength: 255 }
          };

          const result = validateForm(formData, rules);

          const hasInvalidName = formData.name && (formData.name.length < 3 || formData.name.length > 50);
          const hasInvalidDescription = formData.description && (formData.description.length < 10 || formData.description.length > 255);

          if (hasInvalidName || hasInvalidDescription) {
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: valid forms enable submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.integer({ min: 100, max: 999999999 }),
          name: fc.string({ minLength: 3, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
          memory: fc.integer({ min: 512, max: 100000 }),
          cores: fc.integer({ min: 1, max: 64 })
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', required: true, type: 'number', min: 100, max: 999999999 },
            name: {
              label: 'Name',
              required: true,
              type: 'string',
              minLength: 3,
              maxLength: 50,
              pattern: /^[a-zA-Z0-9-]+$/
            },
            memory: { label: 'Memory', required: true, type: 'number', min: 512 },
            cores: { label: 'Cores', type: 'number', min: 1, max: 64 }
          };

          const result = validateForm(formData, rules);

          // All fields are valid, so form should be valid
          expect(result.valid).toBe(true);
          expect(result.errors).toEqual({});
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: valid forms with optional fields enable submission', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.integer({ min: 100, max: 999999999 }),
          name: fc.string({ minLength: 3, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
          memory: fc.integer({ min: 512, max: 100000 }),
          // Optional fields may be undefined
          cores: fc.option(fc.integer({ min: 1, max: 64 })),
          description: fc.option(fc.string({ minLength: 10, maxLength: 255 }))
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', required: true, type: 'number', min: 100, max: 999999999 },
            name: {
              label: 'Name',
              required: true,
              type: 'string',
              minLength: 3,
              maxLength: 50,
              pattern: /^[a-zA-Z0-9-]+$/
            },
            memory: { label: 'Memory', required: true, type: 'number', min: 512 },
            cores: { label: 'Cores', type: 'number', min: 1, max: 64 },
            description: { label: 'Description', type: 'string', minLength: 10, maxLength: 255 }
          };

          const result = validateForm(formData, rules);

          // All required fields are valid, optional fields are either valid or empty
          expect(result.valid).toBe(true);
          expect(result.errors).toEqual({});
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8 & 9: comprehensive VM form validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.integer({ min: -1000, max: 1000000000 }),
          name: fc.string({ maxLength: 100 }),
          node: fc.string({ maxLength: 100 }),
          memory: fc.integer({ min: 0, max: 100000 }),
          cores: fc.option(fc.integer({ min: -10, max: 200 }))
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', required: true, type: 'number', min: 100, max: 999999999 },
            name: {
              label: 'Name',
              required: true,
              type: 'string',
              minLength: 1,
              maxLength: 50,
              pattern: /^[a-zA-Z0-9-]+$/
            },
            node: { label: 'Node', required: true, type: 'string', minLength: 1 },
            memory: { label: 'Memory', type: 'number', min: 512 },
            cores: { label: 'Cores', type: 'number', min: 1, max: 64 }
          };

          const result = validateForm(formData, rules);

          // Check if any validation should fail
          const hasInvalidVMID = !formData.vmid || formData.vmid < 100 || formData.vmid > 999999999;
          const hasInvalidName = !formData.name || formData.name.length === 0 || formData.name.length > 50 || !/^[a-zA-Z0-9-]+$/.test(formData.name);
          const hasInvalidNode = !formData.node || formData.node.length === 0;
          const hasInvalidMemory = formData.memory !== undefined && formData.memory < 512;
          const hasInvalidCores = formData.cores !== null && formData.cores !== undefined && (formData.cores < 1 || formData.cores > 64);

          if (hasInvalidVMID || hasInvalidName || hasInvalidNode || hasInvalidMemory || hasInvalidCores) {
            // Property 8: Invalid data prevents submission
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          } else {
            // Property 9: Valid data enables submission
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual({});
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8 & 9: comprehensive LXC form validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          vmid: fc.integer({ min: -1000, max: 1000000000 }),
          hostname: fc.string({ maxLength: 100 }),
          node: fc.string({ maxLength: 100 }),
          ostemplate: fc.string({ maxLength: 100 }),
          memory: fc.option(fc.integer({ min: 0, max: 100000 })),
          cores: fc.option(fc.integer({ min: -10, max: 200 }))
        }),
        (formData) => {
          const rules: ValidationRules = {
            vmid: { label: 'VMID', required: true, type: 'number', min: 100, max: 999999999 },
            hostname: {
              label: 'Hostname',
              required: true,
              type: 'string',
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
              patternMessage: 'Hostname must contain only lowercase letters, numbers, and hyphens'
            },
            node: { label: 'Node', required: true, type: 'string', minLength: 1 },
            ostemplate: { label: 'OS Template', required: true, type: 'string', minLength: 1 },
            memory: { label: 'Memory', type: 'number', min: 512 },
            cores: { label: 'Cores', type: 'number', min: 1, max: 64 }
          };

          const result = validateForm(formData, rules);

          // Check if any validation should fail
          const hasInvalidVMID = !formData.vmid || formData.vmid < 100 || formData.vmid > 999999999;
          const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
          const hasInvalidHostname = !formData.hostname || !hostnamePattern.test(formData.hostname);
          const hasInvalidNode = !formData.node || formData.node.length === 0;
          const hasInvalidTemplate = !formData.ostemplate || formData.ostemplate.length === 0;
          const hasInvalidMemory = formData.memory !== null && formData.memory !== undefined && formData.memory < 512;
          const hasInvalidCores = formData.cores !== null && formData.cores !== undefined && (formData.cores < 1 || formData.cores > 64);

          if (hasInvalidVMID || hasInvalidHostname || hasInvalidNode || hasInvalidTemplate || hasInvalidMemory || hasInvalidCores) {
            // Property 8: Invalid data prevents submission
            expect(result.valid).toBe(false);
            expect(Object.keys(result.errors).length).toBeGreaterThan(0);
          } else {
            // Property 9: Valid data enables submission
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual({});
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
