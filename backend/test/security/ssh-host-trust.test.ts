import { afterEach, describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server, utils } from 'ssh2';
import { SSHService } from '../../src/integrations/ssh/SSHService';
import { parseSSHConfig } from '../../src/integrations/ssh/config';
import { parseSSHConfig as parseInventory } from '../../src/integrations/ssh/sshConfigParser';
import { LoggerService } from '../../src/services/LoggerService';
import { resolveSSHEndpoint } from '../../src/integrations/ssh/endpoint';

function hostKey() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const parsed = utils.parseKey(privateKey);
  if (parsed instanceof Error || Array.isArray(parsed)) throw new Error('Invalid fixture key');
  return { privateKey, fingerprint: `SHA256:${createHash('sha256').update(parsed.getPublicSSH()).digest('base64').replace(/=+$/, '')}` };
}
const enrolled = hostKey();
const changed = hostKey();

describe('SSH host trust over real handshakes', () => {
  let service: SSHService | undefined;
  let server: Server | undefined;
  let authenticationAttempts = 0;
  afterEach(async () => {
    service?.cleanup();
    if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); });
    service = undefined;
    server = undefined;
  });

  async function start(key = enrolled.privateKey) {
    authenticationAttempts = 0;
    server = new Server({ hostKeys: [key] }, client => {
      client.on('error', () => undefined);
      client.on('authentication', ctx => {
        authenticationAttempts++;
        if (ctx.method === 'password' && ctx.password === 'fixture-password') ctx.accept();
        else ctx.reject();
      });
    });
    await new Promise<void>(resolve => { server!.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (typeof address === 'string' || !address) throw new Error('Missing server address');
    return address.port;
  }
  function configure(contents: string | undefined, checking = true) {
    const path = join(mkdtempSync(join(tmpdir(), 'pabawi-ssh-trust-')), 'pins.json');
    if (contents !== undefined) writeFileSync(path, contents);
    service = new SSHService(parseSSHConfig({ SSH_ENABLED: 'true', SSH_DEFAULT_USER: 'fixture',
      SSH_HOST_KEY_CHECK: String(checking), SSH_HOST_FINGERPRINTS_PATH: path }), new LoggerService('error'));
    return service;
  }

  it.each(['{}', '{invalid', '{"[127.0.0.1]:22":["invalid"]}', undefined])(
    'rejects unknown, invalid or unreadable trust material before authentication (%s)', async contents => {
      const port = await start();
      await expect(configure(contents).connect({ name: 'alias', uri: 'ssh://127.0.0.1', port, password: 'fixture-password' }))
        .rejects.toThrow(/verification failed/i);
      expect(authenticationAttempts).toBe(0);
    });

  it('accepts an enrolled destination through an inventory alias on a nondefault port', async () => {
    const port = await start();
    const hosts = parseInventory(`Host friendly-alias\n HostName 127.0.0.1\n Port ${port}\n User fixture`).hosts;
    expect(hosts[0].name).toBe('friendly-alias');
    const client = await configure(JSON.stringify({ [`[127.0.0.1]:${port}`]: [enrolled.fingerprint] }))
      .connect({ ...hosts[0], password: 'fixture-password' });
    expect(authenticationAttempts).toBeGreaterThan(0);
    client.end();
  });

  it('rejects a changed server key before authentication', async () => {
    const port = await start(changed.privateKey);
    await expect(configure(JSON.stringify({ [`[127.0.0.1]:${port}`]: [enrolled.fingerprint] }))
      .connect({ name: 'alias', uri: `ssh://127.0.0.1:${port}`, password: 'fixture-password' })).rejects.toThrow(/verification failed/i);
    expect(authenticationAttempts).toBe(0);
  });

  it('does not trust an alias name or another port in place of the actual destination', async () => {
    const port = await start();
    await expect(configure(JSON.stringify({ [`[alias]:${port}`]: [enrolled.fingerprint], '[127.0.0.1]:22': [enrolled.fingerprint] }))
      .connect({ name: 'alias', uri: 'ssh://127.0.0.1', port, password: 'fixture-password' })).rejects.toThrow(/verification failed/i);
    expect(authenticationAttempts).toBe(0);
  });

  it('allows the explicit insecure opt-out', async () => {
    const port = await start();
    const client = await configure(undefined, false).connect({ name: 'alias', uri: 'ssh://127.0.0.1', port, password: 'fixture-password' });
    expect(authenticationAttempts).toBeGreaterThan(0);
    client.end();
  });

  it('keeps IPv6, URI ports and configured overrides consistent with pool identity', () => {
    expect(resolveSSHEndpoint({ name: 'alias', uri: 'ssh://[::1]:2222' }, 'deploy', 22))
      .toEqual({ hostname: '::1', port: 2222, user: 'deploy', poolKey: 'deploy@::1:2222' });
    expect(resolveSSHEndpoint({ name: 'alias', uri: 'ssh://EXAMPLE.test:2222', port: 2223 }, 'deploy', 22).port).toBe(2223);
  });
});
