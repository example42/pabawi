import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ZodError } from "zod";
import { asyncHandler } from "../asyncHandler";
import type { AWSPlugin } from "../../integrations/aws/AWSPlugin";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import { AWSAuthenticationError } from "../../integrations/aws/types";
import { LoggerService } from "../../services/LoggerService";
import { sendValidationError, ERROR_CODES } from "../../utils/errorHandling";


const logger = new LoggerService();

/**
 * Zod schema for region query parameter
 */
const RegionQuerySchema = z.object({
  region: z.string().min(1, "Region is required"),
});

/**
 * Zod schema for optional region query parameter
 */
const OptionalRegionQuerySchema = z.object({
  region: z.string().min(1).optional(),
});

/**
 * Zod schema for subnets/security-groups query (region required, vpcId optional)
 */
const RegionVpcQuerySchema = z.object({
  region: z.string().min(1, "Region is required"),
  vpcId: z.string().min(1).optional(),
});

/**
 * Zod schema for provisioning request body
 */
const ProvisionSchema = z.object({
  imageId: z.string().min(1, "AMI image ID is required"),
  instanceType: z.string().optional(),
  keyName: z.string().optional(),
  securityGroupIds: z.array(z.string()).optional(),
  subnetId: z.string().optional(),
  region: z.string().optional(),
  name: z.string().optional(),
});

/**
 * Zod schema for lifecycle action request body
 */
const LifecycleSchema = z.object({
  instanceId: z.string().min(1, "Instance ID is required"),
  action: z.enum(["start", "stop", "reboot", "terminate"]),
  region: z.string().optional(),
});

/**
 * Create AWS integration API routes
 *
 * Requirements: 8.1, 9.1, 10.1, 11.1, 13.1-13.7, 27.2
 */
