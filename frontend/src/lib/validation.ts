/**
 * Validation utilities for Proxmox VM provisioning forms
 *
 * All validation functions return:
 * - null if the value is valid
 * - error message string if validation fails
 */

/**
 * Validates VMID is within Proxmox acceptable range
 * **Validates: Requirements 11.1**
 *
 * @param vmid - The VM ID to validate
 * @returns Error message or null if valid
 */
export function validateVMID(vmid: number): string | null {
  if (!vmid || vmid < 100 || vmid > 999999999) {
    return 'VMID must be between 100 and 999999999';
  }
  return null;
}

/**
 * Validates hostname format according to RFC standards
 * **Validates: Requirements 11.2**
 *
 * @param hostname - The hostname to validate
 * @returns Error message or null if valid
 */
export function validateHostname(hostname: string): string | null {
  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!pattern.test(hostname)) {
    return 'Hostname must contain only lowercase letters, numbers, and hyphens';
  }
  return null;
}

/**
 * Validates memory allocation meets minimum requirements
 * **Validates: Requirements 11.3**
 *
 * @param memory - Memory in MB to validate
 * @returns Error message or null if valid
 */
export function validateMemory(memory: number): string | null {
  if (memory < 512) {
    return 'Memory must be at least 512 MB';
  }
  return null;
}

/**
 * Validates that a required field has a value
 * **Validates: Requirements 11.4**
 *
 * @param value - The value to check
 * @param fieldName - Name of the field for error message
 * @returns Error message or null if valid
 */
export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates a numeric value is within specified range
 * **Validates: Requirements 11.5**
 *
 * @param value - The numeric value to validate
 * @param min - Minimum acceptable value (inclusive)
 * @param max - Maximum acceptable value (inclusive)
 * @param fieldName - Name of the field for error message
 * @returns Error message or null if valid
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): string | null {
  if (value < min || value > max) {
    return `${fieldName} must be between ${String(min)} and ${String(max)}`;
  }
  return null;
}

/**
 * Validates a string matches a specified pattern
 * **Validates: Requirements 11.5**
 *
 * @param value - The string value to validate
 * @param pattern - Regular expression pattern to match
 * @param fieldName - Name of the field for error message
 * @param patternMessage - Optional custom message describing the pattern requirements
 * @returns Error message or null if valid
 */
export function validateStringPattern(
  value: string,
  pattern: RegExp,
  fieldName: string,
  patternMessage?: string
): string | null {
  if (!pattern.test(value)) {
    return patternMessage ?? `${fieldName} format is invalid`;
  }
  return null;
}

/**
 * Generic form validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validation rule for a single field
 */
export interface ValidationRule {
  label: string;
  required?: boolean;
  type?: 'string' | 'number';
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
}

/**
 * Validation rules for a form
 */
export type ValidationRules = Record<string, ValidationRule>;

/**
 * Generic form validation utility
 * **Validates: Requirements 11.1, 11.6**
 *
 * @param data - Form data to validate
 * @param rules - Validation rules for each field
 * @returns ValidationResult with valid flag and errors object
 */
export function validateForm(data: Record<string, unknown>, rules: ValidationRules): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];

    // Required validation
    if (rule.required && (value === null || value === undefined || value === '')) {
      errors[field] = `${rule.label} is required`;
      continue;
    }

    // Type-specific validation (skip if value is null/undefined/empty)
    if (value !== null && value !== undefined && value !== '') {
      if (rule.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors[field] = `${rule.label} must be a number`;
        } else if (rule.min !== undefined && num < rule.min) {
          errors[field] = `${rule.label} must be at least ${String(rule.min)}`;
        } else if (rule.max !== undefined && num > rule.max) {
          errors[field] = `${rule.label} must be at most ${String(rule.max)}`;
        }
      } else if (rule.type === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const str = String(value);
        if (rule.minLength && str.length < rule.minLength) {
          errors[field] = `${rule.label} must be at least ${String(rule.minLength)} characters`;
        } else if (rule.maxLength && str.length > rule.maxLength) {
          errors[field] = `${rule.label} must be at most ${String(rule.maxLength)} characters`;
        } else if (rule.pattern && !rule.pattern.test(str)) {
          errors[field] = rule.patternMessage ?? `${rule.label} format is invalid`;
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
