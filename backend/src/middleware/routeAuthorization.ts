import type { RequestHandler } from "express";

/**
 * Factory that produces an Express middleware enforcing `<resource>:<action>`
 * for the authenticated principal.
 *
 * `server.ts` builds the real implementation from `createRbacMiddleware()`.
 * Route factories accept it as a **required** parameter so that a new mount
 * cannot silently ship without authorization: omitting it is a compile error,
 * not a runtime hole (finding S01).
 */
export type PermissionMiddlewareFactory = (
  resource: string,
  action: string,
) => RequestHandler;

/**
 * Passthrough factory. It performs NO authorization and must never be used by
 * the assembled application. It exists only for unit tests that mount a single
 * router without the database/auth stack.
 */
export const noPermissionCheck: PermissionMiddlewareFactory =
  () => (_req, _res, next): void => { next(); };
