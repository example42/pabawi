import {
  AndFilter, ApproximateFilter, EqualityFilter, ExtensibleFilter, FilterParser,
  GreaterThanEqualsFilter, LessThanEqualsFilter, NotFilter, OrFilter, SubstringFilter,
} from 'ldapts';
import type { Filter } from 'ldapts';

export function parseLdapFilter(input: string): Filter {
  let depth = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char.charCodeAt(0) === 0) throw new SyntaxError('Invalid LDAP filter character');
    if (char === '\\') {
      if (!/^[0-9a-f]{2}$/i.test(input.slice(index + 1, index + 3))) throw new SyntaxError('Invalid LDAP filter escape');
      index += 2;
    } else if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth < 0 || (depth === 0 && index !== input.length - 1)) throw new SyntaxError('Invalid LDAP filter structure');
    }
  }
  if (depth !== 0 || !input.startsWith('(') || !input.endsWith(')') || /\([&|!]\)/.test(input)) {
    throw new SyntaxError('Invalid LDAP filter structure');
  }
  // ldapts parses hex escapes as Latin-1 characters. Normalize all input to
  // escaped UTF-8 octets, then restore assertion values before BER serialization.
  const octets = Array.from(input, char => char.charCodeAt(0) <= 127 ? char :
    Array.from(Buffer.from(char), byte => '\\' + byte.toString(16).padStart(2, '0')).join('')).join('');
  const parsed = FilterParser.parseString(octets);
  const text = (value: string): string => new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value, 'latin1'));
  const restore = (filter: Filter): void => {
    if (filter instanceof AndFilter || filter instanceof OrFilter) {
      for (const child of filter.filters) restore(child);
    } else if (filter instanceof NotFilter) restore(filter.filter);
    else if (filter instanceof EqualityFilter) {
      if (typeof filter.value === 'string') filter.value = Buffer.from(filter.value, 'latin1');
    } else if (filter instanceof SubstringFilter) {
      filter.initial = text(filter.initial);
      filter.any = filter.any.map(text);
      filter.final = text(filter.final);
    } else if (filter instanceof ApproximateFilter || filter instanceof GreaterThanEqualsFilter ||
               filter instanceof LessThanEqualsFilter || filter instanceof ExtensibleFilter) {
      filter.value = text(filter.value);
    }
  };
  restore(parsed);
  return parsed;
}
