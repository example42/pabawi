import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const focused = args.includes('--focused');
const buildFixture = args.includes('--build-fixture');
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing value for ' + name);
  return args[index + 1];
}
const ldapImage = option('--ldap-image', 'pabawi-ldap-fixture:acceptance');
const postgresImage = option('--postgres-image', 'postgres:17');
const outputRoot = resolve(option('--output-root', tmpdir()));
mkdirSync(outputRoot, { recursive: true });
const evidence = mkdtempSync(resolve(outputRoot, 'pabawi-ldap-acceptance-'));
const logPath = resolve(process.env.HOME, '.agents/logs', root.split('/').at(-1) + '.jsonl');
mkdirSync(dirname(logPath), { recursive: true });
const id = randomUUID().slice(0, 8);
const ldapName = 'pabawi-ldap-acceptance-' + id;
const postgresName = 'pabawi-ldap-postgres-' + id;
const retained = [];
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
let index = 0;
let active;
const checks = [];
let environment = {};

async function run(program, parameters, reason, extraEnv = {}, allowFailure = false) {
  const command = [program, ...parameters].map(quote).join(' ');
  const envPrefix = Object.entries(extraEnv).map(([key, value]) => key + '=' + quote(value)).join(' ');
  const path = resolve(evidence, String(++index).padStart(3, '0') + '-' + program.split('/').at(-1) + '.log');
  const started = Date.now();
  const output = [];
  process.stdout.write(reason + '\n');
  const child = spawn(program, parameters, { cwd: root, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  active = child;
  child.stdout.on('data', chunk => output.push(chunk));
  child.stderr.on('data', chunk => output.push(chunk));
  let error;
  child.once('error', value => { error = value; });
  const code = await new Promise(resolveExit => child.once('close', value => resolveExit(value ?? 1)));
  active = undefined;
  const text = Buffer.concat(output).toString();
  writeFileSync(path, text + (error ? String(error) + '\n' : ''));
  appendFileSync(logPath, JSON.stringify({
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), agent: 'codex', actor: 'agent',
    cwd: root, cmd: (envPrefix ? 'env ' + envPrefix + ' ' : '') + command, reason,
    result: code === 0 ? 'ok' : 'fail', note: 'exit ' + code + '; evidence ' + path,
  }) + '\n');
  checks.push({ reason, code, path, durationMs: Date.now() - started });
  if (code !== 0 && !allowFailure) throw new Error(reason + ' failed; see ' + path);
  return { code, text };
}

process.on('SIGINT', () => { active?.kill('SIGTERM'); });
process.on('SIGTERM', () => { active?.kill('SIGTERM'); });
let failure;
try {
  if (!/^24\./.test(process.versions.node) || Number(process.versions.node.split('.')[1]) < 21) {
    throw new Error('Use the supported Node >=24.21.0 and <25 runtime.');
  }
  await run('docker', ['version', '--format', '{{.Server.Version}}'], 'verify local Docker availability');
  if (buildFixture) {
    await run('docker', ['build', '-t', ldapImage, 'backend/test/fixtures/ldap'], 'build the directory fixture from repository source');
  }
  const ldapMetadata = await run('docker', ['image', 'inspect', ldapImage, '--format', '{{.Id}}'], 'verify local LDAP image; use --build-fixture if absent');
  const postgresMetadata = await run('docker', ['image', 'inspect', postgresImage, '--format', '{{.Id}}'], 'verify local PostgreSQL image without downloading');
  await run('docker', ['run', '--detach', '--pull', 'never', '--name', postgresName,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=ldap_acceptance',
    '-p', '127.0.0.1::5432', postgresImage], 'start isolated loopback PostgreSQL fixture');
  retained.push(postgresName);
  await run('docker', ['run', '--detach', '--pull', 'never', '--name', ldapName,
    '-p', '127.0.0.1::1389', '-p', '127.0.0.1::1636', ldapImage], 'start fresh loopback OpenLDAP fixture');
  retained.push(ldapName);
  const deadline = Date.now() + 30000;
  while ((await run('docker', ['exec', postgresName, 'pg_isready', '-U', 'postgres'], 'wait for PostgreSQL readiness', {}, true)).code) {
    if (Date.now() >= deadline) throw new Error('PostgreSQL readiness deadline exceeded');
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  while ((await run('docker', ['exec', ldapName, 'test', '-f', '/fixture/slapd.pid'], 'wait for OpenLDAP initialization', {}, true)).code) {
    if (Date.now() >= deadline) throw new Error('OpenLDAP readiness deadline exceeded');
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  async function port(container, key) {
    const inspected = await run('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], 'inspect loopback fixture port');
    const binding = JSON.parse(inspected.text)[key]?.[0];
    if (!binding || binding.HostIp !== '127.0.0.1') throw new Error('Fixture is not restricted to loopback');
    return binding.HostPort;
  }
  const postgresPort = await port(postgresName, '5432/tcp');
  const ldapsPort = await port(ldapName, '1636/tcp');
  const starttlsPort = await port(ldapName, '1389/tcp');
  const caFile = resolve(evidence, 'ca.pem');
  const downloads = resolve(evidence, 'fixture-downloads');
  mkdirSync(downloads);
  await run('docker', ['cp', ldapName + ':/fixture/tls/ca.pem', caFile], 'retain public directory fixture CA');
  await run('docker', ['cp', ldapName + ':/downloads/.', downloads], 'retain fixture downloads for security scan');
  await run('clamscan', ['-r', downloads, caFile], 'scan fixture artifacts with ClamAV');
  environment = {
    TEST_DATABASE_URL: 'postgresql://postgres@127.0.0.1:' + postgresPort + '/ldap_acceptance',
    TEST_LDAP_LDAPS_PORT: ldapsPort, TEST_LDAP_STARTTLS_PORT: starttlsPort, TEST_LDAP_CA_FILE: caFile,
    TEST_LDAP_POSTGRES_CONTAINER: postgresName, TEST_LDAP_EVIDENCE_DIR: evidence,
  };
  const focusedFiles = [
    'test/config/LdapDn.test.ts', 'test/config/LdapConfig.test.ts',
    'test/unit/services/LdapDirectoryService.test.ts',
    'test/integration/ldap-directory.test.ts', 'test/integration/ldap-authentication.test.ts',
    'test/integration/ldap-rollout.test.ts', 'test/security/ldap-transports.test.ts',
    'test/database/ldap-authentication.test.ts', 'test/database/provider-bound-sessions.test.ts',
    'test/database/ldap-upgrade-recovery.test.ts',
  ];
  await run('npm', ['run', 'test', '--workspace=backend', ...(focused ? ['--', ...focusedFiles] : [])],
    'verify backend LDAP acceptance with both adapters and live directory endpoints', environment);
  if (!focused) {
    await run('npm', ['run', 'test', '--workspace=frontend'], 'verify frontend regressions');
    await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.ldap.config.ts'], 'verify browser contracts and production frontend build', { TEST_LDAP_EVIDENCE_DIR: evidence });
    await run('npm', ['run', 'build:backend'], 'compile production backend');
    await run('npm', ['run', 'lint'], 'verify both workspace linters');
    await run('npm', ['run', 'check:components'], 'verify Svelte components');
    await run(process.execPath, ['--test', 'scripts/documentation/contracts.test.mjs'], 'verify documentation contracts');
    await run('bash', ['scripts/quality/secret-scan.sh'], 'verify tracked-tree secret scan');
  }
  await run('docker', ['exec', ldapName, 'dpkg-query', '-W', 'slapd'], 'record OpenLDAP version');
  await run('docker', ['exec', postgresName, 'psql', '-U', 'postgres', '-Atc', 'SHOW server_version'], 'record PostgreSQL version');
  writeFileSync(resolve(evidence, 'environment.json'), JSON.stringify({
    node: process.version, ldapImage: ldapMetadata.text.trim(), postgresImage: postgresMetadata.text.trim(),
    environment, retainedContainers: retained,
    scope: 'OpenLDAP acceptance; actual AD and real Proxmox interoperability remain unverified',
  }, null, 2));
} catch (error) {
  failure = error;
  process.stderr.write(String(error) + '\n');
} finally {
  for (const container of retained.reverse()) {
    try { await run('docker', ['stop', container], 'stop retained acceptance fixture'); }
    catch (error) { failure ??= error; }
  }
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({
    passed: !failure, failure: failure ? String(failure) : undefined, checks,
    adVerified: false, productionDeployment: false,
  }, null, 2));
  process.stdout.write('Evidence retained: ' + evidence + '\n');
}
if (failure) process.exitCode = 1;
