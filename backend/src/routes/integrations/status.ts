import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { PuppetDBService } from "../../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../../integrations/puppetserver/PuppetserverService";
import { asyncHandler } from "../asyncHandler";
import { requestDeduplication } from "../../middleware/deduplication";
import { ExpertModeService } from "../../services/ExpertModeService";
import { createLogger } from "./utils";

/**
 * Create status router for integration health status
 */
export function createStatusRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
): Router {
  const router = Router();
  const logger = createLogger();

  /**
   * GET /api/integrations/status
   * Return status for all configured and available integrations
   *
   * Implements requirement 9.5: Display connection status for each integration source
   * Returns:
   * - Connection status for each integration
   * - Last health check time
   * - Error details if unhealthy
   * - Configuration status for available but unconfigured integrations
   *
   * Query parameters:
   * - refresh: If 'true', force a fresh health check instead of using cache
   */
  router.get(
    "/",
    requestDeduplication,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();
      const refresh = req.query.refresh === "true";

      logger.info("Fetching integration status", {
        component: "StatusRouter",
        operation: "getStatus",
        metadata: { refresh },
      });

      try {
        // Get health status from all registered plugins
        // Use cache unless refresh is explicitly requested
        const healthStatuses =
          await integrationManager.healthCheckAll(!refresh);

        logger.debug("Health check completed", {
          component: "StatusRouter",
          operation: "getStatus",
          metadata: { integrationCount: healthStatuses.size, refresh },
        });

        // Transform health statuses into response format
        const integrations = Array.from(healthStatuses.entries()).map(
          ([name, status]) => {
            // Get plugin registration to include type information
            const plugins = integrationManager.getAllPlugins();
            const plugin = plugins.find((p) => p.plugin.name === name);

            // Determine status: degraded takes precedence over error
            let integrationStatus: string;
            if (status.healthy) {
              integrationStatus = "connected";
            } else if (status.degraded) {
              integrationStatus = "degraded";
              logger.warn(`Integration ${name} is degraded`, {
                component: "StatusRouter",
                integration: name,
                operation: "getStatus",
              });

              // Capture warning in expert mode
              if (req.expertMode) {
                const expertModeService = new ExpertModeService();
                const requestId = req.id ?? expertModeService.generateRequestId();
                const debugInfo = expertModeService.createDebugInfo(
                  'GET /api/integrations/status',
                  requestId,
                  Date.now() - startTime
                );
                expertModeService.addWarning(debugInfo, {
                  message: `Integration ${name} is degraded`,
                  context: status.message,
                  level: 'warn',
                });
              }
            } else {
              integrationStatus = "error";
              logger.error(`Integration ${name} has error`, {
                component: "StatusRouter",
                integration: name,
                operation: "getStatus",
                metadata: { message: status.message },
              });

              // Capture error in expert mode
              if (req.expertMode) {
                const expertModeService = new ExpertModeService();
                const requestId = req.id ?? expertModeService.generateRequestId();
                const debugInfo = expertModeService.createDebugInfo(
                  'GET /api/integrations/status',
                  requestId,
                  Date.now() - startTime
                );
                expertModeService.addError(debugInfo, {
                  message: `Integration ${name} has error`,
                  code: status.message,
                  level: 'error',
                });
              }
            }

            return {
              name,
              type: plugin?.plugin.type ?? "unknown",
              status: integrationStatus,
              lastCheck: status.lastCheck,
              message: status.message,
              details: status.details,
              workingCapabilities: status.workingCapabilities,
              failingCapabilities: status.failingCapabilities,
            };
          },
        );

        // Add unconfigured integrations (like PuppetDB or Puppetserver if not configured)
        const configuredNames = new Set(integrations.map((i) => i.name));

        // Check if PuppetDB is not configured
        if (!puppetDBService && !configuredNames.has("puppetdb")) {
          logger.debug("PuppetDB integration is not configured", {
            component: "StatusRouter",
            integration: "puppetdb",
            operation: "getStatus",
          });
          integrations.push({
            name: "puppetdb",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "PuppetDB integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Puppetserver is not configured
        if (!puppetserverService && !configuredNames.has("puppetserver")) {
          logger.debug("Puppetserver integration is not configured", {
            component: "StatusRouter",
            integration: "puppetserver",
            operation: "getStatus",
          });
          integrations.push({
            name: "puppetserver",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Puppetserver integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Bolt is not configured
        if (!configuredNames.has("bolt")) {
          logger.debug("Bolt integration is not configured", {
            component: "StatusRouter",
            integration: "bolt",
            operation: "getStatus",
          });
          integrations.push({
            name: "bolt",
            type: "both",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Bolt integration is not configured",
            details: undefined,
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        // Check if Hiera is not configured
        if (!configuredNames.has("hiera")) {
          logger.debug("Hiera integration is not configured", {
            component: "StatusRouter",
            integration: "hiera",
            operation: "getStatus",
          });
          integrations.push({
            name: "hiera",
            type: "information",
            status: "not_configured",
            lastCheck: new Date().toISOString(),
            message: "Hiera integration is not configured",
            details: {
              setupRequired: true,
              setupUrl: "/integrations/hiera/setup",
            },
            workingCapabilities: undefined,
            failingCapabilities: undefined,
          });
        }

        const duration = Date.now() - startTime;
        const responseData = {
          integrations,
          timestamp: new Date().toISOString(),
          cached: !refresh,
        };

        logger.info("Integration status fetched successfully", {
          component: "StatusRouter",
          operation: "getStatus",
          metadata: { integrationCount: integrations.length, duration, cached: !refresh },
        });

        // Attach debug info if expert mode is enabled
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/integrations/status',
            requestId,
            duration
          );
          expertModeService.addMetadata(debugInfo, 'refresh', refresh);
          expertModeService.addMetadata(debugInfo, 'integrationCount', integrations.length);
          expertModeService.setCacheHit(debugInfo, !refresh);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved status for ${integrations.length} integrations`,
            level: 'info',
          });

          // Add performance metrics
          const perfMetrics = expertModeService.collectPerformanceMetrics();
          debugInfo.performance = perfMetrics;

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error fetching integration status", {
          component: "StatusRouter",
          operation: "getStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode
        if (req.expertMode) {
          const expertModeService = new ExpertModeService();
          const requestId = req.id ?? expertModeService.generateRequestId();
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/integrations/status',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Error fetching integration status",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch integration status",
          },
        });
      }
    }),
  );

  return router;
}
