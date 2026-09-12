// Pure diagnostic policy shared with the browser. Never apply to operational payloads.
export const REDACTED = '[REDACTED]';
const MAX_STRING = 16 * 1024;
const sensitiveKey = /password|passwd|passphrase|token|secret|api[-_]?key|private[-_]?key|authorization|authentication|credential|cookie|session|environmentvariables|commandline/i;

export function redactText(text: string): string {
  if (text.length > MAX_STRING) return '[OMITTED: oversized diagnostic text]';
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, REDACTED)
    .replace(/\b(?:Bearer|Basic)\s+[^\r\n"'<>]+/gi, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(/([?&#])([^=&#\s]+)=([^&#\s]*)/g, (match, separator: string, key: string) => {
      let decoded = key;
      try { decoded = decodeURIComponent(key); } catch { /* Check undecodable keys literally. */ }
      return sensitiveKey.test(decoded) || /^(?:code|state|ticket)$/i.test(decoded) ? `${separator}${key}=${REDACTED}` : match;
    })
    .replace(/((?:[\w.-]*(?:password|passwd|passphrase|token|secret|api[-_]?key|private[-_]?key|authorization|authentication|credential|cookie)[\w.-]*)["']?\s*[:=]\s*)(?:\[REDACTED\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/gi, `$1${REDACTED}`);
}

export function redactDiagnostics<T>(value: T, textBudget = 64 * 1024): T {
  const seen = new WeakSet();
  let remaining = 2000;
  function visit(input: unknown, depth: number): unknown {
    if (--remaining < 0 || depth > 12) return '[OMITTED: diagnostic limit]';
    if (typeof input === 'string') {
      textBudget -= input.length;
      if (textBudget < 0) return '[OMITTED: diagnostic text budget]';
      if (input.length > MAX_STRING) return '[OMITTED: oversized diagnostic text]';
      const trimmed = input.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return JSON.stringify(visit(JSON.parse(input) as unknown, depth + 1)); } catch { /* Treat non-JSON as text. */ }
      }
      return redactText(input);
    }
    if (input === null || typeof input !== 'object') return typeof input === 'bigint' ? String(input) : input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input);
    try {
      if (input instanceof Error) return visit({ name: input.name, message: input.message, stack: input.stack }, depth + 1);
      if (Array.isArray(input)) return input.slice(0, 100).map(item => visit(item, depth + 1));
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(input).slice(0, 100)) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        Object.defineProperty(result, redactText(key.slice(0, 256)), { enumerable: true, configurable: true, writable: true,
          value: sensitiveKey.test(key) ? REDACTED : descriptor && 'value' in descriptor ? visit(descriptor.value, depth + 1) : '[OMITTED: accessor]' });
      }
      return result;
    } finally { seen.delete(input); }
  }
  return visit(value, 0) as T;
}
