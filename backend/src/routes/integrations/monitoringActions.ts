/**
 * Checkmk Monitoring Action Routes (write)
 *
 * Mutating actions against the Checkmk monitoring system:
 * - Acknowledge a service problem
 * - Schedule a service downtime window
 *
 * RBAC (`checkmk:write`) is applied at the mount level in server.ts. These
 * routes are intentionally separate from the read-only overview/services
 * routers so the write permission is never required to read monitoring data.
 *
 * Every successful action is recorded in the audit log with the acting user,
 * the target host/service, and the supplied comment.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { CheckmkPlugin } from "../../integrations/checkmk/CheckmkPlugin";
import type { DatabaseService } from "../../database/DatabaseService";
import { AuditLoggingService } from "../../services/AuditLoggingService";
import { asyncHandler } from "../asyncHandler";
import {
  type DIContainer,
  createDefaultContainer,
} from "../../container/DIContainer";

/** 30-second timeout for upstream Checkmk API calls. */
const UPSTREAM_TIMEOUT_MS = 30_000;

/** Maximum downtime window we accept in one request: 7 days. */
const MAX_DOWNTIME_MS = 7 * 24 * 60 * 60 * 1000;

const AcknowledgeSchema = z
  .object({
    hostname: z.string().min(1).max(255),
    serviceDescription: z.string().min(1).max(512),
    comment: z.string().min(1).max(1000),
    sticky: z.boolean().optional().default(true),
    persistent: z.boolean().optional().default(false),
    notify: z.boolean().optional().default(true),
  })
  .strict();

const DowntimeSchema = z
  .object({
    hostname: z.string().min(1).max(255),
    serviceDescription: z.string().min(1).max(512),
    comment: z.string().min(1).max(1000),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  })
  .strict()
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  })
  .refine(
    (data) =>
      new Date(data.endTime).getTime() - new Date(data.startTime).getTime() <=
      MAX_DOWNTIME_MS,
    { message: "downtime window must not exceed 7 days", path: ["endTime"] },
  );

/**
 * Create the Checkmk monitoring action router (write operations).
 *
 * Endpoints (mounted under /api/monitoring):
 *   POST /acknowledge — acknowledge a service problem
 *   POST /downtime    — schedule a service downtime window
 */
export function createMonitoringActionsRouter(
  integrationManager: IntegrationManager,
  databaseService: DatabaseService,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const auditLogger = new AuditLoggingService(databaseService.getAdapter());

  function getCheckmkPlugin(): CheckmkPlugin | null {
    return integrationManager.getInformationSource(
      "checkmk",
    ) as CheckmkPlugin | null;
  }

  router.post(
    "/acknowledge",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const plugin = getCheckmkPlugin();
      if (!plugin?.isInitialized()) {
        res.status(503).json({
          error: {
            code: "CHECKMK_NOT_CONFIGURED",
            message: "Checkmk monitoring integration is not configured",
          },
        });
        return;
      }

      const parsed = AcknowledgeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid acknowledge request",
            details: parsed.error.errors,
          },
        });
        return;
      }

      const { hostname, serviceDescription, comment, sticky, persistent, notify } =
        parsed.data;

      const result = await Promise.race([
        plugin.acknowledgeServiceProblem({
          hostname,
          serviceDescription,
          comment,
          sticky,
          persistent,
          notify,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Upstream timeout"));
          }, UPSTREAM_TIMEOUT_MS);
        }),
      ]);

      if (!result.success) {
        logger.error("Checkmk acknowledge failed", {
          component: "MonitoringActionsRouter",
          integration: "checkmk",
          operation: "acknowledge",
          metadata: { hostname, serviceDescription, error: result.error },
        });
        res.status(502).json({
          error: {
            code: "UPSTREAM_ERROR",
            message: `Checkmk acknowledge failed: ${result.error ?? "unknown error"}`,
          },
        });
        return;
      }

      if (req.user) {
        await auditLogger.logAdminAction(
          "checkmk_acknowledge",
          req.user.userId,
          { hostname, serviceDescription, comment, sticky, persistent, notify },
          req.ip,
          req.get("user-agent") ?? undefined,
        );
      }

      res.json({ success: true });
    }),
  );

  router.post(
    "/downtime",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const plugin = getCheckmkPlugin();
      if (!plugin?.isInitialized()) {
        res.status(503).json({
          error: {
            code: "CHECKMK_NOT_CONFIGURED",
            message: "Checkmk monitoring integration is not configured",
          },
        });
        return;
      }

      const parsed = DowntimeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid downtime request",
            details: parsed.error.errors,
          },
        });
        return;
      }

      const { hostname, serviceDescription, comment, startTime, endTime } =
        parsed.data;

      const result = await Promise.race([
        plugin.scheduleServiceDowntime({
          hostname,
          serviceDescription,
          comment,
          startTime,
          endTime,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Upstream timeout"));
          }, UPSTREAM_TIMEOUT_MS);
        }),
      ]);

      if (!result.success) {
        logger.error("Checkmk downtime scheduling failed", {
          component: "MonitoringActionsRouter",
          integration: "checkmk",
          operation: "downtime",
          metadata: { hostname, serviceDescription, error: result.error },
        });
        res.status(502).json({
          error: {
            code: "UPSTREAM_ERROR",
            message: `Checkmk downtime scheduling failed: ${result.error ?? "unknown error"}`,
          },
        });
        return;
      }

      if (req.user) {
        await auditLogger.logAdminAction(
          "checkmk_downtime",
          req.user.userId,
          { hostname, serviceDescription, comment, startTime, endTime },
          req.ip,
          req.get("user-agent") ?? undefined,
        );
      }

      res.json({ success: true });
    }),
  );

  return router;
}
