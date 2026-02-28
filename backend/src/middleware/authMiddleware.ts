import type { Request, Response, NextFunction } from "express";
import { AuthenticationService } from "../services/AuthenticationService";
import type { Database } from "sqlite3";
import { ERROR_CODES, sendAuthenticationError, sendDatabaseError, isDatabaseConnectionError } from "../utils/errorHandling";

// Extend Express Request to include user payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        roles: string[];
        iat: number;
        exp: number;
      };
    }
  }
}

/**
 * Authentication middleware that verifies JWT tokens
 *
 * Extracts JWT token from Authorization header, verifies signature and expiration,
 * checks token revocation list, and attaches user payload to request object.
 *
 * Requirements: 5.1, 6.6, 16.1, 16.5
 */
export function createAuthMiddleware(db: Database, jwtSecret?: string) {
  const authService = new AuthenticationService(db, jwtSecret);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Missing authorization header"
          }
        });
        return;
      }

      // Check for Bearer token format
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Invalid authorization header format. Expected 'Bearer <token>'"
          }
        });
        return;
      }

      // Extract token
      const token = authHeader.substring(7); // Remove "Bearer " prefix

      if (!token) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Missing token"
          }
        });
        return;
      }

      // Verify token (includes signature, expiration, and revocation checks)
      const payload = await authService.verifyToken(token);

      // Attach user payload to request object
      req.user = {
        userId: payload.userId,
        username: payload.username,
        roles: payload.roles,
        iat: payload.iat,
        exp: payload.exp
      };

      // Continue to next middleware
      next();
    } catch (error) {
      // Check for database connection errors (Requirement 16.5)
      if (isDatabaseConnectionError(error)) {
        sendDatabaseError(res, error, "Authentication service temporarily unavailable");
        return;
      }

      // Handle specific authentication error cases (Requirement 16.1)
      if (error instanceof Error) {
        const message = error.message;

        if (message === "Token expired") {
          res.status(401).json({
            error: {
              code: ERROR_CODES.TOKEN_EXPIRED,
              message: "Token has expired. Please refresh your token or login again."
            }
          });
          return;
        }

        if (message === "Token has been revoked") {
          res.status(401).json({
            error: {
              code: ERROR_CODES.TOKEN_REVOKED,
              message: "Token has been revoked. Please login again."
            }
          });
          return;
        }

        if (message === "Invalid token") {
          res.status(401).json({
            error: {
              code: ERROR_CODES.INVALID_TOKEN,
              message: "Invalid token signature"
            }
          });
          return;
        }
      }

      // Generic authentication error response (Requirement 16.1)
      sendAuthenticationError(res, "Authentication failed");
    }
  };
}
