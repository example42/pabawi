import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const fingerprintMap = z.record(z.array(z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/)).min(1));

export function verifyHostKey(path: string | undefined, hostname: string, port: number, key: Buffer): boolean {
  if (!path) return false;
  const pins = fingerprintMap.parse(JSON.parse(readFileSync(path, 'utf8')));
  const endpoint = `[${hostname.toLowerCase()}]:${String(port)}`;
  const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
  return Object.hasOwn(pins, endpoint) && pins[endpoint].includes(fingerprint);
}
