import { TextDecoder } from 'node:util';
import { BerReader } from 'ldapts';

export type ParsedLdapDn = readonly (readonly string[])[];
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const attribute = /^(?:[a-zA-Z][a-zA-Z0-9-]*|(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))+)$/;
const hexPair = /^[0-9a-f]{2}$/i;
const escaped = new Set([' ', '"', '#', '+', ',', ';', '<', '=', '>', '\\']);

function invalid(): never { throw new SyntaxError('Invalid LDAP distinguished name'); }

/** RFC 4514 syntax. Values stay exact because schema-specific matching belongs to the directory. */
export function parseLdapDn(input: string): ParsedLdapDn {
  if (Buffer.byteLength(input) > 8192) invalid();
  if (!input) return [];
  const rdns: string[][] = [];
  let offset = 0;
  while (offset < input.length) {
    const assertions: string[] = [];
    for (;;) {
      const start = offset;
      while (offset < input.length && !['=', ',', '+'].includes(input[offset])) offset++;
      const name = input.slice(start, offset);
      if (!attribute.test(name) || input[offset++] !== '=') invalid();
      let value: string;
      if (input[offset] === '#') {
        const begin = ++offset;
        while (offset < input.length && ![',', '+'].includes(input[offset])) offset++;
        const hex = input.slice(begin, offset);
        if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) invalid();
        const bytes = Buffer.from(hex, 'hex');
        // Preserve opaque BER bytes; never guess an unknown attribute's value syntax.
        const tag = bytes[0];
        if (tag === 0 || tag % 32 === 31) invalid();
        try {
          const reader = new BerReader(bytes);
          if (reader.readString(tag, true) === null || reader.remain !== 0) invalid();
        } catch { invalid(); }
        value = JSON.stringify(['ber', bytes.toString('hex')]);
      } else {
        const bytes: number[] = [];
        let first = true;
        let unescapedTrailingSpace = false;
        while (offset < input.length && ![',', '+'].includes(input[offset])) {
          const character = input[offset++];
          if (character === '\\') {
            const pair = input.slice(offset, offset + 2);
            if (hexPair.test(pair)) {
              bytes.push(Number.parseInt(pair, 16));
              offset += 2;
            } else {
              const literal = input[offset++];
              if (!escaped.has(literal)) invalid();
              bytes.push(literal.charCodeAt(0));
            }
            unescapedTrailingSpace = false;
          } else {
            if ('"<>;'.includes(character) || character === '\0' || (first && (character === ' ' || character === '#'))) invalid();
            const code = input.codePointAt(offset - 1) ?? invalid();
            if (code >= 0xd800 && code <= 0xdfff) invalid();
            const literal = String.fromCodePoint(code);
            if (literal.length === 2) offset++;
            bytes.push(...Buffer.from(literal));
            unescapedTrailingSpace = character === ' ';
          }
          first = false;
        }
        if (unescapedTrailingSpace) invalid();
        try { value = JSON.stringify(['text', utf8.decode(Buffer.from(bytes))]); }
        catch { invalid(); }
      }
      const assertion = JSON.stringify([name.toLowerCase(), value]);
      if (assertions.includes(assertion)) invalid();
      assertions.push(assertion);
      if (input[offset] !== '+') break;
      offset++;
    }
    rdns.push(assertions.sort());
    if (offset === input.length) break;
    if (input[offset++] !== ',' || offset === input.length) invalid();
  }
  return rdns;
}

export function ldapDnEquals(left: string, right: string): boolean {
  return JSON.stringify(parseLdapDn(left)) === JSON.stringify(parseLdapDn(right));
}

export function ldapDnWithinScope(dn: string, base: string): boolean {
  const entry = parseLdapDn(dn);
  const scope = parseLdapDn(base);
  return entry.length > 0 && scope.length > 0 && entry.length >= scope.length &&
    JSON.stringify(entry.slice(entry.length - scope.length)) === JSON.stringify(scope);
}
