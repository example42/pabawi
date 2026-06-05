import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { AnsiblePlugin } from "../integrations/ansible/AnsiblePlugin";
import { asyncHandler } from "./asyncHandler";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

/**
 * Regex for safe playbook paths:
 * - Must be relative (no leading /)
 * - No path traversal (..)
 * - Alphanumeric, hyphens, underscores, slashes, dots only
 * - Must end in .yml or .yaml
 */
const SAFE_PLAYBOOK_PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_\-/.]*\.ya?ml$/;

const PlaybookPathQuerySchema = z.object({
  path: z.string()
    .min(1, "Playbook path is required")
    .max(500, "Playbook path too long")
    .regex(SAFE_PLAYBOOK_PATH_PATTERN, "Invalid playbook path")
    .refine((p) => !p.includes(".."), { message: "Path traversal not allowed" })
    .refine((p) => !p.startsWith("/"), { message: "Absolute paths not allowed" }),
});

/**
 * Create playbook browser router.
 *
 * Provides endpoints for browsing available Ansible playbook files
 * and retrieving playbook details with auto-detected parameters.
 */
export function createPlaybookBrowserRouter(
  integrationManager: IntegrationManager,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  /**
   * GET /api/playbooks
   * List all discovered playbook files in ANSIBLE_PROJECT_PATH
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/playbooks", requestId, 0)
        : null;

      try {
        const ansiblePlugin = integrationManager.getExecutionTool("ansible") as AnsiblePlugin | null;

        if (!ansiblePlugin) {
          const errorResponse = {
            error: {
              code: "ANSIBLE_NOT_AVAILABLE",
              message: "Ansible integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        const ansibleService = ansiblePlugin.getAnsibleService();
        const playbooks = await Promise.resolve(ansibleService.listPlaybooks());

        const duration = Date.now() - startTime;

        logger.info("Playbooks listed successfully", {
          component: "PlaybookBrowserRouter",
          integration: "ansible",
          operation: "listPlaybooks",
          metadata: { playbookCount: playbooks.length, duration },
        });

        const responseData = { playbooks };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "ansible");
          expertModeService.addMetadata(debugInfo, "playbookCount", playbooks.length);
          expertModeService.addInfo(debugInfo, {
            message: `Discovered ${String(playbooks.length)} playbook files`,
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error listing playbooks", {
          component: "PlaybookBrowserRouter",
          integration: "ansible",
          operation: "listPlaybooks",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list playbooks",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
        );
      }
    }),
  );

  /**
   * GET /api/playbooks/details?path=playbooks/site.yml
   * Get playbook content and auto-detected parameters
   */
  router.get(
    "/details",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/playbooks/details", requestId, 0)
        : null;

      try {
        const query = PlaybookPathQuerySchema.parse(req.query);
        const playbookPath = query.path;

        const ansiblePlugin = integrationManager.getExecutionTool("ansible") as AnsiblePlugin | null;

        if (!ansiblePlugin) {
          const errorResponse = {
            error: {
              code: "ANSIBLE_NOT_AVAILABLE",
              message: "Ansible integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        const ansibleService = ansiblePlugin.getAnsibleService();
        const details = await Promise.resolve(ansibleService.getPlaybookDetails(playbookPath));

        if (!details) {
          const errorResponse = {
            error: {
              code: "PLAYBOOK_NOT_FOUND",
              message: `Playbook '${playbookPath}' not found`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Playbook details retrieved", {
          component: "PlaybookBrowserRouter",
          integration: "ansible",
          operation: "getPlaybookDetails",
          metadata: {
            playbookPath,
            parameterCount: details.parameters.length,
            playCount: details.plays.length,
            duration,
          },
        });

        const responseData = { playbook: details };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "ansible");
          expertModeService.addMetadata(debugInfo, "playbookPath", playbookPath);
          expertModeService.addMetadata(debugInfo, "parameterCount", details.parameters.length);
          expertModeService.addInfo(debugInfo, {
            message: `Playbook has ${String(details.parameters.length)} parameters, ${String(details.plays.length)} plays`,
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid playbook path",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
          );
          return;
        }

        logger.error("Error getting playbook details", {
          component: "PlaybookBrowserRouter",
          integration: "ansible",
          operation: "getPlaybookDetails",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to get playbook details",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse,
        );
      }
    }),
  );

  return router;
}
