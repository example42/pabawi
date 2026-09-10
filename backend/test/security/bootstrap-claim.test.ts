import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { createSetupRouter } from '../../src/routes/setup';
import { SetupService } from '../../src/services/SetupService';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const token = 'bootstrap-fixture-credential-32-characters';
const payload = { username: 'owner', email: 'owner@example.test', password: 'OwnerPass123!',
  firstName: 'Install', lastName: 'Owner', allowSelfRegistration: false, defaultNewUserRole: null };

describe('installation bootstrap boundary', () => {
  let harness: HttpHarness;
  let db: DatabaseService;
  beforeAll(async () => { harness = await createHttpHarness(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'bootstrap-jwt-fixture-32-characters');
    vi.stubEnv('PABAWI_BOOTSTRAP_TOKEN', token);
    db = new DatabaseService(':memory:');
    await db.initialize();
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await db.close(); });
  function app() {
    const server = express();
    server.use(express.json());
    server.use('/api/setup', createSetupRouter(db));
    return harness.use(server);
  }

  it('rejects missing, wrong, body and query credentials without creating state', async () => {
    const server = app();
    await request(server).post('/api/setup/initialize').send(payload).expect(403);
    await request(server).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', 'wrong').send(payload).expect(403);
    await request(server).post(`/api/setup/initialize?token=${token}`).send({ ...payload, bootstrapToken: token }).expect(403);
    expect(await db.getAdapter().query('SELECT * FROM users')).toEqual([]);
    expect(await new SetupService(db.getAdapter()).isSetupComplete()).toBe(false);
    const status = await request(server).get('/api/setup/status').expect(200);
    expect(JSON.stringify(status.body)).not.toContain(token);
  });

  it('fails closed when no bootstrap token is configured', async () => {
    vi.stubEnv('PABAWI_BOOTSTRAP_TOKEN', '');
    await request(app()).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', token).send(payload).expect(403);
    expect(await db.getAdapter().query('SELECT * FROM users')).toEqual([]);
  });

  it('allows one owner and never reopens after administrator deactivation', async () => {
    const server = app();
    const results = await Promise.all([payload, { ...payload, username: 'second', email: 'second@example.test' }].map(body =>
      request(server).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', token).send(body)));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await db.getAdapter().query('SELECT * FROM users')).toHaveLength(1);
    await db.getAdapter().execute('UPDATE users SET is_active = 0, is_admin = 0');
    expect(await new SetupService(db.getAdapter()).getSetupStatus()).toMatchObject({ isComplete: true, hasAdminUser: false });
    await request(server).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', token).send(payload).expect(409);
  });

  it('rolls back account, claim and configuration after a partial save failure, then permits retry', async () => {
    const server = app();
    const save = SetupService.prototype.saveConfig;
    const fault = vi.spyOn(SetupService.prototype, 'saveConfig').mockImplementationOnce(async function(config) {
      await save.call(this, config);
      throw new Error('injected save failure');
    });
    await request(server).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', token)
      .send({ ...payload, allowSelfRegistration: true }).expect(500);
    expect(await db.getAdapter().query('SELECT * FROM users')).toEqual([]);
    expect(await new SetupService(db.getAdapter()).isSetupComplete()).toBe(false);
    expect(await new SetupService(db.getAdapter()).getConfig()).toMatchObject({ allowSelfRegistration: false });
    fault.mockRestore();
    await request(server).post('/api/setup/initialize').set('X-Pabawi-Bootstrap-Token', token).send(payload).expect(201);
  });
});
