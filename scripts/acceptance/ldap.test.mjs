import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { verifyLiveReport, verifyBrowserReport } from './ldap-report.mjs';

const real = process.env.LDAP_RUNNER_REAL_FAILURES === '1';
const realDocker = real ? spawnSync('which', ['docker'], { encoding: 'utf8' }).stdout.trim() : '';
const realScanner = real ? spawnSync('which', ['clamscan'], { encoding: 'utf8' }).stdout.trim() : '';
const report = () => ({ testResults: [
  ['test/integration/ldap-directory.test.ts', 10], ['test/integration/ldap-rollout.test.ts', 4],
  ['test/security/ldap-transports.test.ts', 45], ['test/database/ldap-upgrade-recovery.test.ts', 2],
].map(([name, count]) => ({ name: '/repo/backend/' + name,
  assertionResults: Array.from({ length: count }, () => ({ status: 'passed' })) })) });

test('live report rejects zero, missing, skipped, pending, failed and truncated cases', () => {
  verifyLiveReport(report());
  assert.throws(() => verifyLiveReport({}));
  for (const status of ['skipped', 'pending', 'todo', 'failed']) {
    const value = report(); value.testResults[0].assertionResults[0].status = status;
    assert.throws(() => verifyLiveReport(value));
  }
  const missing = report(); missing.testResults.pop(); assert.throws(() => verifyLiveReport(missing));
  const truncated = report(); truncated.testResults[1].assertionResults.pop(); assert.throws(() => verifyLiveReport(truncated));
});

