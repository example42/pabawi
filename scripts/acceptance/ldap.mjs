import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { verifyLiveReport, verifyBrowserReport } from './ldap-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const focused = args.includes('--focused');
const buildFixture = args.includes('--build-fixture');
const browser = !focused || args.includes('--browser');
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing value for ' + name);
  return args[index + 1];
}
const ldapImage = option('--ldap-image', 'pabawi-ldap-fixture:acceptance');
const postgresImage = option('--postgres-image', 'postgres:17');
const postgresMajor = option('--postgres-major', undefined);
if (postgresMajor && !['15', '17'].includes(postgresMajor)) throw new Error('PostgreSQL major must be 15 or 17');
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
let cancellation;
let cleaning = false;
const shutdown = [];
function milliseconds(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < 10 || value > 1800000) throw new Error('Invalid timeout: ' + name);
  return value;
}
const readinessTimeout = milliseconds('--readiness-timeout-ms', 30000);
const commandTimeout = milliseconds('--command-timeout-ms', 900000);
function killGroup(child, signal) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) {
    if (error.code === 'ESRCH') return;
    // A just-spawned child may not have established its detached group yet.
    if (error.code !== 'EPERM') throw error;
    try { child.kill ? child.kill(signal) : process.kill(child.pid, signal); }
    catch (directError) { if (directError.code !== 'ESRCH') throw directError; }
  }
}
function descendants(pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
    .map(row => row.trim().split(/\s+/).map(Number));
  const found = new Set([pid]);
  for (let previous = 0; previous !== found.size;) {
    previous = found.size;
    for (const [child, parent] of rows) if (found.has(parent)) found.add(child);
  }
  found.delete(pid);
  return [...found];
}
function killDescendant(pid, signal) {
  killGroup({ pid }, signal);
  try { process.kill(pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}
const checks = [];
let environment = {};

async function run(program, parameters, reason, extraEnv = {}, allowFailure = false, timeoutMs = commandTimeout) {
  if (cancellation && !cleaning) throw new Error('Acceptance cancelled by ' + cancellation);
  const command = [program, ...parameters].map(quote).join(' ');
  const envPrefix = Object.entries(extraEnv).map(([key, value]) => key + '=' + quote(value)).join(' ');
  const path = resolve(evidence, String(++index).padStart(3, '0') + '-' + program.split('/').at(-1) + '.log');
  const started = Date.now();
  const output = [];
  process.stdout.write(reason + '\n');
  const child = spawn(program, parameters, { cwd: root, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let timedOut = false;
  let escalation;
  const children = new Set();
  const terminate = () => {
    for (const pid of descendants(child.pid)) children.add(pid);
    for (const pid of children) killDescendant(pid, 'SIGTERM');
    killGroup(child, 'SIGTERM');
    escalation ??= setTimeout(() => {
      for (const pid of descendants(child.pid)) children.add(pid);
      for (const pid of children) killDescendant(pid, 'SIGKILL');
      killGroup(child, 'SIGKILL');
    }, 500);
  };
  const timeout = setTimeout(() => { timedOut = true; terminate(); }, cleaning ? 30000 : timeoutMs);
  active = { terminate };
  child.stdout.on('data', chunk => output.push(chunk));
  child.stderr.on('data', chunk => output.push(chunk));
  let error;
  child.once('error', value => { error = value; });
  const exit = await new Promise(resolveExit => child.once('close', (code, signal) => resolveExit({ code, signal })));
  const code = exit.code ?? 1;
  active = undefined;
  clearTimeout(timeout);
  clearTimeout(escalation);
  // A successful wrapper may still have live descendants. They belong to this command's group.
  for (const pid of children) killDescendant(pid, 'SIGKILL');
  killGroup(child, 'SIGKILL');
  const text = Buffer.concat(output).toString();
  writeFileSync(path, text + (error ? String(error) + '\n' : ''));
  appendFileSync(logPath, JSON.stringify({
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), agent: 'codex', actor: 'agent',
    cwd: root, cmd: (envPrefix ? 'env ' + envPrefix + ' ' : '') + command, reason,
    result: code === 0 ? 'ok' : 'fail', note: 'exit ' + exit.code + (exit.signal ? '; signal ' + exit.signal : '') + '; evidence ' + path,
  }) + '\n');
  checks.push({ reason, code, exitCode: exit.code, exitSignal: exit.signal, path, pid: child.pid, descendants: [...children], timedOut, cancelled: !!cancellation && !cleaning, durationMs: Date.now() - started });
  if (cancellation && !cleaning) throw new Error('Acceptance cancelled by ' + cancellation);
  if (timedOut) throw new Error(reason + ' exceeded command deadline; see ' + path);
  if (code !== 0 && !allowFailure) throw new Error(reason + ' failed; see ' + path);
  return { code, text };
}

function cancel(signal) {
  cancellation ??= signal;
  if (!cleaning) active?.terminate();
}
process.on('SIGINT', () => cancel('SIGINT'));
process.on('SIGTERM', () => cancel('SIGTERM'));
let failure;
let ldapImageId;
let postgresImageId;
try {
  if (!/^24\./.test(process.versions.node) || Number(process.versions.node.split('.')[1]) < 21) {
    throw new Error('Use the supported Node >=24.21.0 and <25 runtime.');
  }
  await run('docker', ['version', '--format', '{{.Server.Version}}'], 'verify local Docker availability');
  if (buildFixture) {
    await run('docker', ['build', '-t', ldapImage, 'backend/test/fixtures/ldap'], 'build the directory fixture from repository source');
  }
  const ldapMetadata = await run('docker', ['image', 'inspect', ldapImage, '--format', '{{.Id}}'], 'verify local LDAP image; use --build-fixture if absent');
  ldapImageId = ldapMetadata.text.trim();
  const postgresMetadata = await run('docker', ['image', 'inspect', postgresImage, '--format', '{{.Id}}'], 'verify local PostgreSQL image without downloading');
  postgresImageId = postgresMetadata.text.trim();
  retained.push(postgresName);
  await run('docker', ['run', '--detach', '--pull', 'never', '--name', postgresName,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=ldap_acceptance',
    '-p', '127.0.0.1::5432', postgresImage], 'start isolated loopback PostgreSQL fixture');
  retained.push(ldapName);
  await run('docker', ['run', '--detach', '--pull', 'never', '--name', ldapName,
    '-p', '127.0.0.1::1389', '-p', '127.0.0.1::1636', ldapImage], 'start fresh loopback OpenLDAP fixture');
  async function ready(container, parameters, reason) {
    const deadline = Date.now() + readinessTimeout;
    while (Date.now() < deadline) {
      const result = await run('docker', ['exec', container, ...parameters], reason, {}, true,
        Math.max(10, deadline - Date.now()));
      if (result.code === 0) return;
      await new Promise(resolveWait => setTimeout(resolveWait, Math.max(0, Math.min(250, deadline - Date.now()))));
    }
    throw new Error(reason + ' deadline exceeded');
  }
  await ready(postgresName, ['pg_isready', '-U', 'postgres'], 'wait for PostgreSQL readiness');
  await ready(ldapName, ['test', '-f', '/fixture/slapd.pid'], 'wait for OpenLDAP initialization');
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
    'test/unit/services/LdapDirectoryService.test.ts', 'test/unit/ad-lab.test.ts',
    'test/integration/ldap-directory.test.ts', 'test/integration/ldap-authentication.test.ts',
    'test/integration/ldap-rollout.test.ts', 'test/security/ldap-transports.test.ts',
    'test/database/ldap-authentication.test.ts', 'test/database/provider-bound-sessions.test.ts',
    'test/database/ldap-upgrade-recovery.test.ts',
  ];
  await run('npm', ['run', 'test', '--workspace=backend', '--', ...(focused ? focusedFiles : []), '--reporter=default', '--reporter=json', '--reporter=junit',
    '--outputFile.json=' + resolve(evidence, 'backend-results.json'), '--outputFile.junit=' + resolve(evidence, 'backend-results.xml')],
    'verify backend LDAP acceptance with both adapters and live directory endpoints', environment);
  verifyLiveReport(JSON.parse(readFileSync(resolve(evidence, 'backend-results.json'), 'utf8')));
  if (browser) {
    await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.ldap.config.ts'], 'verify browser contracts and production frontend build', { TEST_LDAP_EVIDENCE_DIR: evidence });
    verifyBrowserReport(JSON.parse(readFileSync(resolve(evidence, 'browser-results.json'), 'utf8')));
  }
  if (!focused) {
    await run('npm', ['run', 'test', '--workspace=frontend'], 'verify frontend regressions');
    await run('npm', ['run', 'build:backend'], 'compile production backend');
    await run('npm', ['run', 'lint'], 'verify both workspace linters');
    await run('npm', ['run', 'check:components'], 'verify Svelte components');
    await run(process.execPath, ['--test', 'scripts/documentation/contracts.test.mjs'], 'verify documentation contracts');
    await run('bash', ['scripts/quality/secret-scan.sh'], 'verify tracked-tree secret scan');
  }
  await run('docker', ['exec', ldapName, 'dpkg-query', '-W', 'slapd'], 'record OpenLDAP version');
  const version = await run('docker', ['exec', postgresName, 'psql', '-U', 'postgres', '-Atc', 'SHOW server_version'], 'record PostgreSQL version');
  if (postgresMajor && !version.text.startsWith(postgresMajor + '.')) throw new Error('Unexpected PostgreSQL major');
} catch (error) {
  failure = error;
  process.stderr.write(String(error) + '\n');
} finally {
  cleaning = true;
  for (const container of [...retained].reverse()) {
    const state = { container, status: 'unknown' };
    shutdown.push(state);
    try {
      const inspected = await run('docker', ['inspect', '--format', '{{.State.Running}}', container], 'inspect retained fixture before shutdown', {}, true);
      if (inspected.code && /No such (object|container)/i.test(inspected.text)) {
        state.status = 'not-created';
        continue;
      }
      if (inspected.code) throw new Error('Cannot inspect acceptance fixture');
      await run('docker', ['stop', container], 'stop retained acceptance fixture');
      const stopped = await run('docker', ['inspect', '--format', '{{.State.Running}}', container], 'verify retained fixture shutdown');
      if (stopped.text.trim() !== 'false') throw new Error('Acceptance fixture still running');
      state.status = 'stopped';
    } catch (error) { state.status = 'shutdown-failed'; failure ??= error; }
  }
  if (cancellation) failure ??= new Error('Acceptance cancelled by ' + cancellation);
  writeFileSync(resolve(evidence, 'environment.json'), JSON.stringify({
    node: process.version, ldapImage: ldapImageId, postgresImage: postgresImageId,
    environment, retainedContainers: retained, shutdown,
    scope: 'Synthetic OpenLDAP acceptance; actual AD and real Proxmox remain unverified',
  }, null, 2));
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({
    passed: !failure, cancelled: !!cancellation, signal: cancellation, shutdown, failure: failure ? String(failure) : undefined, checks,
    adVerified: false, productionDeployment: false,
  }, null, 2));
  process.stdout.write('Evidence retained: ' + evidence + '\n');
}
if (failure) process.exitCode = cancellation === 'SIGINT' ? 130 : cancellation === 'SIGTERM' ? 143 : 1;
