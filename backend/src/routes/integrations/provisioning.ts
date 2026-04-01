import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { ProxmoxIntegration } from "../../integrations/proxmox/ProxmoxIntegration";
import type { AWSPlugin } from "../../integrations/aws/AWSPlugin";
import type { ProvisioningCapability } from "../../integrations/types";
import { asyncHandler } from "../asyncHandler";
import { createLogger } from "./utils";

interface ProvisioningIntegration {
  name: string;
  displayName: string;
  type: 'virtualization' | 'cloud' | 'container';
  status: 'connected' | 'degraded' | 'not_configured';
  capabilities: ProvisioningCapability[];
}

interface ListIntegrationsResponse {
  integrations: ProvisioningIntegration[];
}

/**
 * Create provisioning router for integration discovery
 * Validates Requirements: 2.1, 2.2, 13.1, 13.3
 */
export function createProvisioningRouter(
  integrationManager: IntegrationManager
): Router {
  const router = Router();
  const logger = createLogger();

  /**
   * GET /api/integrations/provisioning
   * List all available provisioning integrations with their capabilities
   * Validates Requirements: 2.1, 2.2
   */
  router.get(
    "/",
    // eslint-disable-next-line @typescript-eslint/require-await
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Fetching provisioning integrations", {
        component: "ProvisioningRouter",
        operation: "listIntegrations",
      });

      const integrations: ProvisioningIntegration[] = [];

      // Check Proxmox integration
      const proxmox = integrationManager.getExecutionTool("proxmox") as ProxmoxIntegration | null;

      if (proxmox) {
        // Determine integration status based on health check
        let status: 'connected' | 'degraded' | 'not_configured' = 'not_configured';
        const healthCheck = proxmox.getLastHealthCheck();

        if (healthCheck) {
          if (healthCheck.healthy) {
            status = 'connected';
          } else if (healthCheck.message?.includes('not initialized') || healthCheck.message?.includes('disabled')) {
            status = 'not_configured';
          } else {
            status = 'degraded';
          }
        }

        const proxmoxIntegration: ProvisioningIntegration = {
          name: "proxmox",
          displayName: "Proxmox VE",
          type: "virtualization",
          status,
          capabilities: proxmox.listProvisioningCapabilities(),
        };

        integrations.push(proxmoxIntegration);
      }

      // Check AWS integration
      const aws = integrationManager.getExecutionTool("aws") as AWSPlugin | null;

      if (aws) {
        let awsStatus: 'connected' | 'degraded' | 'not_configured' = 'not_configured';
        const awsHealthCheck = aws.getLastHealthCheck();

        if (awsHealthCheck) {
          if (awsHealthCheck.healthy) {
            awsStatus = 'connected';
          } else if (awsHealthCheck.message?.includes('not initialized') || awsHealthCheck.message?.includes('disabled')) {
            awsStatus = 'not_configured';
          } else {
            awsStatus = 'degraded';
          }
        }

        const awsIntegration: ProvisioningIntegration = {
          name: "aws",
          displayName: "Amazon Web Services",
          type: "cloud",
          status: awsStatus,
          capabilities: aws.listProvisioningCapabilities(),
        };

        integrations.push(awsIntegration);
      }

      const response: ListIntegrationsResponse = {
        integrations,
      };

      logger.info("Provisioning integrations fetched", {
        component: "ProvisioningRouter",
        operation: "listIntegrations",
        metadata: { count: integrations.length },
      });

      res.status(200).json(response);
    })
  );

  return router;
}
