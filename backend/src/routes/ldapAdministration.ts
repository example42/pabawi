import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseService } from '../database/DatabaseService';
import type { DIContainer } from '../container/DIContainer';
import type { LdapDirectoryGroup, LdapDirectoryService } from '../services/LdapDirectoryService';
import { LdapDirectoryError } from '../services/LdapDirectoryService';
import { LdapAdministrationError, type LdapAuditActor, type LdapMappingService } from '../services/LdapMappingService';
import { createAuthMiddleware } from '../middleware/authMiddleware';
import { createRbacMiddleware } from '../middleware/rbacMiddleware';
import { createRateLimitMiddleware } from '../middleware/securityMiddleware';
import { asyncHandler } from './asyncHandler';

const text = z.string().min(1).max(1024).refine(value => Buffer.byteLength(value) <= 1024);
const subject = z.string().uuid();
const searchSchema = z.object({ query: text, cursor: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
const createSchema = z.object({ groupSubject: subject, roleId: z.string().min(1).max(128) }).strict();
const updateSchema = z.object({ roleId: z.string().min(1).max(128).optional(), enabled: z.boolean().optional() })
  .strict().refine(value => value.roleId !== undefined || value.enabled !== undefined);
const diagnosticSchema = z.object({ username: text.optional(), groupSubjects: z.array(subject).max(20).optional() })
  .strict().refine(value => !value.groupSubjects?.length || value.username !== undefined);

function actor(req: Request): LdapAuditActor {
  assert(req.user, 'LDAP administration requires an authenticated audit actor');
  return { userId: req.user.userId, ip: req.ip, userAgent: req.headers['user-agent'] };
}

function directoryStatus(code: string): number {
  if (code === 'BUSY') return 429;
  if (['INVALID_IDENTITY', 'INELIGIBLE', 'IDENTITY_CHANGED'].includes(code)) return 422;
  return 503;
}

export function createLdapAdministrationRouter(database: DatabaseService, container: DIContainer): Router {
  const router = Router();
  const db = database.getAdapter();
  const logger = container.resolve('logger');
  const services = (): { directory: LdapDirectoryService; mappings: LdapMappingService } => {
    const directory = container.resolve('ldapDirectory');
    const mappings = container.resolve('ldapMappings');
    assert(directory && mappings, 'LDAP administration requires configured services');
    return { directory, mappings };
  };
  const guards = [
    asyncHandler(createAuthMiddleware(db, container.resolve('config').getJwtSecret())),
    asyncHandler(createRbacMiddleware(db)('rbac', 'admin')),
    createRateLimitMiddleware(),
    (_req: Request, res: Response, next: NextFunction): void => {
      res.setHeader('Cache-Control', 'no-store');
      if (!container.has('ldapDirectory') || !container.has('ldapMappings')) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
        return;
      }
      next();
    },
  ];
  const diagnosticsLimit = rateLimit({
    windowMs: 60_000, limit: 10, keyGenerator: req => actor(req).userId,
    standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'LDAP diagnostic limit reached' } },
  });
  interface Page { groups: LdapDirectoryGroup[]; offset: number; query: string; actorId: string; expires: number }
  const pages = new Map<string, Page>();
  const pageSize = 50;
  const page = (snapshot: Page): { items: LdapDirectoryGroup[]; nextCursor: string | null } => {
    const items = snapshot.groups.slice(snapshot.offset, snapshot.offset + pageSize);
    let nextCursor: string | null = null;
    if (snapshot.offset + items.length < snapshot.groups.length) {
      nextCursor = randomBytes(32).toString('hex');
      for (const [key, value] of pages) if (value.expires <= Date.now()) pages.delete(key);
      while (pages.size >= 64) { const oldest = pages.keys().next().value; if (oldest) pages.delete(oldest); }
      pages.set(nextCursor, { ...snapshot, offset: snapshot.offset + items.length });
    }
    return { items, nextCursor };
  };

  router.get('/groups', ...guards, asyncHandler(async (req, res): Promise<void> => {
    const input = searchSchema.parse(req.query);
    const userId = actor(req).userId;
    if (input.cursor) {
      const snapshot = pages.get(input.cursor);
      if (!snapshot || snapshot.expires <= Date.now() || snapshot.query !== input.query || snapshot.actorId !== userId) {
        throw new LdapAdministrationError('INVALID_CURSOR');
      }
      res.json(page(snapshot));
    } else {
      const groups = await services().directory.searchGroups(input.query);
      res.json(page({ groups, offset: 0, query: input.query, actorId: userId, expires: Date.now() + 60_000 }));
    }
  }));

  router.get('/mappings', ...guards, asyncHandler(async (req, res): Promise<void> => {
    z.object({}).strict().parse(req.query);
    res.json({ items: await services().mappings.list() });
  }));

  router.post('/mappings', ...guards, asyncHandler(async (req, res): Promise<void> => {
    const input = createSchema.parse(req.body);
    const mapping = await services().mappings.create(input.groupSubject, input.roleId, actor(req));
    res.status(201).json(mapping);
  }));

  router.put('/mappings/:id', ...guards, asyncHandler(async (req, res): Promise<void> => {
    const input = updateSchema.parse(req.body);
    res.json(await services().mappings.update(req.params.id, input, actor(req)));
  }));

  router.delete('/mappings/:id', ...guards, asyncHandler(async (req, res): Promise<void> => {
    await services().mappings.remove(req.params.id, actor(req));
    res.sendStatus(204);
  }));

  router.post('/test', ...guards, diagnosticsLimit, asyncHandler(async (req, res): Promise<void> => {
    const input = diagnosticSchema.parse(req.body);
    const mappings = await services().mappings.list();
    const mapped = new Set(mappings.filter(mapping => mapping.enabled).map(mapping => mapping.groupSubject));
    if (input.groupSubjects?.some(value => !mapped.has(value.toLowerCase()))) {
      res.status(400).json({ error: { code: 'INVALID_GROUP_SELECTION', message: 'Select enabled mapped groups' } });
      return;
    }
    const result = await services().directory.diagnose(input);
    const failure = result.stages.find(stage => stage.status === 'failed');
    res.status(failure ? directoryStatus(failure.code ?? 'UNAVAILABLE') : 200).json(result);
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid LDAP administration request' } });
      return;
    }
    if (error instanceof LdapAdministrationError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_CURSOR' ? 400 : 409;
      res.status(status).json({ error: { code: error.code, message: 'LDAP administration request failed' } });
      return;
    }
    if (error instanceof LdapDirectoryError) {
      res.status(directoryStatus(error.code)).json({ error: { code: error.code, message: 'LDAP directory operation failed' } });
      return;
    }
    logger.error('LDAP administration request failed', { component: 'LdapAdministrationRouter', operation: 'request' });
    res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'LDAP administration request failed' } });
  });
  return router;
}
