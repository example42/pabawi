import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [kubeconfig, image] = process.argv.slice(2);
assert.ok(kubeconfig && image, 'Usage: node cluster-smoke.mjs DISPOSABLE_KIND_KUBECONFIG IMAGE');
const chart = fileURLToPath(new URL('../../charts/pabawi', import.meta.url));
const namespace = `pabawi-chart-${randomBytes(4).toString('hex')}`;
const credential = () => randomBytes(32).toString('hex');

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 600_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
const kubectl = (args, input) => run('kubectl', ['--kubeconfig', kubeconfig, '-n', namespace, ...args], input);
const apply = (...items) => kubectl(['apply', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'List', items }));
const context = run('kubectl', ['--kubeconfig', kubeconfig, 'config', 'current-context']).trim();
assert.match(context, /^kind-/, 'Only a disposable kind context is accepted');
console.log(`Testing ${image} in ${context}, namespace ${namespace}. Resources are retained for inspection.`);
kubectl(['create', 'namespace', namespace]);

const [repository, tag] = [image.slice(0, image.lastIndexOf(':')), image.slice(image.lastIndexOf(':') + 1)];
assert.ok(repository && tag && !image.includes('@'), 'Use an explicitly tagged image loaded into kind');
const bootstrapToken = credential();
const password = `Chart!9${credential()}`;
const mcpToken = credential();
const initialPolicy = ['uptime', 'df -h'];
const common = {
  image: { repository, tag, pullPolicy: 'Never' },
  strategy: { type: 'Recreate' },
  secretEnv: { PABAWI_BOOTSTRAP_TOKEN: bootstrapToken },
  secrets: { mcpAuthToken: mcpToken },
  config: { boltProjectPath: '.', mcpEnabled: 'true', commandWhitelist: JSON.stringify(initialPolicy) },
  resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '1', memory: '1Gi' } },
  probes: { readiness: { initialDelaySeconds: 1, periodSeconds: 2 }, liveness: { initialDelaySeconds: 20 } },
};

function release(name, values, install = false) {
  run('helm', [install ? 'install' : 'upgrade', name, chart, '--kubeconfig', kubeconfig,
    '--namespace', namespace, '--wait', '--timeout', '5m', '-f', '-'], JSON.stringify(values));
  kubectl(['rollout', 'status', `deployment/${name}`, '--timeout=120s']);
}

function pod(name) {
  const pods = JSON.parse(kubectl(['get', 'pods', '-l', `app.kubernetes.io/instance=${name}`, '-o', 'json'])).items
    .filter((item) => item.metadata.labels['app.kubernetes.io/component'] !== 'migration');
  assert.equal(pods.length, 1, 'Rotation must leave exactly one application pod, including terminating pods');
  assert.equal(pods[0].metadata.deletionTimestamp, undefined);
  return pods[0];
}

function api(name, path, { method = 'GET', token, body, headers = {} } = {}) {
  const program = `
    (async () => {
      let input = '';
      for await (const chunk of process.stdin) input += chunk;
      const request = JSON.parse(input);
      const response = await fetch('http://127.0.0.1:3000' + request.path, {
        method: request.method, headers: request.headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      process.stdout.write(JSON.stringify({ status: response.status, body }));
    })().catch((error) => { process.stderr.write(error.message); process.exit(1); });
  `;
  return JSON.parse(kubectl(['exec', '-i', `deployment/${name}`, '--', 'node', '-e', program], JSON.stringify({
    path, method, body, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  })));
}

function login(name) {
  const response = api(name, '/api/auth/login', { method: 'POST', body: { username: 'chart_admin', password } });
  assert.equal(response.status, 200, 'Replacement process must accept login');
  assert.ok(response.body.token);
  return response.body;
}

function enroll(name) {
  assert.equal(api(name, '/api/setup/initialize', { method: 'POST',
    headers: { 'X-Pabawi-Bootstrap-Token': bootstrapToken }, body: {
      username: 'chart_admin', password, email: 'chart-admin@example.invalid', firstName: 'Chart', lastName: 'Test',
      allowSelfRegistration: false, defaultNewUserRole: null,
    } }).status, 201);
  return login(name);
}

function policy(name, token, expected) {
  const response = api(name, '/api/config', { token });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.commandWhitelist.whitelist, expected);
}

function mcp(name, token) {
  return api(name, '/mcp', { method: 'POST', token, headers: { Accept: 'application/json, text/event-stream' },
    body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'chart-smoke', version: '1.0.0' },
    } } });
}

