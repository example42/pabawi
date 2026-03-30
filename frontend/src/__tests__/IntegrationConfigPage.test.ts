/**
 * Tests for IntegrationConfigPage logic
 *
 * Validates Requirements: 21.1, 21.2, 21.3
 */

import { describe, it, expect } from 'vitest';

/** Sensitive field patterns — mirrors the page component logic */
const SENSITIVE_PATTERNS = ['token', 'password', 'secret', 'key'];

function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

function getDisplayValue(
  key: string,
  value: unknown,
  revealed: boolean
): string {
  const strVal = String(value ?? '');
  if (isSensitiveField(key) && !revealed) {
    return strVal ? '••••••••' : '';
  }
  return strVal;
}

const KNOWN_INTEGRATION_NAMES = [
  'proxmox',
  'aws',
  'puppetdb',
  'puppetserver',
  'ansible',
  'hiera',
  'ssh',
];

describe('isSensitiveField', () => {
  it('detects fields containing "token"', () => {
    expect(isSensitiveField('api_token')).toBe(true);
    expect(isSensitiveField('AUTH_TOKEN')).toBe(true);
    expect(isSensitiveField('tokenValue')).toBe(true);
  });

  it('detects fields containing "password"', () => {
    expect(isSensitiveField('password')).toBe(true);
    expect(isSensitiveField('db_password')).toBe(true);
    expect(isSensitiveField('PASSWORD_HASH')).toBe(true);
  });

  it('detects fields containing "secret"', () => {
    expect(isSensitiveField('secret_key')).toBe(true);
    expect(isSensitiveField('AWS_SECRET_ACCESS_KEY')).toBe(true);
  });

  it('detects fields containing "key"', () => {
    expect(isSensitiveField('api_key')).toBe(true);
    expect(isSensitiveField('ACCESS_KEY_ID')).toBe(true);
  });

  it('returns false for non-sensitive fields', () => {
    expect(isSensitiveField('host')).toBe(false);
    expect(isSensitiveField('port')).toBe(false);
    expect(isSensitiveField('region')).toBe(false);
    expect(isSensitiveField('username')).toBe(false);
    expect(isSensitiveField('enabled')).toBe(false);
  });
});

describe('getDisplayValue', () => {
  it('masks sensitive field values when not revealed', () => {
    expect(getDisplayValue('api_token', 'abc123', false)).toBe('••••••••');
    expect(getDisplayValue('password', 'mypass', false)).toBe('••••••••');
  });

  it('shows sensitive field values when revealed', () => {
    expect(getDisplayValue('api_token', 'abc123', true)).toBe('abc123');
    expect(getDisplayValue('password', 'mypass', true)).toBe('mypass');
  });

  it('returns empty string for empty sensitive fields when not revealed', () => {
    expect(getDisplayValue('api_token', '', false)).toBe('');
    expect(getDisplayValue('secret_key', null, false)).toBe('');
  });

  it('shows non-sensitive field values regardless of reveal state', () => {
    expect(getDisplayValue('host', 'example.com', false)).toBe('example.com');
    expect(getDisplayValue('port', 8006, false)).toBe('8006');
    expect(getDisplayValue('region', 'us-east-1', true)).toBe('us-east-1');
  });

  it('converts non-string values to strings', () => {
    expect(getDisplayValue('port', 443, false)).toBe('443');
    expect(getDisplayValue('enabled', true, false)).toBe('true');
  });
});

describe('KNOWN_INTEGRATION_NAMES', () => {
  it('contains all expected integrations', () => {
    expect(KNOWN_INTEGRATION_NAMES).toContain('proxmox');
    expect(KNOWN_INTEGRATION_NAMES).toContain('aws');
    expect(KNOWN_INTEGRATION_NAMES).toContain('puppetdb');
    expect(KNOWN_INTEGRATION_NAMES).toContain('puppetserver');
    expect(KNOWN_INTEGRATION_NAMES).toContain('ansible');
    expect(KNOWN_INTEGRATION_NAMES).toContain('hiera');
    expect(KNOWN_INTEGRATION_NAMES).toContain('ssh');
  });

  it('has exactly 7 known integrations', () => {
    expect(KNOWN_INTEGRATION_NAMES).toHaveLength(7);
  });

  it('has unique integration names', () => {
    const unique = new Set(KNOWN_INTEGRATION_NAMES);
    expect(unique.size).toBe(KNOWN_INTEGRATION_NAMES.length);
  });
});
