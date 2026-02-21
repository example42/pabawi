import type { Request, Response, NextFunction } from "express";
import { PermissionService } from "../services/PermissionService";
import { AuditLoggingService } from "../services/AuditLoggingService";
import type { Database } from "sqlite3";
import { ERROR_CODES, sendAuthorizationError, sendDatabaseError, isDatabaseConnectionError } from "../utils/errorHandling";

/**
 * RBAC middleware factory that creates middleware to check user permissions
 *
 * This middleware must be used AFTER authMiddleware, as it depends on req.user
 * being populated with the authenticated user's information.
 *
 * Usage:
 *   app.get('/api/ansible/inventory',
 *     authMiddleware,
 *     rbacMiddleware('ansible', 'read'),
 *     handler
 *   );
 *
 * Requirements: 5.2, 5.3, 5.4, 7.4, 16.2, 16.5
 */
export function createRbacMiddleware(db: Database) {
  const permissionService = new PermissionService(db);
  const auditLogger = new AuditLoggingService(db);

  /**
   * Create middleware that checks for a specific permission
   *
   * @param resource - Resource identifier (e.g., 'ansible', 'bolt', 'puppetdb')
   * @param action - Action identifier (e.g., 'read', 'write', 'execute', 'admin')
   * @returns Express middleware function
   */
  return function rbacMiddleware(resource: string, action: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Ensure user is authenticated (authMiddleware should run first)
        if (!req.user || !req.user.userId) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Authentication required. Please login first."
            }
          });
          return;
        }

        // Check if user has the required permission (Requirements 5.2, 5.3, 5.4)
        const hasPermission = await permissionService.hasPermission(
          req.user.userId,
          resource,
          action
        );

        if (!hasPermission) {
          // Log authorization failure for security monitoring (Requirement 7.4)
          console.warn(
            `[RBAC] Authorization denied - User: ${req.user.username} (${req.user.userId}), ` +
            `Resource: ${resource}, Action: ${action}, ` +
            `Path: ${req.method} ${req.path}, ` +
            `IP: ${req.ip || req.socket.remoteAddress}, ` +
            `Timestamp: ${new Date().toISOString()}`
          );

          // Audit log: authorization failure
          await auditLogger.logAuthorizationFailure(
            req.user.userId,
            resource,
            action,
            req.ip || req.socket.remoteAddress,
            req.headers['user-agent']
          );

          // Return 403 Forbidden with required permission (Requirement 16.2)
          sendAuthorizationError(res, resource, action);
          return;
        }

        // User has permission - continue to next middleware/handler
        next();
      } catch (error) {
        // Check for database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          sendDatabaseError(res, error, "Authorization service temporarily unavailable");
          return;
        }

        // Log unexpected errors
        console.error(
          `[RBAC] Error checking permissions - User: ${req.user?.userId}, ` +
          `Resource: ${resource}, Action: ${action}, ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );

        // Return 500 Internal Server Error for unexpected errors
        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to check permissions"
          }
        });
      }
    };
  };
}