console.log('Preparing external PostgreSQL before the Helm release.');
const dbPassword = credential();
apply(
  { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'database' }, stringData: {
    DATABASE_URL: `postgres://pabawi:${dbPassword}@postgres:5432/pabawi`, POSTGRES_PASSWORD: dbPassword,
  } },
  { apiVersion: 'v1', kind: 'Service', metadata: { name: 'postgres' }, spec: {
    selector: { app: 'postgres' }, ports: [{ port: 5432, targetPort: 5432 }],
  } },
  { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'postgres' }, spec: {
    replicas: 1, selector: { matchLabels: { app: 'postgres' } }, template: {
      metadata: { labels: { app: 'postgres' } }, spec: { containers: [{ name: 'postgres', image: 'postgres:15', imagePullPolicy: 'Never',
        env: [{ name: 'POSTGRES_USER', value: 'pabawi' }, { name: 'POSTGRES_DB', value: 'pabawi' },
          { name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'database', key: 'POSTGRES_PASSWORD' } } }],
        readinessProbe: { exec: { command: ['pg_isready', '-U', 'pabawi'] }, periodSeconds: 2 },
      }] },
    },
  } },
);
kubectl(['rollout', 'status', 'deployment/postgres', '--timeout=120s']);

const managed = 'managed';
const managedValues = { ...common, fullnameOverride: managed,
  database: { type: 'postgres', postgres: { existingSecret: 'database' } } };
console.log('Installing a fresh release with the real migration hook and generated JWT.');
release(managed, managedValues, true);
const initialPod = pod(managed);
const initialLogin = enroll(managed);
policy(managed, initialLogin.token, initialPolicy);
assert.equal(mcp(managed, mcpToken).status, 200);
console.log('Verifying unchanged upgrade preserves the generated JWT and application pod.');
release(managed, managedValues);
assert.equal(pod(managed).metadata.uid, initialPod.metadata.uid);
policy(managed, initialLogin.token, initialPolicy);

console.log('Rotating managed JWT, MCP token and command policy without changing the image.');
const rotatedMcp = credential();
release(managed, { ...managedValues, secrets: { jwtSecret: credential(), mcpAuthToken: rotatedMcp },
  config: { ...common.config, commandWhitelist: '["uptime"]' } });
const rotatedPod = pod(managed);
assert.notEqual(rotatedPod.metadata.uid, initialPod.metadata.uid);
assert.equal(rotatedPod.spec.containers[0].image, initialPod.spec.containers[0].image);
assert.equal(api(managed, '/api/config', { token: initialLogin.token }).status, 401);
const oldRefresh = api(managed, '/api/auth/refresh', { method: 'POST', body: { refreshToken: initialLogin.refreshToken } });
assert.equal(oldRefresh.status, 400);
assert.equal(oldRefresh.body.error.code, 'INVALID_REFRESH_TOKEN');
policy(managed, login(managed).token, ['uptime']);
assert.equal(mcp(managed, mcpToken).status, 401);
assert.equal(mcp(managed, rotatedMcp).status, 200);

console.log('Installing SQLite with an externally managed Secret and persistent storage.');
const external = 'external';
const externalData = { JWT_SECRET: credential(), PABAWI_BOOTSTRAP_TOKEN: bootstrapToken, MCP_AUTH_TOKEN: credential() };
const externalSecret = (data) => ({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 'external-app' }, stringData: data });
apply(externalSecret(externalData));
release(external, { ...common, fullnameOverride: external, secrets: { create: false, existingSecret: 'external-app' } }, true);
const externalPod = pod(external);
const externalLogin = enroll(external);
policy(external, externalLogin.token, initialPolicy);
apply(externalSecret({ ...externalData, JWT_SECRET: credential() }));
assert.equal(pod(external).metadata.uid, externalPod.metadata.uid);
policy(external, externalLogin.token, initialPolicy);
console.log('Activating external Secret rotation with the documented explicit restart.');
kubectl(['rollout', 'restart', `deployment/${external}`]);
kubectl(['rollout', 'status', `deployment/${external}`, '--timeout=120s']);
const replacedExternal = pod(external);
assert.notEqual(replacedExternal.metadata.uid, externalPod.metadata.uid);
assert.equal(replacedExternal.spec.containers[0].image, externalPod.spec.containers[0].image);
assert.equal(api(external, '/api/config', { token: externalLogin.token }).status, 401);
policy(external, login(external).token, initialPolicy);
console.log(`PASS: clean migrations, no-op upgrade, same-image managed rotation and external rotation. Namespace: ${namespace}`);