const shim = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const stateFile = process.env.FAKE_STATE;
const events = process.env.FAKE_EVENTS;
const state = JSON.parse(readFileSync(stateFile));
const args = process.argv.slice(2);
const name = basename(process.argv[1]);
const mode = process.env.FAKE_MODE;
appendFileSync(events, JSON.stringify({name, args, pid: process.pid}) + '\\n');
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const hang = () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], {stdio:'ignore', detached:true});
  appendFileSync(events, JSON.stringify({name:'grandchild', pid:child.pid}) + '\\n');
  process.on('SIGTERM', () => {});
  setInterval(() => {},1000);
};
if (name === 'docker') {
  if (args[0] === 'run') {
    const container = args[args.indexOf('--name')+1];
    state[container] = true; save();
    if (mode === 'create-signal' && container.includes('postgres')) {
      if (process.env.REAL_DOCKER) {
        const created = spawnSync(process.env.REAL_DOCKER, args, {encoding:'utf8'});
        if (created.status !== 0) process.exit(created.status ?? 1);
      }
      hang(); await new Promise(() => {});
    }
  }
  if (args[0] === 'exec' && (args.includes('pg_isready') || args.includes('test')) && mode === 'readiness') process.exit(1);
  if (process.env.REAL_DOCKER) {
    const result = spawnSync(process.env.REAL_DOCKER, args, {encoding:'utf8'});
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    if (args[0] === 'stop' && result.status === 0) { state[args[1]]=false; save(); }
    process.exit(result.status ?? 1);
  }
  if (args[0] === 'version') process.stdout.write('test-docker');
  if (args[0] === 'image') process.stdout.write('sha256:synthetic');
  if (args[0] === 'inspect' && args[2] === '{{.State.Running}}') process.stdout.write(String(state[args.at(-1)] ?? false));
  else if (args[0] === 'inspect') process.stdout.write(JSON.stringify({
    '5432/tcp': [{HostIp:'127.0.0.1',HostPort:'54321'}],
    '1389/tcp': [{HostIp:'127.0.0.1',HostPort:'54322'}],
    '1636/tcp': [{HostIp:'127.0.0.1',HostPort:'54323'}],
  }));
  if (args[0] === 'cp' && args[1].endsWith('ca.pem')) writeFileSync(args[2], 'synthetic public certificate');
  if (args[0] === 'stop') { state[args[1]]=false; save(); }
} else if (name === 'clamscan') {
  if (mode === 'scanner') process.exit(1);
  if (process.env.REAL_SCANNER) {
    const scan = spawnSync(process.env.REAL_SCANNER, args, {stdio:'inherit'}); process.exit(scan.status ?? 1);
  }
} else if (name === 'npm') {
  if (['signal', 'timeout'].includes(mode)) hang(); else process.exit(23);
}
`;

async function scenario(mode, signal) {
  const dir = mkdtempSync(resolve(tmpdir(), 'pabawi-runner-regression-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const executable = join(bin, 'shim.mjs'); writeFileSync(executable, shim, { mode: 0o700 });
  for (const name of ['docker', 'clamscan', 'npm']) symlinkSync(executable, join(bin, name));
  const state = join(dir, 'containers.json'); writeFileSync(state, '{}');
  const events = join(dir, 'events.jsonl'); writeFileSync(events, '');
  const child = spawn(process.execPath, ['scripts/acceptance/ldap.mjs', '--focused',
    '--ldap-image', 'pabawi-ldap-fixture:package3-verified', '--output-root', dir,
    '--readiness-timeout-ms', mode === 'readiness' ? (real ? '500' : '80') : '30000',
    '--command-timeout-ms', mode === 'timeout' ? (real ? '5000' : '1000') : '20000'], {
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, FAKE_STATE: state, FAKE_EVENTS: events,
      FAKE_MODE: mode, REAL_DOCKER: realDocker, REAL_SCANNER: realScanner }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const completion = new Promise(resolveExit => child.once('close', (code, killed) => resolveExit({ code, killed })));
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 60000);
  const entries = () => readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  try {
    if (signal) {
      const deadline = Date.now() + 30000;
      while (!entries().some(item => item.name === 'grandchild')) {
        assert(Date.now() < deadline, 'No cancellable child started: ' + output);
        await delay(20);
      }
      child.kill(signal);
    }
    const { code, killed } = await completion;
    assert.equal(killed, null, output); assert.notEqual(code, 0, output);
    if (signal) assert.equal(code, signal === 'SIGINT' ? 130 : 143, output);
    const path = output.match(/Evidence retained: (.+)/)?.[1]; assert(path, output);
    const result = JSON.parse(readFileSync(join(path, 'result.json')));
    const environment = JSON.parse(readFileSync(join(path, 'environment.json')));
    assert.equal(result.passed, false);
    assert.equal(result.cancelled, !!signal);
    assert.equal(result.signal, signal);
    assert(result.failure);
    assert(Object.values(JSON.parse(readFileSync(state))).every(running => running === false));
    assert(result.shutdown.length >= 1);
    assert(result.shutdown.every(item => item.status === 'stopped'));
    assert.deepEqual(environment.shutdown, result.shutdown);
    assert(result.checks.every(check => existsSync(check.path)));
    const calls = entries();
    assert(!calls.some(call => call.name === 'docker' && ['rm', 'volume', 'prune'].includes(call.args[0])));
    if (['scanner', 'readiness', 'create-signal'].includes(mode)) assert(!calls.some(call => call.name === 'npm'));
    if (mode === 'readiness') assert.match(result.failure, /readiness deadline/);
    if (mode === 'scanner') assert.match(result.failure, /ClamAV/);
    if (mode === 'subprocess') assert(result.checks.some(check => check.code === 23));
    if (mode === 'timeout') {
      assert(result.checks.some(check => check.timedOut));
      assert(calls.some(call => call.name === 'npm'));
      assert(calls.some(call => call.name === 'grandchild'));
    }
    if (signal) {
      const failed = result.checks.findIndex(check => check.cancelled);
      assert(failed >= 0);
      assert(result.checks.slice(failed + 1).every(check => /fixture.*shutdown|stop retained|inspect retained/.test(check.reason)));
    }
    for (const item of calls.filter(call => call.name === 'grandchild')) {
      const deadline = Date.now() + 3000;
      while (true) {
        try { process.kill(item.pid, 0); }
        catch (error) { assert.equal(error.code, 'ESRCH'); break; }
        assert(Date.now() < deadline, 'Grandchild still running: ' + item.pid);
        await delay(20);
      }
    }
    process.stdout.write('Retained ' + (real ? 'real fixture' : 'synthetic CLI') + ' regression evidence: ' + path + '\n');
  } finally {
    clearTimeout(watchdog);
    // Regression failures must not leak the deliberately detached test process.
    for (const item of entries().filter(call => call.name === 'grandchild')) {
      try { process.kill(item.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
}
for (const mode of ['scanner', 'readiness', 'subprocess', 'timeout']) {
  test('runner ' + mode + ' failure stops every retained fixture', { timeout: 65000 }, () => scenario(mode));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  test('runner ' + signal + ' cancellation stops work and all descendants', { timeout: 65000 }, () => scenario('signal', signal));
}
test('interrupted Docker creation is included in shutdown evidence', { timeout: 65000 }, () => scenario('create-signal', 'SIGINT'));


test('dedicated browser report rejects missing, skipped and unexpectedly passing cases', () => {
  const cases = Array.from({ length: 3 }, () => ({ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }));
  verifyBrowserReport({ suites: [{ suites: [{ specs: [{ tests: cases }] }] }] });
  assert.throws(() => verifyBrowserReport({}));
  cases[0].results[0].status = 'skipped';
  assert.throws(() => verifyBrowserReport({ suites: [{ specs: [{ tests: cases }] }] }));
});
