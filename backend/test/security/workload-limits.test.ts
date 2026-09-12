import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { McpWorkloadLimiter } from '../../src/mcp/McpWorkloadLimiter';
import type { Request, Response } from 'express';
import { createAuthRateLimitMiddleware, createSsoRateLimitMiddleware, createRefreshRateLimitMiddleware, createRateLimitMiddleware, createMcpConcurrencyMiddleware } from '../../src/middleware/securityMiddleware';

describe('workload limits', () => {
  it('query strings and forged forwarded IPs cannot bypass credential attempts', async () => {
    const app = express();
    app.use('/api/auth', createAuthRateLimitMiddleware());
    app.post('/api/auth/login', (_req, res) => res.sendStatus(401));
    for (let i = 0; i < 10; i++) await request(app).post(`/api/auth/login?next=/entra-id/${i}`).set('X-Forwarded-For', `192.0.2.${i}`).expect(401);
    await request(app).post('/api/auth/login?next=/entra-id/login').expect(429);
  });

  it('SSO allocation and refresh have separate finite budgets behind the default proxy topology', async () => {
    const app = express(); let allocations = 0;
    app.use('/api/auth', createAuthRateLimitMiddleware(), createRefreshRateLimitMiddleware());
    app.post('/api/auth/refresh', (_req, res) => res.sendStatus(200));
    app.use('/api/auth/entra-id', createSsoRateLimitMiddleware());
    app.get('/api/auth/entra-id/login', (_req, res) => { allocations++; res.sendStatus(200); });
    for (let i = 0; i < 30; i++) {
      await request(app).get('/api/auth/entra-id/login').expect(200);
      await request(app).post('/api/auth/refresh').expect(200);
    }
    await request(app).get('/api/auth/entra-id/login').expect(429);
    await request(app).post('/api/auth/refresh').expect(429);
    expect(allocations).toBe(30);
  });

  it('authenticated request budgets follow the account, independently of session and auth method', async () => {
    const app = express();
    app.use((req, _res, next) => { req.user = { userId: req.get('test-user') ?? 'one' } as Request['user']; next(); });
    app.use('/mcp', createRateLimitMiddleware());
    app.post('/mcp', (_req, res) => res.sendStatus(200));
    for (let i = 0; i < 100; i++) await request(app).post('/mcp').set('mcp-session-id', String(i)).expect(200);
    await request(app).post('/mcp').expect(429);
    await request(app).post('/mcp').set('test-user', 'two').expect(200);
  });

  it('bounds concurrent requests globally and per account, releasing exactly once', () => {
    const middleware = createMcpConcurrencyMiddleware();
    const responses: EventEmitter[] = [];
    function attempt(account: string): number {
      const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader() {}, status(code: number) { this.statusCode = code; return this; }, json() {} });
      middleware({ user: { userId: account } } as Request, res as unknown as Response, () => { responses.push(res); });
      return res.statusCode;
    }
    for (let i = 0; i < 4; i++) expect(attempt('one')).toBe(200);
    expect(attempt('one')).toBe(429);
    responses[0].emit('finish'); responses[0].emit('close');
    expect(attempt('one')).toBe(200); expect(attempt('one')).toBe(429);
    for (let i = 0; i < 16; i++) expect(attempt(`other-${i}`)).toBe(200);
    expect(attempt('another')).toBe(429);
  });
});


it('bounds provider work globally across accounts and releases each reservation once', () => {
  const limiter = new McpWorkloadLimiter();
  const releases = Array.from({ length: 20 }, (_, i) => limiter.acquire(`account-${Math.floor(i / 4)}`));
  expect(releases.every(Boolean)).toBe(true);
  expect(limiter.acquire('another')).toBeUndefined();
  releases[0]!(); releases[0]!();
  expect(limiter.acquire('another')).toBeTypeOf('function');
  expect(limiter.acquire('yet-another')).toBeUndefined();
});
