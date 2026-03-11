import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { ProxmoxIntegration } from "../../integrations/proxmox/ProxmoxIntegration";
import { asyncHandler } from "../asyncHandler";
import { createLogger } from "./utils";

/**
 * Response types for provisioning integrations API
 */
interface CapabilityParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

interface ProvisioningCapability {
  name: string;
  description: string;
  operation: 'create' | 'destroy';
  parameters: CapabilityParameter[];
}

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
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
          capabilities: [
            {
              name: "create_vm",
              description: "Create a new virtual machine",
              operation: "create",
              parameters: [
                { name: "vmid", type: "number", required: true, description: "Unique VM identifier", validation: { min: 100, max: 999999999 } },
                { name: "name", type: "string", required: true, description: "VM name", validation: { max: 50 } },
                { name: "node", type: "string", required: true, description: "Proxmox node name", validation: { max: 20 } },
                { name: "cores", type: "number", required: false, description: "Number of CPU cores", validation: { min: 1, max: 128 } },
                { name: "memory", type: "number", required: false, description: "Memory in MB", validation: { min: 16 } },
                { name: "sockets", type: "number", required: false, description: "Number of CPU sockets", validation: { min: 1, max: 4 } },
                { name: "cpu", type: "string", required: false, description: "CPU type" },
                { name: "scsi0", type: "string", required: false, description: "SCSI disk configuration" },
                { name: "ide2", type: "string", required: false, description: "IDE device configuration" },
                { name: "net0", type: "string", required: false, description: "Network interface configuration" },
                { name: "ostype", type: "string", required: false, description: "Operating system type" },
              ],
            },
            {
              name: "create_lxc",
              description: "Create a new LXC container",
              operation: "create",
              parameters: [
                { name: "vmid", type: "number", required: true, description: "Unique container identifier", validation: { min: 100, max: 999999999 } },
                { name: "hostname", type: "string", required: true, description: "Container hostname", validation: { max: 50 } },
                { name: "node", type: "string", required: true, description: "Proxmox node name", validation: { max: 20 } },
                { name: "ostemplate", type: "string", required: true, description: "OS template name" },
                { name: "cores", type: "number", required: false, description: "Number of CPU cores", validation: { min: 1, max: 128 } },
                { name: "memory", type: "number", required: false, description: "Memory in MB", validation: { min: 16 } },
                { name: "rootfs", type: "string", required: false, description: "Root filesystem configuration" },
                { name: "net0", type: "string", required: false, description: "Network interface configuration" },
                { name: "password", type: "string", required: false, description: "Root password" },
              ],
            },
          ],
        };

        integrations.push(proxmoxIntegration);
      }

      // Future integrations (EC2, Azure, Terraform) would be added here
      // Example:
      // const ec2 = integrationManager.getExecutionTool("ec2");
      // if (ec2) { integrations.push(buildEC2Integration(ec2)); }

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
