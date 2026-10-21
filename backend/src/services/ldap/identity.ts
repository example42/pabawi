import { LdapDirectoryError } from './LdapDirectoryError';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canonicalUuid(value: string): string {
  if (!uuid.test(value) || value === '00000000-0000-0000-0000-000000000000') {
    throw new LdapDirectoryError('INVALID_IDENTITY');
  }
  return value.toLowerCase();
}

export function guidToSubject(value: Buffer): string {
  if (value.length !== 16) throw new LdapDirectoryError('INVALID_IDENTITY');
  const bytes = Buffer.from(value);
  bytes.subarray(0, 4).reverse();
  bytes.subarray(4, 6).reverse();
  bytes.subarray(6, 8).reverse();
  const hex = bytes.toString('hex');
  return canonicalUuid([hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'));
}

export function subjectToGuid(value: string): Buffer {
  const bytes = Buffer.from(canonicalUuid(value).replaceAll('-', ''), 'hex');
  bytes.subarray(0, 4).reverse();
  bytes.subarray(4, 6).reverse();
  bytes.subarray(6, 8).reverse();
  return bytes;
}
