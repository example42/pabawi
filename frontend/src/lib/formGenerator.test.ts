/**
 * Tests for dynamic form generation utilities
 *
 * Validates Requirements: 13.1, 13.4
 */

import { describe, it, expect } from 'vitest';
import {
  generateFormFields,
  generateValidationRules,
  initializeFormData,
  type FormFieldConfig,
} from './formGenerator';
import type { CapabilityParameter } from './types/provisioning';

describe('formGenerator', () => {
  describe('generateFormFields', () => {
    it('should generate form fields from capability parameters', () => {
      const parameters: CapabilityParameter[] = [
        {
          name: 'vmid',
          type: 'number',
          required: true,
          description: 'Virtual Machine ID',
          validation: { min: 100, max: 999999999 },
        },
        {
          name: 'name',
          type: 'string',
          required: true,
          description: 'VM name',
        },
        {
          name: 'cores',
          type: 'number',
          required: false,
          default: 1,
        },
      ];

      const fields = generateFormFields(parameters);

      expect(fields).toHaveLength(3);

      // Check vmid field
      expect(fields[0].name).toBe('vmid');
      expect(fields[0].label).toBe('VM ID');
      expect(fields[0].type).toBe('number');
      expect(fields[0].required).toBe(true);
      expect(fields[0].description).toBe('Virtual Machine ID');
      expect(fields[0].validation.min).toBe(100);
      expect(fields[0].validation.max).toBe(999999999);

      // Check name field
      expect(fields[1].name).toBe('name');
      expect(fields[1].label).toBe('Name');
      expect(fields[1].type).toBe('text');
      expect(fields[1].required).toBe(true);

      // Check cores field
      expect(fields[2].name).toBe('cores');
      expect(fields[2].label).toBe('Cores');
      expect(fields[2].type).toBe('number');
      expect(fields[2].required).toBe(false);
      expect(fields[2].defaultValue).toBe(1);
    });

    it('should map parameter types to correct input types', () => {
      const parameters: CapabilityParameter[] = [
        { name: 'text_field', type: 'string', required: false },
        { name: 'number_field', type: 'number', required: false },
        { name: 'bool_field', type: 'boolean', required: false },
        { name: 'array_field', type: 'array', required: false },
        { name: 'object_field', type: 'object', required: false },
      ];

      const fields = generateFormFields(parameters);

      expect(fields[0].type).toBe('text');
      expect(fields[1].type).toBe('number');
      expect(fields[2].type).toBe('checkbox');
      expect(fields[3].type).toBe('textarea');
      expect(fields[4].type).toBe('textarea');
    });

    it('should generate select fields for enum validation', () => {
      const parameters: CapabilityParameter[] = [
        {
          name: 'ostype',
          type: 'string',
          required: false,
          validation: {
            enum: ['l26', 'l24', 'win10', 'win11'],
          },
        },
      ];

      const fields = generateFormFields(parameters);

      expect(fields[0].type).toBe('select');
      expect(fields[0].options).toEqual(['l26', 'l24', 'win10', 'win11']);
    });

    it('should generate human-readable labels from parameter names', () => {
      const parameters: CapabilityParameter[] = [
        { name: 'vmid', type: 'string', required: false },
        { name: 'ostemplate', type: 'string', required: false },
        { name: 'cpu_cores', type: 'number', required: false },
        { name: 'memorySize', type: 'number', required: false },
      ];

      const fields = generateFormFields(parameters);

      expect(fields[0].label).toBe('VM ID');
      expect(fields[1].label).toBe('Ostemplate');
      expect(fields[2].label).toBe('CPU Cores');
      expect(fields[3].label).toBe('Memory Size');
    });

    it('should include validation rules in field configuration', () => {
      const parameters: CapabilityParameter[] = [
        {
          name: 'memory',
          type: 'number',
          required: true,
          validation: { min: 512, max: 65536 },
        },
        {
          name: 'hostname',
          type: 'string',
          required: true,
          validation: { pattern: '^[a-z0-9-]+$' },
        },
      ];

      const fields = generateFormFields(parameters);

      expect(fields[0].validation.min).toBe(512);
      expect(fields[0].validation.max).toBe(65536);
      expect(fields[0].validation.required).toBe(true);

      expect(fields[1].validation.pattern).toEqual(/^[a-z0-9-]+$/);
      expect(fields[1].validation.required).toBe(true);
    });

    it('should handle empty parameter array', () => {
      const fields = generateFormFields([]);
      expect(fields).toEqual([]);
    });

    it('should preserve parameter descriptions', () => {
      const parameters: CapabilityParameter[] = [
        {
          name: 'node',
          type: 'string',
          required: true,
          description: 'Proxmox node name',
        },
      ];

      const fields = generateFormFields(parameters);

      expect(fields[0].description).toBe('Proxmox node name');
    });
  });

  describe('generateValidationRules', () => {
    it('should extract validation rules from form fields', () => {
      const fields: FormFieldConfig[] = [
        {
          name: 'vmid',
          label: 'VM ID',
          type: 'number',
          required: true,
          validation: {
            label: 'VM ID',
            required: true,
            type: 'number',
            min: 100,
            max: 999999999,
          },
        },
        {
          name: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          validation: {
            label: 'Name',
            required: true,
            type: 'string',
          },
        },
      ];

      const rules = generateValidationRules(fields);

      expect(rules.vmid).toBeDefined();
      expect(rules.vmid.required).toBe(true);
      expect(rules.vmid.min).toBe(100);
      expect(rules.vmid.max).toBe(999999999);

      expect(rules.name).toBeDefined();
      expect(rules.name.required).toBe(true);
    });

    it('should handle empty fields array', () => {
      const rules = generateValidationRules([]);
      expect(rules).toEqual({});
    });
  });

  describe('initializeFormData', () => {
    it('should initialize form data with default values', () => {
      const fields: FormFieldConfig[] = [
        {
          name: 'vmid',
          label: 'VM ID',
          type: 'number',
          required: true,
          validation: { label: 'VM ID', required: true },
        },
        {
          name: 'cores',
          label: 'Cores',
          type: 'number',
          required: false,
          defaultValue: 2,
          validation: { label: 'Cores', required: false },
        },
        {
          name: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          validation: { label: 'Name', required: true },
        },
        {
          name: 'enabled',
          label: 'Enabled',
          type: 'checkbox',
          required: false,
          validation: { label: 'Enabled', required: false },
        },
      ];

      const data = initializeFormData(fields);

      expect(data.vmid).toBeUndefined();
      expect(data.cores).toBe(2);
      expect(data.name).toBe('');
      expect(data.enabled).toBe(false);
    });

    it('should handle empty fields array', () => {
      const data = initializeFormData([]);
      expect(data).toEqual({});
    });

    it('should initialize number fields as undefined when no default', () => {
      const fields: FormFieldConfig[] = [
        {
          name: 'memory',
          label: 'Memory',
          type: 'number',
          required: false,
          validation: { label: 'Memory', required: false },
        },
      ];

      const data = initializeFormData(fields);
      expect(data.memory).toBeUndefined();
    });

    it('should initialize checkbox fields as false', () => {
      const fields: FormFieldConfig[] = [
        {
          name: 'autostart',
          label: 'Autostart',
          type: 'checkbox',
          required: false,
          validation: { label: 'Autostart', required: false },
        },
      ];

      const data = initializeFormData(fields);
      expect(data.autostart).toBe(false);
    });

    it('should initialize text fields as empty string', () => {
      const fields: FormFieldConfig[] = [
        {
          name: 'description',
          label: 'Description',
          type: 'text',
          required: false,
          validation: { label: 'Description', required: false },
        },
      ];

      const data = initializeFormData(fields);
      expect(data.description).toBe('');
    });
  });

  describe('integration with real capability metadata', () => {
    it('should generate complete form configuration for VM creation', () => {
      const vmCapability: CapabilityParameter[] = [
        {
          name: 'vmid',
          type: 'number',
          required: true,
          description: 'Unique VM identifier',
          validation: { min: 100, max: 999999999 },
        },
        {
          name: 'name',
          type: 'string',
          required: true,
          description: 'VM name',
        },
        {
          name: 'node',
          type: 'string',
          required: true,
          description: 'Proxmox node',
        },
        {
          name: 'cores',
          type: 'number',
          required: false,
          default: 1,
          validation: { min: 1, max: 128 },
        },
        {
          name: 'memory',
          type: 'number',
          required: false,
          default: 512,
          validation: { min: 512, max: 524288 },
        },
      ];

      const fields = generateFormFields(vmCapability);
      const rules = generateValidationRules(fields);
      const initialData = initializeFormData(fields);

      // Verify complete workflow
      expect(fields).toHaveLength(5);
      expect(Object.keys(rules)).toHaveLength(5);
      expect(Object.keys(initialData)).toHaveLength(5);

      // Verify required fields
      expect(fields.filter(f => f.required)).toHaveLength(3);

      // Verify default values are set
      expect(initialData.cores).toBe(1);
      expect(initialData.memory).toBe(512);
    });
  });
});
