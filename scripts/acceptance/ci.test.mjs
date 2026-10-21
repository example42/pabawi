import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

test('CI runs the owned runner on PostgreSQL 15/17 and retains synthetic results on every outcome', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const job = workflow.jobs['ldap-acceptance'];
  assert.deepEqual(job.strategy.matrix.postgres, ['15', '17']);
  assert.equal(job.strategy['fail-fast'], false);
  const run = job.steps.find(step => step.run?.includes('npm run test:ldap --'));
  for (const option of ['--focused', '--browser', '--build-fixture', '--postgres-image postgres:${{ matrix.postgres }}', '--postgres-major ${{ matrix.postgres }}']) {
    assert(run.run.includes(option), 'Missing live LDAP job requirement: ' + option);
  }
  const commands = job.steps.map(step => step.run ?? '').join('\n');
  assert(commands.includes('npm ci --ignore-scripts'));
  assert(commands.includes('npm run install:approved'));
  assert(commands.includes('scripts/acceptance/*.test.mjs'));
  assert(!commands.includes('--execute'));
  const upload = job.steps.find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert(!upload.with['include-hidden-files']);
  assert(upload.with.path.includes('!${{ runner.temp }}/ldap-evidence/**/*.key'));
  assert(!upload.with.path.includes('pabawi-ad-acceptance'));
});