export function createAWSRouter(awsPlugin: AWSPlugin, integrationManager?: IntegrationManager): Router {
  const router = Router();

  /**
   * GET /api/integrations/aws/inventory
   * List EC2 instances
   *
   * Permission: aws:read
   */
  router.get(
    "/inventory",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS inventory request", {
        component: "AWSRouter",
        operation: "getInventory",
      });

      try {
        const inventory = await awsPlugin.getInventory();
        res.status(200).json({ inventory });
      } catch (error) {
        if (error instanceof AWSAuthenticationError) {
          logger.warn("AWS authentication failed during inventory", {
            component: "AWSRouter",
            operation: "getInventory",
          });
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "AWS authentication failed",
            },
          });
          return;
        }

        logger.error("AWS inventory request failed", {
          component: "AWSRouter",
          operation: "getInventory",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS inventory",
          },
        });
      }
    })
  );

  /**
   * POST /api/integrations/aws/provision
   * Provision a new EC2 instance
   *
   * Permission: aws:provision
   */
  router.post(
    "/provision",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS provision request", {
        component: "AWSRouter",
        operation: "provision",
        metadata: { userId: req.user?.userId },
      });

      try {
        const validatedBody = ProvisionSchema.parse(req.body);

        const result = await awsPlugin.executeAction({
          type: "task",
          target: "new",
          action: "provision",
          parameters: validatedBody,
        });

        logger.info("AWS provision completed", {
          component: "AWSRouter",
          operation: "provision",
          metadata: { status: result.status },
        });

        // Invalidate inventory cache so the new instance appears immediately
        if (result.status === "success") {
          integrationManager?.clearInventoryCache();
        }

        res.status(result.status === "success" ? 201 : 200).json({ result });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        if (error instanceof AWSAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "AWS authentication failed",
            },
          });
          return;
        }

        logger.error("AWS provision request failed", {
          component: "AWSRouter",
          operation: "provision",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to provision AWS instance",
          },
        });
      }
    })
  );

  /**
   * POST /api/integrations/aws/lifecycle
   * Execute lifecycle action (start/stop/reboot/terminate)
   *
   * Permission: aws:lifecycle
   */
  router.post(
    "/lifecycle",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS lifecycle request", {
        component: "AWSRouter",
        operation: "lifecycle",
        metadata: { userId: req.user?.userId },
      });

      try {
        const validatedBody = LifecycleSchema.parse(req.body);

        const target = validatedBody.region
          ? `aws:${validatedBody.region}:${validatedBody.instanceId}`
          : validatedBody.instanceId;

        const result = await awsPlugin.executeAction({
          type: "command",
          target,
          action: validatedBody.action,
          metadata: validatedBody.region ? { region: validatedBody.region } : undefined,
        });

        logger.info("AWS lifecycle action completed", {
          component: "AWSRouter",
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

        if (error instanceof AWSAuthenticationError) {
          res.status(401).json({
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: "AWS authentication failed",
            },
          });
          return;
        }

        logger.error("AWS lifecycle request failed", {
          component: "AWSRouter",
          operation: "lifecycle",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to execute AWS lifecycle action",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/regions
   * List available AWS regions
   *
   * Permission: aws:read
   */
  router.get(
    "/regions",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS regions request", {
        component: "AWSRouter",
        operation: "getRegions",
      });

      try {
        const regions = await awsPlugin.getRegions();
        res.status(200).json({ regions });
      } catch (error) {
        logger.error("AWS regions request failed", {
          component: "AWSRouter",
          operation: "getRegions",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS regions",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/instance-types
   * List available EC2 instance types
   *
   * Permission: aws:read
   */
  router.get(
    "/instance-types",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS instance types request", {
        component: "AWSRouter",
        operation: "getInstanceTypes",
      });

      try {
        const { region } = OptionalRegionQuerySchema.parse(req.query);
        const instanceTypes = await awsPlugin.getInstanceTypes(region);
        res.status(200).json({ instanceTypes });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS instance types request failed", {
          component: "AWSRouter",
          operation: "getInstanceTypes",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS instance types",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/amis
   * List available AMIs by region, with optional name search
   *
   * Permission: aws:read
   */
  router.get(
    "/amis",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS AMIs request", {
        component: "AWSRouter",
        operation: "getAMIs",
      });

      try {
        const { region } = RegionQuerySchema.parse(req.query);
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

        // Build filters: if search is provided, filter by name wildcard
        const filters = search
          ? [{ name: "name", values: [`*${search}*`] }]
          : undefined;

        const amis = await awsPlugin.getAMIs(region, filters);
        res.status(200).json({ amis });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS AMIs request failed", {
          component: "AWSRouter",
          operation: "getAMIs",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS AMIs",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/vpcs
   * List VPCs by region
   *
   * Permission: aws:read
   */
  router.get(
    "/vpcs",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS VPCs request", {
        component: "AWSRouter",
        operation: "getVPCs",
      });

      try {
        const { region } = RegionQuerySchema.parse(req.query);
        const vpcs = await awsPlugin.getVPCs(region);
        res.status(200).json({ vpcs });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS VPCs request failed", {
          component: "AWSRouter",
          operation: "getVPCs",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS VPCs",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/subnets
   * List subnets by region (optional vpcId filter)
   *
   * Permission: aws:read
   */
  router.get(
    "/subnets",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS subnets request", {
        component: "AWSRouter",
        operation: "getSubnets",
      });

      try {
        const { region, vpcId } = RegionVpcQuerySchema.parse(req.query);
        const subnets = await awsPlugin.getSubnets(region, vpcId);
        res.status(200).json({ subnets });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS subnets request failed", {
          component: "AWSRouter",
          operation: "getSubnets",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS subnets",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/security-groups
   * List security groups by region (optional vpcId filter)
   *
   * Permission: aws:read
   */
  router.get(
    "/security-groups",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS security groups request", {
        component: "AWSRouter",
        operation: "getSecurityGroups",
      });

      try {
        const { region, vpcId } = RegionVpcQuerySchema.parse(req.query);
        const securityGroups = await awsPlugin.getSecurityGroups(region, vpcId);
        res.status(200).json({ securityGroups });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS security groups request failed", {
          component: "AWSRouter",
          operation: "getSecurityGroups",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS security groups",
          },
        });
      }
    })
  );

  /**
   * GET /api/integrations/aws/key-pairs
   * List key pairs by region
   *
   * Permission: aws:read
   */
  router.get(
    "/key-pairs",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing AWS key pairs request", {
        component: "AWSRouter",
        operation: "getKeyPairs",
      });

      try {
        const { region } = RegionQuerySchema.parse(req.query);
        const keyPairs = await awsPlugin.getKeyPairs(region);
        res.status(200).json({ keyPairs });
      } catch (error) {
        if (error instanceof ZodError) {
          sendValidationError(res, error);
          return;
        }

        logger.error("AWS key pairs request failed", {
          component: "AWSRouter",
          operation: "getKeyPairs",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve AWS key pairs",
          },
        });
      }
    })
  );

  return router;
}
