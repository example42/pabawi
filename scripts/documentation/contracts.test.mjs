import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { canonical, environmentVariables, read, routes } from './source-inventory.mjs';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { parse } = require('yaml');

const spec = parse(read('docs/openapi.yaml'), { uniqueKeys: true });
const actual = routes();
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const key = (method, path) => `${method.toUpperCase()} ${canonical(path)}`;
const documented = new Set();
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of methods) if (item[method]) documented.add(key(method, `/api${path}`));
}
const omissions = [...read('docs/api-contract-coverage.md').matchAll(/\| `(GET|POST|PUT|PATCH|DELETE)` \| `([^`]+)` \| ([^\n]+)/g)];

test('every declared REST route is specified or explicitly omitted, with no stale entries', () => {
  assert.ok(actual.size > 150, 'Production route discovery unexpectedly incomplete');
  const omitted = new Set(omissions.map(([, method, path]) => key(method, path)));
  assert.equal(omitted.size, omissions.length, 'Duplicate omission');
  for (const route of omitted) assert.ok(!documented.has(route), `Remove resolved omission: ${route}`);
  assert.deepEqual([...new Set([...documented, ...omitted])].sort(), [...actual.keys()].sort());
});

test('API guide method/path tables point to real REST routes', () => {
  for (const [, method, path] of read('docs/api.md').matchAll(/\| `(GET|POST|PUT|PATCH|DELETE)` \| `(\/api[^` ?]*)`/g)) {
    assert.ok(actual.has(key(method, path)), `Unimplemented documented route: ${method} ${path}`);
  }
});

const resolve = value => {
  if (!value?.$ref) return value;
  assert.ok(value.$ref.startsWith('#/'), `External reference needs explicit validation: ${value.$ref}`);
  const result = value.$ref.slice(2).split('/').reduce((node, name) => node?.[name], spec);
  assert.ok(result, `Dangling reference: ${value.$ref}`);
  return result;
};

test('OpenAPI version, references, path parameters and security declarations are coherent', () => {
  assert.equal(spec.info.version, JSON.parse(read('package.json')).version);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    resolve(value);
    for (const child of Object.values(value)) visit(child);
  }
  visit(spec);
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      const params = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map(resolve);
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
        assert.ok(params.some(p => p.in === 'path' && p.name === name && p.required), `${method} ${path}: missing required ${name}`);
      }
      for (const param of params.filter(p => p.in === 'path')) assert.ok(path.includes(`{${param.name}}`), `${path}: unused ${param.name}`);
      for (const requirement of operation.security ?? spec.security) {
        for (const name of Object.keys(requirement)) assert.ok(spec.components.securitySchemes[name], `Unknown security scheme ${name}`);
      }
      assert.ok(Object.keys(operation.responses).length, `${method} ${path}: no responses`);
    }
  }
});

test('public exchanges, bootstrap ownership and stream credentials match their implemented boundaries', () => {
  assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
  for (const [path, method] of [
    ['/health', 'get'], ['/setup/status', 'get'], ['/auth/login', 'post'],
    ['/auth/register', 'post'], ['/auth/refresh', 'post'], ['/auth/providers', 'get'],
    ['/auth/entra-id/login', 'get'], ['/auth/entra-id/callback', 'get'], ['/auth/entra-id/token', 'post'],
  ]) assert.deepEqual(spec.paths[path][method].security, [], path);
  const bootstrap = spec.components.securitySchemes.bootstrapToken;
  assert.ok(read('backend/src/routes/setup.ts').includes(`req.get("${bootstrap.name}")`));
  assert.deepEqual(spec.paths['/setup/initialize'].post.security, [{ bootstrapToken: [] }]);
  assert.deepEqual(spec.paths['/executions/{id}/stream'].get.security, [{ bearerAuth: [] }, { streamTicket: [] }]);
  assert.deepEqual(spec.paths['/executions/{id}/stream-ticket'].post.responses['200'].content['application/json'].schema.required, ['ticket']);
  assert.deepEqual(spec.components.schemas.AuthenticationResult.required, ['token', 'refreshToken', 'user']);
  assert.ok(!read('docs/openapi.yaml').includes('AUTH_ENABLED'));
});

test('configuration inventory covers both parsers and classifies credential values', () => {
  const doc = read('docs/configuration.md');
  const rows = new Map([...doc.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \| (.+)$/gm)].map(([, name, row]) => [name, row]));
  for (const name of environmentVariables()) {
    assert.ok(rows.has(name), `Missing variable/default/units/condition row: ${name}`);
    assert.match(rows.get(name), /\| (yes|no) \|$/, `Missing secret classification: ${name}`);
  }
  for (const name of ['JWT_SECRET', 'PABAWI_BOOTSTRAP_TOKEN', 'DATABASE_URL', 'AZURE_CLIENT_SECRET', 'CHECKMK_PASSWORD', 'MCP_AUTH_TOKEN', 'SSH_SUDO_PASSWORD']) {
    assert.match(rows.get(name), /\| yes \|$/, name);
  }
  for (const name of environmentVariables().filter(n => /^(AZURE_|CHECKMK_|CONSOLE_)/.test(n))) {
    assert.match(read('backend/.env.example'), new RegExp(`^#? ?${name}=`, 'm'), `Missing environment example: ${name}`);
  }
});

test('architecture registry table reflects real constructors, types and priorities', () => {
  const registry = read('backend/src/plugins/registry.ts');
  const doc = read('docs/architecture.md');
  const matches = [...registry.matchAll(/name: "([a-z]+)",\s+type: "([a-z]+)",\s+priority: (\d+),([\s\S]*?)(?=\n {2}},)/g)];
  assert.equal(matches.length, 10);
  for (const match of matches) {
    const [, name, type, priority, implementation] = match;
    const constructor = implementation.match(/(?:return|const plugin =) new (\w+)/)?.[1];
    assert.ok(constructor, `Constructor not inventoried: ${name}`);
    assert.ok(doc.includes(`| \`${constructor}\` | ${type} | ${priority} |`), `Registry drift: ${name}`);
  }
});
