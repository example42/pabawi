import { describe, it, expect } from 'vitest';
import { validateForm, type ValidationRules } from './validation';

describe('validateForm', () => {
  it('should return valid=true when all required fields are present', () => {
    const data = {
      name: 'test-vm',
      vmid: 100,
      memory: 1024
    };

    const rules: ValidationRules = {
      name: { label: 'Name', required: true, type: 'string' },
      vmid: { label: 'VMID', required: true, type: 'number' },
      memory: { label: 'Memory', required: true, type: 'number' }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should return errors for missing required fields', () => {
    const data = {
      name: 'test-vm'
    };

    const rules: ValidationRules = {
      name: { label: 'Name', required: true },
      vmid: { label: 'VMID', required: true },
      memory: { label: 'Memory', required: true }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.vmid).toBe('VMID is required');
    expect(result.errors.memory).toBe('Memory is required');
  });

  it('should validate number min/max constraints', () => {
    const data = {
      vmid: 50,
      memory: 256
    };

    const rules: ValidationRules = {
      vmid: { label: 'VMID', type: 'number', min: 100, max: 999999999 },
      memory: { label: 'Memory', type: 'number', min: 512 }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.vmid).toBe('VMID must be at least 100');
    expect(result.errors.memory).toBe('Memory must be at least 512');
  });

  it('should validate string length constraints', () => {
    const data = {
      name: 'ab',
      description: 'a'.repeat(300)
    };

    const rules: ValidationRules = {
      name: { label: 'Name', type: 'string', minLength: 3 },
      description: { label: 'Description', type: 'string', maxLength: 255 }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Name must be at least 3 characters');
    expect(result.errors.description).toBe('Description must be at most 255 characters');
  });

  it('should validate string pattern constraints', () => {
    const data = {
      hostname: 'Invalid_Hostname'
    };

    const rules: ValidationRules = {
      hostname: {
        label: 'Hostname',
        type: 'string',
        pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
        patternMessage: 'Hostname must contain only lowercase letters, numbers, and hyphens'
      }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.hostname).toBe('Hostname must contain only lowercase letters, numbers, and hyphens');
  });

  it('should handle invalid number format', () => {
    const data = {
      vmid: 'not-a-number'
    };

    const rules: ValidationRules = {
      vmid: { label: 'VMID', type: 'number' }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.vmid).toBe('VMID must be a number');
  });

  it('should skip validation for optional empty fields', () => {
    const data = {
      name: 'test-vm'
    };

    const rules: ValidationRules = {
      name: { label: 'Name', required: true },
      description: { label: 'Description', type: 'string', minLength: 10 }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should validate multiple fields with mixed errors', () => {
    const data = {
      vmid: 50,
      name: '',
      memory: 'invalid',
      cores: 100
    };

    const rules: ValidationRules = {
      vmid: { label: 'VMID', required: true, type: 'number', min: 100 },
      name: { label: 'Name', required: true, type: 'string' },
      memory: { label: 'Memory', type: 'number', min: 512 },
      cores: { label: 'Cores', type: 'number', max: 64 }
    };

    const result = validateForm(data, rules);

    expect(result.valid).toBe(false);
    expect(result.errors.vmid).toBe('VMID must be at least 100');
    expect(result.errors.name).toBe('Name is required');
    expect(result.errors.memory).toBe('Memory must be a number');
    expect(result.errors.cores).toBe('Cores must be at most 64');
  });
});
