import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { parseAllDocuments } = require('yaml');
const chart = fileURLToPath(new URL('../../charts/pabawi', import.meta.url));
const jwtSecret = 'chart-test-only-credential-with-sufficient-length';

function render(values = {}, { generatedJwt = false } = {}) {
  const result = spawnSync('helm', ['template', 'rotation-test', chart, '-f', '-'], {
    input: JSON.stringify({ secrets: generatedJwt ? {} : { jwtSecret }, ...values }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const documents = parseAllDocuments(result.stdout);
  for (const document of documents) assert.deepEqual(document.errors, []);
  const resources = documents.map((document) => document.toJSON());
  return {
    raw: result.stdout,
    resources,
    deployment: resources.find((resource) => resource.kind === 'Deployment'),
    secret: resources.find((resource) => resource.kind === 'Secret'),
  };
}

const annotations = (result) => result.deployment.spec.template.metadata.annotations;
const postgres = { type: 'postgres', postgres: { existingSecret: 'preexisting-database' } };

test('same-image configuration and policy updates change only the relevant checksum', () => {
  const initial = render();
  assert.deepEqual(annotations(initial), annotations(render()));
  for (const config of [
    { commandWhitelist: '["uptime"]' },
    { commandWhitelistAllowAll: 'true' },
    { allowDestructiveProvisioning: 'true' },
  ]) {
    const changed = render({ config });
    assert.notEqual(annotations(initial)['checksum/config'], annotations(changed)['checksum/config']);
    assert.equal(annotations(initial)['checksum/secret'], annotations(changed)['checksum/secret']);
    assert.equal(initial.deployment.spec.template.spec.containers[0].image,
      changed.deployment.spec.template.spec.containers[0].image);
  }
});

test('managed JWT, machine, provider and database credentials trigger rollout', () => {
  const initial = render();
  for (const values of [
    { secrets: { jwtSecret: `${jwtSecret}-rotated` } },
    { secrets: { jwtSecret, mcpAuthToken: 'test-machine-token' } },
    { secrets: { jwtSecret, lifecycleToken: 'test-lifecycle-token' } },
    { secretEnv: { AWS_SECRET_ACCESS_KEY: 'test-provider-key' } },
  ]) {
    assert.notEqual(annotations(initial)['checksum/secret'], annotations(render(values))['checksum/secret']);
  }
  const first = render({ database: { type: 'postgres', postgres: { url: 'postgres://test:first@db/test' } } });
  const second = render({ database: { type: 'postgres', postgres: { url: 'postgres://test:second@db/test' } } });
  assert.notEqual(annotations(first)['checksum/secret'], annotations(second)['checksum/secret']);
});

test('generated JWT and checksum use exactly the same rendered Secret', () => {
  const result = render({}, { generatedJwt: true });
  assert.equal(result.secret.stringData.JWT_SECRET.length, 48);
  const source = result.raw.match(/# Source: pabawi\/templates\/secret.yaml\n([\s\S]*?)(?=\n---|$)/)[1];
  const digest = createHash('sha256').update(source).digest('hex');
  assert.equal(annotations(result)['checksum/secret'], digest);
});

test('caller annotations cannot disable managed checksums; external rotation marker is preserved', () => {
  const initial = render();
  const result = render({ podAnnotations: { 'checksum/config': 'ignored', 'checksum/secret': 'ignored', owner: 'operator' } });
  assert.equal(annotations(result)['checksum/config'], annotations(initial)['checksum/config']);
  assert.equal(annotations(result)['checksum/secret'], annotations(initial)['checksum/secret']);
  assert.equal(annotations(result).owner, 'operator');
  const external = render({ secrets: { create: false, existingSecret: 'external-app' },
    podAnnotations: { 'pabawi.io/credentials-revision': '2' } });
  assert.equal(external.secret, undefined);
  assert.equal(annotations(external)['checksum/secret'], undefined);
  assert.equal(annotations(external)['pabawi.io/credentials-revision'], '2');
  assert.equal(external.deployment.spec.template.spec.containers[0].envFrom[1].secretRef.name, 'external-app');
});

test('SQLite always stops the old writer before replacing it', () => {
  for (const values of [{}, { strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: 5 } } }]) {
    assert.deepEqual(render(values).deployment.spec.strategy, { type: 'Recreate' });
  }
  assert.equal(render({ database: postgres }).deployment.spec.strategy.type, 'RollingUpdate');
  assert.deepEqual(render({ database: postgres, strategy: { type: 'Recreate' } }).deployment.spec.strategy, { type: 'Recreate' });
});

test('external PostgreSQL migration account exists before the Job and survives until it runs', () => {
  const result = render({ database: postgres, serviceAccount: { name: 'application-account',
    annotations: { 'example.com/identity': 'test', 'helm.sh/hook-weight': '99' } },
  migrations: { annotations: { 'helm.sh/hook-weight': '99' } } });
  const job = result.resources.find((resource) => resource.kind === 'Job');
  const account = result.resources.find((resource) => resource.kind === 'ServiceAccount'
    && resource.metadata.name === job.spec.template.spec.serviceAccountName);
  assert.ok(account);
  assert.equal(account.metadata.annotations['helm.sh/hook'], 'pre-install,pre-upgrade');
  assert.ok(Number(account.metadata.annotations['helm.sh/hook-weight']) < Number(job.metadata.annotations['helm.sh/hook-weight']));
  assert.equal(account.metadata.annotations['helm.sh/hook-delete-policy'], 'before-hook-creation');
  assert.equal(account.metadata.annotations['example.com/identity'], 'test');
  assert.equal(job.spec.template.spec.automountServiceAccountToken, false);
  assert.notEqual(job.spec.template.spec.serviceAccountName, result.deployment.spec.template.spec.serviceAccountName);
  const external = render({ database: postgres, serviceAccount: { create: false, name: 'preexisting-account' } });
  assert.equal(external.resources.filter((resource) => resource.kind === 'ServiceAccount').length, 0);
  assert.equal(external.resources.find((resource) => resource.kind === 'Job').spec.template.spec.serviceAccountName, 'preexisting-account');
  assert.equal(render().resources.filter((resource) => resource.kind === 'Job').length, 0);
  assert.equal(render({ database: postgres, migrations: { enabled: false } }).resources.filter((resource) => resource.kind === 'Job').length, 0);
});
