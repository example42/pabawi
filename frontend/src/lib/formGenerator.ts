/**
 * Dynamic form generation utilities for provisioning integrations
 *
 * Validates Requirements: 13.1, 13.4
 *
 * This module provides utilities to generate form field configurations
 * dynamically from integration capability metadata, enabling extensibility
 * for future integrations without frontend code changes.
 */

import type { CapabilityParameter } from './types/provisioning';
import type { ValidationRule } from './validation';

/**
 * Form field configuration generated from capability metadata
 */
export interface FormFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'textarea' | 'select';
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  placeholder?: string;
  options?: string[]; // For select fields with enum validation
  validation: ValidationRule;
}

/**
 * Maps capability parameter type to HTML input type
 *
 * @param paramType - The capability parameter type
 * @returns Corresponding HTML input type
 */
function mapParameterTypeToInputType(
  paramType: CapabilityParameter['type']
): FormFieldConfig['type'] {
  switch (paramType) {
    case 'string':
      return 'text';
    case 'number':
      return 'number';
    case 'boolean':
      return 'checkbox';
    case 'array':
    case 'object':
      return 'textarea'; // JSON input for complex types
    default:
      return 'text';
  }
}

/**
 * Converts parameter name to human-readable label
 *
 * @param name - Parameter name (e.g., "vmid", "ostemplate")
 * @returns Human-readable label (e.g., "VM ID", "OS Template")
 */
function generateLabel(name: string): string {
  // Handle common abbreviations
  const abbreviations: Record<string, string> = {
    'vmid': 'VM ID',
    'vm': 'VM',
    'lxc': 'LXC',
    'os': 'OS',
    'cpu': 'CPU',
    'id': 'ID',
    'ip': 'IP',
    'url': 'URL',
    'api': 'API',
  };

  // Split on camelCase or snake_case
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ');

  // Capitalize each word, using abbreviation map if available
  return words
    .map(word => abbreviations[word] || word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generates a validation rule from capability parameter metadata
 *
 * @param param - The capability parameter
 * @returns Validation rule for the parameter
 */
function generateValidationRule(param: CapabilityParameter): ValidationRule {
  const rule: ValidationRule = {
    label: generateLabel(param.name),
    required: param.required,
    type: param.type === 'string' ? 'string' : param.type === 'number' ? 'number' : undefined,
  };

  // Apply validation constraints if present
  if (param.validation) {
    if (param.validation.min !== undefined) {
      rule.min = param.validation.min;
    }
    if (param.validation.max !== undefined) {
      rule.max = param.validation.max;
    }
    if (param.validation.pattern) {
      rule.pattern = new RegExp(param.validation.pattern);
      rule.patternMessage = `${rule.label} format is invalid`;
    }
  }

  // String length constraints for text fields
  if (param.type === 'string') {
    // Set reasonable defaults if not specified
    rule.minLength = param.validation?.min;
    rule.maxLength = param.validation?.max;
  }

  return rule;
}

/**
 * Generates placeholder text for a form field
 *
 * @param param - The capability parameter
 * @returns Placeholder text
 */
function generatePlaceholder(param: CapabilityParameter): string | undefined {
  if (param.description) {
    return param.description;
  }

  // Generate helpful placeholders based on parameter name
  const placeholders: Record<string, string> = {
    'vmid': 'e.g., 100',
    'name': 'e.g., my-vm',
    'hostname': 'e.g., my-container',
    'node': 'e.g., pve',
    'cores': 'e.g., 2',
    'memory': 'e.g., 2048',
    'ostemplate': 'e.g., local:vztmpl/ubuntu-20.04-standard_20.04-1_amd64.tar.gz',
  };

  return placeholders[param.name.toLowerCase()];
}

/**
 * Generates form field configurations from capability parameters
 *
 * **Validates: Requirements 13.1, 13.4**
 *
 * This function creates form field configurations dynamically from integration
 * capability metadata, enabling the frontend to support new integrations without
 * code changes.
 *
 * @param parameters - Array of capability parameters from integration metadata
 * @returns Array of form field configurations ready for rendering
 *
 * @example
 * ```typescript
 * const capability = {
 *   name: 'create_vm',
 *   parameters: [
 *     { name: 'vmid', type: 'number', required: true, validation: { min: 100, max: 999999999 } },
 *     { name: 'name', type: 'string', required: true },
 *     { name: 'cores', type: 'number', required: false, default: 1 }
 *   ]
 * };
 *
 * const fields = generateFormFields(capability.parameters);
 * // Returns:
 * // [
 * //   { name: 'vmid', label: 'VM ID', type: 'number', required: true, ... },
 * //   { name: 'name', label: 'Name', type: 'text', required: true, ... },
 * //   { name: 'cores', label: 'Cores', type: 'number', required: false, defaultValue: 1, ... }
 * // ]
 * ```
 */
export function generateFormFields(parameters: CapabilityParameter[]): FormFieldConfig[] {
  return parameters.map(param => {
    const inputType = mapParameterTypeToInputType(param.type);
    const label = generateLabel(param.name);
    const validation = generateValidationRule(param);
    const placeholder = generatePlaceholder(param);

    // Handle enum validation (select fields)
    const options = param.validation?.enum;
    const fieldType = options && options.length > 0 ? 'select' : inputType;

    const field: FormFieldConfig = {
      name: param.name,
      label,
      type: fieldType,
      required: param.required,
      description: param.description,
      defaultValue: param.default,
      placeholder,
      validation,
    };

    // Add options for select fields
    if (options) {
      field.options = options;
    }

    return field;
  });
}

/**
 * Generates validation rules object from form field configurations
 *
 * This is a convenience function to extract validation rules from
 * generated form fields for use with the validateForm utility.
 *
 * @param fields - Array of form field configurations
 * @returns Validation rules object keyed by field name
 *
 * @example
 * ```typescript
 * const fields = generateFormFields(parameters);
 * const rules = generateValidationRules(fields);
 * const result = validateForm(formData, rules);
 * ```
 */
export function generateValidationRules(
  fields: FormFieldConfig[]
): Record<string, ValidationRule> {
  const rules: Record<string, ValidationRule> = {};

  for (const field of fields) {
    rules[field.name] = field.validation;
  }

  return rules;
}

/**
 * Initializes form data with default values from field configurations
 *
 * @param fields - Array of form field configurations
 * @returns Initial form data object with default values
 *
 * @example
 * ```typescript
 * const fields = generateFormFields(parameters);
 * const initialData = initializeFormData(fields);
 * // Returns: { vmid: undefined, name: '', cores: 1, ... }
 * ```
 */
export function initializeFormData(
  fields: FormFieldConfig[]
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      data[field.name] = field.defaultValue;
    } else if (field.type === 'checkbox') {
      data[field.name] = false;
    } else if (field.type === 'number') {
      data[field.name] = undefined;
    } else {
      data[field.name] = '';
    }
  }

  return data;
}
