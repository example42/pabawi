import type { Entry } from 'ldapts';
import { LdapDirectoryError } from './LdapDirectoryError';

export const adPolicyAttributes = [
  'userAccountControl', 'msDS-User-Account-Control-Computed',
  'accountExpires', 'pwdLastSet', 'msDS-UserPasswordExpiryTimeComputed',
];

export function attributeValues(entry: Entry, name: string): (string | Buffer)[] {
  const key = Object.keys(entry).find(key => key.toLowerCase() === name.toLowerCase());
  if (!key) return [];
  const value = entry[key];
  return Array.isArray(value) ? value : [value];
}

export function textAttribute(entry: Entry, name: string, required = false): string | null {
  const values = attributeValues(entry, name);
  if (values.length === 0 && !required) return null;
  if (values.length !== 1 || typeof values[0] !== 'string' || !values[0]) {
    throw new LdapDirectoryError('POLICY_UNREADABLE');
  }
  return values[0];
}

export function checkAdEligibility(entry: Entry, now = Date.now()): void {
  const number = (name: string): bigint => {
    const text = textAttribute(entry, name, true);
    if (!text || !/^\d+$/.test(text)) throw new LdapDirectoryError('POLICY_UNREADABLE');
    const value = BigInt(text);
    if (value > 9223372036854775807n) throw new LdapDirectoryError('POLICY_UNREADABLE');
    return value;
  };
  const uac = number('userAccountControl');
  const computed = number('msDS-User-Account-Control-Computed');
  const expires = number('accountExpires');
  const passwordSet = number('pwdLastSet');
  const passwordExpiry = number('msDS-UserPasswordExpiryTimeComputed');
  const filetime = (BigInt(now) + 11644473600000n) * 10000n;
  const expired = (value: bigint): boolean => value !== 0n && value !== 9223372036854775807n && value <= filetime;
  if ((uac & 2n) !== 0n || (computed & (16n | 8388608n)) !== 0n ||
      expired(expires) || passwordSet === 0n || passwordExpiry === 0n || expired(passwordExpiry)) {
    throw new LdapDirectoryError('INELIGIBLE');
  }
}
