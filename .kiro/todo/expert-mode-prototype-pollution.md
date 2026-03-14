# Expert Mode Prototype Pollution Vulnerability

## Issue

Property-based test failure in `test/properties/expert-mode/property-6.test.ts` reveals a security vulnerability in the expert mode's metadata handling.

## Details

- **Test**: Property 6: Debug Info Completeness
- **Failure**: Metadata handling doesn't sanitize dangerous property names
- **Counterexample**: `["     ","          ",0,[["__proto__",0],["",{}]]]`
- **Risk**: Prototype pollution vulnerability when adding metadata with keys like `__proto__`, `constructor`, or `prototype`

## Recommendation

Implement property name sanitization in `ExpertModeService.addMetadata()` to reject or sanitize dangerous property names:

```typescript
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

addMetadata(debugInfo: DebugInfo, key: string, value: unknown): void {
  if (DANGEROUS_KEYS.includes(key)) {
    // Either reject or sanitize
    return;
  }
  debugInfo.metadata[key] = value;
}
```

## Priority

Medium - Security issue but not actively exploited in current usage

## Related

- Expert mode feature
- Not related to Proxmox Frontend UI spec
