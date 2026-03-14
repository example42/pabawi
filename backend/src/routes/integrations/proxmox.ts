import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { ProxmoxIntegration } from "../../integrations/proxmox/ProxmoxIntegration";
import type { VMCreateParams, LXCCreateParams } from "../../integrations/proxmox/types";
import { asyncHandler } from "../asyncHandler";
import { ExpertModeService } from "../../services/ExpertModeService";
import { createLogger } from "./utils";

/**
 * Validation schemas for Proxmox API routes
 */

// VM creation parameters schema
const VMCreateParamsSchema = z.object({
  vmid: z.number().int().min(100).max(999999999),
  name: z.string().min(1).max(50),
  node: z.string().min(1).max(20),
  cores: z.number().int().min(1).max(128).optional(),
  memory: z.number().int().min(16).optional(),
  sockets: z.number().int().min(1).max(4).optional(),
  cpu: z.string().optional(),
  scsi0: z.string().optional(),
  ide2: z.string().optional(),
  net0: z.string().optional(),
  ostype: z.string().optional(),
});

// LXC creation parameters schema
const LXCCreateParamsSchema = z.object({
  vmid: z.number().int().min(100).max(999999999),
  hostname: z.string().min(1).max(50),
  node: z.string().min(1).max(20),
  ostemplate: z.string().min(1),
  cores: z.number().int().min(1).max(128).optional(),
  memory: z.number().int().min(16).optional(),
  rootfs: z.string().optional(),
  net0: z.string().optional(),
  password: z.string().optional(),
});

// Action parameters schema
const ActionParamsSchema = z.object({
  nodeId: z.string().regex(/^proxmox:[^:]+:\d+$/),
  action: z.enum(["start", "stop", "shutdown", "reboot", "suspend", "resume"]),
});

// Destroy parameters schema
const DestroyParamsSchema = z.object({
  vmid: z.string().regex(/^\d+$/),
});

/**
 * Create Proxmox router for all Proxmox-related routes
 */
