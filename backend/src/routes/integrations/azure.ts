import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ZodError } from "zod";
import { asyncHandler } from "../asyncHandler";
import type { AzurePlugin } from "../../integrations/azure/AzurePlugin";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import { AzureAuthenticationError } from "../../integrations/azure/types";
import { LoggerService } from "../../services/LoggerService";
import { sendValidationError, ERROR_CODES } from "../../utils/errorHandling";

const logger = new LoggerService();

/**
 * Zod schema for provisioning request body
 */
const AzureProvisionSchema = z.object({
  resourceGroup: z.string().min(1),
  vmName: z.string().min(1),
  location: z.string().min(1),
  vmSize: z.string().optional().default("Standard_B1s"),
  imageReference: z.object({
    publisher: z.string(),
    offer: z.string(),
    sku: z.string(),
    version: z.string().optional().default("latest"),
  }),
  adminUsername: z.string().min(1),
  adminPassword: z.string().optional(),
  sshPublicKey: z.string().optional(),
  networkInterfaceId: z.string().min(1, "networkInterfaceId is required for VM creation"),
});

/**
 * Zod schema for lifecycle action request body
 */
const AzureLifecycleSchema = z.object({
  vmName: z.string().min(1),
  resourceGroup: z.string().min(1),
  action: z.enum(["start", "stop", "restart", "deallocate"]),
});

/**
 * Zod schema for location query parameter
 */
const LocationQuerySchema = z.object({
  location: z.string().min(1, "Location is required"),
});

/**
 * Zod schema for image query parameters
 */
const ImageQuerySchema = z.object({
  location: z.string().optional(),
  publisher: z.string().optional(),
  offer: z.string().optional(),
  sku: z.string().optional(),
});

/**
 * Create Azure integration API routes
 *
 * Requirements: 3.5, 7.5, 8.4, 8.5, 8.6, 11.4, 12.1–12.6
 */
