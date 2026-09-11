import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const runner = resolve('scripts/supply-chain/install-approved.mjs');
function fixture(packages, policy) {
  const root = mkdtempSync(join(tmpdir(), 'pabawi-script-policy-'));
  const lock = { packages: {} };
  writeFileSync(join(root, 'package.json'), JSON.stringify({ lavamoat: { allowScripts: policy } }));
  for (const [location, name, scripts, binding = false] of packages) {
    const dir = join(root, location);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', scripts }));
    if (binding) writeFileSync(join(dir, 'binding.gyp'), '{}');
    lock.packages[location] = { version: '1.0.0' };
  }
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  return root;
}
const mark = (file) => `node -e "require('fs').appendFileSync('${file}', 'x')"`;
const run = (cwd) => spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' });

test('runs approved hoisted, nested and workspace scripts once; denies explicit false', () => {
  const root = fixture([
    ['node_modules/native', 'native', { preinstall: mark('pre'), install: mark('installed'), postinstall: mark('post') }],
    ['backend/node_modules/native', 'native', { install: mark('installed') }],
    ['node_modules/tool/node_modules/native', 'native', { install: mark('installed') }],
    ['node_modules/blocked', 'blocked', { install: mark('executed') }],
  ], { native: true, blocked: false });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  for (const path of ['node_modules/native', 'backend/node_modules/native', 'node_modules/tool/node_modules/native']) {
    assert.ok(existsSync(join(root, path, 'installed')));
  }
  assert.equal(existsSync(join(root, 'node_modules/blocked/executed')), false);
  for (const event of ['pre', 'installed', 'post']) {
    assert.equal(readFileSync(join(root, 'node_modules/native', event), 'utf8'), 'x');
  }
});

test('unknown nested scripts fail before any approved script executes', () => {
  const root = fixture([
    ['node_modules/native', 'native', { install: mark('executed') }],
    ['backend/node_modules/tool/node_modules/new-package', 'new-package', { postinstall: mark('executed') }],
  ], { native: true });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unreviewed dependency scripts/);
  assert.equal(existsSync(join(root, 'node_modules/native/executed')), false);
});

test('implicit node-gyp builds also require review', () => {
  const root = fixture([['node_modules/native', 'native', {}, true]], {});
  assert.match(run(root).stderr, /Unreviewed dependency scripts/);
});

test('approved script failure fails the installation', () => {
  const root = fixture([['node_modules/native', 'native', { install: 'node -e "process.exit(42)"' }]], { native: true });
  assert.match(run(root).stderr, /Approved script failed/);
});