export function createProxmoxRouter(
  integrationManager: IntegrationManager
): Router {
  const router = Router();
  const logger = createLogger();

  /**
   * Helper function to get Proxmox integration
   */
  const getProxmoxIntegration = (): ProxmoxIntegration | null => {
    const plugin = integrationManager.getExecutionTool("proxmox");
    return plugin as ProxmoxIntegration | null;
  };

  /**
   * GET /api/integrations/proxmox/nodes
   * Get list of PVE nodes in the cluster
   */
  router.get(
    "/nodes",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        res.status(503).json({ error: { code: "PROXMOX_NOT_CONFIGURED", message: "Proxmox integration is not configured" } });
        return;
      }
      try {
        const nodes = await proxmox.getNodes();
        res.json({ nodes });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch PVE nodes", { component: "ProxmoxRouter", operation: "getNodes", metadata: { error: msg } }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: { code: "FETCH_NODES_FAILED", message: msg } });
      }
    })
  );

  /**
   * GET /api/integrations/proxmox/nextid
   * Get the next available VMID
   */
  router.get(
    "/nextid",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        res.status(503).json({ error: { code: "PROXMOX_NOT_CONFIGURED", message: "Proxmox integration is not configured" } });
        return;
      }
      try {
        const vmid = await proxmox.getNextVMID();
        res.json({ vmid });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch next VMID", { component: "ProxmoxRouter", operation: "getNextVMID", metadata: { error: msg } }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: { code: "FETCH_NEXTID_FAILED", message: msg } });
      }
    })
  );

  /**
   * GET /api/integrations/proxmox/nodes/:node/isos
   * Get ISO images available on a node
   * Query params: storage (optional, defaults to 'local')
   */
  router.get(
    "/nodes/:node/isos",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        res.status(503).json({ error: { code: "PROXMOX_NOT_CONFIGURED", message: "Proxmox integration is not configured" } });
        return;
      }
      const { node } = req.params;
      const storage = (req.query.storage as string) || undefined;
      try {
        const isos = await proxmox.getISOImages(node, storage);
        res.json({ isos });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch ISOs", { component: "ProxmoxRouter", operation: "getISOImages", metadata: { node, error: msg } }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: { code: "FETCH_ISOS_FAILED", message: msg } });
      }
    })
  );

  /**
   * GET /api/integrations/proxmox/nodes/:node/templates
   * Get OS templates available on a node
   * Query params: storage (optional, defaults to 'local')
   */
  router.get(
    "/nodes/:node/templates",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        res.status(503).json({ error: { code: "PROXMOX_NOT_CONFIGURED", message: "Proxmox integration is not configured" } });
        return;
      }
      const { node } = req.params;
      const storage = (req.query.storage as string) || undefined;
      try {
        const templates = await proxmox.getTemplates(node, storage);
        res.json({ templates });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to fetch templates", { component: "ProxmoxRouter", operation: "getTemplates", metadata: { node, error: msg } }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: { code: "FETCH_TEMPLATES_FAILED", message: msg } });
      }
    })
  );

  /**
   * POST /api/integrations/proxmox/provision/vm
   * Create a new virtual machine
   */
  router.post(
    "/provision/vm",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "POST /api/integrations/proxmox/provision/vm",
            requestId,
            0
          )
        : null;

      logger.info("Creating Proxmox VM", {
        component: "ProxmoxRouter",
        integration: "proxmox",
        operation: "createVM",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Creating Proxmox VM",
          level: "info",
        });
      }

      // Get Proxmox integration
      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        logger.warn("Proxmox integration is not configured", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createVM",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Proxmox integration is not configured",
            context: "Proxmox integration is not available",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PROXMOX_NOT_CONFIGURED",
            message: "Proxmox integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      // Validate request body
      const validation = VMCreateParamsSchema.safeParse(req.body);
      if (!validation.success) {
        logger.warn("Invalid VM creation parameters", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createVM",
          metadata: { errors: validation.error.errors },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Invalid VM creation parameters",
            context: JSON.stringify(validation.error.errors),
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_PARAMETERS",
            message: "Invalid VM creation parameters",
            details: validation.error.errors,
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      const params = validation.data as VMCreateParams;

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: "VM creation parameters validated",
          context: JSON.stringify({ vmid: params.vmid, node: params.node }),
          level: "debug",
        });
      }

      try {
        // Execute VM creation through integration
        const result = await proxmox.executeAction({
          type: "task",
          target: `proxmox:${params.node}:${params.vmid}`,
          action: "create_vm",
          parameters: params,
        });

        logger.info("VM creation completed", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createVM",
          metadata: { vmid: params.vmid, status: result.status },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addInfo(debugInfo, {
            message: "VM creation completed",
            context: JSON.stringify({ status: result.status }),
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const responseData = { result };

        res
          .status(result.status === "success" ? 201 : 500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(responseData, debugInfo)
              : responseData
          );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error(
          "Failed to create VM",
          {
            component: "ProxmoxRouter",
            integration: "proxmox",
            operation: "createVM",
            metadata: { vmid: params.vmid, error: errorMessage },
          },
          error instanceof Error ? error : undefined
        );

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addError(debugInfo, {
            message: "Failed to create VM",
            context: errorMessage,
            level: "error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "VM_CREATION_FAILED",
            message: errorMessage,
          },
        };

        res
          .status(500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
      }
    })
  );

  /**
   * POST /api/integrations/proxmox/provision/lxc
   * Create a new LXC container
   */
  router.post(
    "/provision/lxc",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "POST /api/integrations/proxmox/provision/lxc",
            requestId,
            0
          )
        : null;

      logger.info("Creating Proxmox LXC container", {
        component: "ProxmoxRouter",
        integration: "proxmox",
        operation: "createLXC",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Creating Proxmox LXC container",
          level: "info",
        });
      }

      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        logger.warn("Proxmox integration is not configured", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createLXC",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Proxmox integration is not configured",
            context: "Proxmox integration is not available",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PROXMOX_NOT_CONFIGURED",
            message: "Proxmox integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      const validation = LXCCreateParamsSchema.safeParse(req.body);
      if (!validation.success) {
        logger.warn("Invalid LXC creation parameters", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createLXC",
          metadata: { errors: validation.error.errors },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Invalid LXC creation parameters",
            context: JSON.stringify(validation.error.errors),
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_PARAMETERS",
            message: "Invalid LXC creation parameters",
            details: validation.error.errors,
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      const params = validation.data as LXCCreateParams;

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: "LXC creation parameters validated",
          context: JSON.stringify({ vmid: params.vmid, node: params.node }),
          level: "debug",
        });
      }

      try {
        const result = await proxmox.executeAction({
          type: "task",
          target: `proxmox:${params.node}:${params.vmid}`,
          action: "create_lxc",
          parameters: params,
        });

        logger.info("LXC creation completed", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "createLXC",
          metadata: { vmid: params.vmid, status: result.status },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addInfo(debugInfo, {
            message: "LXC creation completed",
            context: JSON.stringify({ status: result.status }),
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const responseData = { result };

        res
          .status(result.status === "success" ? 201 : 500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(responseData, debugInfo)
              : responseData
          );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error(
          "Failed to create LXC container",
          {
            component: "ProxmoxRouter",
            integration: "proxmox",
            operation: "createLXC",
            metadata: { vmid: params.vmid, error: errorMessage },
          },
          error instanceof Error ? error : undefined
        );

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addError(debugInfo, {
            message: "Failed to create LXC container",
            context: errorMessage,
            level: "error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "LXC_CREATION_FAILED",
            message: errorMessage,
          },
        };

        res
          .status(500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
      }
    })
  );

  /**
   * DELETE /api/integrations/proxmox/provision/:vmid
   * Destroy a VM or LXC container
   */
  router.delete(
    "/provision/:vmid",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "DELETE /api/integrations/proxmox/provision/:vmid",
            requestId,
            0
          )
        : null;

      logger.info("Destroying Proxmox guest", {
        component: "ProxmoxRouter",
        integration: "proxmox",
        operation: "destroyGuest",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Destroying Proxmox guest",
          level: "info",
        });
      }

      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        logger.warn("Proxmox integration is not configured", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "destroyGuest",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Proxmox integration is not configured",
            context: "Proxmox integration is not available",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PROXMOX_NOT_CONFIGURED",
            message: "Proxmox integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      // Validate vmid parameter
      const validation = DestroyParamsSchema.safeParse(req.params);
      if (!validation.success) {
        logger.warn("Invalid VMID parameter", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "destroyGuest",
          metadata: { errors: validation.error.errors },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Invalid VMID parameter",
            context: JSON.stringify(validation.error.errors),
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_PARAMETERS",
            message: "Invalid VMID parameter",
            details: validation.error.errors,
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      // Get node from query parameter (required)
      const node = req.query.node as string;
      if (!node) {
        logger.warn("Missing node parameter", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "destroyGuest",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Missing node parameter",
            context: "Node parameter is required",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_PARAMETERS",
            message: "Node parameter is required",
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      const vmid = parseInt(validation.data.vmid, 10);

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: "Destroy parameters validated",
          context: JSON.stringify({ vmid, node }),
          level: "debug",
        });
      }

      try {
        const result = await proxmox.executeAction({
          type: "task",
          target: `proxmox:${node}:${vmid}`,
          action: "destroy_vm",
          parameters: { vmid, node },
        });

        logger.info("Guest destruction completed", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "destroyGuest",
          metadata: { vmid, node, status: result.status },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addInfo(debugInfo, {
            message: "Guest destruction completed",
            context: JSON.stringify({ status: result.status }),
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const responseData = { result };

        res
          .status(result.status === "success" ? 200 : 500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(responseData, debugInfo)
              : responseData
          );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error(
          "Failed to destroy guest",
          {
            component: "ProxmoxRouter",
            integration: "proxmox",
            operation: "destroyGuest",
            metadata: { vmid, node, error: errorMessage },
          },
          error instanceof Error ? error : undefined
        );

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addError(debugInfo, {
            message: "Failed to destroy guest",
            context: errorMessage,
            level: "error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "GUEST_DESTRUCTION_FAILED",
            message: errorMessage,
          },
        };

        res
          .status(500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
      }
    })
  );

  /**
   * POST /api/integrations/proxmox/action
   * Execute a lifecycle action on a VM or container
   */
  router.post(
    "/action",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "POST /api/integrations/proxmox/action",
            requestId,
            0
          )
        : null;

      logger.info("Executing Proxmox action", {
        component: "ProxmoxRouter",
        integration: "proxmox",
        operation: "executeAction",
      });

      if (debugInfo) {
        expertModeService.addInfo(debugInfo, {
          message: "Executing Proxmox action",
          level: "info",
        });
      }

      const proxmox = getProxmoxIntegration();
      if (!proxmox) {
        logger.warn("Proxmox integration is not configured", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "executeAction",
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Proxmox integration is not configured",
            context: "Proxmox integration is not available",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "PROXMOX_NOT_CONFIGURED",
            message: "Proxmox integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      // Validate request body
      const validation = ActionParamsSchema.safeParse(req.body);
      if (!validation.success) {
        logger.warn("Invalid action parameters", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "executeAction",
          metadata: { errors: validation.error.errors },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Invalid action parameters",
            context: JSON.stringify(validation.error.errors),
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_PARAMETERS",
            message: "Invalid action parameters",
            details: validation.error.errors,
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
        return;
      }

      const { nodeId, action } = validation.data;

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: "Action parameters validated",
          context: JSON.stringify({ nodeId, action }),
          level: "debug",
        });
      }

      try {
        const result = await proxmox.executeAction({
          type: "task",
          target: nodeId,
          action,
        });

        logger.info("Action execution completed", {
          component: "ProxmoxRouter",
          integration: "proxmox",
          operation: "executeAction",
          metadata: { nodeId, action, status: result.status },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addInfo(debugInfo, {
            message: "Action execution completed",
            context: JSON.stringify({ status: result.status }),
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const responseData = { result };

        res
          .status(result.status === "success" ? 200 : 500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(responseData, debugInfo)
              : responseData
          );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        logger.error(
          "Failed to execute action",
          {
            component: "ProxmoxRouter",
            integration: "proxmox",
            operation: "executeAction",
            metadata: { nodeId, action, error: errorMessage },
          },
          error instanceof Error ? error : undefined
        );

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addError(debugInfo, {
            message: "Failed to execute action",
            context: errorMessage,
            level: "error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "ACTION_EXECUTION_FAILED",
            message: errorMessage,
          },
        };

        res
          .status(500)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse
          );
      }
    })
  );

  return router;
}
