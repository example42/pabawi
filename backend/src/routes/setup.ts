/**
 * Setup Routes - First Run Configuration
 *
 * Part of v1.0.0 Modular Plugin Architecture
 *
 * Provides REST API endpoints for first-run setup:
 * - GET /api/setup/status - Check if setup is required
 * - POST /api/setup/admin - Create initial admin user
 * - GET /api/setup/password-policy - Get password policy requirements
 *
 * These endpoints do NOT require authentication and are only functional
 * when no users exist in the system.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { SetupService, type InitialAdminInput } from "../auth/SetupService.js";
import { LoggerService } from "../services/LoggerService.js";
import { ExpertModeService } from "../services/ExpertModeService.js";

/**
 * Configuration for setup routes
 */
export interface SetupRoutesConfig {
  /** Database adapter */
  db: DatabaseAdapter;
  /** Password policy overrides (optional) */
  passwordPolicy?: {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  };
}

/**
 * Create setup router factory
 */
export function createSetupRouter(config: SetupRoutesConfig): Router {
  const router = Router();
  const logger = new LoggerService();
  const expertModeService = new ExpertModeService();

  const setupService = new SetupService(config.db, config.passwordPolicy);

  // Async handler wrapper
  const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  /**
   * GET /api/setup/status
   * Check if initial setup is required
   */
  router.get(
    "/status",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Checking setup status", {
        component: "SetupRouter",
        operation: "status",
      });

      const status = await setupService.getSetupStatus();

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/setup/status",
          req.correlationId || "setup-status",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(status, debugInfo));
        return;
      }

      res.json(status);
    })
  );

  /**
   * GET /api/setup/password-policy
   * Get password policy requirements for UI display
   */
  router.get(
    "/password-policy",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Getting password policy", {
        component: "SetupRouter",
        operation: "password-policy",
      });

      const policy = setupService.getPasswordPolicy();

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/setup/password-policy",
          req.correlationId || "setup-password-policy",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ policy }, debugInfo));
        return;
      }

      res.json({ policy });
    })
  );

  /**
   * POST /api/setup/admin
   * Create the initial admin user
   *
   * This endpoint only works when no users exist in the system.
   */
  router.post(
    "/admin",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Attempting initial admin creation", {
        component: "SetupRouter",
        operation: "createAdmin",
        metadata: { username: req.body?.username, email: req.body?.email },
      });

      // Check if setup is still required
      const status = await setupService.getSetupStatus();
      if (!status.setupRequired) {
        logger.warn("Setup already complete - rejecting admin creation", {
          component: "SetupRouter",
          operation: "createAdmin",
        });

        res.status(403).json({
          error: "Setup has already been completed",
          code: "SETUP_COMPLETE",
          message: "The initial admin user has already been created. Please log in.",
        });
        return;
      }

      // Validate input
      const { username, email, password, displayName } = req.body as Partial<InitialAdminInput>;

      if (!username || !email || !password) {
        res.status(400).json({
          error: "Missing required fields",
          code: "INVALID_INPUT",
          message: "Username, email, and password are required",
        });
        return;
      }

      // Create admin user
      const result = await setupService.createInitialAdmin({
        username,
        email,
        password,
        displayName,
      });

      if (!result.success) {
        logger.warn("Initial admin creation failed", {
          component: "SetupRouter",
          operation: "createAdmin",
          metadata: { error: result.error },
        });

        res.status(400).json({
          error: result.error,
          code: "CREATION_FAILED",
        });
        return;
      }

      logger.info("Initial admin user created successfully", {
        component: "SetupRouter",
        operation: "createAdmin",
        metadata: { userId: result.userId, username },
      });

      const response = {
        success: true,
        message: "Administrator account created successfully",
        userId: result.userId,
      };

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "POST /api/setup/admin",
          req.correlationId || "setup-admin",
          duration
        );
        expertModeService.addInfo(debugInfo, {
          message: "Admin user created",
          context: JSON.stringify({ userId: result.userId, username }),
          level: "info",
        });
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.status(201).json(expertModeService.attachDebugInfo(response, debugInfo));
        return;
      }

      res.status(201).json(response);
    })
  );

  /**
   * POST /api/setup/validate-password
   * Validate a password against the policy (for UI feedback)
   */
  router.post(
    "/validate-password",
    asyncHandler(async (req: Request, res: Response) => {
      const { password } = req.body as { password?: string };

      if (!password) {
        res.status(400).json({
          error: "Password is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      const validation = setupService.validatePassword(password);

      res.json({
        valid: validation.valid,
        errors: validation.errors,
      });
    })
  );

  return router;
}

export default createSetupRouter;
