/**
 * Centralized Express.Request augmentation for Pabawi.
 *
 * Consolidates the request extensions previously scattered across middleware files
 * (authMiddleware.ts, expertMode.ts, errorHandler.ts) into a single declaration file.
 *
 * This file is automatically included via tsconfig include glob.
 */

 
declare namespace Express {
  interface Request {
    /** Authenticated user payload attached by authMiddleware */
    user?: {
      userId: string;
      username: string;
      roles: string[];
      iat: number;
      exp: number;
    };
    /** Expert mode flag set by expertMode middleware (role-gated for authenticated users) */
    expertMode?: boolean;
    /** Correlation ID from X-Correlation-ID header for frontend log correlation */
    correlationId?: string;
    /** Request ID for tracing */
    id?: string;
    /** Bolt command string attached during execution routes */
    boltCommand?: string;
  }
}
