import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ldapDnEquals, ldapDnWithinScope, parseLdapDn } from '../../src/config/ldapDn';

describe('project-owned RFC 4514 DN parsing and conservative comparison', () => {
  it('recognizes root, OIDs, empty values and unordered multi-valued RDNs', () => {
    expect(parseLdapDn('')).toEqual([]);
    expect(parseLdapDn('cn=,dc=example')).toHaveLength(2);
    expect(parseLdapDn('1.2.840.113556.1.4.656=opaque')).toHaveLength(1);
    expect(ldapDnEquals('CN=Alice+uid=a,dc=example', 'UID=a+cn=Alice,DC=example')).toBe(true);
    expect(ldapDnEquals('cn=Alice,dc=example', 'cn=alice,dc=example')).toBe(false);
    expect(ldapDnEquals('cn=Alice,dc=example', 'cn=Alice,dc=Example')).toBe(false);
    expect(ldapDnEquals('cn=Alice+uid=a,dc=example', 'cn=Alice,dc=example')).toBe(false);
  });

  it('decodes escaped UTF-8 bytes and separators without losing value boundaries', () => {
    expect(ldapDnEquals(String.raw`cn=Jos\c3\a9\, Admin,dc=example`, String.raw`cn=José\2c Admin,dc=example`)).toBe(true);
    expect(ldapDnEquals(String.raw`cn=\ Alice\ ,dc=example`, String.raw`cn=\20Alice\20,dc=example`)).toBe(true);
    expect(ldapDnEquals(String.raw`cn=\#a\+b\=c\\d,dc=example`, String.raw`cn=\23a\2bb=c\5cd,dc=example`)).toBe(true);
    expect(ldapDnEquals(String.raw`cn=a\00b,dc=example`, String.raw`cn=a\00b,dc=example`)).toBe(true);
    expect(ldapDnEquals('cn=😀,dc=example', String.raw`cn=\f0\9f\98\80,dc=example`)).toBe(true);
    expect(ldapDnEquals('cn=\ufeffa', 'cn=a')).toBe(false);
    expect(ldapDnEquals(String.raw`cn=a\2cb,dc=example`, 'cn=a,cn=b,dc=example')).toBe(false);
  });

  it('preserves complete BER hex values without equating opaque bytes to text', () => {
    expect(ldapDnEquals('1.2.3=#0402ABCD', '1.2.3=#0402abcd')).toBe(true);
    expect(ldapDnEquals('cn=#0c0141', 'cn=A')).toBe(false);
    expect(ldapDnEquals('1.2.3=#040200ff', '1.2.3=#040200fe')).toBe(false);
  });

  it('checks parsed suffixes rather than textual endings or case-folded values', () => {
    expect(ldapDnWithinScope('uid=a,ou=People,dc=example', 'ou=People,dc=example')).toBe(true);
    expect(ldapDnWithinScope('OU=People,DC=example', 'ou=People,dc=example')).toBe(true);
    expect(ldapDnWithinScope('uid=a,ou=people,dc=example', 'ou=People,dc=example')).toBe(false);
    expect(ldapDnWithinScope(String.raw`cn=outside\,ou=People,dc=example`, 'ou=People,dc=example')).toBe(false);
    expect(ldapDnWithinScope('uid=a,dc=notexample', 'dc=example')).toBe(false);
    expect(ldapDnWithinScope('', 'dc=example')).toBe(false);
    expect(ldapDnWithinScope('dc=example', '')).toBe(false);
  });

  it.each(['bad', 'cn', '=a', 'cn=a,', 'cn=a+', 'cn=a,,dc=x', 'cn=a++uid=b', 'cn= a', 'cn=a ',
    'cn="a"', 'cn=a;b', 'cn=a<b', 'cn=a>b', 'cn=a\0b', 'cn=\ud800', 'cn=\udc00',
    'cn=a' + String.fromCharCode(92), String.raw`cn=\q`, String.raw`cn=\c3\28`, String.raw`cn=\ff`,
    'cn=#', 'cn=#1', 'cn=#zz', 'cn=#04', 'cn=#0402ff', 'cn=#0400ffff', 'cn=#04800000', 'cn=#0000',
    'cn=a+CN=a', '01.2=a', '1..2=a', 'cn;binary=a'])('rejects malformed or ambiguous input %j', value => {
    expect(() => parseLdapDn(value)).toThrow(SyntaxError);
  });

  it('bounds input size and preserves randomly generated UTF-8 values across octet escaping', () => {
    expect(() => parseLdapDn('cn=' + 'x'.repeat(8192))).toThrow();
    fc.assert(fc.property(fc.array(fc.integer({ min: 0x21, max: 0x10ffff })
      .filter(code => code < 0xd800 || code > 0xdfff), { minLength: 1, maxLength: 20 }), codes => {
      const value = String.fromCodePoint(...codes);
      const encoded = [...Buffer.from(value)].map(byte => '\\' + byte.toString(16).padStart(2, '0')).join('');
      const literal = [...value].map(character => ['#', '"', '+', ',', ';', '<', '=', '>', String.fromCharCode(92)].includes(character) ? String.fromCharCode(92) + character : character).join('');
      expect(ldapDnEquals('cn=' + encoded, 'CN=' + literal)).toBe(true);
      expect(ldapDnWithinScope('uid=a,cn=' + encoded, 'cn=' + encoded)).toBe(true);
    }), { numRuns: 200 });
  });
});
