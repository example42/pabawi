import type { RequestHandler } from "express";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { PermissionService } from "../services/PermissionService";
import { asyncHandler } from "../routes/asyncHandler";

export function createSourceAuthorization(db: DatabaseAdapter, manager: IntegrationManager): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (!req.user?.userId) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }
    // Resolve the scope afresh so a cached response cannot retain a revoked source.
    const permissions = new PermissionService(db);
    const names = [...new Set(["bolt", ...manager.getAllInformationSources().map(source => source.name)])];
    const allowed: string[] = [];
    for (const name of names) {
      if (await permissions.hasPermission(req.user.userId, name, "read")) allowed.push(name);
    }
    if (allowed.length === 0) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "No authorized information sources" } });
      return;
    }
    req.authorizedSources = allowed;
    next();
  });
}
