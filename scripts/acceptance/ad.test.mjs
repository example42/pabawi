import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { rootCertificates } from 'node:tls';
import { validateAdConfig, localSecret } from './ad-config.mjs';
const example = JSON.parse(readFileSync('backend/test/fixtures/ldap/ad-lab.example.json', 'utf8'));

test('AD configuration requires bounded explicit lab settings and secret references', () => {
  assert.equal(validateAdConfig(example), example);
  for (const changes of [{ implementation: 'samba' }, { disposableLab: false }, { password: 'inline' }, // pragma: allowlist secret
    { largeMemberCount: 1500 }, { largeMemberCount: 3001 }, { maxLockoutAttempts: 100 },
    { fixturePasswordFile: 'relative' }, // pragma: allowlist secret
    { controllers: [example.controllers[0], example.controllers[0]] }]) {
    assert.throws(() => validateAdConfig({ ...example, ...changes }));
  }
});
test('AD secrets refuse repository files, symlink escapes and broad permissions', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'pabawi-ad-secret-test-'));
  const path = resolve(dir, 'secret');
  writeFileSync(path, 'synthetic-local-fixture\n', { mode: 0o600 });
  assert.equal(localSecret(path, process.cwd()), 'synthetic-local-fixture');
  chmodSync(path, 0o644);
  assert.throws(() => localSecret(path, process.cwd()));
  symlinkSync(resolve('package.json'), resolve(dir, 'repo-link'));
  assert.throws(() => localSecret(resolve(dir, 'repo-link'), process.cwd()));
});
test('absent AD configuration yields explicit unavailable/not-run evidence with nonzero status', () => {
  const run = spawnSync(process.execPath, ['scripts/acceptance/ad.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.adVerified, false);
  assert.equal(result.cases.length, 6);
  assert(result.cases.every(item => item.status === 'not-run'));
  assert.equal(JSON.parse(readFileSync(resolve(result.evidence, 'result.json'))).status, 'unavailable');
});

test('valid private AD configuration is validated offline without asserting interoperability', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'pabawi-ad-offline-'));
  const config = { ...example };
  for (const key of ['fixturePasswordFile', 'lookupPasswordFile', 'userPasswordFile']) {
    config[key] = resolve(dir, key);
    writeFileSync(config[key], 'OfflineFixture123!', { mode: 0o600 }); // pragma: allowlist secret
  }
  config.caFile = resolve(dir, 'ca.pem');
  writeFileSync(config.caFile, rootCertificates[0]);
  const file = resolve(dir, 'lab.json'); writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  const run = spawnSync(process.execPath, ['scripts/acceptance/ad.mjs', '--config', file, '--output-root', dir], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, 'not-run', run.stdout);
  assert.equal(result.adVerified, false);
  assert(result.cases.every(item => item.status === 'not-run'));
  assert(!run.stdout.includes('OfflineFixture123!'));
  assert(!run.stdout.includes(config.parentOu));
});