export function createAzureRouter(
  azurePlugin: AzurePlugin,
  integrationManager?: IntegrationManager,
  options?: { allowDestructiveActions?: boolean },
): Router {
  const router = Router();

  /**
   * GET /api/integrations/azure/inventory
   * List Azure VMs
   */
  router.get(
    "/inventory",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure inventory request", {
        component: "AzureRouter",
        operation: "getInventory",
      });

      try {
        const inventory = await azurePlugin.getInventory();
        res.status(200).json({ inventory });
      } catch (error) {
        if (error instanceof AzureAuthenticationError) {
          logger.warn("Azure authentication failed during inventory", {
            component: "AzureRouter",
            operation: "getInventory",
          });
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure inventory request failed", {
          component: "AzureRouter",
          operation: "getInventory",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve Azure inventory",
          },
        });
      }
    }),
  );

  /**
   * POST /api/integrations/azure/provision
   * Provision a new Azure VM
   */
  router.post(
    "/provision",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure provision request", {
        component: "AzureRouter",
        operation: "provision",
        metadata: { userId: req.user?.userId },
      });

      try {
        const validatedBody = AzureProvisionSchema.parse(req.body);

        const result = await azurePlugin.executeAction({
          type: "task",
          target: "new",
          action: "provision",
          parameters: validatedBody,
        });

        logger.info("Azure provision completed", {
          component: "AzureRouter",
          operation: "provision",
          metadata: { status: result.status },
        });

        // Invalidate inventory cache so the new VM appears immediately
        if (result.status === "success") {
          integrationManager?.clearInventoryCache();
        }

        res.status(result.status === "success" ? 201 : 200).json({ result });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure provision request failed", {
          component: "AzureRouter",
          operation: "provision",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to provision Azure VM",
          },
        });
      }
    }),
  );

  /**
   * POST /api/integrations/azure/lifecycle
   * Execute lifecycle action (start/stop/restart/deallocate)
   */
  router.post(
    "/lifecycle",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure lifecycle request", {
        component: "AzureRouter",
        operation: "lifecycle",
        metadata: { userId: req.user?.userId },
      });

      try {
        const validatedBody = AzureLifecycleSchema.parse(req.body);

        // Guard: reject deallocate if destructive provisioning actions are disabled
        if (validatedBody.action === "deallocate" && options?.allowDestructiveActions === false) {
          res.status(403).json({
            error: {
              code: "DESTRUCTIVE_ACTION_DISABLED",
              message: "Destructive provisioning actions are disabled by configuration (ALLOW_DESTRUCTIVE_PROVISIONING=false)",
            },
          });
          return;
        }

        const target = `azure:${validatedBody.resourceGroup}:${validatedBody.vmName}`;

        const result = await azurePlugin.executeAction({
          type: "command",
          target,
          action: validatedBody.action,
          parameters: {
            resourceGroup: validatedBody.resourceGroup,
            vmName: validatedBody.vmName,
          },
        });

        logger.info("Azure lifecycle action completed", {
          component: "AzureRouter",
          operation: "lifecycle",
          metadata: { action: validatedBody.action, status: result.status },
        });

        // Invalidate inventory cache so state changes appear immediately
        if (result.status === "success") {
          integrationManager?.clearInventoryCache();
        }

        res.status(200).json({ result });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure lifecycle request failed", {
          component: "AzureRouter",
          operation: "lifecycle",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to execute Azure lifecycle action",
          },
        });
      }
    }),
  );

  /**
   * POST /api/integrations/azure/test
   * Test Azure connection
   */
  router.post(
    "/test",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Testing Azure connection", {
        component: "AzureRouter",
        operation: "testConnection",
      });

      try {
        const health = await azurePlugin.healthCheck();
        res.status(200).json({
          success: health.healthy,
          message: health.message ?? (health.healthy ? "Connection successful" : "Connection failed"),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("Azure connection test failed", {
          component: "AzureRouter",
          operation: "testConnection",
        }, error instanceof Error ? error : undefined);
        res.status(200).json({
          success: false,
          message: msg,
        });
      }
    }),
  );

  /**
   * GET /api/integrations/azure/locations
   * List available Azure locations
   */
  router.get(
    "/locations",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure locations request", {
        component: "AzureRouter",
        operation: "getLocations",
      });

      try {
        const locations = await azurePlugin.getLocations();
        res.status(200).json({ locations });
      } catch (error) {
        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure locations request failed", {
          component: "AzureRouter",
          operation: "getLocations",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve Azure locations",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/azure/vm-sizes
   * List VM sizes for a location
   */
  router.get(
    "/vm-sizes",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure VM sizes request", {
        component: "AzureRouter",
        operation: "getVMSizes",
      });

      try {
        const { location } = LocationQuerySchema.parse(req.query);
        const vmSizes = await azurePlugin.getVMSizes(location);
        res.status(200).json({ vmSizes });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure VM sizes request failed", {
          component: "AzureRouter",
          operation: "getVMSizes",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve Azure VM sizes",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/azure/images
   * List marketplace images
   */
  router.get(
    "/images",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure images request", {
        component: "AzureRouter",
        operation: "getImages",
      });

      try {
        const { location, publisher, offer, sku } = ImageQuerySchema.parse(req.query);
        const images = await azurePlugin.getImages(location, publisher, offer, sku);
        res.status(200).json({ images });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure images request failed", {
          component: "AzureRouter",
          operation: "getImages",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve Azure images",
          },
        });
      }
    }),
  );

  /**
   * GET /api/integrations/azure/resource-groups
   * List resource groups
   */
  router.get(
    "/resource-groups",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Processing Azure resource groups request", {
        component: "AzureRouter",
        operation: "getResourceGroups",
      });

      try {
        const resourceGroups = await azurePlugin.getResourceGroups();
        res.status(200).json({ resourceGroups });
      } catch (error) {
        if (error instanceof AzureAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "Azure authentication failed",
            },
          });
          return;
        }

        logger.error("Azure resource groups request failed", {
          component: "AzureRouter",
          operation: "getResourceGroups",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve Azure resource groups",
          },
        });
      }
    }),
  );

  return router;
}
