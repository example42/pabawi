import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../../backend/dist/server.js', import.meta.url));
for (const signal of ['SIGTERM', 'SIGINT']) {
  const directory = await mkdtemp(join(tmpdir(), 'pabawi-process-smoke-'));
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [entry], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
      JWT_SECRET: randomBytes(32).toString('hex'),
      DATABASE_PATH: join(directory, 'test.sqlite'), BOLT_PROJECT_PATH: directory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-16384); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-16384); });
  const exit = new Promise(resolve => child.once('exit', (code, receivedSignal) => resolve({ code, receivedSignal })));
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 40_000);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
        ready = response.status === 200;
        await response.text();
        if (ready) break;
      } catch { /* Listener is not ready yet. */ }
      await delay(100);
    }
    assert.ok(ready, `Built server failed to become ready: ${output}`);
    const started = Date.now();
    child.kill(signal);
    assert.deepEqual(await exit, { code: 0, receivedSignal: null }, output);
    assert.ok(Date.now() - started < 26_000, 'Shutdown exceeded its deadline');
    process.stdout.write(`${signal}: clean built-server shutdown; disposable evidence ${directory}\n`);
  } finally {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exit;
  }
}
