import type { Request, Response, NextFunction } from 'express';
import { ExpertModeService } from '../services/ExpertModeService';

// Extend Express Request to include expert mode flag and correlation ID
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      expertMode?: boolean;
      correlationId?: string;
    }
  }
}

/**
 * Expert Mode Middleware
 *
 * Detects expert mode from request header (X-Expert-Mode: true)
 * and attaches the flag to the request object for downstream use.
 * Also extracts correlation ID from X-Correlation-ID header for
 * frontend log correlation.
 *
 * Security: When a user is authenticated, expert mode is only enabled
 * for users with the 'admin' role. This prevents unprivileged users
 * from accessing stack traces, raw output, and debug info.
 * When no authentication is active (req.user not set), expert mode
 * is allowed for backward compatibility with localhost usage.
 *
 * This middleware should be applied early in the middleware chain
 * to ensure expert mode status is available to all route handlers.
 *
 * Usage:
 *   app.use(expertModeMiddleware);
 *
 * The expert mode flag can then be accessed in route handlers:
 *   if (req.expertMode) {
 *     // Include debug information in response
 *   }
 */
export function expertModeMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const expertModeService = new ExpertModeService();

  // Check if expert mode is requested via header
  const requested = expertModeService.isExpertModeEnabled(req);

  if (requested && req.user) {
    // When authenticated, only allow admin users to enable expert mode
    const isAdmin = req.user.roles?.includes('admin') ?? false;
    req.expertMode = isAdmin;
  } else {
    // No auth context yet (middleware runs before auth) — defer final check.
    // The value will be re-evaluated if needed after auth middleware runs.
    // For unauthenticated endpoints (health, setup), allow expert mode.
    req.expertMode = requested;
  }

  // Extract correlation ID if present
  const correlationIdHeader = req.headers['x-correlation-id'];
  if (correlationIdHeader && typeof correlationIdHeader === 'string') {
    req.correlationId = correlationIdHeader;
  }

  next();
}
