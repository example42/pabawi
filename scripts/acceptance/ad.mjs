import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { adCases, localSecret, readAdConfig } from './ad-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const output = resolve(option('--output-root') ?? tmpdir());
mkdirSync(output, { recursive: true, mode: 0o700 });
const evidence = mkdtempSync(resolve(output, 'pabawi-ad-acceptance-'));
const report = { status: 'unavailable', stage: 'configuration', adVerified: false, reason: 'AD configuration absent; no directory accessed',
  cases: adCases.map(name => ({ name, status: 'not-run' })) };
try {
  if (option('--config')) {
    const config = readAdConfig(option('--config'));
    const { register } = await import('tsx/esm/api');
    register();
    const { validateAdBoundary, validateAdSettings, runAdLab } = await import('../../backend/test/fixtures/ldap/ad-lab.ts');
    validateAdBoundary(config);
    // Validate file references without writing their values or directory configuration to evidence.
    const secrets = Object.fromEntries(['fixture', 'lookup', 'user'].map(name =>
      [name + 'Password', localSecret(config[name + 'PasswordFile'], root)]));
    const { X509Certificate } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    new X509Certificate(readFileSync(config.caFile));
    validateAdSettings(config, secrets.lookupPassword);
    report.stage = 'offline-validation';
    report.status = 'not-run';
    report.reason = 'Configuration validated offline; execution requires --execute';
    if (args.includes('--execute')) {
      report.stage = 'directory-acceptance';
      await runAdLab(config, report, evidence, secrets);
    }
  }
} catch {
  report.status = 'failed';
  report.adVerified = false;
  report.reason = 'AD harness failed; inspect case and cleanup status. Raw directory errors are intentionally omitted.';
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ ...report, evidence }) + '\n');
}
if (report.status !== 'passed') process.exitCode = 1;
