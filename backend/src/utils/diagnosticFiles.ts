import fs from 'node:fs';
import path from 'node:path';
import { redactDiagnostics } from '../shared/diagnosticRedaction';

export const DIAGNOSTIC_LIMITS = { fileBytes: 2 * 1024 * 1024, totalBytes: 10 * 1024 * 1024, files: 20, ageMs: 7 * 86400 * 1000 };
const ownedName = /^(?:crash|report)-[\w.-]+\.json$/;

export function retainedDiagnosticFiles(dir: string, now = Date.now()): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(name => ownedName.test(name)).flatMap(name => {
    const stat = fs.lstatSync(path.join(dir, name));
    return stat.isFile() ? [{ name, stat }] : [];
  }).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  let bytes = 0;
  const retained: string[] = [];
  for (const { name, stat } of files) {
    if (now - stat.mtimeMs > DIAGNOSTIC_LIMITS.ageMs || stat.size > DIAGNOSTIC_LIMITS.fileBytes
      || retained.length >= DIAGNOSTIC_LIMITS.files || bytes + stat.size > DIAGNOSTIC_LIMITS.totalBytes) {
      fs.unlinkSync(path.join(dir, name));
    } else {
      bytes += stat.size;
      retained.push(name);
    }
  }
  return retained;
}

export function readDiagnosticFile(dir: string, filename: string): unknown {
  const descriptor = fs.openSync(path.join(dir, filename), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > DIAGNOSTIC_LIMITS.fileBytes) return { omitted: 'Diagnostic size limit' };
    const buffer = Buffer.alloc(DIAGNOSTIC_LIMITS.fileBytes + 1);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (length > DIAGNOSTIC_LIMITS.fileBytes) return { omitted: 'Diagnostic size limit' };
    try { return redactDiagnostics(JSON.parse(buffer.toString('utf8', 0, length)) as unknown); }
    catch { return { omitted: 'Invalid diagnostic JSON' }; }
  } finally { fs.closeSync(descriptor); }
}

export function writeDiagnosticFile(dir: string, filename: string, data: unknown): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const serialized = JSON.stringify(redactDiagnostics(data), null, 2);
  fs.writeFileSync(path.join(dir, filename), Buffer.byteLength(serialized) <= DIAGNOSTIC_LIMITS.fileBytes
    ? serialized : JSON.stringify({ omitted: 'Diagnostic size limit' }), { mode: 0o600, flag: 'wx' });
  retainedDiagnosticFiles(dir);
}
